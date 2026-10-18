import {BUILDINGS,RECIPES} from './catalog.js';
import {gridEnergy} from './disruptions.js'; // 0.16 S1: Netzstörung → nur Energiegebäude
export function init(s){s.jobs??=[];}
const researched=(s,key)=>(s.research||[]).some(r=>r.key===key&&r.status==='completed');
export function handle(s,c,api){if(!['setRecipe','toggleBuilding','maintain'].includes(c.type))return null;const b=s.buildings.find(b=>b.id===c.id);if(!b)return {ok:false,message:'Anlage nicht gefunden.'};
 if(c.type==='toggleBuilding'){b.enabled=!b.enabled;if(!b.enabled&&b.job)api.workforce.release(b.job);return {ok:true};}
 if(c.type==='setRecipe'){if(b.job)return {ok:false,message:'Laufenden Auftrag zuerst fertigstellen.'};const r=RECIPES[c.recipe];if(!BUILDINGS[b.type]?.recipes.includes(c.recipe))return {ok:false,message:'Rezept passt nicht zur Maschine.'};if(r.research&&!researched(s,r.research))return {ok:false,message:'Produktentwicklung noch nicht abgeschlossen.'};if(b.recipe!==c.recipe){b.setupRemaining=r.setup||3;b.recipe=c.recipe;}return {ok:true};}
 if(s.jobs.some(j=>j.building===b.id&&j.status==='maintenance'))return {ok:false,message:'Wartung läuft bereits.'};if(b.condition>=100)return {ok:false,message:'Anlage bereits gewartet.'};const workshop=s.buildings.find(x=>x.type==='workshop'&&x.site===b.site&&x.enabled&&!x.serviceJob&&!x.maintenanceTask);if(!workshop)return {ok:false,message:'Freie Wartungswerkstatt benötigt.'};const id=api.id('maintenance'),w=api.workforce.acquire('technician',b.site,id);if(!w)return {ok:false,message:'Freie Technikperson benötigt.'};if(!api.inventory.reserve('spare',1,b.site,id)){api.workforce.release(id);return {ok:false,message:'Ein Ersatzteil benötigt.'};}if(!api.book(id,-120,'maintenance','Anlagenwartung',[b.id])){api.inventory.release(id);api.workforce.release(id);return {ok:false,message:'Kapital reicht nicht.'};}const inputs=api.inventory.consume(id);if(!inputs){api.inventory.release(id);api.workforce.release(id);return {ok:false,message:'Ersatzteil nicht verfügbar.'};}const previousJob=b.job;if(previousJob)api.workforce.release(previousJob);s.jobs.push({id,building:b.id,recipe:null,remaining:15,duration:15,status:'maintenance',worker:w.id,inputs,output:null,workshop:workshop.id,previousJob});workshop.maintenanceTask=id;b.job=id;b.status='maintenance';return {ok:true};}
/** Aktive Mehrwertdienst-Aufträge (kind 'vas') nach Frist, dann Arrayreihenfolge. */
function vasOrders(s){const out=[];for(const o of s.orders||[])if(o.kind==='vas'&&o.status==='active')out.push(o);return out.sort((a,b)=>a.due-b.due);}
/** Erster Auftrag, dessen Kundenmaterial am Standort alle Eingänge des Rezepts deckt. */
function vasOwner(list,r,site,api){for(const o of list)if(o.site===site&&Object.entries(r.inputs).every(([item,qty])=>api.inventory.available(item,site,o.id)>=qty))return o.id;return null;}
function outputJob(s,b,j,api){if(!api.inventory.add({item:j.output.item,qty:j.output.qty,site:b.site,owner:j.owner||'company',location:'stock',quality:j.quality,unitCost:j.unitCost,parents:j.inputs.map(x=>x.id)})){b.status='storage';j.status='storage';return false;}s.stats.produced+=['lamp','lamp_pro','sensor'].includes(j.output.item)?j.output.qty:0;b.condition=Math.max(0,b.condition-0.2);api.log('production',`${j.snapshot?.name||RECIPES[j.recipe]?.name||'Fertigung'} abgeschlossen.`,[b.id]);return true;}
function finish(s,b,j,api,jobs){api.workforce.release(j.id);s.jobs.splice(s.jobs.indexOf(j),1);if(jobs?.get(j.id)===j)jobs.delete(j.id);if(j.workshop){const workshop=s.buildings.find(x=>x.id===j.workshop);if(workshop?.maintenanceTask===j.id)workshop.maintenanceTask=null;}b.job=j.previousJob||null;b.progress=0;b.status='idle';}
/** QS-015-03 (A04): Bricht alle Fertigungsjobs eines Eigentümers ab (Storno Lohnfertigung). Reservierungen und Personal
 *  werden frei, die Anlage wird leer (offene Rüstzeit bleibt an der Anlage). Bereits verbrauchte Eingänge (j.inputs) gibt der
 *  Aufrufer an den Kunden zurück; es entsteht keine Ausgabe. Eine Wartung, die den Job unterbrochen hat, kehrt danach nicht zu
 *  ihm zurück. Rückgabe: abgebrochene Jobs. Eigene Jobs (ohne owner) bleiben unberührt. */
export function abortJobs(s,api,owner){
 if(typeof owner!=='string'||!owner||owner==='company')return [];
 const out=[];
 for(const j of s.jobs.filter(j=>j.owner===owner)){
  api.workforce.release(j.id);api.inventory.release(j.id);s.jobs.splice(s.jobs.indexOf(j),1);
  for(const m of s.jobs)if(m.previousJob===j.id)m.previousJob=null;
  const b=s.buildings.find(x=>x.id===j.building);
  if(b?.job===j.id){b.job=null;b.progress=0;b.status='idle';if(j.setupRemaining>0)b.setupRemaining=j.setupRemaining;}
  out.push(j);
 }
 return out;
}
export function step(s,api){
 // Ein Durchlauf statt zwei Filtern je Standort; Summen je Standort weiter in Gebäudereihenfolge.
 const supply=new Map(),demand=new Map();for(const b of s.buildings){if(!b.enabled)continue;const d=BUILDINGS[b.type];if(b.type==='power')supply.set(b.site,(supply.get(b.site)??0)+(d.energy||0));if(!d?.recipes.length)demand.set(b.site,(demand.get(b.site)??0)+(d?.power||0));}
 const power={};for(const site of s.sites)power[site.id]=gridEnergy(s,site.id)+(supply.get(site.id)??0)-(demand.get(site.id)??0);
 // Laufzeitlokaler Auftragsindex für diesen Minutenschritt (erste ID gewinnt wie s.jobs.find).
 const jobs=new Map();for(const j of s.jobs)if(!jobs.has(j.id))jobs.set(j.id,j);let vas=null;
 for(const b of s.buildings){const spec=BUILDINGS[b.type];if(!spec)continue;let j=jobs.get(b.job);if(!spec.recipes.length&&!j)continue;
 if(!b.enabled){b.status='paused';if(j)api.workforce.release(j.id);continue;}
 if(j?.status==='storage'){if(outputJob(s,b,j,api))finish(s,b,j,api,jobs);continue;}
 if(b.condition<=5&&j?.status!=='maintenance'){b.status='broken';if(j)api.workforce.release(j.id);continue;}
 if(power[b.site]<spec.power){b.status='power';if(j)api.workforce.release(j.id);continue;}power[b.site]-=spec.power;
 if(!j){const recipe=b.recipe||spec.recipes[0],r=RECIPES[recipe];if(!r)continue;b.recipe=recipe;if(r.research&&!researched(s,r.research)){b.status='research';continue;}const id=api.id('job');
 // Mehrwertdienst (A04, 0.15 S3): Kundenmaterial (owner=Auftrag) eines aktiven vas-Auftrags hat Vorrang, aber nur wenn ALLE
 // Eingänge des Rezepts diesem Auftrag gehören. Sonst eigener Weg unverändert (owner company); nie gemischt.
 vas??=vasOrders(s);const owner=(vas.length&&vasOwner(vas,r,b.site,api))||'company';
 if(!Object.entries(r.inputs).every(([item,qty])=>api.inventory.available(item,b.site,owner)>=qty)){b.status='materials';continue;}
 let reserved=true;for(const [item,qty]of Object.entries(r.inputs))if(!api.inventory.reserve(item,qty,b.site,id,owner)){reserved=false;break;}if(!reserved){api.inventory.release(id);b.status='materials';continue;}const w=api.workforce.acquire(r.role,b.site,id);if(!w){api.inventory.release(id);b.status='staff';continue;}
 const inputs=api.inventory.consume(id);if(!inputs){api.inventory.release(id);api.workforce.release(id);b.status='materials';continue;}const qty=inputs.reduce((n,x)=>n+x.qty,0),materialQuality=inputs.reduce((n,x)=>n+x.quality*x.qty,0)/qty;
 const quality=Math.max(0,Math.min(100,materialQuality+(w.skill-1)*2-(100-b.condition)*0.04+(researched(s,'quality')?2:0)+(r.qualityGain||0)));
 j={id,building:b.id,recipe,snapshot:JSON.parse(JSON.stringify(r)),remaining:r.duration,duration:r.duration,status:'walking',worker:w.id,setupRemaining:b.setupRemaining||0,walkRemaining:Math.max(1,Math.ceil((Math.abs(b.x)+Math.abs(b.y-8))/5)),inputs,output:{...r.output},quality,cost:{inputs:inputs.reduce((n,x)=>n+x.unitCost*x.qty,0),labor:0,energy:0},unitCost:inputs.reduce((n,x)=>n+x.unitCost*x.qty,0)/r.output.qty};if(owner!=='company')j.owner=owner;b.setupRemaining=0;s.jobs.push(j);if(!jobs.has(j.id))jobs.set(j.id,j);b.job=j.id;}
 const role=j.status==='maintenance'?'technician':(j.snapshot||RECIPES[j.recipe]).role,w=api.workforce.acquire(role,b.site,j.id);if(!w){b.status='staff';j.worker=null;continue;}j.worker=w.id;
 // Herstellbewertung verteilt bereits gebuchte Löhne/Energie; keine zweite Zahlung.
 if(j.status!=='maintenance'){j.cost??={inputs:j.unitCost*j.output.qty,labor:0,energy:0};j.cost.labor+=w.wage/60;j.cost.energy+=spec.power*0.32/60;j.unitCost=(j.cost.inputs+j.cost.labor+j.cost.energy)/j.output.qty;}
 if(j.walkRemaining>0){j.walkRemaining--;b.status='walking';w.activity='Materialbereitstellung';continue;}
 if(j.setupRemaining>0){j.setupRemaining--;b.status='setup';w.activity='Maschine umrüsten';continue;}
 w.activity=j.status==='maintenance'?'Wartung':'Fertigung';b.status=j.status==='maintenance'?'maintenance':'working';const speed=j.status==='maintenance'?1:Math.min(1.5,w.skill)*(researched(s,'efficiency')?1.2:1);j.remaining=Math.max(0,j.remaining-speed);b.progress=1-j.remaining/j.duration;
 if(j.remaining<=0){if(j.status==='maintenance'){b.condition=100;finish(s,b,j,api,jobs);}else{api.workforce.release(j.id);if(outputJob(s,b,j,api))finish(s,b,j,api,jobs);}}
 }
}
export function validate(s){for(const j of s.jobs||[])if(j.owner!==undefined&&(typeof j.owner!=='string'||!(s.orders||[]).some(o=>o.id===j.owner&&o.kind==='vas')))throw new Error('Spielstand ungültig: Lohnfertigungsauftrag beschädigt.');}
