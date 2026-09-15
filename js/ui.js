import { recentSearchMarkup } from './usability.js';
import { state, saveFavorites } from './state.js';
import { escapeHtml, highlightSearchTerms } from './utils.js';
import { getDipStructure, getStructureCoverage } from './dipStructure.js';
import { renderExamples, renderMessageJourney, renderMessageChanges } from './messageGuidance.js';
import { renderValidationGuidance } from './validationGuidance.js';
import { findTechnicalNode, renderTechnicalInspector, technicalReferenceMarkup } from './technicalSchema.js';

export const DOM = {};

export function cacheDOMElements() {
  DOM.appContent = document.getElementById('appContent');
  DOM.loadingIndicator = document.getElementById('loading-indicator');
  DOM.globalSearchBtn = document.getElementById('globalSearchBtn');
  DOM.commandPalette = document.getElementById('commandPalette');
  DOM.commandSearchInput = document.getElementById('commandSearchInput');
  DOM.commandResults = document.getElementById('commandResults');
  DOM.sourceVersion = document.getElementById('sourceVersion');
  DOM.sourceChecked = document.getElementById('sourceChecked');
  DOM.footerReference = document.getElementById('footerReference');
}

export function hideLoading() {
  if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'none';
}

export function setReferenceMeta(meta = {}) {
  const label = meta.currentTechnicalReference || 'DIP technical reference';
  const checkedRaw = meta.dipStructureCheckedDate || meta.auditDate || '';
  const checked = checkedRaw ? new Date(`${checkedRaw}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  if (DOM.sourceVersion) DOM.sourceVersion.textContent = label;
  if (DOM.sourceChecked) DOM.sourceChecked.textContent = checked ? `Checked ${checked}` : 'Reference status';
  if (DOM.footerReference) DOM.footerReference.textContent = checked ? `${label} · checked ${checked}` : label;
}

function icon(name) {
  const icons = {
    interfaces: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="5" rx="1.4"/><rect x="4" y="10.5" width="16" height="4" rx="1.4"/><rect x="4" y="16" width="16" height="4" rx="1.4"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 5.5h14v13H5z"/><path d="M5 10h14M10 5.5v13"/></svg>',
    reject: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3.5 20 7v5.6c0 4.3-3.2 7-8 8-4.8-1-8-3.7-8-8V7l8-3.5Z"/><path d="m9.3 9.3 5.4 5.4m0-5.4-5.4 5.4" stroke-linecap="round"/></svg>'
  };
  return icons[name] || '';
}

function supplierInfo(type) {
  return {
    supplier_send: { label: 'Supplier send', className: 'role-send' },
    supplier_receive: { label: 'Supplier receive', className: 'role-receive' },
    supplier_both: { label: 'Send & receive', className: 'role-both' },
    none: { label: 'Supplier not involved', className: 'role-none' },
    unverified: { label: 'Routing unverified', className: 'role-unverified' }
  }[type] || { label: 'Other', className: 'role-none' };
}

function getRecentInterfaces() {
  try {
    const recent = JSON.parse(localStorage.getItem('dipscope_recent') || '[]');
    return Array.isArray(recent) ? recent.filter(id => state.interfaces.some(i => i.id === id)).slice(0, 6) : [];
  } catch { return []; }
}

export function rememberInterface(id) {
  try {
    const current = getRecentInterfaces().filter(x => x !== id);
    current.unshift(id);
    localStorage.setItem('dipscope_recent', JSON.stringify(current.slice(0, 8)));
  } catch { /* non-critical */ }
}

export function renderHome() {
  const favourites = [...state.favorites].map(id => state.interfaces.find(i => i.id === id)).filter(Boolean).slice(0, 5);
  const recent = getRecentInterfaces().map(id => state.interfaces.find(i => i.id === id)).filter(Boolean);
  const shortcuts = favourites.length ? favourites : recent;

  DOM.appContent.innerHTML = `
    <section class="home-hero">
      <div class="home-hero-inner">
        <div class="home-eyebrow">YOUR TECHNICAL WORKSPACE</div>
        <h1>MHHS technical reference</h1>
        <p class="home-hero-copy">Search messages, inspect payload structures and trace field definitions across the MHHS reference.</p>
        <form class="hero-search" data-action="home-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.2"/><path d="m15.2 15.2 4.4 4.4" stroke-linecap="round"/></svg>
          <input id="homeSearchInput" type="search" autocomplete="off" placeholder="Search IF-021, MDRStop, B013, MPAN…" aria-label="Search DIPScope">
          <button type="submit">Explore</button>
        </form>
        <div class="hero-search-hints"><span>Examples:</span><code>IF-001</code><code>SettlementPeriod</code><code>B900</code><code>CSS Registration ID</code></div>
      </div>
    </section>

    <div class="home-content">
      <section class="stat-ribbon" aria-label="Catalogue totals">
        <div class="stat-item"><strong class="stat-value">${state.interfaces.length}</strong><span class="stat-label">IF / PUB messages</span></div>
        <div class="stat-item"><strong class="stat-value">${Object.keys(state.dataBlocksCatalogue).length}</strong><span class="stat-label">Data blocks</span></div>
        <div class="stat-item"><strong class="stat-value">${Object.keys(state.dataItemsCatalogue).length}</strong><span class="stat-label">Data items</span></div>
        <div class="stat-item"><strong class="stat-value">${Object.keys(state.rejectionCodesCatalogue).length}</strong><span class="stat-label">Rejection codes</span></div>
      </section>

      <div class="home-grid">
        <section class="home-panel">
          <header class="home-panel-header"><div><h2>Explore DIPScope</h2><p>Start from the job you are trying to do.</p></div></header>
          <div class="quick-links">
            <button class="quick-link" type="button" data-nav="interfaces"><span class="quick-link-icon">${icon('interfaces')}</span><strong>Browse interfaces</strong><span>Search and filter the full IF/PUB catalogue, then open a message in its own workspace.</span></button>
            <button class="quick-link" type="button" data-nav="data"><span class="quick-link-icon">${icon('data')}</span><strong>Data reference</strong><span>Look up B-blocks and individual DI definitions independently of a message.</span></button>
            <button class="quick-link" type="button" data-nav="rejections"><span class="quick-link-icon">${icon('reject')}</span><strong>Rejection lookup</strong><span>Search the separate rejection-code catalogue by code, reason or resolution.</span></button>
          </div>
        </section>

        <section class="home-panel">
          <header class="home-panel-header"><div><h2>${favourites.length ? 'Favourites' : 'Recently viewed'}</h2><p>${favourites.length ? 'Your pinned interfaces.' : 'Messages you opened recently.'}</p></div>${shortcuts.length ? '<button type="button" class="text-link" data-nav="interfaces">View catalogue</button>' : ''}</header>
          <div class="favorite-list">
            ${shortcuts.length ? shortcuts.map(i => `<button class="favorite-row" type="button" data-interface-id="${escapeHtml(i.id)}"><code>${escapeHtml(i.id.replace('/PUB-', ' / '))}</code><span>${escapeHtml(i.name)}</span><i>→</i></button>`).join('') : '<div class="favorite-empty">Open an interface and use the star to pin the messages you use most often. Your shortcuts stay in this browser.</div>'}
          </div>
        </section>
      </div>
    </div>`;
}

export function renderInterfacesPage() {
  DOM.appContent.innerHTML = `
    <div class="page-shell wide">
      <div class="page-heading-row">
        <div><p class="page-kicker">Message catalogue</p><h1 class="page-title">Interfaces</h1><p class="page-lead">Find an interface by message, event, participant or data item.</p></div>
      </div>
      <section class="catalogue-toolbar" aria-label="Interface search and filters">
        <div class="search-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.5" cy="10.5" r="6.2"/><path d="m15.2 15.2 4.4 4.4" stroke-linecap="round"/></svg><input id="catalogueSearch" type="search" value="${escapeHtml(state.currentSearchTerm)}" autocomplete="off" placeholder="Search ID, name, event, party or data item…"></div>
        <div class="filter-group" role="group" aria-label="Supplier involvement">
          ${[['all','All'],['supplier_send','Supplier send'],['supplier_receive','Supplier receive'],['none','Other']].map(([key,label]) => `<button type="button" class="filter-chip ${state.currentFilter===key?'is-active':''}" data-filter="${key}">${label}</button>`).join('')}
        </div>
      </section>
      <div class="catalogue-meta"><span id="catalogueCount"></span><span>Tip: press <strong>Ctrl K</strong> to search the whole reference, not just interfaces.</span></div>
      <div id="interfaceResults"></div>
    </div>`;
  updateInterfaceResults();
}

function searchableInterfaceText(item) {
  let text = [item.id, item.name, item.description, item.sender, item.receiver, item.context, ...(item.eventCodes || [])].join(' ');
  (item.composition || []).forEach(comp => {
    const block = comp.type === 'block' ? state.dataBlocksCatalogue[comp.id] : null;
    if (block) {
      text += ` ${comp.id} ${block.shortCode || ''} ${block.title || ''}`;
      (block.items || []).forEach(itemId => {
        const di = state.dataItemsCatalogue[itemId];
        if (di) text += ` ${itemId} ${di.name || ''} ${di.rule || ''}`;
      });
    }
  });
  return text.toLowerCase();
}

export function getFilteredInterfaces() {
  const terms = state.currentSearchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  return state.interfaces.filter(item => {
    const matchesFilter = state.currentFilter === 'all' || item.supplier_type === state.currentFilter ||
      (state.currentFilter === 'supplier_send' && item.supplier_type === 'supplier_both') ||
      (state.currentFilter === 'supplier_receive' && item.supplier_type === 'supplier_both');
    if (!matchesFilter) return false;
    if (!terms.length) return true;
    const text = searchableInterfaceText(item);
    return terms.every(term => text.includes(term));
  });
}

export function updateInterfaceResults() {
  const host = document.getElementById('interfaceResults');
  const count = document.getElementById('catalogueCount');
  if (!host) return;
  const items = getFilteredInterfaces().sort((a,b) => (state.sortDirection || 1) * String(a[state.sortKey || "id"] || "").localeCompare(String(b[state.sortKey || "id"] || ""), undefined, {numeric:true}));
  if (count) count.textContent = `${items.length} of ${state.interfaces.length} interfaces`;
  if (!items.length) {
    host.innerHTML = '<div class="catalogue-table-wrap"><div class="empty-results"><strong>No interfaces match that search.</strong>Try a message ID, event code, party name or clear a filter.</div></div>';
    return;
  }
  host.innerHTML = `<div class="catalogue-table-wrap"><table class="catalogue-table">
    <thead><tr><th style="width:14%" aria-sort="${state.sortKey !== 'name' ? (state.sortDirection === -1 ? 'descending' : 'ascending') : 'none'}"><button class="sort-button" data-sort="id">Interface ↕</button></th><th style="width:29%" aria-sort="${state.sortKey === 'name' ? (state.sortDirection === -1 ? 'descending' : 'ascending') : 'none'}"><button class="sort-button" data-sort="name">Message ↕</button></th><th style="width:18%">From</th><th style="width:20%">To</th><th style="width:14%">Supplier role</th><th style="width:5%"></th></tr></thead>
    <tbody>${items.map(item => {
      const role = supplierInfo(item.supplier_type);
      return `<tr class="catalogue-row" data-interface-id="${escapeHtml(item.id)}" tabindex="0">
        <td><div class="catalogue-id">${highlightSearchTerms(item.id, state.currentSearchTerm)}</div></td>
        <td><div class="catalogue-name">${highlightSearchTerms(item.name, state.currentSearchTerm)}</div><div class="catalogue-events">${escapeHtml((item.eventCodes || []).join(' · '))}</div></td>
        <td><div class="catalogue-party">${escapeHtml(item.sender || '—')}</div></td>
        <td><div class="catalogue-party">${escapeHtml(item.receiver || '—')}</div></td>
        <td><span class="role-tag ${role.className}">${escapeHtml(role.label)}</span></td>
        <td><button type="button" class="favorite-star ${state.favorites.has(item.id)?'is-favorite':''}" data-action="toggle-favorite" data-id="${escapeHtml(item.id)}" aria-label="${state.favorites.has(item.id)?'Remove from':'Add to'} favourites">${state.favorites.has(item.id)?'★':'☆'}</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function uniqueInterfaceItems(iface) {
  const ids = [];
  const seen = new Set();
  if (iface.technicalVariants) {
    const visit = nodes => (nodes || []).forEach(node => {
      (node.fields || []).forEach(field => { if (field.itemId && !seen.has(field.itemId)) { seen.add(field.itemId); ids.push(field.itemId); } });
      visit(node.children);
    });
    Object.values(iface.technicalVariants).forEach(v => { visit(v.common); visit(v.custom); });
    return ids;
  }
  (iface.composition || []).forEach(comp => {
    if (comp.type === 'item' && !seen.has(comp.id)) { seen.add(comp.id); ids.push(comp.id); }
    if (comp.type === 'block') {
      const block = state.dataBlocksCatalogue[comp.id];
      (block?.items || []).forEach(id => { if (!seen.has(id)) { seen.add(id); ids.push(id); } });
    }
  });
  return ids;
}

function verificationBox(iface) {
  const v = iface.verification || {};
  if (!iface.technicalSource && !iface.releaseStatus && !v.status && !v.scope) return '';
  return `${iface.technicalSource ? `<div class="reference-box"><h3>Technical reconciliation</h3><p>Elexon OpenAPI ${escapeHtml(iface.technicalSource.version)} · checked ${escapeHtml(iface.technicalSource.checkedDate)} · ${Object.keys(iface.technicalVariants).length} published event variants.</p><p><a href="${escapeHtml(iface.technicalSource.url)}" target="_blank" rel="noopener">Published specification</a> · <a href="sources/reconciliation-report.json" target="_blank">Reconciliation record</a></p>${iface.catalogueEventCodes?.some(e => !iface.eventCodes.includes(e)) ? `<p>Historical catalogue event names absent from this specification: ${escapeHtml(iface.catalogueEventCodes.filter(e => !iface.eventCodes.includes(e)).join(', '))}. These have not been assumed to be aliases.</p>` : ''}<p>Business descriptions and release notes below retain their earlier verification scope.</p></div>` : ''}<div class="reference-box"><h3>Verification & release status</h3>
    ${iface.releaseStatus ? `<p><strong>Release:</strong> ${escapeHtml(iface.releaseStatus)}</p>` : ''}
    ${v.status ? `<p><strong>Status:</strong> ${escapeHtml(v.status)}</p>` : ''}
    ${v.sourceVersion ? `<p><strong>Technical reference:</strong> ${escapeHtml(v.sourceVersion)}</p>` : ''}
    ${v.checkedDate ? `<p><strong>Checked:</strong> ${escapeHtml(v.checkedDate)}</p>` : ''}
    ${v.scope ? `<p>${escapeHtml(v.scope)}</p>` : ''}
  </div>`;
}

function notesBox(title, values) {
  if (!Array.isArray(values) || !values.length) return '';
  return `<div class="reference-box"><h3>${escapeHtml(title)}</h3><ul>${values.map(v => `<li>${escapeHtml(v)}</li>`).join('')}</ul></div>`;
}

function errorBox(values) {
  if (!Array.isArray(values) || !values.length) return '';
  return `<div class="reference-box"><h3>Error codes</h3>${values.map(code => `<p><strong>${escapeHtml(code.id)}</strong> — ${escapeHtml(code.description || '')}${code.note ? ` ${escapeHtml(code.note)}` : ''}</p>`).join('')}</div>`;
}

export function renderInterfaceDetails(id, activeTab = 'overview') {
  const iface = state.interfaces.find(i => i.id === id);
  if (!iface) return renderInterfacesPage();
  state.currentInterfaceId = id;
  rememberInterface(id);
  const role = supplierInfo(iface.supplier_type);
  const hasSources = !!(iface.technicalSource || iface.verification || iface.releaseStatus || iface.notes?.length || iface.routingRules?.length || iface.errorCodes?.length);
  const tabs = [
    ['overview','Overview'],
    ['message','Message structure'],
    ['examples','Examples']
  ];

  DOM.appContent.innerHTML = `<div class="page-shell wide">
    <nav class="breadcrumb" aria-label="Breadcrumb"><button type="button" data-nav="interfaces">Interfaces</button><span>/</span><span>${escapeHtml(iface.id)}</span></nav>
    <section class="detail-hero">
      <div><p class="detail-id">${escapeHtml(iface.id)}</p><h1 class="detail-title">${escapeHtml(iface.name)}</h1>${activeTab !== 'overview' ? `<p class="detail-context">${escapeHtml(iface.context || iface.description || '')}</p>` : ''}</div>
      <div class="detail-actions"><button class="utility-button" data-copy="${escapeHtml(id)}">Copy ID</button><button class="utility-button" data-copy-link>Copy link</button><button type="button" class="square-action ${state.favorites.has(id)?'is-favorite':''}" data-action="toggle-favorite" data-id="${escapeHtml(id)}" title="${state.favorites.has(id)?'Remove from':'Add to'} favourites" aria-label="${state.favorites.has(id)?'Remove from':'Add to'} favourites">${state.favorites.has(id)?'★':'☆'}</button></div>
    </section>
    <section class="detail-meta-strip" aria-label="Interface summary">
      <div class="detail-meta"><span class="meta-label">From</span><span class="meta-value">${escapeHtml(iface.sender || 'N/A')}</span></div>
      <div class="detail-meta"><span class="meta-label">To</span><span class="meta-value">${escapeHtml(iface.receiver || 'N/A')}</span></div>
      <div class="detail-meta"><span class="meta-label">Supplier role</span><span class="meta-value"><span class="role-tag ${role.className}">${escapeHtml(role.label)}</span></span></div>
      <div class="detail-meta"><span class="meta-label">Events</span><span class="meta-events">${(iface.eventCodes || []).length ? iface.eventCodes.map(e => `<code class="event-code">${escapeHtml(e)}</code>`).join('') : '<span class="meta-value">Not catalogued</span>'}</span></div>
    </section>
    <div class="provenance-line"><span>REFERENCE</span> ${iface.technicalSource ? `Elexon ${escapeHtml(iface.technicalSource.version)} · Technical schema reconciled ${escapeHtml(iface.technicalSource.checkedDate)}` : escapeHtml(iface.verification?.sourceVersion || iface.releaseStatus || 'Local catalogue')}</div><nav class="detail-tabs" aria-label="Interface sections">${tabs.map(([key,label]) => `<button type="button" class="detail-tab ${activeTab===key?'is-active':''}" data-interface-tab="${key}" data-id="${escapeHtml(id)}">${label}</button>`).join('')}</nav>
    <div class="message-tools" aria-label="Message guidance"><button class="utility-button ${activeTab === 'validation' ? 'is-active' : ''}" aria-pressed="${activeTab === 'validation'}" data-interface-tab="validation" data-id="${escapeHtml(id)}">Validation & rejections</button><button class="text-tool" aria-pressed="${activeTab === 'changes'}" data-interface-tab="changes" data-id="${escapeHtml(id)}">Changes</button><button class="text-tool" aria-pressed="${activeTab === 'source'}" data-interface-tab="source" data-id="${escapeHtml(id)}">About this data</button></div>
    ${iface.releaseStatus ? `<p class="message-caveat"><strong>Release note:</strong> ${escapeHtml(iface.releaseStatus)} · <button class="text-tool" data-interface-tab="source" data-id="${escapeHtml(id)}">Details</button></p>` : ''}
    <div id="detailPane" class="detail-pane">${renderDetailPane(iface, activeTab, hasSources)}</div>
  </div>`;
}

function renderDetailPane(iface, tab, hasSources) {
  if (tab === 'validation') return renderValidationGuidance(iface);
  if (tab === 'examples') return renderExamples(iface);
  if (tab === 'journey') return renderMessageJourney(iface);
  if (tab === 'changes') return renderMessageChanges(iface);
  if (tab === 'message') return renderMessageStructure(iface);
  if (tab === 'items') return renderInterfaceItems(iface);
  if (tab === 'source') return renderSourceStatus(iface, hasSources);
  const coverage = getStructureCoverage(iface, state.dataBlocksCatalogue);
  const coverageText = coverage === 'full' ? 'All event variants mapped' : coverage === 'partial' ? 'Partially mapped to current Swagger' : 'Catalogue fallback used for structure';
  return `<div class="overview-grid">
    <section class="section-card section-card-pad"><div class="section-heading"><h2>What this message does</h2><p>Business context from the local interface catalogue.</p></div><div class="prose-copy"><p>${escapeHtml(iface.context || 'No context has been catalogued for this interface.')}</p></div></section>
    <aside class="reference-stack">
      <div class="reference-box"><h3>Explore this message</h3><p>${escapeHtml(coverageText)}</p><p>Inspect blocks and fields in Message structure, or open a complete JSON illustration in Examples.</p></div>
      ${notesBox('Message notes',iface.notes)}${notesBox('Routing notes',iface.routingRules)}
    </aside>
  </div><details class="guidance-disclosure overview-journey" id="journeyGuidance"><summary>How this message travels from IF to PUB</summary>${renderMessageJourney(iface,true)}</details>`;
}

function renderSourceStatus(iface, hasSources) {
  if (!hasSources) return '<section class="section-card section-card-pad"><div class="section-heading"><h2>Source & status</h2></div><p class="prose-copy">No interface-specific verification notes have been recorded for this entry.</p></section>';
  return `<section class="section-card section-card-pad"><div class="section-heading"><h2>About this data</h2><p>Source versions, verification scope and message-specific caveats.</p></div><div class="reference-stack">${verificationBox(iface)}${notesBox('Important notes', iface.notes)}${notesBox('Routing rules', iface.routingRules)}${errorBox(iface.errorCodes)}</div></section>`;
}

function renderInterfaceItems(iface) {
  const ids = uniqueInterfaceItems(iface);
  return `<section class="section-card"><div class="structure-topbar"><div><h2>Data items</h2><p>${ids.length} local definitions mapped to this interface${iface.technicalVariants ? "'s published event variants. Inspect Message structure for field constraints and fields without a confirmed catalogue ID" : ' catalogue composition'}.</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Data item</th><th>Catalogue M/O/C</th><th>Description / rule</th><th>Population notes</th><th>Catalogue example</th></tr></thead><tbody>${ids.map(id => dataItemRow(id, iface)).join('')}</tbody></table></div></section>`;
}

function dataItemRow(id, iface) {
  const di = state.dataItemsCatalogue[id];
  if (!di) return `<tr><td class="item-id">${escapeHtml(id)}</td><td colspan="5">Referenced but not present in the local data-item catalogue.</td></tr>`;
  let notes = di.populationNotes;
  if (id === 'DI-999' && Array.isArray(notes)) notes = notes.filter(code => (iface.eventCodes || []).includes(code)).join('\n');
  if (Array.isArray(notes)) notes = notes.join(', ');
  return `<tr><td class="item-id">${escapeHtml(id)}</td><td><strong>${escapeHtml(di.name || '')}</strong></td><td><span class="cmo-pill">${escapeHtml(di.cmo || '—')}</span></td><td>${escapeHtml(di.rule || '')}</td><td>${escapeHtml(notes || '')}</td><td>${di.example ? `<code class="example-code">${escapeHtml(di.example)}</code>` : ''}</td></tr>`;
}

function requiredBadge(required) {
  if (required === true) return '<span class="mini-badge req">Required</span>';
  if (required === false) return '<span class="mini-badge opt">Optional</span>';
  // Unknown requiredness is a modelling/verification state, not useful business metadata.
  // Keep it out of the primary message view rather than presenting it as "Varies".
  return '';
}

function renderBlockNode(node, iface, depth = 0) {
  if (node.type === 'missing-block') {
    return `<div class="missing-node"><div class="block-summary"><span class="block-code">${escapeHtml(node.key)}</span><span class="block-title">${escapeHtml(node.label || 'Block not catalogued locally')}</span><span class="block-badges"><span class="mini-badge warn">DIP only</span></span></div>${node.note ? `<p class="node-note">${escapeHtml(node.note)}</p>` : ''}</div>`;
  }
  if (node.type === 'wrapper' || node.type === 'wrapper-list') {
    const repeating = node.type === 'wrapper-list';
    return `<div class="wrapper-node"><div class="wrapper-head"><span class="block-code">${escapeHtml(node.key)}</span><div class="wrapper-copy"><div class="wrapper-title-row"><span class="wrapper-title">${escapeHtml(node.label || 'Wrapper block')}</span>${repeating?'<span class="mini-badge list">Repeating</span>':'<span class="mini-badge">Wrapper</span>'}${requiredBadge(node.required)}</div>${node.note?`<p class="wrapper-note">${escapeHtml(node.note)}</p>`:''}</div></div><div class="wrapper-children">${(node.children || []).map(child => renderBlockNode(child, iface, depth + 1)).join('')}</div></div>`;
  }
  const block = node.blockId ? state.dataBlocksCatalogue[node.blockId] : null;
  const title = node.label || block?.title || node.key;
  const rows = block ? (block.items || []).map(id => dataItemRow(id, iface)).join('') : '';
  return `<details class="block-node" ${depth === 0 && (block?.items || []).length <= 4 ? 'open' : ''}><summary class="block-summary"><span class="block-code">${escapeHtml(node.key)}</span><span class="block-title">${escapeHtml(title)}</span><span class="block-badges">${node.type === 'list'?'<span class="mini-badge list">Repeating</span>':''}${requiredBadge(node.required)}</span></summary>${node.note?`<p class="node-note" style="padding:0 12px 9px">${escapeHtml(node.note)}</p>`:''}${block?`<div class="data-table-wrap"><table class="data-table"><thead><tr><th>ID</th><th>Data item</th><th>M/O/C</th><th>Description / rule</th><th>Population notes</th><th>Example</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="node-note" style="padding:0 12px 12px">No local block definition is available for this structural node.</p>'}</details>`;
}

function renderMessageStructure(iface) {
  const selectedEvent = state.currentDipVariants[iface.id] || null;
  const structure = getDipStructure(iface, state.dataBlocksCatalogue, selectedEvent);
  state.currentDipVariants[iface.id] = structure.event;
  const statusClass = structure.status === 'swagger-verified' || structure.status === 'example-crosschecked' ? 'status-verified' : structure.status === 'catalogue-fallback' ? 'status-fallback' : 'status-partial';
  const statusLabel = structure.label || (structure.status === 'catalogue-fallback' ? 'Catalogue fallback' : 'DIP structure');
  const eventControl = (structure.eventCodes || []).length > 1
    ? `<div class="event-select"><label for="dipEventSelect">Event variant</label><select id="dipEventSelect" data-action="dip-event" data-id="${escapeHtml(iface.id)}">${structure.eventCodes.map(e => `<option value="${escapeHtml(e)}" ${e===structure.event?'selected':''}>${escapeHtml(e)}</option>`).join('')}</select></div>`
    : structure.event ? `<span class="event-code">${escapeHtml(structure.event)}</span>` : '';
  return `<section class="section-card">
    <div class="structure-topbar"><div><h2>DIP message structure</h2><p>Technical payload view. The envelope and CustomBlock are shown separately; verified repeating wrappers remain nested rather than flattened into DES138 catalogue order.</p></div><div class="structure-controls"><span class="structure-status ${statusClass}">${escapeHtml(statusLabel)}</span>${eventControl}</div></div>
    ${structure.sourceNote ? `<details class="structure-source"><summary>Schema notes</summary><p>${escapeHtml(structure.sourceNote)}</p></details>` : ''}
    ${!structure.hasExactVariant ? '<div class="structure-warning">This event has not yet been reconciled to an exact current Swagger variant. The CommonBlock separation is preserved, but CustomBlock ordering currently falls back to the local catalogue.</div>' : ''}
    <div class="inspector-layout"><aside class="payload-nav"><div class="payload-nav-title">PAYLOAD EXPLORER</div>${renderPayloadTree(structure.common, "CommonBlock")}${renderPayloadTree(structure.custom, "CustomBlock")}</aside><div id="fieldInspector" class="field-inspector"><div class="inspector-empty"><span class="inspector-symbol">{ }</span><h3>Inspect a payload block</h3><p>Select a block from the explorer to view its fields, requirements and examples.</p></div></div></div>
  </section>`;
}

function renderStructureColumn(title, path, nodes, iface, description) {
  return `<section class="structure-column"><header class="structure-column-header"><div><p class="structure-path">${escapeHtml(path)}</p><h3>${escapeHtml(title)}</h3></div><p>${escapeHtml(description)}</p></header><div class="structure-node-list">${(nodes || []).map(node => renderBlockNode(node, iface)).join('') || '<div class="empty-results">No blocks defined.</div>'}</div></section>`;
}

export function renderDataReference(activeTab = 'blocks', query = '') {
  DOM.appContent.innerHTML = `<div class="page-shell wide"><div class="page-heading-row"><div><p class="page-kicker">Technical index</p><h1 class="page-title">Data reference</h1><p class="page-lead">Look up blocks and data items independently of a particular IF/PUB message.</p></div></div>
    <div class="reference-toolbar"><div class="search-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.5" cy="10.5" r="6.2"/><path d="m15.2 15.2 4.4 4.4" stroke-linecap="round"/></svg><input id="dataReferenceSearch" type="search" value="${escapeHtml(query)}" placeholder="Search ${activeTab === 'blocks' ? 'block ID, short code or title' : 'data item ID, name or rule'}…"></div><div class="reference-tabs"><button type="button" class="reference-tab ${activeTab==='blocks'?'is-active':''}" data-data-tab="blocks">Data blocks</button><button type="button" class="reference-tab ${activeTab==='items'?'is-active':''}" data-data-tab="items">Data items</button></div></div>
    <div class="catalogue-meta"><span id="dataReferenceCount"></span><span>Stored descriptions remain separate from the exact block-scoped payload keys used for technical validation.</span></div><div id="dataReferenceResults"></div></div>`;
  updateDataReferenceResults(activeTab, query);
}

export function updateDataReferenceResults(activeTab = 'blocks', query = '') {
  const host = document.getElementById('dataReferenceResults');
  const count = document.getElementById('dataReferenceCount');
  if (!host) return;
  const q = query.trim().toLowerCase();
  if (activeTab === 'items') {
    const entries = Object.entries(state.dataItemsCatalogue).filter(([id, item]) => !q || `${id} ${item.name || ''} ${item.rule || ''} ${item.cmo || ''}`.toLowerCase().includes(q));
    if (count) count.textContent = `${entries.length} of ${Object.keys(state.dataItemsCatalogue).length} data items`;
    host.innerHTML = entries.length ? `<div class="reference-grid">${entries.map(([id,item]) => `<article class="ref-card"><div class="ref-card-top"><span class="ref-code">${highlightSearchTerms(id, query)}</span><span class="ref-group">${escapeHtml(item.cmo || '—')}</span></div><h3>${highlightSearchTerms(item.name || '', query)}</h3><p>${highlightSearchTerms(item.rule || 'No rule description recorded.', query)}</p>${item.example?`<div class="ref-card-items"><strong>Example:</strong> <code class="example-code">${escapeHtml(item.example)}</code></div>`:''}${technicalReferenceMarkup(item)}</article>`).join('')}</div>` : '<div class="catalogue-table-wrap"><div class="empty-results"><strong>No data items found.</strong>Try a different ID, name or rule.</div></div>';
  } else {
    const entries = Object.entries(state.dataBlocksCatalogue).filter(([id, block]) => !q || `${id} ${block.shortCode || ''} ${block.title || ''} ${block.group || ''} ${(block.items || []).join(' ')}`.toLowerCase().includes(q));
    if (count) count.textContent = `${entries.length} of ${Object.keys(state.dataBlocksCatalogue).length} data blocks`;
    host.innerHTML = entries.length ? `<div class="reference-grid">${entries.map(([id,block]) => `<article class="ref-card"><div class="ref-card-top"><span class="ref-code">${highlightSearchTerms(block.shortCode || id, query)}</span><span class="ref-group">${escapeHtml(block.group || 'Block')}</span></div><h3>${highlightSearchTerms(block.title || id, query)}</h3><p>${escapeHtml(id)}</p><div class="ref-card-items">${(block.items || []).length} data item${(block.items || []).length===1?'':'s'} · ${(block.items || []).slice(0,5).map(x=>`<span class="mono">${escapeHtml(x)}</span>`).join(', ')}${(block.items || []).length>5?'…':''}</div></article>`).join('')}</div>` : '<div class="catalogue-table-wrap"><div class="empty-results"><strong>No data blocks found.</strong>Try a block short code such as B013.</div></div>';
  }
}

export function renderRejections(query = '') {
  DOM.appContent.innerHTML = `<div class="page-shell wide"><div class="page-heading-row"><div><p class="page-kicker">Lookup tool</p><h1 class="page-title">Rejection codes</h1><p class="page-lead">Find rejection reasons and recorded resolutions by code or keyword.</p></div></div><div class="reference-toolbar" style="grid-template-columns:1fr"><div class="search-field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.5" cy="10.5" r="6.2"/><path d="m15.2 15.2 4.4 4.4" stroke-linecap="round"/></svg><input id="rejectionSearch" type="search" value="${escapeHtml(query)}" placeholder="Search code, description, reason or resolution…"></div></div><div class="catalogue-meta"><span id="rejectionCount"></span><span>Known undefined references remain catalogue-integrity warnings until authoritative definitions are available.</span></div><div id="rejectionResults"></div></div>`;
  updateRejectionResults(query);
}

export function updateRejectionResults(query = '') {
  const host = document.getElementById('rejectionResults');
  const count = document.getElementById('rejectionCount');
  if (!host) return;
  const q = query.trim().toLowerCase();
  const entries = Object.entries(state.rejectionCodesCatalogue).filter(([id, code]) => !q || `${id} ${code.description || ''} ${code.reason || ''} ${code.resolution || ''}`.toLowerCase().includes(q));
  if (count) count.textContent = `${entries.length} of ${Object.keys(state.rejectionCodesCatalogue).length} rejection codes`;
  host.innerHTML = entries.length ? `<div class="rejection-list">${entries.map(([id,code]) => `<article class="rejection-card"><div class="rejection-id">${highlightSearchTerms(id, query)}</div><div><h3>${highlightSearchTerms(code.description || 'No description recorded', query)}</h3>${code.reason?`<p><strong>Reason:</strong> ${highlightSearchTerms(code.reason, query)}</p>`:''}${code.resolution?`<p><strong>Resolution:</strong> ${highlightSearchTerms(code.resolution, query)}</p>`:''}${code.repeatForQueue===true?'<p><strong>Repeat for Queue:</strong> Yes</p>':''}</div></article>`).join('')}</div>` : '<div class="catalogue-table-wrap"><div class="empty-results"><strong>No rejection codes found.</strong>Try another code or keyword.</div></div>';
}

export function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
  saveFavorites();
}

export function openCommandPalette(initialQuery = '') {
  document.querySelectorAll('.product-header,.workspace-topbar,#appContent,.product-footer').forEach(el => el.inert = true);
  DOM.commandPalette?.classList.remove('hidden');
  if (DOM.commandSearchInput) {
    DOM.commandSearchInput.value = initialQuery;
    renderCommandResults(initialQuery);
    setTimeout(() => DOM.commandSearchInput.focus(), 0);
  }
}

export function closeCommandPalette() {
  document.querySelectorAll('.product-header,.workspace-topbar,#appContent,.product-footer').forEach(el => el.inert = false);
  DOM.commandPalette?.classList.add('hidden');
  DOM.globalSearchBtn?.focus();
}

export function renderCommandResults(query = '') {
  if (!DOM.commandResults) return;
  const q = query.trim().toLowerCase();
  if (!q) {
    const favs = [...state.favorites].map(id => state.interfaces.find(i => i.id === id)).filter(Boolean).slice(0,5);
    const recent = getRecentInterfaces().map(id => state.interfaces.find(i => i.id === id)).filter(Boolean).slice(0,5);
    const entries = favs.length ? favs : recent;
    DOM.commandResults.innerHTML = recentSearchMarkup() + (entries.length ? `<div class="command-group"><div class="command-group-title">${favs.length?'Favourites':'Recently viewed'}</div>${entries.map(i => commandRow('Interface', i.id, i.name, { type:'interface', id:i.id })).join('')}</div><div class="command-group"><div class="command-group-title">Quick navigation</div>${commandRow('Go to','Interfaces','Browse the message catalogue',{type:'nav',view:'interfaces'})}${commandRow('Go to','Data reference','Browse blocks and data items',{type:'nav',view:'data'})}${commandRow('Go to','Rejection codes','Search rejection definitions',{type:'nav',view:'rejections'})}</div>` : '<div class="command-empty">Start typing to search interfaces, events, blocks, data items and rejection codes.</div>');
    return;
  }
  const interfaceHits = state.interfaces.filter(i => searchableInterfaceText(i).includes(q)).slice(0,6);
  const blockHits = Object.entries(state.dataBlocksCatalogue).filter(([id,b]) => `${id} ${b.shortCode || ''} ${b.title || ''} ${b.group || ''}`.toLowerCase().includes(q)).slice(0,5);
  const itemHits = Object.entries(state.dataItemsCatalogue).filter(([id,d]) => `${id} ${d.name || ''} ${d.rule || ''}`.toLowerCase().includes(q)).slice(0,5);
  const rejectionHits = Object.entries(state.rejectionCodesCatalogue).filter(([id,r]) => `${id} ${r.description || ''} ${r.reason || ''} ${r.resolution || ''}`.toLowerCase().includes(q)).slice(0,5);
  const groups = [];
  if (interfaceHits.length) groups.push(`<div class="command-group"><div class="command-group-title">Interfaces</div>${interfaceHits.map(i => commandRow('Interface', i.id, i.name, {type:'interface',id:i.id})).join('')}</div>`);
  if (blockHits.length) groups.push(`<div class="command-group"><div class="command-group-title">Data blocks</div>${blockHits.map(([id,b]) => commandRow(b.shortCode || 'Block', id, b.title || '', {type:'data',tab:'blocks',query:b.shortCode || id})).join('')}</div>`);
  if (itemHits.length) groups.push(`<div class="command-group"><div class="command-group-title">Data items</div>${itemHits.map(([id,d]) => commandRow('Data item', id, d.name || '', {type:'data',tab:'items',query:id})).join('')}</div>`);
  if (rejectionHits.length) groups.push(`<div class="command-group"><div class="command-group-title">Rejection codes</div>${rejectionHits.map(([id,r]) => commandRow('Rejection', id, r.description || '', {type:'rejection',query:id})).join('')}</div>`);
  DOM.commandResults.innerHTML = groups.length ? groups.join('') : '<div class="command-empty">No results. Try a different interface ID, event code, block, data item or rejection term.</div>';
}

function commandRow(type, code, label, action) {
  return `<button type="button" class="command-result" data-command='${escapeHtml(JSON.stringify(action))}'><span class="command-result-type">${escapeHtml(type)}</span><span class="command-result-main"><strong>${escapeHtml(code)}</strong><span>${escapeHtml(label)}</span></span><span class="command-result-arrow">→</span></button>`;
}

function renderPayloadTree(nodes, parent, metadata = null) {
  return '<details class="payload-group" open><summary>' + escapeHtml(parent) + (metadata ? ' ' + requiredBadge(metadata.required) : '') + '</summary>' + (metadata?.note ? '<p class="tree-note">' + escapeHtml(metadata.note) + '</p>' : '') + (nodes || []).map(node => {
    if (node.children) return renderPayloadTree([...(node.fields?.length ? [{...node, children: undefined}] : []), ...node.children], node.key + (node.type === 'wrapper-list' ? ' [ ]' : '') + (node.schemaRef && node.schemaRef !== node.key ? ' · ' + node.schemaRef : ''), { ...node, note: node.arrayRules ? 'Array entries: ' + (node.arrayRules.minItems ?? 0) + ' minimum; ' + (node.arrayRules.maxItems ?? 'no stated') + ' maximum.' : node.note });
    if (node.fields) return '<button class="payload-node" data-inspect-block="' + escapeHtml(node.blockId) + '" data-node-key="' + escapeHtml(node.path) + '"><code>' + escapeHtml(node.key) + '</code><span>' + escapeHtml(node.schemaRef || node.label) + '</span>' + requiredBadge(node.required) + (node.type === 'list' ? '<small>Repeating</small>' : '') + '</button>';
    return '<button class="payload-node" data-inspect-block="' + escapeHtml(node.blockId || '') + '" data-node-key="' + escapeHtml(node.key) + '" data-node-note="' + escapeHtml(node.note || '') + '" data-node-required="' + (node.required === true ? 'Required' : node.required === false ? 'Optional' : 'Not recorded') + '"><code>' + escapeHtml(node.key) + '</code><span>' + escapeHtml(node.label || state.dataBlocksCatalogue[node.blockId]?.title || 'Definition unavailable') + '</span>' + (node.type === 'list' ? '<small>Repeating</small>' : '') + '</button>';
  }).join('') + '</details>';
}

export function inspectBlock(button) {
  const block = state.dataBlocksCatalogue[button.dataset.inspectBlock];
  const iface = state.interfaces.find(i => i.id === state.currentInterfaceId);
  document.querySelectorAll('.payload-node').forEach(n => { n.classList.toggle('is-selected',n === button); n.setAttribute('aria-pressed',String(n === button)); });
  const technical = findTechnicalNode(iface, state.currentDipVariants[iface?.id], button.dataset.nodeKey);
  if (technical) {
    document.getElementById('fieldInspector').innerHTML = renderTechnicalInspector(technical, state.dataItemsCatalogue);
    return;
  }
  document.getElementById('fieldInspector').innerHTML = '<div class="inspector-heading"><div><p class="page-kicker">BLOCK DEFINITION</p><h2>' + escapeHtml(button.dataset.nodeKey) + '</h2><p>' + escapeHtml(block?.title || 'No local definition available') + '</p></div><button class="utility-button" data-copy="' + escapeHtml(button.dataset.nodeKey) + '">Copy key</button></div><div class="inspector-facts"><span>Schema requirement <strong>' + escapeHtml(button.dataset.nodeRequired) + '</strong></span><span>Fields <strong>' + (block?.items?.length || 0) + '</strong></span></div>' + (button.dataset.nodeNote ? '<p class="inspector-note">' + escapeHtml(button.dataset.nodeNote) + '</p>' : '') + (block ? '<div class="field-list">' + (block.items || []).map(id => {
    const di = state.dataItemsCatalogue[id] || {};
    const key = block.payloadKeys?.[id];
    return '<details class="field-card" open><summary><code>' + escapeHtml(id) + '</code><strong>' + escapeHtml(di.name || id) + '</strong><span class="cmo-pill">' + escapeHtml(di.cmo || '—') + '</span></summary><div class="field-body">' + (key ? '<div class="field-key"><code>' + escapeHtml(key) + '</code><button class="utility-button" data-copy="' + escapeHtml(key) + '">Copy</button></div>' : '') + '<p>' + escapeHtml(di.rule || 'No rule recorded.') + '</p>' + (di.populationNotes ? '<div class="field-note"><span>Population notes</span><p>' + escapeHtml(Array.isArray(di.populationNotes) ? (id === 'DI-999' ? di.populationNotes.filter(code => (iface.eventCodes || []).includes(code)) : di.populationNotes).join(', ') : di.populationNotes) + '</p></div>' : '') + (di.example ? '<div class="field-note"><span>Example</span><code>' + escapeHtml(di.example) + '</code></div>' : '') + '<a class="field-link" aria-haspopup="dialog" href="?view=data&tab=items&q=' + encodeURIComponent(id) + '">View data reference</a></div></details>';
  }).join('') + '</div>' : '<p class="inspector-note">This structural node has no field definition in the local catalogue.</p>');
}
