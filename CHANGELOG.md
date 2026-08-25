# Changelog

## 1.0.3 - 2026-08-25

### Added

- Add temporary 15-minute, 30-minute, and one-hour pauses to the toolbar popup, with a remaining-time display, automatic local resume time, and **Resume now** action.
- Show one of three playful reminders from the fourth daily pause; the local counter includes timed pauses and manually switching blocking off, resets each day, and does not repeat after reopening the popup.
- Add optional password protection for pausing or turning off blocking from the toolbar. Passwords can be created from 6 characters, changed only after verifying the current password, or freely removed in Settings.
- Optionally require the password once when opening Tiny Website Blocker Settings; unlocked Settings remain available for that session without repeated prompts.
- Add focused Backup and restore dialogs with overwrite confirmation, imported-rule counts, clear failure feedback, and export confirmation showing the generated filename and Chrome-managed Downloads location.
- Ask whether to block a whole domain or one full URL when Add Site receives a path, query, or fragment, matching the right-click flow.
- Add prominent validation alerts, directional duplicate detection, and deletion confirmation showing the exact rule being removed.

### Changed

- Reorganize Settings into a responsive full-height layout that keeps Add Site and the GPL notice visible while the rule list scrolls independently.
- Remove the redundant manual refresh control because rule changes update immediately.
- Improve the toolbar popup layout and use the complete **Tiny Website Blocker** name.
- Make forms and dialogs keyboard-friendly: Enter submits the active form or password prompt, and Escape closes dismissible dialogs without saving unintended changes.
- Improve password, domain-or-URL, confirmation, and error-dialog wording and visual organization.

### Privacy and quality

- Keep all new state and verification inside `chrome.storage.local` without new permissions, runtime dependencies, external services, API calls, or network communication.
- Derive password-verification keys with PBKDF2-SHA-256 and 600,000 iterations, then store only an AES-256-GCM encrypted verifier with a fresh random salt and IV—never the password or derived key.
- Extend unit, UI, background, and real-browser integration coverage for pauses, password flows, rule scope choices, backups, schedules, confirmations, and blocking behavior.

## 1.0.2 - 2026-08-22

### Changed

- Redesign the per-site schedule dialog with clearer visual grouping, a balanced day grid, improved spacing, separated actions, and a responsive layout without changing scheduling behavior.
- Curate jokes and scientific quotes for a neutral, family-friendly Store audience by removing stereotypes, body-shaming, violent or dark punchlines, profanity, and potentially hurtful wording.
- Make Chrome Web Store installation the primary README guide and separate source installation for developers.

### Licence and packaging

- License Tiny Website Blocker under the GNU General Public License v3.0 only (`GPL-3.0-only`).
- Add the complete GPLv3 text, show a licence and warranty notice in Settings, and include `LICENSE` at the root of production Store packages.
- Strengthen Store-package validation so required package entries must be files rather than directories.

## 1.0.1 - 2026-08-21

### Fixed

- Show the **Block this page by Tiny Blocker** context-menu command only on HTTP and HTTPS pages, preventing it from appearing on `chrome-extension://`, `chrome://`, and other internal browser pages.
- Validate websites before adding or importing rules: accept valid domains and HTTP(S) URLs such as `abcd.com`, `http://abcd.com`, and `https://abcd.co.uk`, while rejecting malformed addresses, unsupported protocols, and single-label values such as `abcd`.
- Show a clear validation message when a website cannot be added.
- Add regression coverage for context-menu URL restrictions and website validation.
- Add DOM-level Jest coverage for all extension UIs and enforce 95% minimum statement, branch, function, and line coverage in local publishing and pull-request CI.
- Add a real Chromium round-trip test for importing and exporting scheduled rules.

### Features

- Add an optional Schedule button to every rule in the single main list, with a focused dialog for selecting active days and start/end times.
- Show an `Always` or day/time summary directly beneath each website and allow its schedule to be removed from the same dialog.
- Make the main checkbox authoritative: disabled rules never block, enabled unscheduled rules always block, and enabled scheduled rules block only during their configured period.
- Warn users and prevent duplicate or overlapping entries in the main always-blocked list.
- Support selected weekdays, local start/end times, and overnight blocking periods.
- Include per-rule schedules in validated version 3 JSON backups, retain older backup compatibility, and migrate the earlier version 2 group format when encountered.

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
