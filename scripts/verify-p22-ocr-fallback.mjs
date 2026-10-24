import fs from "node:fs";
import assert from "node:assert/strict";
const read = (p) => fs.readFileSync(p, "utf8");
const domain = read("src/domain/bone-health/document-extraction.ts");
const ui = read("src/components/bone-health-document-import.tsx");
const pkg = JSON.parse(read("package.json"));
assert.ok(pkg.dependencies["tesseract.js"]);
assert.match(domain, /import\("tesseract.js"\)/);
assert.match(domain, /createWorker\("eng", 1\)/);
assert.match(domain, /worker\.terminate\(\)/);
assert.match(domain, /TextDetector/);
assert.match(domain, /on-device OCR/);
assert.match(domain, /selected:false/);
assert.match(domain, /ids.size !== 1/);
assert.match(
  ui,
  /First use may require downloading OCR\s+language resources/,
  "OCR first-use network warning must remain visible across JSX whitespace",
);
assert.match(ui, /saveBoneEntry/);
assert.equal(pkg.scripts["verify:p22:ocr-fallback"], "node scripts/verify-p22-ocr-fallback.mjs");
assert.ok(pkg.scripts.check.includes("verify:p22:ocr-fallback"));
console.log(
  "P22.5 PASS: browser OCR with Tesseract fallback, worker cleanup, explicit first-use network caveat, human confirmation preserved. Static checks only.",
);
