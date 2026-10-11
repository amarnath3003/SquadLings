// USD per 1M tokens: master.md §25.4 and the model pages (read 2026-10-10).
// Model tokens only; hosted container time is billed separately.

export const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-6-luna": { input: 0.1, cached: 0.01, output: 0.5 },
  "gpt-6.1-sol": { input: 2, cached: 0.1, output: 10 },
  "gpt-6-astra": { input: 10, cached: 1, output: 50 },
};

/** Cost of a TokenUsage object, rounded to 1/100 cent; null for unknown models or missing usage. */
export function estimateCost(model: string, usage: any): number | null {
  const price = PRICES[model];
  if (!price || typeof usage?.input_tokens !== "number") return null;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const usd = ((usage.input_tokens - cached) * price.input + cached * price.cached + (usage.output_tokens ?? 0) * price.output) / 1e6;
  return Math.round(usd * 10000) / 10000;
}
