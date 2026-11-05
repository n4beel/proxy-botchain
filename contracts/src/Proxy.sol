// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title Proxy
 * @notice Delegable equal-weight voting poll with take-back.
 *         One wallet = one vote. You can vote directly, or delegate your vote
 *         to another wallet (one hop only), and take it back before the poll ends.
 */
contract Proxy {
  // --- Constants ---
  uint256 public constant MAX_QUESTION_BYTES = 120;
  uint256 public constant MAX_OPTION_BYTES = 32;
  uint8 public constant MIN_OPTIONS = 2;
  uint8 public constant MAX_OPTIONS = 6;
  uint64 public constant MIN_DURATION = 1 hours;
  uint64 public constant MAX_DURATION = 90 days;
  uint256 public constant MAX_PAGE = 50;

  // --- Structs ---
  struct Poll {
    address asker;
    uint64 endsAt;
    uint8 optionCount;
    string question;
  }

  // --- Storage ---
  mapping(uint256 => Poll) private _polls;
  mapping(uint256 => string[]) private _options;
  mapping(uint256 => uint256[6]) private _tally;
  mapping(uint256 => mapping(address => uint8)) private _voted;      // option + 1; 0 = has not voted
  mapping(uint256 => mapping(address => address)) private _delegate; // who this wallet handed its vote to
  mapping(uint256 => mapping(address => uint32)) private _received;  // delegations held that have not been counted yet
  uint256 public pollCount;                                          // ids start at 1

  // --- Errors ---
  error BadQuestion();
  error BadOptions();
  error BadDuration();
  error PollNotFound();
  error Ended();
  error BadOption();
  error BadDelegate();
  error AlreadyVoted();
  error AlreadyDelegated(address to);
  error NotDelegated();
  error HoldsDelegations();
  error TargetDelegated();

  // --- Events ---
  event Created(
    uint256 indexed id,
    address indexed asker,
    string question,
    uint64 endsAt
  );
  event Voted(
    uint256 indexed id,
    address indexed who,
    uint8 option,
    uint256 weight
  );
  event Delegated(
    uint256 indexed id,
    address indexed from,
    address indexed to,
    bool counted
  );
  event Reclaimed(
    uint256 indexed id,
    address indexed from,
    address indexed to
  );

  /**
   * @notice Create a new delegable poll.
   */
  function create(
    string calldata question,
    string[] calldata options,
    uint64 duration
  ) external returns (uint256 id) {
    bytes memory qBytes = bytes(question);
    if (qBytes.length == 0 || qBytes.length > MAX_QUESTION_BYTES) revert BadQuestion();

    uint256 optLen = options.length;
    if (optLen < MIN_OPTIONS || optLen > MAX_OPTIONS) revert BadOptions();

    for (uint256 i = 0; i < optLen; i++) {
      bytes memory optBytes = bytes(options[i]);
      if (optBytes.length == 0 || optBytes.length > MAX_OPTION_BYTES) revert BadOptions();
    }

    if (duration < MIN_DURATION || duration > MAX_DURATION) revert BadDuration();

    id = ++pollCount;
    uint64 endsAt = uint64(block.timestamp) + duration;

    _polls[id] = Poll({
      asker: msg.sender,
      endsAt: endsAt,
      optionCount: uint8(optLen),
      question: question
    });

    for (uint256 i = 0; i < optLen; i++) {
      _options[id].push(options[i]);
    }

    emit Created(id, msg.sender, question, endsAt);
  }

  /**
   * @notice Vote directly for an option.
   */
  function vote(uint256 id, uint8 option) external {
    if (id == 0 || id > pollCount) revert PollNotFound();
    Poll storage p = _polls[id];

    if (block.timestamp >= p.endsAt) revert Ended();
    if (option >= p.optionCount) revert BadOption();

    address del = _delegate[id][msg.sender];
    if (del != address(0)) revert AlreadyDelegated(del);
    if (_voted[id][msg.sender] != 0) revert AlreadyVoted();

    uint256 weight = 1 + uint256(_received[id][msg.sender]);
    _received[id][msg.sender] = 0;
    _voted[id][msg.sender] = option + 1;
    _tally[id][option] += weight;

    emit Voted(id, msg.sender, option, weight);
  }

  /**
   * @notice Delegate your vote to another wallet (1 hop).
   */
  function delegate(uint256 id, address to) external {
    if (id == 0 || id > pollCount) revert PollNotFound();
    Poll storage p = _polls[id];

    if (block.timestamp >= p.endsAt) revert Ended();
    if (to == address(0) || to == msg.sender) revert BadDelegate();
    if (_voted[id][msg.sender] != 0) revert AlreadyVoted();

    address existingDel = _delegate[id][msg.sender];
    if (existingDel != address(0)) revert AlreadyDelegated(existingDel);

    if (_received[id][msg.sender] > 0) revert HoldsDelegations();
    if (_delegate[id][to] != address(0)) revert TargetDelegated();

    _delegate[id][msg.sender] = to;

    uint8 targetVoted = _voted[id][to];
    bool counted = false;

    if (targetVoted != 0) {
      uint8 opt = targetVoted - 1;
      _tally[id][opt] += 1;
      counted = true;
    } else {
      _received[id][to] += 1;
    }

    emit Delegated(id, msg.sender, to, counted);
  }

  /**
   * @notice Take back your delegated vote while poll is open.
   */
  function reclaim(uint256 id) external {
    if (id == 0 || id > pollCount) revert PollNotFound();
    Poll storage p = _polls[id];

    if (block.timestamp >= p.endsAt) revert Ended();

    address to = _delegate[id][msg.sender];
    if (to == address(0)) revert NotDelegated();

    _delegate[id][msg.sender] = address(0);

    uint8 targetVoted = _voted[id][to];
    if (targetVoted != 0) {
      uint8 opt = targetVoted - 1;
      _tally[id][opt] -= 1;
    } else {
      _received[id][to] -= 1;
    }

    emit Reclaimed(id, msg.sender, to);
  }

  // --- Views ---

  function pollOf(uint256 id) external view returns (Poll memory) {
    if (id == 0 || id > pollCount) revert PollNotFound();
    return _polls[id];
  }

  function optionsOf(uint256 id) external view returns (string[] memory) {
    if (id == 0 || id > pollCount) revert PollNotFound();
    return _options[id];
  }

  function tallies(uint256 id) external view returns (uint256[] memory) {
    if (id == 0 || id > pollCount) revert PollNotFound();
    uint8 count = _polls[id].optionCount;
    uint256[] memory res = new uint256[](count);
    for (uint8 i = 0; i < count; i++) {
      res[i] = _tally[id][i];
    }
    return res;
  }

  function standing(uint256 id, address who)
    external
    view
    returns (
      uint8 votedOption,
      address delegatedTo,
      uint32 receivedCount
    )
  {
    if (id == 0 || id > pollCount) revert PollNotFound();
    uint8 v = _voted[id][who];
    votedOption = v == 0 ? 255 : v - 1;
    delegatedTo = _delegate[id][who];
    receivedCount = _received[id][who];
  }

  function leader(uint256 id) external view returns (uint8 topOption, bool tied) {
    if (id == 0 || id > pollCount) revert PollNotFound();
    uint8 count = _polls[id].optionCount;
    if (count == 0) return (0, false);

    uint256 maxVotes = 0;
    topOption = 0;
    tied = false;

    for (uint8 i = 0; i < count; i++) {
      uint256 v = _tally[id][i];
      if (v > maxVotes) {
        maxVotes = v;
        topOption = i;
        tied = false;
      } else if (v == maxVotes && maxVotes > 0) {
        tied = true;
      }
    }

    if (maxVotes == 0) {
      tied = false;
      topOption = 0;
    }
  }

  function latest(uint256 offset, uint256 count)
    external
    view
    returns (
      uint256[] memory ids,
      Poll[] memory polls,
      uint256 total
    )
  {
    total = pollCount;
    if (count > MAX_PAGE) {
      count = MAX_PAGE;
    }
    if (offset >= total || count == 0) {
      return (new uint256[](0), new Poll[](0), total);
    }
    if (offset + count > total) {
      count = total - offset;
    }

    ids = new uint256[](count);
    polls = new Poll[](count);

    for (uint256 i = 0; i < count; i++) {
      uint256 id = total - (offset + i);
      ids[i] = id;
      polls[i] = _polls[id];
    }
  }
}
