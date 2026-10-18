export const ITEMS={
 housing:{name:'Leuchtengehäuse',price:18,volume:1,weight:2},board:{name:'LED-Platine',price:24,volume:1,weight:1},carton:{name:'Versandkarton',price:3,volume:1,weight:1},
 lamp_raw:{name:'Montierte Arbeitsleuchte',price:52,volume:1,weight:3},lamp_tested:{name:'Geprüfte Arbeitsleuchte',price:62,volume:1,weight:3},lamp:{name:'Verpackte Arbeitsleuchte',price:95,volume:1,weight:4}
};
export const RECIPES={
 assemble:{name:'Leuchte montieren',building:'assembly',inputs:{housing:1,board:1},output:{item:'lamp_raw',qty:1},duration:6,role:'production'},
 test:{name:'Elektrische Prüfung',building:'testing',inputs:{lamp_raw:1},output:{item:'lamp_tested',qty:1},duration:4,role:'production'},
 pack:{name:'Leuchte verpacken',building:'packing',inputs:{lamp_tested:1,carton:1},output:{item:'lamp',qty:1},duration:3,role:'production'}
};
export const BUILDINGS={
 assembly:{name:'Montageplatz',cost:6500,w:2,h:2,color:'#55bdca',role:'production',recipes:['assemble'],power:4},
 testing:{name:'Prüfstation',cost:4500,w:2,h:2,color:'#ac90ed',role:'production',recipes:['test'],power:3},
 packing:{name:'Packstation',cost:2800,w:2,h:2,color:'#e7b55e',role:'production',recipes:['pack'],power:2},
 rack:{name:'Lagerregal',cost:1200,w:2,h:1,color:'#7ea4b6',role:'warehouse',recipes:[],power:0,capacity:80},
 dock:{name:'Laderampe',cost:3500,w:3,h:2,color:'#dc9977',role:'warehouse',recipes:[],power:1},
 power:{name:'Energieversorgung',cost:7000,w:2,h:2,color:'#eed76e',role:'technician',recipes:[],power:0,energy:40},
 workshop:{name:'Wartungswerkstatt',cost:4800,w:2,h:2,color:'#d3a2ab',role:'technician',recipes:[],power:2},
 research:{name:'Entwicklungslabor',cost:12000,w:3,h:2,color:'#90d5af',role:'research',recipes:[],power:4},
 coldstore:{name:'Kühllager',cost:9500,w:3,h:2,color:'#8ed6e1',role:'warehouse',recipes:[],power:8,capacity:100},
 terminal:{name:'Logistikterminal',cost:14000,w:3,h:2,color:'#bdadf0',role:'service',recipes:[],power:3}
};
export const ROLES={production:{name:'Fertigung',wage:19,hireCost:400},warehouse:{name:'Lager',wage:18,hireCost:350},driver:{name:'Fahrdienst',wage:21,hireCost:450},technician:{name:'Technik',wage:26,hireCost:650},service:{name:'Kundenservice',wage:22,hireCost:450},forklift:{name:'Staplerfahrer',wage:20,hireCost:400},gate:{name:'Torposten',wage:17,hireCost:300},research:{name:'Entwicklung',wage:30,hireCost:800}};
export const VEHICLES={van:{name:'Lieferwagen',cost:9000,capacity:20,speed:1,runningCost:0.18},truck:{name:'Lastkraftwagen',cost:28000,capacity:80,speed:0.85,runningCost:0.4},refrigerated:{name:'Kühlfahrzeug',cost:36000,capacity:50,speed:0.9,runningCost:0.5,cold:true}};
export const RESEARCH={efficiency:{name:'Effiziente Fertigung',cost:5000,duration:120},quality:{name:'Qualitätssicherung',cost:6500,duration:180},network:{name:'Standortnetz',cost:12000,duration:240},coldchain:{name:'Kühlkettenlogistik',cost:9000,duration:180}};
// Erweiterte Produktfamilien; Basisrezepte bleiben spielstandstabil.
Object.assign(ITEMS,{
 spare:{name:'Wartungsersatzteil',price:35,volume:1,weight:1},
 sensor_body:{name:'Sensorgehäuse',price:15,volume:1,weight:1},chip:{name:'Messchip',price:28,volume:1,weight:1},
 lamp_pro_raw:{name:'Montierte Profilleuchte',price:76,volume:1,weight:4},lamp_pro_tested:{name:'Geprüfte Profilleuchte',price:91,volume:1,weight:4},lamp_pro:{name:'Verpackte Profilleuchte',price:145,volume:1,weight:5},
 sensor_raw:{name:'Montierter Industriesensor',price:49,volume:1,weight:2},sensor_tested:{name:'Geprüfter Industriesensor',price:60,volume:1,weight:2},sensor:{name:'Verpackter Industriesensor',price:110,volume:1,weight:3}
});
Object.assign(RECIPES,{
 assemble_pro:{name:'Profilleuchte montieren',building:'assembly',inputs:{housing:1,board:2},output:{item:'lamp_pro_raw',qty:1},duration:9,role:'production',research:'product_pro'},
 test_pro:{name:'Profilleuchte prüfen',building:'testing',inputs:{lamp_pro_raw:1},output:{item:'lamp_pro_tested',qty:1},duration:6,role:'production',research:'product_pro'},
 pack_pro:{name:'Profilleuchte verpacken',building:'packing',inputs:{lamp_pro_tested:1,carton:1},output:{item:'lamp_pro',qty:1},duration:4,role:'production',research:'product_pro'},
 assemble_sensor:{name:'Sensor montieren',building:'assembly',inputs:{sensor_body:1,chip:1},output:{item:'sensor_raw',qty:1},duration:7,role:'production',research:'sensors'},
 test_sensor:{name:'Sensor kalibrieren',building:'testing',inputs:{sensor_raw:1},output:{item:'sensor_tested',qty:1},duration:6,role:'production',research:'sensors'},
 pack_sensor:{name:'Sensor verpacken',building:'packing',inputs:{sensor_tested:1,carton:1},output:{item:'sensor',qty:1},duration:3,role:'production',research:'sensors'},
 rework:{name:'Leuchte nacharbeiten',building:'testing',inputs:{lamp_raw:1,spare:1},output:{item:'lamp_raw',qty:1},duration:8,role:'production',qualityGain:20}
});
for(const r of Object.values(RECIPES)){r.version=1;r.setup=3;}
BUILDINGS.assembly.recipes.push('assemble_pro','assemble_sensor');BUILDINGS.testing.recipes.push('test_pro','test_sensor','rework');BUILDINGS.packing.recipes.push('pack_pro','pack_sensor');
Object.assign(RESEARCH,{product_pro:{name:'Profilleuchten',cost:8500,duration:180},sensors:{name:'Industriesensoren',cost:9500,duration:200}});
for(const [key,item] of Object.entries(ITEMS))item.purchasable=['housing','board','carton','spare','sensor_body','chip'].includes(key);
for(const key of ['lamp','lamp_pro','sensor'])ITEMS[key].sellable=true;

for(const [key,weight] of Object.entries({van:80,truck:320,refrigerated:200})){VEHICLES[key].weightCapacity=weight;VEHICLES[key].maxWeight=weight;}

ITEMS.cold_module={name:'Temperaturempfindliches Modul',price:80,weight:2,volume:1,purchasable:true,sellable:true,cold:true};

// Hub-Betrieb Welle 1: Fremdpakete der Vertragskunden; Werte vorläufig, Balancing A02.
Object.assign(ITEMS,{parcel:{name:'Paket',price:0,volume:0.05,weight:0.5}});
Object.assign(BUILDINGS,{sorter:{name:'Sortierplatz',cost:8500,w:3,h:2,color:'#7fb7e6',role:'warehouse',recipes:[],power:3,throughput:240}});
// Welle 2a: Paletten und Stapler (A01-Gerüst, Werte vorläufig).
Object.assign(ITEMS,{pallet:{name:'Palette',price:0,volume:1,weight:300}});
Object.assign(BUILDINGS,{forklift:{name:'Staplerplatz',cost:6500,w:1,h:1,color:'#f0b84a',role:'warehouse',recipes:[],power:2}});
// A01 Welle 2a: Lkw-Nutzlast für Paletten (300 kg je Palette → 20 je Fahrt); Volumen bleibt Grenze für Stückgut.
VEHICLES.truck.weightCapacity=6000;
// Welle 3b: Containerhof (A01-Gerüst, Werte vorläufig).
Object.assign(BUILDINGS,{containeryard:{name:'Containerhof',cost:18000,w:4,h:3,color:'#9aa7b4',role:'warehouse',recipes:[],power:1,teu:8}});
// 0.15 (A01-Gerüst): Warenarten Kühlpaket/Sperrgut, Quergurtsorter, Forschung Mega-Hub. A02 0.15 (docs/BALANCING-0.15.md):
// Quergurt 60.000 € (vorher 120.000), Mega-Hub 12.000 € (vorher 20.000); lohnt ab ≈ 4.000–6.000 Paketen/Tag.
Object.assign(ITEMS,{parcel_cold:{name:'Kühlpaket',price:0,volume:0.05,weight:0.5,cold:true},bulky:{name:'Sperrgut',price:0,volume:0.6,weight:25,noSorter:true}});
Object.assign(BUILDINGS,{crossbelt:{name:'Quergurtsorter',cost:60000,w:6,h:3,color:'#5f9fd6',role:'warehouse',recipes:[],power:12,throughput:2400,staff:2,research:'megahub'}});
Object.assign(RESEARCH,{megahub:{name:'Mega-Hub',cost:12000,duration:240}});
