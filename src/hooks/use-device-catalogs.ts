/**
 * P72.7 hydration-safe reads of the device catalog runtimes. The server render
 * never has device catalogs, so the server snapshot is always the empty value;
 * React then re-renders with the loaded catalogs right after hydration instead
 * of failing hydration ("display-sync" mismatch) when they load first.
 */
import { useSyncExternalStore } from "react";
import {
  getActiveCatalog,
  getServerActiveCatalog,
  subscribeActiveCatalog,
} from "@/domain/health-intelligence/active-catalog-runtime";
import {
  getServerSyntheticDemoCatalogs,
  getSyntheticDemoCatalogs,
  subscribeSyntheticDemoCatalogs,
} from "@/domain/health-intelligence/synthetic-demo-catalog-runtime";

export function useSyntheticDemoCatalogs() {
  return useSyncExternalStore(
    subscribeSyntheticDemoCatalogs,
    getSyntheticDemoCatalogs,
    getServerSyntheticDemoCatalogs,
  );
}

export function useActiveCatalog() {
  return useSyncExternalStore(subscribeActiveCatalog, getActiveCatalog, getServerActiveCatalog);
}
