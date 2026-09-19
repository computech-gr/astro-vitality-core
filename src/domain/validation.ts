import type {
  CanonicalObservation,
  CrewAssignment,
  CrewMember,
  DomainValidationIssue,
  DomainValidationResult,
  Mission,
  ObservationValue,
  ObservationValueKind,
  PersonalBaselineDefinition,
  ScientificSignalDefinition,
  ObservationEnvelope,
  ObservationInterpretation,
} from "./contracts";

function isIsoInstant(value: string): boolean {
  if (!value || Number.isNaN(Date.parse(value))) return false;
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
}

function countPopulatedValueFields(value: ObservationValue): number {
  return [value.number, value.boolean, value.text, value.category].filter((entry) => entry !== undefined).length;
}

function valueMatchesKind(value: ObservationValue, kind: ObservationValueKind): boolean {
  if (countPopulatedValueFields(value) !== 1) return false;
  switch (kind) {
    case "number":
      return typeof value.number === "number" && Number.isFinite(value.number);
    case "boolean":
      return typeof value.boolean === "boolean";
    case "text":
      return typeof value.text === "string" && value.text.trim().length > 0;
    case "category":
      return typeof value.category === "string" && value.category.trim().length > 0;
  }
}

export function validateCanonicalObservation(observation: CanonicalObservation): DomainValidationResult {
  const issues: DomainValidationIssue[] = [];

  if (!observation.id.trim()) issues.push({ path: "id", message: "Observation id is required" });
  if (!observation.mission.missionId.trim()) issues.push({ path: "mission.missionId", message: "Mission id is required" });
  if (!observation.mission.crewMemberId.trim()) issues.push({ path: "mission.crewMemberId", message: "Crew member id is required" });
  if (!observation.source.sourceId.trim()) issues.push({ path: "source.sourceId", message: "Source id is required" });
  if (!observation.metric.code.trim()) issues.push({ path: "metric.code", message: "Metric code is required" });
  if (!observation.metric.displayName.trim()) issues.push({ path: "metric.displayName", message: "Metric display name is required" });
  if (!valueMatchesKind(observation.value, observation.metric.valueKind)) {
    issues.push({ path: "value", message: `Observation value must contain exactly one ${observation.metric.valueKind} value` });
  }
  if (observation.metric.valueKind === "number" && !observation.metric.unit?.trim()) {
    issues.push({ path: "metric.unit", message: "Numeric observations require an explicit unit" });
  }
  if (!isIsoInstant(observation.observedAt)) {
    issues.push({ path: "observedAt", message: "Observed time must be an ISO-8601 instant with timezone" });
  }
  if (!isIsoInstant(observation.provenance.capturedAt)) {
    issues.push({ path: "provenance.capturedAt", message: "Capture time must be an ISO-8601 instant with timezone" });
  }
  if (observation.quality.score !== undefined && (observation.quality.score < 0 || observation.quality.score > 1)) {
    issues.push({ path: "quality.score", message: "Quality score must be between 0 and 1" });
  }
  if (!observation.provenance.ingestionId.trim()) {
    issues.push({ path: "provenance.ingestionId", message: "Ingestion id is required" });
  }
  if (observation.provenance.kind === "derived") {
    if (!observation.provenance.derivationMethod?.trim()) {
      issues.push({ path: "provenance.derivationMethod", message: "Derived observations require a derivation method" });
    }
    if (observation.provenance.inputObservationIds.length === 0) {
      issues.push({ path: "provenance.inputObservationIds", message: "Derived observations require input observation ids" });
    }
  } else if (observation.provenance.inputObservationIds.length > 0) {
    issues.push({ path: "provenance.inputObservationIds", message: "Only derived observations may reference input observations" });
  }

  return { valid: issues.length === 0, issues };
}

export function validateScientificSignalDefinition(definition: ScientificSignalDefinition): DomainValidationResult {
  const issues: DomainValidationIssue[] = [];
  if (!definition.id.trim()) issues.push({ path: "id", message: "Signal definition id is required" });
  if (!definition.description.trim()) issues.push({ path: "description", message: "Description is required" });
  if (!definition.intendedUse.trim()) issues.push({ path: "intendedUse", message: "Intended use is required" });
  if (!definition.version.trim()) issues.push({ path: "version", message: "Version is required" });
  if (definition.nonDiagnostic !== true) issues.push({ path: "nonDiagnostic", message: "P3 signal definitions must remain explicitly non-diagnostic" });
  if (definition.evidence.length === 0) issues.push({ path: "evidence", message: "At least one evidence reference is required" });
  for (const [index, evidence] of definition.evidence.entries()) {
    if (!evidence.citationId.trim()) issues.push({ path: `evidence[${index}].citationId`, message: "Citation id is required" });
    if (!/^https:\/\//.test(evidence.url)) issues.push({ path: `evidence[${index}].url`, message: "Evidence URL must use HTTPS" });
  }
  return { valid: issues.length === 0, issues };
}

export function validatePersonalBaselineDefinition(definition: PersonalBaselineDefinition): DomainValidationResult {
  const issues: DomainValidationIssue[] = [];
  if (definition.strategy !== "individual_longitudinal") {
    issues.push({ path: "strategy", message: "P3 baselines must be individual longitudinal baselines" });
  }
  if (definition.minimumObservations < 1 || !Number.isInteger(definition.minimumObservations)) {
    issues.push({ path: "minimumObservations", message: "Minimum observations must be a positive integer" });
  }
  if (!(definition.minimumCoverageHours > 0)) {
    issues.push({ path: "minimumCoverageHours", message: "Minimum coverage hours must be positive" });
  }
  for (const [path, value] of [
    ["id", definition.id],
    ["metricCode", definition.metricCode],
    ["algorithmId", definition.algorithmId],
    ["algorithmVersion", definition.algorithmVersion],
    ["qualityPolicyId", definition.qualityPolicyId],
    ["version", definition.version],
  ] as const) {
    if (!value.trim()) issues.push({ path, message: `${path} is required` });
  }
  return { valid: issues.length === 0, issues };
}


export function validateCrewMember(member: CrewMember): DomainValidationResult {
  const issues: DomainValidationIssue[] = [];
  if (!member.id.trim()) issues.push({ path: "id", message: "Crew member id is required" });
  if (!member.displayName.trim()) issues.push({ path: "displayName", message: "Crew member display name is required" });
  if (!isIsoInstant(member.createdAt)) issues.push({ path: "createdAt", message: "Crew member createdAt must be an ISO-8601 instant with timezone" });
  if (!isIsoInstant(member.updatedAt)) issues.push({ path: "updatedAt", message: "Crew member updatedAt must be an ISO-8601 instant with timezone" });
  return { valid: issues.length === 0, issues };
}

export function validateMission(mission: Mission): DomainValidationResult {
  const issues: DomainValidationIssue[] = [];
  if (!mission.id.trim()) issues.push({ path: "id", message: "Mission id is required" });
  if (!mission.code.trim()) issues.push({ path: "code", message: "Mission code is required" });
  if (!mission.name.trim()) issues.push({ path: "name", message: "Mission name is required" });
  if (!isIsoInstant(mission.createdAt)) issues.push({ path: "createdAt", message: "Mission createdAt must be an ISO-8601 instant with timezone" });
  if (!isIsoInstant(mission.updatedAt)) issues.push({ path: "updatedAt", message: "Mission updatedAt must be an ISO-8601 instant with timezone" });
  if (mission.startsAt && !isIsoInstant(mission.startsAt)) issues.push({ path: "startsAt", message: "Mission startsAt must be an ISO-8601 instant with timezone" });
  if (mission.endsAt && !isIsoInstant(mission.endsAt)) issues.push({ path: "endsAt", message: "Mission endsAt must be an ISO-8601 instant with timezone" });
  if (mission.startsAt && mission.endsAt && Date.parse(mission.endsAt) < Date.parse(mission.startsAt)) {
    issues.push({ path: "endsAt", message: "Mission end cannot precede mission start" });
  }
  return { valid: issues.length === 0, issues };
}

export function validateCrewAssignment(assignment: CrewAssignment): DomainValidationResult {
  const issues: DomainValidationIssue[] = [];
  for (const [path, value] of [["id", assignment.id], ["missionId", assignment.missionId], ["crewMemberId", assignment.crewMemberId]] as const) {
    if (!value.trim()) issues.push({ path, message: `${path} is required` });
  }
  if (!isIsoInstant(assignment.activeFrom)) issues.push({ path: "activeFrom", message: "Assignment activeFrom must be an ISO-8601 instant with timezone" });
  if (assignment.activeUntil && !isIsoInstant(assignment.activeUntil)) issues.push({ path: "activeUntil", message: "Assignment activeUntil must be an ISO-8601 instant with timezone" });
  if (assignment.activeUntil && Date.parse(assignment.activeUntil) < Date.parse(assignment.activeFrom)) {
    issues.push({ path: "activeUntil", message: "Assignment end cannot precede assignment start" });
  }
  return { valid: issues.length === 0, issues };
}


export function validateObservationEnvelope(envelope: ObservationEnvelope): DomainValidationResult {
  const issues: DomainValidationIssue[] = [];
  if (!envelope.metricDefinitionVersion.trim()) issues.push({ path: "metricDefinitionVersion", message: "Metric definition version is required" });
  if (envelope.context.completeness !== undefined && (envelope.context.completeness < 0 || envelope.context.completeness > 1)) {
    issues.push({ path: "context.completeness", message: "Context completeness must be between 0 and 1" });
  }
  return { valid: issues.length === 0, issues };
}

export function validateObservationInterpretation(interpretation: ObservationInterpretation): DomainValidationResult {
  const issues: DomainValidationIssue[] = [];
  if (!interpretation.observationId.trim()) issues.push({ path: "observationId", message: "Observation id is required" });
  if (!interpretation.metricCode.trim()) issues.push({ path: "metricCode", message: "Metric code is required" });
  if (interpretation.interpretationTier === "research_only" && interpretation.actionClass !== "none") {
    issues.push({ path: "actionClass", message: "Research-only metrics cannot produce an operational action class" });
  }
  if (interpretation.operationalLimit) {
    if (!interpretation.operationalLimit.authority.trim()) issues.push({ path: "operationalLimit.authority", message: "Operational limits require an authority" });
    if (!interpretation.operationalLimit.sourceId.trim()) issues.push({ path: "operationalLimit.sourceId", message: "Operational limits require a source id" });
    if (!interpretation.operationalLimit.version.trim()) issues.push({ path: "operationalLimit.version", message: "Operational limits require a version" });
  }
  if (interpretation.referenceInterval && !interpretation.referenceInterval.sourceId.trim()) {
    issues.push({ path: "referenceInterval.sourceId", message: "Reference intervals require a source id" });
  }
  if (interpretation.uncertainty?.modelConfidence !== undefined && (interpretation.uncertainty.modelConfidence < 0 || interpretation.uncertainty.modelConfidence > 1)) {
    issues.push({ path: "uncertainty.modelConfidence", message: "Model confidence must be between 0 and 1" });
  }
  return { valid: issues.length === 0, issues };
}
