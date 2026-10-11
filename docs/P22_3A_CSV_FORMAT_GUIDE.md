# P22.3a — Bone Health CSV format guide

This patch adds an in-page bilingual format guide and a downloadable blank CSV template to the existing `/mission/bone-health` import section. It does not modify clinical logic, persistence, or the PDF/scan extraction component.

Required column names (exact): `variable,value,unit,observed_at,source`. Optional: `specimen,assay_method,notes`. Order may vary; header names are case-insensitive. UTF-8 comma-delimited CSV, one result per row. `variable` must match exactly one of the 63 catalog IDs or names. Use decimal dot and ISO-8601 dates. The importer currently accepts up to 200 data rows and the file input caps at 2 MB.

The UI sample is explicitly synthetic and must never be used as a clinical threshold. Downloaded template contains only the header row. Review is required before saving to encrypted append-only local history. PDF/scan import remains a separate feature.
