import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = pathToFileURL(path.resolve(process.env.ELEXON_STAGE) + path.sep);
const raw = fs.readFileSync(new URL('sources/elexon-current.json', root));
const spec = JSON.parse(raw);
const data = JSON.parse(fs.readFileSync(new URL('input-catalogue.json', root)));
const schemas = spec.components.schemas;
const source = { version: spec.info.version, checkedDate: process.env.ELEXON_CHECK_DATE, url: process.env.ELEXON_SOURCE_URL, sha256: createHash('sha256').update(raw).digest('hex') };
const report = { source, interfaces: [], exampleUpdates: [], unmappedFields: [], sourceCaveats: ['The source eventCode enums contain square brackets; these are retained in field constraints and removed only from event selector labels.', 'Technical schema coverage does not verify business routing, effective dates or the historical catalogue descriptions.'] };
const refName = value => value?.$ref?.split('/').pop();
function resolve(value, seen = []) {
  if (!value?.$ref) return value;
  const name = refName(value);
  if (!schemas[name] || seen.includes(name)) throw Error('Invalid/cyclic reference: ' + name);
  return { ...resolve(schemas[name], [...seen, name]), ...Object.fromEntries(Object.entries(value).filter(([k]) => k !== '$ref')) };
}
const blockFor = name => Object.entries(data.dataBlocksCatalogue).find(([, b]) => b.shortCode === name);
function itemFor(key, value, block) {
  const direct = refName(value)?.match(/^DI-\d{3}(?=-|$)/)?.[0];
  if (direct && data.dataItemsCatalogue[direct]) return direct;
  const candidates = (block?.items || []).filter(id => (block.payloadKeys?.[id] || data.dataItemsCatalogue[id]?.payloadKey) === key);
  return candidates.length === 1 ? candidates[0] : null;
}
function tree(key, value, required, path, ancestors = []) {
  const ref = refName(value);
  let schema = resolve(value);
  const array = schema.type === 'array';
  const arrayRules = array ? Object.fromEntries(Object.entries(schema).filter(([k]) => k !== 'items')) : undefined;
  const objectRef = array ? refName(schema.items) : ref;
  if (array) schema = resolve(schema.items);
  if (ancestors.includes(objectRef) && objectRef) throw Error('Recursive object: ' + path);
  const found = blockFor(objectRef || key);
  const node = { key, path, schemaRef: objectRef || null, blockId: found?.[0] || '', required, nullable: schema.nullable === true, label: schema.description || found?.[1]?.title || objectRef || key, type: array ? 'list' : 'block', fields: [], objectRules: Object.fromEntries(Object.entries(schema).filter(([k]) => !['properties', 'required'].includes(k))) };
  if (arrayRules) node.arrayRules = arrayRules;
  if (!schema.properties || schema.oneOf || schema.allOf || schema.anyOf) throw Error('Unsupported object at ' + path);
  for (const [fieldKey, fieldValue] of Object.entries(schema.properties)) {
    const fieldSchema = resolve(fieldValue);
    const fieldRequired = (schema.required || []).includes(fieldKey);
    if (fieldSchema.properties || (fieldSchema.type === 'array' && resolve(fieldSchema.items)?.properties)) {
      (node.children ||= []).push(tree(fieldKey, fieldValue, fieldRequired, path + '.' + fieldKey, [...ancestors, objectRef].filter(Boolean)));
    } else {
      if (fieldSchema.oneOf || fieldSchema.allOf || fieldSchema.anyOf) throw Error('Unsupported field union at ' + path + '.' + fieldKey);
      const itemId = itemFor(fieldKey, fieldValue, found?.[1]);
      node.fields.push({ key: fieldKey, itemId, schemaRef: refName(fieldValue) || null, required: fieldRequired, schema: fieldSchema });
      if (itemId) {
        const item = data.dataItemsCatalogue[itemId];
        const definition = { schemaRef: refName(fieldValue) || 'inline', key: fieldKey, schema: fieldSchema };
        const definitions = (item.technicalContexts ||= []);
        if (!definitions.some(d => JSON.stringify(d) === JSON.stringify(definition))) definitions.push(definition);
      }
      if (!itemId) report.unmappedFields.push({ path: path + '.' + fieldKey, schemaRef: refName(fieldValue) || null });
    }
  }
  if (node.children) node.type = array ? 'wrapper-list' : 'wrapper';
  return node;
}
for (const iface of data.interfaces) {
  const id = iface.id.split('/')[0];
  const payloadRef = id + '-Payload';
  if (!schemas[payloadRef]) throw Error('Missing interface ' + id);
  const variants = schemas[payloadRef].oneOf || [{ $ref: '#/components/schemas/' + payloadRef }];
  iface.technicalVariants = {};
  for (const variant of variants) {
    const payload = resolve(variant);
    const common = resolve(payload.properties.CommonBlock);
    const s0 = resolve(common.properties.S0);
    const events = resolve(s0.properties.eventCode).enum;
    if (!events?.length) throw Error('Missing events: ' + refName(variant));
    const commonTree = tree('CommonBlock', payload.properties.CommonBlock, (payload.required || []).includes('CommonBlock'), 'CommonBlock');
    const customTree = payload.properties.CustomBlock ? tree('CustomBlock', payload.properties.CustomBlock, (payload.required || []).includes('CustomBlock'), 'CustomBlock') : { fields: [], required: false, objectRules: { absent: true } };
    for (const rawEvent of events) {
      const event = rawEvent.replace(/^\[|\]$/g, '');
      if (iface.technicalVariants[event]) throw Error('Duplicate event ' + id + '/' + event);
      iface.technicalVariants[event] = { schemaRef: refName(variant), common: commonTree.children || [], custom: customTree.children || [], containers: { CommonBlock: { required: commonTree.required, rules: commonTree.objectRules }, CustomBlock: { required: customTree.required, rules: customTree.objectRules } }, status: 'swagger-verified', label: 'Elexon ' + source.version, sourceNote: 'Imported from Elexon OpenAPI ' + source.version + ', checked ' + source.checkedDate + '. JSON property presence and nullability are separate from catalogue M/O/C. Published schema does not establish release activation.' };
      if (commonTree.fields.length || customTree.fields.length) throw Error('Unexpected scalar at payload root');
    }
  }
  const published = Object.keys(iface.technicalVariants);
  report.interfaces.push({ id: iface.id, events: published, addedEvents: published.filter(e => !(iface.eventCodes || []).includes(e)), catalogueOnlyEvents: (iface.eventCodes || []).filter(e => !published.includes(e)) });
  iface.catalogueEventCodes ||= iface.eventCodes || [];
  iface.eventCodes = published;
  iface.technicalSource = source;
}
data.dataItemsCatalogue['DI-999'].populationNotes = [...new Set([...data.dataItemsCatalogue['DI-999'].populationNotes, ...data.interfaces.flatMap(i => i.eventCodes)])];
for (const [id, item] of Object.entries(data.dataItemsCatalogue)) {
  const matches = Object.keys(schemas).filter(k => k === id || k.startsWith(id + '-'));
  if (matches.length === 1) item.technicalDefinition = { schemaRef: matches[0], schema: resolve(schemas[matches[0]]), sourceVersion: source.version };
}
report.unmappedFields = [...new Map(report.unmappedFields.map(f => [f.path + '|' + f.schemaRef, f])).values()];
report.summary = { interfaces: data.interfaces.length, eventVariants: data.interfaces.reduce((n,i) => n + Object.keys(i.technicalVariants).length, 0), directItemDefinitions: Object.values(data.dataItemsCatalogue).filter(i => i.technicalDefinition).length, unmappedTechnicalFieldContexts: report.unmappedFields.length };
Object.assign(data._catalogueMeta, { reconciliation: source, currentTechnicalReference: "Elexon DIP API documentation v" + source.version, dipDisplayModel: 'Generated event-specific trees from the pinned Elexon OpenAPI specification; historical composition retained as catalogue provenance.', dipStructureCheckedDate: source.checkedDate, verificationScope: 'Exact technical structures and published constraints imported; historical business definitions and routing are not recertified.' });
fs.writeFileSync(new URL('interfaceData.json', root), JSON.stringify(data, null, 2) + '\n');
fs.writeFileSync(new URL('sources/reconciliation-report.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary, null, 2));
