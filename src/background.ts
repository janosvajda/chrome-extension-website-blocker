chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(["blocked", "enabled"], (local) => {
        if (!Array.isArray(local.blocked)) {
            chrome.storage.local.set({blocked: []});
        }
    });
});

// Initialize a dictionary to keep track of blocked tabs
const blockedTabs = {};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = tab.pendingUrl || tab.url;
    if (!url || !url.startsWith("http")) {
        return;
    }
    console.info('Opened URL', url);
    const urlParts = new URL(url);
    let hostname = urlParts.hostname.replace(/^www\./, '');

    // Retrieve the list of blocked websites from local storage
    chrome.storage.local.get("blocked", (local) => {
        const blockedWebsites = local.blocked || [];

        // Check if the block is enabled for the current hostname
        const blockedWebsite = blockedWebsites.find((website) => website.name === hostname);

        if (blockedWebsite && blockedWebsite.enabled) {
            // Check if the tab is not already blocked
            if (!blockedTabs[tabId]) {
                // Mark the tab as blocked to prevent further actions on it
                blockedTabs[tabId] = true;

                // Remove the tab and create a new tab with the warning page
                chrome.tabs.remove(tabId, () => {
                    chrome.tabs.create({url: "warning.html"});
                });
            }
        } else {
            // If the tab is unblocked, clear it from the dictionary
            delete blockedTabs[tabId];
        }
    });
});



