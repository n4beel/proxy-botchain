// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Proxy.sol";

contract ProxyHandler is Test {
  Proxy public proxy;

  address public alice = address(0x1111);
  address public bob = address(0x2222);
  address public charlie = address(0x3333);
  address public david = address(0x4444);

  address[4] public actors;

  uint256 public activePollId;

  constructor(Proxy _proxy) {
    proxy = _proxy;
    actors = [alice, bob, charlie, david];

    string[] memory opts = new string[](3);
    opts[0] = "Alpha";
    opts[1] = "Beta";
    opts[2] = "Gamma";

    activePollId = proxy.create("Active Invariant Poll", opts, 10 days);
  }

  function vote(uint8 actorIdx, uint8 option) external {
    address actor = actors[actorIdx % 4];
    (uint8 vOpt, address del, ) = proxy.standing(activePollId, actor);
    if (vOpt != 255 || del != address(0)) return;

    vm.prank(actor);
    try proxy.vote(activePollId, option % 3) {} catch {}
  }

  function delegate(uint8 fromIdx, uint8 toIdx) external {
    if (fromIdx % 4 == toIdx % 4) return;
    address from = actors[fromIdx % 4];
    address to = actors[toIdx % 4];

    (uint8 vOptFrom, address delFrom, uint32 recFrom) = proxy.standing(activePollId, from);
    if (vOptFrom != 255 || delFrom != address(0) || recFrom > 0) return;

    (, address delTo, ) = proxy.standing(activePollId, to);
    if (delTo != address(0)) return;

    vm.prank(from);
    try proxy.delegate(activePollId, to) {} catch {}
  }

  function reclaim(uint8 actorIdx) external {
    address actor = actors[actorIdx % 4];
    (, address del, ) = proxy.standing(activePollId, actor);
    if (del == address(0)) return;

    vm.prank(actor);
    try proxy.reclaim(activePollId) {} catch {}
  }
}

contract ProxyInvariantTest is Test {
  Proxy public proxy;
  ProxyHandler public handler;

  function setUp() public {
    proxy = new Proxy();
    handler = new ProxyHandler(proxy);

    targetContract(address(handler));
  }

  function invariant_TallyPlusPendingEqualsParticipants() public view {
    // Σ tally + Σ received == (voted wallets) + (currently delegating wallets)
    uint256[] memory t = proxy.tallies(handler.activePollId());
    uint256 sumTally = t[0] + t[1] + t[2];

    uint256 sumReceived = 0;
    uint256 votedCount = 0;
    uint256 delegatingCount = 0;

    for (uint256 i = 0; i < 4; i++) {
      address actor = handler.actors(i);
      (uint8 vOpt, address del, uint32 rec) = proxy.standing(handler.activePollId(), actor);
      sumReceived += rec;
      if (vOpt != 255) {
        votedCount += 1;
      }
      if (del != address(0)) {
        delegatingCount += 1;
      }
    }

    assertEq(sumTally + sumReceived, votedCount + delegatingCount);
  }
}
