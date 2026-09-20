import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface OAuthClientDetails {
  client?: { name?: string } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
}

interface OAuthApi {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthClientDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthClientDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthClientDetails | null; error: { message: string } | null }>;
}

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id: typeof search["authorization_id"] === "string" ? search["authorization_id"] : "",
  }),
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id");
    if (!authorizationId) throw new Error("Missing authorization_id");
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return { session: false as const };
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return { session: true as const, details: data };
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-xl px-6 py-24">
      <h1 className="font-display text-2xl text-foreground">Authorization request could not be loaded</h1>
      <p className="mt-4 text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
    </main>
  ),
});

function Consent() {
  const loaded = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    window.location.reload();
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (oauthError) {
      setBusy(false);
      setError(oauthError.message);
    }
  }

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: decisionError } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (decisionError) {
      setBusy(false);
      setError(decisionError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  if (!loaded.session) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="font-display text-2xl text-foreground">Sign in to continue</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign in with your mission account to review this connection request.
        </p>
        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <form onSubmit={signIn} className="mt-6 space-y-4">
          <label className="block text-sm text-muted-foreground">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            />
          </label>
          <label className="block text-sm text-muted-foreground">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Sign in
          </button>
        </form>
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy}
          className="mt-3 w-full rounded-md border border-border px-4 py-2 text-sm text-foreground disabled:opacity-60"
        >
          Continue with Google
        </button>
      </main>
    );
  }

  const clientName = loaded.details?.client?.name ?? "this client";

  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <h1 className="font-display text-2xl text-foreground">Connect {clientName} to your mission account</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        {clientName} will be able to use The Mitochondria&rsquo;s read-only agent tools as you. It can read only what your
        mission role already authorizes, and it receives no raw physiological values.
      </p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(true)}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(false)}
          className="rounded-md border border-border px-5 py-2 text-sm text-foreground disabled:opacity-60"
        >
          Deny
        </button>
      </div>
    </main>
  );
}
