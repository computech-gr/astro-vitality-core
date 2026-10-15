import { useState } from "react";
import registry from "../../data/scientific/p36-biomarker-source-registry.v1.json";
import { extractBoneDocument } from "@/domain/bone-health/document-extraction";

type Candidate = {
  id: string;
  label: string;
  value: string;
  unit: string;
  excerpt: string;
  selected: boolean;
};
type Metric = (typeof registry.metrics)[number];
const metrics: Metric[] = registry.metrics;
const safeNumber = /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
const blocked = /(?:reference|normal|interval|range|ref\.|\bmin\b|\bmax\b|[<>≤≥]|\d\s*[-–]\s*\d)/i;
function parseCandidates(text: string): Candidate[] {
  const found: Candidate[] = [];
  for (const line of text.split(/\r?\n/).slice(0, 1000)) {
    if (line.length > 350 || blocked.test(line)) continue;
    const match = /^\s*(.+?)\s*[:=]\s*([-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s+([^\s;,|]+)\s*$/.exec(
      line,
    );
    if (!match || !safeNumber.test(match[2]!)) continue;
    const label = match[1]!.trim().toLocaleLowerCase("en-US");
    const matches = metrics.filter((m) => m.name.trim().toLocaleLowerCase("en-US") === label);
    if (matches.length !== 1) continue;
    const metric = matches[0]!;
    // Exact unit only: never silently convert or interpret reference intervals.
    if (!metric.originalUnit || metric.originalUnit.trim() !== match[3]!.trim()) continue;
    found.push({
      id: metric.id,
      label: metric.name,
      value: match[2]!,
      unit: match[3]!,
      excerpt: line,
      selected: false,
    });
  }
  return found.slice(0, 100);
}
export function MissionDocumentReviewWorkbench() {
  const [consent, setConsent] = useState(false);
  const [text, setText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [status, setStatus] = useState("No document loaded. No data are uploaded or saved.");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("");
  async function load(file: File) {
    setText("");
    setCandidates([]);
    setSource("");
    if (!consent) {
      setStatus("Confirm local-only document processing first.");
      return;
    }
    if (file.size > 12_000_000) {
      setStatus("File exceeds 12 MB limit.");
      return;
    }
    if (!/\.(pdf|png|jpe?g|webp|csv|txt)$/i.test(file.name)) {
      setStatus("Unsupported file type.");
      return;
    }
    setBusy(true);
    try {
      const result = /\.(csv|txt)$/i.test(file.name)
        ? { text: await file.text(), method: "local text", warnings: [] as string[] }
        : await extractBoneDocument(file);
      const bounded = result.text.slice(0, 100_000);
      setText(bounded);
      setSource(file.name);
      setCandidates(parseCandidates(bounded));
      setStatus(
        `${result.method}: local extraction only. ${result.warnings.join(" ")} Review all text. Exact catalog name and unit required; other results remain unmatched.`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Document extraction failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <h1 className="text-2xl font-bold">P36.2A — Mission Document Review</h1>
      <p className="text-sm text-muted-foreground">
        Research-only local extraction preview. This stage does not write mission observations,
        upload original documents, generate medical reports, or link a document to a crew identity.
        Use synthetic reports only until security and scientific gates are cleared.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I
        understand this file will be processed in this browser only, and I will use synthetic test
        data.
      </label>
      <input
        aria-label="Select examination file"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt"
        disabled={!consent || busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void load(f);
          e.currentTarget.value = "";
        }}
      />
      <p role="status" className="text-sm">
        {status}
      </p>
      {source && <p className="text-sm">Local source: {source}</p>}
      {text && (
        <section className="space-y-2">
          <label htmlFor="p362-text" className="block font-medium">
            Extracted text — verify and correct locally
          </label>
          <textarea
            id="p362-text"
            className="w-full rounded border bg-background p-2 font-mono text-xs"
            rows={10}
            maxLength={100000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="rounded border px-3 py-2 text-sm"
            type="button"
            onClick={() => {
              setCandidates(parseCandidates(text));
              setStatus("Candidate matching refreshed; no values have been saved.");
            }}
          >
            Find exact matches
          </button>
        </section>
      )}
      <section className="space-y-2">
        <h2 className="font-semibold">
          Proposed matches ({candidates.length}) — never auto-approved
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Reviewed</th>
                <th className="p-2">Catalog ID</th>
                <th className="p-2">Marker</th>
                <th className="p-2">Value</th>
                <th className="p-2">Unit</th>
                <th className="p-2">Original excerpt</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, i) => (
                <tr key={`${c.id}-${i}`} className="border-t">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      aria-label={`Reviewed candidate ${i + 1}`}
                      checked={c.selected}
                      onChange={(e) =>
                        setCandidates((cs) =>
                          cs.map((v, j) => (j === i ? { ...v, selected: e.target.checked } : v)),
                        )
                      }
                    />
                  </td>
                  <td className="p-2">{c.id}</td>
                  <td className="p-2">{c.label}</td>
                  <td className="p-2">{c.value}</td>
                  <td className="p-2">{c.unit}</td>
                  <td className="p-2 max-w-xs break-words">{c.excerpt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Review checkboxes are temporary UI state, not scientific approval or persistence. No
          automatic report, trend, or diagnosis.
        </p>
      </section>
      <button
        type="button"
        className="rounded border px-3 py-2 text-sm"
        onClick={() => {
          setText("");
          setCandidates([]);
          setSource("");
          setStatus("Local document cleared from this page.");
        }}
      >
        Clear local document
      </button>
    </main>
  );
}
