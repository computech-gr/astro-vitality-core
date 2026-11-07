/**
 * SCIENTIFIC APPROVE workspace: the authorized Researcher reviews one submitted
 * unknown biomarker (identity, aliases, unit, specimen, method, evidence,
 * independent source verification, own qualifications) and records the single
 * final scientific decision through p37_catalog_approve_v1, which creates the
 * catalog activation proposal. Activation remains a separate technical control.
 */
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleSlash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { approveNewBiomarkerFn } from "@/lib/p37-catalog.functions";
import type { LifecycleRow, ReceiptRow } from "@/lib/p37-catalog.server";
import type {
  GlobalReviewMission,
  GlobalReviewSubmission,
  GlobalReviewTerm,
} from "@/lib/p36-global-review.server";
import type { TriageEvent } from "@/lib/p36-global-triage-rules";
import {
  canScientificallyApprove,
  scientificApprovalChecks,
} from "@/lib/p37-scientific-approval-rules";

const DOMAINS = ["immune", "bone", "cardiovascular", "behavioral"] as const;
type Item = { sub: GlobalReviewSubmission; term: GlobalReviewTerm };

export function ScientificApproveWorkspace({
  mission,
  submissions,
  triage,
  receipts,
  events,
  canApprove,
  onDone,
}: {
  mission: GlobalReviewMission;
  submissions: GlobalReviewSubmission[];
  triage: Map<string, TriageEvent>;
  receipts: ReceiptRow[];
  events: LifecycleRow[];
  canApprove: boolean;
  onDone: () => Promise<void>;
}) {
  const approve = useServerFn(approveNewBiomarkerFn);
  const [crew, setCrew] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState<string | null>(null);
  const [evidence, setEvidence] = useState(false);
  const [quals, setQuals] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const crews = useMemo(
    () => [...new Set(submissions.map((s) => s.crewPseudonym))].sort(),
    [submissions],
  );
  const items = useMemo<Item[]>(
    () =>
      submissions
        .filter((s) => !crew || s.crewPseudonym === crew)
        .flatMap((sub) => sub.terms.map((term) => ({ sub, term }))),
    [submissions, crew],
  );
  const q = query.trim().toLowerCase();
  const filtered = items.filter(
    ({ term }) =>
      !q ||
      term.termId.includes(q) ||
      term.originalLabels.some((l) => l.toLowerCase().includes(q)) ||
      term.exactUnit.toLowerCase().includes(q),
  );
  const approvedTerms = new Map(events.map((e) => [`${e.submissionId}:${e.termId}`, e]));
  const cur = items.find((i) => `${i.sub.submissionId}:${i.term.termId}` === selected) ?? null;
  const curKey = cur ? `${cur.sub.submissionId}:${cur.term.termId}` : "";
  const termReceipts = cur ? receipts.filter((r) => r.termId === cur.term.termId) : [];
  const approval = cur ? (approvedTerms.get(curKey) ?? null) : null;
  const triageAction = cur ? (triage.get(curKey)?.action ?? null) : null;
  const input = {
    canApprove,
    triageAction,
    alreadyApproved: !!approval,
    submittedUnit: cur?.term.exactUnit ?? "",
    receipts: termReceipts,
    selectedReference: ref,
    canonicalName: name,
    domain,
    qualificationsConfirmed: quals,
    evidenceReviewed: evidence,
  };
  const checks = scientificApprovalChecks(input);
  const ready = canScientificallyApprove(input);
  const receipt = termReceipts.find((r) => r.validationReference === ref) ?? null;

  const pick = (k: string) => {
    setSelected(k);
    setRef(null);
    setName("");
    setDomain(null);
    setEvidence(false);
    setQuals(false);
    setMsg(null);
    setKey(crypto.randomUUID());
    const t = items.find((i) => `${i.sub.submissionId}:${i.term.termId}` === k);
    const rs = t ? receipts.filter((r) => r.termId === t.term.termId) : [];
    if (rs.length === 1) setRef(rs[0]!.validationReference);
  };

  const submit = async () => {
    if (!cur || !ready || !receipt || !domain) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await approve({
        data: {
          missionId: mission.missionId,
          provenance: "synthetic",
          submissionId: cur.sub.submissionId,
          termId: cur.term.termId,
          validationReference: receipt.validationReference,
          canonicalName: name.trim(),
          domain: domain as (typeof DOMAINS)[number],
          idempotencyKey: key,
        },
      });
      setMsg(
        r.ok
          ? {
              ok: true,
              text: "SCIENTIFICALLY APPROVED. The final scientific decision is recorded permanently and the catalog activation proposal was created. A separate authorized activator performs the technical activation.",
            }
          : { ok: false, text: r.message },
      );
      if (r.ok) await onDone();
    } catch {
      setMsg({
        ok: false,
        text: "Nothing was recorded. Try again; the same request is never duplicated.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Scientific review of submitted unknown biomarkers</h3>
      <div className="flex flex-wrap gap-2">
        <div className="space-y-1">
          <Label htmlFor="p37-crew" className="text-xs">
            Crew
          </Label>
          <select
            id="p37-crew"
            value={crew}
            onChange={(e) => {
              setCrew(e.target.value);
              setSelected(null);
            }}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All crew ({crews.length})</option>
            {crews.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor="p37-term-search" className="text-xs">
            Find a biomarker
          </Label>
          <Input
            id="p37-term-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Label, unit or term ID"
            className="h-9"
          />
        </div>
      </div>
      <ul
        aria-label="Submitted biomarkers"
        className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-1"
      >
        {filtered.slice(0, 60).map(({ sub, term }) => {
          const k = `${sub.submissionId}:${term.termId}`;
          const t = triage.get(k)?.action;
          const a = approvedTerms.get(k);
          return (
            <li key={k}>
              <button
                type="button"
                onClick={() => pick(k)}
                aria-pressed={selected === k}
                className={`flex w-full flex-wrap items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted ${selected === k ? "bg-muted" : ""}`}
              >
                <span className="font-medium">{term.originalLabels[0] ?? term.termId}</span>
                <span className="text-xs text-muted-foreground">
                  {term.exactUnit} · {term.termId} · {sub.crewPseudonym}
                </span>
                {a ? (
                  <Badge>SCIENTIFICALLY APPROVED</Badge>
                ) : t === "ACCEPT_FOR_REVIEW" ? (
                  <Badge variant="secondary">Accepted for review</Badge>
                ) : (
                  <Badge variant="outline">
                    {t ? t.replace(/_/g, " ").toLowerCase() : "awaiting triage"}
                  </Badge>
                )}
              </button>
            </li>
          );
        })}
        {!filtered.length ? (
          <li className="p-2 text-sm text-muted-foreground">No submitted biomarker matches.</li>
        ) : null}
      </ul>
      {filtered.length > 60 ? (
        <p className="text-xs text-muted-foreground">
          Showing 60 of {filtered.length}; refine the search.
        </p>
      ) : null}

      {cur ? (
        <div
          className="space-y-3 rounded-md border border-border p-3 text-sm"
          aria-label="Scientific review dossier"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">
              {cur.term.originalLabels[0] ?? cur.term.termId}
            </span>
            {approval ? (
              <Badge>SCIENTIFICALLY APPROVED</Badge>
            ) : (
              <Badge variant="outline">UNKNOWN</Badge>
            )}
          </div>
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[12rem_1fr]">
            <dt className="text-muted-foreground">Canonical identity</dt>
            <dd className="font-mono">
              {approval?.canonicalId ??
                receipt?.canonicalMetricId ??
                (termReceipts.length
                  ? "Choose a receipt"
                  : "Not yet established by source verification")}
            </dd>
            <dt className="text-muted-foreground">Observed labels (aliases)</dt>
            <dd>{cur.term.originalLabels.join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">Submitted unit</dt>
            <dd className="font-mono">{cur.term.exactUnit}</dd>
            <dt className="text-muted-foreground">Submitted specimen / method</dt>
            <dd>
              {cur.term.specimen ?? "not reported"} / {cur.term.method ?? "not reported"}
            </dd>
            <dt className="text-muted-foreground">Candidate base IDs</dt>
            <dd className="font-mono">{cur.term.candidateMetricIds.join(", ") || "none"}</dd>
            <dt className="text-muted-foreground">Source documents</dt>
            <dd className="break-all font-mono">
              {cur.term.sourceDocumentSha256.map((h) => h.slice(0, 16) + "…").join(", ") || "none"}
            </dd>
            <dt className="text-muted-foreground">Evidence pointers</dt>
            <dd className="break-words">{cur.term.evidencePointers.join("; ") || "none"}</dd>
            <dt className="text-muted-foreground">Triage</dt>
            <dd>{triageAction ?? "awaiting triage"}</dd>
            <dt className="text-muted-foreground">Source verification</dt>
            <dd>
              {termReceipts.length
                ? `${termReceipts.length} independently provisioned receipt(s)`
                : "None — independent source verification has not been provisioned"}
            </dd>
          </dl>

          {termReceipts.length ? (
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium">
                Source-verification receipt cited by this approval
              </legend>
              {termReceipts.map((r) => (
                <label key={r.validationReference} className="flex items-start gap-2 text-xs">
                  <input
                    type="radio"
                    name="p37-receipt"
                    checked={ref === r.validationReference}
                    onChange={() => setRef(r.validationReference)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-mono">{r.validationReference}</span> →{" "}
                    <span className="font-mono">{r.canonicalMetricId}</span> · unit {r.exactUnit} ·
                    specimen {r.specimen} · method {r.method} · protocol {r.protocol}{" "}
                    {r.protocolVersion} · verified {r.verifiedAt.slice(0, 10)}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          {approval ? (
            <div className="space-y-1 text-xs">
              <p>
                Approved {approval.approvedAt.slice(0, 16).replace("T", " ")} UTC as{" "}
                <span className="font-mono">{approval.canonicalId}</span> (
                {approval.entry.canonicalName}); evidence {approval.entry.evidenceRefs?.join(", ")}.
              </p>
              <p className="break-all font-mono text-muted-foreground">
                Catalog activation proposal SHA-256 {approval.entrySha256}
              </p>
              <p>
                {approval.revocationEventId
                  ? "Catalog entry revoked."
                  : approval.activationEventId
                    ? "CATALOG_ACTIVE — recognized automatically in later compatible examinations."
                    : "Awaiting the separate technical catalog activation. No further scientific review is needed."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <div className="space-y-1">
                  <Label htmlFor="p37-name" className="text-xs">
                    Canonical name
                  </Label>
                  <Input
                    id="p37-name"
                    value={name}
                    maxLength={120}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8 w-64"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="p37-domain" className="text-xs">
                    Scientific domain
                  </Label>
                  <select
                    id="p37-domain"
                    value={domain ?? ""}
                    onChange={(e) => setDomain(e.target.value || null)}
                    className="h-8 rounded-md border border-border bg-background px-1 text-xs"
                  >
                    <option value="">Choose</option>
                    {DOMAINS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-start gap-2 text-xs">
                <Checkbox
                  checked={evidence}
                  onCheckedChange={(v) => setEvidence(v === true)}
                  aria-label="Evidence reviewed"
                />
                I reviewed the scientific evidence, references and source-verification receipt for
                this biomarker.
              </label>
              <label className="flex items-start gap-2 text-xs">
                <Checkbox
                  checked={quals}
                  onCheckedChange={(v) => setQuals(v === true)}
                  aria-label="Qualifications confirmed"
                />
                I confirm I hold the qualifications recorded with my scientific approver
                authorization for this decision.
              </label>
              <ul aria-label="Approval prerequisites" className="space-y-0.5 text-xs">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-1.5">
                    {c.pass ? (
                      <CheckCircle2
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                        aria-label="met"
                      />
                    ) : (
                      <CircleSlash
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
                        aria-label="missing"
                      />
                    )}
                    <span>
                      {c.label}
                      {c.pass ? "" : ` — ${c.missing}`}
                    </span>
                  </li>
                ))}
                <li className="text-muted-foreground">
                  The server also confirms that neither the source verifier nor the submitter is the
                  approver.
                </li>
              </ul>
              <Button disabled={busy || !ready} onClick={() => void submit()}>
                {busy ? "Recording…" : "SCIENTIFIC APPROVE"}
              </Button>
            </>
          )}
          {msg ? (
            <p
              role={msg.ok ? "status" : "alert"}
              className={msg.ok ? "text-xs font-medium" : "text-xs text-destructive"}
            >
              {msg.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
