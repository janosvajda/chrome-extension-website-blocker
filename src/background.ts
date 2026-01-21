import {getPureHostname} from "./helper/getPureHostname";
import {normalizeBlockedEntry, normalizeUrlForMatch} from "./helper/blockedEntry";
import {
    AiConfig,
    AiModel,
    buildModelFromBlockedList,
    createEmptyAiModel,
    DEFAULT_AI_CONFIG,
    decideAiAction,
    mergeAiConfig,
    normalizeAiModel,
    updateModelForAi,
} from "./helper/aiBlocker";

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
const aiPendingTabs = new Set<number>();
const aiPromptedUrls = new Map<number, string>();
let aiModel: AiModel = createEmptyAiModel();
let aiConfig: AiConfig = { ...DEFAULT_AI_CONFIG };

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
    aiModel = createEmptyAiModel();
    aiConfig = { ...DEFAULT_AI_CONFIG };
}
chrome.runtime.onInstalled.addListener(function() {
    // Create context menu item
    chrome.contextMenus.create({
        id: "blockPage",
        title: "Block this page by Tiny Blocker",
        contexts: ["page"]
    });
});

chrome.storage.local.get({ blocked: [], aiModel: null, aiConfig: null }, (data) => {
    rebuildBlockedHostnames(data.blocked);
    aiConfig = mergeAiConfig(data.aiConfig);

    const loadedModel = normalizeAiModel(data.aiModel);
    if (loadedModel) {
        aiModel = loadedModel;
        return;
    }

    const normalizedBlocked = normalizeBlockedList(data.blocked);
    aiModel = buildModelFromBlockedList(normalizedBlocked, aiConfig);
    chrome.storage.local.set({ aiModel });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
        return;
    }
    if (changes.aiConfig) {
        aiConfig = mergeAiConfig(changes.aiConfig.newValue);
    }
    if (changes.aiModel) {
        const updatedModel = normalizeAiModel(changes.aiModel.newValue);
        if (updatedModel) {
            aiModel = updatedModel;
        }
    }
    if (changes.blocked) {
        const oldBlocked = Array.isArray(changes.blocked.oldValue) ? changes.blocked.oldValue : [];
        const newBlocked = Array.isArray(changes.blocked.newValue) ? changes.blocked.newValue : [];
        rebuildBlockedHostnames(newBlocked);
        updateAiModelFromBlockedChange(oldBlocked, newBlocked);
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
    maybeBlockByAi(tabId, pageUrl, hostname);
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
            capturePageMetadata(tabId, tab.title || "").then((meta) => {
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
                            title: meta.title || "",
                            description: meta.description || "",
                        },
                    ];

                    chrome.storage.local.set({ blocked: newBlocked });
                    chrome.tabs.reload(tabId);
                });
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
        return;
    }
    if (message.type === "aiAllow" && typeof message.hostname === "string") {
        const title = typeof message.title === "string" ? message.title.trim() : "";
        const description = typeof message.description === "string" ? message.description : "";
        const hostname = message.hostname.trim();
        if (!hostname || (!title && !description)) {
            sendResponse?.({ ok: false });
            return;
        }
        aiModel = updateModelForAi(title, description, hostname, "allow", aiModel, aiConfig);
        chrome.storage.local.set({ aiModel }, () => {
            sendResponse?.({ ok: true });
        });
        return true;
    }
});

function updateAiModelFromBlockedChange(oldList, newList) {
    updateAiModelFromTextChange(oldList, newList);
}

function updateAiModelFromTextChange(oldList, newList) {
    const oldTexts = toTextMap(oldList);
    const newTexts = toTextMap(newList);
    const updates: Array<{ title: string; description: string; hostname: string; label: "block" | "allow" }> = [];

    newTexts.forEach((entry, key) => {
        const wasEnabled = oldTexts.get(key)?.enabled;
        if (entry.enabled && !wasEnabled) {
            updates.push({ ...entry, label: "block" });
        } else if (!entry.enabled && wasEnabled) {
            updates.push({ ...entry, label: "allow" });
        }
    });

    oldTexts.forEach((entry, key) => {
        if (entry.enabled && !newTexts.has(key)) {
            updates.push({ ...entry, label: "allow" });
        }
    });

    if (updates.length === 0) {
        return;
    }

    let updated = aiModel;
    updates.forEach((update) => {
        updated = updateModelForAi(update.title, update.description, update.hostname, update.label, updated, aiConfig);
    });
    aiModel = updated;
    chrome.storage.local.set({ aiModel });
}

function normalizeBlockedList(blockedList) {
    return (blockedList || []).map((entry) => {
        const normalized = normalizeBlockedEntry(entry?.name || "", entry?.scope);
        return {
            name: normalized?.name || "",
            scope: normalized?.scope || "domain",
            enabled: Boolean(entry?.enabled),
            title: entry?.title || "",
            description: entry?.description || "",
        };
    });
}

function blockTabWithReason(
    tabId: number,
    pageUrl: string,
    hostname: string,
    reason: "url" | "domain" | "ai",
    blockedLabel: string,
    aiContext?: { title: string; description: string; hostname: string }
) {
    if (blockedTabs[tabId]) {
        return;
    }
    blockedTabs[tabId] = true;
    if (reason === "ai" && aiContext) {
        chrome.storage.local.set({
            lastBlockContext: {
                reason,
                blocked: blockedLabel,
                host: hostname,
                url: pageUrl,
                title: aiContext.title,
                description: aiContext.description,
                hostname: aiContext.hostname,
                timestamp: Date.now(),
            },
        });
    }
    chrome.tabs.remove(tabId, () => {
        const warningUrl =
            `warning.html?reason=${reason}` +
            `&blocked=${encodeURIComponent(blockedLabel)}` +
            `&host=${encodeURIComponent(hostname)}` +
            `&url=${encodeURIComponent(pageUrl)}`;
        chrome.tabs.create({ url: warningUrl });
    });
}

function maybeBlockByAi(tabId: number, pageUrl: string, hostname: string) {
    if (!aiConfig.enabled || aiPendingTabs.has(tabId)) {
        return;
    }
    aiPendingTabs.add(tabId);
    if (!chrome.scripting) {
        aiPendingTabs.delete(tabId);
        return;
    }
    chrome.scripting.executeScript(
        {
            target: { tabId },
            func: () => {
                const description =
                    document.querySelector('meta[name="description"]')?.getAttribute("content") ||
                    document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
                    "";
                return {
                    title: document.title || "",
                    description,
                };
            },
        },
        (results) => {
            aiPendingTabs.delete(tabId);
            if (chrome.runtime.lastError || !results || !results[0]) {
                return;
            }
            const { title, description } = results[0].result || { title: "", description: "" };
            if (!hostname || (!title && !description)) {
                return;
            }
            const decision = decideAiAction(title, description || "", hostname, aiModel, aiConfig);
            if (decision === "block") {
                blockTabWithReason(tabId, pageUrl, hostname, "ai", hostname, {
                    title,
                    description: description || "",
                    hostname,
                });
                return;
            }
            if (decision === "ask") {
                maybePromptAiBlock(tabId, pageUrl, hostname, title, description || "");
            }
        }
    );
}

function toTextMap(blockedList) {
    const map = new Map<string, { title: string; description: string; hostname: string; enabled: boolean }>();
    (blockedList || []).forEach((entry) => {
        const title = entry?.title || "";
        const description = entry?.description || "";
        const hostname = getPureHostname(entry?.name || "");
        if (!hostname || (!title && !description)) {
            return;
        }
        const key = `${hostname}||${title}||${description}`;
        map.set(key, { title, description, hostname, enabled: Boolean(entry?.enabled) });
    });
    return map;
}

function maybePromptAiBlock(
    tabId: number,
    pageUrl: string,
    hostname: string,
    title: string,
    description: string
) {
    if (!chrome.scripting) {
        return;
    }
    const lastPrompted = aiPromptedUrls.get(tabId);
    if (lastPrompted === pageUrl) {
        return;
    }
    aiPromptedUrls.set(tabId, pageUrl);
    promptAiChoice(tabId, title).then((choice) => {
        if (!choice) {
            return;
        }
        chrome.storage.local.get({ blocked: [] }, function(result) {
            const currentBlocked = result.blocked;
            const normalizedEntry = normalizeBlockedEntry(pageUrl, choice);
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
                    title,
                    description,
                },
            ];

            chrome.storage.local.set({ blocked: newBlocked });
            chrome.tabs.reload(tabId);
        });
    });
}

function promptAiChoice(tabId: number, title: string): Promise<"domain" | "url" | null> {
    return new Promise((resolve) => {
        chrome.scripting.executeScript(
            {
                target: { tabId },
                args: [title],
                func: (pageTitle) => {
                    const existing = document.getElementById("tiny-blocker-ai-choice");
                    if (existing) {
                        existing.remove();
                    }
                    return new Promise((resolve) => {
                        const overlay = document.createElement("div");
                        overlay.id = "tiny-blocker-ai-choice";
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

                        const titleEl = document.createElement("div");
                        titleEl.textContent = "AI suggestion";
                        titleEl.style.fontWeight = "bold";
                        titleEl.style.marginBottom = "8px";

                        const subtitle = document.createElement("div");
                        subtitle.textContent = `Block content like: ${pageTitle}?`;
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
                        cancelButton.textContent = "Not now";
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

                        card.appendChild(titleEl);
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
                resolve(results[0].result as "domain" | "url" | null);
            }
        );
    });
}

function capturePageMetadata(tabId: number, fallbackTitle: string): Promise<{ title: string; description: string }> {
    if (!chrome.scripting) {
        return Promise.resolve({ title: fallbackTitle || "", description: "" });
    }
    return new Promise((resolve) => {
        chrome.scripting.executeScript(
            {
                target: { tabId },
                func: () => {
                    const description =
                        document.querySelector('meta[name="description"]')?.getAttribute("content") ||
                        document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
                        "";
                    return {
                        title: document.title || "",
                        description,
                    };
                },
            },
            (results) => {
                if (chrome.runtime.lastError || !results || !results[0]) {
                    resolve({ title: fallbackTitle || "", description: "" });
                    return;
                }
                const { title, description } = results[0].result || { title: "", description: "" };
                resolve({
                    title: title || fallbackTitle || "",
                    description: description || "",
                });
            }
        );
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
