import { normalizeBlockedEntry } from "../../helper/blockedEntry";

// Function to remove a website from local storage
export function removeFromLocalStorage(websiteToRemove: string, scope?: "domain" | "url") {
    const normalizedToRemove = normalizeBlockedEntry(websiteToRemove, scope);
    if (!normalizedToRemove) {
        return;
    }
    chrome.storage.local.get({ blocked: [] }, (data) => {
        const blockedWebsites = data.blocked;

        // Filter out the website to remove
        const updatedBlockedWebsites = blockedWebsites.filter((website) => {
            return !(website.name === normalizedToRemove.name && (website.scope || "domain") === normalizedToRemove.scope);
        });

        // Store the updated list in local storage
        chrome.storage.local.set({ blocked: updatedBlockedWebsites });
    });
}
