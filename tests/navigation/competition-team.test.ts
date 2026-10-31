import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { searchCatalogue } from "@/components/app-shell";
import { competitionDocuments, competitionTeam } from "@/content/competition-team";

const OFFICIAL_CHALLENGE_URL =
  "https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/";
const STALE_CHALLENGE_URL =
  "https://www.spaceappschallenge.org/2026/challenges/create-health-monitoring-software-for-astronauts-on-space-missions/";

describe("official competition team destinations", () => {
  test("roster contains exactly the five supplied members and only one owner", () => {
    expect(competitionTeam.members.map((member) => member.name)).toEqual([
      "Nikolaos Silvestros",
      "Andriani Christoforou",
      "Freideriki Polyxeni Sopikioti",
      "Eleftheria Stavraki",
      "Theodore Silvestros",
    ]);
    expect(competitionTeam.members.filter((member) => "role" in member)).toEqual([
      { name: "Nikolaos Silvestros", role: "Team Owner" },
    ]);
  });

  test("menu uses the exact official profile and public team destination", () => {
    expect(competitionTeam.officialUrl).toBe(
      "https://www.spaceappschallenge.org/2026/find-a-team/the-mitochondria/?tab=details",
    );
    expect(
      searchCatalogue.find((entry) => entry.title === "Official NASA Team Profile")?.href,
    ).toBe(competitionTeam.officialUrl);
    expect(
      searchCatalogue.find((entry) => entry.title === "Our Team — NASA Space Apps 2026")?.href,
    ).toBe("/competition/team");
  });

  test("menu exposes the corrected official challenge as a distinct destination", () => {
    expect(competitionTeam.challengeUrl).toBe(OFFICIAL_CHALLENGE_URL);
    expect(searchCatalogue.find((entry) => entry.title === "Official NASA Challenge")?.href).toBe(
      OFFICIAL_CHALLENGE_URL,
    );
    expect(
      searchCatalogue.find((entry) => entry.title === "Official NASA Team Profile")?.href,
    ).toBe(competitionTeam.officialUrl);
  });

  test("team page offers both official destinations and no user-facing source keeps the stale challenge URL", () => {
    const page = readFileSync("src/routes/competition.team.tsx", "utf8");
    expect(page).toContain("Official NASA Challenge");
    expect(page).toContain("Official NASA Team Profile");
    expect(page).toContain("competitionTeam.challengeUrl");
    expect(page).toContain("competitionTeam.officialUrl");
    for (const file of [
      "src/routes/competition.team.tsx",
      "src/content/competition-team.ts",
      "src/components/app-shell.tsx",
      "src/components/project-guide.tsx",
      "src/domain/challenge-submission/catalog.ts",
    ]) {
      expect(readFileSync(file, "utf8")).not.toContain(STALE_CHALLENGE_URL);
    }
  });

  test("competition PDFs retain the exact current FINAL destinations", () => {
    expect(competitionDocuments.map((document) => document.url)).toEqual([
      "https://github.com/computech-gr/astro-vitality-core/blob/main/docs/competition/MITOCHONDRIA_NASA_Space_Apps_2026_Presentation_FINAL.pdf",
      "https://github.com/computech-gr/astro-vitality-core/blob/main/docs/competition/MITOCHONDRIA_NASA_Evaluator_Quick_Start_Guide_FINAL.pdf",
      "https://github.com/computech-gr/astro-vitality-core/blob/main/docs/competition/MITOCHONDRIA_Master_Operations_Technical_Manual_FINAL.pdf",
      "https://raw.githubusercontent.com/computech-gr/astro-vitality-core/main/docs/competition/MITOCHONDRIA_NASA_2026_Professional_Narrated_Presentation_Final.pptx",
      "https://raw.githubusercontent.com/computech-gr/astro-vitality-core/main/docs/competition/MITOCHONDRIA_NASA_2026_Official_Demo_FINAL.mp4",
    ]);
    for (const document of competitionDocuments.filter((entry) => entry.url.endsWith(".pdf"))) {
      expect(searchCatalogue.find((entry) => entry.title === document.label)?.href).toBe(
        document.url,
      );
    }
    expect(searchCatalogue.find((entry) => entry.title === "Watch NASA Demo Video")?.href).toBe(
      "/competition/demo-video",
    );
    expect(
      searchCatalogue.find((entry) => entry.title === "View Narrated Presentation Online (PPTX)")
        ?.href,
    ).toBe("/competition/narrated-presentation");
    // The menu offers the video only as a page to watch, never as an MP4 download.
    expect(searchCatalogue.some((entry) => entry.href.endsWith(".mp4"))).toBe(false);
  });

  test("menu lists the narrated PPTX viewer directly below the presentation PDF", () => {
    const shell = readFileSync(
      new URL("../../src/components/app-shell.tsx", import.meta.url),
      "utf8",
    );
    const pdf = shell.indexOf('"NASA Competition Presentation (PDF)",');
    const viewer = shell.indexOf('"View Narrated Presentation Online (PPTX)",');
    expect(pdf).toBeGreaterThan(-1);
    expect(shell.slice(pdf, viewer).split("\n").length).toBe(2);
  });

  test("every competition material link names an existing file in docs/competition", () => {
    // PDFs open on GitHub; the PPTX and MP4 are direct raw downloads with exact filenames.
    const prefixes = [
      "https://github.com/computech-gr/astro-vitality-core/blob/main/",
      "https://raw.githubusercontent.com/computech-gr/astro-vitality-core/main/",
    ];
    for (const document of competitionDocuments) {
      const prefix = prefixes.find((candidate) => document.url.startsWith(candidate));
      expect(prefix).toBeDefined();
      expect(
        existsSync(new URL(`../../${document.url.slice(prefix!.length)}`, import.meta.url)),
      ).toBe(true);
    }
    for (const document of competitionDocuments.filter((entry) =>
      /\.(pptx|mp4)$/.test(entry.url),
    )) {
      expect(document.url.startsWith(prefixes[1])).toBe(true);
    }
  });

  test("demo video page plays the official MP4 without a download link", () => {
    const page = readFileSync(
      new URL("../../src/routes/competition.demo-video.tsx", import.meta.url),
      "utf8",
    );
    expect(page).toContain(
      "https://raw.githubusercontent.com/computech-gr/astro-vitality-core/main/docs/competition/MITOCHONDRIA_NASA_2026_Official_Demo_FINAL.mp4",
    );
    expect(page).not.toContain("<a ");
    expect(page).not.toContain("Demo_Video_VO");
  });
});
