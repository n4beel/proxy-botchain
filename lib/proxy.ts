// lib/proxy.ts - Pure reference model, layout and constants for Proxy (Spec §2, §4)

export const MAX_QUESTION_BYTES = 120;
export const MAX_OPTION_BYTES = 32;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MIN_DURATION = 3600; // 1 hour in seconds
export const MAX_DURATION = 90 * 86400; // 90 days in seconds
export const MAX_PAGE = 50;

export interface PollState {
  asker: string;
  endsAt: number;
  optionCount: number;
  question: string;
  options: string[];
  tallies: bigint[]; // length optionCount
  voted: Record<string, number>; // address (lowercase) -> optionIndex (0-based)
  delegate: Record<string, string>; // address (lowercase) -> delegateAddress (lowercase)
  received: Record<string, number>; // address (lowercase) -> count of pending delegations held
}

export type Action =
  | { type: 'vote'; caller: string; option: number; timestamp?: number }
  | { type: 'delegate'; caller: string; to: string; timestamp?: number }
  | { type: 'reclaim'; caller: string; timestamp?: number };

export function createInitialPollState(
  asker: string,
  question: string,
  options: string[],
  duration: number,
  now: number = Math.floor(Date.now() / 1000)
): PollState {
  return {
    asker: asker.toLowerCase(),
    endsAt: now + duration,
    optionCount: options.length,
    question,
    options: [...options],
    tallies: new Array(options.length).fill(0n),
    voted: {},
    delegate: {},
    received: {},
  };
}

export function applyAction(state: PollState, action: Action, currentTime?: number): PollState {
  const caller = action.caller.toLowerCase();
  const now = currentTime ?? action.timestamp ?? Math.floor(Date.now() / 1000);

  if (now >= state.endsAt) {
    throw new Error('Ended');
  }

  // Deep clone state for immutability
  const next: PollState = {
    ...state,
    options: [...state.options],
    tallies: [...state.tallies],
    voted: { ...state.voted },
    delegate: { ...state.delegate },
    received: { ...state.received },
  };

  if (action.type === 'vote') {
    const opt = action.option;
    if (opt >= next.optionCount) {
      throw new Error('BadOption');
    }
    if (next.delegate[caller]) {
      throw new Error(`AlreadyDelegated(${next.delegate[caller]})`);
    }
    if (caller in next.voted) {
      throw new Error('AlreadyVoted');
    }

    const pending = next.received[caller] || 0;
    const weight = BigInt(1 + pending);
    delete next.received[caller];
    next.voted[caller] = opt;
    next.tallies[opt] = (next.tallies[opt] || 0n) + weight;
    return next;
  }

  if (action.type === 'delegate') {
    const to = action.to.toLowerCase();
    if (to === '0x0000000000000000000000000000000000000000' || to === caller) {
      throw new Error('BadDelegate');
    }
    if (caller in next.voted) {
      throw new Error('AlreadyVoted');
    }
    if (next.delegate[caller]) {
      throw new Error(`AlreadyDelegated(${next.delegate[caller]})`);
    }
    if ((next.received[caller] || 0) > 0) {
      throw new Error('HoldsDelegations');
    }
    if (next.delegate[to]) {
      throw new Error('TargetDelegated');
    }

    next.delegate[caller] = to;

    if (to in next.voted) {
      const targetOpt = next.voted[to];
      next.tallies[targetOpt] = (next.tallies[targetOpt] || 0n) + 1n;
    } else {
      next.received[to] = (next.received[to] || 0) + 1;
    }
    return next;
  }

  if (action.type === 'reclaim') {
    const delegatee = next.delegate[caller];
    if (!delegatee) {
      throw new Error('NotDelegated');
    }
    delete next.delegate[caller];

    if (delegatee in next.voted) {
      const targetOpt = next.voted[delegatee];
      next.tallies[targetOpt] = next.tallies[targetOpt] - 1n;
    } else {
      const pending = next.received[delegatee] || 0;
      if (pending <= 1) {
        delete next.received[delegatee];
      } else {
        next.received[delegatee] = pending - 1;
      }
    }
    return next;
  }

  return next;
}

export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function share(tallies: bigint[]): number[] {
  const sum = tallies.reduce((acc, t) => acc + t, 0n);
  if (sum === 0n) {
    return tallies.map(() => 0);
  }
  return tallies.map((t) => Number((t * 10000n) / sum) / 100);
}

export interface VoterNode {
  address: string;
  votedOption: number | null; // null if hasn't voted yet (e.g. pending delegate)
  isDelegate: boolean;
  delegators: string[];
  weight: number;
}

export interface TreeLayoutOptionBin {
  optionIndex: number;
  optionLabel: string;
  tally: bigint;
  sharePercent: number;
  voters: VoterNode[];
}

export interface TreeLayoutResult {
  bins: TreeLayoutOptionBin[];
  unvotedDelegates: VoterNode[]; // delegates who have received votes but haven't voted yet
  standaloneDelegates: VoterNode[];
  totalVoters: number;
  totalDelegators: number;
}

export function treeLayout(
  options: string[],
  tallies: bigint[],
  votedMap: Record<string, number>,
  delegateMap: Record<string, string>,
  receivedMap: Record<string, number>
): TreeLayoutResult {
  // Find all delegators for each delegate
  const delegatorsByTarget: Record<string, string[]> = {};
  for (const [delegator, target] of Object.entries(delegateMap)) {
    if (!delegatorsByTarget[target]) {
      delegatorsByTarget[target] = [];
    }
    delegatorsByTarget[target].push(delegator);
  }

  // Group voters by option
  const bins: TreeLayoutOptionBin[] = options.map((label, idx) => {
    const tally = tallies[idx] || 0n;
    return {
      optionIndex: idx,
      optionLabel: label,
      tally,
      sharePercent: 0,
      voters: [],
    };
  });

  const shares = share(tallies);
  bins.forEach((b, i) => {
    b.sharePercent = shares[i] || 0;
  });

  const processedAddresses = new Set<string>();

  for (const [addr, optIndex] of Object.entries(votedMap)) {
    processedAddresses.add(addr);
    const delegators = delegatorsByTarget[addr] || [];
    const node: VoterNode = {
      address: addr,
      votedOption: optIndex,
      isDelegate: delegators.length > 0,
      delegators,
      weight: 1 + delegators.length,
    };
    if (bins[optIndex]) {
      bins[optIndex].voters.push(node);
    }
  }

  // Find delegates who have not voted yet but have delegators
  const unvotedDelegates: VoterNode[] = [];
  for (const [target, delegators] of Object.entries(delegatorsByTarget)) {
    if (!(target in votedMap)) {
      unvotedDelegates.push({
        address: target,
        votedOption: null,
        isDelegate: true,
        delegators,
        weight: delegators.length,
      });
      processedAddresses.add(target);
    }
  }

  const totalVoters = Object.keys(votedMap).length;
  const totalDelegators = Object.keys(delegateMap).length;

  return {
    bins,
    unvotedDelegates,
    standaloneDelegates: unvotedDelegates,
    totalVoters,
    totalDelegators,
  };
}
