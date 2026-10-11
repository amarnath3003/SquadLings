// Which websites a bot may open (master.md §14.8, §17).
//
// A user-typed task has no template allow-list, so the user decides: sites named in the task (and
// --allow) are allowed up front, and any other site is asked about once. The answer holds for the
// rest of the run, subdomains included. Callers that can't wait (a navigation in flight) ask in the
// background; callers that can wait do so for a bounded time and then get "pending".

export type SiteState = "allowed" | "denied" | "unknown";
export type SiteAnswer = "allowed" | "denied" | "pending";

/** The interface the browser uses (SiteGate implements it). */
export interface SitePolicy {
  check(host: string): SiteState;
  request(host: string, opts?: { reason?: string; waitMs?: number }): Promise<SiteAnswer>;
}

/** "WWW.Google.com." → "google.com". Allowing a site allows its subdomains. */
export const siteOf = (host: string) => host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");

const covers = (site: string, host: string) => site === "*" || host === site || host.endsWith(`.${site}`);

/** Sites of the http(s) URLs in a text. Trailing sentence punctuation isn't part of a URL. */
export function hostsIn(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)].flatMap((m) => {
    const url = m[0].replace(/[.,;:!?]+$/, "");
    return URL.canParse(url) ? [siteOf(new URL(url).hostname)] : [];
  });
}

export type SiteGateOptions = {
  /**
   * Asks the user whether `site` may be opened. `decided()` returns an answer if another decision
   * already covers the site by the time the question's turn comes. Rejecting means "not decided"
   * (for example, the run is stopping); the site can be asked about again later.
   */
  ask: (site: string, reason: string | undefined, decided: () => boolean | undefined) => Promise<boolean>;
  /** Called once per user decision. */
  onDecision?: (site: string, allowed: boolean) => void;
};

export class SiteGate implements SitePolicy {
  readonly allowed: Set<string>;
  readonly denied = new Set<string>();
  private asking = new Map<string, Promise<boolean>>();
  private opts: SiteGateOptions;

  constructor(allow: Iterable<string>, opts: SiteGateOptions) {
    this.allowed = new Set([...allow].map((s) => (s === "*" ? s : siteOf(s))).filter(Boolean));
    this.opts = opts;
  }

  check(host: string): SiteState {
    const h = siteOf(host);
    for (const s of this.allowed) if (covers(s, h)) return "allowed";
    for (const s of this.denied) if (covers(s, h)) return "denied";
    return "unknown";
  }

  /**
   * Decides `host`, asking the user if needed (one question per site, however many callers).
   * With `waitMs`, returns "pending" if there's no answer by then; the question stays open and
   * its answer still applies. Without `waitMs`, waits for the answer.
   */
  async request(host: string, opts: { reason?: string; waitMs?: number } = {}): Promise<SiteAnswer> {
    const now = this.check(host);
    if (now !== "unknown") return now;
    const site = siteOf(host);
    let answer = this.asking.get(site);
    if (!answer) {
      const decided = () => {
        const s = this.check(site);
        return s === "unknown" ? undefined : s === "allowed";
      };
      answer = this.opts.ask(site, opts.reason, decided).then((yes) => {
        if (decided() === undefined) {
          (yes ? this.allowed : this.denied).add(site);
          this.opts.onDecision?.(site, yes);
        }
        return yes;
      });
      this.asking.set(site, answer);
      const forget = () => this.asking.delete(site);
      answer.then(forget, forget);
    }
    const result = answer.then((yes): SiteAnswer => (yes ? "allowed" : "denied"), (): SiteAnswer => "pending");
    if (opts.waitMs === undefined) return result;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<SiteAnswer>((r) => (timer = setTimeout(() => r("pending"), opts.waitMs)));
    try {
      return await Promise.race([result, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
