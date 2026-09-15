import { escapeHtml } from './utils.js';

export function findTechnicalNode(iface, event, path) {
  const variant = iface?.technicalVariants?.[event];
  function find(nodes) {
    for (const node of nodes || []) {
      if (node.path === path) return node;
      const child = find(node.children);
      if (child) return child;
    }
  }
  return variant && find([...variant.common, ...variant.custom]);
}

export function schemaFacts(schema, required) {
  if (!schema) return '';
  const facts = [];
  if (required !== undefined) facts.push(['JSON property', required ? 'Required when its parent is present' : 'May be omitted']);
  facts.push(['Type', schema.type || 'Not specified'], ['Null value', schema.nullable === true ? 'Allowed' : 'Not allowed']);
  const labels = { format: 'Format', minLength: 'Minimum length', maxLength: 'Maximum length', minimum: 'Minimum', maximum: 'Maximum', exclusiveMinimum: 'Exclusive minimum', exclusiveMaximum: 'Exclusive maximum', multipleOf: 'Multiple of', pattern: 'Pattern', minItems: 'Minimum entries', maxItems: 'Maximum entries', uniqueItems: 'Unique entries', enum: 'Allowed values', default: 'Default' };
  for (const [key, label] of Object.entries(labels)) if (schema[key] !== undefined) facts.push([label, typeof schema[key] === 'object' ? JSON.stringify(schema[key]) : String(schema[key])]);
  if (schema.items) facts.push(['Array item definition', JSON.stringify(schema.items)]);
  return '<div class="field-note"><span>Published technical constraints</span><dl class="schema-facts">' + facts.map(([label, value]) => '<dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd>').join('') + '</dl></div>';
}

export function technicalReferenceMarkup(item) {
  const definitions = item.technicalDefinition ? [item.technicalDefinition] : (item.technicalContexts || []);
  if (!definitions.length) return '<p>No confirmed technical schema mapping is recorded for this catalogue item.</p>';
  return '<details><summary>Published technical definitions · Elexon 2.2.1</summary><p>Property presence depends on the containing block; inspect a message for its requirement.</p>' + definitions.map(d => '<p><code>' + escapeHtml(d.schemaRef) + (d.key ? ' · ' + escapeHtml(d.key) : '') + '</code></p>' + schemaFacts(d.schema)).join('') + '</details>';
}

export function renderTechnicalInspector(node, items) {
  return `<div class="inspector-heading"><div><p class="page-kicker">PUBLISHED BLOCK DEFINITION</p><h2>${escapeHtml(node.key)}</h2><p>${escapeHtml(node.label)}</p><code>${escapeHtml(node.path)}</code></div><button class="utility-button" data-copy="${escapeHtml(node.key)}">Copy key</button></div>
    <div class="inspector-facts"><span>JSON property <strong>${node.required ? 'Required' : 'May be omitted'}</strong></span><span>Fields <strong>${node.fields.length}</strong></span><span>Additional properties <strong>${node.objectRules.additionalProperties === false ? 'Not allowed' : 'Allowed by schema'}</strong></span></div>
    ${node.arrayRules ? schemaFacts(node.arrayRules, node.required) : ''}
    <p class="inspector-note">Requirements apply when the containing object is present. Catalogue M/O/C describes business usage separately. Source: Elexon ${escapeHtml(node.schemaRef || 'inline schema')}.</p>
    <div class="field-list">${node.fields.map(field => {
      const item = items[field.itemId];
      const s = field.schema;
      return `<details class="field-card" open><summary><code>${escapeHtml(field.itemId || field.key)}</code><strong>${escapeHtml(item?.name || field.key)}</strong>${item ? `<span class="cmo-pill" title="Historical catalogue business requirement">${escapeHtml(item.cmo || '—')}</span>` : ''}</summary><div class="field-body"><div class="field-key"><code>${escapeHtml(field.key)}</code><button class="utility-button" data-copy="${escapeHtml(field.key)}">Copy</button></div>${item?.rule ? `<p><strong>Catalogue description:</strong> ${escapeHtml(item.rule)}</p>` : ''}${s.description ? `<p><strong>Published description:</strong> ${escapeHtml(s.description)}</p>` : ''}${schemaFacts(s, field.required)}${s.example !== undefined ? `<div class="field-note"><span>Published example (as supplied; not a validation guarantee)</span><code>${escapeHtml(JSON.stringify(s.example))}</code></div>` : ''}${field.key === 'eventCode' ? '<p class="inspector-note">Square brackets appear in the published enum. The event selector removes these for readability only.</p>' : ''}${item ? `<a class="field-link" data-field-key="${escapeHtml(field.key)}" aria-haspopup="dialog" href="?view=data&tab=items&q=${encodeURIComponent(field.itemId)}">View data reference</a>` : '<p class="inspector-note">No confirmed local data-item ID mapping; the published field definition is shown in full.</p>'}</div></details>`;
    }).join('')}</div>`;
}
