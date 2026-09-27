// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {GentiumItems} from "../src/GentiumItems.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {vm} from "./utils/Vm.sol";

contract GentiumItemsTest {
    address constant ADMIN = address(0xA11CE);
    address constant GAME = address(0x6A3E);
    address constant TREASURY = address(0x7EA5);
    address constant ANA = address(0xA0A);
    address constant BETO = address(0xBE70);

    uint256 constant FIRE_ARROW = 1;
    uint256 constant ANCESTRAL_GOLEM = 15;
    uint256 constant ECLIPSE_ARMOR = 1005;

    GentiumItems items;

    function setUp() public {
        items = new GentiumItems("https://gentium.example/items/{id}.json", ADMIN, TREASURY, 500);
        bytes32 minter = items.MINTER_ROLE();
        vm.prank(ADMIN);
        items.grantRole(minter, GAME);
        vm.prank(ADMIN);
        items.defineItem(FIRE_ARROW, GentiumItems.Kind.Card, GentiumItems.Rarity.Common, 0);
        vm.prank(ADMIN);
        items.defineItem(ANCESTRAL_GOLEM, GentiumItems.Kind.Card, GentiumItems.Rarity.Legendary, 2);
        vm.prank(ADMIN);
        items.defineItem(ECLIPSE_ARMOR, GentiumItems.Kind.Armor, GentiumItems.Rarity.Legendary, 100);
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
        vm.expectRevert(abi.encodeWithSelector(GentiumItems.SupplyExceeded.selector, ANCESTRAL_GOLEM, 0));
        items.mint(BETO, ANCESTRAL_GOLEM, 1);
    }

    function test_comunesSinLimite() public {
        vm.prank(GAME);
        items.mint(ANA, FIRE_ARROW, 1_000_000);
        _eq(items.balanceOf(ANA, FIRE_ARROW), 1_000_000);
    }

    function test_legendariaExigeLimite() public {
        vm.prank(ADMIN);
        vm.expectRevert(GentiumItems.InvalidParams.selector);
        items.defineItem(99, GentiumItems.Kind.Card, GentiumItems.Rarity.Legendary, 0);
    }

    function test_objetoInmutableUnaVezDefinido() public {
        vm.prank(ADMIN);
        vm.expectRevert(abi.encodeWithSelector(GentiumItems.ItemExists.selector, ANCESTRAL_GOLEM));
        items.defineItem(ANCESTRAL_GOLEM, GentiumItems.Kind.Card, GentiumItems.Rarity.Legendary, 1_000_000);
    }

    function test_soloElJuegoAcuna() public {
        bytes32 role = items.MINTER_ROLE();
        vm.prank(ANA);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, ANA, role));
        items.mint(ANA, ANCESTRAL_GOLEM, 1);
    }

    function test_noAcunaObjetosInexistentes() public {
        vm.prank(GAME);
        vm.expectRevert(abi.encodeWithSelector(GentiumItems.UnknownItem.selector, 404));
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
        vm.expectRevert(GentiumItems.InvalidParams.selector);
        items.setRoyalty(TREASURY, 1001);
    }
}
