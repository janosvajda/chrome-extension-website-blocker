chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(["blocked", "enabled"],  (local) => {
        if (!Array.isArray(local.blocked)) {
            chrome.storage.local.set({ blocked: [] });
        }
    });
});

chrome.tabs.onUpdated.addListener( (tabId, changeInfo) => {
    const url = changeInfo.pendingUrl || changeInfo.url;
    if (!url || !url.startsWith("http")) {
        return;
    }
    console.info('Opened URL', url);
    const hostname = new URL(url).hostname;
    chrome.storage.local.get(["blocked", "enabled"],  (local) => {
        const { blocked } = local;
        if (Array.isArray(blocked) && blocked.find(domain => hostname.includes(domain))) {
            chrome.tabs.remove(tabId);
            chrome.tabs.create({ url: "warning.html" });
        }
    });
});
