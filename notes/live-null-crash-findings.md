# Live null education-level crash findings

The live homepage at https://portal.leetec.online/ currently loads successfully in the sandbox browser with the document title “ScholarShelf · Elite Resources.” The public catalogue includes the education-level filter and initially shows its loading state. The browser console reported no errors during this check.

The user-provided stack trace still identifies `educationLevels` as the failure source and shows `.trim()` being called on null from the production Home bundle. The discrepancy is consistent with a catalogue-data-dependent path, stale cached assets, or a deployment that has not picked up the latest null-safe build. The source fix guards both normalization and display helpers, with regression coverage and a passing production build.
