import { state, saveFavorites } from './state.js';
import { escapeHtml, highlightSearchTerms } from './utils.js';
import { getDipStructure } from './dipStructure.js';

// A central cache for frequently accessed DOM elements.
export const DOMElements = {};

export function cacheDOMElements() {
    const ids = [
        'searchInput', 'searchSuggestions', 'interfaceList', 'welcomeMessage', 'detailsContent',
'rejectionCodesBtn', 'rejectionCodesPanel', 'closeRejectionCodes',
        'rejectionCodeSearch', 'rejectionCodesList', 'loading-indicator', 'interfaceCount', 'sourceVersion', 'sourceChecked'
    ];
    
    // Helper function to convert kebab-case (like 'loading-indicator') to camelCase (like 'loadingIndicator')
    const toCamelCase = (str) => str.replace(/-(\w)/g, (_, c) => c.toUpperCase());

    ids.forEach(id => {
        const camelCaseId = toCamelCase(id);
        DOMElements[camelCaseId] = document.getElementById(id);
    });
    
    DOMElements.filterButtons = document.querySelectorAll('.filter-btn');
    DOMElements.interfaceCardTemplate = document.getElementById('interface-card-template');
}

export function showLoading() {
    if (DOMElements.loadingIndicator) {
        DOMElements.loadingIndicator.style.display = 'flex';
    }
}

export function hideLoading() {
    if (DOMElements.loadingIndicator) {
        DOMElements.loadingIndicator.style.display = 'none';
    }
}

export function renderInterfaceList() {
    const { interfaceList, interfaceCardTemplate, interfaceCount } = DOMElements;
    if (!interfaceList || !interfaceCardTemplate) return;

    if (interfaceCount) {
        interfaceCount.textContent = state.currentSearchTerm || state.currentFilter !== 'all'
            ? `${state.filteredInterfaces.length}/${state.interfaces.length}`
            : `${state.interfaces.length}`;
        interfaceCount.title = `${state.filteredInterfaces.length} interfaces shown`;
    }

    if (state.filteredInterfaces.length === 0) {
        interfaceList.innerHTML = `<div class="p-5 text-center border border-[var(--border)] rounded-xl bg-white">
            <p class="font-semibold text-sm text-[var(--ink)]">No interfaces found</p>
            <p class="text-xs text-[var(--muted)] mt-1">Try another search term or filter.</p>
        </div>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    const typeClasses = {
        supplier_send: 'border-send',
        supplier_receive: 'border-receive',
        supplier_both: 'border-both',
        none: 'border-none',
        unverified: 'border-unverified'
    };

    state.filteredInterfaces.forEach(item => {
        const clone = interfaceCardTemplate.content.cloneNode(true);
        const card = clone.querySelector('.interface-card');
        card.dataset.id = item.id;
        card.classList.add(typeClasses[item.supplier_type] || typeClasses.none);
        if (state.favorites.has(item.id)) card.classList.add('favorite');
        if (state.currentInterfaceId === item.id && DOMElements.rejectionCodesPanel?.classList.contains('hidden')) {
            card.classList.add('active-interface');
            card.setAttribute('aria-current', 'true');
        }

        card.querySelector('[data-role="id"]').innerHTML = highlightSearchTerms(item.id, state.currentSearchTerm);
        card.querySelector('[data-role="name"]').innerHTML = highlightSearchTerms(item.name, state.currentSearchTerm);
        card.setAttribute('aria-label', `${item.id}: ${item.name}`);
        fragment.appendChild(clone);
    });

    interfaceList.innerHTML = '';
    interfaceList.appendChild(fragment);
}

export function toggleFavorite(id) {
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);

    saveFavorites();
    renderInterfaceList();

    const favoriteButton = DOMElements.detailsContent.querySelector(`[data-action="toggle-favorite"][data-id="${id}"]`);
    if (favoriteButton) {
        const isFavorite = state.favorites.has(id);
        favoriteButton.textContent = isFavorite ? '★' : '☆';
        favoriteButton.classList.toggle('is-favorite', isFavorite);
        favoriteButton.title = isFavorite ? 'Remove from favorites' : 'Add to favorites';
        favoriteButton.setAttribute('aria-label', favoriteButton.title);
    }
}

export function renderInterfaceDetails(id) {
    const item = state.interfaces.find(i => i.id === id);
    if (!item) return;

    state.currentInterfaceId = id;
    hideRejectionCodes();
    DOMElements.welcomeMessage.classList.add('hidden');
    DOMElements.detailsContent.classList.remove('hidden');
    DOMElements.detailsContent.classList.add('details-fade-in');
    setTimeout(() => DOMElements.detailsContent.classList.remove('details-fade-in'), 250);

    const typeInfo = {
        supplier_send: { label: 'Supplier send', className: 'supplier-send' },
        supplier_receive: { label: 'Supplier receive', className: 'supplier-receive' },
        supplier_both: { label: 'Supplier send & receive', className: 'supplier-both' },
        none: { label: 'Supplier not involved', className: '' },
        unverified: { label: 'Routing not verified', className: 'supplier-unverified' }
    };
    const supplier = typeInfo[item.supplier_type] || typeInfo.none;
    const isFavorite = state.favorites.has(id);
    const dipStructureHtml = generateDipStructureHtml(item);

    DOMElements.detailsContent.innerHTML = `
        <header class="interface-detail-header">
            <div class="interface-detail-title">
                <p class="interface-detail-id">${escapeHtml(item.id)}</p>
                <div class="interface-detail-title-row">
                    <h2 tabindex="-1">${escapeHtml(item.name)}</h2>
                    <button data-action="toggle-favorite" data-id="${escapeHtml(id)}" class="favorite-btn ${isFavorite ? 'is-favorite' : ''}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}" aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">${isFavorite ? '★' : '☆'}</button>
                </div>
            </div>
            <span class="supplier-pill ${supplier.className}">${escapeHtml(supplier.label)}</span>
        </header>

        <section class="summary-strip" aria-label="Interface routing summary">
            <div class="summary-cell">
                <span class="summary-label">From</span>
                <div class="summary-value">${escapeHtml(item.sender || 'N/A')}</div>
            </div>
            <div class="summary-cell">
                <span class="summary-label">To</span>
                <div class="summary-value">${escapeHtml(item.receiver || 'N/A')}</div>
            </div>
        </section>

        <section class="content-card context-card">
            <h3 class="content-card-heading">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10.5V17M12 7.25h.01" stroke-linecap="round"/></svg>
                Context & purpose
            </h3>
            <p>${escapeHtml(item.context || 'No context available.')}</p>
        </section>

        ${generateVerificationHtml(item)}
        ${generateNotesHtml(item)}
        ${generateRoutingRulesHtml(item)}
        ${generateErrorCodesHtml(item)}
        ${dipStructureHtml}
    `;

    renderInterfaceList();
    DOMElements.detailsContent.querySelector('h2')?.focus({ preventScroll: true });
}

function generateVerificationHtml(interfaceItem) {
    if (!interfaceItem.verification && !interfaceItem.releaseStatus) return '';
    const v = interfaceItem.verification || {};
    return `<section class="content-card info-card status-card">
        <h3>Verification & release status</h3>
        ${interfaceItem.releaseStatus ? `<p><strong>Release:</strong> ${escapeHtml(interfaceItem.releaseStatus)}</p>` : ''}
        ${v.status ? `<p><strong>Status:</strong> ${escapeHtml(v.status)}</p>` : ''}
        ${v.sourceVersion ? `<p><strong>Technical reference:</strong> ${escapeHtml(v.sourceVersion)}</p>` : ''}
        ${v.checkedDate ? `<p><strong>Checked:</strong> ${escapeHtml(v.checkedDate)}</p>` : ''}
        ${v.scope ? `<p>${escapeHtml(v.scope)}</p>` : ''}
    </section>`;
}

function generateNotesHtml(interfaceItem) {
    if (!Array.isArray(interfaceItem.notes) || interfaceItem.notes.length === 0) return '';
    return `<section class="content-card info-card note-card">
        <h3>Important notes</h3>
        <ul>${interfaceItem.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
    </section>`;
}

function generateRoutingRulesHtml(interfaceItem) {
    if (!Array.isArray(interfaceItem.routingRules) || interfaceItem.routingRules.length === 0) return '';
    return `<section class="content-card info-card routing-card">
        <h3>Routing rules</h3>
        <ul>${interfaceItem.routingRules.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
    </section>`;
}

function generateErrorCodesHtml(interfaceItem) {
    if (!Array.isArray(interfaceItem.errorCodes) || interfaceItem.errorCodes.length === 0) return '';
    return `<section class="content-card info-card error-card">
        <h3>Error codes</h3>
        ${interfaceItem.errorCodes.map(code => `<div class="mb-3 last:mb-0"><span class="code-pill inline-block px-2 py-1 bg-red-100 text-red-800 font-bold text-xs rounded">${escapeHtml(code.id)}</span><p class="mt-2">${escapeHtml(code.description)}</p>${code.note ? `<p>${escapeHtml(code.note)}</p>` : ''}</div>`).join('')}
    </section>`;
}

function renderDataItemRows(itemIds, interfaceItem) {
    return itemIds.map(itemId => {
        const di = state.dataItemsCatalogue[itemId];
        if (!di) return `<tr><td colspan="6" class="px-4 py-3 text-xs text-amber-800">${escapeHtml(itemId)} is referenced by this block but is not present in the local data-item catalogue.</td></tr>`;

        let populationNotesContent = di.populationNotes;
        if (itemId === 'DI-999' && di.enumerated && Array.isArray(di.populationNotes)) {
            const validCodes = interfaceItem?.eventCodes || [];
            populationNotesContent = di.populationNotes.filter(code => validCodes.includes(code)).join('\n');
        }

        const notesHtml = populationNotesContent ? `<p class="text-[var(--purple)] opacity-90 whitespace-pre-wrap">${escapeHtml(populationNotesContent)}</p>` : '';
        const exampleHtml = di.example ? `<code class="text-blue-600 bg-blue-50 p-1 rounded-md text-xs">${escapeHtml(di.example)}</code>` : '';
        return `<tr class="hover:bg-gray-50/50">
            <td class="px-3 py-3 font-mono font-semibold text-xs align-top whitespace-nowrap">${escapeHtml(itemId)}</td>
            <td class="px-3 py-3 align-top min-w-[180px]">${escapeHtml(di.name)}</td>
            <td class="px-3 py-3 font-semibold text-center align-top"><span class="cmo-pill">${escapeHtml(di.cmo)}</span></td>
            <td class="px-3 py-3 text-xs opacity-80 align-top min-w-[220px]">${escapeHtml(di.rule)}</td>
            <td class="px-3 py-3 text-xs align-top min-w-[220px]">${notesHtml}</td>
            <td class="px-3 py-3 text-xs align-top">${exampleHtml}</td>
        </tr>`;
    }).join('');
}

function renderBlockNode(node, interfaceItem, depth = 0) {
    const indentClass = depth ? 'dip-node-nested' : '';
    const requiredBadge = node.required === true
        ? '<span class="dip-badge dip-badge-required">Required</span>'
        : node.required === false
            ? '<span class="dip-badge dip-badge-optional">Optional</span>'
            : '<span class="dip-badge dip-badge-varies">Varies</span>';

    if (node.type === 'missing-block') {
        return `<div class="dip-block dip-block-missing ${indentClass}">
            <div class="dip-block-summary">
                <span class="dip-path-key">${escapeHtml(node.key)}</span>
                <span class="font-semibold text-sm text-amber-950">${escapeHtml(node.label || 'Block not catalogued locally')}</span>
                <span class="dip-badge dip-badge-warning">DIP only</span>
            </div>
            ${node.note ? `<p class="dip-node-note">${escapeHtml(node.note)}</p>` : ''}
        </div>`;
    }

    if (node.type === 'wrapper' || node.type === 'wrapper-list') {
        const repeating = node.type === 'wrapper-list';
        return `<div class="dip-wrapper ${indentClass}">
            <div class="dip-wrapper-heading">
                <div class="flex flex-wrap items-center gap-2">
                    <span class="dip-path-key">${escapeHtml(node.key)}</span>
                    <span class="font-bold text-sm text-[var(--dark-purple)]">${escapeHtml(node.label || 'Wrapper block')}</span>
                    ${repeating ? '<span class="dip-badge dip-badge-list">Repeating list</span>' : '<span class="dip-badge dip-badge-wrapper">Wrapper</span>'}
                    ${requiredBadge}
                </div>
                ${node.note ? `<p class="dip-node-note mt-1">${escapeHtml(node.note)}</p>` : ''}
            </div>
            <div class="dip-wrapper-children">
                ${(node.children || []).map(child => renderBlockNode(child, interfaceItem, depth + 1)).join('')}
            </div>
        </div>`;
    }

    const block = node.blockId ? state.dataBlocksCatalogue[node.blockId] : null;
    const title = node.label || block?.title || node.key;
    const listBadge = node.type === 'list' ? '<span class="dip-badge dip-badge-list">Repeating list</span>' : '';
    const rows = block ? renderDataItemRows(block.items || [], interfaceItem) : '';
    return `<details class="dip-block ${indentClass}" ${depth === 0 ? 'open' : ''}>
        <summary class="dip-block-summary cursor-pointer">
            <span class="dip-path-key">${escapeHtml(node.key)}</span>
            <span class="font-semibold text-sm text-[var(--dark-purple)]">${escapeHtml(title)}</span>
            ${listBadge}
            ${requiredBadge}
        </summary>
        ${node.note ? `<p class="dip-node-note px-4 pt-3">${escapeHtml(node.note)}</p>` : ''}
        ${block ? `<div class="overflow-x-auto mt-2">
            <table class="w-full text-sm text-left dip-data-table">
                <thead><tr>
                    <th>ID</th><th>Data Item</th><th>M/O/C</th><th>Description / Rule</th><th>Population Notes</th><th>Example</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-200/50">${rows}</tbody>
            </table>
        </div>` : `<p class="dip-node-note px-4 py-3">No local block definition is available for this structural node.</p>`}
    </details>`;
}

function renderStructureSection(title, path, nodes, interfaceItem, description) {
    return `<section class="dip-structure-section">
        <div class="dip-section-heading">
            <div>
                <p class="dip-section-path">${escapeHtml(path)}</p>
                <h4>${escapeHtml(title)}</h4>
            </div>
            <p>${escapeHtml(description)}</p>
        </div>
        <div class="space-y-3">${(nodes || []).map(node => renderBlockNode(node, interfaceItem)).join('') || '<p class="text-sm text-gray-500">No blocks defined for this section.</p>'}</div>
    </section>`;
}

function generateDipStructureHtml(interfaceItem) {
    const selectedEvent = state.currentDipVariants[interfaceItem.id] || null;
    const structure = getDipStructure(interfaceItem, state.dataBlocksCatalogue, selectedEvent);
    state.currentDipVariants[interfaceItem.id] = structure.event;

    const statusClasses = {
        'swagger-verified': 'dip-status-verified',
        'example-crosschecked': 'dip-status-verified',
        'schema-structure': 'dip-status-partial',
        'catalogue-fallback': 'dip-status-fallback'
    };
    const statusLabel = structure.label || (structure.status === 'catalogue-fallback' ? 'Catalogue fallback' : 'DIP structure');
    const eventOptions = (structure.eventCodes || []).map(event => `<option value="${escapeHtml(event)}" ${event === structure.event ? 'selected' : ''}>${escapeHtml(event)}</option>`).join('');
    const eventSelector = structure.eventCodes?.length > 1 ? `<label class="dip-event-selector">
        <span>Event variant</span>
        <select data-action="dip-event" data-id="${escapeHtml(interfaceItem.id)}">${eventOptions}</select>
    </label>` : structure.event ? `<div class="dip-single-event"><span>Event</span><strong>${escapeHtml(structure.event)}</strong></div>` : '';

    const fallbackWarning = !structure.hasExactVariant ? `<div class="dip-fallback-warning">
        This event has not yet been mapped to an exact current Swagger variant. The page still separates the DIP envelope correctly, but its CustomBlock ordering is temporarily using the existing catalogue order.
    </div>` : '';

    return `<div class="dip-structure-card mt-6 md:mt-8">
        <div class="dip-structure-titlebar">
            <div>
                <p class="dip-eyebrow">Technical payload view</p>
                <h3>DIP Message Structure</h3>
                <p>Displayed as the message envelope is structured in the DIP rather than as one flattened DES138 block list.</p>
            </div>
            <div class="dip-structure-controls">
                <span class="dip-status ${statusClasses[structure.status] || 'dip-status-partial'}">${escapeHtml(statusLabel)}</span>
                ${eventSelector}
            </div>
        </div>
        ${structure.sourceNote ? `<div class="dip-source-note"><strong>Structure source:</strong> ${escapeHtml(structure.sourceNote)}</div>` : ''}
        ${fallbackWarning}
        ${renderStructureSection('CommonBlock', 'payload.CommonBlock', structure.common, interfaceItem, 'DIP envelope and routing metadata. D0 is added or updated by the DIP on publication/egress.')}
        ${renderStructureSection('CustomBlock', 'payload.CustomBlock', structure.custom, interfaceItem, 'Interface-specific business data. Repeating wrapper/list structures are kept nested instead of flattened.')}
    </div>`;
}

export function showRejectionCodes() {
    DOMElements.rejectionCodesBtn?.classList.add('is-active');
    DOMElements.welcomeMessage.classList.add('hidden');
    DOMElements.detailsContent.classList.add('hidden');
    DOMElements.rejectionCodesPanel.classList.remove('hidden');
    renderRejectionCodesList(Object.entries(state.rejectionCodesCatalogue));
}

export function hideRejectionCodes() {
    DOMElements.rejectionCodesBtn?.classList.remove('is-active');
    DOMElements.rejectionCodesPanel.classList.add('hidden');
    if (!state.currentInterfaceId) {
        DOMElements.welcomeMessage.classList.remove('hidden');
    } else {
        DOMElements.detailsContent.classList.remove('hidden');
    }
}

export function renderRejectionCodesList(codes) {
    if (codes.length === 0) {
        DOMElements.rejectionCodesList.innerHTML = `<div class="content-card p-8 text-center"><p class="font-semibold">No rejection codes found</p><p class="text-xs text-gray-500 mt-1">Try a different search term.</p></div>`;
        return;
    }

    DOMElements.rejectionCodesList.innerHTML = codes.map(([codeId, code]) => `
        <article class="rejection-code-card">
            <div class="flex items-start gap-3">
                <span class="code-pill inline-flex px-2 py-1 bg-red-50 text-red-800 font-semibold text-[10px] rounded-md">${escapeHtml(codeId)}</span>
                <div class="min-w-0 flex-1">
                    <h3 class="font-semibold text-sm text-[var(--ink)] leading-snug">${escapeHtml(code.description)}</h3>
                    ${code.reason ? `<p class="text-[11px] leading-relaxed text-gray-600 mt-2"><strong class="text-gray-800">Reason:</strong> ${escapeHtml(code.reason)}</p>` : ''}
                    ${code.resolution ? `<p class="text-[11px] leading-relaxed text-gray-600 mt-2"><strong class="text-gray-800">Resolution:</strong> ${escapeHtml(code.resolution)}</p>` : ''}
                    ${code.repeatForQueue === true ? `<p class="text-[10px] text-gray-500 mt-2">Repeat for Queue: Yes</p>` : ''}
                </div>
            </div>
        </article>`).join('');
}

export function renderSearchSuggestions(suggestions) {
    if (suggestions.length === 0) {
        DOMElements.searchSuggestions.classList.add('hidden');
        return;
    }

    const html = suggestions.map(suggestion =>
        `<div class="p-2 hover:bg-gray-50 cursor-pointer text-sm" data-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</div>`
    ).join('');

    DOMElements.searchSuggestions.innerHTML = html;
    DOMElements.searchSuggestions.classList.remove('hidden');
}

export function hideSearchSuggestions() {
    setTimeout(() => {
        if (DOMElements.searchSuggestions) {
            DOMElements.searchSuggestions.classList.add('hidden');
        }
    }, 200);
}
