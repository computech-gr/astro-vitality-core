// P53: publish the three committed, public competition PDFs as same-origin static assets.
// No network fetch or external PDF viewer is required at request time.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
const source = join(process.cwd(), "docs", "competition");
const destination = join(process.cwd(), "public", "competition", "assets", "pdf");
const names = [
  "MITOCHONDRIA_NASA_Space_Apps_2026_Presentation_FINAL.pdf",
  "MITOCHONDRIA_NASA_Evaluator_Quick_Start_Guide_FINAL.pdf",
  "MITOCHONDRIA_Master_Operations_Technical_Manual_FINAL.pdf",
];
mkdirSync(destination, { recursive: true });
for (const name of names) {
  const input = join(source, name);
  if (!existsSync(input) || statSync(input).size === 0) throw new Error(`Missing competition PDF: ${input}`);
  copyFileSync(input, join(destination, name));
  console.log(`Staged competition PDF: ${name}`);
}
