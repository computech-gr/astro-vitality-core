import { supabase } from "@/integrations/supabase/client";

/**
 * OAuth consent helpers shared by the consent route's loader and component. Kept in its own module:
 * TanStack's route code-splitting cannot share a non-exported helper between the two, which broke
 * hydration of every page in the dev preview.
 */
export interface OAuthClientDetails {
  client?: { name?: string } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
}

export interface OAuthApi {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthClientDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthClientDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthClientDetails | null; error: { message: string } | null }>;
}

export function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

