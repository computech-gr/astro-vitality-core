import { createContext, useContext } from "react";
import { BONE_MEASUREMENT_PROFILE, type MeasurementProfile } from "@/domain/health-measurements/profiles";

export const MeasurementProfileContext = createContext<MeasurementProfile>(BONE_MEASUREMENT_PROFILE);

/** Defaults to Bone so existing Bone components keep their exact behavior. */
export function useMeasurementProfile(): MeasurementProfile {
  return useContext(MeasurementProfileContext);
}
