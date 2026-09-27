// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Interfaz mínima de los cheatcodes de Foundry (evita depender de forge-std).
interface Vm {
    function prank(address) external;
    function warp(uint256) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
