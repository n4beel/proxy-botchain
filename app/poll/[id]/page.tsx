"use client";

import { use, useEffect, useState, useMemo } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { isAddress } from "viem";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import DelegationTree from "@/components/tree/DelegationTree";
import { PROXY_ABI } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { useWriteContract } from "@/lib/useChainWrite";
import { useToast } from "@/components/ui/Toast";
import { formatAddress, treeLayout, share } from "@/lib/proxy";
import { formatProxyError } from "@/lib/errors";

interface PollData {
  asker: string;
  endsAt: bigint;
  optionCount: number;
  question: string;
}

interface StandingData {
  votedOption: number; // 255 if not voted
  delegatedTo: string;
  received: number;
}

export default function PollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const pollId = BigInt(id);

  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const deployment = getDeployment(activeBotChain.id);
  const contractAddress = deployment.address;
  const isDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();

  const [poll, setPoll] = useState<PollData | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [tallies, setTallies] = useState<bigint[]>([]);
  const [standing, setStanding] = useState<StandingData | null>(null);
  const [leaderInfo, setLeaderInfo] = useState<{ option: number; tied: boolean } | null>(null);
  const [votedMap, setVotedMap] = useState<Record<string, number>>({});
  const [delegateMap, setDelegateMap] = useState<Record<string, string>>({});
  const [receivedMap, setReceivedMap] = useState<Record<string, number>>({});

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [customDelegateAddr, setCustomDelegateAddr] = useState("");
  const [activeTab, setActiveTab] = useState<"vote" | "delegate" | "reclaim">("vote");
  const [loading, setLoading] = useState(true);
  const [isWriting, setIsWriting] = useState(false);

  async function refreshPollData() {
    if (!publicClient || !isDeployed) return;

    try {
      const [pData, opts, tVals, lead] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: PROXY_ABI,
          functionName: "pollOf",
          args: [pollId],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: PROXY_ABI,
          functionName: "optionsOf",
          args: [pollId],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: PROXY_ABI,
          functionName: "tallies",
          args: [pollId],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: PROXY_ABI,
          functionName: "leader",
          args: [pollId],
        }),
      ]);

      setPoll({
        asker: pData.asker,
        endsAt: pData.endsAt,
        optionCount: pData.optionCount,
        question: pData.question,
      });
      setOptions([...opts]);
      setTallies([...tVals]);
      setLeaderInfo({ option: lead[0], tied: lead[1] });

      // Load user standing if connected
      if (userAddress) {
        const uStanding = await publicClient.readContract({
          address: contractAddress,
          abi: PROXY_ABI,
          functionName: "standing",
          args: [pollId, userAddress],
        });
        setStanding({
          votedOption: uStanding[0],
          delegatedTo: uStanding[1],
          received: uStanding[2],
        });
      }

      // Rebuild tree from events from deploy block
      const currentBlock = await publicClient.getBlockNumber();
      const fromBlock = currentBlock > 50000n ? currentBlock - 50000n : 0n;

      const [votedLogs, delegatedLogs, reclaimedLogs] = await Promise.all([
        publicClient.getLogs({
          address: contractAddress,
          event: {
            type: "event",
            name: "Voted",
            inputs: [
              { indexed: true, name: "id", type: "uint256" },
              { indexed: true, name: "who", type: "address" },
              { indexed: false, name: "option", type: "uint8" },
              { indexed: false, name: "weight", type: "uint256" },
            ],
          },
          args: { id: pollId },
          fromBlock,
        }),
        publicClient.getLogs({
          address: contractAddress,
          event: {
            type: "event",
            name: "Delegated",
            inputs: [
              { indexed: true, name: "id", type: "uint256" },
              { indexed: true, name: "from", type: "address" },
              { indexed: true, name: "to", type: "address" },
              { indexed: false, name: "counted", type: "bool" },
            ],
          },
          args: { id: pollId },
          fromBlock,
        }),
        publicClient.getLogs({
          address: contractAddress,
          event: {
            type: "event",
            name: "Reclaimed",
            inputs: [
              { indexed: true, name: "id", type: "uint256" },
              { indexed: true, name: "from", type: "address" },
              { indexed: true, name: "to", type: "address" },
            ],
          },
          args: { id: pollId },
          fromBlock,
        }),
      ]);

      const vMap: Record<string, number> = {};
      const dMap: Record<string, string> = {};
      const rMap: Record<string, number> = {};

      for (const log of votedLogs) {
        if (log.args && log.args.who && log.args.option !== undefined) {
          vMap[log.args.who.toLowerCase()] = log.args.option;
        }
      }

      for (const log of delegatedLogs) {
        if (log.args && log.args.from && log.args.to) {
          const from = log.args.from.toLowerCase();
          const to = log.args.to.toLowerCase();
          dMap[from] = to;
        }
      }

      for (const log of reclaimedLogs) {
        if (log.args && log.args.from) {
          delete dMap[log.args.from.toLowerCase()];
        }
      }

      setVotedMap(vMap);
      setDelegateMap(dMap);
      setReceivedMap(rMap);
    } catch (err) {
      console.error("Error refreshing poll:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;
    if (publicClient && isDeployed) {
      refreshPollData();
    } else {
      setLoading(false);
    }
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, userAddress, pollId]);

  const treeData = useMemo(() => {
    return treeLayout(options, tallies, votedMap, delegateMap, receivedMap);
  }, [options, tallies, votedMap, delegateMap, receivedMap]);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const isEnded = poll ? now >= poll.endsAt : false;

  const hasVoted = Boolean(standing && standing.votedOption !== 255);
  const hasDelegated = Boolean(
    standing &&
    standing.delegatedTo &&
    standing.delegatedTo !== "0x0000000000000000000000000000000000000000"
  );
  const holdsDelegations = Boolean(standing && standing.received > 0);

  const shares = share(tallies);

  const handleVote = async () => {
    if (selectedOption === null || !isDeployed) return;
    try {
      setIsWriting(true);
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: PROXY_ABI,
        functionName: "vote",
        args: [pollId, selectedOption],
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      toast("success", "Vote Cast", `Voted for ${options[selectedOption]}`);
      await refreshPollData();
    } catch (err) {
      toast("error", "Failed to vote", formatProxyError(err));
    } finally {
      setIsWriting(false);
    }
  };

  const handleDelegate = async (target?: string) => {
    const to = target || customDelegateAddr;
    if (!to || !isAddress(to) || !isDeployed) return;
    try {
      setIsWriting(true);
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: PROXY_ABI,
        functionName: "delegate",
        args: [pollId, to as `0x${string}`],
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setCustomDelegateAddr("");
      toast("success", "Vote Delegated", `Lent vote to ${to}`);
      await refreshPollData();
    } catch (err) {
      toast("error", "Failed to delegate", formatProxyError(err));
    } finally {
      setIsWriting(false);
    }
  };

  const handleReclaim = async () => {
    if (!isDeployed) return;
    try {
      setIsWriting(true);
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: PROXY_ABI,
        functionName: "reclaim",
        args: [pollId],
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      toast("success", "Vote Reclaimed", "You have taken your vote back");
      await refreshPollData();
    } catch (err) {
      toast("error", "Failed to reclaim", formatProxyError(err));
    } finally {
      setIsWriting(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Loading Poll...">
        <Panel>
          <div className="py-16 text-center text-sm font-mono text-[var(--text-muted)] animate-pulse">
            Loading poll details and building delegation tree…
          </div>
        </Panel>
      </PageShell>
    );
  }

  if (!poll) {
    return (
      <PageShell title="Poll Not Found">
        <Panel>
          <div className="py-16 text-center flex flex-col items-center gap-3">
            <p className="text-sm text-[var(--text-muted)] font-sans">
              Could not find poll #{pollId.toString()} on this contract.
            </p>
          </div>
        </Panel>
      </PageShell>
    );
  }

  const delegatee = standing?.delegatedTo?.toLowerCase();
  const delegateeVoted = delegatee && delegatee in votedMap;

  return (
    <PageShell
      title={`Poll #${pollId.toString()}: ${poll.question}`}
      description={
        isEnded
          ? "This poll has concluded. No more votes or delegations can be made."
          : `Open until ${new Date(Number(poll.endsAt) * 1000).toLocaleString()}. Take back or delegate anytime before it ends.`
      }
    >
      <div className="flex flex-col gap-6">
        {/* Status & Outcome Banner */}
        {isEnded && leaderInfo && (
          <Panel
            variant="elevated"
            className="border-l-4 border-l-[var(--accent)]"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-heading uppercase tracking-wider text-[var(--text-muted)] block">
                  Poll Result
                </span>
                <span className="font-heading text-lg font-bold text-[var(--accent)]">
                  {leaderInfo.tied
                    ? "Result: Tied outcome"
                    : `Winner: ${options[leaderInfo.option]} (${tallies[leaderInfo.option]?.toString()} weight)`}
                </span>
              </div>
              <span className="text-xs font-mono text-[var(--text-muted)]">
                Closed at {new Date(Number(poll.endsAt) * 1000).toLocaleTimeString()}
              </span>
            </div>
          </Panel>
        )}

        {/* User Standing Banner (Spec §3.3) */}
        {isConnected && standing && (
          <Panel variant="subtle" className="text-xs font-sans">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="font-heading uppercase tracking-wider font-bold text-[var(--text-primary)] block mb-0.5">
                  Your Current Standing
                </span>
                {hasVoted ? (
                  <p className="text-[var(--success)] font-medium">
                    You voted for <span className="font-bold underline">{options[standing.votedOption]}</span>.
                    {standing.received > 0 && ` (You cast ${standing.received + 1} votes with delegations)`}
                  </p>
                ) : hasDelegated ? (
                  <p className="text-[var(--accent)] font-medium">
                    Your vote will count for whatever {formatAddress(standing.delegatedTo)} votes.{" "}
                    {delegateeVoted
                      ? `They have voted for ${options[votedMap[delegatee!]]}.`
                      : "They have not voted yet."}{" "}
                    You can take it back until {new Date(Number(poll.endsAt) * 1000).toLocaleTimeString()}.
                  </p>
                ) : holdsDelegations ? (
                  <p className="text-[var(--warning)] font-medium">
                    You hold {standing.received} delegation(s) from other wallets. You cannot delegate onward — you can only vote directly.
                  </p>
                ) : (
                  <p className="text-[var(--text-muted)]">
                    You have not voted or delegated yet in this poll.
                  </p>
                )}
              </div>

              {hasDelegated && !isEnded && (
                <Button
                  size="sm"
                  variant="action"
                  onClick={handleReclaim}
                  loading={isWriting}
                >
                  Take Vote Back
                </Button>
              )}
            </div>
          </Panel>
        )}

        {/* Delegation Tree Visualizer */}
        <Panel
          title="Delegation Tree & Option Bins"
          subtitle="Wallets sit on their voted option bin. Satellite dots represent delegators whose votes flow to their chosen delegate."
        >
          <DelegationTree
            layout={treeData}
            userAddress={userAddress}
            onSelectDelegate={(addr) => {
              setCustomDelegateAddr(addr);
              setActiveTab("delegate");
            }}
          />
        </Panel>

        {/* Action Panel (Spec §3.1: Vote, Hand my vote to..., Take it back) */}
        {!isEnded && isConnected && (
          <Panel
            title="Cast or Delegate Your Vote"
            subtitle="Participate directly or lend your weight to another trusted wallet."
          >
            <div className="flex flex-col gap-6">
              {/* Action Tabs */}
              <div className="flex border-b border-[var(--border-subtle)] gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("vote")}
                  disabled={hasDelegated}
                  className={`pb-2.5 px-3 text-xs font-heading uppercase tracking-wider font-bold border-b-2 transition-colors ${
                    activeTab === "vote"
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  1. Vote Directly
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("delegate")}
                  disabled={hasVoted || holdsDelegations}
                  className={`pb-2.5 px-3 text-xs font-heading uppercase tracking-wider font-bold border-b-2 transition-colors ${
                    activeTab === "delegate"
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  2. Hand My Vote To…
                </button>
                {hasDelegated && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("reclaim")}
                    className={`pb-2.5 px-3 text-xs font-heading uppercase tracking-wider font-bold border-b-2 transition-colors ${
                      activeTab === "reclaim"
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    3. Take It Back
                  </button>
                )}
              </div>

              {/* Tab 1: Vote Directly */}
              {activeTab === "vote" && (
                <div className="flex flex-col gap-4">
                  {hasVoted ? (
                    <div className="p-4 rounded bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
                      You have already voted for{" "}
                      <strong className="text-[var(--text-primary)]">
                        {options[standing!.votedOption]}
                      </strong>
                      . Votes are final once cast.
                    </div>
                  ) : hasDelegated ? (
                    <div className="p-4 rounded bg-[var(--bg-elevated)] text-xs text-[var(--warning)]">
                      You handed your vote to {formatAddress(standing!.delegatedTo)}. Take it back first to vote directly.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {options.map((opt, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedOption(idx)}
                            className={`p-3 text-left rounded border transition-all ${
                              selectedOption === idx
                                ? "bg-[var(--bg-elevated)] border-[var(--accent)] text-[var(--text-primary)] shadow-sm"
                                : "bg-[var(--bg-surface)] border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                            }`}
                          >
                            <span className="block font-mono text-[10px] text-[var(--text-muted)] uppercase mb-1">
                              Option #{idx + 1}
                            </span>
                            <span className="font-heading text-sm font-bold text-[var(--text-primary)]">
                              {opt}
                            </span>
                            <span className="block font-mono text-xs text-[var(--accent)] mt-1">
                              {tallies[idx]?.toString() || "0"} votes ({shares[idx] || 0}%)
                            </span>
                          </button>
                        ))}
                      </div>

                      <Button
                        size="md"
                        disabled={selectedOption === null || isWriting}
                        loading={isWriting}
                        onClick={handleVote}
                      >
                        Submit Vote {standing && standing.received > 0 ? `(Weight: ${standing.received + 1})` : ""}
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Tab 2: Hand My Vote To... */}
              {activeTab === "delegate" && (
                <div className="flex flex-col gap-4">
                  {holdsDelegations ? (
                    <div className="p-4 rounded bg-[var(--bg-elevated)] text-xs text-[var(--warning)]">
                      Others have handed you their votes; you can only vote. (Single-hop delegation rule)
                    </div>
                  ) : hasVoted ? (
                    <div className="p-4 rounded bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
                      You have already voted directly. You cannot delegate in this poll.
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor="delegate-address"
                          className="font-heading text-xs uppercase tracking-wider font-bold text-[var(--text-primary)]"
                        >
                          Delegate Wallet Address
                        </label>
                        <input
                          id="delegate-address"
                          type="text"
                          value={customDelegateAddr}
                          onChange={(e) => setCustomDelegateAddr(e.target.value)}
                          placeholder="0x…"
                          className="w-full px-3.5 py-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono text-xs"
                        />
                        <span className="text-[11px] text-[var(--text-muted)] font-sans">
                          Paste any address, or pick from the active participants below.
                        </span>
                      </div>

                      {/* Short list of wallets that already voted / participated */}
                      <div className="flex flex-col gap-2">
                        <span className="font-heading text-xs uppercase tracking-wider text-[var(--text-muted)]">
                          Active Voters (Ready to receive weight)
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {Object.keys(votedMap).map((addr) => {
                            if (addr === userAddress?.toLowerCase()) return null;
                            return (
                              <button
                                key={addr}
                                type="button"
                                onClick={() => setCustomDelegateAddr(addr)}
                                className="px-2.5 py-1 text-xs font-mono rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                              >
                                {formatAddress(addr)} ({options[votedMap[addr]]})
                              </button>
                            );
                          })}
                          {Object.keys(votedMap).length === 0 && (
                            <span className="text-xs text-[var(--text-tertiary)] italic">
                              No voters have cast votes yet.
                            </span>
                          )}
                        </div>
                      </div>

                      <Button
                        size="md"
                        disabled={!isAddress(customDelegateAddr) || isWriting}
                        loading={isWriting}
                        onClick={() => handleDelegate()}
                      >
                        Hand Over Vote
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Tab 3: Take It Back */}
              {activeTab === "reclaim" && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-[var(--text-muted)] font-sans">
                    You currently have your vote delegated to{" "}
                    <strong className="text-[var(--text-primary)] font-mono">
                      {standing?.delegatedTo}
                    </strong>
                    . Taking your vote back will immediately remove your weight from their tally or pending count. You can then vote yourself or choose another delegate.
                  </p>
                  <Button
                    size="md"
                    variant="action"
                    disabled={!hasDelegated || isWriting}
                    loading={isWriting}
                    onClick={handleReclaim}
                  >
                    Take Back My Vote
                  </Button>
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
