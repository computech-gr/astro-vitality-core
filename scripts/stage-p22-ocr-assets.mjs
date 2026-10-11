import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Run only in the project workspace after dependencies are installed.
// Provide the English traineddata gzip yourself in assets/ocr/eng.traineddata.gz.
// This script never downloads from a CDN or copies medical data.
const root = process.cwd();
const output = path.join(root, 'public/ocr/v1');
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ...['tesseract-core.wasm.js','tesseract-core-simd.wasm.js','tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js'].map(n => [`node_modules/tesseract.js-core/${n}`, n]),
  ['assets/ocr/eng.traineddata.gz', 'eng.traineddata.gz'],
];
const missing = files.filter(([source]) => !fs.existsSync(path.join(root, source)));
if (missing.length) {
  console.error('OCR pack NOT staged. Missing:', missing.map(([source]) => source).join(', '));
  process.exitCode = 1;
} else {
  fs.mkdirSync(output, {recursive: true});
  for (const [source, dest] of files) {
    const data = fs.readFileSync(path.join(root, source));
    fs.writeFileSync(path.join(output, dest), data);
    console.log(dest, data.length, createHash('sha256').update(data).digest('hex'));
  }
  console.log('Staged same-origin assets. Offline readiness still requires caching and airplane-mode validation.');
}
