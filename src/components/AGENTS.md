# Component rules

- Ground Medical review state lives in the framework-free p368b-ground-medical-review-scope module: auto and manual mission selection share one load path and only current-epoch, authorized-mission responses are accepted, so it is testable without a DOM.
- Device catalog runtimes (production active catalog, synthetic demo catalogs) are read in components only through src/hooks/use-device-catalogs.ts, whose server snapshot is always empty, because server HTML never has device catalogs and reading the live runtime during the hydration render caused the P72.7 Scientific Review hydration mismatch.
