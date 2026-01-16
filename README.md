# Tiny Website Blocker Chrome Extension


The Tiny Website Blocker Chrome Extension is a simple and lightweight extension designed to help you block access to specific websites within the Google Chrome browser. Whether you need to increase productivity, limit distractions, or maintain focus time, this extension provides a convenient way to control your web browsing experience.

## Features

- **Website Blocking**: Easily block access to specific websites by adding their URLs to the extension's options. You do not need to include the "https://" part in the website names.

- **Error Page**: When you try to access a blocked website, the extension will display an error page, and the blocked tab will be automatically closed to help you stay on track.

- **User Responsibility**: Please note that using this extension is your responsibility. It is intended to be a tool to help you manage your online activities, and you should use it responsibly.

- **Freeware**: The Tiny Website Blocker Chrome Extension is completely free to use. There are no hidden fees or premium versions.

- **Data**: It does not call any external API. It does not use a network. The blocked websites' list is stored in your browser locally, so if you remove the extension, You will lose the list.

- **Created for Personal Use**: I created this extension for myself because I found only non-free or overcomplicated extensions with this function in the Chrome Web Store. It's my way of making a useful tool available to others with the same need.

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

## Feedback and Support

If you encounter any issues or have suggestions for improving the Tiny Website Blocker Chrome Extension, please feel free to [open an issue](https://github.com/janosvajda/chrome-extension-website-blocker/issues) on our GitHub repository. I appreciate your feedback and will do our best to address any concerns.

Thank you for using this extension! I hope it helps you maintain your focus and productivity while browsing the web.
