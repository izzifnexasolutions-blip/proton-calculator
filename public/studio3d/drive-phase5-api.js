/* Phase 5: single-click-only requests to free community data providers.
   No polling, auto-retry, paid keys, hidden background search, or fake data. */
import {cumulativeLine,pointAtFraction,parseElevations,parseChargingStations,parseOcmStations,mergeChargingStations} from "./drive-phase5-core.js";
export const OSM_OVERPASS="https://overpass.private.coffee/api/interpreter";
export const SRTM_URL="https://api.opentopodata.org/v1/srtm90m";
export const OSRM_CAR="https://routing.openstreetmap.de/routed-car/route/v1/driving/";
export function makeOverpassQuery(geometry){
  const line=cumulativeLine(geometry);
  if(!line||!line.lengthKm)throw Error("Laluan jalan tiada geometri sah.");
  const count=Math.max(8,Math.min(42,Math.ceil(line.lengthKm/13)+1));
  const list=Array.from({length:count},(_,i)=>pointAtFraction(line,i/(count-1)));
  const joined=list.map(([lon,lat])=>lat.toFixed(5)+","+lon.toFixed(5)).join(",");
  return '[out:json][timeout:22];'+
    'nwr["amenity"="charging_station"](around:7000,'+joined+');out center 450;'+
    'node["place"~"^(city|town|village)$"](around:4000,'+joined+');out body 140;';
}
export function makeElevationURL(geometry){
  const line=cumulativeLine(geometry);
  if(!line||!line.lengthKm)throw Error("Laluan jalan tiada geometri sah.");
  const count=Math.max(9,Math.min(21,Math.ceil(line.lengthKm/22)+1));
  const joined=Array.from({length:count},(_,i)=>pointAtFraction(line,i/(count-1)))
    .map(([lon,lat])=>lat.toFixed(5)+","+lon.toFixed(5)).join("|");
  return SRTM_URL+"?locations="+encodeURIComponent(joined);
}
export async function fetchRouteContext(route,{signal}={}){
  const geometry=route?.coordinates;
  if(!Array.isArray(geometry)||geometry.length<2)throw Error("Kira laluan OSRM dahulu.");
  const line=cumulativeLine(geometry);
  if(!line?.lengthKm)throw Error("Geometri laluan tidak sah.");
  const chargingCount=Math.max(8,Math.min(42,Math.ceil(line.lengthKm/13)+1));
  const elevationCount=Math.max(9,Math.min(21,Math.ceil(line.lengthKm/22)+1));
  const chargerPoints=Array.from({length:chargingCount},(_,i)=>pointAtFraction(line,i/(chargingCount-1)));
  const elevationPoints=Array.from({length:elevationCount},(_,i)=>pointAtFraction(line,i/(elevationCount-1)));
  // Same-origin Vercel function removes third-party CORS reliance.
  // Never use an arbitrary user-supplied URL.
  const resp=await fetch("/api/ev-route-context",{
    method:"POST",mode:"same-origin",signal,cache:"no-store",
    headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({chargerPoints,elevationPoints})
  });
  const raw=await resp.json().catch(()=>({}));
  if(!resp.ok)throw Error(String(raw.error||"Data peta terbuka tidak tersedia.").slice(0,140));
  const output={
    stations:[],places:[],elevations:null,
    stationError:raw.stationError||null,elevationError:raw.elevationError||null,ocmStatus:raw.ocmStatus||"not_configured"
  };
  if(!output.stationError){
    output.stations=parseChargingStations({elements:raw.stations||[]},line,route.km);
    output.places=Array.isArray(raw.places)?raw.places.filter(p=>
      typeof p.name==="string"&&p.name.length&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)).slice(0,140):[];
  }
  if(output.ocmStatus==="success"||output.ocmStatus==="partial"){
    const fromOcm=parseOcmStations(raw.ocmStations||[],line,route.km);
    output.stations=mergeChargingStations(output.stations,fromOcm);
  }
  if(output.stationError&&(output.ocmStatus==="success"||output.ocmStatus==="partial"))output.stationError=null;
  if(!output.elevationError){
    output.elevations=parseElevations({results:raw.elevations||[]},line);
    if(!output.elevations)output.elevationError="Sampel ketinggian SRTM tidak mencukupi.";
  }
  return output;
}
export async function verifyDrivingStops(route,stops,{signal}={}){
  if(!route?.coordinates?.length||!Array.isArray(stops)||!stops.length||stops.length>2)
    throw Error("Perlu laluan OSRM dan satu atau dua hentian.");
  const endpoints=[route.coordinates[0],...stops.map(s=>s.station.coordinates),
    route.coordinates.at(-1)];
  const encode=p=>p.map(n=>Number(n).toFixed(6)).join(",");
  const url=OSRM_CAR+endpoints.map(encode).join(";")+
    "?steps=false&overview=false&alternatives=false";
  const response=await fetch(url,{signal,mode:"cors",cache:"default"});
  if(!response.ok)throw Error("Pelayan OSRM: HTTP "+response.status);
  const data=await response.json();
  const legs=data?.routes?.[0]?.legs;
  if(data?.code!=="Ok"||!Array.isArray(legs)||legs.length!==stops.length+1)
    throw Error("Jalan masuk stesen tidak dapat disahkan oleh OSRM.");
  const kms=legs.map(s=>Number(s.distance)/1000);
  if(kms.some(x=>!Number.isFinite(x)||x<.10||x>1100))
    throw Error("Jarak laluan stesen tidak sah.");
  return {legKm:kms,totalKm:kms.reduce((a,b)=>a+b,0),
    deltaKm:kms.reduce((a,b)=>a+b,0)-route.km};
}
export function verifyChargeEnergy(result,stops,legs){
  if(!result||stops.length+1!==legs.length)return {safe:false,reason:"Input tidak lengkap."};
  const cap=result.effectiveBattery,kwhKm=result.needed/result.km;
  let battery=result.startingEnergy,steps=[],safe=true;
  for(let i=0;i<stops.length;i++){
    battery-=legs[i]*kwhKm;
    const arrivalSoc=battery/cap*100;
    if(arrivalSoc<15)safe=false;
    // Follow selected provisional target, then re-check the next segment.
    const targetSoc=stops[i].targetSoc;
    battery=targetSoc/100*cap;
    steps.push({name:stops[i].station.name,arrivalSoc,targetSoc,
      belowReserve:arrivalSoc<15});
  }
  battery-=legs.at(-1)*kwhKm;
  const finishSoc=battery/cap*100;
  if(finishSoc<10)safe=false;
  return {safe,steps,finishSoc,reason:safe?
    "Laluan jalan melalui stesen kelihatan mencukupi mengikut model (bukan bukti pengecas aktif).":
    "Jalan melalui stesen ini tidak memberi margin bateri mencukupi. Cari hentian lain."};
}
