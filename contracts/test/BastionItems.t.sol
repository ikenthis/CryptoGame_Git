// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BastionItems} from "../src/BastionItems.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {vm} from "./utils/Vm.sol";

contract BastionItemsTest {
    address constant ADMIN = address(0xA11CE);
    address constant GAME = address(0x6A3E);
    address constant TREASURY = address(0x7EA5);
    address constant ANA = address(0xA0A);
    address constant BETO = address(0xBE70);

    uint256 constant FIRE_ARROW = 1;
    uint256 constant ANCESTRAL_GOLEM = 15;
    uint256 constant ECLIPSE_ARMOR = 1005;

    BastionItems items;

    function setUp() public {
        items = new BastionItems("https://bastion.example/items/{id}.json", ADMIN, TREASURY, 500);
        bytes32 minter = items.MINTER_ROLE();
        vm.prank(ADMIN);
        items.grantRole(minter, GAME);
        vm.prank(ADMIN);
        items.defineItem(FIRE_ARROW, BastionItems.Kind.Card, BastionItems.Rarity.Common, 0);
        vm.prank(ADMIN);
        items.defineItem(ANCESTRAL_GOLEM, BastionItems.Kind.Card, BastionItems.Rarity.Legendary, 2);
        vm.prank(ADMIN);
        items.defineItem(ECLIPSE_ARMOR, BastionItems.Kind.Armor, BastionItems.Rarity.Legendary, 100);
    }

    function _eq(uint256 a, uint256 b) internal pure {
        require(a == b, "valores distintos");
    }

    function test_recompensaYVentaEntreJugadores() public {
        vm.prank(GAME);
        items.mint(ANA, ANCESTRAL_GOLEM, 1);
        vm.prank(ANA);
        items.safeTransferFrom(ANA, BETO, ANCESTRAL_GOLEM, 1, "");
        _eq(items.balanceOf(ANA, ANCESTRAL_GOLEM), 0);
        _eq(items.balanceOf(BETO, ANCESTRAL_GOLEM), 1);
    }

    function test_suministroLegendarioLimitado() public {
        vm.prank(GAME);
        items.mint(ANA, ANCESTRAL_GOLEM, 2);
        vm.prank(GAME);
        vm.expectRevert(abi.encodeWithSelector(BastionItems.SupplyExceeded.selector, ANCESTRAL_GOLEM, 0));
        items.mint(BETO, ANCESTRAL_GOLEM, 1);
    }

    function test_comunesSinLimite() public {
        vm.prank(GAME);
        items.mint(ANA, FIRE_ARROW, 1_000_000);
        _eq(items.balanceOf(ANA, FIRE_ARROW), 1_000_000);
    }

    function test_legendariaExigeLimite() public {
        vm.prank(ADMIN);
        vm.expectRevert(BastionItems.InvalidParams.selector);
        items.defineItem(99, BastionItems.Kind.Card, BastionItems.Rarity.Legendary, 0);
    }

    function test_objetoInmutableUnaVezDefinido() public {
        vm.prank(ADMIN);
        vm.expectRevert(abi.encodeWithSelector(BastionItems.ItemExists.selector, ANCESTRAL_GOLEM));
        items.defineItem(ANCESTRAL_GOLEM, BastionItems.Kind.Card, BastionItems.Rarity.Legendary, 1_000_000);
    }

    function test_soloElJuegoAcuna() public {
        bytes32 role = items.MINTER_ROLE();
        vm.prank(ANA);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, ANA, role));
        items.mint(ANA, ANCESTRAL_GOLEM, 1);
    }

    function test_noAcunaObjetosInexistentes() public {
        vm.prank(GAME);
        vm.expectRevert(abi.encodeWithSelector(BastionItems.UnknownItem.selector, 404));
        items.mint(ANA, 404, 1);
    }

    function test_regaliaEnReventas() public view {
        (address receiver, uint256 amount) = items.royaltyInfo(ECLIPSE_ARMOR, 100_000_000);
        require(receiver == TREASURY, "receptor");
        _eq(amount, 5_000_000);
        require(items.supportsInterface(0x2a55205a), "ERC-2981");
        require(items.supportsInterface(0xd9b67a26), "ERC-1155");
    }

    function test_regaliaConTope() public {
        vm.prank(ADMIN);
        vm.expectRevert(BastionItems.InvalidParams.selector);
        items.setRoyalty(TREASURY, 1001);
    }
}
