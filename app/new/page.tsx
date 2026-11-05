"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { useWriteContract } from "@/lib/useChainWrite";
import { useToast } from "@/components/ui/Toast";
import { PROXY_ABI } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import {
  MAX_QUESTION_BYTES,
  MAX_OPTION_BYTES,
  MIN_OPTIONS,
  MAX_OPTIONS,
  MIN_DURATION,
  MAX_DURATION,
} from "@/lib/limits";
import { formatProxyError } from "@/lib/errors";

export default function NewPollPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { toast } = useToast();
  const deployment = getDeployment(activeBotChain.id);
  const contractAddress = deployment.address;
  const isDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const { writeContractAsync } = useWriteContract();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [durationHours, setDurationHours] = useState("24");
  const [isWriting, setIsWriting] = useState(false);

  const questionByteLength = new TextEncoder().encode(question).length;
  const isQuestionValid = question.trim().length > 0 && questionByteLength <= MAX_QUESTION_BYTES;

  const areOptionsValid =
    options.length >= MIN_OPTIONS &&
    options.length <= MAX_OPTIONS &&
    options.every(
      (opt) =>
        opt.trim().length > 0 && new TextEncoder().encode(opt).length <= MAX_OPTION_BYTES
    );

  const durationSeconds = Number(durationHours) * 3600;
  const isDurationValid =
    !isNaN(durationSeconds) &&
    durationSeconds >= MIN_DURATION &&
    durationSeconds <= MAX_DURATION;

  const canSubmit =
    isConnected &&
    isDeployed &&
    isQuestionValid &&
    areOptionsValid &&
    isDurationValid &&
    !isWriting;

  const handleAddOption = () => {
    if (options.length < MAX_OPTIONS) {
      setOptions([...options, ""]);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > MIN_OPTIONS) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    const updated = [...options];
    updated[index] = val;
    setOptions(updated);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setIsWriting(true);
      const cleanOptions = options.map((o) => o.trim());
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: PROXY_ABI,
        functionName: "create",
        args: [question.trim(), cleanOptions, BigInt(durationSeconds)],
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      toast("success", "Poll Created", `Successfully created "${question.trim()}"`);
      setTimeout(() => {
        router.push("/");
      }, 1200);
    } catch (err) {
      const message = formatProxyError(err);
      toast("error", "Failed to create poll", message);
    } finally {
      setIsWriting(false);
    }
  };

  return (
    <PageShell
      title="Create a Delegated Poll"
      description="Start a new question with 2 to 6 options. Participants can vote directly or delegate to someone they trust."
    >
      <div className="max-w-2xl mx-auto">
        <Panel variant="surface">
          <form onSubmit={handleCreate} className="flex flex-col gap-6">
            {/* Question */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="question"
                  className="font-heading text-sm uppercase tracking-wider font-bold text-[var(--text-primary)]"
                >
                  Question
                </label>
                <span
                  className={`text-xs font-mono ${
                    questionByteLength > MAX_QUESTION_BYTES
                      ? "text-[var(--danger)]"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {questionByteLength} / {MAX_QUESTION_BYTES} bytes
                </span>
              </div>
              <input
                id="question"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Which consensus mechanism should we adopt?"
                maxLength={120}
                required
                className="w-full px-3.5 py-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-sans text-sm"
              />
            </div>

            {/* Options */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <label className="font-heading text-sm uppercase tracking-wider font-bold text-[var(--text-primary)]">
                  Options ({options.length} / {MAX_OPTIONS})
                </label>
                <span className="text-xs text-[var(--text-muted)] font-sans">
                  Max 32 bytes per option
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {options.map((opt, idx) => {
                  const optBytes = new TextEncoder().encode(opt).length;
                  const isOptOver = optBytes > MAX_OPTION_BYTES;
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[var(--text-muted)] w-6 text-center">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        placeholder={`Option ${idx + 1}`}
                        maxLength={32}
                        required
                        className={`flex-1 px-3 py-2 rounded bg-[var(--bg-elevated)] border ${
                          isOptOver
                            ? "border-[var(--danger)]"
                            : "border-[var(--border-default)]"
                        } text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-sans text-sm`}
                      />
                      {options.length > MIN_OPTIONS && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="px-2.5 py-2 rounded text-xs font-mono text-[var(--danger)] hover:bg-[var(--bg-overlay)] border border-[var(--border-subtle)]"
                          title="Remove option"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {options.length < MAX_OPTIONS && (
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="self-start mt-1 text-xs font-heading uppercase tracking-wider text-[var(--accent)] hover:underline"
                >
                  + Add Option
                </button>
              )}
            </div>

            {/* Duration */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="duration"
                  className="font-heading text-sm uppercase tracking-wider font-bold text-[var(--text-primary)]"
                >
                  Duration (Hours)
                </label>
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  Min 1 hr • Max 90 days (2,160 hrs)
                </span>
              </div>
              <input
                id="duration"
                type="number"
                min="1"
                max="2160"
                step="any"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono text-sm"
              />
            </div>

            {/* Submit */}
            <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col gap-3">
              {!isConnected ? (
                <p className="text-xs text-[var(--warning)] font-sans text-center">
                  Connect your wallet to create a poll.
                </p>
              ) : !isQuestionValid ? (
                <p className="text-xs text-[var(--text-muted)] font-sans text-center">
                  Please enter a valid question (up to 120 bytes).
                </p>
              ) : !areOptionsValid ? (
                <p className="text-xs text-[var(--text-muted)] font-sans text-center">
                  Please fill all options (2 to 6, up to 32 bytes each).
                </p>
              ) : !isDurationValid ? (
                <p className="text-xs text-[var(--text-muted)] font-sans text-center">
                  Duration must be between 1 hour and 2,160 hours (90 days).
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={!canSubmit}
                loading={isWriting}
                size="lg"
                className="w-full"
              >
                Create Poll
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </PageShell>
  );
}
