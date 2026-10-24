import { describe, expect, test } from "bun:test";
import { searchCatalogue } from "@/components/app-shell";
import { competitionDocuments, competitionTeam } from "@/content/competition-team";

describe("official competition team destinations", () => {
  test("roster contains exactly the five supplied members and only one owner", () => {
    expect(competitionTeam.members.map((member) => member.name)).toEqual([
      "Nikolaos Silvestros", "Andriani Christoforou", "Freideriki Polyxeni Sopikioti", "Eleftheria Stavraki", "Theodore Silvestros",
    ]);
    expect(competitionTeam.members.filter((member) => "role" in member)).toEqual([{ name: "Nikolaos Silvestros", role: "Team Owner" }]);
  });

  test("menu uses the exact official profile and public team destination", () => {
    expect(competitionTeam.officialUrl).toBe("https://www.spaceappschallenge.org/2026/find-a-team/the-mitochondria/?tab=details");
    expect(searchCatalogue.find((entry) => entry.title === "Official NASA Team Profile")?.href).toBe(competitionTeam.officialUrl);
    expect(searchCatalogue.find((entry) => entry.title === "Our Team — NASA Space Apps 2026")?.href).toBe("/competition/team");
  });

  test("competition PDFs retain the exact current FINAL destinations", () => {
    expect(competitionDocuments.map((document) => document.url)).toEqual([
      "https://github.com/computech-gr/astro-vitality-core/blob/main/docs/competition/MITOCHONDRIA_NASA_Space_Apps_2026_Presentation_FINAL.pdf",
      "https://github.com/computech-gr/astro-vitality-core/blob/main/docs/competition/MITOCHONDRIA_NASA_Evaluator_Quick_Start_Guide_FINAL.pdf",
      "https://github.com/computech-gr/astro-vitality-core/blob/main/docs/competition/MITOCHONDRIA_Master_Operations_Technical_Manual_FINAL.pdf",
    ]);
    for (const document of competitionDocuments) {
      expect(searchCatalogue.find((entry) => entry.title === document.label)?.href).toBe(document.url);
    }
    expect(searchCatalogue.find((entry) => entry.title === "Watch NASA Demo Video")?.href).toBe("/competition/demo-video");
  });
});