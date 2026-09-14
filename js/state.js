// The central store for all application data and UI state.
export const state = {
    interfaces: [],
    dataItemsCatalogue: {},
    dataBlocksCatalogue: {},
    rejectionCodesCatalogue: {},
    filteredInterfaces: [],
    currentFilter: 'all',
    currentSearchTerm: '',
    favorites: new Set(),
    searchCache: new Map(),
    currentInterfaceId: null,
    catalogueIssues: [],
    currentDipVariants: {},
};

// Loads user's favorite interfaces from local storage.
export function loadFavorites() {
    try {
        const savedFavorites = localStorage.getItem('mhhs_favorites');
        if (savedFavorites) {
            state.favorites = new Set(JSON.parse(savedFavorites));
        }
    } catch (e) {
        console.warn('Could not load user favorites:', e);
    }
}

// Saves user's favorite interfaces to local storage.
export function saveFavorites() {
    try {
        localStorage.setItem('mhhs_favorites', JSON.stringify([...state.favorites]));
    } catch (e) {
        console.warn('Could not save user favorites:', e);
    }
}
