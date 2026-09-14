import { fetchData } from './api.js';
import { state, loadFavorites } from './state.js';
import {
  DOM, cacheDOMElements, hideLoading, setReferenceMeta,
  renderHome, renderInterfacesPage, updateInterfaceResults,
  renderInterfaceDetails, renderDataReference, updateDataReferenceResults,
  renderRejections, updateRejectionResults, toggleFavorite,
  openCommandPalette, closeCommandPalette, renderCommandResults
} from './ui.js';

let currentView = 'home';
let currentDetailTab = 'overview';
let currentDataTab = 'blocks';
let currentDataQuery = '';
let currentRejectionQuery = '';
let inputTimer = null;

window.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheDOMElements();
  loadFavorites();
  const data = await fetchData('interfaceData.json');
  if (!data) {
    if (DOM.appContent) DOM.appContent.innerHTML = '<div class="page-shell narrow"><div class="section-card section-card-pad"><h1>Unable to load DIPScope</h1><p>The local interfaceData.json file could not be loaded. Serve the project through a local web server rather than opening index.html directly.</p></div></div>';
    hideLoading();
    return;
  }

  state.interfaces = data.interfaces || [];
  state.dataItemsCatalogue = data.dataItemsCatalogue || {};
  state.dataBlocksCatalogue = data.dataBlocksCatalogue || {};
  state.rejectionCodesCatalogue = data.rejectionCodesCatalogue || {};
  state.filteredInterfaces = [...state.interfaces];
  state.catalogueIssues = validateCatalogue(data);
  setReferenceMeta(data._catalogueMeta || {});

  bindGlobalEvents();
  restoreFromURL(false);
  hideLoading();
}

function bindGlobalEvents() {
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
    return;
  }

  const row = e.target.closest('[data-interface-id]');
  if (row) {
    navigate('interfaces', { selected: row.dataset.interfaceId, tab: 'overview' });
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
    replaceURL();
    return;
  }

  const dataTab = e.target.closest('[data-data-tab]');
  if (dataTab) {
    currentDataTab = dataTab.dataset.dataTab;
    currentDataQuery = '';
    renderDataReference(currentDataTab, currentDataQuery);
    setActiveNav('data');
    replaceURL();
    return;
  }

  const command = e.target.closest('[data-command]');
  if (command) {
    let action;
    try { action = JSON.parse(command.dataset.command); } catch { return; }
    closeCommandPalette();
    if (action.type === 'interface') navigate('interfaces', { selected: action.id, tab: 'overview' });
    else if (action.type === 'nav') navigate(action.view);
    else if (action.type === 'data') navigate('data', { dataTab: action.tab, q: action.query });
    else if (action.type === 'rejection') navigate('rejections', { q: action.query });
  }
}

function handleInput(e) {
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
  if (e.target.matches('[data-action="dip-event"]')) {
    const id = e.target.dataset.id;
    state.currentDipVariants[id] = e.target.value;
    currentDetailTab = 'message';
    renderInterfaceDetails(id, currentDetailTab);
    setActiveNav('interfaces');
    replaceURL();
  }
}

function handleSubmit(e) {
  if (e.target.matches('[data-action="home-search"]')) {
    e.preventDefault();
    const input = e.target.querySelector('input');
    state.currentSearchTerm = input?.value?.trim() || '';
    state.currentFilter = 'all';
    navigate('interfaces', { q: state.currentSearchTerm });
  }
}

function handleKeydown(e) {
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
    navigate('interfaces', { selected: e.target.dataset.interfaceId, tab: 'overview' });
  }
}

function navigate(view, opts = {}, push = true) {
  currentView = ['home','interfaces','data','rejections'].includes(view) ? view : 'home';
  if (currentView === 'home') {
    renderHome();
  } else if (currentView === 'interfaces') {
    if (typeof opts.q === 'string') state.currentSearchTerm = opts.q;
    if (opts.filter) state.currentFilter = opts.filter;
    if (opts.selected) {
      currentDetailTab = opts.tab || 'overview';
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
  if (currentView !== 'home') params.set('view', currentView);
  if (currentView === 'interfaces') {
    if (state.currentInterfaceId) {
      params.set('selected', state.currentInterfaceId);
      if (currentDetailTab !== 'overview') params.set('tab', currentDetailTab);
      const variant = state.currentDipVariants[state.currentInterfaceId];
      if (variant && currentDetailTab === 'message') params.set('event', variant);
    } else {
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

function pushURL() { window.history.pushState({}, '', buildURL()); }
function replaceURL() { window.history.replaceState({}, '', buildURL()); }

function restoreFromURL(push = false) {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') || 'home';
  if (view === 'interfaces') {
    const selected = params.get('selected');
    const tab = params.get('tab') || 'overview';
    const event = params.get('event');
    state.currentSearchTerm = params.get('q') || '';
    state.currentFilter = params.get('filter') || 'all';
    if (selected && event) state.currentDipVariants[selected] = event;
    navigate('interfaces', selected ? { selected, tab } : { q: state.currentSearchTerm, filter: state.currentFilter }, push);
  } else if (view === 'data') {
    navigate('data', { dataTab: params.get('tab') || 'blocks', q: params.get('q') || '' }, push);
  } else if (view === 'rejections') {
    navigate('rejections', { q: params.get('q') || '' }, push);
  } else {
    navigate('home', {}, push);
  }
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
