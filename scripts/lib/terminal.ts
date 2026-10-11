// Terminal I/O for the spikes: the task prompt, yes/no questions, and log lines that don't break
// a question that's waiting for an answer.

import { createInterface } from "node:readline/promises";
import type { Interface } from "node:readline/promises";

const interactive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

let active: { rl: Interface; prompt: string } | undefined;

/** Prints a line. While a question waits, prints it above the question and redraws what was typed so far. */
export function printLine(text: string) {
  if (!active) {
    console.log(text);
    return;
  }
  process.stdout.write("\r\x1b[2K");
  console.log(text);
  process.stdout.write(active.prompt + active.rl.line);
}

/** The task from --task or the plain-text arguments; otherwise asks in the terminal. Exits when there's none. */
export async function readTask(given: string, opts: { dryRun?: boolean; example: string }): Promise<string> {
  if (given.trim()) return given.trim();
  if (!interactive()) {
    if (opts.dryRun) return "<your task>";
    console.error(`No task given. Run this in a terminal to be asked, or pass one: ${opts.example}`);
    process.exit(1);
  }
  console.log("What should the agent do in the browser?");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  active = { rl, prompt: "> " };
  rl.on("SIGINT", () => process.exit(130));
  try {
    for (;;) {
      const answer = (await rl.question("> ")).trim();
      if (answer) return answer;
    }
  } catch {
    console.error("\nNo task given."); // Ctrl+D rejects the question
    process.exit(1);
  } finally {
    active = undefined;
    rl.close();
  }
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Asks a one-line question answered by a key, e.g. { y: "yes", n: "no", a: "all" }; Enter or an
 * unknown key picks `fallback`. Questions are asked one at a time, in order; without a terminal the
 * answer is `fallback`. `decided` is checked when the question's turn comes: if it returns an
 * answer (a later decision already covers this question), that's used without asking. Rejects if
 * `signal` aborts while waiting, so a stopping run doesn't hang on the question.
 */
export function askChoice<T extends string>(
  question: string,
  keys: Record<string, T>,
  fallback: T,
  opts: { signal?: AbortSignal; onInterrupt?: () => void; decided?: () => T | undefined } = {},
): Promise<T> {
  const run = async (): Promise<T> => {
    const known = opts.decided?.();
    if (known !== undefined) return known;
    if (!interactive()) return fallback;
    if (opts.signal?.aborted) throw new Error("stopped");
    const hint = Object.keys(keys).map((k) => (keys[k] === fallback ? k.toUpperCase() : k)).join("/");
    const prompt = `  ? ${question} [${hint}] `;
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    active = { rl, prompt };
    if (opts.onInterrupt) rl.on("SIGINT", opts.onInterrupt);
    try {
      const answer = (await rl.question(prompt, { signal: opts.signal })).trim().toLowerCase();
      return keys[answer[0] ?? ""] ?? fallback;
    } catch (err) {
      process.stdout.write("\n"); // end the prompt line
      if (opts.signal?.aborted) throw err; // the run is stopping
      return fallback; // Ctrl+D
    } finally {
      active = undefined;
      rl.close();
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

/** A yes/no question; the default is no. See askChoice. */
export async function askYesNo(
  question: string,
  opts: { signal?: AbortSignal; onInterrupt?: () => void; decided?: () => boolean | undefined } = {},
): Promise<boolean> {
  const decided = opts.decided && (() => {
    const d = opts.decided!();
    return d === undefined ? undefined : d ? "yes" : "no";
  });
  return (await askChoice(question, { y: "yes", n: "no" }, "no", { ...opts, decided })) === "yes";
}

/**
 * A chat prompt that stays on the bottom line while log lines print above it (printLine). Calls
 * `onLine` for each line typed. Without a terminal it does nothing and `interactive` is false.
 */
export function startChat(opts: { prompt: string; onLine: (line: string) => void; onClose: () => void; onInterrupt: () => void }) {
  if (!interactive()) return { interactive: false, stop: () => {} };
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  active = { rl, prompt: opts.prompt };
  rl.setPrompt(opts.prompt);
  rl.on("line", (line) => {
    opts.onLine(line);
    if (active?.rl === rl) rl.prompt();
  });
  rl.on("SIGINT", opts.onInterrupt);
  rl.on("close", () => {
    if (active?.rl === rl) active = undefined;
    opts.onClose();
  });
  rl.prompt();
  return {
    interactive: true,
    stop: () => {
      rl.removeAllListeners("close");
      if (active?.rl === rl) active = undefined;
      rl.close();
    },
  };
}

/** Waits for Enter (used to keep the browser open at the end). Returns at once without a terminal. */
export async function waitForEnter(text: string) {
  if (!interactive()) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(text).catch(() => "");
  rl.close();
}
