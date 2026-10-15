// Gemeinsame Hilfen der Browserprüfungen: isolierte Auslieferung, statischer Server, Fehlersammlung.
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';

export const repo=new URL('../../',import.meta.url).pathname;

/** Wie scripts/package.py: Root-index.html = dist/index.html mit <base href="./dist/"> und frisches dist/portable.html.
 * Standard: tmp-Kopie, damit das Repository unverändert bleibt. useRepo=true liefert den Repo-Root direkt aus. */
export function prepareRoot(useRepo=false){
 if(useRepo)return {root:repo,cleanup(){}};
 const root=mkdtempSync(join(tmpdir(),'logistics-browser-'));
 cpSync(join(repo,'dist'),join(root,'dist'),{recursive:true,filter:p=>!p.endsWith('.zip')});
 execFileSync('python3',['-c',"import runpy,sys; from pathlib import Path; runpy.run_path(sys.argv[2]+'/scripts/build-portable.py')['build'](Path(sys.argv[1]))",root,repo],{stdio:'pipe'});
 writeFileSync(join(root,'index.html'),readFileSync(join(root,'dist/index.html'),'utf8').replace('<head>','<head><base href="./dist/">'));
 return {root,cleanup(){rmSync(root,{recursive:true,force:true});}};
}

const freePort=()=>new Promise((resolve,reject)=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});s.on('error',reject);});

/** python3 -m http.server auf freiem Port; liefert {server,url}. */
export async function startServer(root){
 const port=await freePort();
 const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
 for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${port}/index.html`);if(r.ok)return {server,url:`http://127.0.0.1:${port}/`};}catch{}await new Promise(r=>setTimeout(r,100));}
 server.kill();throw Error('Statischer Server startet nicht.');
}

/** Sammelt Seitenfehler, Konsolenfehler, fehlgeschlagene Requests und HTTP-Fehler. */
export function watch(page,errors,label){
 page.on('pageerror',e=>errors.push(label+' pageerror: '+e.message));
 // Chromium fragt /favicon.ico selbst an (kein Seitenrequest, kein Spielfehler); nur diese 404 wird ignoriert.
 page.on('console',m=>{if(m.type()!=='error')return;if(/favicon\.ico$/.test(m.location()?.url||''))return;errors.push(label+' console: '+m.text()+' @ '+(m.location()?.url||'?'));});
 page.on('requestfailed',r=>errors.push(label+' request: '+r.url()+' '+(r.failure()?.errorText||'')));
 page.on('response',r=>{if(r.status()>=400)errors.push(label+' HTTP '+r.status()+': '+r.url());});
}
