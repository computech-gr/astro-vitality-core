import { useEffect, useRef, useState } from "react";
import {
  loadMissionIdentity,
  subscribeMissionIdentity,
  type MissionIdentitySnapshot,
} from "@/infrastructure/mission-identity";
import registry from "../../data/scientific/p36-biomarker-source-registry.v1.json";
import { getDocumentDomainProjection, getUnitPendingBoneHints, domainForMetric, DOMAIN_LABELS } from "@/domain/health-domains/document-domain-projection";
import { extractBoneDocument } from "@/domain/bone-health/document-extraction";
import { useServerFn } from "@tanstack/react-start";
import {
  getP36CloudSubmissionStatus,
  submitSyntheticReviewBatch,
  listSyntheticReviewHistory,
} from "@/lib/p36-cloud-submission.functions";
import {
  validateSyntheticCloudHandoff,
  type SyntheticCloudHandoff,
} from "@/domain/biomarkers/p364-cloud-handoff-contract";

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
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  useEffect(() => {
    let active = true;
    const refreshIdentity = () => {
      void loadMissionIdentity()
        .then((value) => {
          if (active) setIdentity(value);
        })
        .catch(() => {
          if (active) setIdentity(null);
        });
    };
    refreshIdentity();
    const unsubscribe = subscribeMissionIdentity(refreshIdentity);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const eligible = Boolean(
    identity?.signedIn &&
    identity.active?.missionId &&
    identity.active?.crewMemberId &&
    identity.active.role === "crew_self",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(false);
  const [text, setText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [status, setStatus] = useState("No document loaded. No data are uploaded or saved.");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("");
  const [reviewerConfirmed, setReviewerConfirmed] = useState(false);
  const [observationDate, setObservationDate] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [previewVisible, setPreviewVisible] = useState(false);
  const [sourceSha256, setSourceSha256] = useState("");
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("");
  const [savedHistory, setSavedHistory] = useState<Array<{batchId:string; observedOn:string; createdAt:string; status:string; itemCount:number}>>([]);
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const submitBatch = useServerFn(submitSyntheticReviewBatch);
  const listHistory = useServerFn(listSyntheticReviewHistory);
  const readCloudStatus = useServerFn(getP36CloudSubmissionStatus);
  useEffect(() => {
    let active = true;
    void readCloudStatus()
      .then((s) => active && setCloudEnabled(s.enabled === true))
      .catch(() => active && setCloudEnabled(false));
    return () => {
      active = false;
    };
  }, [readCloudStatus]);
  const missionId = eligible ? identity?.active?.missionId : undefined;
  const crewMemberId = eligible ? identity?.active?.crewMemberId : undefined;
  const selected = candidates.filter((candidate) => candidate.selected);
  const domainProjection = getDocumentDomainProjection(candidates);
  const boneHints = getUnitPendingBoneHints(text);
  const hasDuplicateMetrics =
    new Set(selected.map((candidate) => candidate.id)).size !== selected.length;
  const invalidSelectedValues = selected.some(
    (candidate) => !safeNumber.test(candidate.value.trim()) || !candidate.unit.trim(),
  );
  function editCandidate(index: number, patch: Partial<Pick<Candidate, "value" | "unit">>) {
    setReviewerConfirmed(false);
    setPreviewVisible(false);
    setCloudStatus("");
    setCandidates((previous) =>
      previous.map((candidate, j) => (j === index ? { ...candidate, ...patch } : candidate)),
    );
  }
  const allSelected = candidates.length > 0 && candidates.every((c) => c.selected);
  function setAllReviewed(checked: boolean) {
    setCandidates((previous) => previous.map((candidate) => ({ ...candidate, selected: checked })));
    setReviewerConfirmed(false);
    setPreviewVisible(false);
    setCloudStatus("");
  }
  const canExport = Boolean(
    eligible &&
    consent &&
    reviewerConfirmed &&
    source &&
    observationDate &&
    selected.length > 0 &&
    !hasDuplicateMetrics &&
    !invalidSelectedValues &&
    !busy,
  );
  const previewObservations = canExport ? selected.map(({ id, label, value, unit, excerpt }) => ({
    id, label, value, unit, excerpt,
  })) : [];
  function exportReviewedBatch() {
    if (!canExport || !missionId || !crewMemberId || !identity?.userId) return;
    const payload = {
      schema: "mitochondria.p36.2b2.synthetic-reviewed-batch.v1",
      status: "LOCAL_REVIEW_ONLY_NOT_APPROVED_FOR_IMPORT",
      syntheticOnly: true,
      missionId,
      crewMemberId,
      reviewerUserId: identity.userId,
      sourceFilename: source,
      observedOn: observationDate,
      reviewedAt: new Date().toISOString(),
      observations: selected.map(({ id, label, value, unit, excerpt }) => ({
        metricId: id,
        metricName: label,
        value,
        unit,
        sourceExcerpt: excerpt,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mitochondria-p362b2-synthetic-review.json";
    link.click();
    URL.revokeObjectURL(url);
    setExportStatus(
      "Synthetic review exported locally. Not a clinical or scientific approval; no cloud records written.",
    );
  }
  async function submitToCloud() {
    if (!canExport || !missionId || !crewMemberId || !identity?.userId || !sourceSha256) return;
    const handoff: SyntheticCloudHandoff = {
      schema: "mitochondria.p36.4.synthetic-cloud-handoff.v1",
      syntheticOnly: true,
      missionId,
      crewMemberId,
      observedOn: observationDate,
      sourceFilename: source,
      sourceSha256,
      observations: selected.map(({ id, value, unit, excerpt }) => ({
        metricId: id,
        value,
        unit,
        sourceExcerpt: excerpt,
      })),
    };
    if (!validateSyntheticCloudHandoff(handoff)) {
      setCloudStatus(
        "Batch is not valid for synthetic submission (plain decimal values, unique markers).",
      );
      return;
    }
    // Deterministic key: identical retries replay the same batch instead of duplicating it.
    const keyDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${identity.userId}|${JSON.stringify(handoff)}`),
    );
    const idempotencyKey = Array.from(new Uint8Array(keyDigest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    setCloudBusy(true);
    setCloudStatus("");
    try {
      const result = await submitBatch({ data: { handoff, idempotencyKey } });
      if (result.ok) void refreshSavedHistory();
      setCloudStatus(
        result.ok
          ? `${result.status === "replayed" ? "Already submitted" : "Submitted"}: ${result.itemCount} synthetic value(s), pending independent review. Not approved or interpreted.`
          : result.message,
      );
    } catch {
      setCloudStatus("Cloud submission failed. Nothing was saved; sign in again and retry.");
    } finally {
      setCloudBusy(false);
    }
  }
  async function refreshSavedHistory() {
    if (!eligible || !missionId || !crewMemberId || !cloudEnabled) return;
    setHistoryBusy(true);
    try {
      const result = await listHistory({ data: { missionId, crewMemberId } });
      if (result.ok) {
        setSavedHistory(result.records);
        setHistoryStatus(result.records.length ? "Saved synthetic reviews, newest observation first." : "No saved synthetic reviews for this astronaut.");
      } else {
        setSavedHistory([]);
        setHistoryStatus(result.message);
      }
    } catch {
      setHistoryStatus("Unable to load saved reviews. No changes were made.");
    } finally {
      setHistoryBusy(false);
    }
  }
  async function load(file: File) {
    setText("");
    setCandidates([]);
    setSource("");
    setSourceSha256("");
    setCloudStatus("");
    setReviewerConfirmed(false);
    setExportStatus("");
    setPreviewVisible(false);
    if (!eligible) {
      setStatus("Active Crew Self mission membership required.");
      return;
    }
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
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      setSourceSha256(
        Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""),
      );
      setText(bounded);
      setSource(file.name);
      setCandidates(parseCandidates(bounded));
      setReviewerConfirmed(false);
      setPreviewVisible(false);
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
    <main className="mx-auto w-full min-w-0 max-w-5xl space-y-5 p-6">
      <h1 className="text-2xl font-bold" data-phase="P36.2A">Mission Document Review</h1>
      <p className="text-sm text-muted-foreground">
        Research-only local extraction preview. This stage does not write mission observations,
        upload original documents, generate medical reports, or link a document to a crew identity.
        Use synthetic reports only until security and scientific gates are cleared.
      </p>
      <section
        aria-label="Mission review context"
        className="rounded border p-3 text-sm"
        role="status"
      >
        {eligible
          ? `Crew Self context: ${identity?.active?.missionCode ?? identity?.active?.missionId} / ${identity?.active?.crewDisplayName ?? identity?.active?.crewMemberId}. Local review only; no server writes.`
          : "No verified active Crew Self mission context. Select an active Crew Self membership in Mission Identity before reviewing synthetic documents."}
      </section>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I
        understand this file will be processed in this browser only, and I will use synthetic test
        data.
      </label>
      <div
        className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4 space-y-2"
        aria-label="Laboratory report selection"
      >
        <p className="font-semibold">Synthetic laboratory report</p>
        <p className="text-sm text-muted-foreground">
          PDF, image, CSV or TXT · processed locally · maximum 12 MB
        </p>
        <button
          type="button"
          className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50"
          disabled={!eligible || !consent || busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? "Reading laboratory report…" : "Upload Laboratory Report"}
        </button>
        <p className="text-xs" role="status">
          {source ? `Selected: ${source}` : "No laboratory report selected"}
        </p>
        <input
          ref={fileInputRef}
          aria-label="Select examination file"
          className="sr-only"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt"
          disabled={!eligible || !consent || busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void load(f);
            e.currentTarget.value = "";
          }}
        />
      </div>
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
              if (!eligible) return;
              setCandidates(parseCandidates(text));
              setReviewerConfirmed(false);
              setPreviewVisible(false);
              setStatus("Candidate matching refreshed; no values have been saved.");
            }}
          >
            Find exact matches
          </button>
        </section>
      )}
      <section aria-label="Document domain routing preview" className="space-y-2 rounded border p-3">
        <h2 className="font-semibold" data-phase="P35.6">Document-to-Domain routing preview</h2>
        <p className="text-sm text-muted-foreground">Based only on exact canonical metric name and unit matches from the existing P36 registry. A single synthetic document can contain several domains. This is a local, read-only suggestion; no classification or link is saved. Unmatched text is not classified.</p>
        {domainProjection.length === 0 ? (
          <p className="text-sm">No exact canonical matches yet. No domain can be proposed.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {domainProjection.map((domain) => (
              <li key={domain.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                <span>{DOMAIN_LABELS[domain.id]} — {domain.count} matched marker(s), {domain.selectedCount} reviewer-selected</span>
                <a className="underline" href={domain.path}>Open {DOMAIN_LABELS[domain.id]} reference page</a>
              </li>
            ))}
          </ul>
        )}
        {boneHints.length > 0 && (
          <div className="space-y-2 rounded border p-3" aria-label="Bone markers awaiting unit review">
            <h3 className="font-semibold">Bone Health — possible catalog names ({boneHints.length}), unit review required</h3>
            <p className="text-sm text-muted-foreground">Exact name-only hints from synthetic document text. The bone catalog does not define approved units. These are NOT accepted measurements, NOT selectable, NOT submitted, and do not count toward domain routing.</p>
            <ul className="space-y-1 text-sm">{boneHints.map((hint, i) => (
              <li key={`${hint.id}-${i}`} className="rounded border p-2"><strong>{hint.name}</strong> ({hint.id}) — <span className="break-words">{hint.excerpt}</span></li>
            ))}</ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground">P35.5 IMM/BSC proposals remain PENDING_NIKOLAS_REVIEW and are not eligible for automatic metric matching. This preview does not populate health-domain timelines or authorize cloud writes.</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">
          Proposed matches ({candidates.length}) — never auto-approved
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="rounded border px-3 py-2 text-sm disabled:opacity-50" disabled={!eligible || candidates.length === 0 || busy} onClick={() => setAllReviewed(!allSelected)}>{allSelected ? "Deselect All" : "Select All"} ({candidates.length})</button>
          <span className="text-xs text-muted-foreground">Selection is not scientific approval. Review every value and unit before confirming.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Reviewed</th>
                <th className="p-2">Catalog ID</th>
                <th className="p-2">Marker</th>
                <th className="p-2">Domain</th>
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
                      onChange={(e) => {
                        setPreviewVisible(false);
                        setReviewerConfirmed(false);
                        setCandidates((cs) =>
                          cs.map((v, j) => (j === i ? { ...v, selected: e.target.checked } : v)),
                        );
                      }}
                    />
                  </td>
                  <td className="p-2">{c.id}</td>
                  <td className="p-2">{c.label}</td>
                  <td className="p-2">{(() => { const d = domainForMetric(c.id); return d ? DOMAIN_LABELS[d] : "Unclassified"; })()}</td>
                  <td className="p-2">
                    <input
                      aria-label={`Value for candidate ${i + 1}`}
                      className="w-24 rounded border bg-background p-1"
                      value={c.value}
                      onChange={(e) => editCandidate(i, { value: e.target.value })}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      aria-label={`Unit for candidate ${i + 1}`}
                      className="w-24 rounded border bg-background p-1"
                      value={c.unit}
                      onChange={(e) => editCandidate(i, { unit: e.target.value })}
                    />
                  </td>
                  <td className="p-2 max-w-xs break-words">{c.excerpt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Mission context is display-only. Review checkboxes are temporary UI state, not scientific
          approval or persistence. No automatic report, trend, or diagnosis.
        </p>
      </section>
      <section className="space-y-3 rounded border p-3" aria-label="Synthetic review handoff">
        <h2 className="font-semibold" data-phase="P36.2B2">Synthetic review handoff (local only)</h2>
        <p className="text-sm">
          This is NOT a cloud import, scientific approval or medical record. Only synthetic test
          values are permitted. A separate security-reviewed server-side approval workflow is
          required for persistence.
        </p>
        <label className="block text-sm" htmlFor="p362-observed-on">
          Synthetic observation date
        </label>
        <input
          id="p362-observed-on"
          className="rounded border bg-background p-2"
          type="date"
          value={observationDate}
          onChange={(event) => {
            setObservationDate(event.target.value);
            setPreviewVisible(false);
          }}
        />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={reviewerConfirmed}
            onChange={(event) => {
              setReviewerConfirmed(event.target.checked);
              setPreviewVisible(false);
            }}
          />
          I manually checked every selected synthetic value, unit and source excerpt. This does not
          constitute scientific approval.
        </label>
        {hasDuplicateMetrics && (
          <p role="alert" className="text-sm">
            Duplicate metric IDs selected. Select only one observation per metric in this handoff.
          </p>
        )}
        {invalidSelectedValues && (
          <p role="alert" className="text-sm">
            A selected candidate has an invalid value or empty unit after manual correction. Correct
            it or deselect the row before export.
          </p>
        )}
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          disabled={!canExport}
          onClick={exportReviewedBatch}
        >
          Export synthetic review JSON locally ({selected.length})
        </button>
        <p role="status" className="text-sm">
          {exportStatus}
        </p>
      </section>
      <section
        aria-label="P36.4 controlled cloud submission"
        className="space-y-3 rounded border p-3"
      >
        <h2 className="font-semibold" data-phase="P36.4">Synthetic Cloud Submission</h2>
        {cloudEnabled ? (
          <>
            <p className="text-sm">
              Owner-activated synthetic-only submission. The server re-checks your active Crew Self
              membership, mission and crew scope, exact catalog units and duplicates. Batches stay
              pending review; nothing is approved or interpreted.
            </p>
            <button
              type="button"
              className="rounded border px-3 py-2 text-sm disabled:opacity-50"
              disabled={!canExport || !sourceSha256 || cloudBusy}
              onClick={() => void submitToCloud()}
            >
              {cloudBusy
                ? "Submitting synthetic batch…"
                : `Save reviewed synthetic measurements to Cloud (${selected.length})`}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm">
              Cloud submission is not active in this deployment. The staged review schema has not
              been applied to the shared database. Signing in verifies identity but does not
              activate the pending database schema or server-side authorization service.
            </p>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="rounded border px-3 py-2 text-sm opacity-50"
            >
              Submit reviewed synthetic measurements to Cloud — pending activation
            </button>
          </>
        )}
        {cloudStatus && (
          <p role="status" className="text-sm">
            {cloudStatus}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Local preview and JSON export remain available. Original documents are never uploaded by
          this page; only a SHA-256 fingerprint and reviewed values are sent. No browser database
          writes.
        </p>
      </section>
      <section
        aria-label="P36.3 local synthetic research preview"
        className="space-y-3 rounded border p-3"
      >
        <h2 className="font-semibold" data-phase="P36.3">Synthetic research preview (local only)</h2>
        <p className="text-sm text-muted-foreground">
          This is a temporary visualization of manually selected synthetic measurements, not a
          clinical interpretation, approved observation, trend or server record. No cloud write.
        </p>
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          disabled={!canExport} onClick={() => setPreviewVisible(true)}
        >
          Preview reviewed synthetic measurements ({selected.length})
        </button>
        {previewVisible && canExport && (
          <div className="space-y-2" role="region" aria-label="Local synthetic biomarker preview">
            <p className="text-sm">
              Mission: {missionId} · Crew: {crewMemberId} · Synthetic date: {observationDate}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Biomarker</th>
                    <th className="p-2">Synthetic value</th>
                    <th className="p-2">Exact unit</th>
                    <th className="p-2">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {previewObservations.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-2">
                        {item.label} ({item.id})
                      </td>
                      <td className="p-2">{item.value}</td>
                      <td className="p-2">{item.unit}</td>
                      <td className="p-2 max-w-xs break-words">{item.excerpt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              LOCAL_REVIEW_ONLY_NOT_APPROVED_FOR_IMPORT · No reference-range interpretation,
              diagnosis, automatic scoring, trend or persistence.
            </p>
          </div>
        )}
      </section>
      <section className="space-y-3 rounded border p-3" aria-label="Astronaut saved synthetic reviews">
        <h2 className="font-semibold">Astronaut saved reviews — by observation date</h2>
        <p className="text-sm text-muted-foreground">Only synthetic pending-review batches saved in Cloud for the currently signed-in Crew Self and selected mission. No original PDFs or scientific approval.</p>
        <button type="button" className="rounded border px-3 py-2 text-sm disabled:opacity-50" disabled={!eligible || !cloudEnabled || historyBusy} onClick={() => void refreshSavedHistory()}>{historyBusy ? "Loading saved reviews…" : "Refresh saved reviews"}</button>
        {!cloudEnabled && <p className="text-sm" role="status">Cloud history pending owner-approved activation; nothing is saved to Cloud yet.</p>}
        <p className="text-sm" role="status">{historyStatus}</p>
        {savedHistory.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Observation date</th><th className="p-2">Saved at</th><th className="p-2">Markers</th><th className="p-2">Review status</th><th className="p-2">Batch ID</th></tr></thead><tbody>{savedHistory.map((record) => <tr key={record.batchId} className="border-t"><td className="p-2">{record.observedOn}</td><td className="p-2">{record.createdAt}</td><td className="p-2">{record.itemCount}</td><td className="p-2">{record.status}</td><td className="p-2 font-mono text-xs">{record.batchId}</td></tr>)}</tbody></table></div>}
      </section>
      <button
        type="button"
        className="rounded border px-3 py-2 text-sm"
        onClick={() => {
          setReviewerConfirmed(false);
          setObservationDate("");
          setExportStatus("");
          setPreviewVisible(false);
          setText("");
          setCandidates([]);
          setSource("");
          setSourceSha256("");
          setCloudStatus("");
          setStatus("Local document cleared from this page.");
        }}
      >
        Clear local document
      </button>
    </main>
  );
}
