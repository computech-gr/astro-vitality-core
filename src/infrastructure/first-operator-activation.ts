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
