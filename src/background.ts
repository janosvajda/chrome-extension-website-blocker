import {getPureHostname} from "./helper/getPureHostname";

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(["blocked", "enabled"], (local) => {
        if (!Array.isArray(local.blocked)) {
            chrome.storage.local.set({blocked: []});
        }
    });
});

// Initialize a dictionary to keep track of blocked tabs
const blockedTabs: Record<number, boolean> = {};
let blockedHostnames = new Set<string>();

export function rebuildBlockedHostnames(blockedList) {
    blockedHostnames = new Set(
        (blockedList || [])
            .filter((website) => website.enabled)
            .map((website) => getPureHostname(website.name || ""))
            .filter((hostname) => hostname)
    );
}

export function shouldBlockHostname(hostname: string): boolean {
    return blockedHostnames.has(hostname);
}

export function resetBlockedStateForTest(): void {
    blockedHostnames = new Set<string>();
    Object.keys(blockedTabs).forEach((key) => {
        delete blockedTabs[Number(key)];
    });
}
chrome.runtime.onInstalled.addListener(function() {
    // Create context menu item
    chrome.contextMenus.create({
        id: "blockPage",
        title: "Block this page by Tiny Blocker",
        contexts: ["page"]
    });
});

chrome.storage.local.get({ blocked: [] }, (data) => {
    rebuildBlockedHostnames(data.blocked);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.blocked) {
        return;
    }
    rebuildBlockedHostnames(changes.blocked.newValue || []);
});

// Function to block the page
export function blockPage(tabId, pageUrl) {
    const hostname = getPureHostname(pageUrl);

    if (shouldBlockHostname(hostname)) {
        if (!blockedTabs[tabId]) {
            blockedTabs[tabId] = true;
            chrome.tabs.remove(tabId, () => {
                chrome.tabs.create({ url: "warning.html" });
            });
        }
    } else {
        delete blockedTabs[tabId];
    }
}

// Add a listener for context menu item clicks
chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "blockPage") {
        const pageUrl = tab.url;
        const tabId = tab.id;
        chrome.storage.local.get({ blocked: [] }, function(result) {
            const currentBlocked = result.blocked;

            // Check if the pageUrl is not already in the blocked list
            const normalizedPage = getPureHostname(pageUrl);
            if (!currentBlocked.some(item => getPureHostname(item.name || "") === normalizedPage)) {
                // Add the new blocked item
                const newBlocked = [...currentBlocked, { name: normalizedPage, enabled: true }];

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
