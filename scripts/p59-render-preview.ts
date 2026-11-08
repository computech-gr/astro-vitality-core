/** Writes SVG previews of the premium report for synthetic datasets (test/preview tool; no app data). */
import { mkdirSync, writeFileSync } from "node:fs";
import { SvgPdfWriter } from "../tests/support/svg-pdf-writer";
import { renderPremiumReport } from "../src/domain/health-intelligence/p59-premium-pdf";
import { premiumFrom, alexFull, smallNormal, complexAbnormal } from "../tests/support/p59-fixtures";
const out = process.argv[2] ?? "/tmp/p59-preview";
const sets: [string, ReturnType<typeof premiumFrom>][] = [
  ["D1_alex_provisional", premiumFrom(alexFull(), { provisional: true })],
  ["D6_alex_no_approvals_provisional_off", premiumFrom(alexFull(), { provisional: false })],
  ["D2_small_normal", premiumFrom(smallNormal(), { provisional: true })],
  ["D3_complex_abnormal", premiumFrom(complexAbnormal(), { provisional: true })],
];
for (const [name, r] of sets) {
  const w = new SvgPdfWriter();
  const { pages } = renderPremiumReport(r, w as never, { family: "LiberationSans", unicode: true });
  mkdirSync(`${out}/${name}`, { recursive: true });
  w.svgPages().forEach((s, i) => writeFileSync(`${out}/${name}/page-${String(i + 1).padStart(2, "0")}.svg`, s));
  console.log(name, pages, "pages");
}
