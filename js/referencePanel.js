import { rememberRoute } from './usability.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';

export function bindReferencePanel() {
  const dialog = document.createElement('dialog');
  dialog.className = 'reference-drawer';
  dialog.setAttribute('aria-labelledby', 'referencePanelTitle');
  document.body.append(dialog);
  let trigger = null;
  let originalOverflow = '';
  dialog.addEventListener('close', () => {
    document.body.style.overflow = originalOverflow;
    trigger?.focus({ preventScroll: true });
    const closedURL = new URL(location.href); closedURL.searchParams.delete('field'); history.replaceState({},'',closedURL.pathname+closedURL.search); rememberRoute();
  });
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-close-reference]')) dialog.close();
    if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    }
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('.field-link');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const url = new URL(link.href, location.href);
    const id = url.searchParams.get('q');
    const item = state.dataItemsCatalogue[id];
    if (!item) return;
    event.preventDefault();
    trigger = link;
    const iface = state.interfaces.find(entry => entry.id === state.currentInterfaceId);
    const variant = state.currentDipVariants[state.currentInterfaceId];
    const blockButton = document.querySelector('.payload-node.is-selected');
    const block = state.dataBlocksCatalogue[blockButton?.dataset.inspectBlock];
    const key = block?.payloadKeys?.[id];
    const context = [iface?.id, variant, blockButton?.dataset.nodeKey].filter(Boolean).join(' · ');
    const notes = Array.isArray(item.populationNotes) ? item.populationNotes.join('\n') : item.populationNotes;
    const section = (label, value, code = false) => value === undefined || value === null || value === '' ? '' : `<section class="drawer-section"><h3>${escapeHtml(label)}</h3>${code ? `<pre>${escapeHtml(String(value))}</pre>` : `<p>${escapeHtml(String(value))}</p>`}</section>`;
    const extra = Object.entries(item).filter(([name]) => !['name','cmo','rule','populationNotes','example','payloadKey'].includes(name)).map(([name,value]) => section(name.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), typeof value === 'object' ? JSON.stringify(value,null,2) : value)).join('');
    dialog.innerHTML = `<header class="drawer-header"><div><p class="page-kicker">DATA REFERENCE</p><h2 id="referencePanelTitle">${escapeHtml(id)}</h2></div><button class="utility-button" data-close-reference aria-label="Close data reference">Close · Esc</button></header><div class="drawer-context"><span>OPENED FROM</span><p>${escapeHtml(context)}</p></div><div class="drawer-content"><h3 class="drawer-item-name">${escapeHtml(item.name || id)}</h3><div class="drawer-requirement">Catalogue requirement <strong>${escapeHtml(({M:'Mandatory',O:'Optional',C:'Conditional'})[item.cmo] || item.cmo || 'Not recorded')}</strong></div>${section('Payload key in this block', key, true)}${section('Description / rule', item.rule)}${section('Population notes', notes)}${section('Example', item.example, true)}${extra}</div><footer class="drawer-footer"><button class="utility-button" data-close-reference>Back to ${escapeHtml(iface?.id || 'message')}</button><a href="${escapeHtml(url.pathname + url.search)}" target="_blank" rel="noopener">Full reference in new tab ↗</a></footer>`;
    const fieldURL = new URL(location.href); fieldURL.searchParams.set('field',id); history.replaceState({},'',fieldURL.pathname+fieldURL.search); rememberRoute();
    dialog.querySelector('.drawer-footer').insertAdjacentHTML('afterbegin','<button class="utility-button" data-copy-link>Copy field link</button><button class="utility-button" data-print-page>Print field</button>');
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector('[data-close-reference]').focus({ preventScroll: true });
  });
}
