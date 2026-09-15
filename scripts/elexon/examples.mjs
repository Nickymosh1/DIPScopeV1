import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = pathToFileURL(path.resolve(process.env.ELEXON_STAGE) + path.sep);
const spec = JSON.parse(fs.readFileSync(new URL('sources/elexon-current.json', root)));
const catalogue = JSON.parse(fs.readFileSync(new URL('interfaceData.json', root)));
const schemas = spec.components.schemas;
const resolve = s => s.$ref ? resolve(schemas[s.$ref.split('/').pop()]) : s;
const source = { version: spec.info.version, url: catalogue._catalogueMeta.reconciliation.url, checkedDate: catalogue._catalogueMeta.reconciliation.checkedDate };
function issues(value, raw, path = 'payload') {
  const s = resolve(raw), result = [];
  const add = reason => result.push(path + ': ' + reason);
  if (value === null) { if (!s.nullable) add('null is not allowed'); return result; }
  if (s.type === 'object' || s.properties) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { add('expected object'); return result; }
    for (const key of s.required || []) if (!(key in value)) add('missing property ' + key);
    for (const [key,v] of Object.entries(value)) {
      if (s.properties?.[key]) result.push(...issues(v,s.properties[key],path+'.'+key));
      else if (s.additionalProperties === false) add('unrecognised property ' + key);
    }
  } else if (s.type === 'array') {
    if (!Array.isArray(value)) { add('expected array'); return result; }
    if (value.length < (s.minItems || 0) || value.length > (s.maxItems ?? Infinity)) add('array length outside published limits');
    value.forEach((v,i) => result.push(...issues(v,s.items,path+'['+i+']')));
  } else {
    if ((s.type === 'integer' && !Number.isInteger(value)) || (s.type && s.type !== 'integer' && typeof value !== s.type)) add('expected '+s.type);
    if (typeof value === 'string' && (value.length < (s.minLength || 0) || value.length > (s.maxLength ?? Infinity))) add('string length outside published limits');
    if (typeof value === 'number' && (value < (s.minimum ?? -Infinity) || value > (s.maximum ?? Infinity))) add('number outside published limits');
    if (s.enum && !s.enum.includes(value)) add('value outside published enum');
    if (s.pattern && typeof value === 'string' && !new RegExp(s.pattern).test(value)) add('pattern mismatch');
  }
  return result;
}
function sample(raw) {
  const s = resolve(raw);
  if (s.type === 'object' || s.properties) return Object.fromEntries(Object.entries(s.properties || {}).map(([k,v]) => [k,sample(v)]));
  if (s.type === 'array') return Array.from({length: Math.min(s.maxItems ?? Infinity, Math.max(1, Math.min(s.minItems || 1, 3)))}, () => sample(s.items));
  if (s.enum?.length) return s.enum[0];
  if (s.example !== undefined) {
    let value = s.example;
    if (s.type === 'string' && typeof value === 'number') value = String(value);
    if (!issues(value,s).length) return value;
  }
  if (s.nullable) return null;
  if (s.type === 'boolean') return false;
  if (['number','integer'].includes(s.type)) return s.minimum ?? 0;
  return 'X'.repeat(Math.max(1, Math.min(s.minLength || 1, s.maxLength ?? 100)));
}
const generated = {}, published = {};
for (const iface of catalogue.interfaces) {
  const id = iface.id.split('/')[0];
  generated[id] = {};
  for (const [event, variant] of Object.entries(iface.technicalVariants)) {
    const schema = schemas[variant.schemaRef];
    const payload = sample(schema);
    // A schema can cover multiple events: select the requested event's raw enum.
    payload.CommonBlock.S0.eventCode = resolve(schema.properties.CommonBlock).properties.S0.properties.eventCode.enum.find(e => e.replace(/^\[|\]$/g,'') === event);
    if (payload.CommonBlock.D0) payload.CommonBlock.D0.publicationID = id.replace('IF-','PUB-');
    if (payload.CommonBlock.S1) {
      payload.CommonBlock.S1.environmentTag = 'DEV';
      const role = iface.sender?.match(/\(([A-Z]{3,5})(?:\)|,)/)?.[1] || payload.CommonBlock.S1.senderRoleID;
      payload.CommonBlock.S1.senderRoleID = role;
      payload.CommonBlock.S1.senderUniqueReference = `S-${id}-1009012345-${role}-20260915-EXAMPLE01`;
      payload.CommonBlock.S1.subText = 'DIPScope generated illustration';
    }
    generated[id][event] = { value: {payload}, issues: issues(payload,schema), schemaRef: variant.schemaRef };
  }
}
for (const [name, ref] of Object.entries(spec.paths['/dip-channel/{id}'].post.requestBody.content['application/json'].examples)) {
  const id = name.match(/^IF-\d{3}/)?.[0];
  if (!id || !generated[id]) continue;
  const example = spec.components.examples[ref.$ref.split('/').pop()];
  const payload = (Array.isArray(example.value) ? example.value[0] : example.value).payload;
  const rawEvent = payload.CommonBlock.S0.eventCode.replace(/^\[|\]$/g,'');
  const nameEvent = name.slice(id.length + 1);
  const event = generated[id][nameEvent] ? nameEvent : rawEvent;
  if (!generated[id][event]) throw Error('Cannot map published example '+name);
  (published[id] ||= {})[event] = { name, value: example.value, issues: issues(payload,schemas[generated[id][event].schemaRef]) };
}
fs.writeFileSync(new URL('js/messageExamplesData.js',root), '// Generated by scripts/build-message-examples.mjs; published values are preserved.\nexport const exampleData = '+JSON.stringify({source,generated,published})+';\n');
console.log('Built '+Object.values(generated).reduce((n,v)=>n+Object.keys(v).length,0)+' generated illustrations and '+Object.values(published).reduce((n,v)=>n+Object.keys(v).length,0)+' published examples.');
