import { reconcileSupplierRouting } from './supplierRouting.js';
import { restorePreferences, initUsability, rememberRoute, rememberSearch } from './usability.js';
import { fetchData } from './api.js';
import { bindReferencePanel } from './referencePanel.js';
import { updateGuidanceLookup } from './validationGuidance.js';
import { state, loadFavorites } from './state.js';
import {
  DOM, cacheDOMElements, hideLoading, setReferenceMeta,
  renderHome, renderInterfacesPage, updateInterfaceResults,
  renderInterfaceDetails, renderDataReference, updateDataReferenceResults,
  renderRejections, updateRejectionResults, toggleFavorite,
  openCommandPalette, closeCommandPalette, renderCommandResults
} from './ui.js';

let currentView = 'home';
let currentDetailTab = 'message';
let currentDataTab = 'blocks';
let currentDataQuery = '';
let currentRejectionQuery = '';
let inputTimer = null;


window.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheDOMElements();
  loadFavorites();
  restorePreferences();
  const data = await fetchData('interfaceData.json');
  if (!data) {
    if (DOM.appContent) DOM.appContent.innerHTML = '<div class="page-shell narrow"><div class="section-card section-card-pad"><h1>Unable to load DIPScope</h1><p>The local interfaceData.json file could not be loaded. Check that the local server is running and interfaceData.json is available, then try again.</p><button type="button" class="utility-button" id="retryLoad">Retry loading</button></div></div>';
    hideLoading();
    if (DOM.sourceChecked) DOM.sourceChecked.textContent = 'Reference unavailable';
    if (DOM.footerReference) DOM.footerReference.textContent = 'Reference unavailable — retry loading';
    document.getElementById('retryLoad')?.addEventListener('click', () => location.reload());
    return;
  }

  state.interfaces = reconcileSupplierRouting(data.interfaces || []);
  state.dataItemsCatalogue = data.dataItemsCatalogue || {};
  state.dataBlocksCatalogue = data.dataBlocksCatalogue || {};
  state.rejectionCodesCatalogue = data.rejectionCodesCatalogue || {};
  state.filteredInterfaces = [...state.interfaces];
  state.catalogueIssues = validateCatalogue(data);
  setReferenceMeta(data._catalogueMeta || {});

  bindGlobalEvents();
  restoreFromURL(false);
  initUsability({ openSearch: openCommandPalette, closeSearch: closeCommandPalette, renderSearch: renderCommandResults });
  hideLoading();
}

function bindGlobalEvents() {
  bindReferencePanel();
  document.addEventListener('click', handleClick);
  document.addEventListener('input', handleInput);
  document.addEventListener('change', handleChange);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('popstate', () => restoreFromURL(false));

  DOM.globalSearchBtn?.addEventListener('click', () => openCommandPalette());
  DOM.commandSearchInput?.addEventListener('input', e => renderCommandResults(e.target.value));
  DOM.commandPalette?.addEventListener('click', e => {
    if (e.target === DOM.commandPalette) closeCommandPalette();
  });
}

function handleClick(e) {
  const jump = e.target.closest("[data-search-query]"); if (jump) { openCommandPalette(jump.dataset.searchQuery); return; }
  if ((e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) && e.target.closest("a[href]")) return;
  const exampleAction = e.target.closest('[data-copy-example], [data-download-example]');
  if (exampleAction) {
    const target = document.getElementById(exampleAction.dataset.copyExample || exampleAction.dataset.downloadExample);
    if (!target) return;
    if (exampleAction.dataset.copyExample) {
      navigator.clipboard.writeText(target.textContent).then(() => showToast('JSON copied')).catch(() => showToast('Clipboard unavailable in this browser'));
    } else {
      const blob = new Blob([target.textContent + '\n'], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (state.currentInterfaceId.split('/')[0] + '-' + state.currentDipVariants[state.currentInterfaceId] + '-' + target.id + '.json').replace(/[^a-zA-Z0-9._-]/g,'_');
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return;
  }
  const copy = e.target.closest('[data-copy], [data-copy-link]');
  if (copy) {
    navigator.clipboard.writeText(copy.hasAttribute('data-copy-link') ? location.href : copy.dataset.copy).then(() => showToast('Copied to clipboard')).catch(() => showToast('Clipboard unavailable in this browser'));
    return;
  }
  const sort = e.target.closest('[data-sort]');
  if (sort) { state.sortDirection = state.sortKey === sort.dataset.sort ? -(state.sortDirection || 1) : 1; state.sortKey = sort.dataset.sort; updateInterfaceResults(); document.querySelector('[data-sort="'+state.sortKey+'"]')?.focus({preventScroll:true}); return; }
  if (e.target.closest('#densityToggle')) {
    const compact = document.body.classList.toggle('compact');
    document.getElementById('densityToggle').setAttribute('aria-pressed',String(compact));
    document.getElementById('densityToggle').textContent = compact ? 'Comfortable view' : 'Compact view';
    return;
  }

  const nav = e.target.closest('[data-nav]');
  if (nav) {
    e.preventDefault();
    navigate(nav.dataset.nav);
    return;
  }

  const favorite = e.target.closest('[data-action="toggle-favorite"]');
  if (favorite) {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(favorite.dataset.id);
    refreshCurrentView();
    [...document.querySelectorAll('[data-action="toggle-favorite"]')].find(el=>el.dataset.id===favorite.dataset.id)?.focus({preventScroll:true});
    return;
  }

  const row = e.target.closest('[data-interface-id]');
  if (row) {
    e.preventDefault();
    navigate('interfaces', { selected: row.dataset.interfaceId, tab: 'message' });
    return;
  }

  const filter = e.target.closest('[data-filter]');
  if (filter) {
    state.currentFilter = filter.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(btn => btn.classList.toggle('is-active', btn === filter));
    updateInterfaceResults();
    replaceURL();
    return;
  }

  const detailTab = e.target.closest('[data-interface-tab]');
  if (detailTab) {
    currentDetailTab = detailTab.dataset.interfaceTab;
    renderInterfaceDetails(detailTab.dataset.id, currentDetailTab);
    setActiveNav('interfaces');
    document.querySelector('[data-interface-tab].is-active')?.focus({preventScroll:true});
    replaceURL();
    return;
  }

  const dataTab = e.target.closest('[data-data-tab]');
  if (dataTab) {
    currentDataTab = dataTab.dataset.dataTab;
    currentDataQuery = '';
    renderDataReference(currentDataTab, currentDataQuery);
    setActiveNav('data');
    document.querySelector('[data-data-tab].is-active')?.focus({preventScroll:true});
    replaceURL();
    return;
  }

  const command = e.target.closest('[data-command]');
  if (command) {
    let action;
    try { action = JSON.parse(command.dataset.command); } catch { return; }
    rememberSearch(DOM.commandSearchInput.value);
    closeCommandPalette();
    if (action.type === 'interface') { if(action.event) state.currentDipVariants[action.id] = action.event; navigate('interfaces', { selected: action.id, tab: 'message' }); }
    else if (action.type === 'nav') navigate(action.view);
    else if (action.type === 'data') navigate('data', { dataTab: action.tab, q: action.query });
    else if (action.type === 'rejection') navigate('rejections', { q: action.query });
  }
}

function handleInput(e) {
  if (e.target.id === 'guidanceRejectionSearch') { updateGuidanceLookup(); return; }
  if (e.target.id === 'catalogueSearch') {
    state.currentSearchTerm = e.target.value;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => { updateInterfaceResults(); replaceURL(); }, 90);
    return;
  }
  if (e.target.id === 'dataReferenceSearch') {
    currentDataQuery = e.target.value;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => { updateDataReferenceResults(currentDataTab, currentDataQuery); replaceURL(); }, 90);
    return;
  }
  if (e.target.id === 'rejectionSearch') {
    currentRejectionQuery = e.target.value;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => { updateRejectionResults(currentRejectionQuery); replaceURL(); }, 90);
  }
}

function handleChange(e) {
  if (e.target.id === 'guidanceRejectionScope') { updateGuidanceLookup(); return; }
  if (e.target.matches('[data-action="dip-event"]')) {
    const id = e.target.dataset.id;
    state.currentDipVariants[id] = e.target.value;
    currentDetailTab = e.target.dataset.detailTab || 'message';
    renderInterfaceDetails(id, currentDetailTab);
    if (currentDetailTab === 'overview') document.getElementById('journeyGuidance').open = true;
    setActiveNav('interfaces');
    document.querySelector('[data-action="dip-event"]')?.focus({preventScroll:true});
    replaceURL();
  }
}

function handleSubmit(e) {
  if (e.target.matches('[data-action="home-search"]')) {
    e.preventDefault();
    const input = e.target.querySelector('input');
    state.currentSearchTerm = input?.value?.trim() || '';
    state.currentFilter = 'all';
    rememberSearch(state.currentSearchTerm);
    openCommandPalette(state.currentSearchTerm);
  }
}

function handleKeydown(e) {
  if (document.querySelector('dialog[open]')) return;
  const isCommand = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
  if (isCommand) {
    e.preventDefault();
    if (DOM.commandPalette?.classList.contains('hidden')) openCommandPalette(); else closeCommandPalette();
    return;
  }
  if (e.key === 'Escape' && !DOM.commandPalette?.classList.contains('hidden')) {
    e.preventDefault();
    closeCommandPalette();
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.catalogue-row')) {
    e.preventDefault();
    navigate('interfaces', { selected: e.target.dataset.interfaceId, tab: 'message' });
  }
}

function navigate(view, opts = {}, push = true) {
  clearTimeout(inputTimer);
  currentView = ['home','interfaces','data','rejections'].includes(view) ? view : 'home';
  if (currentView !== 'interfaces') state.currentInterfaceId = null;
  if (currentView === 'home') {
    renderHome();
  } else if (currentView === 'interfaces') {
    if (typeof opts.q === 'string') state.currentSearchTerm = opts.q;
    if (opts.filter) state.currentFilter = opts.filter;
    if (opts.selected) {
      currentDetailTab = opts.tab === 'items' ? 'message' : opts.tab || 'message';
      renderInterfaceDetails(opts.selected, currentDetailTab);
    } else {
      state.currentInterfaceId = null;
      renderInterfacesPage();
    }
  } else if (currentView === 'data') {
    currentDataTab = opts.dataTab || currentDataTab || 'blocks';
    currentDataQuery = typeof opts.q === 'string' ? opts.q : '';
    renderDataReference(currentDataTab, currentDataQuery);
  } else if (currentView === 'rejections') {
    currentRejectionQuery = typeof opts.q === 'string' ? opts.q : '';
    renderRejections(currentRejectionQuery);
  }
  setActiveNav(currentView);
  DOM.appContent?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (push) pushURL();
}

function refreshCurrentView() {
  if (currentView === 'interfaces' && state.currentInterfaceId) renderInterfaceDetails(state.currentInterfaceId, currentDetailTab);
  else if (currentView === 'interfaces') renderInterfacesPage();
  else if (currentView === 'home') renderHome();
  else if (currentView === 'data') renderDataReference(currentDataTab, currentDataQuery);
  else if (currentView === 'rejections') renderRejections(currentRejectionQuery);
  setActiveNav(currentView);
}

function setActiveNav(view) {
  document.querySelectorAll('.primary-nav-link').forEach(btn => {
    const active = btn.dataset.nav === view || (view === 'interfaces' && btn.dataset.nav === 'interfaces');
    btn.classList.toggle('is-active', active);
    if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
  });
}

function buildURL() {
  const params = new URLSearchParams();
  params.set('view', currentView);
  if (currentView === 'interfaces') {
    if (state.currentInterfaceId) {
      params.set('selected', state.currentInterfaceId);
      params.set('tab', currentDetailTab);
      const variant = state.currentDipVariants[state.currentInterfaceId];
      if (variant) params.set('event', variant);
      const block = document.querySelector('.message-block-row.is-target');
      if (block && currentDetailTab === 'message') params.set('block', block.dataset.blockPath);
    }
    {
      if (state.currentSearchTerm) params.set('q', state.currentSearchTerm);
      if (state.currentFilter !== 'all') params.set('filter', state.currentFilter);
    }
  }
  if (currentView === 'data') {
    if (currentDataTab !== 'blocks') params.set('tab', currentDataTab);
    if (currentDataQuery) params.set('q', currentDataQuery);
  }
  if (currentView === 'rejections' && currentRejectionQuery) params.set('q', currentRejectionQuery);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ''}`;
}

function pushURL() { window.history.pushState({}, '', buildURL()); rememberRoute(); }
function replaceURL() { window.history.replaceState({}, '', buildURL()); rememberRoute(); }

function restoreFromURL(push = false) {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') || 'home';
  document.querySelector('.reference-drawer[open]')?.close();
  if (view === 'interfaces') {
    const selected = params.get('selected');
    const tab = params.get('tab') === 'items' ? 'message' : params.get('tab') || 'message';
    const event = params.get('event');
    state.currentSearchTerm = params.get('q') || '';
    state.currentFilter = params.get('filter') || 'all';
    if (selected && event) state.currentDipVariants[selected] = event;
    navigate('interfaces', selected ? { selected, tab } : { q: state.currentSearchTerm, filter: state.currentFilter }, push);
    const blockKey = params.get('block');
    if (selected && tab === 'message' && blockKey) {
      const block = [...document.querySelectorAll('.message-block-row')].find(el => el.dataset.blockPath === blockKey || el.dataset.blockPath.split('.').at(-1) === blockKey);
      if (block) { block.classList.add('is-target'); requestAnimationFrame(() => block.scrollIntoView({block:'start'})); }
      const field = params.get('field');
      const link = [...document.querySelectorAll('.whole-message .field-link')].find(el => el.dataset.nodeKey === blockKey && new URL(el.href).searchParams.get('q') === field && (!params.get('fieldKey') || el.dataset.fieldKey === params.get('fieldKey')));
      if (link) link.click();
    }
  } else if (view === 'data') {
    navigate('data', { dataTab: params.get('tab') || 'blocks', q: params.get('q') || '' }, push);
  } else if (view === 'rejections') {
    navigate('rejections', { q: params.get('q') || '' }, push);
  } else {
    navigate('home', {}, push);
  }
  if (view === 'data' && params.get('field')) { const link = [...document.querySelectorAll('.field-link')].find(el=>new URL(el.href).searchParams.get('q')===params.get('field')); if(link) { link.closest('details').open=true; link.click(); } }
  rememberRoute();
}

function validateCatalogue(data) {
  const issues = [];
  const interfaces = data.interfaces || [];
  const blocks = data.dataBlocksCatalogue || {};
  const items = data.dataItemsCatalogue || {};
  const rejections = data.rejectionCodesCatalogue || {};
  const masterEvents = new Set(items['DI-999']?.populationNotes || []);
  const seen = new Set();

  interfaces.forEach(iface => {
    if (seen.has(iface.id)) issues.push(`Duplicate interface ID: ${iface.id}`);
    seen.add(iface.id);
    (iface.composition || []).forEach(comp => {
      if (comp.type === 'block' && !blocks[comp.id]) issues.push(`${iface.id} references missing block ${comp.id}`);
      if (comp.type === 'item' && !items[comp.id]) issues.push(`${iface.id} references missing data item ${comp.id}`);
    });
    (iface.rejectionCodeIds || []).forEach(id => { if (!rejections[id]) issues.push(`${iface.id} references undefined rejection code ${id}`); });
    (iface.eventCodes || []).forEach(code => { if (!masterEvents.has(code)) issues.push(`${iface.id} event ${code} is absent from DI-999`); });
  });
  Object.entries(blocks).forEach(([blockId, block]) => {
    (block.items || []).forEach(id => { if (!items[id]) issues.push(`${blockId} references missing data item ${id}`); });
    Object.keys(block.payloadKeys || {}).forEach(id => { if (!(block.items || []).includes(id)) issues.push(`${blockId} defines a payload key for non-member item ${id}`); });
  });
  if (issues.length) {
    console.groupCollapsed(`Catalogue integrity check: ${issues.length} issue(s)`);
    issues.forEach(issue => console.warn(issue));
    console.groupEnd();
  } else console.info('Catalogue integrity check passed with no reference errors.');
  return issues;
}

let toastTimer;
function showToast(message) { const toast = document.getElementById("toast"); toast.textContent = message; toast.classList.add("visible"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400); }
