/**
 * FARIS Smart EV Journey Scenario Engine v1.
 * This is a transparent WHAT-IF energy estimator, not a vehicle-specific
 * calibrated dynamometer or BMS. The 7-stage all-conditions case is a
 * SYNTHETIC MIX, not a claim about the selected road's actual weather/terrain.
 */
import {estimate, VEHICLES} from "./drive-sim-core.js";

export const SCENARIOS=Object.freeze([
  {id:"manual",icon:"⚙",title:"Tetapan Sendiri",tag:"Custom",detail:"Gunakan pilihan sendiri tanpa profil tambahan",inputs:{}},
  {id:"all",icon:"◆",title:"Semua Keadaan",tag:"MASTER · 7 ZON",detail:"Bandar, sesak, lebuh raya, hujan, bukit, kampung dan turun bukit dalam satu ujian",composite:true},
  {id:"city",icon:"🏙",title:"Bandar Harian",tag:"Pekan",detail:"Banyak lampu isyarat dan perjalanan setempat",inputs:{road:"city",speed:40,traffic:"moderate",regen:"high",mode:"normal"}},
  {id:"jam",icon:"🚦",title:"Jem Waktu Puncak",tag:"Stop & Go",detail:"Bandar sesak, pemanduan perlahan, penghawa dingin aktif",inputs:{road:"city",speed:25,traffic:"heavy",ac:true,regen:"high"}},
  {id:"highway",icon:"🛣",title:"Lebuh Raya",tag:"Cruise",detail:"Kelajuan stabil 100 km/j dengan trafik lancar",inputs:{road:"highway",speed:100,traffic:"light",mode:"normal"}},
  {id:"fast",icon:"💨",title:"Lebuh Raya Laju",tag:"120 km/j",detail:"Kelajuan lebih tinggi meningkatkan rintangan angin",inputs:{road:"highway",speed:120,traffic:"light",mode:"sport",aggressive:true}},
  {id:"rain",icon:"🌧",title:"Hujan Lebat",tag:"Basah",detail:"Jalan basah, trafik lebih perlahan dan permukaan kasar",inputs:{rain:true,traffic:"moderate",surface:"rough",road:"mixed",speed:65}},
  {id:"monsoon",icon:"⛈",title:"Musim Monsun",tag:"Stress Test",detail:"Simulasi hujan, angin lintang, AC kuat dan trafik padat",inputs:{rain:true,wind:"cross",hvac:"strong",traffic:"heavy",surface:"rough",speed:55}},
  {id:"uphill",icon:"⛰",title:"Mendaki Bukit",tag:"Kecerunan",detail:"Cerun menaik di kawasan tanah tinggi",inputs:{road:"hilly",slope:"up",speed:50,mode:"normal"}},
  {id:"downhill",icon:"↘",title:"Menuruni Bukit",tag:"Regeneratif",detail:"Cerun turun dan regeneratif lebih kuat (anggaran)",inputs:{road:"hilly",slope:"down",regen:"high",speed:45,mode:"eco"}},
  {id:"kampung",icon:"🌾",title:"Jalan Kampung",tag:"Permukaan",detail:"Jalan kecil dengan permukaan kurang rata",inputs:{road:"rural",surface:"uneven",speed:45}},
  {id:"family",icon:"👨‍👩‍👧",title:"Perjalanan Keluarga",tag:"Penumpang",detail:"Lima orang, bagasi 80 kg dan AC",inputs:{people:5,cargo:80,ac:true,road:"mixed",speed:75}},
  {id:"balik",icon:"🧳",title:"Balik Kampung",tag:"Muatan Penuh",detail:"Lima orang, muatan 130 kg, lebuh raya dan trafik sederhana",inputs:{people:5,cargo:130,road:"highway",speed:90,traffic:"moderate"}},
  {id:"hot",icon:"☀",title:"Cuaca Panas Terik",tag:"Suhu",detail:"Suhu ekstrem dan AC kuat (bukan bacaan cuaca langsung)",inputs:{temperature:"extreme",hvac:"strong",ac:true,road:"city",speed:40}},
  {id:"night",icon:"🌙",title:"Pemanduan Malam",tag:"Lampu",detail:"Lampu menyala dan keadaan jalan campuran",inputs:{night:true,road:"mixed",speed:65}},
  {id:"wind",icon:"🌬",title:"Angin Hadapan",tag:"Rintangan",detail:"Lebuh raya dengan angin melawan arah",inputs:{wind:"head",road:"highway",speed:100}},
  {id:"tyres",icon:"◉",title:"Tekanan Tayar Rendah",tag:"Kecekapan",detail:"Senario perbandingan tenaga, bukan cadangan memandu tayar rendah",inputs:{tire:"low",road:"mixed",speed:70}},
  {id:"battery",icon:"▤",title:"Bateri Menua",tag:"SOH 80%",detail:"Simulasi bateri berkurang kepada 80% kapasiti nominal",inputs:{batteryHealth:80,road:"mixed",speed:75}},
  {id:"eco",icon:"🍃",title:"Jimat Tenaga",tag:"Eco + Regen",detail:"Mod Eco, AC ringan dan regeneratif tinggi",inputs:{mode:"eco",regen:"high",hvac:"low",road:"city",speed:45}},
  {id:"aggressive",icon:"⚡",title:"Pemanduan Agresif",tag:"Sport",detail:"Mod sport, kelajuan tinggi, pecutan kerap",inputs:{mode:"sport",aggressive:true,road:"mixed",speed:105}},
  {id:"worst",icon:"🔴",title:"Worst-Case Gabungan",tag:"Tinggi Risiko",detail:"Pelbagai faktor penggunaan tinggi serentak; senario tekanan ekstrem",inputs:{road:"hilly",slope:"up",speed:90,traffic:"heavy",surface:"uneven",rain:true,temperature:"extreme",wind:"head",tire:"low",hvac:"strong",people:5,cargo:130,mode:"sport",aggressive:true,batteryHealth:80}}
]);

const STAGES=Object.freeze([
  {id:"traffic",icon:"🚦",name:"Bandar sesak",share:.17,settings:{road:"city",speed:28,traffic:"heavy",regen:"high",ac:true}},
  {id:"highway",icon:"🛣",name:"Lebuh raya",share:.21,settings:{road:"highway",speed:105,traffic:"light",mode:"normal"}},
  {id:"rain",icon:"🌧",name:"Hujan & permukaan kasar",share:.15,settings:{road:"mixed",speed:65,rain:true,surface:"rough",traffic:"moderate"}},
  {id:"hill",icon:"⛰",name:"Pendakian berbukit",share:.13,settings:{road:"hilly",speed:48,slope:"up",wind:"head"}},
  {id:"village",icon:"🌾",name:"Jalan kampung",share:.12,settings:{road:"rural",speed:40,surface:"uneven",traffic:"light"}},
  {id:"descent",icon:"↘",name:"Turun bukit & regen",share:.10,settings:{road:"hilly",speed:45,slope:"down",regen:"high",mode:"eco"}},
  {id:"hotwind",icon:"☀",name:"Panas & angin",share:.12,settings:{road:"highway",speed:85,temperature:"extreme",wind:"head",hvac:"strong",ac:true}}
]);
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const finite=(n,f=0)=>Number.isFinite(n)?n:f;

/** Result contains all legacy estimate fields so existing Phase 1 HUD still works. */
export function calculateJourney(options={},scenario="manual"){
  const safeScenario=SCENARIOS.find(s=>s.id===scenario)||SCENARIOS[0];
  if(!safeScenario.composite){
    const e=estimate(options);
    const stop=clamp(e.outOfBatteryAtKm,0,e.km);
    return {...e,scenario:safeScenario.id,scenarioName:safeScenario.title,composite:false,
      stopAtKm:stop,segments:[{id:"single",name:safeScenario.title,icon:safeScenario.icon,
        km:e.km,startKm:0,endKm:e.km,kwh:e.needed,energyStart:0,energyEnd:e.needed,
        minutes:e.travelMinutes,speed:e.speed,traffic:e.traffic,road:e.road,settings:options}]};
  }
  const car=VEHICLES[options.variant==="prime"?"prime":"premium"];
  const fullKm=clamp(finite(Number(options.distance),31.7),1,1000);
  const effectiveBattery=car.battery*clamp(finite(Number(options.batteryHealth),100),75,100)/100;
  const soc=clamp(finite(Number(options.soc),80),5,100);
  const startingEnergy=effectiveBattery*soc/100;
  const reserve=effectiveBattery*.1;
  let used=0,minutes=0,covered=0,atTenPercent=null,atZero=null;
  const sections=[];
  for(let i=0;i<STAGES.length;i++){
    const stage=STAGES[i],length=i===STAGES.length-1?fullKm-covered:fullKm*stage.share;
    const inputs={...options,...stage.settings,variant:options.variant,distance:Math.max(1,length)};
    // Use energy/km rather than estimate.needed when stage <1 km.
    const e=estimate(inputs),energy=length*e.kwh100/100;
    const min=length/e.speed*60;
    const energyStart=used,energyEnd=used+energy;
    if(atTenPercent===null&&energyEnd>=startingEnergy-reserve){
      atTenPercent=covered+clamp((startingEnergy-reserve-used)/Math.max(energy,1e-9),0,1)*length;
    }
    if(atZero===null&&energyEnd>=startingEnergy){
      atZero=covered+clamp((startingEnergy-used)/Math.max(energy,1e-9),0,1)*length;
    }
    sections.push({id:stage.id,name:stage.name,icon:stage.icon,share:stage.share,
      startKm:covered,endKm:covered+length,km:length,kwh:energy,
      energyStart,energyEnd,minutes:min,speed:e.speed,traffic:e.traffic,road:e.road,
      settings:stage.settings});
    used=energyEnd;covered+=length;minutes+=min;
  }
  const kwh100=used/fullKm*100;
  const rawArrivalSoc=(startingEnergy-used)/effectiveBattery*100;
  const arrivalSoc=clamp(rawArrivalSoc,0,100);
  const reserveEnergy=effectiveBattery*.10;
  const reachWithReserve=rawArrivalSoc>=10;
  const rangeUntil10=atTenPercent===null?Math.max(fullKm,(startingEnergy-reserve)/Math.max(used/fullKm,1e-6)):atTenPercent;
  const stopAtKm=atZero===null?fullKm:atZero;
  const averageSpeed=fullKm/(minutes/60);
  const remainingEnergy=Math.max(0,startingEnergy-used-reserveEnergy);
  const projection=estimate({...options,distance:fullKm});
  return {...projection,scenario:safeScenario.id,scenarioName:safeScenario.title,composite:true,
    segments:sections,car,km:fullKm,speed:averageSpeed,startSoc:soc,startingEnergy,effectiveBattery,
    kwh100,needed:used,travelMinutes:minutes,rawArrivalSoc,arrivalSoc,
    arrivalLow:clamp((startingEnergy-used*1.20)/effectiveBattery*100,0,100),
    arrivalHigh:clamp((startingEnergy-used*.9)/effectiveBattery*100,0,100),
    reachAtAll:rawArrivalSoc>=0,reachWithReserve,
    extraEnergyToReserve:Math.max(0,used+reserveEnergy-startingEnergy),
    rangeWithReserve:Math.max(0,rangeUntil10),
    rangeWithoutReserve:Math.max(0,stopAtKm),
    rangeAtArrival:remainingEnergy/kwh100*100,
    estimatedCost:used*projection.tariff,
    stopAtKm,
    outOfBatteryAtKm:stopAtKm,
    rangeDeficitKm:Math.max(0,fullKm-stopAtKm),
    batteryHealth:projection.batteryHealth
  };
}
/** Energy at travelled distance, not linear % energy when segments vary. */
export function sampleJourney(result,fraction){
  if(!result)return null;
  const p=clamp(finite(Number(fraction)),0,1),dist=result.km*p;
  let used=0,active=result.segments?.[0]||null;
  if(result.segments?.length){
    for(const part of result.segments){
      if(dist<=part.endKm+1e-9){
        used=part.energyStart+(part.kwh/Math.max(part.km,1e-9))*clamp(dist-part.startKm,0,part.km);
        active=part;break;
      }
      used=part.energyEnd;
    }
  }else used=result.needed*p;
  const soc=clamp((result.startingEnergy-used)/result.effectiveBattery*100,0,100);
  return {km:dist,kwh:used,soc,stage:active,canStillDrive:dist<=result.stopAtKm+1e-8,
    reachedTenPercent:soc<=10};
}
