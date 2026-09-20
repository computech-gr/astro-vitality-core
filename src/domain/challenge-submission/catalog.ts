export const CHALLENGE_2026_URL =
  "https://www.spaceappschallenge.org/2026/challenges/create-health-monitoring-software-for-astronauts-on-space-missions/";
export const SPACE_APPS_2026_URL = "https://www.spaceappschallenge.org/2026/";
export const SPACE_APPS_2026_TERMS_URL = "https://www.spaceappschallenge.org/legal/";

export const P20_DEMO_STEPS = [
  { minute: "0:00–0:25", title: "Problem", route: "/mission/submission", message: "Long-duration crews need a local health loop when Earth is delayed or unavailable." },
  { minute: "0:25–0:50", title: "Live signal", route: "/mission/live", message: "Show a real physical heart-rate path (direct BLE or the governed Android Health Connect companion) when hardware is available; otherwise state that the deterministic simulator is the fallback." },
  { minute: "0:50–1:20", title: "Personalize", route: "/mission/simulation", message: "Run Mission Day 127 and explain the shared astronaut + spacecraft timeline." },
  { minute: "1:20–1:50", title: "Detect and explain", route: "/mission/intelligence", message: "Show evidence, confidence, uncertainty, confounders and a DATA QUALITY case." },
  { minute: "1:50–2:15", title: "Act safely", route: "/mission/guidance", message: "Show bounded protocol guidance rather than diagnosis." },
  { minute: "2:15–2:40", title: "Lose Earth", route: "/mission/offline", message: "Show encrypted local persistence and store-and-forward behavior." },
  { minute: "2:40–3:00", title: "Reconnect", route: "/mission/ground", message: "Show governed ground/research history, then close on open-source reproducibility." },
] as const;
