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

function createWebsiteItem(name: string, enabled: boolean): Element {
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
    };

    return item as unknown as Element;
}

describe('saveToLocalStorage', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('normalizes hostnames and saves enabled state', () => {
        const items = [
            createWebsiteItem('https://www.example.com', true),
            createWebsiteItem('http://www.fake-site.test/path', false),
            createWebsiteItem('fake-site.test', true),
            createWebsiteItem('https://subdomain.fake-site.test', false),
            createWebsiteItem('www.another-fake.test', true),
        ];
        const websiteItems = items as unknown as NodeListOf<Element>;

        saveToLocalStorage(websiteItems);

        expect(mockStorageLocal.set).toHaveBeenCalledWith({
            blocked: [
                { name: 'example.com', enabled: true },
                { name: 'fake-site.test', enabled: false },
                { name: 'fake-site.test', enabled: true },
                { name: 'subdomain.fake-site.test', enabled: false },
                { name: 'another-fake.test', enabled: true },
            ],
        });
    });
});
