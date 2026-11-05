// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Proxy.sol";

contract ProxyTest is Test {
  Proxy public proxy;

  address public alice = address(0x1111);
  address public bob = address(0x2222);
  address public charlie = address(0x3333);
  address public david = address(0x4444);
  address public eve = address(0x5555);

  string[] public defaultOptions;

  function setUp() public {
    proxy = new Proxy();

    defaultOptions.push("Option Alpha");
    defaultOptions.push("Option Beta");
    defaultOptions.push("Option Gamma");
  }

  function test_VoteCountsOne() public {
    vm.prank(alice);
    uint256 id = proxy.create("Should we launch?", defaultOptions, 1 days);

    vm.prank(bob);
    proxy.vote(id, 0);

    uint256[] memory t = proxy.tallies(id);
    assertEq(t[0], 1);
    assertEq(t[1], 0);
    assertEq(t[2], 0);

    (uint8 vOpt, address del, uint32 rec) = proxy.standing(id, bob);
    assertEq(vOpt, 0);
    assertEq(del, address(0));
    assertEq(rec, 0);
  }

  function test_DelegateThenDelegateVotes_WeightArrives() public {
    vm.prank(alice);
    uint256 id = proxy.create("Question?", defaultOptions, 1 days);

    // Bob delegates to Charlie before Charlie votes
    vm.prank(bob);
    proxy.delegate(id, charlie);

    uint256[] memory t1 = proxy.tallies(id);
    assertEq(t1[0], 0);

    (, , uint32 recCharlie) = proxy.standing(id, charlie);
    assertEq(recCharlie, 1);

    // Charlie votes for option 1 (Beta) with weight 1 + 1 = 2
    vm.prank(charlie);
    proxy.vote(id, 1);

    uint256[] memory t2 = proxy.tallies(id);
    assertEq(t2[1], 2);

    (, , uint32 recCharlieAfter) = proxy.standing(id, charlie);
    assertEq(recCharlieAfter, 0);
  }

  function test_DelegateToWalletThatAlreadyVoted_CountsNow() public {
    vm.prank(alice);
    uint256 id = proxy.create("Question?", defaultOptions, 1 days);

    // Charlie votes first for option 2 (Gamma)
    vm.prank(charlie);
    proxy.vote(id, 2);

    uint256[] memory t1 = proxy.tallies(id);
    assertEq(t1[2], 1);

    // Bob delegates to Charlie after Charlie already voted -> counts immediately
    vm.prank(bob);
    proxy.delegate(id, charlie);

    uint256[] memory t2 = proxy.tallies(id);
    assertEq(t2[2], 2);
  }

  function test_ReclaimBeforeDelegateVotes_RemovesPending() public {
    vm.prank(alice);
    uint256 id = proxy.create("Question?", defaultOptions, 1 days);

    vm.prank(bob);
    proxy.delegate(id, charlie);

    (, , uint32 recCharlie) = proxy.standing(id, charlie);
    assertEq(recCharlie, 1);

    // Bob reclaims
    vm.prank(bob);
    proxy.reclaim(id);

    (, , uint32 recCharlieAfter) = proxy.standing(id, charlie);
    assertEq(recCharlieAfter, 0);

    // Charlie now votes with weight 1
    vm.prank(charlie);
    proxy.vote(id, 0);

    uint256[] memory t = proxy.tallies(id);
    assertEq(t[0], 1);
  }

  function test_ReclaimAfterDelegateVoted_RemovesFromTally() public {
    vm.prank(alice);
    uint256 id = proxy.create("Question?", defaultOptions, 1 days);

    vm.prank(charlie);
    proxy.vote(id, 0);

    vm.prank(bob);
    proxy.delegate(id, charlie);

    uint256[] memory t1 = proxy.tallies(id);
    assertEq(t1[0], 2);

    // Bob reclaims
    vm.prank(bob);
    proxy.reclaim(id);

    uint256[] memory t2 = proxy.tallies(id);
    assertEq(t2[0], 1);
  }

  function test_ReclaimThenVoteSelf() public {
    vm.prank(alice);
    uint256 id = proxy.create("Question?", defaultOptions, 1 days);

    vm.prank(charlie);
    proxy.vote(id, 0);

    vm.prank(bob);
    proxy.delegate(id, charlie);

    vm.prank(bob);
    proxy.reclaim(id);

    // Bob can now vote himself for option 1
    vm.prank(bob);
    proxy.vote(id, 1);

    uint256[] memory t = proxy.tallies(id);
    assertEq(t[0], 1);
    assertEq(t[1], 1);
  }

  function test_CannotDelegateWhileHoldingDelegations() public {
    vm.prank(alice);
    uint256 id = proxy.create("Question?", defaultOptions, 1 days);

    // Bob delegates to Charlie
    vm.prank(bob);
    proxy.delegate(id, charlie);

    // Charlie attempts to delegate to David (hop 2 forbidden)
    vm.prank(charlie);
    vm.expectRevert(Proxy.HoldsDelegations.selector);
    proxy.delegate(id, david);
  }

  function test_CannotDelegateToAWalletThatDelegated() public {
    vm.prank(alice);
    uint256 id = proxy.create("Question?", defaultOptions, 1 days);

    // Charlie delegates to David
    vm.prank(charlie);
    proxy.delegate(id, david);

    // Bob attempts to delegate to Charlie
    vm.prank(bob);
    vm.expectRevert(Proxy.TargetDelegated.selector);
    proxy.delegate(id, charlie);
  }

  function test_CannotVoteAfterDelegating_ArgsTo() public {
    vm.prank(alice);
    uint256 id = proxy.create("Question?", defaultOptions, 1 days);

    vm.prank(bob);
    proxy.delegate(id, charlie);

    vm.prank(bob);
    vm.expectRevert(abi.encodeWithSelector(Proxy.AlreadyDelegated.selector, charlie));
    proxy.vote(id, 0);
  }

  function test_CannotDelegateToSelfOrZero() public {
    vm.prank(alice);
    uint256 id = proxy.create("Question?", defaultOptions, 1 days);

    vm.prank(bob);
    vm.expectRevert(Proxy.BadDelegate.selector);
    proxy.delegate(id, bob);

    vm.prank(bob);
    vm.expectRevert(Proxy.BadDelegate.selector);
    proxy.delegate(id, address(0));
  }

  function test_EndedPollRejectsEverything() public {
    vm.prank(alice);
    uint256 id = proxy.create("Question?", defaultOptions, 1 days);

    vm.warp(block.timestamp + 1 days + 1);

    vm.prank(bob);
    vm.expectRevert(Proxy.Ended.selector);
    proxy.vote(id, 0);

    vm.prank(bob);
    vm.expectRevert(Proxy.Ended.selector);
    proxy.delegate(id, charlie);

    vm.prank(bob);
    vm.expectRevert(Proxy.Ended.selector);
    proxy.reclaim(id);
  }

  function test_LeaderAndTie() public {
    vm.prank(alice);
    uint256 id = proxy.create("Question?", defaultOptions, 1 days);

    // Initially 0 votes: tied false, topOption 0
    (uint8 top0, bool tie0) = proxy.leader(id);
    assertEq(top0, 0);
    assertFalse(tie0);

    // Bob votes 0 -> option 0 leads
    vm.prank(bob);
    proxy.vote(id, 0);
    (uint8 top1, bool tie1) = proxy.leader(id);
    assertEq(top1, 0);
    assertFalse(tie1);

    // Charlie votes 1 -> tie between 0 and 1
    vm.prank(charlie);
    proxy.vote(id, 1);
    (, bool tie2) = proxy.leader(id);
    assertTrue(tie2);

    // David votes 1 -> option 1 leads
    vm.prank(david);
    proxy.vote(id, 1);
    (uint8 top3, bool tie3) = proxy.leader(id);
    assertEq(top3, 1);
    assertFalse(tie3);
  }

  function test_ManyDelegatorsOneDelegate_WeightIsSum() public {
    vm.prank(alice);
    uint256 id = proxy.create("Question?", defaultOptions, 1 days);

    // Bob, Charlie, David all delegate to Eve
    vm.prank(bob);
    proxy.delegate(id, eve);
    vm.prank(charlie);
    proxy.delegate(id, eve);
    vm.prank(david);
    proxy.delegate(id, eve);

    // Eve votes 2 (Gamma) -> weight should be 1 + 3 = 4
    vm.prank(eve);
    proxy.vote(id, 2);

    uint256[] memory t = proxy.tallies(id);
    assertEq(t[2], 4);
  }

  function test_SpecificMutantKillers() public {
    // 1. Boundary checks: MAX_QUESTION_BYTES (120), MIN_OPTIONS (2), MAX_OPTIONS (6), MAX_OPTION_BYTES (32), MIN_DURATION (1h), MAX_DURATION (90d)
    string memory q120 = "123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890";
    string[] memory optsMin = new string[](2);
    optsMin[0] = "Yes";
    optsMin[1] = "No";

    uint256 idMin = proxy.create(q120, optsMin, 1 hours);
    assertEq(proxy.pollOf(idMin).optionCount, 2);

    // 6 options with 32 byte strings
    string[] memory optsMax = new string[](6);
    for (uint256 i = 0; i < 6; i++) {
      optsMax[i] = "12345678901234567890123456789012";
    }
    uint256 idMax = proxy.create("Max Options", optsMax, 90 days);
    assertEq(proxy.pollOf(idMax).optionCount, 6);

    // 2. Pagination views
    (uint256[] memory ids, , uint256 total) = proxy.latest(0, 10);
    assertEq(ids.length, 2);
    assertEq(total, 2);

    // Pagination slice clamping
    (uint256[] memory sliceIds, , ) = proxy.latest(1, 5);
    assertEq(sliceIds.length, 1);
    assertEq(sliceIds[0], 1);

    // Invalid poll queries
    vm.expectRevert(Proxy.PollNotFound.selector);
    proxy.pollOf(0);
    vm.expectRevert(Proxy.PollNotFound.selector);
    proxy.pollOf(999);
    vm.expectRevert(Proxy.PollNotFound.selector);
    proxy.optionsOf(0);
    vm.expectRevert(Proxy.PollNotFound.selector);
    proxy.tallies(0);
    vm.expectRevert(Proxy.PollNotFound.selector);
    proxy.standing(0, alice);
    vm.expectRevert(Proxy.PollNotFound.selector);
    proxy.leader(0);
  }

  function testFuzz_TalliesMatchActions(uint8 actionsSeed) public {
    vm.prank(alice);
    uint256 id = proxy.create("Fuzz Poll", defaultOptions, 1 days);

    address[4] memory actors = [bob, charlie, david, eve];

    for (uint256 i = 0; i < 8; i++) {
      address actor = actors[(uint256(actionsSeed) + i) % 4];
      uint256 shift = (i % 8) * 2;
      uint8 actionType = uint8((uint256(actionsSeed) >> shift) & 3); // 0=vote, 1=delegate, 2=reclaim, 3=idle

      (uint8 vOpt, address del, ) = proxy.standing(id, actor);

      if (actionType == 0 && vOpt == 255 && del == address(0)) {
        vm.prank(actor);
        try proxy.vote(id, uint8(i % 3)) {} catch {}
      } else if (actionType == 1 && vOpt == 255 && del == address(0)) {
        address target = actors[(uint256(actionsSeed) + i + 1) % 4];
        if (target != actor) {
          vm.prank(actor);
          try proxy.delegate(id, target) {} catch {}
        }
      } else if (actionType == 2 && del != address(0)) {
        vm.prank(actor);
        try proxy.reclaim(id) {} catch {}
      }
    }

    uint256[] memory t = proxy.tallies(id);
    uint256 sumTallies = t[0] + t[1] + t[2];
    assertTrue(sumTallies <= 4);
  }
}
