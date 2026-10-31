// P53: guarantees the three committed competition PDFs ship as same-origin static
// files at /competition/assets/pdf/<file>, even when the hosting build runs
// `vite build` directly instead of the package "build" script (which stages them
// into public/ first). No network fetch is involved at build or request time.
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const COMPETITION_PDF_FILES = [
  "MITOCHONDRIA_NASA_Space_Apps_2026_Presentation_FINAL.pdf",
  "MITOCHONDRIA_NASA_Evaluator_Quick_Start_Guide_FINAL.pdf",
  "MITOCHONDRIA_Master_Operations_Technical_Manual_FINAL.pdf",
];
const URL_PREFIX = "/competition/assets/pdf/";
const OUTPUT_DIR = "competition/assets/pdf/";

export function competitionPdfAssets() {
  let root = process.cwd();
  let publicDir = join(root, "public");
  const source = (name) => join(root, "docs", "competition", name);
  return {
    name: "mitochondria-competition-pdf-assets",
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir || join(root, "public");
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        if (!path.startsWith(URL_PREFIX)) return next();
        const name = decodeURIComponent(path.slice(URL_PREFIX.length));
        if (!COMPETITION_PDF_FILES.includes(name)) return next();
        const file = source(name);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", String(statSync(file).size));
        res.setHeader("Content-Disposition", `inline; filename="${name}"`);
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      // Only the browser (static asset) build serves files; server bundles never need them.
      if (this.environment && this.environment.name !== "client") return;
      for (const name of COMPETITION_PDF_FILES) {
        const file = source(name);
        if (!existsSync(file) || statSync(file).size === 0) {
          this.error(`Missing competition PDF: ${file}`);
        }
        // Already staged into public/ by scripts/stage-competition-pdfs.mjs: Vite copies it.
        if (existsSync(join(publicDir, OUTPUT_DIR, name))) continue;
        this.emitFile({ type: "asset", fileName: `${OUTPUT_DIR}${name}`, source: readFileSync(file) });
      }
    },
  };
}
