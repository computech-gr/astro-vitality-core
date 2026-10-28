import { createContext, useContext, type ReactNode } from "react";
import { BONE_MEASUREMENT_PROFILE, type MeasurementProfile } from "@/domain/health-measurements/profiles";

const MeasurementProfileContext = createContext<MeasurementProfile>(BONE_MEASUREMENT_PROFILE);

export function MeasurementProfileProvider({ profile, children }: { profile: MeasurementProfile; children: ReactNode }) {
  return <MeasurementProfileContext.Provider value={profile}>{children}</MeasurementProfileContext.Provider>;
}

/** Defaults to Bone so existing Bone components keep their exact behavior. */
export function useMeasurementProfile(): MeasurementProfile {
  return useContext(MeasurementProfileContext);
}
