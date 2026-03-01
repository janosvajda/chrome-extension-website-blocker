import {initPasswordProtection} from './helper/passwordProtection';
import {normalizeBlockedEntry} from './helper/blockedEntry';

const websiteList = document.getElementById('websiteList');
const addButton = document.getElementById('addButton');
const newWebsiteInput = document.getElementById('newWebsite') as HTMLInputElement;
const refreshButton = document.getElementById('refreshButton');
const prevPageButton = document.getElementById('prevPageButton') as HTMLButtonElement;
const nextPageButton = document.getElementById('nextPageButton') as HTMLButtonElement;
const pageNumbers = document.getElementById('pageNumbers');
const pageInfo = document.getElementById('pageInfo');
type BlockedEntry = {
    name: string;
    scope: 'domain' | 'url';
    enabled: boolean;
};

// Pagination defaults keep the list readable on smaller screens.
const pageSize = 5;
let currentPage = 1;
let blockedEntries: BlockedEntry[] = [];

// Render a single entry row and wire its UI events.
function createWebsiteItem(website, enabled, scope) {
    const normalizedWebsite = normalizeBlockedEntry(website, scope);
    if (!normalizedWebsite) {
        return null;
    }
    const websiteItem = document.createElement('div');
    websiteItem.className = 'websiteItem';
    websiteItem.setAttribute('data-scope', normalizedWebsite.scope);

    const websiteDetails = document.createElement('div');
    websiteDetails.className = 'websiteDetails';

    const websiteName = document.createElement('div');
    websiteName.className = 'websiteName';
    websiteName.textContent = normalizedWebsite.name;
    websiteDetails.appendChild(websiteName);

    const websiteScope = document.createElement('span');
    websiteScope.className = 'websiteScope';
    websiteScope.textContent = normalizedWebsite.scope === 'url' ? 'URL' : 'Domain';

    const websiteCheckbox = document.createElement('input');
    websiteCheckbox.type = 'checkbox';
    websiteCheckbox.className = 'websiteCheckbox';
    websiteCheckbox.checked = enabled;

    // Add an event listener to the checkbox to update local storage when checked or unchecked
    websiteCheckbox.addEventListener('change', () => {
        const index = blockedEntries.findIndex((entry) =>
            entry.name === normalizedWebsite.name && entry.scope === normalizedWebsite.scope
        );
        if (index >= 0) {
            blockedEntries[index] = { ...blockedEntries[index], enabled: websiteCheckbox.checked };
            persistBlockedEntries();
        }
    });

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
        blockedEntries = blockedEntries.filter((entry) =>
            !(entry.name === normalizedWebsite.name && entry.scope === normalizedWebsite.scope)
        );
        persistBlockedEntries();
        renderPage(currentPage);
    });

    websiteItem.appendChild(websiteDetails);
    websiteItem.appendChild(websiteScope);
    websiteItem.appendChild(websiteCheckbox);
    websiteItem.appendChild(deleteButton);
    websiteList.appendChild(websiteItem);

    return websiteItem;
}

// Load and normalize the list once, then render the first page.
function loadAndPopulateWebsiteList() {
    chrome.storage.local.get({ blocked: [] }, (data) => {
        blockedEntries = normalizeBlockedEntries(data.blocked || []);
        currentPage = 1;
        renderPage(currentPage);
    });
}

function refreshWebsiteList() {
    loadAndPopulateWebsiteList();
}

// Add by keyboard for quick entry.
newWebsiteInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        const websiteName = newWebsiteInput.value.toString().trim();
        if (websiteName) {
            addBlockedEntry(websiteName);
            newWebsiteInput.value = '';
        }
    }
});

// Initialize protected UI and blocked list after load.
window.addEventListener('DOMContentLoaded', async () => {
    await initPasswordProtection();
    loadAndPopulateWebsiteList();
});

// Add by button click.
addButton.addEventListener('click', () => {
    const websiteName = newWebsiteInput.value.toString().trim();
    if (websiteName) {
        addBlockedEntry(websiteName);
        newWebsiteInput.value = '';
    }
});

if (refreshButton) {
    refreshButton.addEventListener('click', () => {
        refreshWebsiteList();
    });
}

// Render one page worth of entries and update pagination controls.
function renderPage(page) {
    const items = websiteList.querySelectorAll('.websiteItem');
    items.forEach((item) => item.remove());

    const totalPages = Math.max(1, Math.ceil(blockedEntries.length / pageSize));
    currentPage = Math.min(Math.max(1, page), totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const pageEntries = blockedEntries.slice(startIndex, startIndex + pageSize);

    pageEntries.forEach((website) => {
        createWebsiteItem(
            website.name,
            website.enabled,
            website.scope
        );
    });

    renderPagination(totalPages);
}

// Build numbered pagination buttons and status text.
function renderPagination(totalPages) {
    if (prevPageButton) {
        prevPageButton.disabled = currentPage <= 1;
        prevPageButton.onclick = () => renderPage(currentPage - 1);
    }
    if (nextPageButton) {
        nextPageButton.disabled = currentPage >= totalPages;
        nextPageButton.onclick = () => renderPage(currentPage + 1);
    }
    if (pageNumbers) {
        pageNumbers.innerHTML = '';
        for (let i = 1; i <= totalPages; i += 1) {
            const button = document.createElement('button');
            button.textContent = i.toString();
            if (i === currentPage) {
                button.classList.add('active');
            }
            button.addEventListener('click', () => renderPage(i));
            pageNumbers.appendChild(button);
        }
    }
    if (pageInfo) {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    }
}

// Insert or enable an entry, then persist and jump to page 1.
function addBlockedEntry(websiteName) {
    const normalized = normalizeBlockedEntry(websiteName, 'domain');
    if (!normalized) {
        return;
    }
    const existingIndex = blockedEntries.findIndex((entry) =>
        entry.name === normalized.name && entry.scope === normalized.scope
    );
    if (existingIndex >= 0) {
        blockedEntries[existingIndex] = { ...blockedEntries[existingIndex], enabled: true };
    } else {
        blockedEntries.push({
            name: normalized.name,
            scope: normalized.scope,
            enabled: true,
        });
    }
    blockedEntries = sortBlockedEntries(blockedEntries);
    persistBlockedEntries();
    renderPage(1);
}

// Persist the current in-memory list for background logic.
function persistBlockedEntries() {
    chrome.storage.local.set({ blocked: blockedEntries });
}

function sortBlockedEntries(entries: BlockedEntry[]) {
    return [...entries].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
}

function normalizeBlockedEntries(entries) {
    const normalizedEntries = (entries || []).map((entry) => {
        const normalized = normalizeBlockedEntry(entry?.name || '', entry?.scope);
        if (!normalized) {
            return null;
        }
        return {
            name: normalized.name,
            scope: normalized.scope,
            enabled: Boolean(entry?.enabled),
        } as BlockedEntry;
    }).filter((entry) => entry !== null) as BlockedEntry[];

    return sortBlockedEntries(normalizedEntries);
}
