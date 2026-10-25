/**
 * Structured, sanitized server diagnostics for the single synthetic provider request.
 * Records only identifiers, stages, timings, HTTP status and allow-listed provider codes:
 * never API keys, authorization headers, prompts, medical values or raw provider bodies.
 */
export type ProviderStage =
  | "dispatch_permit"
  | "provider_transmit"
  | "provider_status"
  | "provider_error_body"
  | "provider_response_parse"
  | "usage_validation"
  | "output_budget"
  | "answer_validation"
  | "evidence_recheck"
  | "finish"
  | "complete";

export type ExceptionClass =
  | "illegal_invocation"
  | "timeout"
  | "aborted"
  | "network"
  | "json_parse"
  | "validation"
  | "runtime";

export type TransmissionState = "not_attempted" | "not_transmitted" | "unknown" | "responded";

export interface ProviderDiagnosticEvent {
  event: "mitochondria.synthetic_provider";
  correlationId: string;
  attemptId: string | null;
  stage: ProviderStage;
  failureStage: ProviderStage | null;
  transmission: TransmissionState;
  providerStatus: number | null;
  providerRequestId: string | null;
  providerErrorCode: string | null;
  providerErrorType: string | null;
  exceptionName: string | null;
  exceptionClass: ExceptionClass | null;
  outcome: string;
  elapsedMs: number;
  providerElapsedMs: number | null;
}

const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,80}$/;
const SAFE_NAMES = new Set([
  "TypeError",
  "SyntaxError",
  "RangeError",
  "Error",
  "TimeoutError",
  "AbortError",
  "DOMException",
]);

/** Accept only short identifier-shaped provider codes; anything else is dropped. */
export function sanitizeProviderToken(value: unknown): string | null {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : null;
}

/** Classify a thrown value without recording its free-text message. */
export function classifyException(error: unknown, stage: ProviderStage): ExceptionClass {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  const message = error instanceof Error || error instanceof DOMException ? error.message : "";
  if (/illegal invocation/i.test(message)) return "illegal_invocation";
  if (name === "TimeoutError") return "timeout";
  if (name === "AbortError") return "aborted";
  if (stage === "provider_response_parse" || name === "SyntaxError") return "json_parse";
  if (stage === "provider_transmit" && name === "TypeError") return "network";
  if (
    stage === "usage_validation" ||
    stage === "output_budget" ||
    stage === "answer_validation" ||
    stage === "evidence_recheck"
  )
    return "validation";
  return "runtime";
}

export function safeExceptionName(error: unknown): string | null {
  const name = error instanceof Error || error instanceof DOMException ? error.name : null;
  return name && SAFE_NAMES.has(name) ? name : name ? "OtherError" : null;
}

/**
 * Illegal-invocation is raised by the runtime before any socket opens, so it is
 * the only exception at the transmit stage that proves nothing reached the provider.
 */
export function transmissionAfterException(
  stage: ProviderStage,
  cls: ExceptionClass,
): TransmissionState {
  if (stage === "dispatch_permit") return "not_attempted";
  if (stage === "provider_transmit")
    return cls === "illegal_invocation" ? "not_transmitted" : "unknown";
  return "responded";
}

export function createProviderDiagnostics(
  correlationId: string,
  attemptId: string | null,
  clock: () => number = () => Date.now(),
) {
  const started = clock();
  let providerStarted: number | null = null;
  let providerElapsed: number | null = null;
  const state = {
    stage: "dispatch_permit" as ProviderStage,
    failureStage: null as ProviderStage | null,
    transmission: "not_attempted" as TransmissionState,
    providerStatus: null as number | null,
    providerRequestId: null as string | null,
    providerErrorCode: null as string | null,
    providerErrorType: null as string | null,
    exceptionName: null as string | null,
    exceptionClass: null as ExceptionClass | null,
  };
  return {
    stage(next: ProviderStage) {
      if (next === "provider_transmit") providerStarted = clock();
      if (next === "provider_status" && providerStarted !== null)
        providerElapsed = clock() - providerStarted;
      state.stage = next;
    },
    response(status: number, requestId: string | null) {
      state.transmission = "responded";
      state.providerStatus = Number.isInteger(status) ? status : null;
      state.providerRequestId = sanitizeProviderToken(requestId);
    },
    providerError(body: unknown) {
      const error =
        body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
      const e = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
      state.providerErrorCode = sanitizeProviderToken(e["code"]);
      state.providerErrorType = sanitizeProviderToken(e["type"]);
    },
    exception(error: unknown) {
      const cls = classifyException(error, state.stage);
      state.failureStage = state.stage;
      state.exceptionClass = cls;
      state.exceptionName = safeExceptionName(error);
      if (state.transmission !== "responded")
        state.transmission = transmissionAfterException(state.stage, cls);
      if (providerStarted !== null && providerElapsed === null)
        providerElapsed = clock() - providerStarted;
    },
    fail(stage?: ProviderStage) {
      state.failureStage = stage ?? state.stage;
    },
    get transmission() {
      return state.transmission;
    },
    event(outcome: string): ProviderDiagnosticEvent {
      return {
        event: "mitochondria.synthetic_provider",
        correlationId,
        attemptId,
        ...state,
        outcome,
        elapsedMs: clock() - started,
        providerElapsedMs: providerElapsed,
      };
    },
  };
}

export const defaultDiagnosticLog = (event: ProviderDiagnosticEvent) => {
  const line = JSON.stringify(event);
  if (event.failureStage) console.error(line);
  else console.info(line);
};
