/** Deterministic fictional locations. Distance units equal kilometres. */
const LOCATIONS=[{x:0,y:0},{x:44,y:18},{x:-36,y:52},{x:78,y:-31},{x:-62,y:-44},{x:21,y:96},{x:108,y:56},{x:-102,y:13}];
export function init(s){s.transfers??=[];}
export function handle(s,c,api){
 if(c.type!=='buySite')return null;
 if(s.sites.length>=8)return {ok:false,message:'Höchstens acht Standorte möglich.'};
 if(s.mode!=='sandbox'&&!s.research.some(r=>r.key==='network'&&r.status==='completed'))return {ok:false,message:'Forschung Standortnetz zuerst abschließen.'};
 const name=typeof c.name==='string'?c.name.trim():'';if(name.length<2||name.length>48||/[<>\x00-\x1F]/.test(name))return {ok:false,message:'Standortname benötigt 2 bis 48 normale Zeichen.'};
 if(s.sites.some(a=>a.name.toLocaleLowerCase('de')===name.toLocaleLowerCase('de')))return {ok:false,message:'Standortname bereits vergeben.'};
 const index=s.sites.length,id=api.id('site');if(!api.book('site:'+id,-25000,'Standort','Erwerb '+name,[id]))return {ok:false,message:'25.000 € für neuen Standort benötigt.'};
 s.sites.push({id,name,...LOCATIONS[index],width:20,height:16,energy:30});api.log('network',name+' erworben. Neue Halle benötigt Anlagen, Personal und Material.',[id]);return {ok:true,id,message:'Standort erworben.'};
}
export function step(){}
export function validate(s){if(s.sites.length>8)throw new Error('Spielstand ungültig: Mehr als acht Standorte.');const names=new Set();for(const site of s.sites){if(typeof site.name!=='string'||site.name.length<2||site.name.length>48||names.has(site.name.toLocaleLowerCase('de')))throw new Error('Spielstand ungültig: Standortname beschädigt.');names.add(site.name.toLocaleLowerCase('de'));}}
