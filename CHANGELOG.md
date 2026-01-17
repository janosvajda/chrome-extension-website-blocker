# Changelog

## 2.0.3 - 2026-01-17
- Add icons to the extension manifest and display the app icon in the options header.
- Add password protection modal, hashed storage, and move password logic into a helper.
- Add a refresh list button to options.
- Cache blocked hostnames in background for faster blocking and add background tests.

## 2.0.2 - 2026-01-17
- Add password protection modal and lock screen for options access.
- Store password as a SHA-256 hash and move password logic into a helper module.

## 2.0.1 - 2026-01-16
- Move Jest dependencies to devDependencies in package.json.
- Refresh options and warning UI styling and split CSS into standalone files.

## 2.0.0 - 2026-01-16
- Normalize blocked site entries to hostnames, supporting inputs with or without protocol.
- Harden hostname parsing for empty/invalid values and normalize comparisons during blocking.
- Update options UI storage to save normalized hostnames for add/remove actions.
- Add tests for hostname normalization and storage behavior.

## 1.0.0 - 2021-11-20
- Initial release with the options UI for adding/removing blocked sites.
- Block pages by matching saved hostnames and redirect to a warning page.
- Include randomized block messages on the warning page.
