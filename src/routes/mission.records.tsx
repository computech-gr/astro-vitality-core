import { createFileRoute } from "@tanstack/react-router";
import { RecordedMissionDataPage } from "@/components/recorded-mission-data";
import { operationalRouteHead } from "@/infrastructure/seo";

const title = "Recorded Mission Data | The Mitochondria";
const description = "Encrypted local mission-history review with governed Supabase synchronization and RLS-authorized cloud telemetry.";

export const Route = createFileRoute("/mission/records")({
  head: () => operationalRouteHead({ path: "/mission/records", title, description }),
  component: RecordedMissionDataPage,
});
