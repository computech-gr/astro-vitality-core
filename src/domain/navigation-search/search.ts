/**
 * Global navigation search: pure, client-side ranking over the header's own
 * navigation catalogue. Entries carry only public labels and destinations —
 * never mission names, records, memberships or other restricted data.
 */
export type SearchEntry = {
  title: string;
  href: string;
  category: string;
  description?: string;
  keywords?: readonly string[];
};

/** Synonyms keyed by navigation label. Labels must exist in the catalogue. */
export const SEARCH_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  Team: ["team", "people", "contributors", "members", "authors"],
  "Biomarkers & Signals": ["biomarker", "biomarkers", "signals", "metrics"],
  "Bone Health": ["bone", "skeletal", "musculoskeletal", "health"],
  "Immune Changes": ["immune", "inflammation", "health"],
  "Cardiovascular Health": ["heart", "cardio", "blood pressure", "health"],
  "Behavioral Health": ["behavior", "mood", "stress", "health"],
  "Health Intelligence": ["health", "trends", "baseline", "interpretation"],
  "Offline Mission Mode": ["offline", "airplane", "no connection", "sync"],
  "Offline-First Architecture": ["offline", "local first"],
  "Security & Privacy": ["security", "privacy", "encryption", "access"],
  "Security Policy": ["security", "vulnerability", "disclosure"],
  "Mission & Crew Operations": ["operator", "crew", "invite", "operations"],
  "Mission Identity & Sign-in": ["login", "sign in", "account", "auth"],
  "Daily Readiness Check-in": ["readiness", "check-in", "fatigue", "sleep"],
  "Live Monitoring": ["live", "dashboard", "vitals"],
  "Device Integration Center": ["devices", "wearable", "sensor"],
  "Environment & Radiation": ["radiation", "co2", "habitat"],
  "NASA Scientific Evidence": ["nasa", "evidence", "research", "science"],
  Roadmap: ["roadmap", "phases", "plan"],
  License: ["license", "licence", "mit"],
};

/** Extra destinations: verified section anchors on /mission/operations. */
export const SECTION_ENTRIES: readonly SearchEntry[] = [
  {
    title: "Mission Settings",
    href: "/mission/operations#mission-settings",
    category: "Mission Operations",
    description: "Operator-only mission name, status and dates.",
    keywords: ["settings", "configure", "mission status", "lifecycle"],
  },
  {
    title: "Mission Audit Log",
    href: "/mission/operations#mission-audit-log",
    category: "Mission Operations",
    description: "Operator-only, redacted mission activity history.",
    keywords: ["audit", "log", "history", "activity"],
  },
];

export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Levenshtein distance bounded by `max`; returns max+1 when exceeded. */
export function editDistance(a: string, b: string, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur[j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] ?? max + 1;
}

function tokenScore(token: string, words: string[], weight: number) {
  let best = 0;
  for (const word of words) {
    if (word === token) best = Math.max(best, 10 * weight);
    else if (word.startsWith(token)) best = Math.max(best, 7 * weight);
    else if (token.length >= 3 && word.includes(token)) best = Math.max(best, 4 * weight);
    else if (
      token.length >= 4 &&
      editDistance(token, word.slice(0, token.length + 1), token.length >= 7 ? 2 : 1) <=
        (token.length >= 7 ? 2 : 1)
    )
      best = Math.max(best, 2 * weight);
  }
  return best;
}

export function scoreEntry(entry: SearchEntry, query: string) {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (!tokens.length) return 0;
  const title = normalize(entry.title).split(" ");
  const keywords = (entry.keywords ?? []).flatMap((k) => normalize(k).split(" "));
  const rest = normalize(`${entry.category} ${entry.description ?? ""}`).split(" ");
  let total = 0;
  for (const token of tokens) {
    const s = Math.max(
      tokenScore(token, title, 3),
      tokenScore(token, keywords, 2),
      tokenScore(token, rest, 1),
    );
    if (!s) return 0;
    total += s;
  }
  if (normalize(entry.title) === tokens.join(" ")) total += 50;
  return total;
}

export function searchEntries(entries: readonly SearchEntry[], query: string, limit = 12) {
  return entries
    .map((entry, index) => ({ entry, index, score: scoreEntry(entry, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.entry);
}

/** De-duplicate by title+href, keeping the first occurrence. */
export function dedupeEntries(entries: readonly SearchEntry[]) {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.title}|${e.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const INITIAL_SUGGESTIONS = [
  "Mission Workspace",
  "Daily Readiness Check-in",
  "Live Monitoring",
  "Health Intelligence",
  "Project Guide",
  "Team",
] as const;
