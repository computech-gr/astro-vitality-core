export interface TimedPpgSample {
  atMs: number;
  value: number;
  red?: number;
  green?: number;
  blue?: number;
}

export interface PpgHeartRateEstimate {
  bpm: number;
  confidence: number;
  contactQuality: number;
  signalQuality: number;
  sampleCount: number;
  windowMs: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function standardDeviation(values: number[], average = mean(values)) {
  if (!values.length) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function linearDetrend(samples: TimedPpgSample[]) {
  const t0 = samples[0]?.atMs ?? 0;
  const times = samples.map((sample) => (sample.atMs - t0) / 1000);
  const values = samples.map((sample) => sample.value);
  const avgT = mean(times);
  const avgV = mean(values);
  const covariance = mean(times.map((time, index) => (time - avgT) * ((values[index] ?? avgV) - avgV)));
  const variance = mean(times.map((time) => (time - avgT) ** 2));
  const slope = variance > 0 ? covariance / variance : 0;
  return values.map((value, index) => value - (avgV + slope * ((times[index] ?? 0) - avgT)));
}

function estimateContactQuality(samples: TimedPpgSample[]) {
  const rgb = samples.filter(
    (sample): sample is TimedPpgSample & { red: number; green: number; blue: number } =>
      typeof sample.red === "number" && typeof sample.green === "number" && typeof sample.blue === "number",
  );
  if (!rgb.length) return 0.5;
  const red = mean(rgb.map((sample) => sample.red));
  const green = mean(rgb.map((sample) => sample.green));
  const blue = mean(rgb.map((sample) => sample.blue));
  const brightness = clamp01((red - 35) / 120);
  const redDominance = clamp01((red - Math.max(green, blue) * 0.9 + 25) / 70);
  return clamp01(brightness * 0.55 + redDominance * 0.45);
}

/**
 * Estimates pulse rate from an irregularly sampled camera PPG trace using a
 * small frequency scan over the physiological demo band. This is intentionally
 * a measurement aid, not a medical diagnostic algorithm.
 */
export function estimatePpgHeartRate(samples: TimedPpgSample[]): PpgHeartRateEstimate | undefined {
  if (samples.length < 80) return undefined;
  const ordered = [...samples].sort((a, b) => a.atMs - b.atMs);
  const first = ordered[0];
  const last = ordered.at(-1);
  if (!first || !last) return undefined;
  const windowMs = last.atMs - first.atMs;
  if (windowMs < 6500) return undefined;

  const detrended = linearDetrend(ordered);
  const signalStd = standardDeviation(detrended, 0);
  if (!(signalStd > 0.15)) return undefined;
  const normalized = detrended.map((value) => value / signalStd);
  const durationSeconds = windowMs / 1000;

  let bestBpm = 0;
  let bestPower = -Infinity;
  const powers: number[] = [];
  for (let bpm = 40; bpm <= 180; bpm += 1) {
    const hz = bpm / 60;
    let sin = 0;
    let cos = 0;
    for (let index = 0; index < ordered.length; index += 1) {
      const sample = ordered[index]!;
      const phase = 2 * Math.PI * hz * ((sample.atMs - first.atMs) / 1000);
      const hann = ordered.length > 1 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (ordered.length - 1)) : 1;
      const value = (normalized[index] ?? 0) * hann;
      sin += value * Math.sin(phase);
      cos += value * Math.cos(phase);
    }
    const power = (sin * sin + cos * cos) / ordered.length;
    powers.push(power);
    if (power > bestPower) {
      bestPower = power;
      bestBpm = bpm;
    }
  }

  if (!Number.isFinite(bestPower) || bestPower <= 0) return undefined;
  const averagePower = mean(powers);
  const prominence = averagePower > 0 ? bestPower / averagePower : 0;
  const spectralQuality = clamp01((prominence - 1.6) / 5.5);
  const contactQuality = estimateContactQuality(ordered);
  const sampleDensity = clamp01(ordered.length / Math.max(90, durationSeconds * 12));
  const confidence = clamp01(spectralQuality * 0.55 + contactQuality * 0.3 + sampleDensity * 0.15);
  const signalQuality = clamp01(spectralQuality * 0.7 + contactQuality * 0.3);

  if (confidence < 0.42) return undefined;
  return {
    bpm: Math.round(bestBpm),
    confidence,
    contactQuality,
    signalQuality,
    sampleCount: ordered.length,
    windowMs,
  };
}

export function normalizePpgWaveform(samples: TimedPpgSample[], maxPoints = 90): number[] {
  const tail = samples.slice(-Math.max(3, maxPoints));
  if (!tail.length) return [];
  const values = tail.map((sample) => sample.value);
  const average = mean(values);
  const spread = standardDeviation(values, average) || 1;
  return values.map((value) => Math.max(-3, Math.min(3, (value - average) / spread)));
}
