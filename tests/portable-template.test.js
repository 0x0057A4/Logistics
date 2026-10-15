// A12 · QS-W0-01: Erneuter HTML-Export aus dem Dateimodus nutzt die unveränderte Vorlage (Schale in #portable-template),
// nie das laufende DOM. Gen 1 → 2 → 3 byte-identisch bis auf Spielstand- und Prefs-Slot.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {Simulation} from '../dist/core.js';
import {injectPortableSave,portableTemplate,TEMPLATE_MARKS} from '../dist/portable-save.js';
const root=new URL('../',import.meta.url).pathname;

const tags=html=>[...html.matchAll(/<(script|style) id="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)].map(([,,id,text])=>[id,text]);
const part=(html,id)=>{const found=tags(html).find(([x])=>x===id);assert.ok(found,id+' vorhanden');return found[1];};
const withoutSlots=html=>html.replace(/(<script id="embedded-(?:save|prefs)" type="application\/json">)[\s\S]*?(<\/script>)/g,'$1…$2');
const rebuild=html=>portableTemplate(JSON.parse(part(html,'portable-template')),part(html,'portable-style'),part(html,'portable-runtime'));

/** Frisch gebautes portable.html in tmp-Kopie (dist bleibt unberührt). */
function freshTemplate(){
 const dir=mkdtempSync(join(tmpdir(),'logistics-template-'));
 try{
  cpSync(join(root,'dist'),join(dir,'dist'),{recursive:true,filter:p=>!p.endsWith('.zip')});
  execFileSync('python3',['-c',"import runpy,sys; from pathlib import Path; runpy.run_path('scripts/build-portable.py')['build'](Path(sys.argv[1]))",dir],{cwd:root,stdio:'pipe'});
  return readFileSync(join(dir,'dist/portable.html'),'utf8');
 }finally{rmSync(dir,{recursive:true,force:true});}
}
const template=freshTemplate();

/** Startet eine HTML-Datei mit echtem Bundle im VM-DOM-Ersatz. Laufzeit-DOM wird durch `polluted` simuliert. */
async function exportFrom(html,polluted){
 const listeners={},downloads=[],nodes=new Map();
 const node=()=>({dataset:{},style:{},innerHTML:'',textContent:'',hidden:false,value:'',scrollTop:0,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},getContext:()=>({setTransform(){}}),getBoundingClientRect:()=>({width:1000,height:700,left:0,top:0}),showModal(){this.open=true;},close(){this.open=false;},appendChild(){},remove(){},contains:()=>false,click(){if(this.download)downloads.push(this.href);}});
 for(const [,id]of html.matchAll(/id="([^"]+)"/g))nodes.set('#'+id,node());
 for(const [id,text] of tags(html))nodes.get('#'+id).textContent=text;
 const document={documentElement:{outerHTML:polluted},body:node(),hidden:false,activeElement:null,getElementById:id=>nodes.get('#'+id)||null,querySelector:s=>s==='dialog[open]'?[...nodes.values()].find(n=>n.open)||null:nodes.get(s),querySelectorAll:()=>[],addEventListener(type,fn){listeners[type]=fn;},createElement:node};
 const context=vm.createContext({document,window:{addEventListener(){},devicePixelRatio:1},performance:{now:()=>0},matchMedia:()=>({matches:false}),ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},Blob,URL,URLSearchParams,fetch(){throw Error('Offline');}});
 Object.defineProperty(context,'localStorage',{get(){throw Error('Speicher verboten');}});
 for(const [,attrs,code]of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi))if(!attrs.includes('application/json'))vm.runInContext(code,context);
 const button={dataset:{action:'exportHtml'},matches:()=>false};
 assert.equal(await listeners.click({target:{closest:()=>button}}),true);
 assert.equal(downloads.length,1);const out=await(await fetch(downloads[0])).text();URL.revokeObjectURL(downloads[0]);return out;
}

test('QS-W0-01: gebaute Vorlage = Wiederherstellung aus Schale + Rohtext (Python- und JS-Kodierung identisch)',()=>{
 assert.equal(rebuild(template),template);
 const shell=JSON.parse(part(template,'portable-template'));
 for(const mark of Object.values(TEMPLATE_MARKS))assert.equal(shell.split(mark).length,2,mark);
 assert.doesNotMatch(part(template,'portable-template'),/[<>&]/,'Schale inert kodiert');
 assert.match(template,/<style id="portable-style">/);assert.equal(template.lastIndexOf('</script>'),template.indexOf('</script>',template.indexOf('<script id="portable-runtime">')));
});

test('QS-W0-01: Kodierung der Schale – Sonderzeichen identisch in Python und JS',()=>{
 const shell='<p>"ä\\    \u0001\t\n\r </script> & 😀</p>'+Object.values(TEMPLATE_MARKS).join('|');
 const py=execFileSync('python3',['-c',"import runpy,sys,json; x=runpy.run_path('scripts/build-portable.py'); sys.stdout.write(json.dumps(x['portable_template'](json.loads(sys.stdin.read()),'CSS','JS')))"],{cwd:root,input:JSON.stringify(shell),encoding:'utf8'});
 assert.equal(JSON.parse(py),portableTemplate(shell,'CSS','JS'));
 assert.throws(()=>portableTemplate('ohne Platzhalter','',''),/unvollständig/);
 assert.throws(()=>portableTemplate(shell+TEMPLATE_MARKS.style,'',''),/unvollständig/);
});

test('QS-W0-01: Gen 1 → 2 → 3 aus Dateimodus: Laufzeit-DOM fließt nicht ein, Vorlage byte-identisch bis auf Slots',async()=>{
 const sim=new Simulation({mode:'sandbox',seed:5});assert.equal(sim.command({type:'rentVehicle',vehicleType:'van'}).ok,true);sim.step(40);
 const gen1=injectPortableSave(template,sim.serialize(),{mode:'sandbox',large:true});
 const pollution='<html><body><div id="vbarList"><div class="vrow">vehicle-32</div></div><div class="scene3d-labels">VERALTET</div></body></html>';
 const gen2=await exportFrom(gen1,pollution);
 const gen3=await exportFrom(gen2,pollution);
 for(const g of [gen2,gen3]){assert.equal(g.includes('VERALTET'),false);assert.equal(g.includes('vehicle-32'),false);}
 assert.equal(withoutSlots(gen2),withoutSlots(gen1),'Gen 2 = Gen 1 bis auf Slots');
 assert.equal(withoutSlots(gen3),withoutSlots(gen2),'Gen 3 = Gen 2 bis auf Slots');
 assert.equal(Simulation.fromJSON(part(gen3,'embedded-save')).serialize(),sim.serialize());
 assert.deepEqual(JSON.parse(part(gen3,'embedded-prefs')),{mode:'sandbox',large:true,reduced:false,mission:true});
});

test('QS-W0-01: Datei ohne Vorlagenslot (Altbestand) exportiert weiter über Start-Schnappschuss',async()=>{
 const legacy=injectPortableSave(template,new Simulation({mode:'sandbox',seed:6}).serialize(),{mode:'sandbox'}).replace(/<script id="portable-template" type="application\/json">[\s\S]*?<\/script>\n/,'');
 const snapshot=legacy.replace(/^<!doctype html>\n/i,'');
 const out=await exportFrom(legacy,snapshot);
 assert.equal(withoutSlots(out),withoutSlots('<!doctype html>\n'+snapshot));
});
