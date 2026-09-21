import {escapeHtml as h} from './utils.js';
import {schemaFacts} from './technicalSchema.js';

// Walk field occurrences, not unique DI identifiers: the same item can occur
// in different blocks with different property names and requirements.
export function messageRows(structure, blocks, items) {
  const result=[];
  const visit=(nodes,depth)=>{for(const node of nodes||[]){
    result.push({kind:'block',node,depth});
    const fields=node.fields || (blocks[node.blockId]?.items || []).map(id=>({itemId:id,key:blocks[node.blockId]?.payloadKeys?.[id] || items[id]?.payloadKey || id,schema:null}));
    for(const field of fields)result.push({kind:'field',node,field,depth});
    visit(node.children,depth+1);
  }};
  for(const [name,key] of [['CommonBlock','common'],['CustomBlock','custom']]){
    result.push({kind:'container',name,metadata:structure.containers?.[name]});visit(structure[key],0);
  }
  return result;
}
const presence=value=>value===true?'Required':value===false?'Optional':'Not verified';
const text=value=>Array.isArray(value)?value.join('\n'):value == null?'':String(value);
const pathOf=node=>node.path || node.key;
const anchor=path=>'message-'+encodeURIComponent(path);

export function renderWholeMessage(iface,structure,blocks,items) {
  const rows=messageRows(structure,blocks,items);
  const count=rows.filter(r=>r.kind==='field').length;
  const eventControl=`<div class="event-select"><label for="dipEventSelect">Event variant</label><select id="dipEventSelect" data-action="dip-event" data-detail-tab="message" data-id="${h(iface.id)}">${structure.eventCodes.map(event=>`<option value="${h(event)}" ${event===structure.event?'selected':''}>${h(event)}</option>`).join('')}</select></div>`;
  const fieldRow=({node,field})=>{
    const item=items[field.itemId],s=field.schema;
    let notes=item?.populationNotes;
    if(field.itemId==='DI-999' && Array.isArray(notes))notes=notes.filter(code=>(iface.eventCodes||[]).includes(code));
    const publishedExample=s?.example;
    const catalogueExample=item?.example;
    const example=publishedExample!==undefined?publishedExample:catalogueExample;
    const exampleLabel=publishedExample!==undefined?'Published':'Catalogue';
    const path=pathOf(node)+'.'+field.key;
    const otherExample=publishedExample!==undefined && catalogueExample!==undefined && catalogueExample!=='' && String(publishedExample)!==String(catalogueExample) ? `<span class="cell-source catalogue-example-label">Catalogue example</span><code class="message-example">${h(String(catalogueExample))}</code>` : '';
    return `<tr class="message-field-row" id="${h(anchor(path))}" data-message-path="${h(path)}" data-block-path="${h(pathOf(node))}" data-field-key="${h(field.key)}">
      <td>${item?`<a class="field-link" aria-haspopup="dialog" data-node-key="${h(pathOf(node))}" data-field-key="${h(field.key)}" href="?view=data&tab=items&q=${encodeURIComponent(field.itemId)}">${h(field.itemId)}</a>`:'<span class="unmapped-label">No DI mapping</span>'}<code class="payload-key">${h(field.key)}</code></td>
      <td><strong>${h(item?.name || field.key)}</strong></td>
      <td><span class="requirement-line">Schema: <strong>${s?presence(field.required):'Not verified'}</strong></span><span class="requirement-line">Catalogue: <strong>${h(item?.cmo || '—')}</strong></span>${s?`<code class="field-type">${h(s.type || 'Unspecified')}${s.nullable===true?' · nullable':''}</code>`:''}</td>
      <td>${item?.rule?`<p>${h(item.rule)}</p>`:''}${s?.description && s.description!==item?.rule?`<p><span class="cell-source">Published description</span>${h(s.description)}</p>`:''}${!item?.rule&&!s?.description?'<span class="muted">No description recorded.</span>':''}</td>
      <td>${notes?`<p class="population-notes">${h(text(notes))}</p>`:''}${s?`<details class="inline-constraints"><summary>Technical constraints</summary>${schemaFacts(s,field.required)}${field.key==='eventCode'?'<p>Square brackets are retained from the published enum.</p>':''}</details>`:''}${!item?'<p class="unmapped-label">Published field; catalogue mapping unconfirmed.</p>':''}</td>
      <td>${example!==undefined&&example!==''?`<span class="cell-source">${exampleLabel} example</span><code class="message-example">${h(typeof example==='object'?JSON.stringify(example):String(example))}</code>${otherExample}`:'<span class="muted">Not supplied</span>'}</td>
    </tr>`;
  };
  const body=rows.map(row=>{
    if(row.kind==='field')return fieldRow(row);
    if(row.kind==='container')return `<tr class="message-container-row"><th colspan="6" scope="rowgroup"><code>payload → ${h(row.name)}</code> <span>${row.metadata?.rules?.absent?'Not defined in this event':presence(row.metadata?.required)}</span>${row.metadata?.rules&&!row.metadata.rules.absent?`<details class="container-rules"><summary>Container constraints</summary><pre>${h(JSON.stringify(row.metadata.rules,null,2))}</pre></details>`:''}</th></tr>`;
    const n=row.node,b=blocks[n.blockId],repeat=n.arrayRules||n.type==='list'||n.type==='wrapper-list';
    return `<tr class="message-block-row" id="${h(anchor(pathOf(n)))}" data-block-path="${h(pathOf(n))}"><th colspan="6" scope="rowgroup"><div class="message-block-heading"><strong><code>${h(n.key)}</code>${n.schemaRef&&n.schemaRef!==n.key?` <span>· ${h(n.schemaRef)}</span>`:''} — ${h(n.label || b?.title || n.key)}</strong><span>${presence(n.required)}${repeat?' · Repeating list':''}</span></div><code class="message-block-path">payload.${h(pathOf(n))}</code>${n.arrayRules?`<span class="array-limits">Entries: ${h(n.arrayRules.minItems ?? 'no stated minimum')}–${h(n.arrayRules.maxItems ?? 'no stated maximum')}</span>`:''}${n.note?`<p>${h(n.note)}</p>`:''}${n.objectRules?`<details class="block-rules"><summary>Block constraints</summary><pre>${h(JSON.stringify(n.objectRules,null,2))}</pre></details>`:''}</th></tr>`;
  }).join('');
  // Preserve historical membership without adding it to the current payload.
  const legacy=[];
  for(const {kind,node} of rows){if(kind!=='block')continue;const block=blocks[node.blockId];for(const id of block?.legacyItemsRemoved||[]){if(!legacy.some(x=>x.blockId===node.blockId&&x.id===id))legacy.push({blockId:node.blockId,id});}}
  const historical=legacy.length?`<section class="legacy-message-items"><h3>Historical catalogue items · outside the current message</h3><p>These items were removed from the reconciled catalogue block. They are not added to the published payload above.</p>${legacy.map(({blockId,id})=>`<p><code>${h(blocks[blockId].shortCode)}</code> · <a class="field-link" aria-haspopup="dialog" href="?view=data&tab=items&q=${encodeURIComponent(id)}">${h(id)}</a> — ${h(items[id]?.name || 'Definition unavailable')}</p>`).join('')}</section>`:'';
  return `<section class="whole-message"><div class="message-table-toolbar"><div><h2>Data items · complete message</h2><p>${count} field occurrences · all blocks shown, in the selected event’s structure.</p></div>${eventControl}</div><p class="message-reading-note">Read from CommonBlock through CustomBlock. <strong>Schema</strong> requirements apply when the parent is present; <strong>catalogue M/O/C</strong> is separate business information. Repeating lists are shown once with their fields.</p>${!structure.hasExactVariant?'<p class="structure-warning">Catalogue fallback: the exact technical structure for this event is not verified.</p>':''}<details class="message-source-note"><summary>Source and example notes</summary><p>${h(structure.sourceNote || 'Local catalogue; exact technical schema not confirmed.')}</p><p>Examples are source-supplied illustrations, not validation guarantees. Published and catalogue examples are labelled separately. Historical items are not silently included in the current payload.</p></details><div class="whole-message-scroll" role="region" aria-label="Complete message data items table" tabindex="0"><table class="whole-message-table"><caption class="sr-only">${h(iface.id)} — ${h(structure.event)} — complete message fields</caption><colgroup><col style="width:13%"><col style="width:16%"><col style="width:13%"><col style="width:25%"><col style="width:21%"><col style="width:12%"></colgroup><thead><tr><th scope="col">ID / JSON key</th><th scope="col">Data item</th><th scope="col">Requirement</th><th scope="col">Description / rule</th><th scope="col">Population notes / constraints</th><th scope="col">Example</th></tr></thead><tbody>${body}</tbody></table></div>${historical}</section>`;
}
