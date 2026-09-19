export async function registerOfflineServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return undefined;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (error) {
    console.warn("Offline service worker registration failed", error);
    return undefined;
  }
}
