import { normalizeBlockedEntry } from "../../helper/blockedEntry";

// Function to save the enabled/disabled status of websites to local storage
export function saveToLocalStorage(websiteItems: NodeListOf<Element>) {
    const blocked = Array.from(websiteItems).map((item) => {
        const name = item.querySelector(".websiteName").textContent || "";
        const scope = item.getAttribute("data-scope") || undefined;
        const title = item.getAttribute("data-title") || "";
        const description = item.getAttribute("data-description") || "";
        const normalized = normalizeBlockedEntry(name, scope as "domain" | "url" | undefined);
        const entry: {
            name: string;
            scope: string;
            enabled: boolean;
            title?: string;
            description?: string;
        } = {
            name: normalized?.name || "",
            scope: normalized?.scope || "domain",
            enabled: (item.querySelector(".websiteCheckbox") as HTMLInputElement).checked,
        };
        if (title) {
            entry.title = title;
        }
        if (description) {
            entry.description = description;
        }
        return entry;
    }).filter((item) => item.name);
    // Store the blocked websites in chrome.storage.local
    chrome.storage.local.set({ blocked });
}
