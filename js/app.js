
import { state, loadFavorites } from './state.js';
import { fetchData } from './api.js';
import {
    DOMElements,
    cacheDOMElements,
    renderInterfaceList,
    renderInterfaceDetails,
    toggleFavorite,
    showRejectionCodes,
    hideRejectionCodes,
    renderRejectionCodesList,
    showLoading,
    hideLoading,
    renderSearchSuggestions,
    hideSearchSuggestions
} from './ui.js';
import { fuzzySearch, generateSearchSuggestions } from './utils.js';

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    cacheDOMElements(); 
    showLoading(); 
    loadFavorites();

    const data = await fetchData('interfaceData.json');
    if (!data) {
        DOMElements.interfaceList.innerHTML = `<p class="text-center text-red-600 p-4">Error: Could not load interface data. Please refresh the page.</p>`;
        hideLoading();
        return;
    }

    Object.assign(state, data, { filteredInterfaces: data.interfaces || [] });
    state.catalogueIssues = validateCatalogue(data);

    const meta = data._catalogueMeta || {};
    if (DOMElements.sourceVersion) {
        DOMElements.sourceVersion.textContent = meta.currentTechnicalReference || 'DIP technical reference';
    }
    if (DOMElements.sourceChecked) {
        const checked = meta.auditDate ? new Date(`${meta.auditDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        DOMElements.sourceChecked.textContent = checked ? `Checked ${checked}` : 'Reference status';
    }

    setupEventListeners();
    
    const params = new URLSearchParams(window.location.search);
    const initialSearch = params.get('search') || '';
    const initialFilter = params.get('filter') || 'all';
    const initialSelected = params.get('selected');

    if (initialSearch) {
        DOMElements.searchInput.value = initialSearch;
        state.currentSearchTerm = initialSearch;
    }
    if (initialFilter) {
        state.currentFilter = initialFilter;
        DOMElements.filterButtons.forEach(btn => {
            const isActive = btn.dataset.filter === initialFilter;
            btn.classList.toggle('active-filter', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    filterAndRender();

    if (initialSelected && state.interfaces.some(i => i.id === initialSelected)) {
        renderInterfaceDetails(initialSelected);
    }
    
    hideLoading();
}

function setupEventListeners() {
    let debounceTimer;
    
    // --- UPDATED SEARCH LOGIC ---
    const handleSearch = () => {
        state.currentSearchTerm = DOMElements.searchInput.value;
        const suggestions = generateSearchSuggestions(state.currentSearchTerm, state.interfaces);
        renderSearchSuggestions(suggestions);
        
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(filterAndRender, 200);
    };

    DOMElements.searchInput.addEventListener('input', handleSearch);
    DOMElements.searchInput.addEventListener('focus', handleSearch);
    DOMElements.searchInput.addEventListener('blur', hideSearchSuggestions);

    DOMElements.searchSuggestions.addEventListener('click', e => {
        const suggestionEl = e.target.closest('[data-suggestion]');
        if (suggestionEl) {
            DOMElements.searchInput.value = suggestionEl.dataset.suggestion;
            state.currentSearchTerm = suggestionEl.dataset.suggestion;
            hideSearchSuggestions();
            filterAndRender();
        }
    });
    // --- END OF UPDATED SEARCH LOGIC ---

    DOMElements.filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            state.currentFilter = button.dataset.filter;
            DOMElements.filterButtons.forEach(btn => {
                const isActive = btn === button;
                btn.classList.toggle('active-filter', isActive);
                btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
            filterAndRender();
        });
    });

    DOMElements.interfaceList.addEventListener('click', e => {
        const card = e.target.closest('[data-id]');
        if (card) {
            renderInterfaceDetails(card.dataset.id);
            updateURL();
        }
    });

    DOMElements.interfaceList.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest('[data-id]');
        if (!card) return;
        e.preventDefault();
        renderInterfaceDetails(card.dataset.id);
        updateURL();
    });

    DOMElements.detailsContent.addEventListener('click', e => {
        const favoriteButton = e.target.closest('[data-action="toggle-favorite"]');
        if (favoriteButton) {
            toggleFavorite(favoriteButton.dataset.id);
        }
    });

    DOMElements.detailsContent.addEventListener('change', e => {
        const eventSelect = e.target.closest('[data-action="dip-event"]');
        if (eventSelect) {
            state.currentDipVariants[eventSelect.dataset.id] = eventSelect.value;
            renderInterfaceDetails(eventSelect.dataset.id);
            updateURL();
        }
    });

    DOMElements.rejectionCodesBtn.addEventListener('click', showRejectionCodes);
    DOMElements.interfacesHomeBtn?.addEventListener('click', hideRejectionCodes);
    DOMElements.closeRejectionCodes.addEventListener('click', hideRejectionCodes);
    
    
    DOMElements.rejectionCodeSearch.addEventListener('input', e => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = Object.entries(state.rejectionCodesCatalogue).filter(([id, code]) => 
            `${id} ${code.description} ${code.reason} ${code.resolution}`.toLowerCase().includes(searchTerm)
        );
        renderRejectionCodesList(filtered);
    });
    
    window.addEventListener('popstate', () => {
        // This can be used to handle back/forward navigation if needed in the future
    });
}

function buildSearchableContent(item) {
    let content = [item.id, item.name, item.description, item.sender, item.receiver, item.context].join(' ');
    if (item.composition) {
        item.composition.forEach(comp => {
            const block = comp.type === 'block' ? state.dataBlocksCatalogue[comp.id] : null;
            const items = block ? block.items : (comp.type === 'item' ? [comp.id] : []);
            items.forEach(itemId => {
                const di = state.dataItemsCatalogue[itemId];
                if (di) content += ` ${itemId} ${di.name} ${di.rule}`;
            });
        });
    }
    return content.toLowerCase();
}

function validateCatalogue(data) {
    const issues = [];
    const interfaces = data.interfaces || [];
    const blocks = data.dataBlocksCatalogue || {};
    const items = data.dataItemsCatalogue || {};
    const rejections = data.rejectionCodesCatalogue || {};
    const masterEvents = new Set(items['DI-999']?.populationNotes || []);
    const seenInterfaceIds = new Set();

    interfaces.forEach(iface => {
        if (seenInterfaceIds.has(iface.id)) {
            issues.push({ type: 'duplicate-interface', interfaceId: iface.id, message: `Duplicate interface ID: ${iface.id}` });
        }
        seenInterfaceIds.add(iface.id);

        (iface.composition || []).forEach(comp => {
            if (comp.type === 'block' && !blocks[comp.id]) {
                issues.push({ type: 'missing-block', interfaceId: iface.id, ref: comp.id, message: `${iface.id} references missing block ${comp.id}` });
            }
            if (comp.type === 'item' && !items[comp.id]) {
                issues.push({ type: 'missing-item', interfaceId: iface.id, ref: comp.id, message: `${iface.id} references missing data item ${comp.id}` });
            }
        });

        (iface.rejectionCodeIds || []).forEach(codeId => {
            if (!rejections[codeId]) {
                issues.push({ type: 'missing-rejection', interfaceId: iface.id, ref: codeId, message: `${iface.id} references undefined rejection code ${codeId}` });
            }
        });

        (iface.eventCodes || []).forEach(eventCode => {
            if (!masterEvents.has(eventCode)) {
                issues.push({ type: 'missing-master-event', interfaceId: iface.id, ref: eventCode, message: `${iface.id} event ${eventCode} is absent from DI-999` });
            }
        });
    });

    Object.entries(blocks).forEach(([blockId, block]) => {
        (block.items || []).forEach(itemId => {
            if (!items[itemId]) {
                issues.push({ type: 'missing-block-item', blockId, ref: itemId, message: `${blockId} references missing data item ${itemId}` });
            }
        });
        Object.keys(block.payloadKeys || {}).forEach(itemId => {
            if (!(block.items || []).includes(itemId)) {
                issues.push({ type: 'orphan-block-key', blockId, ref: itemId, message: `${blockId} defines a payload key for non-member item ${itemId}` });
            }
        });
    });

    if (issues.length) {
        console.groupCollapsed(`Catalogue integrity check: ${issues.length} issue(s)`);
        issues.forEach(issue => console.warn(issue.message, issue));
        console.groupEnd();
    } else {
        console.info('Catalogue integrity check passed with no reference errors.');
    }
    return issues;
}

function filterAndRender() {
    const searchTerms = state.currentSearchTerm.toLowerCase().split(' ').filter(term => term.trim());
    
    state.filteredInterfaces = state.interfaces.filter(item => {
        const matchesFilter = state.currentFilter === 'all' ||
            item.supplier_type === state.currentFilter ||
            (state.currentFilter === 'supplier_send' && item.supplier_type === 'supplier_both') ||
            (state.currentFilter === 'supplier_receive' && item.supplier_type === 'supplier_both');
        
        if (!matchesFilter) return false;
        if (searchTerms.length === 0) return true;

        const content = buildSearchableContent(item);
        return searchTerms.some(term => fuzzySearch(term, content, 0.3).matches);
    });
    
    if (state.currentSearchTerm) {
        state.filteredInterfaces.sort((a, b) => {
            const aScore = fuzzySearch(state.currentSearchTerm, buildSearchableContent(a)).score;
            const bScore = fuzzySearch(state.currentSearchTerm, buildSearchableContent(b)).score;
            return bScore - aScore;
        });
    }

    renderInterfaceList();
    updateURL();
}

function updateURL() {
    const params = new URLSearchParams();
    if (state.currentSearchTerm) params.set('search', state.currentSearchTerm);
    if (state.currentFilter !== 'all') params.set('filter', state.currentFilter);
    if (state.currentInterfaceId && !DOMElements.detailsContent.classList.contains('hidden')) {
        params.set('selected', state.currentInterfaceId);
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
}
