import type { ReactNode } from "react";
import type { MeasurementProfile } from "@/domain/health-measurements/profiles";
import { MeasurementProfileContext } from "@/components/measurement-profile-hook";

export function MeasurementProfileProvider({ profile, children }: { profile: MeasurementProfile; children: ReactNode }) {
  return <MeasurementProfileContext.Provider value={profile}>{children}</MeasurementProfileContext.Provider>;
}
