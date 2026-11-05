"use client";

import Link from "next/link";
import { usePublicClient, useAccount } from "wagmi";
import { useEffect, useState } from "react";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { PROXY_ABI } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { share } from "@/lib/proxy";

interface PollSummary {
  id: bigint;
  question: string;
  options: string[];
  endsAt: bigint;
  tallies: bigint[];
  isEnded: boolean;
  totalVotes: bigint;
}

export default function HomePage() {
  const { isConnected } = useAccount();
  const deployment = getDeployment(activeBotChain.id);
  const contractAddress = deployment.address;
  const isDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const publicClient = usePublicClient({ chainId: activeBotChain.id });

  const [polls, setPolls] = useState<PollSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicClient || !isDeployed) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadPolls() {
      try {
        const count = await publicClient!.readContract({
          address: contractAddress,
          abi: PROXY_ABI,
          functionName: "pollCount",
        });

        const total = Number(count);
        if (total === 0) {
          if (isMounted) {
            setPolls([]);
            setLoading(false);
          }
          return;
        }

        const now = BigInt(Math.floor(Date.now() / 1000));
        const list: PollSummary[] = [];

        // Read up to 20 latest polls
        const limit = Math.min(total, 20);
        for (let i = total; i > total - limit; i--) {
          const pollId = BigInt(i);
          const [pollData, options, tallies] = await Promise.all([
            publicClient!.readContract({
              address: contractAddress,
              abi: PROXY_ABI,
              functionName: "pollOf",
              args: [pollId],
            }),
            publicClient!.readContract({
              address: contractAddress,
              abi: PROXY_ABI,
              functionName: "optionsOf",
              args: [pollId],
            }),
            publicClient!.readContract({
              address: contractAddress,
              abi: PROXY_ABI,
              functionName: "tallies",
              args: [pollId],
            }),
          ]);

          const totalVotes = (tallies as bigint[]).reduce((a, b) => a + b, 0n);
          list.push({
            id: pollId,
            question: pollData.question,
            options: [...options],
            endsAt: pollData.endsAt,
            tallies: [...tallies],
            isEnded: now >= pollData.endsAt,
            totalVotes,
          });
        }

        if (isMounted) {
          setPolls(list);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load polls:", err);
        if (isMounted) setLoading(false);
      }
    }

    loadPolls();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress]);

  const openPolls = polls.filter((p) => !p.isEnded);
  const endedPolls = polls.filter((p) => p.isEnded);

  return (
    <PageShell
      title="Delegated Decision Pools"
      description="Vote yourself, or hand your vote to someone. Every delegation is traceable and single-hop."
    >
      <div className="flex flex-col gap-8">
        {/* Limits & Capabilities Panel (Spec §1, §3.4) */}
        <Panel
          variant="subtle"
          title="What a vote is here"
          subtitle="Foundational guarantees and limitations of proxy voting"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans text-[var(--text-muted)]">
            <div className="p-3 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <strong className="block text-[var(--text-primary)] font-heading uppercase tracking-wider mb-1">
                One wallet is one vote
              </strong>
              This counts wallets, not people. Anyone can create multiple wallets; this measures participating addresses.
            </div>
            <div className="p-3 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <strong className="block text-[var(--text-primary)] font-heading uppercase tracking-wider mb-1">
                Revocable Delegation
              </strong>
              Your delegate can vote against what you'd choose. You can take your vote back before the poll ends.
            </div>
            <div className="p-3 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <strong className="block text-[var(--text-primary)] font-heading uppercase tracking-wider mb-1">
                Pure Signal
              </strong>
              The result is a signal. Nothing is executed automatically on chain.
            </div>
          </div>
        </Panel>

        {/* Action Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold uppercase tracking-wide text-[var(--text-primary)]">
            Active Polls
          </h2>
          <Link href="/new">
            <Button size="sm">Create Poll</Button>
          </Link>
        </div>

        {/* Loading / Empty States */}
        {loading ? (
          <Panel>
            <div className="py-12 text-center text-sm text-[var(--text-muted)] font-mono animate-pulse">
              Loading active polls from chain…
            </div>
          </Panel>
        ) : !isDeployed ? (
          <Panel>
            <div className="py-12 text-center text-sm text-[var(--warning)] font-sans">
              Proxy contract is not yet deployed on this network.
            </div>
          </Panel>
        ) : openPolls.length === 0 && endedPolls.length === 0 ? (
          <Panel>
            <div className="py-12 text-center flex flex-col items-center gap-3">
              <p className="text-sm text-[var(--text-muted)] font-sans">
                No polls have been created yet. Be the first to start a question!
              </p>
              <Link href="/new">
                <Button size="md">Create the First Poll</Button>
              </Link>
            </div>
          </Panel>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Open Polls: Branch Diagrams / Mini Trees (Spec §3.1) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {openPolls.map((poll) => {
                const shares = share(poll.tallies);
                return (
                  <Link
                    key={poll.id.toString()}
                    href={`/poll/${poll.id}`}
                    className="group no-underline block"
                  >
                    <Panel
                      className="h-full hover:border-[var(--accent)] transition-colors cursor-pointer"
                      variant="surface"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="font-mono text-xs text-[var(--text-muted)]">
                          Poll #{poll.id.toString()}
                        </span>
                        <span className="text-[11px] font-heading uppercase px-2 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--success)] font-bold">
                          Open
                        </span>
                      </div>

                      <h3 className="font-heading text-base font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors mb-3 line-clamp-2">
                        {poll.question}
                      </h3>

                      {/* Mini Tree / Branch Diagram */}
                      <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex flex-col gap-2">
                        <div className="text-[11px] font-mono text-[var(--text-muted)] flex justify-between">
                          <span>{poll.totalVotes.toString()} total weight</span>
                          <span>{poll.options.length} options</span>
                        </div>

                        {/* Options Stack */}
                        <div className="flex flex-col gap-1.5 mt-1">
                          {poll.options.map((opt, idx) => {
                            const percent = shares[idx] || 0;
                            return (
                              <div key={idx} className="flex flex-col gap-1">
                                <div className="flex justify-between text-xs font-sans">
                                  <span className="truncate max-w-[70%] text-[var(--text-primary)]">
                                    {opt}
                                  </span>
                                  <span className="font-mono text-[var(--text-muted)]">
                                    {poll.tallies[idx]?.toString() || "0"} ({percent}%)
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-[var(--bg-base)] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[var(--accent)] transition-all"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </Panel>
                  </Link>
                );
              })}
            </div>

            {/* Ended Polls Section */}
            {endedPolls.length > 0 && (
              <div className="mt-8 flex flex-col gap-4">
                <h3 className="font-heading text-lg font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Completed Polls
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {endedPolls.map((poll) => {
                    const shares = share(poll.tallies);
                    return (
                      <Link
                        key={poll.id.toString()}
                        href={`/poll/${poll.id}`}
                        className="group no-underline block opacity-85 hover:opacity-100 transition-opacity"
                      >
                        <Panel className="h-full hover:border-[var(--border-strong)] transition-colors">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="font-mono text-xs text-[var(--text-muted)]">
                              Poll #{poll.id.toString()}
                            </span>
                            <span className="text-[11px] font-heading uppercase px-2 py-0.5 rounded bg-[var(--bg-base)] text-[var(--text-muted)] font-bold">
                              Ended
                            </span>
                          </div>

                          <h4 className="font-heading text-base font-bold text-[var(--text-primary)] mb-2">
                            {poll.question}
                          </h4>

                          <div className="flex flex-col gap-1.5 mt-3">
                            {poll.options.map((opt, idx) => (
                              <div key={idx} className="flex justify-between text-xs font-sans">
                                <span className="truncate max-w-[70%] text-[var(--text-muted)]">
                                  {opt}
                                </span>
                                <span className="font-mono text-[var(--text-primary)] font-bold">
                                  {poll.tallies[idx]?.toString() || "0"} ({shares[idx] || 0}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        </Panel>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
