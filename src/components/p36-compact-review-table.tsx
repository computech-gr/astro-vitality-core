import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { reviewTablePage, type ReviewTableRow } from "@/domain/health-intelligence/p36-review-table";

export function P36CompactReviewTable({ rows, label, renderDetail }: { rows: ReviewTableRow[]; label: string; renderDetail: (id: string) => ReactNode }) {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState("");
  const [evidence, setEvidence] = useState("");
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const result = reviewTablePage(rows, query, domain, status, evidence, page);
  const selected = rows.find((r) => r.id === active);
  const filter = (name: string, value: string, set: (v: string) => void, values: string[]) => <select aria-label={`${label} ${name}`} className="min-w-0 max-w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={value} onChange={(e) => { set(e.target.value); setPage(0); }}><option value="">All {name.toLowerCase()}</option>{[...new Set(values)].sort().map((v) => <option key={v} value={v}>{v}</option>)}</select>;
  return <section aria-label={label} className="space-y-3">
    <h2 className="text-lg font-semibold">{label}</h2>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Input aria-label={`Search ${label}`} placeholder="Search biomarker, unit or catalog ID" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
      {filter("Scientific domains", domain, setDomain, rows.map((r) => r.domain))}
      {filter("Review statuses", status, setStatus, rows.map((r) => r.decision))}
      {filter("Evidence completeness", evidence, setEvidence, rows.map((r) => r.evidence))}
    </div>
    <p role="status" className="text-xs text-muted-foreground">{result.total} of {rows.length} terms · page {result.page + 1} of {result.pages}</p>
    <div ref={scroll} className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[60rem] text-left text-xs" aria-label={`${label} table`}>
        <thead className="bg-muted"><tr>{["Biomarker", "Exact unit", "Scientific domain (candidate)", "Candidate catalog ID", "Evidence status", "Scientific decision", "Activation", "Submission / sync", "Review"].map((h) => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{result.rows.map((r) => <tr key={r.id} className="border-t border-border align-top"><td className="max-w-64 break-words px-3 py-3 font-medium">{r.name}</td><td className="px-3 py-3 whitespace-pre-wrap">{r.unit || "Not recorded"}</td><td className="px-3 py-3">{r.domain}</td><td className="max-w-48 break-words px-3 py-3">{r.candidates.join(", ") || "None"}</td><td className="px-3 py-3">{r.evidence}</td><td className="px-3 py-3">{r.decision}</td><td className="px-3 py-3">{r.activation}</td><td className="px-3 py-3">{r.origin}</td><td className="px-3 py-2"><Button variant="outline" size="sm" aria-label={`Review ${r.name}`} onClick={() => setActive(r.id)}>Review</Button></td></tr>)}</tbody>
      </table>
    </div>
    {!result.total ? <p className="text-sm text-muted-foreground">No terms match these filters.</p> : null}
    <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={result.page === 0} onClick={() => setPage(result.page - 1)}>Previous</Button><span className="text-xs">{result.page + 1} / {result.pages}</span><Button variant="outline" disabled={result.page + 1 >= result.pages} onClick={() => setPage(result.page + 1)}>Next</Button></div>
    <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setActive(null); scroll.current?.scrollTo({ left: 0 }); } }}><SheetContent className="w-full overflow-y-auto sm:max-w-3xl"><SheetTitle className="pr-6 break-words">{selected?.name ?? "Scientific dossier"}</SheetTitle><SheetDescription className="mb-4">{selected?.unit} · {selected?.origin}</SheetDescription>{selected ? renderDetail(selected.id) : null}</SheetContent></Sheet>
  </section>;
}