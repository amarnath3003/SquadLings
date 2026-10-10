// Spec §34 planning estimate, not a live quote or measured usage.
export const estimateRun = (bots: number) => Math.round((bots * 35 * 0.007 + 0.18) * 100) / 100;
