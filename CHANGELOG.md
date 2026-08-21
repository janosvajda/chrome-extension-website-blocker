# Changelog

## 2.1.0 - 2026-08-21
- Add a Chrome toolbar popup with a global blocking on/off switch, active-rule count, and a shortcut to the options page.
- Add local daily and lifetime blocking statistics with automatic daily rollover and no external tracking.
- Add validated JSON configuration export and import for blocked rules and the global blocking setting; keep passwords and statistics out of backup files.
- Add popup pinning and feature guidance to the README.
- Upgrade direct and transitive dependencies, pin direct versions for reproducible installs, and resolve all vulnerabilities reported by `npm audit` at release time.
- Upgrade to TypeScript 7 and add an explicit `tsc --noEmit` check before production builds.
- Remove Babel, `ts-jest`, `ts-loader`, ESLint, and TypeScript ESLint; use SWC for Jest and Webpack transforms and Oxlint for TypeScript linting.
- Update Chrome storage and Web Crypto handling for the stricter current type definitions.
- Remove the redundant `copy-files` npm script because Webpack already copies extension UI assets.
- Expand automated coverage for the global blocking switch, statistics rollover and increments, and configuration import validation.

## 2.0.8 - 2026-03-01
- Add ESLint tooling and enforce apostrophes (`single` quotes) in TypeScript.
- Normalize TypeScript quote style across the codebase and align package/changelog versioning.

## 2.0.7 - 2026-03-01
- Move password storage keys to root `.env` configuration and load them via `dotenv` in webpack.
- Require `PASSWORD_STORAGE_KEY` and `PASSWORD_SALT_STORAGE_KEY` to be configured (remove hardcoded fallback keys).
- Replace direct SHA-256 password hashing with salted PBKDF2 hashing and keep backward-compatible migration.
- Remove URL logging from background tab updates to avoid leaking browsing data in extension logs.

## 2.0.6 - 2026-02-22
- Remove experimental AI blocker logic and all related runtime behavior.
- Remove AI controls from options and remove AI actions from the warning page.
- Remove AI helper module and its tests.

## 2.0.5 - 2026-01-17
- Add offline AI assist with topic + source learning, conservative blocking, and AI prompts when unsure.
- Store page title/description metadata for blocked entries and show it in the options list.
- Add domain vs URL blocking with a choice modal in the context menu flow.
- Add pagination and sorting to the blocked list UI.
- Add warning-page reasons, AI allow/teach action, and AI reset control in options.

## 2.0.4 - 2026-01-17
- Bugfix: avoid blocking chrome-extension:// URLs.

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
