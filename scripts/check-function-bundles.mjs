import { readdirSync,readFileSync,statSync } from 'node:fs';
import { dirname,join,relative,resolve,sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_BYTES=200_000_000;
const browserRuntime=/\/node_modules\/(?:@huggingface\/transformers|onnxruntime-(?:node|web|common))(?:\/|$)/;
function traces(directory){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?traces(join(directory,entry.name)):entry.name.endsWith('.nft.json')?[join(directory,entry.name)]:[]);
}
function files(trace){
  const data=JSON.parse(readFileSync(trace,'utf8'));
  if(!Array.isArray(data.files)||data.files.some(file=>typeof file!=='string'))throw new Error(`Invalid function trace: ${trace}`);
  return data.files.map(file=>resolve(dirname(trace),file));
}
export function checkFunctionBundles(buildDirectory='.next'){
  const build=resolve(buildDirectory),runtime=files(join(build,'next-server.js.nft.json'));
  const functions=traces(join(build,'server'));
  if(!functions.length)throw new Error('No function traces found');
  const sizes=new Map();let largest={file:'',bytes:0};
  for(const trace of functions){
    const included=new Set([...runtime,...files(trace),trace,trace.slice(0,-'.nft.json'.length)]);
    let bytes=0;
    for(const file of included){
      if(browserRuntime.test(file.split(sep).join('/')))throw new Error(`Browser model runtime leaked into ${relative(build,trace)}: ${file}`);
      if(!sizes.has(file))sizes.set(file,statSync(file).size);
      bytes+=sizes.get(file);
    }
    if(bytes>MAX_BYTES)throw new Error(`Function ${relative(build,trace)} is ${(bytes/1e6).toFixed(2)} MB; budget is ${MAX_BYTES/1e6} MB (Vercel limit: 250 MB)`);
    if(bytes>largest.bytes)largest={file:relative(build,trace),bytes};
  }
  return {functions:functions.length,largest};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const result=checkFunctionBundles(process.argv[2]);
  console.log(`Checked ${result.functions} function traces including the shared runtime. Largest: ${result.largest.file}, ${(result.largest.bytes/1e6).toFixed(2)} MB / ${MAX_BYTES/1e6} MB.`);
}
