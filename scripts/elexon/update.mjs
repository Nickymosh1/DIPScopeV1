import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const portal='https://dip-api-documentation.elexon.co.uk';
const here=path.dirname(fileURLToPath(import.meta.url));
const defaultRoot=path.resolve(here,'../..');
export const hash=raw=>createHash('sha256').update(raw).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
export function stable(value) {
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function versionCompare(a,b) {
  for(let i=0;i<3;i++){const delta=Number(a.split('.')[i])-Number(b.split('.')[i]);if(delta)return delta;}return 0;
}
export function discoverVersions(text) {
  return [...new Set([...text.matchAll(/api-spec-(\d+\.\d+\.\d+)-resolved\.(?:json|yaml)/g)].map(m=>m[1]))].sort(versionCompare);
}
async function download(url) {
  const u=new URL(url);
  if(u.protocol!=='https:' || !['dip-api-documentation.elexon.co.uk','api.github.com'].includes(u.hostname))throw Error('Unapproved source host');
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{'User-Agent':'DIPScope-source-check'}});
  if(!response.ok)throw Error(`Source request failed (${response.status}): ${url}`);
  if(Number(response.headers.get('content-length'))>20000000)throw Error('Source exceeds size limit');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>20000000)throw Error('Source exceeds size limit');chunks.push(chunk);}
  return Buffer.concat(chunks).toString('utf8');
}
export async function fetchSources() {
  const html=await download(portal+'/');
  const assets=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(m=>new URL(m[1],portal)).filter(u=>u.origin===portal&&u.pathname.startsWith('/assets/')&&u.pathname.endsWith('.js'));
  if(!assets.length || assets.length>8)throw Error('Portal layout changed; specification discovery needs review');
  let versions=discoverVersions(html);
  for(const asset of assets)versions.push(...discoverVersions(await download(asset.href)));
  versions=[...new Set(versions)].sort(versionCompare);
  if(!versions.length)throw Error('No stable published specification could be discovered');
  const version=versions.at(-1),url=portal+`/api-specs/api-spec-${version}-resolved.json`;
  const raw=await download(url),spec=JSON.parse(raw);
  if(spec.info?.version!==version)throw Error('Discovered version and downloaded version disagree');
  const tree=JSON.parse(await download('https://api.github.com/repos/elexon-data/dip-api-documentation/git/trees/main?recursive=1'));
  if(tree.truncated || !tree.tree)throw Error('Incomplete upstream GitHub tree');
  const files=Object.fromEntries(tree.tree.filter(e=>e.type==='blob' && /^[^/]+-unresolved\.yaml$/.test(e.path)).map(e=>[e.path,e.sha]).sort());
  if(Object.keys(files).length<5)throw Error('Upstream GitHub source layout changed');
  return {raw,url,watch:{repository:'elexon-data/dip-api-documentation',files}};
}
export function preflight(spec,data) {
  assert.match(spec.info?.version || '',/^\d+\.\d+\.\d+$/);
  assert.ok(spec.openapi?.startsWith('3.0.'),'Only reviewed OpenAPI 3.0 format is supported');
  assert.ok(spec.components?.schemas && spec.paths,'Incomplete OpenAPI document');
  const local=data.interfaces.map(i=>i.id.split('/')[0]).sort();
  const remote=Object.keys(spec.components.schemas).filter(k=>/^IF-\d{3}-Payload$/.test(k)).map(k=>k.slice(0,6)).sort();
  assert.deepEqual(remote,local,'Interface list changed: add/remove interfaces through a human review before importing');
  const checkComposition=(v,location='')=>{if(!v||typeof v!=='object')return;assert.ok(!v.allOf && !v.anyOf,'Schema composition requires importer review');if(v.oneOf)assert.match(location,/\/(IF-\d{3}-Payload|DIPMessage(?:Egress)?\/properties\/payload)$/,'Nested schema alternatives require importer review');for(const [key,child]of Object.entries(v))checkComposition(child,location+'/'+key);};
  checkComposition(spec);
  const visit=(v)=>{if(!v||typeof v!=='object')return;if(v.$ref){assert.ok(v.$ref.startsWith('#/components/'),'External references require review');const parts=v.$ref.slice(2).split('/');let target=spec;for(const p of parts)target=target?.[p];assert.ok(target,'Unresolved reference '+v.$ref);}for(const child of Object.values(v))visit(child);};
  visit(spec);
}
export function compareSchemas(before,after) {
  const result={added:[],removed:[],changed:[]};
  const a=before.components.schemas,b=after.components.schemas;
  for(const key of Object.keys(b).sort())if(!a[key])result.added.push(key);else if(stable(a[key])!==stable(b[key]))result.changed.push(key);
  for(const key of Object.keys(a).sort())if(!b[key])result.removed.push(key);
  return result;
}
function verify(spec,before,after) {
  assert.deepEqual(after.dataBlocksCatalogue,before.dataBlocksCatalogue);
  assert.deepEqual(after.rejectionCodesCatalogue,before.rejectionCodesCatalogue);
  const schemas=spec.components.schemas;
  const resolve=s=>s.$ref ? {...resolve(schemas[s.$ref.split('/').pop()]),...Object.fromEntries(Object.entries(s).filter(([k])=>k!=='$ref'))} : s;
  function checkNodes(nodes,properties,required=[]) {
    assert.deepEqual(nodes.map(n=>n.key).sort(),Object.keys(properties||{}).sort());
    for(const node of nodes){
      let s=resolve(properties[node.key]);assert.equal(node.required,required.includes(node.key));
      if(s.type==='array'){assert.deepEqual(node.arrayRules,Object.fromEntries(Object.entries(s).filter(([k])=>k!=='items')));s=resolve(s.items);}
      assert.deepEqual(node.objectRules,Object.fromEntries(Object.entries(s).filter(([k])=>!['properties','required'].includes(k))));
      const childKeys=new Set((node.children||[]).map(n=>n.key));
      assert.deepEqual([...node.fields.map(f=>f.key),...childKeys].sort(),Object.keys(s.properties).sort());
      for(const f of node.fields){assert.deepEqual(f.schema,resolve(s.properties[f.key]));assert.equal(f.required,(s.required||[]).includes(f.key));if(f.itemId)assert.ok(after.dataItemsCatalogue[f.itemId]);}
      checkNodes(node.children||[],Object.fromEntries(Object.entries(s.properties).filter(([k])=>childKeys.has(k))),s.required);
    }
  }
  for(const iface of after.interfaces){
    const old=before.interfaces.find(i=>i.id===iface.id);
    for(const [k,v]of Object.entries(old))if(!['technicalVariants','technicalSource','eventCodes','catalogueEventCodes'].includes(k))assert.deepEqual(iface[k],v,'Business field changed '+k);
    const payload=schemas[iface.id.split('/')[0]+'-Payload'];
    const variants=(payload.oneOf||[payload]).map(resolve);
    const events=variants.flatMap(v=>resolve(resolve(v.properties.CommonBlock).properties.S0).properties.eventCode.enum.map(e=>e.replace(/^\[|\]$/g,'')));
    assert.deepEqual(Object.keys(iface.technicalVariants).sort(),events.sort());
    for(const v of Object.values(iface.technicalVariants))for(const [container,key]of [['CommonBlock','common'],['CustomBlock','custom']]){
      const payloadSchema=schemas[v.schemaRef];const s=payloadSchema.properties[container]&&resolve(payloadSchema.properties[container]);
      assert.equal(v.containers[container].required,(payloadSchema.required||[]).includes(container));
      checkNodes(v[key],s?.properties,s?.required);
    }
  }
  for(const [id,item]of Object.entries(before.dataItemsCatalogue))for(const[k,v]of Object.entries(item))if(!['technicalDefinition','technicalContexts'].includes(k) && !(id==='DI-999'&&k==='populationNotes'))assert.deepEqual(after.dataItemsCatalogue[id][k],v,'Catalogue field changed '+id+'.'+k);
}
export async function buildCandidate(root,raw,url,date) {
  const spec=JSON.parse(raw),before=read(path.join(root,'interfaceData.json'));
  preflight(spec,before);
  const stage=fs.mkdtempSync(path.join(os.tmpdir(),'dipscope-elexon-'));
  fs.mkdirSync(path.join(stage,'js'));fs.mkdirSync(path.join(stage,'sources'));
  fs.writeFileSync(path.join(stage,'sources/elexon-current.json'),raw);
  const input=structuredClone(before);
  for(const iface of input.interfaces){delete iface.technicalVariants;delete iface.technicalSource;}
  for(const item of Object.values(input.dataItemsCatalogue)){delete item.technicalDefinition;delete item.technicalContexts;}
  write(path.join(stage,'input-catalogue.json'),input);
  const env={ELEXON_STAGE:stage,ELEXON_CHECK_DATE:date,ELEXON_SOURCE_URL:url};
  const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
  try {
    Object.assign(process.env,env);
    for(const script of ['import.mjs','examples.mjs'])await import(pathToFileURL(path.join(here,script)).href+'?run='+encodeURIComponent(stage));
  } finally {for(const [key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;}
  const after=read(path.join(stage,'interfaceData.json'));
  verify(spec,before,after);
  return {stage,after,before};
}
export async function runUpdate({root=defaultRoot,fixture}={}) {
  const stamp=new Date().toISOString(),date=stamp.slice(0,10);
  const before=read(path.join(root,'sources/elexon-current.json'));
  const oldData=read(path.join(root,'interfaceData.json'));
  const baselineRaw=fs.readFileSync(path.join(root,'sources/elexon-current.json'));
  assert.equal(hash(baselineRaw),oldData._catalogueMeta.reconciliation.sha256,'Pinned source and current website data disagree');
  const sources=fixture || await fetchSources();
  const next=JSON.parse(sources.raw);
  if(versionCompare(next.info?.version || '0.0.0',before.info.version)<0)throw Error('Refusing a specification downgrade');
  const changed=hash(sources.raw)!==hash(baselineRaw);
  const oldWatch=read(path.join(root,'sources/elexon-upstream.json'));
  const githubChanged=stable(oldWatch.files)!==stable(sources.watch.files);
  let stage,after;
  if(changed)({stage,after}=await buildCandidate(root,sources.raw,sources.url,date));
  const diff=compareSchemas(before,next);
  const lines=[`# Elexon source check — ${date}`,'',`Specification: ${before.info.version} → ${next.info.version}`,`Published specification changed: ${changed ? 'yes':'no'}`,`Upstream GitHub YAML changed: ${githubChanged?'yes':'no'}`,'',`Source: ${sources.url}`,'', '## Schema changes'];
  for(const [kind,keys]of Object.entries(diff))lines.push(`${kind}: ${keys.length}`, ...keys.slice(0,150).map(k=>'- '+k.replace(/[\r\n`<>]/g,'')), ...(keys.length>150?['Additional entries are available in the full JSON diff.']:[]));
  if(after){lines.push('','## Interface/event changes');for(const iface of after.interfaces){const old=oldData.interfaces.find(i=>i.id===iface.id);if(stable(old.technicalVariants)!==stable(iface.technicalVariants))lines.push('- '+iface.id+': '+iface.eventCodes.join(', '));}}
  lines.push('','Business descriptions, routing, rejection guidance and release activation are not automatically updated.','GitHub YAML changes are a review signal; the published portal JSON remains the import source.','The highest stable specification advertised by the portal is selected. This does not establish its operational activation.','Checks completed before this pull request was created. Review the diff and merge manually to publish.');
  const report=lines.join('\n')+'\n';
  fs.mkdirSync(path.join(root,'.elexon-check'),{recursive:true});
  fs.writeFileSync(path.join(root,'.elexon-check/summary.md'),report);
  if(changed || githubChanged){
    if(changed)for(const file of ['interfaceData.json','js/messageExamplesData.js','sources/reconciliation-report.json','sources/elexon-current.json'])fs.copyFileSync(path.join(stage,file),path.join(root,file));
    write(path.join(root,'sources/elexon-upstream.json'),sources.watch);
    write(path.join(root,'sources/elexon-update-diff.json'),{checkedAt:stamp,source:sources.url,version:next.info.version,specificationChanged:changed,githubChanged,schemas:diff});
    fs.writeFileSync(path.join(root,'sources/elexon-update-summary.md'),report);
  }
  if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`changed=${changed||githubChanged}\n`);
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,report);
  console.log(changed||githubChanged ? 'Changes prepared for review; no publication performed.' : 'No source changes. Website files unchanged.');
  return {changed,githubChanged,report};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  runUpdate().catch(error=>{console.error('Elexon update stopped:',error.message);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\nUpdate stopped: '+error.message+'\nThe current website has not been replaced.\n');process.exitCode=1;});
}

