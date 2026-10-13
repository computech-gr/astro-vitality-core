import { supabase } from '@/integrations/supabase/client';

/** Authenticated, one-time RPC; never persist or log the bootstrap secret. */
export async function activateFirstMission(input: { code: string; name: string; secret: string }) {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) throw new Error('Mission code must contain 3–32 letters, digits, underscores or hyphens.');
  if (name.length < 3 || name.length > 120) throw new Error('Mission name must contain 3–120 characters.');
  if (input.secret.length < 32) throw new Error('A valid one-time bootstrap secret is required.');
  const { data: user, error: authError } = await supabase.auth.getUser();
  if (authError || !user.user) throw new Error('Sign in with a confirmed operator account first.');
  const { error } = await supabase.rpc('bootstrap_first_mission', {
    p_code: code,
    p_name: name,
    p_bootstrap_secret: input.secret,
  });
  if (error) throw new Error(error.message);
}

/** The backend is authoritative; errors must never enable bootstrap UI. */
export interface FirstOperatorBootstrapStatus {
  operatorExists: boolean;
  bootstrapArmed: boolean;
  bootstrapConsumed: boolean;
}

export function parseFirstOperatorBootstrapStatus(value: unknown): FirstOperatorBootstrapStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const operatorExists = v['operator_exists'];
  const bootstrapArmed = v['bootstrap_armed'];
  const bootstrapConsumed = v['bootstrap_consumed'];
  if (typeof operatorExists !== 'boolean' || typeof bootstrapArmed !== 'boolean' || typeof bootstrapConsumed !== 'boolean') return null;
  return { operatorExists, bootstrapArmed, bootstrapConsumed };
}

export async function loadFirstOperatorBootstrapStatus(): Promise<FirstOperatorBootstrapStatus | null> {
  try {
    const { data, error } = await supabase.rpc('get_mission_bootstrap_status');
    if (error) return null;
    return parseFirstOperatorBootstrapStatus(data);
  } catch {
    return null;
  }
}
