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

function readEnv(viteKey: string, serverKey: string): string | undefined {
  const viteValue = import.meta.env[viteKey as keyof ImportMetaEnv];
  if (typeof viteValue === 'string' && viteValue.trim()) return viteValue.trim();

  const processEnv =
    typeof process !== 'undefined' && process.env ? process.env[serverKey] : undefined;
  if (typeof processEnv === 'string' && processEnv.trim()) return processEnv.trim();

  return undefined;
}

export function getSupabaseBrowserConfigStatus(): SupabaseBrowserConfigStatus {
  const url = readEnv('VITE_SUPABASE_URL', 'SUPABASE_URL');
  const publishableKey = readEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY');

  const missing = [
    ...(url ? [] : ['VITE_SUPABASE_URL']),
    ...(publishableKey ? [] : ['VITE_SUPABASE_PUBLISHABLE_KEY']),
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
  if (!missing.length) return 'Supabase browser configuration is present.';
  return `Cloud synchronization is not configured for this deployment. Missing browser-safe Supabase configuration: ${missing.join(', ')}.`;
}
