chrome.runtime.onInstalled.addListener(function () {
    chrome.storage.local.get(["blocked", "enabled"], function (local) {
        if (!Array.isArray(local.blocked)) {
            chrome.storage.local.set({ blocked: [] });
        }
    });
});
// Initialize a dictionary to keep track of blocked tabs
var blockedTabs = {};
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    var url = changeInfo.pendingUrl || tab.url;
    if (!url || !url.startsWith("http")) {
        return;
    }
    console.info('Opened URL', url);
    var urlParts = new URL(url);
    var hostname = urlParts.hostname.replace(/^www\./, '');
    // Retrieve the list of blocked websites from local storage
    chrome.storage.local.get("blocked", function (local) {
        var blockedWebsites = local.blocked || [];
        // Check if the block is enabled for the current hostname
        var blockedWebsite = blockedWebsites.find(function (website) { return website.name === hostname; });
        if (blockedWebsite && blockedWebsite.enabled) {
            // Check if the tab is not already blocked
            if (!blockedTabs[tabId]) {
                // Mark the tab as blocked to prevent further actions on it
                blockedTabs[tabId] = true;
                // Remove the tab and create a new tab with the warning page
                chrome.tabs.remove(tabId, function () {
                    chrome.tabs.create({ url: "warning.html" });
                });
            }
        }
        else {
            // If the tab is unblocked, clear it from the dictionary
            delete blockedTabs[tabId];
        }
    });
});
