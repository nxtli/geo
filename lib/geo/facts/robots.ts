/**
 * robots.txt-parser voor AI-bots. Vervangt de beoordeling door het taalmodel:
 * of een bot een pad mag ophalen is een feit, geen inschatting.
 *
 * Volgt RFC 9309: de groep met de meest specifieke user-agent geldt (anders
 * `*`), binnen de groep wint de langste overeenkomende regel, bij gelijke
 * lengte wint Allow.
 */
export type BotKind = "search" | "user" | "training";
export interface BotSpec {
  token: string;
  kind: BotKind;
  engine: string;
}

export const AI_BOTS: BotSpec[] = [
  { token: "OAI-SearchBot", kind: "search", engine: "ChatGPT" },
  { token: "Claude-SearchBot", kind: "search", engine: "Claude" },
  { token: "PerplexityBot", kind: "search", engine: "Perplexity" },
  { token: "Googlebot", kind: "search", engine: "Google AI Overviews en AI Mode" },
  { token: "Bingbot", kind: "search", engine: "Microsoft Copilot" },
  { token: "ChatGPT-User", kind: "user", engine: "ChatGPT" },
  { token: "Claude-User", kind: "user", engine: "Claude" },
  { token: "Perplexity-User", kind: "user", engine: "Perplexity" },
  { token: "GPTBot", kind: "training", engine: "OpenAI" },
  { token: "ClaudeBot", kind: "training", engine: "Anthropic" },
  { token: "Google-Extended", kind: "training", engine: "Google Gemini" },
  { token: "CCBot", kind: "training", engine: "Common Crawl" },
  { token: "Applebot-Extended", kind: "training", engine: "Apple" },
];

interface Rule {
  allow: boolean;
  path: string;
}
interface Group {
  agents: string[];
  rules: Rule[];
}

export function parseRobots(txt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      lastWasAgent = false;
      if (!current) continue;
      // Een lege Disallow betekent: alles toegestaan. Een lege Allow doet niets.
      if (value === "") continue;
      current.rules.push({ allow: field === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function pathMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${re}${anchored ? "$" : ""}`).test(path);
}

export interface BotAccess extends BotSpec {
  allowed: boolean;
  /** Welke groep gold: de eigen naam van de bot, `*`, of geen. */
  matchedGroup: "eigen" | "*" | "geen";
  /** De regel die de doorslag gaf, voor in het rapport. */
  rule: string | null;
}

export function botAccess(groups: Group[], bot: BotSpec, path: string): BotAccess {
  const token = bot.token.toLowerCase();
  const own = groups.filter((g) => g.agents.includes(token));
  const star = groups.filter((g) => g.agents.includes("*"));
  const applied = own.length ? own : star;
  const matchedGroup = own.length ? "eigen" : star.length ? "*" : "geen";
  let best: Rule | null = null;
  for (const rule of applied.flatMap((g) => g.rules)) {
    if (!pathMatches(rule.path, path)) continue;
    if (
      !best ||
      rule.path.length > best.path.length ||
      (rule.path.length === best.path.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return {
    ...bot,
    allowed: best ? best.allow : true,
    matchedGroup,
    rule: best ? `${best.allow ? "Allow" : "Disallow"}: ${best.path}` : null,
  };
}

export interface RobotsReport {
  /** null = robots.txt niet bereikbaar, toegang onbekend. */
  known: boolean;
  bots: BotAccess[];
  blockedSearch: BotAccess[];
  blockedTraining: BotAccess[];
  blockedUser: BotAccess[];
}

/**
 * @param robotsTxt inhoud van robots.txt; "" = geen bestand (alles toegestaan);
 *                  null = niet bereikbaar (onbekend)
 * @param pageUrl   de gescande pagina
 */
export function analyzeRobots(robotsTxt: string | null, pageUrl: string): RobotsReport {
  let path = "/";
  try {
    const u = new URL(pageUrl);
    path = u.pathname + u.search || "/";
  } catch {
    /* keep "/" */
  }
  if (robotsTxt === null) {
    return { known: false, bots: [], blockedSearch: [], blockedTraining: [], blockedUser: [] };
  }
  const groups = parseRobots(robotsTxt);
  const bots = AI_BOTS.map((b) => botAccess(groups, b, path));
  const blocked = (kind: BotKind) => bots.filter((b) => b.kind === kind && !b.allowed);
  return {
    known: true,
    bots,
    blockedSearch: blocked("search"),
    blockedTraining: blocked("training"),
    blockedUser: blocked("user"),
  };
}

/** Plak-klaar blok dat de geblokkeerde zoekbots toelaat. */
export function robotsFixSnippet(blocked: BotAccess[]): string {
  return blocked.map((b) => `User-agent: ${b.token}\nAllow: /`).join("\n\n");
}
