import { saveToLocalStorage } from './saveToLocalStorage';

// Mock chrome.storage.local
const mockStorageLocal = {
    set: jest.fn(),
};

// Mock the global chrome object
(global as any).chrome = {
    storage: {
        local: mockStorageLocal,
    },
};

function createWebsiteItem(
    name: string,
    enabled: boolean,
    scope?: string,
    title?: string,
    description?: string
): Element {
    const nameElement = { textContent: name };
    const checkboxElement = { checked: enabled };

    const item = {
        querySelector: (selector: string) => {
            if (selector === '.websiteName') {
                return nameElement;
            }
            if (selector === '.websiteCheckbox') {
                return checkboxElement;
            }
            return null;
        },
        getAttribute: (attribute: string) => {
            if (attribute === 'data-scope') {
                return scope;
            }
            if (attribute === 'data-title') {
                return title;
            }
            if (attribute === 'data-description') {
                return description;
            }
            return null;
        },
    };

    return item as unknown as Element;
}

describe('saveToLocalStorage', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('normalizes hostnames and saves enabled state', () => {
        const items = [
            createWebsiteItem('https://www.example.com', true, 'domain', 'Example Domain', 'Example description'),
            createWebsiteItem('http://www.fake-site.test/path', false, 'url'),
            createWebsiteItem('fake-site.test', true),
            createWebsiteItem('https://subdomain.fake-site.test', false),
            createWebsiteItem('www.another-fake.test', true),
        ];
        const websiteItems = items as unknown as NodeListOf<Element>;

        saveToLocalStorage(websiteItems);

        expect(mockStorageLocal.set).toHaveBeenCalledWith({
            blocked: [
                {
                    name: 'example.com',
                    scope: 'domain',
                    enabled: true,
                    title: 'Example Domain',
                    description: 'Example description',
                },
                { name: 'http://www.fake-site.test/path', scope: 'url', enabled: false },
                { name: 'fake-site.test', scope: 'domain', enabled: true },
                { name: 'subdomain.fake-site.test', scope: 'domain', enabled: false },
                { name: 'another-fake.test', scope: 'domain', enabled: true },
            ],
        });
    });
});
