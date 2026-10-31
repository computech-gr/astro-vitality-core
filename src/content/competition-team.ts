export const competitionTeam = {
  name: "The Mitochondria",
  event: "NASA Space Apps Challenge 2026",
  localEvent: "Nicosia, Cyprus",
  challenge: "Create Health Monitoring Software for Astronauts on Space Missions",
  officialUrl: "https://www.spaceappschallenge.org/2026/find-a-team/the-mitochondria/?tab=details",
  challengeUrl: "https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/",
  members: [
    { name: "Nikolaos Silvestros", role: "Team Owner" },
    { name: "Andriani Christoforou" },
    { name: "Freideriki Polyxeni Sopikioti" },
    { name: "Eleftheria Stavraki" },
    { name: "Theodore Silvestros" },
  ],
} as const;

// Public competition navigation: the PDF and online viewers open in a new tab.
// Keep this list aligned with the SiteHeader Competition Materials group.
export const competitionDocuments = [
  { label: "NASA Competition Presentation (PDF)", url: "/competition/pdf/presentation" },
  { label: "View Narrated Presentation Online (PPTX)", url: "/competition/narrated-presentation" },
  { label: "NASA Evaluator Quick Start (PDF)", url: "/competition/pdf/evaluator" },
  { label: "Master Technical Manual (PDF)", url: "/competition/pdf/manual" },
  { label: "Watch NASA Demo Video", url: "/competition/demo-video" },
] as const;