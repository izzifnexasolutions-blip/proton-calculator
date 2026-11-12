/**
 * FARIS Journey Timeline: pure, testable route-to-energy rendering model.
 * OSRM names + SRTM coarse terrain are inference. Never invent live traffic.
 * SOC is derived from the shared e.MAS 5 energy estimator, not zone telemetry.
 */
import {socAtDistance,energyAtDistance,chargeSafetyWindow,nearKnownPlace,cumulativeLine,chargerEvidenceForSection} from "./drive-phase5-core.js";
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export const formatKm=(n,d=0)=>Number(n).toLocaleString("ms-MY",{minimumFractionDigits:d,maximumFractionDigits:d});
export const DRIVE_ZONE_ICONS=Object.freeze({highway:"🛣️",hilly:"⛰️",rural:"🌴",road:"🏙️",unknown:"🧭"});
export function suggestDriveMode(zone,settings={}){
  // Comfort/safety and predictable throttle are better than implying Sport saves energy.
  const road=zone?.kind||"unknown";
  if(settings.rain)return {mode:"Normal",reason:"Hujan dipilih sebagai andaian; pandu perlahan mengikut keadaan sebenar."};
  if(road==="hilly")return {mode:"Normal",reason:"Pendakian memerlukan kuasa; kekalkan kelajuan sederhana."};
  if(road==="highway")return {mode:"Normal",reason:"Lebuh raya: pemanduan stabil dan kelajuan sederhana."};
  if(road==="rural")return {mode:"Eco",reason:"Jalan tempatan: pecutan lembut dan kelajuan sesuai."};
  if(road==="road")return {mode:"Eco",reason:"Jalan utama/tempatan: pecutan secara beransur."};
  return {mode:"Normal",reason:"Jenis jalan tidak disahkan; sesuaikan dengan keadaan sebenar."};
}
export function estimatedPressure(zone,settings={}){
  // Qualitative *indicative* pressure, NOT measured real-world zone consumption.
  const kind=zone?.kind||"unknown",t=zone?.terrain?.type||"unknown";
  let score=1;
  const reasons=[];
  if(t==="up"){score+=2;reasons.push("Mendaki (sampel SRTM kasar)");}
  else if(t==="highland"){score+=1;reasons.push("Tanah tinggi (sampel kasar)");}
  if(kind==="highway"){
    score+=(settings.speed>=95?2:1);
    reasons.push("Kelajuan lebuh raya boleh meningkatkan seretan udara");
  }
  if(settings.traffic==="heavy"){score+=1;reasons.push("Jem dipilih sebagai senario, bukan trafik langsung");}
  if(settings.rain){score+=1;reasons.push("Hujan dipilih sebagai senario");}
  if(settings.cargoKg>=90||settings.people>=4){score+=1;reasons.push("Beban kenderaan");}
  const level=score>=3?"high":score===2?"medium":"low";
  return {level,label:level==="high"?"Lebih tinggi":level==="medium"?"Sederhana":"Rendah",
    reasons,indicative:true};
}
function namedZone(zone,line,places,totalKm){
  const geometricKm=line?(zone.startKm+zone.endKm)/2/Math.max(.001,totalKm)*line.lengthKm:0;
  const near=line?nearKnownPlace(places,line,geometricKm,28):null;
  return near?"Sekitar "+near.name+" · "+zone.label:zone.label;
}
export function buildJourneyTimeline({route,result,profile=[],places=[],plan=null,stations=[],chargerStatus="not_checked",settings={}}={}){
  if(!route||!result||!(route.km>0))return {rows:[],rail:[],window:null,summary:null};
  const line=cumulativeLine(route.coordinates);
  const window=chargeSafetyWindow(result);
  const startLabel=route.startName||route.start||"Lokasi mula";
  const endLabel=route.endName||route.end||"Destinasi";
  const rows=[{id:"start",type:"start",kind:"start",icon:"📍",name:startLabel,
    fromKm:0,toKm:0,km:0,socStart:result.startSoc,socEnd:result.startSoc,
    note:"Bateri mula mengikut tetapan simulator.",level:"low",mode:"—"}];
  const rail=[];
  const zones=profile.length?profile:[{kind:"unknown",type:"unknown",label:"Jenis jalan belum diketahui",
    km:route.km,startKm:0,endKm:route.km,source:"OSRM road classification not available"}];
  for(let i=0;i<zones.length;i++){
    const z=zones[i],fromKm=clamp(z.startKm,0,route.km),toKm=clamp(z.endKm,fromKm,route.km);
    const mode=suggestDriveMode(z,settings),drain=estimatedPressure(z,settings);
    const charger=chargerEvidenceForSection(stations,chargerStatus,fromKm,toKm);
    const socStart=socAtDistance(result,fromKm);
    const socEnd=socAtDistance(result,toKm);
    const kwh=energyAtDistance(result,toKm)-energyAtDistance(result,fromKm);
    rows.push({id:"zone"+i,type:"zone",kind:z.kind,icon:DRIVE_ZONE_ICONS[z.kind]||"🧭",
      name:namedZone(z,line,places,route.km),roadName:z.road||"",roadRef:z.roadRef||"",
      fromKm,toKm,km:toKm-fromKm,charger,
      socStart,socEnd,kwh,mode:mode.mode,modeReason:mode.reason,
      level:drain.level,drainLabel:drain.label,reason:drain.reasons.join(" · "),
      note:z.source||"Klasifikasi belum tersedia",
      source:z.source||"Anggaran",routeEvidence:z.kind!=="unknown"});
    rail.push({km:toKm-fromKm,level:drain.level,id:"zone"+i,fromKm,toKm});
  }
  if(window?.needed){
    const startKm=clamp(window.searchFromKm,0,route.km);
    const lastKm=clamp(window.latestStopKm,0,route.km);
    rows.push({id:"charge-search",type:"charge",kind:"charge",icon:"⚡",
      name:window.alreadyLow?"Cas sebelum bertolak":"Zon mula cari pengecas",
      fromKm:startKm,toKm:lastKm,km:Math.max(0,lastKm-startKm),
      socStart:socAtDistance(result,startKm),socEnd:socAtDistance(result,lastKm),
      level:"high",mode:"—",note:"Zon SOC 30%–15% pada laluan OSRM. BUKAN lokasi stesen yang disahkan.",
      charger:chargerEvidenceForSection(stations,chargerStatus,startKm,lastKm)});
    for(const [i,stop] of (plan?.stops||[]).entries()){
      rows.push({id:"stop"+i,type:"stop",kind:"charge",icon:"🔋",
        name:stop.station.name+" · "+stop.kind+" (semak operator)",
        fromKm:stop.station.kmAlong,toKm:stop.station.kmAlong,km:0,
        socStart:stop.arrivalSoc,socEnd:stop.targetSoc,
        level:"high",mode:"—",note:"Rekod OSM, belum disahkan berfungsi/tersedia. Masa cas "+
          (stop.minutes==null?"tidak diketahui":"±"+Math.round(stop.minutes)+" min secara anggaran")+
          ". SOC zon selepas ini belum mengambil kira cas."});
    }
  }
  rows.push({id:"end",type:"end",kind:"end",icon:"🏁",name:endLabel,
    fromKm:route.km,toKm:route.km,km:0,
    socStart:result.arrivalSoc,socEnd:result.reachAtAll?result.arrivalSoc:0,
    level:result.reachWithReserve?"low":"high",mode:"—",
    note:!result.reachAtAll?"Bateri dijangka habis sebelum tiba. Angka destinasi ialah 0%* — bukan bukti tiba.":
      "Anggaran tiba mengikut model, tanpa pengecasan pertengahan."});
  // Keep chronological ordering; start then zones & inserted stop milestones & destination.
  const first=rows.shift(),last=rows.pop();
  rows.sort((a,b)=>a.fromKm-b.fromKm||((a.type==="charge"||a.type==="stop")?-1:1));
  rows.unshift(first);rows.push(last);
  const high=rail.filter(x=>x.level==="high").length;
  const mostCommon=rail.length?rail.reduce((a,b)=>a.km>b.km?a:b):null;
  const defaultMode=mostCommon?.id?rows.find(x=>x.id===mostCommon.id)?.mode:"Normal";
  return {rows,rail,window,
    summary:{km:route.km,minutes:route.minutes,arrivalSoc:result.arrivalSoc,
      canArrive:result.reachAtAll,needsCharge:!result.reachWithReserve,
      mode:defaultMode||"Normal",highZones:high,sectionCount:rail.length}};
}
