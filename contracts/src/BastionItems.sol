// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title BastionItems
/// @notice Cartas y armaduras de Bastión como tokens ERC-1155: son del jugador,
///         se pueden vender o regalar en cualquier mercado compatible y cada
///         reventa paga una regalía (ERC-2981) al tesoro del juego.
///         Garantías para el coleccionista:
///         - El suministro máximo de cada objeto se fija al definirlo y NO se puede
///           ampliar después. Las legendarias siempre tienen límite.
///         - La regalía tiene un tope del 10% escrito en el código.
///         - Los objetos se acuñan como recompensa por jugar (MINTER_ROLE lo usa el
///           servidor del juego). Este contrato no vende sobres aleatorios.
/// @dev SIN AUDITAR. No desplegar en mainnet sin una auditoría externa.
contract BastionItems is ERC1155, ERC2981, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint96 public constant MAX_ROYALTY_BPS = 1000; // 10%

    enum Kind { None, Card, Armor }
    enum Rarity { Common, Uncommon, Rare, Epic, Legendary }

    struct Item {
        Kind kind;
        Rarity rarity;
        /// @dev 0 = sin límite (solo permitido por debajo de legendaria).
        uint64 maxSupply;
        uint64 minted;
    }

    mapping(uint256 => Item) public items;

    event ItemDefined(uint256 indexed id, Kind kind, Rarity rarity, uint64 maxSupply);

    error ItemExists(uint256 id);
    error UnknownItem(uint256 id);
    error SupplyExceeded(uint256 id, uint256 remaining);
    error InvalidParams();

    constructor(string memory uri_, address admin, address royaltyReceiver, uint96 royaltyBps) ERC1155(uri_) {
        if (admin == address(0) || royaltyBps > MAX_ROYALTY_BPS) revert InvalidParams();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
    }

    /// @notice Registra un objeto nuevo. Sus datos no se pueden modificar después.
    function defineItem(uint256 id, Kind kind, Rarity rarity, uint64 maxSupply) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (items[id].kind != Kind.None) revert ItemExists(id);
        if (kind == Kind.None || (rarity == Rarity.Legendary && maxSupply == 0)) revert InvalidParams();
        items[id] = Item({kind: kind, rarity: rarity, maxSupply: maxSupply, minted: 0});
        emit ItemDefined(id, kind, rarity, maxSupply);
    }

    /// @notice Entrega una recompensa ganada en el juego.
    function mint(address to, uint256 id, uint256 amount) external onlyRole(MINTER_ROLE) {
        Item storage item = items[id];
        if (item.kind == Kind.None) revert UnknownItem(id);
        if (item.maxSupply != 0 && item.minted + amount > item.maxSupply) {
            revert SupplyExceeded(id, item.maxSupply - item.minted);
        }
        item.minted += uint64(amount);
        _mint(to, id, amount, "");
    }

    function setRoyalty(address receiver, uint96 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_ROYALTY_BPS) revert InvalidParams();
        _setDefaultRoyalty(receiver, bps);
    }

    function setURI(string calldata uri_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(uri_);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
