// Gemeinsamer Zugriff auf ein vorhandenes Playwright (lokal oder global installiert).
// Installiert nichts und lädt keine Browser herunter.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

function candidates(){
 const list=[process.cwd()+'/'];
 if(process.env.NODE_PATH)list.push(...process.env.NODE_PATH.split(':').filter(Boolean).map(p=>p+'/'));
 try{list.push(execFileSync('npm',['root','-g'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()+'/');}catch{}
 return list;
}

/** Liefert {chromium, launchOptions} oder null, falls Playwright fehlt. */
export function loadPlaywright(){
 for(const base of candidates()){
  try{
   const {chromium}=createRequire(base)('playwright');
   // Software-WebGL für Headless-Betrieb ohne GPU.
   const launchOptions={args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']};
   // Bevorzugt die vollständige Chromium-Binärdatei, nicht die Headless-Shell.
   const root=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';
   for(const path of [process.env.CHROMIUM_PATH,join(root,'chromium')].filter(Boolean))if(existsSync(path)){launchOptions.executablePath=path;break;}
   return {chromium,launchOptions};
  }catch{}
 }
 return null;
}
