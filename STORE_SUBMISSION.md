# Chrome Web Store submission notes

## Single purpose

Tiny Website Blocker helps users reduce distractions by blocking domains and exact URLs they choose. Its schedules, popup, options, statistics, context-menu shortcut, and configuration backup all support this single purpose.

## Permission justifications

- `storage`: Store the user's rules, schedules, global enabled setting, and aggregate daily/lifetime block counts locally.
- `tabs`: Observe top-level tab navigation URLs, close tabs that match enabled rules, open the packaged warning page, and reload a page after the user adds it through the context menu.
- `activeTab`: Obtain temporary access only after the user invokes the context-menu command on a page.
- `scripting`: Display the domain-versus-exact-URL choice after that user gesture.
- `contextMenus`: Add the user-facing **Block this page by Tiny Blocker** command.

The extension intentionally requests no persistent host permissions.

## Privacy practices answers

- Browsing activity is processed locally because the extension must compare navigation URLs with user-created rules.
- User-provided blocking rules, schedules, settings, and aggregate statistics are stored in `chrome.storage.local`.
- No data is transmitted, sold, shared, used for advertising, or made available for human review.
- No remote code is used. All executable code is included in the uploaded ZIP.
- Privacy policy URL: use the public URL for [`PRIVACY.md`](PRIVACY.md) in this repository.

Review the final dashboard wording against the current Chrome Web Store questions before submitting. The answers must remain consistent with the extension and privacy policy.
