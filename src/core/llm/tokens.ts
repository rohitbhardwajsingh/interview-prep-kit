export const CHARS_PER_TOKEN = 4;

/**
 * Deliberately rough and deliberately high. The limiter uses this to reserve
 * budget before a call, and over-reserving costs a little throughput while
 * under-reserving costs a 429 and a retry.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateRequestTokens(
  systemInstruction: string,
  prompt: string,
  expectedOutputTokens: number,
): number {
  return (
    estimateTokens(systemInstruction) +
    estimateTokens(prompt) +
    expectedOutputTokens
  );
}
