"use client";

import { useState } from "react";
import { formatAddress, type TreeLayoutResult } from "@/lib/proxy";
import Button from "@/components/ui/Button";

interface DelegationTreeProps {
  layout: TreeLayoutResult;
  userAddress?: string;
  onSelectDelegate?: (address: string) => void;
}

export default function DelegationTree({
  layout,
  userAddress,
  onSelectDelegate,
}: DelegationTreeProps) {
  const [viewMode, setViewMode] = useState<"tree" | "table">("tree");
  const normalizedUser = userAddress?.toLowerCase();

  const totalTallies = layout.bins.reduce((sum, b) => sum + Number(b.tally), 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Header controls & Mode toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xs font-mono text-[var(--text-muted)]">
          <span>{layout.totalVoters} voter{layout.totalVoters === 1 ? "" : "s"}</span>
          <span>•</span>
          <span>{layout.totalDelegators} delegator{layout.totalDelegators === 1 ? "" : "s"}</span>
          <span>•</span>
          <span>{totalTallies} total weight</span>
        </div>

        <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-1 rounded border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setViewMode("tree")}
            className={`px-2.5 py-1 text-xs font-heading uppercase tracking-wider rounded ${
              viewMode === "tree"
                ? "bg-[var(--bg-elevated)] text-[var(--accent)] font-bold"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
            aria-pressed={viewMode === "tree"}
          >
            Tree View
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`px-2.5 py-1 text-xs font-heading uppercase tracking-wider rounded ${
              viewMode === "table"
                ? "bg-[var(--bg-elevated)] text-[var(--accent)] font-bold"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
            aria-pressed={viewMode === "table"}
          >
            Table View
          </button>
        </div>
      </div>

      {viewMode === "table" ? (
        /* Accessible Table Equivalent (Spec §8.3) */
        <div className="overflow-x-auto rounded border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <table className="w-full text-left text-xs font-sans">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)] font-heading uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Wallet</th>
                <th className="py-2.5 px-3">Status / Role</th>
                <th className="py-2.5 px-3">Option</th>
                <th className="py-2.5 px-3">Delegated To</th>
                <th className="py-2.5 px-3 text-right">Weight</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
              {/* Voted wallets & their delegators */}
              {layout.bins.flatMap((bin) =>
                bin.voters.flatMap((voter) => [
                  <tr
                    key={voter.address}
                    className={voter.address === normalizedUser ? "bg-[var(--bg-elevated)]/60" : ""}
                  >
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-[var(--text-primary)]">
                        {formatAddress(voter.address)}
                      </span>
                      {voter.address === normalizedUser && (
                        <span className="ml-2 text-[10px] text-[var(--accent)] font-heading uppercase px-1.5 py-0.5 rounded bg-[var(--bg-base)]">
                          You
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-muted)] font-sans">
                      {voter.isDelegate ? `Delegate (${voter.delegators.length} delegators)` : "Direct Voter"}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-primary)] font-sans font-medium">
                      {bin.optionLabel}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text-tertiary)]">—</td>
                    <td className="py-2.5 px-3 text-right font-bold text-[var(--accent)]">
                      {voter.weight}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {onSelectDelegate && voter.address !== normalizedUser && (
                        <button
                          type="button"
                          onClick={() => onSelectDelegate(voter.address)}
                          className="text-[11px] font-heading uppercase text-[var(--accent)] hover:underline"
                        >
                          Delegate
                        </button>
                      )}
                    </td>
                  </tr>,
                  ...voter.delegators.map((delAddr) => (
                    <tr
                      key={`${voter.address}-${delAddr}`}
                      className={`text-[var(--text-muted)] bg-[var(--bg-base)]/30 ${
                        delAddr === normalizedUser ? "bg-[var(--bg-elevated)]/40" : ""
                      }`}
                    >
                      <td className="py-2 px-3 pl-8">
                        ↳ {formatAddress(delAddr)}
                        {delAddr === normalizedUser && (
                          <span className="ml-2 text-[10px] text-[var(--accent)] font-heading uppercase px-1 py-0.2 rounded bg-[var(--bg-base)]">
                            You
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-sans">Delegator</td>
                      <td className="py-2 px-3 font-sans">{bin.optionLabel} (via delegate)</td>
                      <td className="py-2 px-3">{formatAddress(voter.address)}</td>
                      <td className="py-2 px-3 text-right">1</td>
                      <td className="py-2 px-3 text-right">—</td>
                    </tr>
                  )),
                ])
              )}

              {/* Unvoted delegates */}
              {layout.unvotedDelegates.map((ud) => (
                <tr key={ud.address} className="bg-[var(--bg-overlay)]/40">
                  <td className="py-2.5 px-3">
                    <span className="text-[var(--text-primary)]">{formatAddress(ud.address)}</span>
                    {ud.address === normalizedUser && (
                      <span className="ml-2 text-[10px] text-[var(--accent)] font-heading uppercase px-1.5 py-0.5 rounded bg-[var(--bg-base)]">
                        You
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-[var(--warning)] font-sans">
                    Pending Delegate ({ud.delegators.length} pending)
                  </td>
                  <td className="py-2.5 px-3 text-[var(--text-muted)] font-sans italic">Not yet voted</td>
                  <td className="py-2.5 px-3 text-[var(--text-tertiary)]">—</td>
                  <td className="py-2.5 px-3 text-right text-[var(--warning)]">{ud.weight}</td>
                  <td className="py-2.5 px-3 text-right">
                    {onSelectDelegate && ud.address !== normalizedUser && (
                      <button
                        type="button"
                        onClick={() => onSelectDelegate(ud.address)}
                        className="text-[11px] font-heading uppercase text-[var(--accent)] hover:underline"
                      >
                        Delegate
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {layout.totalVoters === 0 && layout.totalDelegators === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--text-muted)] font-sans">
                    No votes or delegations recorded yet in this poll.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* SVG Interactive Tree Layout (Spec §3.1, §8.3, §8.4) */
        <div className="relative rounded border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 flex flex-col items-center">
          {/* Unvoted Delegates Bar (if any) */}
          {layout.unvotedDelegates.length > 0 && (
            <div className="w-full mb-6 p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs">
              <span className="font-heading uppercase tracking-wider text-[var(--warning)] font-bold block mb-1.5">
                Pending Delegates (Not Voted Yet)
              </span>
              <div className="flex flex-wrap gap-2">
                {layout.unvotedDelegates.map((ud) => (
                  <div
                    key={ud.address}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--bg-base)] border border-[var(--border-default)] font-mono text-[11px]"
                  >
                    <span>{formatAddress(ud.address)}</span>
                    <span className="text-[var(--warning)] font-bold">({ud.weight} held)</span>
                    {onSelectDelegate && ud.address !== normalizedUser && (
                      <button
                        type="button"
                        onClick={() => onSelectDelegate(ud.address)}
                        className="text-[10px] uppercase font-heading text-[var(--accent)] hover:underline ml-1"
                      >
                        Select
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SVG Tree Canvas */}
          <div className="w-full overflow-x-auto min-h-[340px] flex justify-center">
            <svg
              viewBox="0 0 800 360"
              className="w-full max-w-[800px] h-[360px] select-none"
              aria-label="Interactive delegation tree diagram"
            >
              <defs>
                <linearGradient id="binGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="var(--bg-elevated)" />
                  <stop offset="100%" stopColor="var(--bg-overlay)" />
                </linearGradient>
              </defs>

              {/* Render Option Bins at the bottom */}
              {layout.bins.map((bin, i) => {
                const binWidth = 720 / layout.bins.length - 20;
                const binX = 40 + i * (binWidth + 20);
                const binY = 240;
                const binHeight = 100;
                const voters = bin.voters;
                const colCenter = binX + binWidth / 2;

                return (
                  <g key={`bin-${bin.optionIndex}`}>
                    {/* Bin Box */}
                    <rect
                      x={binX}
                      y={binY}
                      width={binWidth}
                      height={binHeight}
                      rx="6"
                      fill="url(#binGradient)"
                      stroke="var(--border-default)"
                      strokeWidth="1.5"
                    />

                    {/* Bin Label & Tally */}
                    <text
                      x={colCenter}
                      y={binY + 30}
                      textAnchor="middle"
                      fill="var(--text-primary)"
                      fontSize="14"
                      fontWeight="bold"
                      fontFamily="var(--font-heading)"
                    >
                      {bin.optionLabel}
                    </text>

                    <text
                      x={colCenter}
                      y={binY + 54}
                      textAnchor="middle"
                      fill="var(--accent)"
                      fontSize="18"
                      fontWeight="bold"
                      fontFamily="var(--font-mono)"
                    >
                      {bin.tally.toString()}
                    </text>

                    <text
                      x={colCenter}
                      y={binY + 76}
                      textAnchor="middle"
                      fill="var(--text-muted)"
                      fontSize="11"
                      fontFamily="var(--font-mono)"
                    >
                      {bin.sharePercent}%
                    </text>

                    {/* Voters sitting above or on their bin */}
                    {voters.map((voter, vIdx) => {
                      const voterSpacing = Math.min(60, (binWidth - 40) / Math.max(1, voters.length - 1));
                      const voterX =
                        voters.length === 1
                          ? colCenter
                          : binX + 20 + vIdx * voterSpacing;
                      const voterY = 170;

                      return (
                        <g key={`voter-${voter.address}`}>
                          {/* Connection line from voter to bin */}
                          <line
                            x1={voterX}
                            y1={voterY + 12}
                            x2={colCenter}
                            y2={binY}
                            stroke="var(--border-subtle)"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                          />

                          {/* Delegators satellites above delegate voter */}
                          {voter.delegators.map((delAddr, dIdx) => {
                            const delCount = voter.delegators.length;
                            const delAngle =
                              delCount === 1
                                ? -Math.PI / 2
                                : -Math.PI + (Math.PI / (delCount + 1)) * (dIdx + 1);
                            const delDist = 48;
                            const delX = voterX + Math.cos(delAngle) * delDist;
                            const delY = voterY + Math.sin(delAngle) * delDist;

                            const isUserDel = delAddr === normalizedUser;

                            return (
                              <g key={`del-${voter.address}-${delAddr}`}>
                                {/* Animated line from delegator satellite to delegate */}
                                <line
                                  x1={delX}
                                  y1={delY}
                                  x2={voterX}
                                  y2={voterY}
                                  stroke={isUserDel ? "var(--accent)" : "var(--border-default)"}
                                  strokeWidth="1.5"
                                  strokeDasharray="4 2"
                                  className="animate-dash-flow"
                                />

                                {/* Delegator Satellite Circle */}
                                <circle
                                  cx={delX}
                                  cy={delY}
                                  r="9"
                                  fill={isUserDel ? "var(--accent)" : "var(--bg-elevated)"}
                                  stroke={isUserDel ? "var(--accent-ink)" : "var(--border-default)"}
                                  strokeWidth="1.5"
                                />

                                <title>{`Delegator: ${delAddr}`}</title>
                              </g>
                            );
                          })}

                          {/* Voter Node Circle (larger if delegate) */}
                          {(() => {
                            const isUserVoter = voter.address === normalizedUser;
                            const radius = voter.isDelegate ? 15 : 12;

                            return (
                              <g>
                                <circle
                                  cx={voterX}
                                  cy={voterY}
                                  r={radius}
                                  fill={
                                    isUserVoter
                                      ? "var(--accent)"
                                      : voter.isDelegate
                                      ? "var(--bg-overlay)"
                                      : "var(--bg-elevated)"
                                  }
                                  stroke={
                                    isUserVoter
                                      ? "var(--accent-ink)"
                                      : voter.isDelegate
                                      ? "var(--accent)"
                                      : "var(--border-strong)"
                                  }
                                  strokeWidth="2"
                                  className="cursor-pointer"
                                  onClick={() => onSelectDelegate?.(voter.address)}
                                />

                                <text
                                  x={voterX}
                                  y={voterY + 4}
                                  textAnchor="middle"
                                  fontSize="10"
                                  fontWeight="bold"
                                  fill={isUserVoter ? "var(--accent-ink)" : "var(--text-primary)"}
                                  fontFamily="var(--font-mono)"
                                  pointerEvents="none"
                                >
                                  {voter.weight}
                                </text>

                                <text
                                  x={voterX}
                                  y={voterY + 28}
                                  textAnchor="middle"
                                  fontSize="10"
                                  fill="var(--text-muted)"
                                  fontFamily="var(--font-mono)"
                                  pointerEvents="none"
                                >
                                  {formatAddress(voter.address)}
                                </text>

                                <title>{`Voter: ${voter.address} (Weight: ${voter.weight})`}</title>
                              </g>
                            );
                          })()}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-4 pt-3 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)] font-sans">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)]" />
              <span>Direct Voter</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-[var(--accent)] bg-[var(--bg-overlay)]" />
              <span>Delegate (Holds Votes)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)]" />
              <span>Delegator Satellite</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-[var(--accent)]" />
              <span>Your Wallet</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
