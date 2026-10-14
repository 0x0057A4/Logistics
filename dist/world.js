import { BUILDINGS } from './catalog.js';
export function footprint(b){const d=BUILDINGS[b.type];if(!d)return null;return b.rotation%180?{w:d.h||1,h:d.w||1}:{w:d.w||1,h:d.h||1};}
export function reachable(s,siteId,buildings=s.buildings,checkPower=true){
 const site=s.sites.find(x=>x.id===siteId);if(!site)return {ok:false,message:'Standort fehlt.'};
 const occupied=new Set();const list=buildings.filter(b=>b.site===siteId);
 for(const b of list){const f=footprint(b);if(!f||!Number.isInteger(b.x)||!Number.isInteger(b.y)||b.x<0||b.y<0||b.x+f.w>site.width||b.y+f.h>site.height)return {ok:false,message:'Gebäude außerhalb der Halle.'};
 for(let x=b.x;x<b.x+f.w;x++)for(let y=b.y;y<b.y+f.h;y++){const key=x+','+y;if(occupied.has(key))return {ok:false,message:'Fläche bereits belegt.'};occupied.add(key);}}
 const gate=[0,Math.min(8,site.height-1)], first=gate.join(',');if(occupied.has(first))return {ok:false,message:'Tor muss frei bleiben.'};
 const visited=new Set([first]),q=[gate],dist=new Map([[first,0]]);
 for(let i=0;i<q.length;i++){const [x,y]=q[i];for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=nx+','+ny;if(nx<0||ny<0||nx>=site.width||ny>=site.height||occupied.has(k)||visited.has(k))continue;visited.add(k);dist.set(k,dist.get(x+','+y)+1);q.push([nx,ny]);}}
 const distances={};for(const b of list){const f=footprint(b);let nearest=Infinity;for(let x=b.x-1;x<=b.x+f.w;x++)for(let y=b.y-1;y<=b.y+f.h;y++){const sideX=x===b.x-1||x===b.x+f.w,sideY=y===b.y-1||y===b.y+f.h;if(sideX===sideY)continue;const d=dist.get(x+','+y);if(d!==undefined)nearest=Math.min(nearest,d);}
 if(!Number.isFinite(nearest))return {ok:false,message:'Transportweg würde blockiert.'};distances[b.id]=nearest;}
 const power=list.filter(b=>b.enabled!==false).reduce((a,b)=>a+Math.max(0,BUILDINGS[b.type].power||0),0);
 const supply=site.energy+list.filter(b=>b.enabled!==false).reduce((a,b)=>a+(BUILDINGS[b.type].energy||0),0);
 if(checkPower&&power>supply)return {ok:false,message:'Stromanschluss zu schwach.'};return {ok:true,distances,power};
}
