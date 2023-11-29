// Function to remove a website from local storage
export function removeFromLocalStorage(websiteToRemove) {
    chrome.storage.local.get({ blocked: [] }, (data) => {
        const blockedWebsites = data.blocked;

        // Filter out the website to remove
        const updatedBlockedWebsites = blockedWebsites.filter((website) => {
            return website.name !== websiteToRemove;
        });

        // Store the updated list in local storage
        chrome.storage.local.set({ blocked: updatedBlockedWebsites });
    });
}
