/** Spielstand als passive JSON-Daten einbetten, niemals als ausführbaren Code. */
export function injectPortableSave(template, serializedSave, prefs={}) {
 const state=JSON.parse(serializedSave);
 const encode=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
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
