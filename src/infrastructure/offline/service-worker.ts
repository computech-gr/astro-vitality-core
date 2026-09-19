/**
 * Offline shell registration boundary.
 *
 * The service worker is deliberately refused in development, iframes and
 * Lovable preview/published hosts: browser-held caches there can keep serving
 * stale HTML after a deploy. In any refused context an existing registration
 * for /sw.js is unregistered instead.
 */

function isRefusedOfflineContext(): boolean {
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  if (new URL(window.location.href).searchParams.get("sw") === "off") return true;

  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  return [
    "lovableproject.com",
    "lovableproject-dev.com",
    "beta.lovable.dev",
    "lovable.app",
  ].some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

async function unregisterOfflineServiceWorker(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((registration) =>
        (registration.active ?? registration.waiting ?? registration.installing)?.scriptURL.endsWith(
          "/sw.js",
        ),
      )
      .map((registration) => registration.unregister()),
  );
}

export async function registerOfflineServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return undefined;

  if (isRefusedOfflineContext()) {
    await unregisterOfflineServiceWorker();
    return undefined;
  }

  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    console.warn("Offline service worker registration failed", error);
    return undefined;
  }
}
