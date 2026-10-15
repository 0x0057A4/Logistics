const encode=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');

/** Platzhalter der unveränderten Vorlage (QS-W0-01). Gleiche Werte in scripts/build-portable.py. */
export const TEMPLATE_MARKS=Object.freeze({style:'@@PORTABLE-STYLE@@',runtime:'@@PORTABLE-RUNTIME@@',template:'@@PORTABLE-TEMPLATE@@'});

/** Spielstand als passive JSON-Daten einbetten, niemals als ausführbaren Code. */
export function injectPortableSave(template, serializedSave, prefs={}) {
 const state=JSON.parse(serializedSave);
 let html=template;
 for(const [id,value] of [['embedded-save',state],['embedded-prefs',prefs]]) {
  const pattern=new RegExp('(<script id="'+id+'" type="application/json">)[\\s\\S]*?(</script>)');
  if(!pattern.test(html))throw Error('HTML-Vorlage unvollständig. Bitte Seite neu laden.');
  html=html.replace(pattern,(_,start,end)=>start+encode(value)+end);
 }
 // Ein beim Export offener Dialog darf die neue Sitzung nicht blockieren.
 html=html.replace(/(<dialog\b[^>]*?)\sopen(?:="[^"]*")?/gi,'$1');
 return html;
}

/**
 * Unveränderte Vorlage einer HTML-Datei wiederherstellen (QS-W0-01), statt das laufende Dokument zu serialisieren.
 * shell: Dokument beim Build mit Platzhaltern statt Stylesheet, Laufzeitcode und eigenem Vorlagenslot.
 * style/runtime: Rohtext von #portable-style und #portable-runtime. Laufzeit-DOM (HUD-Zeilen, 3D-Beschriftung) fließt nie ein.
 * Ein einziger Ersetzungsdurchlauf über die Schale: eingesetzter Text wird nicht erneut durchsucht.
 */
export function portableTemplate(shell, style, runtime) {
 if(typeof shell!=='string'||typeof style!=='string'||typeof runtime!=='string')throw Error('HTML-Vorlage unvollständig.');
 const parts={[TEMPLATE_MARKS.style]:style,[TEMPLATE_MARKS.runtime]:runtime,[TEMPLATE_MARKS.template]:encode(shell)};
 for(const mark of Object.keys(parts))if(shell.split(mark).length!==2)throw Error('HTML-Vorlage unvollständig.');
 return shell.replace(/@@PORTABLE-(?:STYLE|RUNTIME|TEMPLATE)@@/g,mark=>parts[mark]);
}
