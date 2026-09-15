import { escapeHtml as h } from './utils.js';
import { state } from './state.js';

export function rejectionMatches(iface, catalogue, query = '', scope = 'interface') {
  const ids = scope === 'all' ? [...new Set([...Object.keys(catalogue), ...(iface.rejectionCodeIds || [])])] : (iface.rejectionCodeIds || []);
  const q = query.trim().toLowerCase();
  return ids.map(id => ({id, definition: catalogue[id]})).filter(({id,definition:d}) => !q || `${id} ${d?.description || ''} ${d?.reason || ''} ${d?.resolution || ''}`.toLowerCase().includes(q));
}

export function rejectionResults(iface, catalogue, query, scope) {
  const matches = rejectionMatches(iface,catalogue,query,scope);
  return `<p role="status">${matches.length} matching code${matches.length === 1 ? '' : 's'} · ${scope === 'all' ? 'Whole catalogue; applicability to this interface is not implied' : 'Linked to this interface in the catalogue'}</p>` + (matches.length ? matches.map(({id,definition:d}) => `<details class="rejection-guide-card"><summary><code>${h(id)}</code> ${h(d?.description || 'Definition not available')}</summary>${d ? `<p><strong>Recorded reason:</strong> ${h(d.reason || 'Not recorded.')}</p><p><strong>Recorded resolution:</strong> ${h(d.resolution || 'Not recorded. Consult the authoritative message definition.')}</p><p class="guidance-source">Historical catalogue explanation; not newly verified Elexon operational advice. Check the actual error, event and process before taking action.</p>` : '<p>This code is referenced by the interface but has no definition in the local catalogue. No resolution can be inferred.</p>'}</details>`).join('') : `<p>${scope === 'interface' && !(iface.rejectionCodeIds || []).length ? 'No rejection-code mapping is recorded for this interface. This does not mean the message cannot be rejected. Use “Whole catalogue” to look up a code you have received.' : 'No matching codes. Try the exact code, a shorter phrase, or the whole catalogue.'}</p>`);
}

export function updateGuidanceLookup() {
  const iface = state.interfaces.find(i => i.id === state.currentInterfaceId);
  const host = document.getElementById('guidanceRejectionResults');
  if (!iface || !host) return;
  host.innerHTML = rejectionResults(iface,state.rejectionCodesCatalogue,document.getElementById('guidanceRejectionSearch').value,document.getElementById('guidanceRejectionScope').value);
}

export function renderValidationGuidance(iface) {
  return `<section class="section-card"><div class="structure-topbar"><div><h2>Validation & rejection guidance</h2><p>Understand a failure, then find the relevant definition.</p></div></div><div class="guidance-pad">
    <div class="guidance-notice"><strong>Receipt is not the same as completion</strong><p>A successful initial API response does not establish that later validation or the business process succeeded. Identify who returned the error and at which stage.</p></div>
    <ol class="validation-stages"><li><strong>L1 · DIP</strong><span>Initial synchronous checks</span></li><li><strong>L2 · DIP</strong><span>Further asynchronous checks</span></li><li><strong>L3 · Recipient</strong><span>Initial synchronous checks</span></li><li><strong>L4 · Recipient</strong><span>Further asynchronous checks</span></li></ol>
    <p class="guidance-source">Stages described by <a href="https://www.elexon.co.uk/data-integration-platform/change-requests/dcr0015/" target="_blank" rel="noopener">Elexon DCR0015</a>. The stage describes who checks and when; it does not uniquely identify the cause.</p>
    <details class="guidance-disclosure"><summary>How to investigate a failed message</summary><ol class="investigation-steps"><li><strong>Identify the message.</strong> Capture the IF/PUB, event, schema version, sender reference, transaction ID and exact error text.</li><li><strong>Identify the response.</strong> Keep HTTP delivery errors, asynchronous status messages and business rejection codes distinct. A REG code is not an HTTP status.</li><li><strong>Inspect the referenced field.</strong> Check its exact JSON key, containing block/list, required presence, nullability, type and allowed values in Message structure.</li><li><strong>Check the process context.</strong> Confirm the MPAN, dates, event and intended parties against the applicable business definition.</li><li><strong>Choose the recovery action.</strong> Use the error-specific guidance and your operational procedure. Do not assume that retry, replay, requeue and a corrected submission are interchangeable.</li></ol></details>
    <details class="guidance-disclosure"><summary>Missing fields, nulls and schema errors</summary><p><code>{}</code> omits a property; <code>{"field": null}</code> includes it with a null value. A required property can allow null, and an optional property can reject null. Requirements inside an optional object apply when that object is present.</p><p>Use the selected event’s schema version. Published examples can contain inconsistencies; DIPScope lists detected differences in Examples.</p><button class="utility-button" data-interface-tab="message" data-id="${h(iface.id)}">Inspect this message</button></details>
    <h3>Look up a rejection code</h3><p>Search the stored catalogue by code, reason or resolution.</p>
    <div class="guidance-lookup"><div><label for="guidanceRejectionSearch">Code or description</label><input id="guidanceRejectionSearch" aria-label="Code or description" type="search" placeholder="Enter a rejection code or error text" autocomplete="off"></div><div><label for="guidanceRejectionScope">Search scope</label><select id="guidanceRejectionScope" aria-label="Search scope"><option value="interface">This interface</option><option value="all">Whole catalogue</option></select></div></div>
    <div id="guidanceRejectionResults">${rejectionResults(iface,state.rejectionCodesCatalogue,'','interface')}</div>
    <details class="guidance-disclosure"><summary>Elexon guidance and recovery procedures</summary><p>Elexon’s L3/L4 guidance explains recipient response handling. Consult the current document for error-specific reporting and recovery instructions.</p><ul><li><a href="https://www.elexon.co.uk/elexondocuments/dip/dip-l3-l4-validation-guidance-note/" target="_blank" rel="noopener">DIP L3/L4 validation guidance</a></li><li><a href="https://www.elexon.co.uk/data-integration-platform/dip-training-guidance/" target="_blank" rel="noopener">Training and guidance, including replay and requeue</a></li><li><a href="https://bscdocs.elexon.co.uk/data-integration-platform/dsd002-annex-2-detailed-dip-operational-requirements" target="_blank" rel="noopener">Current DIP operational requirements</a></li></ul></details>
    <p class="guidance-source">Guidance reviewed 15 September 2026. This view explains checks and stored codes; it does not submit or validate your messages against a live DIP service.</p>
    </div></section>`;
}
