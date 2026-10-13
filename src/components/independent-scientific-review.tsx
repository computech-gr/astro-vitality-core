import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { P32_REVIEW_LEDGER, scientificReviewReadiness } from "@/domain/validation/independent-review";

/** Transparent review handoff, never a self-certification UI. */
export function IndependentScientificReview() {
  const readiness = scientificReviewReadiness();
  return <section aria-labelledby="p32-review-title" className="mt-12 space-y-5">
    <div><p className="section-kicker">P32 · Independent scientific review</p><h2 id="p32-review-title" className="mt-2 font-display text-2xl font-semibold">Scientific approval is pending</h2>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Automated software checks are not independent scientific review. The review gates below require named external assessors, traceable signed decisions and explicit limitations before any approval claim. This screen cannot grant approval.</p></div>
    <Card><CardHeader><CardTitle>Scientific validation gate: NOT APPROVED</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>{readiness.pending} of {readiness.total} independent review gates pending. Clinical validation: NOT CLAIMED. Operational clinical activation: DISABLED.</p><p>Review evidence is prepared for human assessment; the repository does not contain completed independent signoffs.</p>{readiness.errors.length > 0 && <p role="alert">Ledger integrity errors: {readiness.errors.join("; ")}</p>}</CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-2">{P32_REVIEW_LEDGER.gates.map(gate => <Card key={gate.id}><CardHeader><CardTitle className="text-base">{gate.id} · {gate.title}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p className="font-medium">PENDING INDEPENDENT REVIEW</p><p className="text-muted-foreground">{gate.acceptance}</p><p className="break-all text-xs text-muted-foreground">Repository handoff: {gate.sourceFile}</p><p className="text-xs text-muted-foreground">Reviewer: not recorded · Signed evidence: not recorded</p></CardContent></Card>)}</div>
    <p className="text-sm text-muted-foreground">For independent assessors: follow <code>docs/P32_SCIENTIFIC_VALIDATION_INDEPENDENT_REVIEW.md</code>. Do not treat literature correlation as a deterministic direction, infer an unmeasured biomarker, or claim a clinical decision.</p>
  </section>;
}
