# Changelog

## 1.0.1 - 2026-08-21

### Fixed

- Show the **Block this page by Tiny Blocker** context-menu command only on HTTP and HTTPS pages, preventing it from appearing on `chrome-extension://`, `chrome://`, and other internal browser pages.
- Validate websites before adding or importing rules: accept valid domains and HTTP(S) URLs such as `abcd.com`, `http://abcd.com`, and `https://abcd.co.uk`, while rejecting malformed addresses, unsupported protocols, and single-label values such as `abcd`.
- Show a clear validation message when a website cannot be added.
- Add regression coverage for context-menu URL restrictions and website validation.

## 1.0.0 - 2026-08-21

Initial Chrome Web Store release.

The version numbers previously recorded in this repository represented internal, unpublished development milestones. Because the extension has never been published, those milestones have been consolidated into this `1.0.0` public release.

### Features

- Block user-selected domains or exact URLs.
- Add rules through the options page or the page context menu.
- Enable or disable individual rules and pause all blocking from the toolbar popup.
- Display a local warning page with the rule that caused the block.
- Show local daily and lifetime blocking statistics.
- Import and export validated JSON configuration backups without exporting statistics.
- Sort and paginate the blocked-rule list.

### Privacy and security

- Store rules, settings, and aggregate statistics only in `chrome.storage.local`.
- Use no external API, analytics, advertising, tracking, remote code, or server communication.
- Request no persistent host permissions; retain only the Chrome API permissions required for blocking and user-invoked context-menu actions.
- Remove the experimental password feature because a standalone extension cannot provide a tamper-resistant boundary against someone who controls the Chrome profile.
- Include a Chrome Web Store privacy policy, Limited Use disclosure, single-purpose statement, and permission justifications.
- Upgrade and pin dependencies, with zero vulnerabilities reported by `npm audit` at release time.

### Build and quality

- Use Manifest V3, TypeScript 7, Webpack, and SWC.
- Type-check application and end-to-end test code before production builds.
- Run Oxlint, 34 Jest unit/integration tests, and four real Chromium end-to-end scenarios.
- Validate production permissions, required files, version consistency, archive structure, and prohibited dynamic/network code before packaging.
- Add `npm run publish` to run all release checks and generate a versioned Chrome Web Store ZIP with `manifest.json` at its root.
- Add pull-request CI checks for linting, tests, browser E2E coverage, builds, and dependency auditing.

## Unpublished development history

The following versions were internal development milestones and were never submitted to the Chrome Web Store.

### 2.1.0 - 2026-08-21 (unpublished)

- Add a Chrome toolbar popup with a global blocking on/off switch, active-rule count, statistics, and a shortcut to options.
- Add local daily and lifetime blocking statistics with automatic daily rollover and no external tracking.
- Add validated JSON import and export for blocked rules and the global blocking setting.
- Add popup pinning and feature guidance to the README.
- Upgrade and pin direct dependencies and resolve all vulnerabilities reported by `npm audit` at development time.
- Upgrade to TypeScript 7 and add explicit application and E2E type-checking before production builds.
- Remove Babel, `ts-jest`, `ts-loader`, ESLint, and TypeScript ESLint; use SWC for transforms and Oxlint for linting.
- Remove the redundant `copy-files` script because Webpack already copies UI assets.
- Add Jest integration coverage and a real Chromium E2E suite.
- Add pull-request GitHub Actions checks.
- Remove unnecessary persistent HTTP and HTTPS host permissions.
- Add Chrome Web Store privacy and submission documentation.
- Add validated `package:store` and `publish` commands for creating the production ZIP.
- Remove password protection and all related UI, runtime, storage, tests, and build configuration.

### 2.0.8 - 2026-03-01 (unpublished)

- Add ESLint tooling and enforce apostrophes (`single` quotes) in TypeScript.
- Normalize TypeScript quote style across the codebase and align package/changelog versioning.

### 2.0.7 - 2026-03-01 (unpublished)

- Move password storage keys to root `.env` configuration and load them via `dotenv` in webpack.
- Require `PASSWORD_STORAGE_KEY` and `PASSWORD_SALT_STORAGE_KEY` to be configured (remove hardcoded fallback keys).
- Replace direct SHA-256 password hashing with salted PBKDF2 hashing and keep backward-compatible migration.
- Remove URL logging from background tab updates to avoid leaking browsing data in extension logs.

### 2.0.6 - 2026-02-22 (unpublished)

- Remove experimental AI blocker logic and all related runtime behavior.
- Remove AI controls from options and remove AI actions from the warning page.
- Remove AI helper module and its tests.

### 2.0.5 - 2026-01-17 (unpublished)

- Add offline AI assist with topic + source learning, conservative blocking, and AI prompts when unsure.
- Store page title/description metadata for blocked entries and show it in the options list.
- Add domain vs URL blocking with a choice modal in the context menu flow.
- Add pagination and sorting to the blocked list UI.
- Add warning-page reasons, AI allow/teach action, and AI reset control in options.

### 2.0.4 - 2026-01-17 (unpublished)

- Bugfix: avoid blocking `chrome-extension://` URLs.

### 2.0.3 - 2026-01-17 (unpublished)

- Add icons to the extension manifest and display the app icon in the options header.
- Add password protection modal, hashed storage, and move password logic into a helper.
- Add a refresh list button to options.
- Cache blocked hostnames in background for faster blocking and add background tests.

### 2.0.2 - 2026-01-17 (unpublished)

- Add password protection modal and lock screen for options access.
- Store password as a SHA-256 hash and move password logic into a helper module.

### 2.0.1 - 2026-01-16 (unpublished)

- Move Jest dependencies to devDependencies in `package.json`.
- Refresh options and warning UI styling and split CSS into standalone files.

### 2.0.0 - 2026-01-16 (unpublished)

- Normalize blocked site entries to hostnames, supporting inputs with or without protocol.
- Harden hostname parsing for empty/invalid values and normalize comparisons during blocking.
- Update options UI storage to save normalized hostnames for add/remove actions.
- Add tests for hostname normalization and storage behavior.

### 1.0.0 - 2021-11-20 (original local prototype; unpublished)

- Initial release with the options UI for adding/removing blocked sites.
- Block pages by matching saved hostnames and redirect to a warning page.
- Include randomized block messages on the warning page.
