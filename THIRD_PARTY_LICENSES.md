# Third-Party Licenses

## Tesseract OCR English language model (tessdata_fast)

- Component: `eng.traineddata` (redistributed gzip-compressed as `eng.traineddata.gz`, served at `/ocr/v1/`)
- Copyright: The Tesseract OCR project authors (https://github.com/tesseract-ocr)
- Source: https://github.com/tesseract-ocr/tessdata_fast
- Pinned commit: `87416418657359cb625c412a48b6e1d6d41c29bd`
- Uncompressed SHA-256: `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`
- Redistributed `.gz` SHA-256: `2a66ec904bc0e7657b27e200a874c01e1bc8a58b756cbbaa9afbae736fa50edc`
- License: Apache License 2.0 — full text in `third_party/tessdata_fast/LICENSE` (SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`)
- NOTICE: the upstream repository contains no NOTICE file at this commit.
- Modifications: none to the model; the file was only gzip-compressed (`gzip -9 -n`) for delivery.
- Approval: reviewed and approved for use and redistribution by Theodore Silvestros, 2026-10-11.
