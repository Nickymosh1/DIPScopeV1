import { renderWholeMessage } from './wholeMessage.js';
import { recentSearchMarkup } from './usability.js';
import { state, saveFavorites } from './state.js';
import { escapeHtml, highlightSearchTerms } from './utils.js';
import { getDipStructure, getStructureCoverage } from './dipStructure.js';
import { renderExamples, renderMessageJourney, renderMessageChanges } from './messageGuidance.js';
import { renderValidationGuidance } from './validationGuidance.js';
import { technicalReferenceMarkup } from './technicalSchema.js';

export const DOM = {};
function rejectionEntries() {
  const entries = new Map(Object.entries(state.rejectionCodesCatalogue));
  state.interfaces.forEach(i => (i.rejectionCodeIds || []).forEach(id => { if (!entries.has(id)) entries.set(id, { description: 'Definition unavailable', reason: 'Referenced by an interface, but no definition is recorded in the local catalogue. No resolution can be inferred.', unresolved: true }); }));
  return [...entries];
}

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
  const checked = checkedRaw ? new Date(checkedRaw + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  if (DOM.sourceVersion) DOM.sourceVersion.textContent = label;
  if (DOM.sourceChecked) DOM.sourceChecked.textContent = checked ? 'Data imported ' + checked : 'Reference status';
  if (DOM.footerReference) DOM.footerReference.textContent = checked ? label + ' · Data imported ' + checked : label;
  void refreshSourceCheck(label);
}

async function refreshSourceCheck(label) {
  // Read-only public workflow status; no token or repository write is needed.
  try {
    const response = await fetch('https://api.github.com/repos/Nickymosh1/DIPScopeV1/actions/workflows/check-elexon.yml/runs?branch=main&status=success&per_page=1', {
      cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) return;
    const body = await response.json();
    const run = body.workflow_runs?.[0];
    if (run?.conclusion !== 'success' || run.head_branch !== 'main') return;
    const date = new Date(run.updated_at);
    if (!Number.isFinite(date.getTime())) return;
    const checked = date.toLocaleString('en-GB', {
      timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
    });
    const text = 'Sources checked ' + checked;
    const detail = 'Last successful Elexon workflow check. Available data updates still require review and merging.';
    if (DOM.sourceChecked) {
      DOM.sourceChecked.textContent = text;
      DOM.sourceChecked.title = detail;
    }
    if (DOM.footerReference) {
      DOM.footerReference.textContent = label + ' · ' + text;
      DOM.footerReference.title = detail;
    }
  } catch {
    // Offline, rate-limited or unavailable: retain the labelled import date.
  }
}

function supplierInfo(type) {
  return {
    supplier_send: { label: 'Supplier send', className: 'role-send' },
    supplier_receive: { label: 'Supplier receive', className: 'role-receive' },
    supplier_both: { label: 'Send & receive', className: 'role-both' },
    none: { label: 'No supplier route listed', className: 'role-none' },
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
  const favourites = [...state.favorites].map(id => state.interfaces.find(i => i.id === id)).filter(Boolean);
  const recent = getRecentInterfaces().map(id => state.interfaces.find(i => i.id === id)).filter(Boolean);
  const rows = (items, empty) => items.length ? items.map(i => `<button class="favorite-row" data-interface-id="${escapeHtml(i.id)}"><code>${escapeHtml(i.id)}</code><span>${escapeHtml(i.name)}</span><span aria-hidden="true">↗</span></button>`).join('') : `<p class="favorite-empty">${empty}</p>`;
  DOM.appContent.innerHTML = `<div class="page-shell workspace-page">
    <div class="page-heading-row"><div><p class="page-kicker">Reference desk</p><h1 class="page-title">Your workspace</h1><p class="page-lead">Find a message. Follow its structure. Understand the field.</p></div><span class="workspace-label">MHHS / DIP</span></div>
    <form class="hero-search" data-action="home-search"><span class="search-glyph" aria-hidden="true">⌕</span><input id="homeSearchInput" type="search" placeholder="Interface, event, block, data item or rejection code" aria-label="Search all DIPScope references"><button type="submit">Search <span aria-hidden="true">↗</span></button></form>
    <div class="hero-search-hints"><span>Jump to</span>${['IF-021','MDRStop','B013','DI-090','REG1078'].map(q => `<button data-search-query="${q}"><code>${q}</code></button>`).join('')}<span class="keyboard-hint"><kbd>Ctrl / ⌘ K</kbd> from anywhere</span></div>
    <div class="desk-layout"><section class="desk-main"><h2 class="section-label">Reference library</h2><div class="library-list">
    ${[['interfaces','01','Interfaces',state.interfaces.length+' IF / PUB messages','Explore events, routing and exact message structures.'],['data','02','Data reference',Object.keys(state.dataBlocksCatalogue).length+' blocks · '+Object.keys(state.dataItemsCatalogue).length+' items','Trace catalogue definitions and published field constraints.'],['rejections','03','Rejection codes',Object.keys(state.rejectionCodesCatalogue).length+' definitions','Find the recorded reason and resolution for a code.']].map(([view,n,title,count,description]) => `<button class="library-row" data-nav="${view}"><span class="library-number">${n}</span><span><strong>${title}</strong><span>${description}</span></span><span class="library-count">${count}</span><span aria-hidden="true">↗</span></button>`).join('')}</div>
    <section class="recent-section"><header class="home-panel-header"><h2>Recently opened</h2><span>Saved in this browser</span></header>${rows(recent,'Your recently opened interfaces will appear here. Start with the reference library above.')}</section></section>
    <aside class="desk-aside"><section><header class="home-panel-header"><h2>Favourites</h2><span aria-hidden="true">☆</span></header>${rows(favourites,'Star an interface to keep it close. Favourites and recent items are kept separately.')}</section><section class="source-guide"><p class="page-kicker">Read with confidence</p><h2>Know your source</h2><p><strong>Published schema</strong> describes JSON structure and technical constraints.</p><p><strong>Catalogue</strong> describes business usage and historical routing.</p><p><strong>Release notes</strong> retain their verification scope. Schema availability does not confirm deployment.</p><a href="sources/reconciliation-report.json" target="_blank" rel="noopener">View reconciliation record ↗</a></section></aside></div></div>`;
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
          ${[['all','All'],['supplier_send','Supplier send'],['supplier_receive','Supplier receive'],['none','No supplier route'],['unverified','Unverified'],['favorites','Favourites']].map(([key,label]) => `<button type="button" class="filter-chip ${state.currentFilter===key?'is-active':''}" data-filter="${key}">${label}</button>`).join('')}
        </div>
      </section>
      <p class="muted">Supplier filters refer to the SUP market role. A supplier acting separately as MDR uses the MDR routes. Receipt can depend on event and addressing rules.</p>
      <div class="catalogue-meta"><span id="catalogueCount"></span><span>Tip: press <strong>Ctrl K</strong> to search the whole reference, not just interfaces.</span></div>
      <div id="interfaceResults"></div>
    </div>`;
  updateInterfaceResults();
}

function searchableInterfaceText(item) {
  if (state.searchCache.has(item.id)) return state.searchCache.get(item.id);
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
  const visit = nodes => (nodes || []).forEach(n => { text += ' ' + [n.key,n.path,n.schemaRef,...(n.fields || []).map(f => f.key + ' ' + (f.itemId || ''))].join(' '); visit(n.children); });
  Object.values(item.technicalVariants || {}).forEach(v => { visit(v.common); visit(v.custom); });
  text = text.toLowerCase(); state.searchCache.set(item.id, text); return text;
}

export function getFilteredInterfaces() {
  const terms = state.currentSearchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  return state.interfaces.filter(item => {
    const matchesFilter = state.currentFilter === 'all' || (state.currentFilter === 'favorites' && state.favorites.has(item.id)) || item.supplier_type === state.currentFilter ||
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
      return `<tr class="catalogue-row" data-interface-id="${escapeHtml(item.id)}">
        <td><a class="catalogue-id" href="?view=interfaces&selected=${encodeURIComponent(item.id)}">${highlightSearchTerms(item.id, state.currentSearchTerm)}</a></td>
        <td><div class="catalogue-name">${highlightSearchTerms(item.name, state.currentSearchTerm)}</div><div class="catalogue-events">${escapeHtml((item.eventCodes || []).join(' · '))}</div></td>
        <td><div class="catalogue-party">${escapeHtml(item.sender || '—')}</div></td>
        <td><div class="catalogue-party">${escapeHtml(item.receiver || '—')}</div></td>
        <td><span class="role-tag ${role.className}">${escapeHtml(role.label)}</span></td>
        <td><button type="button" class="favorite-star ${state.favorites.has(item.id)?'is-favorite':''}" data-action="toggle-favorite" data-id="${escapeHtml(item.id)}" aria-label="${state.favorites.has(item.id)?'Remove from':'Add to'} favourites">${state.favorites.has(item.id)?'★':'☆'}</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
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

export function renderInterfaceDetails(id, activeTab = 'message') {
  const iface = state.interfaces.find(i => i.id === id);
  if (!iface) return renderInterfacesPage();
  state.currentInterfaceId = id;
  rememberInterface(id);
  if (activeTab === 'items') activeTab = 'message';
  const role = supplierInfo(iface.supplier_type);
  const hasSources = !!(iface.technicalSource || iface.verification || iface.releaseStatus || iface.notes?.length || iface.routingRules?.length || iface.errorCodes?.length);
  const tabs = [
    ['message','Data items'], ['overview','Overview'], ['examples','Examples']
  ];

  DOM.appContent.innerHTML = `<div class="page-shell wide">
    <nav class="breadcrumb" aria-label="Breadcrumb"><button type="button" data-nav="interfaces">Interfaces</button><span>/</span><span>${escapeHtml(iface.id)}</span></nav>
    <section class="detail-hero">
      <div><p class="detail-id">${escapeHtml(iface.id)}</p><h1 class="detail-title">${escapeHtml(iface.name)}</h1></div>
      <div class="detail-actions"><button class="utility-button" data-copy="${escapeHtml(id)}">Copy ID</button><button class="utility-button" data-copy-link>Copy link</button><button type="button" class="square-action ${state.favorites.has(id)?'is-favorite':''}" data-action="toggle-favorite" data-id="${escapeHtml(id)}" title="${state.favorites.has(id)?'Remove from':'Add to'} favourites" aria-label="${state.favorites.has(id)?'Remove from':'Add to'} favourites">${state.favorites.has(id)?'★':'☆'}</button></div>
    </section>
    <details class="message-summary" ${activeTab === 'overview' ? 'open' : ''}><summary>Message overview · routing and events</summary><section class="detail-meta-strip" aria-label="Interface summary">
      <div class="detail-meta"><span class="meta-label">From</span><span class="meta-value">${escapeHtml(iface.sender || 'N/A')}</span></div>
      <div class="detail-meta"><span class="meta-label">To</span><span class="meta-value">${escapeHtml(iface.receiver || 'N/A')}</span></div>
      <div class="detail-meta"><span class="meta-label">Supplier role</span><span class="meta-value"><span class="role-tag ${role.className}">${escapeHtml(role.label)}</span></span></div>
      <div class="detail-meta"><span class="meta-label">Events</span><span class="meta-events">${(iface.eventCodes || []).length ? iface.eventCodes.map(e => `<code class="event-code">${escapeHtml(e)}</code>`).join('') : '<span class="meta-value">Not catalogued</span>'}</span></div>
    </section>${iface.supplierRoutingReview ? `<p class="muted">Supplier routing checked ${escapeHtml(iface.supplierRoutingReview.checkedDate)} · <a href="${escapeHtml(iface.supplierRoutingReview.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(iface.supplierRoutingReview.reference)}</a>. ${escapeHtml(iface.supplierRoutingReview.note)}</p>` : '<p class="muted">Supplier direction is based on the listed business routing, not on example payload values. Receipt can depend on the event and addressing rules.</p>'}</details>
    <div class="provenance-line"><span>REFERENCE</span> ${iface.technicalSource ? `Elexon ${escapeHtml(iface.technicalSource.version)} · Technical schema reconciled ${escapeHtml(iface.technicalSource.checkedDate)}` : escapeHtml(iface.verification?.sourceVersion || iface.releaseStatus || 'Local catalogue')}</div><nav class="detail-tabs" aria-label="Interface sections">${tabs.map(([key,label]) => `<button type="button" class="detail-tab ${activeTab===key?'is-active':''}" data-interface-tab="${key}" data-id="${escapeHtml(id)}">${label}</button>`).join('')}<details class="detail-more" ${['validation','changes','source'].includes(activeTab)?'open':''}><summary>Reference notes</summary><div>${[['validation','Validation & rejections'],['changes','Changes'],['source','Sources & status']].map(([key,label])=>`<button class="detail-tab ${activeTab===key?'is-active':''}" data-interface-tab="${key}" data-id="${escapeHtml(id)}">${label}</button>`).join('')}</div></details></nav>
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
  if (tab === 'items') return renderMessageStructure(iface);
  if (tab === 'source') return renderSourceStatus(iface, hasSources);
  const coverage = getStructureCoverage(iface, state.dataBlocksCatalogue);
  const coverageText = coverage === 'full' ? 'All event variants mapped' : coverage === 'partial' ? 'Partially mapped to current Swagger' : 'Catalogue fallback used for structure';
  return `<div class="overview-grid">
    <section class="section-card section-card-pad"><div class="section-heading"><h2>What this message does</h2><p>Business context from the local interface catalogue.</p></div><div class="prose-copy"><p>${escapeHtml(iface.context || 'No context has been catalogued for this interface.')}</p></div></section>
    <aside class="reference-stack">
      <div class="reference-box"><h3>Explore this message</h3><p>${escapeHtml(coverageText)}</p><p>Read every block and field in Data items, or open the supporting JSON illustrations in Examples.</p></div>
      ${notesBox('Message notes',iface.notes)}${notesBox('Routing notes',iface.routingRules)}
    </aside>
  </div><details class="guidance-disclosure overview-journey" id="journeyGuidance"><summary>How this message travels from IF to PUB</summary>${renderMessageJourney(iface,true)}</details>`;
}

function renderSourceStatus(iface, hasSources) {
  if (!hasSources) return '<section class="section-card section-card-pad"><div class="section-heading"><h2>Source & status</h2></div><p class="prose-copy">No interface-specific verification notes have been recorded for this entry.</p></section>';
  return `<section class="section-card section-card-pad"><div class="section-heading"><h2>About this data</h2><p>Source versions, verification scope and message-specific caveats.</p></div><div class="reference-stack">${verificationBox(iface)}${notesBox('Important notes', iface.notes)}${notesBox('Routing rules', iface.routingRules)}${errorBox(iface.errorCodes)}</div></section>`;
}

function renderMessageStructure(iface) {
  const structure = getDipStructure(iface, state.dataBlocksCatalogue, state.currentDipVariants[iface.id]);
  state.currentDipVariants[iface.id] = structure.event;
  return renderWholeMessage(iface, structure, state.dataBlocksCatalogue, state.dataItemsCatalogue);
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
    host.innerHTML = entries.length ? `<div class="reference-grid">${entries.map(([id,item]) => `<details class="ref-card" ${q ? "open" : ""}><summary><code class="ref-code">${highlightSearchTerms(id, query)}</code><strong>${highlightSearchTerms(item.name || '', query)}</strong><span class="ref-group">Catalogue ${escapeHtml(item.cmo || '—')}</span></summary><div class="reference-body"><p>${highlightSearchTerms(item.rule || 'No rule description recorded.', query)}</p>${item.example?`<div class="ref-card-items"><strong>Example:</strong> <code class="example-code">${escapeHtml(item.example)}</code></div>`:''}${technicalReferenceMarkup(item)}<a class="field-link" aria-haspopup="dialog" href="?view=data&tab=items&q=${encodeURIComponent(id)}">Open full data reference ↗</a></div></details>`).join('')}</div>` : '<div class="catalogue-table-wrap"><div class="empty-results"><strong>No data items found.</strong>Try a different ID, name or rule.</div></div>';
  } else {
    const entries = Object.entries(state.dataBlocksCatalogue).filter(([id, block]) => !q || `${id} ${block.shortCode || ''} ${block.title || ''} ${block.group || ''} ${(block.items || []).join(' ')}`.toLowerCase().includes(q));
    if (count) count.textContent = `${entries.length} of ${Object.keys(state.dataBlocksCatalogue).length} data blocks`;
    host.innerHTML = entries.length ? `<div class="reference-grid">${entries.map(([id,block]) => `<details class="ref-card" ${q ? "open" : ""}><summary><code class="ref-code">${highlightSearchTerms(block.shortCode || id, query)}</code><strong>${highlightSearchTerms(block.title || id, query)}</strong><span class="ref-group">${(block.items || []).length} items</span></summary><div class="reference-body"><p><code>${escapeHtml(id)}</code> · ${escapeHtml(block.group || 'Catalogue block')}</p><p>Catalogue membership is shown below. Inspect a message for the exact event-specific structure and property requirements.</p><div class="block-members">${(block.items || []).map(itemId => `<a class="field-link" aria-haspopup="dialog" href="?view=data&tab=items&q=${encodeURIComponent(itemId)}"><code>${escapeHtml(itemId)}</code><span>${escapeHtml(state.dataItemsCatalogue[itemId]?.name || 'Definition unavailable')}</span></a>`).join('')}</div></div></details>`).join('')}</div>` : '<div class="catalogue-table-wrap"><div class="empty-results"><strong>No data blocks found.</strong>Try a block short code such as B013.</div></div>';
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
  const entries = rejectionEntries().filter(([id, code]) => !q || `${id} ${code.description || ''} ${code.reason || ''} ${code.resolution || ''}`.toLowerCase().includes(q));
  if (count) count.textContent = `${entries.length} matching codes · ${Object.keys(state.rejectionCodesCatalogue).length} definitions + ${rejectionEntries().filter(([,v])=>v.unresolved).length} unresolved references`;
  host.innerHTML = entries.length ? `<div class="rejection-list">${entries.map(([id,code]) => `<article class="rejection-card"><div class="rejection-id">${highlightSearchTerms(id, query)}<button class="utility-button" data-copy="${escapeHtml(id)}" aria-label="Copy ${escapeHtml(id)}">Copy code</button></div><div><h3>${highlightSearchTerms(code.description || 'No description recorded', query)}</h3>${code.reason?`<p><strong>Reason:</strong> ${highlightSearchTerms(code.reason, query)}</p>`:''}${code.resolution?`<p><strong>Resolution:</strong> ${highlightSearchTerms(code.resolution, query)}</p>`:''}${code.repeatForQueue===true?'<p><strong>Repeat for Queue:</strong> Yes</p>':''}</div></article>`).join('')}</div>` : '<div class="catalogue-table-wrap"><div class="empty-results"><strong>No rejection codes found.</strong>Try another code or keyword.</div></div>';
}

export function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
  saveFavorites();
}

let searchTrigger;
export function openCommandPalette(initialQuery = '') {
  searchTrigger = document.activeElement;
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
  (searchTrigger?.isConnected ? searchTrigger : DOM.globalSearchBtn)?.focus();
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
  const interfaceHits = state.interfaces.filter(i => searchableInterfaceText(i).includes(q)).sort((a,b) => (b.id.toLowerCase().includes(q) ? 2 : b.eventCodes.some(e=>e.toLowerCase()===q) ? 1 : 0) - (a.id.toLowerCase().includes(q) ? 2 : a.eventCodes.some(e=>e.toLowerCase()===q) ? 1 : 0)).slice(0,6);
  const blockHits = Object.entries(state.dataBlocksCatalogue).filter(([id,b]) => `${id} ${b.shortCode || ''} ${b.title || ''} ${b.group || ''}`.toLowerCase().includes(q)).slice(0,5);
  const itemHits = Object.entries(state.dataItemsCatalogue).filter(([id,d]) => `${id} ${d.name || ''} ${d.rule || ''}`.toLowerCase().includes(q)).slice(0,5);
  const rejectionHits = rejectionEntries().filter(([id,r]) => `${id} ${r.description || ''} ${r.reason || ''} ${r.resolution || ''}`.toLowerCase().includes(q)).slice(0,5);
  const groups = [];
  if (interfaceHits.length) groups.push(`<div class="command-group"><div class="command-group-title">Interfaces</div>${interfaceHits.map(i => commandRow(i.eventCodes.some(e=>e.toLowerCase()===q) ? 'Event' : 'Interface', i.id, i.name + ' · ' + i.eventCodes.join(' / '), {type:'interface',id:i.id,event:i.eventCodes.find(e=>e.toLowerCase()===q)})).join('')}</div>`);
  if (blockHits.length) groups.push(`<div class="command-group"><div class="command-group-title">Data blocks</div>${blockHits.map(([id,b]) => commandRow(b.shortCode || 'Block', id, b.title || '', {type:'data',tab:'blocks',query:b.shortCode || id})).join('')}</div>`);
  if (itemHits.length) groups.push(`<div class="command-group"><div class="command-group-title">Data items</div>${itemHits.map(([id,d]) => commandRow('Data item', id, d.name || '', {type:'data',tab:'items',query:id})).join('')}</div>`);
  if (rejectionHits.length) groups.push(`<div class="command-group"><div class="command-group-title">Rejection codes</div>${rejectionHits.map(([id,r]) => commandRow('Rejection', id, r.description || '', {type:'rejection',query:id})).join('')}</div>`);
  if (/^di[- ]?\d/i.test(q)) groups.sort((a,b)=>Number(b.includes('command-group-title">Data items'))-Number(a.includes('command-group-title">Data items')));
  if (/^b\d/i.test(q)) groups.sort((a,b)=>Number(b.includes('command-group-title">Data blocks'))-Number(a.includes('command-group-title">Data blocks')));
  if (/^(reg|ecs|sp|ds)/i.test(q)) groups.sort((a,b)=>Number(b.includes('command-group-title">Rejection codes'))-Number(a.includes('command-group-title">Rejection codes')));
  DOM.commandResults.innerHTML = groups.length ? groups.join('') : '<div class="command-empty">No results. Try a different interface ID, event code, block, data item or rejection term.</div>';
}

function commandRow(type, code, label, action) {
  return `<button type="button" class="command-result" data-command='${escapeHtml(JSON.stringify(action))}'><span class="command-result-type">${escapeHtml(type)}</span><span class="command-result-main"><strong>${escapeHtml(code)}</strong><span>${escapeHtml(label)}</span></span><span class="command-result-arrow">→</span></button>`;
}
