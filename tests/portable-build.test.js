import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
const root=new URL('../',import.meta.url).pathname;

test('Portable build has inline CSS/runtime, payload slots and syntactically valid isolated modules',()=>{
 execFileSync('python3',['scripts/build-portable.py'],{cwd:root});
 const html=readFileSync(new URL('../dist/portable.html',import.meta.url),'utf8');
 assert.match(html,/<script id="embedded-save" type="application\/json">null<\/script>/);
 assert.match(html,/<script id="embedded-prefs" type="application\/json">null<\/script>/);
 assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+stylesheet/);
 const code=html.match(/<script id="portable-runtime">([\s\S]*?)<\/script>/)[1];
 new vm.Script(code);
 assert.doesNotMatch(code,/^import\s|^export\s/m);
});

test('Portable bundler preserves private scopes, named aliases and namespace imports',()=>{
 const dir=mkdtempSync(join(tmpdir(),'logistics-bundle-'));
 try {
  writeFileSync(join(dir,'one.js'),'const secret=11;\nexport const value=secret;');
  writeFileSync(join(dir,'two.js'),'const secret=22;\nexport function result(){return secret;}');
  writeFileSync(join(dir,'app.js'),"import {value as first} from './one.js';\nimport * as second from './two.js';\nglobalThis.answer=first+second.result();");
  const source=execFileSync('python3',['-c',"import runpy; from pathlib import Path; x=runpy.run_path('scripts/build-portable.py'); print(x['bundle'](Path(__import__('sys').argv[1])))",join(dir,'app.js')],{cwd:root,encoding:'utf8'});
  const sandbox={};vm.runInNewContext(source,sandbox);assert.equal(sandbox.answer,33);
  writeFileSync(join(dir,'one.js'),"import {value} from './app.js';\nexport const other=1;");
  assert.throws(()=>execFileSync('python3',['-c',"import runpy; from pathlib import Path; x=runpy.run_path('scripts/build-portable.py'); x['bundle'](Path(__import__('sys').argv[1]))",join(dir,'app.js')],{cwd:root,stdio:'pipe'}),/Module cycle/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
