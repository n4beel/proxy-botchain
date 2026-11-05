"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { PROXY_ABI } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { formatAddress } from "@/lib/proxy";

interface MyParticipation {
  pollId: bigint;
  question: string;
  options: string[];
  endsAt: bigint;
  isEnded: boolean;
  votedOption: number;
  delegatedTo: string;
  receivedCount: number;
}

export default function MyVotesPage() {
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const deployment = getDeployment(activeBotChain.id);
  const contractAddress = deployment.address;
  const isDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const [participations, setParticipations] = useState<MyParticipation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicClient || !isDeployed || !userAddress) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function fetchMyVotes() {
      try {
        const count = await publicClient!.readContract({
          address: contractAddress,
          abi: PROXY_ABI,
          functionName: "pollCount",
        });

        const total = Number(count);
        const myItems: MyParticipation[] = [];
        const now = BigInt(Math.floor(Date.now() / 1000));

        for (let i = total; i >= 1; i--) {
          const pollId = BigInt(i);
          const [pollData, options, standing] = await Promise.all([
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
              functionName: "standing",
              args: [pollId, userAddress!],
            }),
          ]);

          const hasVoted = standing[0] !== 255;
          const hasDelegated =
            standing[1] !== "0x0000000000000000000000000000000000000000";
          const holdsDelegations = standing[2] > 0;

          if (hasVoted || hasDelegated || holdsDelegations) {
            myItems.push({
              pollId,
              question: pollData.question,
              options: [...options],
              endsAt: pollData.endsAt,
              isEnded: now >= pollData.endsAt,
              votedOption: standing[0],
              delegatedTo: standing[1],
              receivedCount: standing[2],
            });
          }
        }

        if (isMounted) {
          setParticipations(myItems);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch my votes:", err);
        if (isMounted) setLoading(false);
      }
    }

    fetchMyVotes();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, userAddress]);

  if (!isConnected) {
    return (
      <PageShell
        title="My Activity"
        description="Track your direct votes, active delegations, and delegation weight across all polls."
      >
        <Panel variant="surface">
          <div className="py-16 text-center flex flex-col items-center gap-3">
            <p className="text-sm text-[var(--text-muted)] font-sans">
              Connect your wallet to inspect your votes and delegations across polls.
            </p>
          </div>
        </Panel>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="My Votes & Delegations"
      description={`Overview for ${formatAddress(userAddress || "")}: direct votes cast, delegations lent to others, and pending voting weight held.`}
    >
      <div className="flex flex-col gap-6">
        {loading ? (
          <Panel>
            <div className="py-16 text-center text-sm font-mono text-[var(--text-muted)] animate-pulse">
              Querying your standing across polls…
            </div>
          </Panel>
        ) : participations.length === 0 ? (
          <Panel>
            <div className="py-16 text-center flex flex-col items-center gap-3">
              <p className="text-sm text-[var(--text-muted)] font-sans">
                You haven't voted or delegated in any polls yet.
              </p>
              <Link href="/">
                <Button size="md">Explore Open Polls</Button>
              </Link>
            </div>
          </Panel>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {participations.map((item) => {
              const hasVoted = item.votedOption !== 255;
              const hasDelegated =
                item.delegatedTo !== "0x0000000000000000000000000000000000000000";

              return (
                <Link
                  key={item.pollId.toString()}
                  href={`/poll/${item.pollId}`}
                  className="group no-underline block"
                >
                  <Panel
                    variant="surface"
                    className="h-full hover:border-[var(--accent)] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-xs text-[var(--text-muted)]">
                        Poll #{item.pollId.toString()}
                      </span>
                      <span
                        className={`text-[11px] font-heading uppercase px-2 py-0.5 rounded font-bold ${
                          item.isEnded
                            ? "bg-[var(--bg-base)] text-[var(--text-muted)]"
                            : "bg-[var(--bg-elevated)] text-[var(--success)]"
                        }`}
                      >
                        {item.isEnded ? "Ended" : "Open"}
                      </span>
                    </div>

                    <h3 className="font-heading text-base font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors mb-3">
                      {item.question}
                    </h3>

                    <div className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-sans flex flex-col gap-1.5">
                      {hasVoted ? (
                        <div>
                          <span className="text-[var(--text-muted)] block text-[11px] uppercase font-heading">
                            Direct Vote Cast
                          </span>
                          <span className="text-[var(--text-primary)] font-bold">
                            {item.options[item.votedOption]}
                          </span>
                          {item.receivedCount > 0 && (
                            <span className="text-[var(--accent)] ml-2 font-mono">
                              (+{item.receivedCount} delegated votes)
                            </span>
                          )}
                        </div>
                      ) : hasDelegated ? (
                        <div>
                          <span className="text-[var(--text-muted)] block text-[11px] uppercase font-heading">
                            Delegated To
                          </span>
                          <span className="text-[var(--accent)] font-mono font-bold">
                            {formatAddress(item.delegatedTo)}
                          </span>
                        </div>
                      ) : item.receivedCount > 0 ? (
                        <div>
                          <span className="text-[var(--warning)] block text-[11px] uppercase font-heading">
                            Holds Delegations
                          </span>
                          <span className="text-[var(--text-primary)] font-mono font-bold">
                            {item.receivedCount} vote(s) awaiting your decision
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </Panel>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
