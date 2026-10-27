import { afterEach,expect,it } from 'vitest';
import { mkdtempSync,mkdirSync,writeFileSync,openSync,ftruncateSync,closeSync,rmSync,statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFunctionBundles } from '../scripts/check-function-bundles.mjs';

const temporary:string[]=[];
afterEach(()=>{for(const path of temporary.splice(0))rmSync(path,{recursive:true,force:true});});
function fixture(files:string[]=[]){
  const build=mkdtempSync(join(tmpdir(),'liravo-function-budget-'));temporary.push(build);
  const app=join(build,'server/app/book/[id]');mkdirSync(app,{recursive:true});
  writeFileSync(join(build,'runtime.js'),'shared runtime');
  writeFileSync(join(build,'next-server.js.nft.json'),JSON.stringify({files:['runtime.js']}));
  writeFileSync(join(app,'page.js'),'server page');
  writeFileSync(join(app,'page.js.nft.json'),JSON.stringify({files:['../../../../runtime.js',...files]}));
  return {build,app};
}
it('includes shared runtime and route code without double-counting common dependencies',()=>{
  const {build,app}=fixture();const result=checkFunctionBundles(build);
  expect(result.functions).toBe(1);expect(result.largest.file).toContain('book');
  expect(result.largest.bytes).toBe('shared runtime'.length+'server page'.length+statSync(join(app,'page.js.nft.json')).size);
});
it('rejects browser inference dependencies even when their fixture size is small',()=>{
  const {build}=fixture(['../../../../node_modules/onnxruntime-node/binding.node']);
  mkdirSync(join(build,'node_modules/onnxruntime-node'),{recursive:true});writeFileSync(join(build,'node_modules/onnxruntime-node/binding.node'),'native runtime');
  expect(()=>checkFunctionBundles(build)).toThrow(/Browser model runtime leaked/);
});
it('fails before Vercel when an uncompressed function exceeds the reserved size budget',()=>{
  const {build,app}=fixture(['large.bin']);const descriptor=openSync(join(app,'large.bin'),'w');
  try{ftruncateSync(descriptor,200_000_001);}finally{closeSync(descriptor);}
  expect(()=>checkFunctionBundles(build)).toThrow(/budget is 200 MB/);
});
it('fails when a traced runtime dependency is missing',()=>{
  const {build}=fixture(['missing-runtime.js']);expect(()=>checkFunctionBundles(build)).toThrow();
});
