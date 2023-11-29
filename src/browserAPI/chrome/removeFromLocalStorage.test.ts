// extension.test.js
import { removeFromLocalStorage } from './removeFromLocalStorage';

// Mock chrome.storage.local
const mockStorageLocal = {
    get: jest.fn(),
    set: jest.fn(),
};

// Mock the global chrome object
(global as any).chrome = {
    storage: {
        local: mockStorageLocal,
    },
};

describe('removeFromLocalStorage', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('removes the specified website from local storage', async () => {
        const websiteToRemove = 'example.com';
        const blockedWebsites = [
            { name: 'example.com' },
            { name: 'another-example.com' },
        ];

        // Set up the mock for chrome.storage.local.get
        mockStorageLocal.get.mockImplementationOnce((data, callback) => {
            // Simulate asynchronous behavior using Promise.resolve
            return Promise.resolve().then(() => {
                callback({ blocked: blockedWebsites });
            });
        });

        // Set up the mock for chrome.storage.local.set
        mockStorageLocal.set.mockImplementationOnce((data) => {
            // Simulate asynchronous behavior using Promise.resolve
            return Promise.resolve();
        });

        // Act
        await removeFromLocalStorage(websiteToRemove);

        // Assert
        expect(mockStorageLocal.set).toHaveBeenCalledWith({ blocked: [{ name: 'another-example.com' }] });
    });
});
