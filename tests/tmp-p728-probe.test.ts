import { it } from "bun:test";
import { renderPremiumReport } from "../src/domain/health-intelligence/p59-premium-pdf";
import { premiumFrom } from "./support/p59-fixtures";
import { SvgPdfWriter } from "./support/svg-pdf-writer";
it("probe", () => {
  const r = premiumFrom([], { provisional: true, mappings: true, range: { from: "2026-11-01", to: "2026-11-12" } });
  const w = new SvgPdfWriter();
  const { pages } = renderPremiumReport(r, w as never, { family: "LiberationSans", unicode: true });
  console.log("PAGES", pages, JSON.stringify(r.header.examinationDates), r.lead);
  console.log(JSON.stringify(r.overview, null, 1));
  console.log(w.texts.map((t) => t.text).join("\n"));
});
