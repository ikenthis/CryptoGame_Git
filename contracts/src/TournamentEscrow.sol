// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title TournamentEscrow
/// @notice Custodia las entradas de los torneos de Bastión (en USDC) hasta que
///         se publican los resultados. Garantías para el jugador:
///         - La comisión del organizador tiene un tope fijo en el código (MAX_FEE_BPS).
///         - Premios + comisión deben sumar exactamente el pozo: nada se queda "perdido".
///         - Solo pueden cobrar premios quienes se inscribieron.
///         - Si el organizador cancela o no publica resultados a tiempo, cada uno
///           recupera exactamente lo que aportó.
///         - Cada inscripción guarda el compromiso (hash) del ejército enviado, así
///           cualquiera puede recalcular el torneo con el motor abierto y auditarlo.
/// @dev SIN AUDITAR. No desplegar con dinero real sin una auditoría externa.
contract TournamentEscrow {
    uint16 public constant MAX_FEE_BPS = 1500; // 15%

    enum Status { None, Open, Settled, Cancelled }

    struct Tournament {
        uint128 entryFee;
        uint64 closesAt;
        uint64 settleDeadline;
        uint16 feeBps;
        Status status;
        uint32 entrants;
        uint256 pool;
    }

    IERC20 public immutable token;
    address public organizer;
    address public treasury;
    uint256 public nextId = 1;

    mapping(uint256 => Tournament) public tournaments;
    mapping(uint256 => mapping(address => bytes32)) public commitments;
    /// @dev Lo aportado por cada dirección (entrada o patrocinio), para reembolsos.
    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(address => uint256) public claimable;

    event TournamentCreated(uint256 indexed id, uint256 entryFee, uint64 closesAt, uint64 settleDeadline, uint16 feeBps);
    event Entered(uint256 indexed id, address indexed player, bytes32 commitment);
    event Sponsored(uint256 indexed id, address indexed sponsor, uint256 amount);
    event Settled(uint256 indexed id, uint256 fee, address[] winners, uint256[] amounts);
    event Cancelled(uint256 indexed id);
    event Refunded(uint256 indexed id, address indexed account, uint256 amount);
    event Claimed(address indexed account, uint256 amount);
    event OrganizerChanged(address organizer, address treasury);

    error NotOrganizer();
    error InvalidParams();
    error WrongStatus();
    error TooLate();
    error TooEarly();
    error AlreadyEntered();
    error NotEntrant(address account);
    error BadTotal();
    error NothingToWithdraw();
    error TransferFailed();

    modifier onlyOrganizer() {
        if (msg.sender != organizer) revert NotOrganizer();
        _;
    }

    constructor(IERC20 token_, address organizer_, address treasury_) {
        if (address(token_) == address(0) || organizer_ == address(0) || treasury_ == address(0)) revert InvalidParams();
        token = token_;
        organizer = organizer_;
        treasury = treasury_;
    }

    function setOrganizer(address organizer_, address treasury_) external onlyOrganizer {
        if (organizer_ == address(0) || treasury_ == address(0)) revert InvalidParams();
        organizer = organizer_;
        treasury = treasury_;
        emit OrganizerChanged(organizer_, treasury_);
    }

    function createTournament(uint128 entryFee, uint64 closesAt, uint64 settleDeadline, uint16 feeBps)
        external
        onlyOrganizer
        returns (uint256 id)
    {
        if (closesAt <= block.timestamp || settleDeadline <= closesAt || feeBps > MAX_FEE_BPS) revert InvalidParams();
        id = nextId++;
        tournaments[id] = Tournament({
            entryFee: entryFee,
            closesAt: closesAt,
            settleDeadline: settleDeadline,
            feeBps: feeBps,
            status: Status.Open,
            entrants: 0,
            pool: 0
        });
        emit TournamentCreated(id, entryFee, closesAt, settleDeadline, feeBps);
    }

    /// @param commitment sha256(torneo|jugador|ejército canónico|sal), calculado por el cliente.
    function enter(uint256 id, bytes32 commitment) external {
        Tournament storage t = tournaments[id];
        if (t.status != Status.Open) revert WrongStatus();
        if (block.timestamp >= t.closesAt) revert TooLate();
        if (commitment == bytes32(0)) revert InvalidParams();
        if (commitments[id][msg.sender] != bytes32(0)) revert AlreadyEntered();

        commitments[id][msg.sender] = commitment;
        t.entrants++;
        t.pool += t.entryFee;
        contributions[id][msg.sender] += t.entryFee;
        emit Entered(id, msg.sender, commitment);
        _pull(msg.sender, t.entryFee);
    }

    /// @notice Cualquiera puede aumentar el pozo (patrocinadores, la propia casa).
    function sponsor(uint256 id, uint256 amount) external {
        Tournament storage t = tournaments[id];
        if (t.status != Status.Open) revert WrongStatus();
        if (block.timestamp >= t.closesAt) revert TooLate();
        if (amount == 0) revert InvalidParams();
        t.pool += amount;
        contributions[id][msg.sender] += amount;
        emit Sponsored(id, msg.sender, amount);
        _pull(msg.sender, amount);
    }

    /// @notice Publica el reparto calculado off-chain por el motor determinista.
    function settle(uint256 id, address[] calldata winners, uint256[] calldata amounts) external onlyOrganizer {
        Tournament storage t = tournaments[id];
        if (t.status != Status.Open) revert WrongStatus();
        if (block.timestamp < t.closesAt) revert TooEarly();
        if (block.timestamp > t.settleDeadline) revert TooLate();
        if (winners.length != amounts.length) revert InvalidParams();

        uint256 fee = (t.pool * t.feeBps) / 10_000;
        uint256 total = fee;
        for (uint256 i = 0; i < winners.length; i++) {
            if (commitments[id][winners[i]] == bytes32(0)) revert NotEntrant(winners[i]);
            total += amounts[i];
            claimable[winners[i]] += amounts[i];
        }
        if (total != t.pool) revert BadTotal();

        t.status = Status.Settled;
        claimable[treasury] += fee;
        emit Settled(id, fee, winners, amounts);
    }

    function cancel(uint256 id) external onlyOrganizer {
        Tournament storage t = tournaments[id];
        if (t.status != Status.Open) revert WrongStatus();
        t.status = Status.Cancelled;
        emit Cancelled(id);
    }

    /// @notice Recupera lo aportado si el torneo se canceló o no se liquidó a tiempo.
    function refund(uint256 id) external {
        Tournament storage t = tournaments[id];
        if (t.status == Status.Open && block.timestamp > t.settleDeadline) {
            t.status = Status.Cancelled;
            emit Cancelled(id);
        }
        if (t.status != Status.Cancelled) revert WrongStatus();
        uint256 amount = contributions[id][msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        contributions[id][msg.sender] = 0;
        t.pool -= amount;
        emit Refunded(id, msg.sender, amount);
        _push(msg.sender, amount);
    }

    function claim() external {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        claimable[msg.sender] = 0;
        emit Claimed(msg.sender, amount);
        _push(msg.sender, amount);
    }

    function _pull(address from, uint256 amount) private {
        if (amount == 0) return;
        _call(abi.encodeCall(IERC20.transferFrom, (from, address(this), amount)));
    }

    function _push(address to, uint256 amount) private {
        _call(abi.encodeCall(IERC20.transfer, (to, amount)));
    }

    /// @dev Admite tokens que devuelven bool y tokens que no devuelven nada.
    function _call(bytes memory data) private {
        (bool ok, bytes memory ret) = address(token).call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
