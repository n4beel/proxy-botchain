import { describe, it, expect } from 'vitest';
import {
  createInitialPollState,
  applyAction,
  share,
  treeLayout,
  formatAddress,
  type PollState,
} from '../proxy';
import { formatProxyError } from '../errors';

describe('Proxy lib tests', () => {
  const alice = '0x1111111111111111111111111111111111111111';
  const bob = '0x2222222222222222222222222222222222222222';
  const charlie = '0x3333333333333333333333333333333333333333';
  const dave = '0x4444444444444444444444444444444444444444';

  it('formats proxy errors according to specs', () => {
    expect(formatProxyError(new Error('HoldsDelegations()'))).toBe(
      'Others have handed you their votes; you can only vote.'
    );
    expect(formatProxyError(new Error('TargetDelegated()'))).toBe(
      'That wallet has handed its vote on. Pick someone who votes themselves.'
    );
    expect(
      formatProxyError(new Error(`AlreadyDelegated(${bob})`))
    ).toBe(`You handed your vote to ${bob}. Take it back to vote.`);
    expect(formatProxyError(new Error('AlreadyVoted()'))).toBe(
      'You have already voted in this poll.'
    );
    expect(formatProxyError(new Error('NotDelegated()'))).toBe(
      'You have not delegated your vote in this poll.'
    );
    expect(formatProxyError(new Error('BadDelegate()'))).toBe(
      'Invalid delegate address. You cannot delegate to yourself or address zero.'
    );
    expect(formatProxyError(new Error('Ended()'))).toBe('This poll has ended.');
  });

  it('applies vote directly', () => {
    let state = createInitialPollState(alice, 'Should we do X?', ['Yes', 'No'], 3600, 1000);
    state = applyAction(state, { type: 'vote', caller: bob, option: 0, timestamp: 1010 });

    expect(state.voted[bob.toLowerCase()]).toBe(0);
    expect(state.tallies[0]).toBe(1n);
    expect(state.tallies[1]).toBe(0n);
  });

  it('delegates to someone who already voted: weight lands immediately', () => {
    let state = createInitialPollState(alice, 'Should we do X?', ['Yes', 'No'], 3600, 1000);
    // Bob votes Yes (option 0)
    state = applyAction(state, { type: 'vote', caller: bob, option: 0, timestamp: 1010 });
    expect(state.tallies[0]).toBe(1n);

    // Charlie delegates to Bob
    state = applyAction(state, { type: 'delegate', caller: charlie, to: bob, timestamp: 1020 });
    expect(state.tallies[0]).toBe(2n);
    expect(state.delegate[charlie.toLowerCase()]).toBe(bob.toLowerCase());
  });

  it('delegates to someone who has NOT voted: pending until vote, then weight arrives', () => {
    let state = createInitialPollState(alice, 'Should we do X?', ['Yes', 'No'], 3600, 1000);

    // Charlie delegates to Bob before Bob votes
    state = applyAction(state, { type: 'delegate', caller: charlie, to: bob, timestamp: 1010 });
    expect(state.tallies[0]).toBe(0n);
    expect(state.received[bob.toLowerCase()]).toBe(1);

    // Bob votes Yes (option 0)
    state = applyAction(state, { type: 'vote', caller: bob, option: 0, timestamp: 1020 });
    expect(state.tallies[0]).toBe(2n); // Bob's 1 + Charlie's 1
    expect(state.received[bob.toLowerCase()]).toBeUndefined();
  });

  it('reclaim before delegate votes: removes pending', () => {
    let state = createInitialPollState(alice, 'Should we do X?', ['Yes', 'No'], 3600, 1000);
    state = applyAction(state, { type: 'delegate', caller: charlie, to: bob, timestamp: 1010 });
    expect(state.received[bob.toLowerCase()]).toBe(1);

    state = applyAction(state, { type: 'reclaim', caller: charlie, timestamp: 1020 });
    expect(state.received[bob.toLowerCase()]).toBeUndefined();
    expect(state.delegate[charlie.toLowerCase()]).toBeUndefined();

    // Now Charlie votes himself
    state = applyAction(state, { type: 'vote', caller: charlie, option: 1, timestamp: 1030 });
    expect(state.tallies[1]).toBe(1n);
  });

  it('reclaim after delegate votes: removes from tally, can vote or delegate again', () => {
    let state = createInitialPollState(alice, 'Should we do X?', ['Yes', 'No'], 3600, 1000);
    state = applyAction(state, { type: 'vote', caller: bob, option: 0, timestamp: 1010 });
    state = applyAction(state, { type: 'delegate', caller: charlie, to: bob, timestamp: 1020 });
    expect(state.tallies[0]).toBe(2n);

    // Charlie reclaims
    state = applyAction(state, { type: 'reclaim', caller: charlie, timestamp: 1030 });
    expect(state.tallies[0]).toBe(1n);

    // Charlie delegates to Dave, who then votes No
    state = applyAction(state, { type: 'delegate', caller: charlie, to: dave, timestamp: 1040 });
    state = applyAction(state, { type: 'vote', caller: dave, option: 1, timestamp: 1050 });
    expect(state.tallies[0]).toBe(1n);
    expect(state.tallies[1]).toBe(2n);
  });

  it('rejects double voting or delegating twice', () => {
    let state = createInitialPollState(alice, 'Should we do X?', ['Yes', 'No'], 3600, 1000);
    state = applyAction(state, { type: 'vote', caller: bob, option: 0, timestamp: 1010 });
    expect(() => applyAction(state, { type: 'vote', caller: bob, option: 1, timestamp: 1020 })).toThrow(
      'AlreadyVoted'
    );
    expect(() =>
      applyAction(state, { type: 'delegate', caller: bob, to: charlie, timestamp: 1020 })
    ).toThrow('AlreadyVoted');
  });

  it('rejects delegating if caller holds delegations', () => {
    let state = createInitialPollState(alice, 'Should we do X?', ['Yes', 'No'], 3600, 1000);
    // Charlie delegates to Bob
    state = applyAction(state, { type: 'delegate', caller: charlie, to: bob, timestamp: 1010 });
    // Bob attempts to delegate to Dave
    expect(() =>
      applyAction(state, { type: 'delegate', caller: bob, to: dave, timestamp: 1020 })
    ).toThrow('HoldsDelegations');
  });

  it('rejects delegating to someone who has delegated', () => {
    let state = createInitialPollState(alice, 'Should we do X?', ['Yes', 'No'], 3600, 1000);
    // Charlie delegates to Bob
    state = applyAction(state, { type: 'delegate', caller: charlie, to: bob, timestamp: 1010 });
    // Dave attempts to delegate to Charlie
    expect(() =>
      applyAction(state, { type: 'delegate', caller: dave, to: charlie, timestamp: 1020 })
    ).toThrow('TargetDelegated');
  });

  it('rejects actions after ended', () => {
    const state = createInitialPollState(alice, 'Should we do X?', ['Yes', 'No'], 3600, 1000);
    expect(() =>
      applyAction(state, { type: 'vote', caller: bob, option: 0, timestamp: 5000 })
    ).toThrow('Ended');
  });

  it('computes share percentages correctly', () => {
    expect(share([0n, 0n])).toEqual([0, 0]);
    expect(share([3n, 1n])).toEqual([75, 25]);
    expect(share([1n, 1n, 1n])).toEqual([33.33, 33.33, 33.33]);
  });

  it('formats address properly', () => {
    expect(formatAddress(alice)).toBe('0x1111…1111');
  });

  it('generates tree layout structure', () => {
    const options = ['Red', 'Blue'];
    const tallies = [2n, 1n];
    const voted = { [bob.toLowerCase()]: 0, [dave.toLowerCase()]: 1 };
    const delegate = { [charlie.toLowerCase()]: bob.toLowerCase() };
    const received = {};

    const layout = treeLayout(options, tallies, voted, delegate, received);
    expect(layout.bins.length).toBe(2);
    expect(layout.bins[0].voters.length).toBe(1);
    expect(layout.bins[0].voters[0].address).toBe(bob.toLowerCase());
    expect(layout.bins[0].voters[0].delegators).toEqual([charlie.toLowerCase()]);
    expect(layout.bins[0].voters[0].weight).toBe(2);

    expect(layout.bins[1].voters.length).toBe(1);
    expect(layout.bins[1].voters[0].address).toBe(dave.toLowerCase());
    expect(layout.bins[1].voters[0].weight).toBe(1);
  });
});
