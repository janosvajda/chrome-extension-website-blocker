# Changelog

## 2.0.1 - 2026-01-16
- Move Jest dependencies to devDependencies in package.json.
- Refresh options and warning UI styling and split CSS into standalone files.

## 2.0.0 - 2026-01-16
- Normalize blocked site entries to hostnames, supporting inputs with or without protocol.
- Harden hostname parsing for empty/invalid values and normalize comparisons during blocking.
- Update options UI storage to save normalized hostnames for add/remove actions.
- Add tests for hostname normalization and storage behavior.

## 1.0.0 - 2020-11-20
- Initial release with the options UI for adding/removing blocked sites.
- Block pages by matching saved hostnames and redirect to a warning page.
- Include randomized block messages on the warning page.
