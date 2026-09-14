import { state } from './state.js';
import { escapeHtml } from './utils.js';

const STORAGE = 'dipscope_preferences_v1';
const storedPreferences = read(STORAGE, {});
export const preferences = storedPreferences && typeof storedPreferences === 'object' && !Array.isArray(storedPreferences) ? storedPreferences : {};
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
export function savePreferences() { try { localStorage.setItem(STORAGE, JSON.stringify(preferences)); } catch { /* Browsing remains available without storage. */ } }
export function rememberRoute() {
  preferences.lastRoute = location.pathname + location.search;
  preferences.filter = state.currentFilter;
  preferences.query = state.currentSearchTerm;
  preferences.sortKey = state.sortKey;
  preferences.sortDirection = state.sortDirection;
  savePreferences();
}
export function restorePreferences() {
  state.currentFilter = preferences.filter || 'all';
  state.currentSearchTerm = preferences.query || '';
  state.sortKey = preferences.sortKey || 'id';
  state.sortDirection = preferences.sortDirection === -1 ? -1 : 1;
  document.body.classList.toggle('compact', preferences.compact === true);
  const density = document.getElementById('densityToggle');
  density.textContent = preferences.compact ? 'Comfortable view' : 'Compact view';
  density.setAttribute('aria-pressed', String(!!preferences.compact));
  applyTheme();
  if (!location.search && preferences.resume !== false && typeof preferences.lastRoute === 'string') {
    const route = new URL(preferences.lastRoute, location.href);
    if (route.origin === location.origin && route.pathname === location.pathname) history.replaceState({}, '', route.pathname + route.search);
  }
}
function applyTheme() {
  const choice = ['light','dark','system'].includes(preferences.theme) ? preferences.theme : 'system';
  document.documentElement.dataset.theme = choice === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : choice;
}
export function rememberSearch(query) {
  const text = query.trim().slice(0,160);
  if (!text) return;
  const recent = Array.isArray(preferences.recentSearches) ? preferences.recentSearches : [];
  preferences.recentSearches = [text, ...recent.filter(q => q !== text)].slice(0,8);
  savePreferences();
}
export function recentSearchMarkup() {
  const recent = Array.isArray(preferences.recentSearches) ? preferences.recentSearches : [];
  return recent.length ? `<div class="command-group"><div class="recent-heading"><span class="command-group-title">Recent searches</span><button class="text-link" data-clear-history>Clear history</button></div>${recent.map(q => `<button class="command-result" data-recent-search="${escapeHtml(q)}"><span class="command-result-type">Search</span><span class="command-result-main">${escapeHtml(q)}</span><span aria-hidden="true">↗</span></button>`).join('')}</div>` : '';
}

export function initUsability({ openSearch, closeSearch, renderSearch }) {
  const toolbar = document.querySelector('.workspace-topbar');
  const actions = document.createElement('div');
  actions.className = 'workspace-actions';
  actions.append(document.getElementById('densityToggle'));
  actions.insertAdjacentHTML('beforeend', `<label class="theme-control"><span class="sr-only">Colour theme</span><select id="themeChoice" aria-label="Colour theme"><option value="system">System theme</option><option value="light">Light theme</option><option value="dark">Dark theme</option></select></label><button class="utility-button" data-print-page>Print</button><button class="utility-button" id="helpButton" aria-haspopup="dialog">Help</button>`);
  toolbar.append(actions);
  document.getElementById('themeChoice').value = preferences.theme || 'system';
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  const help = document.createElement('dialog');
  help.className = 'help-dialog';
  help.setAttribute('aria-labelledby','helpTitle');
  help.innerHTML = `<header><div><p class="page-kicker">GETTING AROUND</p><h2 id="helpTitle">Help & preferences</h2></div><button class="utility-button" data-close-help aria-label="Close help">Close · Esc</button></header><div class="help-body"><p>Search across the reference, browse a catalogue, or pin an interface using its star.</p><dl class="shortcut-list"><dt><kbd>Ctrl / ⌘ K</kbd></dt><dd>Open global search</dd><dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Move through search results</dd><dt><kbd>Enter</kbd></dt><dd>Open the selected result</dd><dt><kbd>Esc</kbd></dt><dd>Close search or a reference panel</dd><dt><kbd>?</kbd></dt><dd>Open this help panel when not typing</dd><dt><kbd>Tab</kbd></dt><dd>Move between controls</dd></dl><h3>Messages and fields</h3><p>Select a payload block to inspect its fields. Field references open alongside the message. Close the panel to keep your position. Use <strong>Copy field link</strong> to share that exact field and event.</p><p>Use the divider between the explorer and inspector to resize them. Focus the divider and use Left/Right arrows to resize by keyboard; Home resets its width.</p><p><strong>Print</strong> prepares the current page, including collapsed definitions, for printing or saving as PDF through your browser. An open reference panel prints by itself.</p><h3>Preferences</h3><label class="resume-setting"><input type="checkbox" id="resumePreference"> Resume my last page when opening DIPScope</label><p class="help-small">Theme, density, catalogue filters, panel width and recent searches are saved in this browser. Exact links always take priority over your last page.</p><button class="utility-button" data-clear-history>Clear recent searches</button></div>`;
  document.body.append(help);
  help.querySelector('#resumePreference').checked = preferences.resume !== false;
  help.addEventListener('close', () => document.getElementById('helpButton').focus({preventScroll:true}));
  function showHelp() { help.showModal(); help.querySelector('[data-close-help]').focus({preventScroll:true}); }
  document.addEventListener('change', e => {
    if (e.target.id === 'themeChoice') { preferences.theme = e.target.value; applyTheme(); savePreferences(); }
    if (e.target.id === 'resumePreference') { preferences.resume = e.target.checked; savePreferences(); }
  });
  document.addEventListener('click', e => {
    if (e.target.closest('#closeSearch')) closeSearch();
    if (e.target.closest('#densityToggle')) { preferences.compact = document.body.classList.contains('compact'); savePreferences(); }
    if (e.target.closest('[data-sort]')) rememberRoute();
    if (e.target.closest('#helpButton')) showHelp();
    if (e.target.closest('[data-close-help]')) help.close();
    if (e.target.closest('[data-print-page]')) window.print();
    const clear = e.target.closest('[data-clear-input]');
    if (clear) { const input = document.getElementById(clear.dataset.clearInput); input.value = ''; input.dispatchEvent(new Event('input',{bubbles:true})); input.focus(); }
    const recent = e.target.closest('[data-recent-search]');
    if (recent) { const input = document.getElementById('commandSearchInput'); input.value = recent.dataset.recentSearch; renderSearch(input.value); input.focus(); }
    if (e.target.closest('[data-clear-history]')) { preferences.recentSearches = []; savePreferences(); if (!document.getElementById('commandPalette').classList.contains('hidden')) renderSearch(document.getElementById('commandSearchInput').value); }
    const expansion = e.target.closest('[data-expand-scope]');
    if (expansion) document.querySelectorAll(expansion.dataset.expandScope + ' details').forEach(el => el.open = expansion.dataset.expand === 'true');
  });
  document.addEventListener('keydown', e => {
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.target.closest('input,textarea,select,[contenteditable="true"]') && !document.querySelector('dialog[open]') && document.getElementById('commandPalette').classList.contains('hidden')) { e.preventDefault(); showHelp(); }
    const palette = document.getElementById('commandPalette');
    if (palette.classList.contains('hidden') || document.querySelector('dialog[open]')) return;
    const results = [...palette.querySelectorAll('.command-result')];
    if (['ArrowDown','ArrowUp'].includes(e.key)) {
      e.preventDefault(); const current = results.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown' ? (current+1)%results.length : (current <= 0 ? results.length-1 : current-1);
      results[next]?.focus();
    }
    if (e.key === 'Enter' && e.target.id === 'commandSearchInput' && results.length) { e.preventDefault(); results[0].click(); }
    if (e.key === 'Tab') {
      const nodes = [...palette.querySelectorAll('button,input,a[href]')].filter(el=>el.getClientRects().length);
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); }
    }
  });
  const skip = document.createElement('a'); skip.href = '#appContent'; skip.className = 'skip-link'; skip.textContent = 'Skip to content'; document.body.prepend(skip);
  function enhance() {
    document.querySelectorAll('[data-filter],[data-interface-tab],[data-data-tab]').forEach(el => el.setAttribute('aria-pressed', String(el.classList.contains('is-active'))));
    document.querySelectorAll('input[type="search"]').forEach(input => {
      if (!input.getAttribute('aria-label')) input.setAttribute('aria-label',input.placeholder || 'Search');
      if (!input.parentElement.querySelector('[data-clear-input]')) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'clear-search'; button.dataset.clearInput = input.id; button.textContent = '×'; button.setAttribute('aria-label','Clear search'); input.after(button);
      }
    });
    document.querySelectorAll('#catalogueCount,#dataReferenceCount,#rejectionCount').forEach(el => { el.setAttribute('role','status'); el.setAttribute('aria-live','polite'); });
    for (const [selector,label] of [['.payload-nav','Explorer'],['#fieldInspector','Fields']]) {
      const host = document.querySelector(selector);
      if (host && host.querySelector('details') && !host.querySelector('.expansion-tools')) {
        const tools = document.createElement('div'); tools.className = 'expansion-tools'; tools.setAttribute('aria-label',label+' expansion');
        tools.innerHTML = `<button type="button" data-expand-scope="${selector}" data-expand="true">Expand all</button><button type="button" data-expand-scope="${selector}" data-expand="false">Collapse all</button>`;
        host.prepend(tools);
      }
    }
    const layout = document.querySelector('.inspector-layout');
    if (layout && !layout.querySelector('.panel-divider')) {
      layout.style.setProperty('--explorer-width', `${Math.max(180,Math.min(440,Number(preferences.panelWidth)||260))}px`);
      const divider = document.createElement('div'); divider.className = 'panel-divider'; divider.tabIndex = 0; divider.setAttribute('role','separator'); divider.setAttribute('aria-label','Resize payload explorer'); divider.setAttribute('aria-orientation','vertical'); divider.setAttribute('aria-valuemin','180'); divider.setAttribute('aria-valuemax','440'); divider.setAttribute('aria-valuenow',String(Number(preferences.panelWidth)||260));
      layout.querySelector('.payload-nav').after(divider);
      function resize(value) { const width = Math.round(Math.max(180,Math.min(440,layout.clientWidth-300,value))); layout.style.setProperty('--explorer-width',width+'px'); divider.setAttribute('aria-valuenow',String(width)); preferences.panelWidth=width; }
      divider.addEventListener('pointerdown',e=>{e.preventDefault();divider.setPointerCapture(e.pointerId);divider.classList.add('dragging');});
      divider.addEventListener('pointermove',e=>{if(divider.hasPointerCapture(e.pointerId))resize(e.clientX-layout.getBoundingClientRect().left);});
      divider.addEventListener('pointerup',e=>{divider.releasePointerCapture(e.pointerId);divider.classList.remove('dragging');savePreferences();});
      divider.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();resize(e.key==='Home'?260:Number(divider.getAttribute('aria-valuenow'))+(e.key==='ArrowRight'?20:-20));savePreferences();}});
    }
  }
  new MutationObserver(enhance).observe(document.getElementById('appContent'),{childList:true,subtree:true});
  enhance();
  let printDetails = [];
  addEventListener('beforeprint',()=>{printDetails=[...document.querySelectorAll('main details')].map(el=>[el,el.open]);printDetails.forEach(([el])=>el.open=true);document.body.classList.toggle('printing-reference',!!document.querySelector('.reference-drawer[open]'));});
  addEventListener('afterprint',()=>{printDetails.forEach(([el,open])=>el.open=open);document.body.classList.remove('printing-reference');});
}
