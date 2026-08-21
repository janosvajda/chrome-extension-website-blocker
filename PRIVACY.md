# Privacy Policy for Tiny Website Blocker

Effective date: 21 August 2026

Tiny Website Blocker has one purpose: helping users block websites they choose in Chrome.

## Data handled by the extension

To provide its blocking features, the extension processes the URLs of pages opened in Chrome and compares them with the user's blocking rules. It stores the following information locally in Chrome:

- Domain and URL blocking rules chosen by the user.
- Whether blocking is globally enabled.
- Daily and lifetime counts of blocked navigation attempts.

The extension does not store a general browsing history. Only rules deliberately added by the user and aggregate blocking counts are retained. A blocked page's URL is used to display the warning page but is not added to the statistics or retained as browsing history.

## Storage, transmission, and sharing

All extension data is stored locally through `chrome.storage.local`. Tiny Website Blocker has no analytics, advertising, tracking, account system, external API, or server communication. It does not sell, share, or transmit user data to the developer or any third party.

Configuration export happens only when the user selects **Export JSON**. Exported files contain blocking rules and the global enabled setting. They do not contain statistics. Import occurs only when the user selects a local JSON file.

## Permissions

- `storage`: saves rules, settings, and aggregate statistics locally.
- `tabs`: reads navigation URLs so configured sites can be blocked and manages the blocked tab and local warning page.
- `activeTab` and `scripting`: after the user selects the context-menu command, displays the domain-or-URL choice on that page.
- `contextMenus`: provides the user-invoked **Block this page** command.

## Retention and user control

Users can delete or disable individual rules, replace settings by importing a backup, or remove the extension. Removing the extension deletes its `chrome.storage.local` data. Exported JSON files remain under the user's control and can be deleted using the operating system.

## Limited Use disclosure

Tiny Website Blocker's use of information received from Chrome APIs is limited to providing and improving its single-purpose, user-facing website-blocking functionality. The data is not transferred to others, used for advertising, used to determine creditworthiness, or made available for human review.

## Changes and contact

Material changes to this policy will be documented with a new effective date. Questions can be submitted through the project's [GitHub issue tracker](https://github.com/janosvajda/chrome-extension-website-blocker/issues).
