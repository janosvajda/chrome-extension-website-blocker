# Tiny Website Blocker Chrome Extension


The Tiny Website Blocker Chrome Extension is a simple and lightweight extension designed to help you block access to specific websites within the Google Chrome browser. Whether you need to increase productivity, limit distractions, or maintain focus time, this extension provides a convenient way to control your web browsing experience.

## Features

- **Website Blocking**: Block access to specific websites from the options page; URLs with or without `http(s)` are supported.

- **Simple Management UI**: A clean options page makes it easy to add, remove, and toggle blocked sites.

- **Toolbar Controls**: Open the extension from Chrome's toolbar to turn all blocking on or off, view the number of active rules, and jump to the options page. **To keep it visible, click Chrome's puzzle-piece Extensions icon, find Tiny Website Blocker, and click the pin icon. Then click the Tiny Website Blocker toolbar icon to open the popup.**

- **Local Blocking Statistics**: See how many blocking attempts Tiny Website Blocker stopped today and across all time. Statistics remain in local browser storage and are not sent anywhere.

- **Import and Export**: Back up blocked-site rules and the global blocking setting to a JSON file, then restore them later or move them to another Chrome installation. Statistics are never included in exports.

- **Domain or URL Scopes**: When blocking from the context menu, choose whether to block the whole domain or only the exact URL.

- **Context Menu Quick Block**: Right-click any page and choose “Block this page by Tiny Blocker” to add it instantly.

  <img src="docs/images/blocker_context_menu_screenshot.png" alt="Context menu action" width="360">

- **Error Page**: When you try to access a blocked website, the extension will display an error page, and the blocked tab will be automatically closed to help you stay on track.

## Installation Guide

To install the Tiny Website Blocker Chrome Extension, follow these simple steps:

1. **Download the Extension**: Download the extension package from [GitHub](https://github.com/janosvajda/chrome-extension-website-blocker.git).

2. **Install Dependencies**:
    - Run `npm install` in the project root to install dependencies.

3. **Build the Extension**:
    - Run `npm run build` to generate the `built` directory.

4. **Enable Developer Mode in Chrome**:
    - Open Google Chrome.
    - Click the three dots menu icon in the top right corner of the browser.
    - Navigate to `More tools` > `Extensions`.
    - Enable the `Developer mode` toggle in the top right corner of the Extensions page.

5. **Load the Extension**:
    - Click the `Load unpacked` button after enabling Developer mode.
    - Select the `built` folder and click `Select Folder`.

6. **Configure the Extension**:
    - A new icon (like the one shown above) will appear in your Chrome toolbar after loading the extension.
    - Right-click the extension icon and select `Options`.
    - Add the websites you want to block in the options page and save your settings.

7. **Start Blocking Websites**: The extension is now ready. You'll be redirected to an error page whenever you visit a blocked website, and the tab will be closed.

## Licence and security

- **Privacy Policy**: See [PRIVACY.md](PRIVACY.md) for the extension's local data handling, retention, permissions, and Chrome Web Store Limited Use disclosure.

- **User Responsibility**: Please note that using this extension is your responsibility. It is intended to be a tool to help you manage your online activities, and you should use it responsibly.

- **Freeware**: The Tiny Website Blocker Chrome Extension is completely free to use. There are no hidden fees or premium versions.

- **Data**: It does not call any external API or use the network. Blocking rules, settings, and aggregate statistics are stored only in your browser's local extension storage. Removing the extension deletes that locally stored data.

- **Created for Personal Use**: I created this extension for myself because I found only non-free or overcomplicated extensions with this function in the Chrome Web Store. It's my way of making a useful tool available to others with the same need.

## Feedback and Support

If you encounter any issues or have suggestions for improving the Tiny Website Blocker Chrome Extension, please feel free to [open an issue](https://github.com/janosvajda/chrome-extension-website-blocker/issues) on our GitHub repository. I appreciate your feedback and will do our best to address any concerns.

Thank you for using this extension! I hope it helps you maintain your focus and productivity while browsing the web.

## Chrome Web Store package

Create a fully verified, versioned Chrome Web Store ZIP with:

```bash
npm run publish
```

This runs the dependency audit, linting, Jest tests, real Chromium end-to-end tests, and production build before creating `release/tiny-website-blocker-<version>.zip`. The ZIP contains the contents of `built/` with `manifest.json` at its root. This command creates the upload artifact; it does not upload or publish it to the Chrome Web Store automatically.

See [STORE_SUBMISSION.md](STORE_SUBMISSION.md) for the single-purpose statement, permission justifications, and privacy-practices notes to use in the Chrome Web Store dashboard.
