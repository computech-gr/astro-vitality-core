# Component rules
- Ground Medical review state lives in the framework-free p368b-ground-medical-review-scope module: auto and manual mission selection share one load path and only current-epoch, authorized-mission responses are accepted, so it is testable without a DOM.
