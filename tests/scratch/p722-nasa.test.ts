import { it } from "bun:test";
import { extractPdfGeometry, repoPath } from "../documents/p42-pdf-helpers";
it("t", async () => {
  const g = await extractPdfGeometry(repoPath("tests/fixtures/p39/NASA_Astronaut_Simulated_Medical_Report.pdf"));
  console.log(g.text.split("\n").filter(l=>/\| 24 \||\| 165 \||\| 5\.8 \||^24 |165|5\.8/.test(l)).join("\n"));
});
