import {getPureHostname} from "./helper/getPureHostname";
import {normalizeBlockedEntry, normalizeUrlForMatch} from "./helper/blockedEntry";

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
let blockedUrls = new Set<string>();

export function rebuildBlockedHostnames(blockedList) {
    blockedHostnames = new Set<string>();
    blockedUrls = new Set<string>();
    (blockedList || []).forEach((website) => {
        if (!website || !website.enabled) {
            return;
        }
        const normalized = normalizeBlockedEntry(website.name || "", website.scope);
        if (!normalized) {
            return;
        }
        if (normalized.scope === "url") {
            blockedUrls.add(normalized.name);
            return;
        }
        blockedHostnames.add(normalized.name);
    });
}

export function shouldBlockHostname(hostname: string): boolean {
    return blockedHostnames.has(hostname);
}

export function resetBlockedStateForTest(): void {
    blockedHostnames = new Set<string>();
    blockedUrls = new Set<string>();
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
    if (areaName !== "local") {
        return;
    }
    if (changes.blocked) {
        const newBlocked = Array.isArray(changes.blocked.newValue) ? changes.blocked.newValue : [];
        rebuildBlockedHostnames(newBlocked);
    }
});

// Function to block the page
export function blockPage(tabId, pageUrl) {
    if (pageUrl.startsWith("chrome-extension://")) {
        return;
    }
    const hostname = getPureHostname(pageUrl);
    const normalizedUrl = normalizeUrlForMatch(pageUrl);
    if (normalizedUrl && blockedUrls.has(normalizedUrl)) {
        blockTabWithReason(tabId, pageUrl, hostname, "url", normalizedUrl);
        return;
    }
    if (shouldBlockHostname(hostname)) {
        blockTabWithReason(tabId, pageUrl, hostname, "domain", hostname);
        return;
    }
}

// Add a listener for context menu item clicks
chrome.contextMenus.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "blockPage") {
        const pageUrl = tab.url;
        const tabId = tab.id;
        if (!pageUrl || pageUrl.startsWith("chrome://") || pageUrl.startsWith("chrome-extension://")) {
            return;
        }
        decideBlockScope(tabId, pageUrl).then((scope) => {
            if (!scope) {
                return;
            }
            chrome.storage.local.get({ blocked: [] }, function(result) {
                const currentBlocked = result.blocked;
                const normalizedEntry = normalizeBlockedEntry(pageUrl, scope);
                if (!normalizedEntry) {
                    return;
                }

                const exists = currentBlocked.some((item) => {
                    const itemScope = item.scope || "domain";
                    return itemScope === normalizedEntry.scope && item.name === normalizedEntry.name;
                });
                if (exists) {
                    return;
                }

                const newBlocked = [
                    ...currentBlocked,
                    {
                        name: normalizedEntry.name,
                        scope: normalizedEntry.scope,
                        enabled: true,
                    },
                ];

                chrome.storage.local.set({ blocked: newBlocked });
                chrome.tabs.reload(tabId);
            });
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

function blockTabWithReason(
    tabId: number,
    pageUrl: string,
    hostname: string,
    reason: "url" | "domain",
    blockedLabel: string
) {
    if (blockedTabs[tabId]) {
        return;
    }
    blockedTabs[tabId] = true;
    chrome.tabs.remove(tabId, () => {
        const warningUrl =
            `warning.html?reason=${reason}` +
            `&blocked=${encodeURIComponent(blockedLabel)}` +
            `&host=${encodeURIComponent(hostname)}` +
            `&url=${encodeURIComponent(pageUrl)}`;
        chrome.tabs.create({ url: warningUrl });
    });
}

function decideBlockScope(tabId, pageUrl): Promise<"domain" | "url" | null> {
    const isTopDomain = (() => {
        try {
            const url = new URL(pageUrl);
            return url.pathname === "/" && !url.search && !url.hash;
        } catch {
            return true;
        }
    })();

    if (isTopDomain) {
        return Promise.resolve("domain");
    }

    return new Promise((resolve) => {
        if (!chrome.scripting || !tabId) {
            resolve(null);
            return;
        }
        chrome.scripting.executeScript(
            {
                target: { tabId },
                args: [pageUrl],
                func: (url) => {
                    const existing = document.getElementById("tiny-blocker-choice");
                    if (existing) {
                        existing.remove();
                    }
                    return new Promise((resolve) => {
                        const overlay = document.createElement("div");
                        overlay.id = "tiny-blocker-choice";
                        overlay.style.position = "fixed";
                        overlay.style.inset = "0";
                        overlay.style.background = "rgba(0, 0, 0, 0.55)";
                        overlay.style.zIndex = "2147483647";
                        overlay.style.display = "flex";
                        overlay.style.alignItems = "center";
                        overlay.style.justifyContent = "center";

                        const card = document.createElement("div");
                        card.style.background = "#ffffff";
                        card.style.color = "#1f1b16";
                        card.style.borderRadius = "14px";
                        card.style.padding = "18px";
                        card.style.maxWidth = "420px";
                        card.style.boxShadow = "0 18px 32px rgba(0, 0, 0, 0.25)";
                        card.style.fontFamily = '"Trebuchet MS","Lucida Grande","Lucida Sans Unicode",sans-serif';

                        const title = document.createElement("div");
                        title.textContent = "Block this page";
                        title.style.fontWeight = "bold";
                        title.style.marginBottom = "8px";

                        const subtitle = document.createElement("div");
                        subtitle.textContent = `Choose how to block: ${url}`;
                        subtitle.style.fontSize = "12px";
                        subtitle.style.color = "#6b5f52";
                        subtitle.style.marginBottom = "14px";
                        subtitle.style.wordBreak = "break-word";

                        const actions = document.createElement("div");
                        actions.style.display = "flex";
                        actions.style.gap = "8px";
                        actions.style.justifyContent = "flex-end";
                        actions.style.flexWrap = "wrap";

                        const cancelButton = document.createElement("button");
                        cancelButton.textContent = "Cancel";
                        const domainButton = document.createElement("button");
                        domainButton.textContent = "Block domain";
                        const urlButton = document.createElement("button");
                        urlButton.textContent = "Block URL";

                        [cancelButton, domainButton, urlButton].forEach((button) => {
                            button.style.border = "none";
                            button.style.borderRadius = "999px";
                            button.style.padding = "8px 12px";
                            button.style.cursor = "pointer";
                            button.style.fontFamily = "inherit";
                        });

                        cancelButton.style.background = "transparent";
                        cancelButton.style.border = "1px solid #c45a1f";
                        cancelButton.style.color = "#c45a1f";

                        domainButton.style.background = "#e0702f";
                        domainButton.style.color = "#ffffff";

                        urlButton.style.background = "#1f1b16";
                        urlButton.style.color = "#ffffff";

                        const cleanup = (result) => {
                            overlay.remove();
                            resolve(result);
                        };

                        cancelButton.addEventListener("click", () => cleanup(null));
                        domainButton.addEventListener("click", () => cleanup("domain"));
                        urlButton.addEventListener("click", () => cleanup("url"));
                        overlay.addEventListener("click", (event) => {
                            if (event.target === overlay) {
                                cleanup(null);
                            }
                        });
                        window.addEventListener(
                            "keydown",
                            (event) => {
                                if (event.key === "Escape") {
                                    cleanup(null);
                                }
                            },
                            { once: true }
                        );

                        actions.appendChild(cancelButton);
                        actions.appendChild(domainButton);
                        actions.appendChild(urlButton);

                        card.appendChild(title);
                        card.appendChild(subtitle);
                        card.appendChild(actions);
                        overlay.appendChild(card);
                        document.body.appendChild(overlay);
                    });
                },
            },
            (results) => {
                if (chrome.runtime.lastError || !results || !results[0]) {
                    resolve(null);
                    return;
                }
                resolve(results[0].result as "domain" | "url");
            }
        );
    });
}
