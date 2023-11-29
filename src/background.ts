import {getPureHostname} from "./helper/getPureHostname";

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(["blocked", "enabled"], (local) => {
        if (!Array.isArray(local.blocked)) {
            chrome.storage.local.set({blocked: []});
        }
    });
});

// Initialize a dictionary to keep track of blocked tabs
const blockedTabs = {};
chrome.runtime.onInstalled.addListener(function() {
    // Create context menu item
    chrome.contextMenus.create({
        id: "blockPage",
        title: "Block this page (Tiny Blocker)",
        contexts: ["page"]
    });
});

// Function to block the page
function blockPage(tabId, pageUrl) {
    // Implement your blocking logic here
    console.log("Blocking page:", pageUrl);
    let hostname = getPureHostname(pageUrl)

    // Retrieve the list of blocked websites from local storage
    chrome.storage.local.get("blocked", (local) => {
        const blockedWebsites = local.blocked || [];

        // Check if the block is enabled for the current hostname
        const blockedWebsite = blockedWebsites.find(
            (website) => website.name === hostname
        );

        if (blockedWebsite && blockedWebsite.enabled) {
            // Check if the tab is not already blocked
            if (!blockedTabs[tabId]) {
                // Mark the tab as blocked to prevent further actions on it
                blockedTabs[tabId] = true;

                // Remove the tab and create a new tab with the warning page
                chrome.tabs.remove(tabId, () => {
                    chrome.tabs.create({ url: "warning.html" });
                });
            }
        } else {
            // If the tab is unblocked, clear it from the dictionary
            delete blockedTabs[tabId];
        }
    });
}

// Add a listener for context menu item clicks
chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "blockPage") {
        const pageUrl = tab.url;
        const tabId = tab.id;
        chrome.storage.local.get({ blocked: [] }, function(result) {
            const currentBlocked = result.blocked;

            // Check if the pageUrl is not already in the blocked list
            if (!currentBlocked.some(item => item.name === pageUrl)) {
                // Add the new blocked item
                const newBlocked = [...currentBlocked, { name: getPureHostname(pageUrl), enabled: true }];

                // Store the updated blocked list in chrome.storage.local
                chrome.storage.local.set({ blocked: newBlocked });

                // Reload the tab
                chrome.tabs.reload(tabId);
            }
        });
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = tab.pendingUrl || tab.url;
    if (!url || !url.startsWith("http")) {
        return;
    }
    console.info('Opened URL', url);
    blockPage(tabId, url);
});



