// 0.17 (A06/A10-P, docs/SCHNITTSTELLEN-0.17-UI.md, Nutzerabschnitt 10): Personal- und Belegungsplan.
// Reine Lesesicht auf den Spielstand: keine Befehle, keine Zustandsänderung. Schichtzeiten stammen ausschließlich aus
// workforce.onShift (gleiche Regel wie die Simulation), aktuelle Tätigkeit aus describeAssignment und den Aufgabenschlüsseln.
// Grenzen (ehrlich benannt): Die Simulation führt kein Protokoll vergangener Pausen/Tätigkeiten und keine geplanten Pausen.
// Pausen, Fortbildungen und Standortwechsel erscheinen daher nur für den laufenden Spieltag ab „jetzt“ mit ihrer Restdauer.
import {ROLES,BUILDINGS} from './catalog.js';
import {onShift,describeAssignment} from './workforce.js';

export const DAY=1440;
/** Schichtarten wie workforce.onShift: fehlende/unbekannte Schicht zählt dort als Tagschicht. */
export const SHIFT_TEXT={day:'Tagschicht 08–16 Uhr',night:'Nachtschicht 16–08 Uhr (über Mitternacht)',all:'Durchgehend 00–24 Uhr'};
export const SHIFT_SHORT={day:'Tag',night:'Nacht',all:'Durchgehend'};
export const ACTIVITY_TEXT={work:'Im Einsatz',idle:'Im Dienst · nicht zugeordnet',break:'Erholungspause',training:'Fortbildung',relocation:'Standortwechsel',off:'Nicht im Dienst'};
/** Rollen, die Lkw-Ankünfte entladen können (yard.js: Lagerkraft, für Paletten auch Staplerfahrer). */
export const UNLOAD_ROLES=['warehouse','forklift'];
export const shiftKey=w=>w?.shift==='night'||w?.shift==='all'?w.shift:'day';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hhmm=m=>{m=((Math.round(m)%DAY)+DAY)%DAY;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;};
const pct=m=>Math.round(m/DAY*10000)/100;

const segCache=new Map();
/**
 * Geplante Schichtabschnitte eines Spieltags (Minuten relativ zum Tagesbeginn, [from,to)). Aus onShift Minute für Minute
 * abgeleitet, daher exakt gleich der Simulation. Schichten über Mitternacht werden am Tagesrand geteilt:
 * fromPrev = Abschnitt beginnt bereits am Vortag, toNext = Abschnitt läuft in den Folgetag weiter.
 */
export function shiftSegments(w,day){
 const key=shiftKey(w);if(segCache.has(key))return segCache.get(key).map(x=>({...x}));
 const probe={shift:key},start=day*DAY,out=[];let from=null;
 for(let m=0;m<=DAY;m++){const on=m<DAY&&onShift(probe,start+m);if(on&&from===null)from=m;if(!on&&from!==null){out.push({from,to:m});from=null;}}
 for(const seg of out){seg.fromPrev=seg.from===0&&onShift(probe,start-1);seg.toNext=seg.to===DAY&&onShift(probe,start+DAY);}
 // Schichtregel hängt nur von der Uhrzeit ab (t % 1440), daher je Schichtart einmal berechnen.
 segCache.set(key,out);return out.map(x=>({...x}));
}
/** Ende eines Restzählers ab Minute t: countShift → zählt nur Schichtminuten (wie Pause/Fortbildung in workforce.step). */
function remainingEnd(w,t,rest,countShift){
 if(!(rest>0))return t;if(!countShift)return t+Math.ceil(rest);
 let left=Math.ceil(rest),m=t;for(let i=0;i<3*DAY&&left>0;i++,m++)if(onShift(w,m))left--;return m;
}
const nameCache=new WeakMap();
/** Anlagenname: eigener Name (b.label, 0.17 Umbenennen) oder Typname mit laufender Nummer am Standort. */
export function buildingName(s,b){
 if(!b)return '';if(typeof b.label==='string'&&b.label.trim())return b.label.trim();
 let idx=nameCache.get(s.buildings);if(!idx){idx=new Map();const count={};for(const x of s.buildings){const k=x.site+'|'+x.type;count[k]=(count[k]||0)+1;idx.set(x.id,count[k]);}nameCache.set(s.buildings,idx);}
 return `${BUILDINGS[b.type]?.name||b.type} ${idx.get(b.id)||''}`.trim();
}
/** Arbeitsplatz der aktuellen Bindung (gleiche Zuordnung wie die Figuren in scene3d.workerSpots). */
export function workplace(s,w,nameOf=buildingName){
 const task=typeof w?.task==='string'?w.task:null;if(!task)return null;
 const i=task.lastIndexOf(':'),plain=task.replace(/:(warehouse|driver|technician|service|gate|sort|forklift|loading|documents)$/,'');
 if(task.endsWith(':warehouse')||task.endsWith(':gate')){const a=(s.yard||[]).find(x=>x.id===plain);if(a){const dock=a.dock&&s.buildings.find(b=>b.id===a.dock);return {buildingId:dock?.id||null,text:dock?`${nameOf(s,dock)} · Lkw ${a.plate}`:`Hof · Lkw ${a.plate}`};}}
 if(task.endsWith(':sort')){const b=s.buildings.find(x=>x.id===task.slice(0,i));if(b)return {buildingId:b.id,text:nameOf(s,b)};}
 if(task.endsWith(':handsort')){const site=s.sites.find(x=>x.id===task.slice(0,i));return {buildingId:null,text:`Handsortierung ${site?.name||''}`.trim()};}
 const job=(s.jobs||[]).find(j=>j.id===task||j.worker===w.id)||(s.research||[]).find(j=>j.id===task||j.worker===w.id);
 const b=s.buildings.find(b=>b.id===job?.building||b.id===task||b.task===plain||b.maintenanceTask===task||b.serviceJob===plain);
 if(b)return {buildingId:b.id,text:nameOf(s,b)};
 if(task.endsWith(':driver')){const v=(s.vehicles||[]).find(v=>v.shipment===plain||v.tour===plain||v.linehaul===plain);if(v)return {buildingId:null,text:`Fahrzeug ${v.name||v.id}`};}
 return null;
}
/** Tätigkeitsklasse für Filter und Farbe. */
export function activityOf(s,w,assign=null){
 const d=(assign||describeAssignment)(s,w);const kind=d?.kind;
 const cls=kind==='relocation'?'relocation':kind==='training'?'training':kind==='break'?'break':kind==='off'?'off':kind==='idle'?'idle':'work';
 return {cls,text:cls==='idle'?'Bereit · nicht zugeordnet':cls==='off'?'Nicht im Dienst (laut Schicht)':d?.text||ACTIVITY_TEXT[cls],kind};
}
/**
 * Zeilen des Belegungsplans. day = Spieltag (floor(t/1440)). Filter: site ('all' | Standort-ID), role, act (Tätigkeitsklasse),
 * shift, q (Suchtext). Markierungen (Pause, Fortbildung, Standortwechsel) nur am laufenden Spieltag, ab jetzt mit Restdauer.
 */
export function scheduleRows(s,day,filter={},nameOf=buildingName,assign=null){
 const today=Math.floor(s.t/DAY),now=s.t-day*DAY,q=String(filter.q||'').trim().toLowerCase(),rows=[];
 for(const w of s.workers||[]){
  const site=s.sites.find(x=>x.id===w.site),act=activityOf(s,w,assign),key=shiftKey(w);
  if(filter.site&&filter.site!=='all'&&w.site!==filter.site&&w.relocation?.toSite!==filter.site)continue;
  if(filter.role&&filter.role!=='all'&&w.role!==filter.role)continue;
  if(filter.shift&&filter.shift!=='*'&&key!==filter.shift)continue;
  if(filter.act&&filter.act!=='all'&&act.cls!==filter.act)continue;
  const place=act.cls==='work'?workplace(s,w,nameOf):null;
  const roleName=ROLES[w.role]?.name||w.role;
  if(q&&![w.name,w.id,roleName,site?.name,act.text,place?.text].some(x=>String(x||'').toLowerCase().includes(q)))continue;
  const marks=[];
  if(day===today){
   if(w.relocation)marks.push({kind:'relocation',from:now,to:Math.min(DAY,remainingEnd(w,s.t,w.relocation.remaining,false)-day*DAY),text:`Standortwechsel nach ${s.sites.find(x=>x.id===w.relocation.toSite)?.name||w.relocation.toSite}, noch ${Math.ceil(w.relocation.remaining)} Min.`});
   else if(w.breakRemaining>0)marks.push({kind:'break',from:now,to:Math.min(DAY,remainingEnd(w,s.t,w.breakRemaining,true)-day*DAY),text:`Erholungspause, noch ${Math.ceil(w.breakRemaining)} Schichtminuten`});
   else if(w.training)marks.push({kind:'training',from:now,to:Math.min(DAY,remainingEnd(w,s.t,w.training.remaining,true)-day*DAY),text:`Fortbildung, noch ${Math.ceil(w.training.remaining)} Schichtminuten`});
  }
  rows.push({id:w.id,name:w.name||w.id,role:w.role,roleName,site:w.site,siteName:site?.name||w.site,shift:key,shiftText:SHIFT_TEXT[key],
   segments:shiftSegments(w,day),marks,activity:act,place,planned:day===today?onShift(w,s.t):null});
 }
 return rows.sort((a,b)=>a.siteName.localeCompare(b.siteName,'de')||a.roleName.localeCompare(b.roleName,'de')||a.name.localeCompare(b.name,'de'));
}
/**
 * Unbesetzte Zeiträume, soweit aus Daten ableitbar: geplante Lkw-Ankünfte aktiver Frachtverträge (contracts.arrivals, Standort
 * c.site, Laufzeit startT…endT) ohne Lagerkraft/Staplerfahrer im Dienst am Ankunftsstandort zur Ankunftsminute.
 * Wetterverspätungen sind nicht enthalten (Plan-Ankunft). Liefert [{site,siteName,minute,contractId,shipper,units}].
 */
export function coverageGaps(s,day,site='all'){
 const out=[];
 for(const c of s.contracts||[]){
  if(c.status!=='active'||!Array.isArray(c.arrivals)||(site!=='all'&&c.site!==site))continue;
  const crew=(s.workers||[]).filter(w=>w.site===c.site&&UNLOAD_ROLES.includes(w.role));
  for(const a of c.arrivals){
   const t=day*DAY+a.minute;if(!Number.isFinite(a.minute)||(Number.isFinite(c.startT)&&t<c.startT)||(Number.isFinite(c.endT)&&t>=c.endT))continue;
   if(crew.some(w=>onShift(w,t)))continue;
   out.push({site:c.site,siteName:s.sites.find(x=>x.id===c.site)?.name||c.site,minute:a.minute,contractId:c.id,shipper:c.shipper,units:a.parcels});
  }
 }
 return out.sort((a,b)=>a.minute-b.minute);
}

/* ---------------- Darstellung ---------------- */
/** Ansichtszustand (nicht im Spielstand). dayOffset: −1 Vortag, 0 heute, +1 Folgetag (reine Ansicht, kein Zeitsprung). */
export const scheduleView={dayOffset:0,site:null,role:'all',act:'all',shift:'*',q:''};
const ACT_ORDER=['work','idle','break','training','relocation','off'];
const opt=(v,t,cur)=>`<option value="${esc(v)}"${String(cur)===String(v)?' selected':''}>${esc(t)}</option>`;
function axis(){let h='';for(let x=0;x<=24;x+=2)h+=`<span class="sched-hour" style="left:${pct(x*60)}%">${String(x).padStart(2,'0')}</span>`;return h;}
function grid(){let h='';for(let x=2;x<24;x+=2)h+=`<span class="sched-grid" style="left:${pct(x*60)}%"></span>`;return h;}
function barHtml(seg,row){
 const cls=`sched-bar shift-${row.shift}${seg.fromPrev?' from-prev':''}${seg.toNext?' to-next':''}`;
 const night=row.shift==='night',title=`Geplante Schicht ${hhmm(seg.from)}–${seg.to===DAY?'24:00':hhmm(seg.to)}${seg.fromPrev?night?' · beginnt am Vortag 16:00':' · durchgehend seit Vortag':''}${seg.toNext?night?' · läuft bis 08:00 Folgetag':' · läuft im Folgetag weiter':''}`;
 return `<span class="${cls}" style="left:${pct(seg.from)}%;width:${pct(seg.to-seg.from)}%" title="${esc(title)}">${seg.fromPrev?'<i aria-hidden="true">◂</i>':''}${seg.toNext?'<i class="r" aria-hidden="true">▸</i>':''}</span>`;
}
/**
 * HTML des Belegungsplans. opts: {nameOf(s,b)} für Anlagennamen, {assign(s,w)} Tätigkeitstext (Standard describeAssignment). Klick auf eine Person: data-sched-worker,
 * Positionsfokus data-sched-focus (Anlage), Tagwahl data-sched-day, Filter data-sched-filter, Suche data-sched-search.
 */
export function renderSchedule(s,view=scheduleView,opts={}){
 const today=Math.floor(s.t/DAY),day=Math.max(0,today+(view.dayOffset||0)),site=view.site||s.selectedSite||'all';
 const filter={site,role:view.role,act:view.act,shift:view.shift,q:view.q};
 const rows=scheduleRows(s,day,filter,opts.nameOf||buildingName,opts.assign||null),all=(s.workers||[]).length;
 const gaps=coverageGaps(s,day,site),nowPct=day===today?pct(s.t-day*DAY):null;
 const onNow=day===today?rows.filter(r=>r.planned).length:null,working=rows.filter(r=>r.activity.cls==='work').length;
 const dayBtn=(o,t)=>`<button type="button" class="${(view.dayOffset||0)===o?'active':''}" aria-pressed="${(view.dayOffset||0)===o}" data-sched-day="${o}"${today+o<0?' disabled':''}>${t}</button>`;
 const roles=[...new Set((s.workers||[]).map(w=>w.role))];
 const tools=`<div class="sched-tools" role="group" aria-label="Belegungsplan filtern">
<div class="segmented sched-days">${dayBtn(-1,'Vortag')}${dayBtn(0,'Heute')}${dayBtn(1,'Folgetag')}</div>
<label>Standort<select data-sched-filter="site">${opt('all','Alle Standorte',site)}${s.sites.map(x=>opt(x.id,x.name||x.id,site)).join('')}</select></label>
<label>Rolle<select data-sched-filter="role">${opt('all','Alle Rollen',view.role)}${roles.map(r=>opt(r,ROLES[r]?.name||r,view.role)).join('')}</select></label>
<label>Tätigkeit<select data-sched-filter="act">${opt('all','Alle Tätigkeiten',view.act)}${ACT_ORDER.map(k=>opt(k,ACTIVITY_TEXT[k],view.act)).join('')}</select></label>
<label>Schicht<select data-sched-filter="shift">${opt('*','Alle Schichten',view.shift)}${Object.keys(SHIFT_TEXT).map(k=>opt(k,SHIFT_SHORT[k],view.shift)).join('')}</select></label>
<label class="sched-q">Suche<input type="search" id="schedSearch" data-sched-search value="${esc(view.q||'')}" placeholder="Name, Anlage …" autocomplete="off"></label></div>`;
 const head=`<div class="sched-summary"><b>Spieltag ${day+1}</b>${day===today?` · jetzt ${hhmm(s.t)} · ${onNow} von ${rows.length} laut Schicht im Dienst · ${working} im Einsatz`:day<today?' · Schichtplan nach aktueller Einstellung (vergangene Tätigkeiten werden nicht protokolliert)':' · Schichtplan nach aktueller Einstellung'}</div>`;
 const legend=`<div class="sched-legend" aria-label="Legende"><span><i class="lg shift-day"></i>Geplante Schicht</span><span><i class="lg break"></i>Pause</span><span><i class="lg training"></i>Fortbildung</span><span><i class="lg relocation"></i>Standortwechsel</span>${nowPct!=null?'<span><i class="lg now"></i>Jetzt</span>':''}<span>◂ ▸ Schicht über Mitternacht</span></div>`;
 const gapHtml=gaps.length?`<div class="notice warn sched-gaps" role="note"><b>⚠ Unbesetzt laut Ankunftsplan:</b> ${gaps.map(g=>`${hhmm(g.minute)} ${esc(g.shipper||g.contractId)} (${esc(g.siteName)}, ${g.units} Einheiten)`).join(' · ')} – keine Lagerkraft oder Staplerfahrer im Dienst. Entladung wartet bis Schichtbeginn.</div>`:'';
 const body=rows.map(r=>{
  const act=r.activity,place=r.place,focus=place?.buildingId&&s.buildings.find(b=>b.id===place.buildingId)?.site===s.selectedSite?place.buildingId:null;
  const planText=r.planned==null?'':r.planned?'Plan: im Dienst':'Plan: frei';
  const ist=`Ist: ${act.text}${place?` · ${place.text}`:act.cls==='work'?' · Arbeitsplatz nicht zugeordnet':''}`;
  const mismatch=r.planned===true&&act.cls==='idle'||r.planned===false&&act.cls==='relocation';
  return `<div class="sched-row act-${act.cls}" data-worker-row="${esc(r.id)}">
<button type="button" class="sched-who" data-sched-worker="${esc(r.id)}" title="Mitarbeiterakte öffnen"><strong>${esc(r.name)}</strong><small>${esc(r.roleName)} · ${esc(r.siteName)} · ${esc(SHIFT_SHORT[r.shift])}</small><small class="sched-ist${mismatch?' warn':''}" title="${esc(ist)}">${planText?esc(planText)+' · ':''}${esc(ist)}</small></button>
<div class="sched-track" aria-label="${esc(`${r.name}: ${r.shiftText}`)}">${grid()}${r.segments.map(seg=>barHtml(seg,r)).join('')}${r.marks.map(m=>`<span class="sched-mark ${m.kind}" style="left:${pct(m.from)}%;width:${Math.max(.6,pct(Math.max(0,m.to-m.from)))}%" title="${esc(m.text)}"></span>`).join('')}${nowPct!=null?`<span class="sched-now" style="left:${nowPct}%"></span><span class="sched-now-dot act-${act.cls}" style="left:${nowPct}%" title="${esc(ist)}"></span>`:''}</div>
${focus?`<button type="button" class="ref-link sched-focus" data-sched-focus="${esc(focus)}" title="Arbeitsplatz in der Spielwelt zeigen">Position</button>`:'<span class="sched-focus none" title="Keine Position in der Spielwelt (nicht zugeordnet oder anderer Standort)">—</span>'}</div>`;}).join('');
 const empty=all?'<div class="empty"><strong>Keine Beschäftigten für diese Filter</strong>Filter zurücksetzen oder anderen Standort wählen.</div>':'<div class="empty"><strong>Nicht geplant</strong>Noch keine Beschäftigten. Unten Personal einstellen.</div>';
 return `<section class="section sched" aria-label="Personal- und Belegungsplan"><h3>Belegungsplan</h3>${tools}${head}${legend}${gapHtml}
<div class="sched-table" role="table"><div class="sched-axis"><span class="sched-axis-label">Person · Ist-Tätigkeit</span><div class="sched-track sched-scale">${axis()}${nowPct!=null?`<span class="sched-now" style="left:${nowPct}%" title="Simulationszeit ${hhmm(s.t)}"></span>`:''}</div><span></span></div>
${rows.length?`<div class="sched-rows">${body}</div>`:empty}</div>
<p class="fine">Balken = geplante Arbeitszeit aus der Schichteinstellung (Tag 08–16, Nacht 16–08, durchgehend). Punkt auf der Zeitlinie = tatsächliche Tätigkeit jetzt. Pausen entstehen bei Müdigkeit ab 80 % (30 Schichtminuten) und sind nicht im Voraus geplant; Pause, Fortbildung und Standortwechsel werden ab jetzt mit Restdauer gezeigt. Vergangene Tätigkeiten speichert die Simulation nicht.</p></section>`;
}
/** Ereignisverarbeitung für app.js. Rückgabe: true = neu zeichnen. Ändert nur den Ansichtszustand. */
export function scheduleChange(el,view=scheduleView){
 const f=el?.dataset?.schedFilter;if(f&&['site','role','act','shift'].includes(f)){view[f]=el.value;return true;}return false;
}
export function scheduleInput(el,view=scheduleView){if(el?.dataset&&'schedSearch' in el.dataset){view.q=String(el.value||'').slice(0,60);return true;}return false;}
export function scheduleClick(el,view=scheduleView){
 const d=el?.dataset?.schedDay;if(d!==undefined){const n=Number(d);if([-1,0,1].includes(n)){view.dayOffset=n;return {render:true};}}
 if(el?.dataset?.schedWorker)return {worker:el.dataset.schedWorker};
 if(el?.dataset?.schedFocus)return {focus:el.dataset.schedFocus};
 return null;
}
