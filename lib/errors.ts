// lib/errors.ts - Proxy error formatting per spec §4

export function formatProxyError(error: unknown): string {
  if (!error) return 'An unknown error occurred.';
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('HoldsDelegations')) {
    return 'Others have handed you their votes; you can only vote.';
  }
  if (message.includes('TargetDelegated')) {
    return 'That wallet has handed its vote on. Pick someone who votes themselves.';
  }
  if (message.includes('NotDelegated')) {
    return 'You have not delegated your vote in this poll.';
  }
  if (message.includes('AlreadyDelegated') || message.includes('Delegated')) {
    // If it mentions AlreadyDelegated(0x...) or Delegated
    const match = message.match(/AlreadyDelegated\((0x[a-fA-F0-9]{40})\)/);
    if (match) {
      return `You handed your vote to ${match[1]}. Take it back to vote.`;
    }
    return 'You have already delegated your vote. Take it back to vote or change delegation.';
  }
  if (message.includes('AlreadyVoted')) {
    return 'You have already voted in this poll.';
  }
  if (message.includes('BadDelegate')) {
    return 'Invalid delegate address. You cannot delegate to yourself or address zero.';
  }
  if (message.includes('Ended')) {
    return 'This poll has ended.';
  }
  if (message.includes('BadQuestion')) {
    return 'Question cannot be empty or exceed 120 bytes.';
  }
  if (message.includes('BadOptions')) {
    return 'Options count must be between 2 and 6, and each option up to 32 bytes.';
  }
  if (message.includes('BadDuration')) {
    return 'Duration must be between 1 hour and 90 days.';
  }
  if (message.includes('BadOption')) {
    return 'Selected option is out of range.';
  }

  return message;
}
