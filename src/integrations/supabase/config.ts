/**
 * Browser-safe Supabase configuration preflight.
 *
 * Only publishable (browser-safe) configuration is read here. The service-role
 * key is never referenced, imported or exposed by this module.
 *
 * Client bundles receive `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
 * at build time; SSR falls back to `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`.
 */

export interface SupabaseBrowserConfigStatus {
  configured: boolean;
  url?: string;
  publishableKey?: string;
  missing: string[];
}

/**
 * Static `import.meta.env.VITE_*` member reads are required: Vite only inlines
 * literal accesses into the client bundle. A computed lookup such as
 * `import.meta.env[key]` is never statically replaced and therefore resolves to
 * `undefined` in the published browser bundle.
 */
const RUNTIME_GLOBAL = "__SUPABASE_BROWSER_CONFIG__";

interface InjectedBrowserConfig {
  url?: string;
  publishableKey?: string;
}

function injected(): InjectedBrowserConfig {
  const scope = globalThis as Record<string, unknown>;
  const value = scope[RUNTIME_GLOBAL];
  return value && typeof value === "object" ? (value as InjectedBrowserConfig) : {};
}

function pick(viteValue: unknown, serverKey: string, runtimeValue: unknown): string | undefined {
  if (typeof viteValue === "string" && viteValue.trim()) return viteValue.trim();

  const processEnv =
    typeof process !== "undefined" && process.env ? process.env[serverKey] : undefined;
  if (typeof processEnv === "string" && processEnv.trim()) return processEnv.trim();

  if (typeof runtimeValue === "string" && runtimeValue.trim()) return runtimeValue.trim();

  return undefined;
}

/**
 * Server-rendered inline script that hands the browser the publishable (never
 * secret) configuration when the client build did not receive
 * `VITE_SUPABASE_*` at build time. Only publishable values are serialized.
 */
export function supabaseBrowserConfigScript(): string {
  const url =
    typeof process !== "undefined" && process.env ? process.env["SUPABASE_URL"] : undefined;
  const publishableKey =
    typeof process !== "undefined" && process.env
      ? process.env["SUPABASE_PUBLISHABLE_KEY"]
      : undefined;

  const payload: InjectedBrowserConfig = {
    ...(typeof url === "string" && url.trim() ? { url: url.trim() } : {}),
    ...(typeof publishableKey === "string" &&
    publishableKey.trim() &&
    !publishableKey.startsWith("sb_secret_")
      ? { publishableKey: publishableKey.trim() }
      : {}),
  };

  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `window.${RUNTIME_GLOBAL}=Object.assign(window.${RUNTIME_GLOBAL}||{},${json});`;
}

export function getSupabaseBrowserConfigStatus(): SupabaseBrowserConfigStatus {
  const runtime = injected();
  const url = pick(import.meta.env["VITE_SUPABASE_URL"], "SUPABASE_URL", runtime.url);
  const publishableKey = pick(
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
    "SUPABASE_PUBLISHABLE_KEY",
    runtime.publishableKey,
  );

  const missing = [
    ...(url ? [] : ["VITE_SUPABASE_URL"]),
    ...(publishableKey ? [] : ["VITE_SUPABASE_PUBLISHABLE_KEY"]),
  ];

  return {
    configured: missing.length === 0,
    ...(url ? { url } : {}),
    ...(publishableKey ? { publishableKey } : {}),
    missing,
  };
}

export function supabaseConfigurationMessage(): string {
  const { missing } = getSupabaseBrowserConfigStatus();
  if (!missing.length) return "Supabase browser configuration is present.";
  return `Cloud synchronization is not configured for this deployment. Missing browser-safe Supabase configuration: ${missing.join(", ")}.`;
}
