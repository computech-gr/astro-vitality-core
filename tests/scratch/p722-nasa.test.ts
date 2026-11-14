import { it } from "bun:test";
import { extractPdfGeometry, repoPath } from "../documents/p42-pdf-helpers";
it("t", async () => {
  for (const p of ["tests/fixtures/p39/NASA_Astronaut_Simulated_Medical_Report.pdf","tests/fixtures/p42/Alex_Morgan_Complete_Examination_2026-11-07.pdf"]) {
  const g = await extractPdfGeometry(repoPath(p));
  console.log(p, g.pages, g.text.length); console.log(g.text.split("\n").filter(l=>/HRV|RMSSD|LDL|Cholesterol|NT-?proBNP|BNP|date|Date|09:30|time/i.test(l)).slice(0,25).join("\n"));
  }
});
