// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TournamentEscrow, IERC20} from "../src/TournamentEscrow.sol";
import {vm} from "./utils/Vm.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract TournamentEscrowTest {
    uint128 constant FEE = 1_000_000; // 1 USDC
    address constant ORGANIZER = address(0xA11CE);
    address constant TREASURY = address(0x7EA5);
    address constant ANA = address(0xA0A);
    address constant BETO = address(0xBE70);
    address constant CRIS = address(0xC415);

    MockUSDC usdc;
    TournamentEscrow escrow;
    uint256 id;

    function setUp() public {
        vm.warp(1_000_000);
        usdc = new MockUSDC();
        escrow = new TournamentEscrow(IERC20(address(usdc)), ORGANIZER, TREASURY);
        vm.prank(ORGANIZER);
        id = escrow.createTournament(FEE, 1_000_000 + 1 days, 1_000_000 + 3 days, 1000);
        for (uint160 i = 0; i < 3; i++) {
            address p = [ANA, BETO, CRIS][i];
            usdc.mint(p, 10 * FEE);
            vm.prank(p);
            usdc.approve(address(escrow), type(uint256).max);
        }
    }

    function _enterAll() internal {
        vm.prank(ANA);
        escrow.enter(id, keccak256("ana"));
        vm.prank(BETO);
        escrow.enter(id, keccak256("beto"));
        vm.prank(CRIS);
        escrow.enter(id, keccak256("cris"));
    }

    function _eq(uint256 a, uint256 b) internal pure {
        require(a == b, "valores distintos");
    }

    function test_flujoCompleto() public {
        _enterAll();
        _eq(usdc.balanceOf(address(escrow)), 3 * FEE);

        vm.warp(1_000_000 + 1 days);
        address[] memory winners = new address[](2);
        winners[0] = ANA;
        winners[1] = BETO;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1_620_000; // 3 USDC - 10% = 2.7 USDC → 60/40
        amounts[1] = 1_080_000;
        vm.prank(ORGANIZER);
        escrow.settle(id, winners, amounts);

        vm.prank(ANA);
        escrow.claim();
        vm.prank(TREASURY);
        escrow.claim();
        _eq(usdc.balanceOf(ANA), 10 * FEE - FEE + 1_620_000);
        _eq(usdc.balanceOf(TREASURY), 300_000);

        vm.prank(CRIS);
        vm.expectRevert(TournamentEscrow.NothingToWithdraw.selector);
        escrow.claim();
    }

    function test_rechazaRepartoQueNoCuadra() public {
        _enterAll();
        vm.warp(1_000_000 + 1 days);
        address[] memory winners = new address[](1);
        winners[0] = ANA;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 3 * FEE; // sin descontar comisión: el organizador no puede inventar dinero
        vm.prank(ORGANIZER);
        vm.expectRevert(TournamentEscrow.BadTotal.selector);
        escrow.settle(id, winners, amounts);
    }

    function test_soloInscritosCobran() public {
        _enterAll();
        vm.warp(1_000_000 + 1 days);
        address[] memory winners = new address[](1);
        winners[0] = ORGANIZER;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 2_700_000;
        vm.prank(ORGANIZER);
        vm.expectRevert(abi.encodeWithSelector(TournamentEscrow.NotEntrant.selector, ORGANIZER));
        escrow.settle(id, winners, amounts);
    }

    function test_soloOrganizadorLiquida() public {
        _enterAll();
        vm.warp(1_000_000 + 1 days);
        vm.prank(ANA);
        vm.expectRevert(TournamentEscrow.NotOrganizer.selector);
        escrow.settle(id, new address[](0), new uint256[](0));
    }

    function test_noLiquidaAntesDelCierre() public {
        _enterAll();
        vm.prank(ORGANIZER);
        vm.expectRevert(TournamentEscrow.TooEarly.selector);
        escrow.settle(id, new address[](0), new uint256[](0));
    }

    function test_comisionConTope() public {
        vm.prank(ORGANIZER);
        vm.expectRevert(TournamentEscrow.InvalidParams.selector);
        escrow.createTournament(FEE, 1_000_000 + 1 days, 1_000_000 + 3 days, 1501);
    }

    function test_unaInscripcionPorJugadorYSoloAntesDelCierre() public {
        vm.prank(ANA);
        escrow.enter(id, keccak256("ana"));
        vm.prank(ANA);
        vm.expectRevert(TournamentEscrow.AlreadyEntered.selector);
        escrow.enter(id, keccak256("ana-2"));

        vm.warp(1_000_000 + 1 days);
        vm.prank(BETO);
        vm.expectRevert(TournamentEscrow.TooLate.selector);
        escrow.enter(id, keccak256("beto"));
    }

    function test_reembolsoSiNoSeLiquidaATiempo() public {
        _enterAll();
        usdc.mint(address(this), 5 * FEE);
        usdc.approve(address(escrow), type(uint256).max);
        escrow.sponsor(id, 5 * FEE);

        vm.warp(1_000_000 + 3 days + 1);
        vm.prank(ANA);
        escrow.refund(id);
        _eq(usdc.balanceOf(ANA), 10 * FEE);
        escrow.refund(id);
        _eq(usdc.balanceOf(address(this)), 5 * FEE);

        // Ya cancelado: el organizador no puede liquidar después.
        vm.prank(ORGANIZER);
        vm.expectRevert(TournamentEscrow.WrongStatus.selector);
        escrow.settle(id, new address[](0), new uint256[](0));

        vm.prank(ANA);
        vm.expectRevert(TournamentEscrow.NothingToWithdraw.selector);
        escrow.refund(id);
    }

    function test_reembolsoTrasCancelacion() public {
        _enterAll();
        vm.prank(ORGANIZER);
        escrow.cancel(id);
        vm.prank(BETO);
        escrow.refund(id);
        _eq(usdc.balanceOf(BETO), 10 * FEE);
    }

    function test_noHayReembolsoMientrasEstaAbierto() public {
        _enterAll();
        vm.prank(ANA);
        vm.expectRevert(TournamentEscrow.WrongStatus.selector);
        escrow.refund(id);
    }
}
