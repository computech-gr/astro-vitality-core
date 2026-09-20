import type { MobileHealthBridge, MobileHealthRecord } from "./mobile-health-bridge";

interface NativeHealthConnectStatus {
  available: boolean;
  message?: string;
}

interface NativeHealthConnectReadResponse {
  records: MobileHealthRecord[];
  cursor?: string;
}

interface AndroidHealthConnectJavascriptInterface {
  sourceId(): string;
  displayName(): string;
  availableMetricCodes(): string;
  readRecords(metricCodesJson: string, cursor: string): string;
  cursor(): string;
  health(): string;
}

declare global {
  interface Window {
    MitochondriaHealthConnect?: AndroidHealthConnectJavascriptInterface;
  }
}

const POLL_INTERVAL_MS = 5_000;

function nativeBridge(): AndroidHealthConnectJavascriptInterface | undefined {
  return typeof window !== "undefined" ? window.MitochondriaHealthConnect : undefined;
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Android Health Connect bridge returned invalid ${label} JSON`);
  }
}

async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Native companion currently exposes reviewed canonical `phys.heart_rate` records only. */
/** True only inside the signed Android companion WebView. Regular browsers return false. */
export function isAndroidHealthConnectBridgeAvailable(): boolean {
  return Boolean(nativeBridge());
}

/**
 * Browser-side wrapper for the native Android companion bridge.
 *
 * Health Connect is not a web API. This wrapper intentionally fails closed in
 * Chrome/Samsung Internet and becomes available only when the Android companion
 * injects the MitochondriaHealthConnect JavascriptInterface.
 */
export class AndroidHealthConnectJsBridge implements MobileHealthBridge {
  private latestCursor?: string;

  async sourceId(): Promise<string> {
    const bridge = this.requireBridge();
    return bridge.sourceId();
  }

  async displayName(): Promise<string> {
    const bridge = this.requireBridge();
    return bridge.displayName();
  }

  async availableMetricCodes(): Promise<string[]> {
    const bridge = this.requireBridge();
    const codes = parseJson<unknown>(bridge.availableMetricCodes(), "available metric codes");
    if (!Array.isArray(codes) || codes.some((value) => typeof value !== "string")) {
      throw new Error("Android Health Connect bridge returned an invalid metric-code list");
    }
    return codes;
  }

  async *readRecords(options: {
    metricCodes: string[];
    cursor?: string;
    signal?: AbortSignal;
  }): AsyncIterable<MobileHealthRecord> {
    const bridge = this.requireBridge();
    let cursor = options.cursor ?? this.latestCursor ?? "";

    while (!options.signal?.aborted) {
      const response = parseJson<NativeHealthConnectReadResponse>(
        bridge.readRecords(JSON.stringify(options.metricCodes), cursor),
        "record response",
      );
      if (!Array.isArray(response.records)) {
        throw new Error("Android Health Connect bridge returned records in an invalid shape");
      }
      for (const record of response.records) yield record;
      if (response.cursor) {
        cursor = response.cursor;
        this.latestCursor = response.cursor;
      } else {
        const nativeCursor = bridge.cursor();
        if (nativeCursor) {
          cursor = nativeCursor;
          this.latestCursor = nativeCursor;
        }
      }
      await wait(POLL_INTERVAL_MS, options.signal);
    }
  }

  async cursor(): Promise<string | undefined> {
    const bridge = this.requireBridge();
    const cursor = bridge.cursor();
    if (cursor) this.latestCursor = cursor;
    return this.latestCursor;
  }

  async health(): Promise<NativeHealthConnectStatus> {
    const bridge = nativeBridge();
    if (!bridge) {
      return {
        available: false,
        message: "Health Connect requires the Mitochondria Android companion; it is not directly exposed to the browser.",
      };
    }
    return parseJson<NativeHealthConnectStatus>(bridge.health(), "health status");
  }

  private requireBridge(): AndroidHealthConnectJavascriptInterface {
    const bridge = nativeBridge();
    if (!bridge) {
      throw new Error(
        "Android Health Connect bridge is unavailable. Open the published site inside the Mitochondria Android companion.",
      );
    }
    return bridge;
  }
}

export function createAndroidHealthConnectJsBridge(): MobileHealthBridge {
  return new AndroidHealthConnectJsBridge();
}
