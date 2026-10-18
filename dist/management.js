import {RESEARCH,ITEMS,VEHICLES,BUILDINGS} from './catalog.js';
import {committedQty} from './tours.js';
export function init(s){s.research??=[];s.rules??=[];}
const result=(ok,message,id)=>({ok,message,...(id?{id}:{})});
/** Bausperre durch Forschung (A04, 0.15 S3): Gebäude mit Katalogfeld `research` erst nach abgeschlossener Forschung.
 * Rückgabe Meldung oder null. Wird von core.worldCommand beim Bau geprüft (Versetzen bestehender Anlagen bleibt frei). */
export function buildResearchMissing(s,type){const key=BUILDINGS[type]?.research;if(!key||(s.research||[]).some(r=>r.key===key&&r.status==='completed'))return null;return 'Forschung „'+(RESEARCH[key]?.name||key)+'“ zuerst abschließen.';}
export function handle(s,c,api){
 if(c.type==='startResearch'){
  const spec=RESEARCH[c.key],site=c.site||s.selectedSite;if(!spec)return result(false,'Forschungsziel unbekannt.');if(s.research.some(r=>r.key===c.key))return result(false,'Forschung bereits begonnen oder abgeschlossen.');
  const lab=s.buildings.find(b=>b.type==='research'&&b.site===site&&b.enabled&&!s.research.some(r=>r.building===b.id&&r.status==='active'));if(!lab)return result(false,'Freies, eingeschaltetes Entwicklungslabor benötigt.');
  const id=api.id('research'),worker=api.workforce.acquire('research',site,id);if(!worker)return result(false,'Freies Forschungspersonal benötigt.');
  if(!api.book('research:'+id,-spec.cost,'research',spec.name,[lab.id])){api.workforce.release(id);return result(false,'Forschungsbudget fehlt.');}
  s.research.push({id,key:c.key,site,building:lab.id,worker:worker.id,status:'active',duration:spec.duration,remaining:spec.duration,startedAt:s.t,blocked:null});api.log('research',spec.name+' begonnen.',[id]);return result(true,'Forschung gestartet.',id);
 }
 if(c.type==='addRule'){
  const site=c.site||s.selectedSite,definition={...c,site,priority:c.priority??50};if(!validRule(s,definition))return result(false,'Regelwerte ungültig.');
  if(s.rules.some(r=>ruleKey(r)===ruleKey(definition)))return result(false,'Gleiche Regel am Standort existiert.');
  const id=api.id('rule');s.rules.push({id,kind:c.kind,item:c.item??null,site,threshold:c.threshold??null,qty:c.qty??null,budget:c.budget,spent:0,cooldown:c.cooldown,priority:definition.priority,enabled:true,lastRun:null,lastReason:null,purchase:null});api.log('rule','Delegationsregel eingerichtet.',[id]);return result(true,'Regel aktiviert.',id);
 }
 if(c.type==='setRulePriority'){const r=s.rules.find(r=>r.id===c.id);if(!r||!Number.isInteger(c.priority)||c.priority<0||c.priority>100)return result(false,'Priorität muss zwischen 0 und 100 liegen.');r.priority=c.priority;return result(true,'Priorität geändert.');}
 if(['toggleRule','deleteRule'].includes(c.type)){const r=s.rules.find(r=>r.id===c.id);if(!r)return result(false,'Regel fehlt.');if(c.type==='deleteRule')s.rules.splice(s.rules.indexOf(r),1);else r.enabled=!r.enabled;return result(true,c.type==='deleteRule'?'Regel entfernt.':'Regel umgeschaltet.');}
 return null;
}
function reason(r,text,api){if(r.lastReason!==text){r.lastReason=text;api.log('rule',text,[r.id]);}}
export function step(s,api){
 for(const r of s.research){if(r.status!=='active')continue;const lab=s.buildings.find(b=>b.id===r.building);if(!lab?.enabled){r.blocked='Labor pausiert';api.workforce.release(r.id);r.worker=null;continue;}const w=api.workforce.acquire('research',r.site,r.id);if(!w){r.blocked='Forschungspersonal oder Schicht fehlt';r.worker=null;continue;}r.worker=w.id;w.activity='Forschung';r.blocked=null;r.remaining=Math.max(0,r.remaining-Math.min(1.5,w.skill));if(!r.remaining){r.status='completed';r.completedAt=s.t;api.workforce.release(r.id);r.worker=null;api.log('research',RESEARCH[r.key].name+' abgeschlossen.',[r.id]);}}
 for(const r of [...s.rules].sort((a,b)=>(b.priority??50)-(a.priority??50))){if(!r.enabled)continue;
  if(r.lastRun!==null&&s.t-r.lastRun<r.cooldown){reason(r,'Regel wartet auf Sperrfrist.',api);continue;}
  let command,cost=0,description='';
  if(r.kind==='reorder'){
   if(api.inventory.available(r.item,r.site)>r.threshold){reason(r,'Bestand über Meldeschwelle.',api);continue;}
   if(s.purchases.some(p=>p.site===r.site&&p.item===r.item&&p.status!=='stored')){reason(r,'Offene Lieferung verhindert Doppelbestellung.',api);continue;}
   cost=ITEMS[r.item].price*r.qty;command={type:'buy',item:r.item,qty:r.qty,site:r.site,supplier:'standard'};description='Nachbestellung ausgelöst: '+r.qty+' × '+ITEMS[r.item].name;
  }else if(r.kind==='dispatch'){
   const vehicles=s.vehicles.filter(v=>v.site===r.site&&v.status==='idle'&&v.condition>=15).sort((a,b)=>VEHICLES[a.type].runningCost-VEHICLES[b.type].runningCost);let chosen;
   for(const order of s.orders.filter(o=>o.status==='active'&&o.site===r.site&&(!o.kind||['manufacturing','logistics'].includes(o.kind))).sort((a,b)=>a.due-b.due)){
    const remaining=order.qty-order.delivered-committedQty(s,order.id),available=api.inventory.available(order.item,r.site,order.kind==='logistics'?order.id:'company');
    for(const vehicle of vehicles){const item=ITEMS[order.item],spec=VEHICLES[vehicle.type];if(item.cold&&!spec.cold)continue;const qty=Math.floor(Math.min(remaining,available,r.qty??Infinity,vehicle.capacity/(item.volume||1),(spec.weightCapacity||spec.maxWeight||vehicle.capacity*4)/(item.weight||1)));if(qty>0){chosen={order,vehicle,qty};break;}}if(chosen)break;
   }
   if(!chosen){reason(r,'Keine versandbereite Ware, Restmenge oder freies Fahrzeug.',api);continue;}
   cost=Math.round(60*VEHICLES[chosen.vehicle.type].runningCost*100)/100;command={type:'dispatch',orderId:chosen.order.id,vehicleId:chosen.vehicle.id,qty:chosen.qty,site:r.site};description='Versand delegiert. Fahrtbudget verbindlich freigegeben.';
  }else if(r.kind==='maintenance'){
   const candidates=[...s.buildings.filter(b=>b.site===r.site&&BUILDINGS[b.type].recipes.length&&b.condition<=r.threshold&&!s.jobs.some(j=>j.building===b.id&&j.status==='maintenance')).map(b=>({id:b.id,condition:b.condition,type:'maintain',cost:120})),...s.vehicles.filter(v=>v.site===r.site&&v.status==='idle'&&v.condition<=r.threshold).map(v=>({id:v.id,condition:v.condition,type:'maintainVehicle',cost:Math.ceil((100-v.condition)*8)}))].sort((a,b)=>a.condition-b.condition);
   if(!candidates.length){reason(r,'Kein Wartungsbedarf unter Zustandsgrenze.',api);continue;}const candidate=candidates[0];cost=candidate.cost;command={type:candidate.type,id:candidate.id};description='Wartung delegiert.';
  }
  if(Math.round((r.spent+cost)*100)>Math.round(r.budget*100)){reason(r,'Regelbudget ausgeschöpft.',api);continue;}
  if(s.money<cost){reason(r,'Liquidität für delegierten Vorgang fehlt.',api);continue;}
  const out=api.command(command);if(out.ok){r.spent=Math.round((r.spent+cost)*100)/100;r.lastRun=s.t;r.purchase=out.id??null;reason(r,description,api);}else reason(r,'Delegation blockiert: '+out.message,api);
 }

}
export function validate(s){const bad=m=>{throw new Error('Spielstand ungültig: '+m);};const keys=new Set();for(const r of s.research){if(!RESEARCH[r.key]||keys.has(r.key)||!['active','completed'].includes(r.status)||!Number.isFinite(r.remaining)||r.remaining<0||!Number.isFinite(r.duration)||r.duration<=0||r.remaining>r.duration||!s.sites.some(a=>a.id===r.site))bad('Forschung beschädigt.');keys.add(r.key);if(r.status==='active'&&!s.buildings.some(b=>b.id===r.building&&b.type==='research'&&b.site===r.site))bad('Aktives Forschungslabor fehlt.');if(r.status==='completed'&&r.remaining!==0)bad('Forschungsabschluss widersprüchlich.');}
 const rules=new Set();for(const r of s.rules){const key=ruleKey(r);if(rules.has(key)||!validRule(s,r)||!Number.isFinite(r.spent)||r.spent<0||r.spent>r.budget||typeof r.enabled!=='boolean'||(r.lastRun!==null&&(!Number.isFinite(r.lastRun)||r.lastRun>s.t)))bad('Delegationsregel beschädigt.');rules.add(key);}}
function ruleKey(r){return r.site+':'+r.kind+':'+(r.kind==='reorder'?r.item:'');}
function validRule(s,r){if(!['reorder','dispatch','maintenance'].includes(r.kind)||!s.sites.some(a=>a.id===r.site)||!Number.isFinite(r.budget)||r.budget<=0||!Number.isInteger(r.cooldown)||r.cooldown<1||!Number.isInteger(r.priority??50)||(r.priority??50)<0||(r.priority??50)>100)return false;
 if(r.kind==='reorder')return !!ITEMS[r.item]?.purchasable&&Number.isInteger(r.threshold)&&r.threshold>=0&&Number.isInteger(r.qty)&&r.qty>=1&&r.qty<=1000;
 if(r.kind==='maintenance')return Number.isFinite(r.threshold)&&r.threshold>=1&&r.threshold<100;
 return r.qty==null||(Number.isInteger(r.qty)&&r.qty>=1&&r.qty<=1000);
}
