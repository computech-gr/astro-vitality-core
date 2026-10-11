import fs from "node:fs";
import assert from "node:assert/strict";
const ui = fs.readFileSync("src/components/bone-health-import.tsx", "utf8");
const parser = fs.readFileSync("src/domain/bone-health/import.ts", "utf8");
for (const token of ["CSV format guide", "Download blank CSV template", "BONE_IMPORT_CSV_TEMPLATE", "synthetic demonstration only", "downloadTemplate", "BoneHealthDocumentImport", "Confirm selected results and save"]) assert.ok(ui.includes(token), `Missing UI token ${token}`);
for (const h of ["variable", "value", "unit", "observed_at", "source"]) assert.ok(parser.includes(`"${h}"`), `Missing parser header ${h}`);
assert.ok(ui.includes("parseBoneImport") && ui.includes("saveBoneEntry"));
console.log("P22.3a CSV guide PASS: format instructions, downloadable blank template, synthetic example, existing review and document import preserved.");
