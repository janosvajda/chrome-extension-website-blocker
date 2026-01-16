import { getPureHostname } from "../../helper/getPureHostname";

// Function to remove a website from local storage
export function removeFromLocalStorage(websiteToRemove: string) {
    const normalizedToRemove = getPureHostname(websiteToRemove);
    chrome.storage.local.get({ blocked: [] }, (data) => {
        const blockedWebsites = data.blocked;

        // Filter out the website to remove
        const updatedBlockedWebsites = blockedWebsites.filter((website) => {
            return website.name !== normalizedToRemove;
        });

        // Store the updated list in local storage
        chrome.storage.local.set({ blocked: updatedBlockedWebsites });
    });
}
