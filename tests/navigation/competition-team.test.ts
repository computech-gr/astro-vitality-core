import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { searchCatalogue } from "@/components/app-shell";
import { competitionDocuments, competitionTeam } from "@/content/competition-team";
import { competitionPdfs, findCompetitionPdf } from "@/content/competition-pdfs";

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

  test("competition PDFs open the in-app browser viewer routes", () => {
    expect(competitionDocuments.map((document) => [document.label, document.url])).toEqual([
      ["NASA Competition Presentation (PDF)", "/competition/pdf/presentation"],
      ["View Narrated Presentation Online (PPTX)", "/competition/narrated-presentation"],
      ["NASA Evaluator Quick Start (PDF)", "/competition/pdf/evaluator"],
      ["Master Technical Manual (PDF)", "/competition/pdf/manual"],
      ["Watch NASA Demo Video", "/competition/demo-video"],
    ]);
    // No competition material points at a GitHub blob page any more.
    expect(competitionDocuments.some((document) => document.url.includes("github.com"))).toBe(false);
    // Obsolete direct-download entries must never return to the competition list.
    expect(competitionDocuments.some((document) => /\.(pdf|pptx|mp4)$/.test(document.url))).toBe(
      false,
    );
    expect(competitionDocuments.some((document) => document.label.startsWith("Download"))).toBe(
      false,
    );
    for (const document of competitionDocuments.filter((entry) => entry.label.endsWith("(PDF)"))) {
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

  test("every competition material destination opens in a new tab", () => {
    const shell = readFileSync(
      new URL("../../src/components/app-shell.tsx", import.meta.url),
      "utf8",
    );
    for (const prefix of [
      "/competition/pdf/",
      "/competition/demo-video",
      "/competition/narrated-presentation",
    ]) {
      expect(shell).toContain(`href.startsWith("${prefix}")`);
    }
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

  test("the PDF viewer registry serves only the three committed competition PDFs", () => {
    expect(Object.keys(competitionPdfs)).toEqual(["presentation", "evaluator", "manual"]);
    expect(Object.values(competitionPdfs).map((document) => document.file)).toEqual([
      "MITOCHONDRIA_NASA_Space_Apps_2026_Presentation_FINAL.pdf",
      "MITOCHONDRIA_NASA_Evaluator_Quick_Start_Guide_FINAL.pdf",
      "MITOCHONDRIA_Master_Operations_Technical_Manual_FINAL.pdf",
    ]);
    for (const document of Object.values(competitionPdfs)) {
      expect(
        existsSync(new URL(`../../docs/competition/${document.file}`, import.meta.url)),
      ).toBe(true);
    }
    for (const id of ["__proto__", "constructor", "../presentation", "presentation.pdf", ""]) {
      expect(findCompetitionPdf(id)).toBeUndefined();
    }
  });

  test("the narrated PPTX and MP4 remain reachable only through their viewer pages", () => {
    for (const file of [
      "docs/competition/MITOCHONDRIA_NASA_2026_Professional_Narrated_Presentation_Final.pptx",
      "docs/competition/MITOCHONDRIA_NASA_2026_Official_Demo_FINAL.mp4",
    ]) {
      expect(existsSync(new URL(`../../${file}`, import.meta.url))).toBe(true);
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

describe("P53 same-origin competition PDFs", () => {
  test("viewer loads each PDF from the same-origin static path, never GitHub", async () => {
    const { competitionPdfFilePath } = await import("@/content/competition-pdfs");
    expect(competitionPdfFilePath("presentation")).toBe(
      "/competition/assets/pdf/MITOCHONDRIA_NASA_Space_Apps_2026_Presentation_FINAL.pdf",
    );
    expect(competitionPdfFilePath("evaluator")).toBe(
      "/competition/assets/pdf/MITOCHONDRIA_NASA_Evaluator_Quick_Start_Guide_FINAL.pdf",
    );
    expect(competitionPdfFilePath("manual")).toBe(
      "/competition/assets/pdf/MITOCHONDRIA_Master_Operations_Technical_Manual_FINAL.pdf",
    );
    const api = readFileSync(
      new URL("../../src/routes/api.public.competition-pdf.$documentId.ts", import.meta.url),
      "utf8",
    );
    expect(api).not.toContain("fetch(");
    expect(api).not.toContain("githubusercontent");
  });

  test("build staging and the Vite safeguard ship exactly the three registry PDFs", async () => {
    const { COMPETITION_PDF_FILES } = await import("../../scripts/competition-pdf-assets-plugin.mjs");
    const files = Object.values(competitionPdfs).map((document) => document.file);
    expect(COMPETITION_PDF_FILES).toEqual(files);
    const stage = readFileSync(
      new URL("../../scripts/stage-competition-pdfs.mjs", import.meta.url),
      "utf8",
    );
    for (const file of files) expect(stage).toContain(`"${file}"`);
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(pkg.scripts.build).toBe("node scripts/stage-competition-pdfs.mjs && vite build");
    expect(readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8")).toContain(
      "competitionPdfAssets()",
    );
    // Staged copies are build output, never committed duplicates.
    expect(readFileSync(new URL("../../.gitignore", import.meta.url), "utf8")).toContain(
      "public/competition/assets/pdf/",
    );
  });
});
