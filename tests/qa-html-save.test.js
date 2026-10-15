import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Simulation} from '../dist/core.js';
import {injectPortableSave} from '../dist/portable-save.js';
import {boot} from './ui-harness.js';
const embedded=(html,id)=>{const tag=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].find(m=>new RegExp(`\\bid=["']${id}["']`).test(m[1]));assert.ok(tag,`${id} vorhanden`);return tag[2];};
const template=()=>fs.readFileSync(new URL('../dist/portable.html',import.meta.url),'utf8');
function sample(){const sim=new Simulation({mode:'sandbox',seed:163});assert.equal(sim.command({type:'rentVehicle',vehicleType:'van'}).ok,true);sim.step(29);return sim;}
test('QS HTML: Spielstand und Einstellungen überstehen Export und zweiten Export exakt',()=>{
 const sim=sample(),prefs={mode:'sandbox',large:true,reduced:true,mission:false};
 const first=injectPortableSave(template(),sim.serialize(),prefs);
 assert.equal(Simulation.fromJSON(embedded(first,'embedded-save')).serialize(),sim.serialize());
 assert.deepEqual(JSON.parse(embedded(first,'embedded-prefs')),prefs);
 sim.step(71);const second=injectPortableSave(first,sim.serialize(),prefs);
 assert.equal(Simulation.fromJSON(embedded(second,'embedded-save')).serialize(),sim.serialize());
 assert.equal([...second.matchAll(/id=["']embedded-save["']/g)].length,1);
 assert.equal([...second.matchAll(/id=["']embedded-prefs["']/g)].length,1);
});
test('QS HTML: Namen mit Script-Ende bleiben reine Spieldaten',()=>{
 const sim=sample();sim.state.sites[0].name='</script><script>globalThis.infected=true</script> & <!-- \u2028\u2029';
 const exported=injectPortableSave(template(),sim.serialize(),{mode:'sandbox'});
 const raw=embedded(exported,'embedded-save');assert.equal(JSON.parse(raw).sites[0].name,sim.state.sites[0].name);
 assert.equal(exported.includes('<script>globalThis.infected=true</script>'),false);
 assert.equal(raw.includes('<'),false);
});
test('QS HTML: Stand aus Datei gewinnt gegen fremden lokalen Stand; Start pausiert und ohne Speicherung',async()=>{
 const sim=sample(),raw=sim.serialize(),old=new Simulation({mode:'sandbox',seed:12}).serialize();
 const memory=new Map([['industrie-logistik-v1-prefs',JSON.stringify({mode:'sandbox'})],['industrie-logistik-v1-sandbox',old]]);
 const before=[...memory];const ui=await boot({memory,embeddedSave:raw,embeddedPrefs:{mode:'sandbox',large:true}});
 assert.equal(ui.run('sim.serialize()'),raw);assert.equal(ui.run('speed'),0);assert.equal(ui.run('temporary'),true);assert.equal(ui.run('started'),true);
 assert.equal(ui.run('prefs.large'),true);assert.equal(ui.run('save()'),false);assert.deepEqual([...memory],before);
 ui.run('guard.dispose()');
});
test('QS HTML: Datei startet trotz verbotenem localStorage und Änderungen bleiben spielbar',async()=>{
 const sim=sample(),ui=await boot({storageGetterError:true,embeddedSave:sim.serialize(),embeddedPrefs:{mode:'sandbox'}});
 assert.equal(ui.run('sim.serialize()'),sim.serialize());assert.equal(ui.run('speed'),0);
 const result=ui.run("send({type:'rentVehicle',vehicleType:'truck'})");assert.equal(result.ok,true);assert.equal(ui.run('sim.state.rentals.length'),2);ui.run('guard.dispose()');
});
test('QS HTML: Offline-Template besitzt ausführbares gebündeltes JavaScript ohne externe Startdateien',()=>{
 const html=template();assert.doesNotMatch(html,/<script\b[^>]*\bsrc\s*=/i);assert.doesNotMatch(html,/<link\b[^>]*rel=["']stylesheet["']/i);assert.doesNotMatch(html,/<base\b/i);
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m=>!m[1].includes('application/json'));
 assert.ok(scripts.length>0);for(const [,attrs,code] of scripts){assert.doesNotMatch(attrs,/type=["']module["']/);assert.doesNotThrow(()=>new vm.Script(code));}
});
test('QS HTML: Darstellung in Dateisitzung überschreibt keine Browser-Einstellungen',async()=>{
 const memory=new Map([['industrie-logistik-v1-prefs','{"mode":"guided","large":false}']]);const ui=await boot({memory,embeddedSave:sample().serialize()});const before=[...memory];
 ui.listeners.change({target:{dataset:{pref:'large'},checked:true}});assert.equal(ui.run('prefs.large'),true);assert.deepEqual([...memory],before);ui.run('guard.dispose()');
});
test('QS HTML: Download öffnet erneut identischen Stand; zweiter Download ersetzt eingebettete Daten',async()=>{
 const ui=await boot({fetch:async()=>({ok:true,text:async()=>template()})});await ui.click('start');ui.click('starter');const raw=ui.run('sim.serialize()');assert.equal(await ui.click('exportHtml'),true);assert.equal(ui.downloads.length,1);const first=await(await fetch(ui.downloads[0].href)).text();
 const reopened=await boot({embeddedSave:embedded(first,'embedded-save'),embeddedPrefs:JSON.parse(embedded(first,'embedded-prefs')),outerHTML:first,storageGetterError:true});assert.equal(reopened.run('sim.serialize()'),raw);
 reopened.run('sim.step(13)');const changed=reopened.run('sim.serialize()');assert.equal(await reopened.click('exportHtml'),true);const second=await(await fetch(reopened.downloads[0].href)).text();assert.equal(Simulation.fromJSON(embedded(second,'embedded-save')).serialize(),changed);
 assert.match(reopened.downloads[0].name,/\.html$/);for(const app of [ui,reopened]){for(const item of app.downloads)URL.revokeObjectURL(item.href);app.run('guard.dispose()');}
});
test('QS HTML: vollständiges Offline-Bundle startet mit echter Scene und exportiert ohne Netzwerk',async()=>{
 const raw=sample().serialize(),html=injectPortableSave(template(),raw,{mode:'sandbox',large:true}),listeners={},downloads=[],nodes=new Map();
 const node=()=>({dataset:{},style:{},innerHTML:'',textContent:'',hidden:false,value:'',scrollTop:0,classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},getContext:()=>({setTransform(){}}),getBoundingClientRect:()=>({width:1000,height:700,left:0,top:0}),showModal(){this.open=true;},close(){this.open=false;},appendChild(){},remove(){},contains:()=>false,click(){if(this.download)downloads.push(this.href);}});
 for(const [,id]of html.matchAll(/id="([^"]+)"/g))nodes.set('#'+id,node());
 nodes.get('#embedded-save').textContent=embedded(html,'embedded-save');nodes.get('#embedded-prefs').textContent=embedded(html,'embedded-prefs');
 const document={documentElement:{outerHTML:html},body:node(),hidden:false,activeElement:null,getElementById:id=>nodes.get('#'+id)||null,querySelector:s=>s==='dialog[open]'?[...nodes.values()].find(n=>n.open)||null:nodes.get(s),querySelectorAll:()=>[],addEventListener(type,fn){listeners[type]=fn;},createElement:node};
 const context=vm.createContext({document,window:{addEventListener(){},devicePixelRatio:1},performance:{now:()=>0},matchMedia:()=>({matches:false}),ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},Blob,URL,URLSearchParams,fetch(){throw Error('Offline: Netzwerkzugriff verboten');}});
 Object.defineProperty(context,'localStorage',{get(){throw Error('Speicher verboten');}});
 for(const [,attrs,code]of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi))if(!attrs.includes('application/json'))vm.runInContext(code,context);
 assert.equal(nodes.get('#welcome').open,false);assert.match(nodes.get('#toast').textContent,/HTML-Spielstand geladen/);
 const button={dataset:{action:'exportHtml'},matches:()=>false};assert.equal(await listeners.click({target:{closest:()=>button}}),true);
 assert.equal(downloads.length,1);const exported=await(await fetch(downloads[0])).text();assert.equal(Simulation.fromJSON(embedded(exported,'embedded-save')).serialize(),raw);URL.revokeObjectURL(downloads[0]);
});
