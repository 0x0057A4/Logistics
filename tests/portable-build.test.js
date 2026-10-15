import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,cpSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {loadPlaywright} from './browser/playwright.mjs';
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

const bundleSource=entry=>execFileSync('python3',['-c',"import runpy,sys; from pathlib import Path; x=runpy.run_path('scripts/build-portable.py'); print(x['bundle'](Path(sys.argv[1])))",entry],{cwd:root,encoding:'utf8',stdio:'pipe'});
const buildAt=dir=>execFileSync('python3',['-c',"import runpy,sys; from pathlib import Path; runpy.run_path('scripts/build-portable.py')['build'](Path(sys.argv[1]))",dir],{cwd:root,stdio:'pipe'});
const vendorThree=join(root,'dist/vendor/three.module.min.js');
/** Kopie von dist in tmp; app.js importiert dort zusätzlich three.js. Das echte dist bleibt unverändert. */
function distWithThreeProbe(prefix){
 const dir=mkdtempSync(join(tmpdir(),prefix));
 cpSync(join(root,'dist'),join(dir,'dist'),{recursive:true,filter:p=>!p.endsWith('.zip')});
 const app=join(dir,'dist/app.js');
 writeFileSync(app,"import * as THREE from './vendor/three.module.min.js';\nglobalThis.__threeProbe={length:new THREE.Vector3(1,2,3).length(),revision:THREE.REVISION,matrix:new THREE.Matrix4().makeRotationZ(Math.PI/2).elements.map(x=>Math.round(x))};\n"+readFileSync(app,'utf8'));
 buildAt(dir);
 return dir;
}

test('Vendor-Module: Exportblock wird Namensraum, eigener Funktionsscope, Fehlformen werden abgelehnt',()=>{
 const dir=mkdtempSync(join(tmpdir(),'logistics-vendor-'));
 try {
  mkdirSync(join(dir,'vendor'));
  writeFileSync(join(dir,'vendor/lib.js'),'/** @license test */\nconst a=2,s="</script><!--x";class P{constructor(x){this.x=x}len(){return this.x*a}}globalThis.topThis=this;export{P as Point,s as S,a};\n');
  writeFileSync(join(dir,'app.js'),"import * as L from './vendor/lib.js';\nimport {Point} from './vendor/lib.js';\nconst a=40;\nglobalThis.answer=new Point(1).len()+a;globalThis.text=L.S;globalThis.keys=Object.keys(L).join();globalThis.frozen=Object.isFrozen(L);");
  const sandbox={};vm.runInNewContext(bundleSource(join(dir,'app.js')),sandbox);
  assert.equal(sandbox.answer,42);assert.equal(sandbox.text,'</script><!--x');assert.equal(sandbox.keys,'Point,S,a');assert.equal(sandbox.frozen,true);assert.equal(sandbox.topThis,undefined);
  const bad=(source,pattern)=>{writeFileSync(join(dir,'vendor/lib.js'),source);assert.throws(()=>bundleSource(join(dir,'app.js')),pattern);};
  bad("import x from './y.js';const s=1;export{s as S};",/must not import/);
  bad('const s=1;export{s as S};const t=2;',/must end the file/);
  bad('const s=1;export{s as S};export{s as T};',/exactly one export/);
  bad('const s=1;export{s as "S"};',/Unsupported vendor export/);
  bad('const s=1;export{s as S,s as S};',/Duplicate vendor export/);
  writeFileSync(join(dir,'vendor/lib.js'),'const s=1;export{s as S};');
  writeFileSync(join(dir,'own.js'),'const s=1;\nexport{s};');
  writeFileSync(join(dir,'app.js'),"import {s} from './own.js';");
  assert.throws(()=>bundleSource(join(dir,'app.js')),/Unsupported module syntax/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('three.js r170 gebündelt in Node VM; Lizenzkommentar und maskierte Endtags im Portable-HTML',{skip:!existsSync(vendorThree)&&'dist/vendor fehlt'},()=>{
 const dir=distWithThreeProbe('logistics-three-');
 try {
  writeFileSync(join(dir,'dist/probe.js'),"import * as THREE from './vendor/three.module.min.js';\nglobalThis.probe={length:new THREE.Vector3(1,2,3).length(),revision:THREE.REVISION};");
  const sandbox={};vm.runInNewContext(bundleSource(join(dir,'dist/probe.js')),sandbox);
  assert.equal(sandbox.probe.revision,'170');assert.ok(Math.abs(sandbox.probe.length-Math.sqrt(14))<1e-12);
  const html=readFileSync(join(dir,'dist/portable.html'),'utf8');
  assert.match(html,/<!-- Drittanbieter-Lizenz \(vendor\/THREE-LICENSE\.txt\)\nThe MIT License[\s\S]*?three\.js authors[\s\S]*?-->/);
  const start=html.indexOf('<script id="portable-runtime">'),code=html.match(/<script id="portable-runtime">([\s\S]*?)<\/script>/)[1];
  assert.ok(code.includes('// vendor/three.module.min.js'));assert.doesNotMatch(code,/<\/script|<!--/i);new vm.Script(code);
  assert.equal(html.lastIndexOf('</script>'),html.indexOf('</script>',start));
 } finally {rmSync(dir,{recursive:true,force:true});}
});

const pw=loadPlaywright();
test('Browser (file://): gebündeltes three.js rechnet, Spiel startet ohne Konsolenfehler',{skip:(!pw&&'Playwright nicht verfügbar')||(!existsSync(vendorThree)&&'dist/vendor fehlt'),timeout:120000},async()=>{
 const dir=distWithThreeProbe('logistics-three-browser-');
 const browser=await pw.chromium.launch(pw.launchOptions);
 try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(pathToFileURL(join(dir,'dist/portable.html')).href);
  await page.waitForFunction(()=>document.querySelector('#welcome')?.open===true,null,{timeout:20000});
  const probe=await page.evaluate(()=>globalThis.__threeProbe);
  assert.equal(probe.revision,'170');assert.ok(Math.abs(probe.length-Math.sqrt(14))<1e-12);assert.deepEqual(probe.matrix.slice(0,2),[0,1]);
  assert.deepEqual(errors,[]);
 } finally {await browser.close();rmSync(dir,{recursive:true,force:true});}
});
