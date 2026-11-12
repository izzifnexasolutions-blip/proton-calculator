/**
 * FARIS e.MAS 5 Phase 5 · TESTABLE CORE (no browser, network, or API keys).
 * OSM charger records are observations, NOT proof a charger is online,
 * accessible, compatible, on the route, or available for a reservation.
 * Charging scenarios use estimated consumption and geometric proximity.
 */
export const CHARGING_LIMITS=Object.freeze({
  prime:{acKw:6.6,dcKw:53},premium:{acKw:6.6,dcKw:71}
});
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const rad=Math.PI/180;
const isNum=v=>typeof v==="number"&&Number.isFinite(v);
export function haversine(a,b){
  const x=(b[1]-a[1])*rad,y=(b[0]-a[0])*rad;
  const q=Math.sin(x/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(y/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(q)));
}
export function cumulativeLine(coords){
  if(!Array.isArray(coords)||coords.length<2)return null;
  const distances=new Float64Array(coords.length);
  for(let i=1;i<coords.length;i++)distances[i]=distances[i-1]+haversine(coords[i-1],coords[i]);
  return {coords,distances,lengthKm:distances.at(-1)};
}
export function pointAtFraction(line,f){
  if(!line||!Number.isFinite(line.lengthKm)||!line.lengthKm)return null;
  const target=clamp(f,0,1)*line.lengthKm,dist=line.distances;
  let low=1,high=dist.length-1;
  while(low<high){const mid=(low+high)>>1;if(dist[mid]<target)low=mid+1;else high=mid;}
  const i=low,part=dist[i]-dist[i-1],t=part?(target-dist[i-1])/part:0;
  return [
    line.coords[i-1][0]+(line.coords[i][0]-line.coords[i-1][0])*t,
    line.coords[i-1][1]+(line.coords[i][1]-line.coords[i-1][1])*t
  ];
}
export function nearLine(position,line){
  if(!line||!Array.isArray(position)||!isNum(position[0])||!isNum(position[1]))return null;
  let best={offsetKm:Infinity,progress:0};
  for(let i=1;i<line.coords.length;i++){
    const a=line.coords[i-1],b=line.coords[i],lat=(a[1]+b[1]+position[1])/3*rad;
    const kx=111.195*Math.cos(lat),ky=111.195;
    const px=(position[0]-a[0])*kx,py=(position[1]-a[1])*ky;
    const dx=(b[0]-a[0])*kx,dy=(b[1]-a[1])*ky;
    const t=clamp((px*dx+py*dy)/(dx*dx+dy*dy||1),0,1);
    const offset=Math.hypot(px-t*dx,py-t*dy);
    if(offset<best.offsetKm){
      const roadKm=line.distances[i-1]+(line.distances[i]-line.distances[i-1])*t;
      best={offsetKm:offset,progress:line.lengthKm?roadKm/line.lengthKm:0,
        point:[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]};
    }
  }
  return best;
}
export function parsePower(v){
  if(v==null)return null;
  const parts=String(v).split(/[;|]/).map(x=>x.trim());
  const values=[];
  for(const part of parts){
    const m=part.match(/(\d+(?:[.,]\d+)?)\s*(MW|kW|W)?/i);
    if(!m)continue;
    const num=Number(m[1].replace(",",".")),unit=(m[2]||"kW").toLowerCase();
    const kW=num*(unit==="mw"?1000:unit==="w"?.001:1);
    if(Number.isFinite(kW)&&kW>=1&&kW<=500)values.push(kW);
  }
  return values.length?Math.max(...values):null;
}
function hasSocket(tag,key){
  const v=tag[key];
  return v!==undefined&&!["no","0","none","unknown"].includes(String(v).toLowerCase());
}
function knownType(tags){
  const dcKeys=["socket:type2_combo","socket:ccs","socket:ccs2"];
  const acKeys=["socket:type2","socket:type2_cable"];
  const hasDC=dcKeys.some(k=>hasSocket(tags,k));
  const hasAC=acKeys.some(k=>hasSocket(tags,k));
  const allDC=hasDC||hasSocket(tags,"socket:chademo")||hasSocket(tags,"socket:type1_combo");
  return {hasDC,hasAC,anyDC:allDC,
    type:hasDC&&hasAC?"AC/DC":hasDC?"DC":hasAC?"AC":allDC?"DC lain":"Tidak diketahui"};
}
export function parseChargingStations(response,line,routeKm,limit=250){
  if(!Array.isArray(response?.elements)||!line||!(routeKm>0))return [];
  const found=[],seen=new Set();
  for(const e of response.elements.slice(0,1200)){
    if(!["node","way","relation"].includes(e?.type)||!Number.isSafeInteger(e?.id))continue;
    if(e.tags?.amenity!=="charging_station")continue;
    const raw=e.tags||{},lat=Number(e.lat??e.center?.lat),lon=Number(e.lon??e.center?.lon);
    if(!isNum(lat)||!isNum(lon)||lat<.8||lat>7.8||lon<99||lon>119.5)continue;
    const code=e.type+":"+e.id;if(seen.has(code))continue;seen.add(code);
    const distance=nearLine([lon,lat],line);
    if(!distance||distance.offsetKm>7.0)continue;
    const type=knownType(raw);
    // CCS2 or Type2 is required for a *potentially compatible* vehicle.
    // CHAdeMO-only or completely unknown connectors must never be ranked as usable.
    const dcPower=parsePower(raw["socket:type2_combo:output"]??raw["socket:ccs:output"]??raw["socket:ccs2:output"]);
    const acPower=parsePower(raw["socket:type2:output"]??raw["socket:type2_cable:output"]);
    const powerKw=type.hasDC?(dcPower||null):type.hasAC?(acPower||null):null;
    const access=String(raw.access||"unknown").toLowerCase();
    const name=String(raw.name||raw.operator||raw.brand||"Stesen cas (nama tidak direkodkan)").slice(0,100);
    found.push({
      id:code,osmUrl:"https://www.openstreetmap.org/"+e.type+"/"+e.id,
      name,operator:String(raw.operator||raw.network||"Tidak direkodkan").slice(0,90),
      coordinates:[lon,lat],ac:type.hasAC,dc:type.hasDC,otherDC:type.anyDC&&!type.hasDC,
      type:type.type,acPowerKw:acPower,dcPowerKw:dcPower,powerKw,
      access,roadProgress:clamp(distance.progress,0,1),
      kmAlong:clamp(distance.progress,0,1)*routeKm,
      offsetKm:distance.offsetKm, // GEOGRAPHICAL shortest distance, NOT driving detour
      lastOsmChecked:"Tidak diketahui",
      notes:String(raw.description||"").slice(0,160),
      accessNeedsCheck:!["yes","public","permissive"].includes(access),
      knownConnector:type.hasDC||type.hasAC,
      availability:"Tidak diketahui"
    });
  }
  return found.sort((a,b)=>a.kmAlong-b.kmAlong).slice(0,limit);
}
export function parseElevations(input,line){
  const values=input?.results;
  if(!Array.isArray(values)||values.length<3||values.length>100)return null;
  const samples=values.map((item,i)=>({
    height:isNum(item?.elevation)?item.elevation:null,
    progress:i/(values.length-1)
  }));
  if(samples.filter(x=>x.height!==null).length<3)return null;
  return samples;
}
function terrainAt(samples,km,totalKm){
  if(!samples||totalKm<=0)return {type:"unknown",label:"Cerun tidak diketahui",rise:0};
  const frac=clamp(km/totalKm,0,1),idx=Math.min(samples.length-2,Math.floor(frac*(samples.length-1)));
  const a=samples[idx],b=samples[idx+1];
  if(a.height===null||b.height===null)return {type:"unknown",label:"Elevasi tiada data",rise:0};
  const span=totalKm/(samples.length-1),gradient=(b.height-a.height)/Math.max(span,.4); // metres/km (coarse)
  const hi=Math.max(a.height,b.height);
  if(gradient>35)return {type:"up",label:"Mendaki (anggaran SRTM)",rise:gradient};
  if(gradient< -35)return {type:"down",label:"Menurun (anggaran SRTM)",rise:gradient};
  if(hi>450)return {type:"highland",label:"Tanah tinggi (SRTM)",rise:gradient};
  return {type:"flat",label:"Cerun ringan/tidak jelas",rise:gradient};
}
export function categorizeRoad(road="",ref=""){
  const txt=(road+" "+ref).toLowerCase();
  if(/(?:\blebuhraya\b|expressway|\bhighway\b|\b(?:plus|elite|nkve|lpt|mex|akleh|suke|duke|skve|kesas|wce|lekas)\b|\be\s?\d{1,3}\b)/i.test(txt))
    return {type:"highway",label:"Lebuh raya",source:"Nama/rujukan OSRM · inferens"};
  if(/(?:\bkampung\b|\bkg\.\b|\bladang\b|\bfelda\b)/i.test(txt))
    return {type:"rural",label:"Jalan kampung",source:"Nama OSRM · inferens"};
  if(/(?:\bjalan\b|\bpersiaran\b|\bjalanraya\b|\bjalan raya\b|\broute\b)/i.test(txt))
    return {type:"road",label:"Jalan utama / tempatan",source:"Nama OSRM · jenis belum disahkan"};
  return {type:"unknown",label:"Jenis jalan tidak dikenal pasti",source:"Tiada tag jalan yang mencukupi"};
}
export function buildRouteSituations(route,elevations=null){
  const km=Number(route?.km)||0;
  if(!km||!Array.isArray(route.coordinates)||route.coordinates.length<2)return [];
  const steps=Array.isArray(route.roadSteps)?route.roadSteps.filter(x=>Number(x.km)>0):[];
  const total=steps.reduce((n,s)=>n+s.km,0);
  const sectors=[],count=Math.max(10,Math.min(28,Math.ceil(km/14)));
  for(let i=0;i<count;i++){
    const startKm=km*i/count,endKm=km*(i+1)/count;
    const centerKm=(startKm+endKm)/2;
    const stepPoint=centerKm/Math.max(km,1)*total;
    let walked=0,name="",ref="";
    for(const step of steps){
      walked+=step.km;
      if(walked>=stepPoint){name=String(step.name||"").trim();ref=String(step.ref||"").trim();break;}
    }
    if(/^(?:unnamed|unknown|none)$/i.test(name))name="";
    const roadway=categorizeRoad(name,ref);
    const terrain=terrainAt(elevations,centerKm,km);
    const kind=["up","down","highland"].includes(terrain.type)?"hilly":
      roadway.type==="highway"?"highway":
      roadway.type==="rural"?"rural":
      roadway.type==="road"?"road":"unknown";
    const type=terrain.type==="up"?"uphill":terrain.type==="down"?"downhill":
      terrain.type==="highland"?"highland":roadway.type==="highway"?"highway":
      roadway.type==="rural"?"rural":roadway.type==="road"?"road":"unknown";
    // Prefer an actual OSRM road name/reference instead of repeating generic
    // 'Jalan utama/tempatan'. Never invent a road where OSRM has no name.
    const qualifiedName=name?(ref&&!name.toLowerCase().includes(ref.toLowerCase())?
      name+" ("+ref+")":name):ref?ref:"";
    const terrainLabel=type==="uphill"?"Mendaki":type==="downhill"?"Menurun":
      type==="highland"?"Tanah tinggi":"";
    const label=terrainLabel?(qualifiedName?terrainLabel+" · "+qualifiedName:terrainLabel):
      qualifiedName||roadway.label;
    const source=type==="uphill"||type==="downhill"||type==="highland"?
      "Ketinggian SRTM kasar · bukan profil cerun jalan":roadway.source;
    const prev=sectors.at(-1);
    // Retain ~20–45 km checkpoints on long single-class motorway routes.
    // They are route slices, NOT invented land-use or traffic transitions.
    const maxSectionKm=Math.max(20,Math.min(45,km/7));
    if(prev&&prev.type===type&&prev.road===name&&prev.roadRef===ref&&
      prev.km+(endKm-startKm)<=maxSectionKm){
      prev.endKm=endKm;prev.km=endKm-prev.startKm;
    }else sectors.push({type,kind,label,startKm,endKm,km:endKm-startKm,source,road:name,roadRef:ref,terrain});
  }
  return sectors;
}
/**
 * A grounded charging-record indicator, never a statistical probability of
 * finding a working charger. Records may be incomplete, private or out-of-date.
 */
export function chargerEvidenceForSection(stations=[],status="not_checked",fromKm=0,toKm=0){
  if(status!=="success")return {
    status,dc:0,ac:0,unknown:0,total:0,
    label:status==="error"?"Carian pengecas gagal — status tak diketahui":
      "Pengecas belum disemak",confidence:"unknown",nearest:null
  };
  const start=Math.min(fromKm,toKm),end=Math.max(fromKm,toKm);
  const list=Array.isArray(stations)?stations.filter(s=>
    s&&Number.isFinite(s.kmAlong)&&s.kmAlong>=start-8&&s.kmAlong<=end+8&&
    s.offsetKm<=7&&s.access!=="private"&&s.access!=="no"):[];
  const compatible=list.filter(s=>s.knownConnector&&(s.dc||s.ac));
  const dc=compatible.filter(s=>s.dc).length;
  const ac=compatible.filter(s=>s.ac).length;
  const unknown=list.length-compatible.length;
  const summary=[dc?dc+" DC CCS2":null,ac?ac+" AC Type 2":null].filter(Boolean).join(" · ");
  const nearest=compatible.slice().sort((a,b)=>
    Math.abs(a.kmAlong-(start+end)/2)-Math.abs(b.kmAlong-(start+end)/2))[0]||null;
  return {status,dc,ac,unknown,total:list.length,nearest,
    confidence:compatible.length?"recorded":unknown?"incomplete":"none_recorded",
    label:compatible.length?
      summary+" direkodkan di OSM (belum disahkan aktif)":
      unknown?"Ada rekod OSM, tetapi soket belum disahkan":
      "Tiada rekod serasi berhampiran dalam carian OSM (bukan bukti tiada pengecas)"
  };
}
export function zoneAtDistance(situations,km){
  return situations?.find(s=>km>=s.startKm-1e-7&&km<=s.endKm+1e-7)||situations?.at(-1)||null;
}
function energyAt(result,km){
  if(!result||!(result.km>0))return 0;
  const distance=clamp(km,0,result.km);
  if(Array.isArray(result.segments)&&result.segments.length){
    for(const p of result.segments){
      if(distance<=p.endKm+1e-8)
        return p.energyStart+p.kwh*clamp((distance-p.startKm)/Math.max(.001,p.km),0,1);
    }
  }
  return result.needed*distance/result.km;
}
export function energyAtDistance(result,km){return energyAt(result,km)}
/**
 * Always-visible planning window, independent of OSM station availability.
 * Returns DISTANCES, never invents a charger or settlement at the location.
 * 30% prompts looking, 15% recommended latest arrival to a charger,
 * 10% low reserve, 0% estimated stop. This is NOT a route guarantee.
 */
export function chargeSafetyWindow(result){
  if(!result||!(result.km>0)||!(result.effectiveBattery>0))return null;
  function kmAtSOC(targetSoc){
    if(result.startSoc<=targetSoc)return 0;
    const end=socAtDistance(result,result.km);
    if(end!==null&&end>targetSoc)return result.km;
    let left=0,right=result.km;
    for(let i=0;i<40;i++){
      const mid=(left+right)/2;
      if(socAtDistance(result,mid)>targetSoc)left=mid;
      else right=mid;
    }
    return (left+right)/2;
  }
  const needed=!result.reachWithReserve;
  const first=kmAtSOC(30),last=kmAtSOC(15),reserve=kmAtSOC(10),empty=kmAtSOC(0);
  return {
    needed,searchFromKm:first,latestStopKm:last,
    reserve10Km:reserve,emptyKm:empty,
    alreadyLow:result.startSoc<=15,
    label:!needed?"Pengecasan tidak diwajibkan oleh model perjalanan.":
      result.startSoc<=15?"Bateri permulaan rendah — cas sebelum bertolak.":
      "Cari pengecas sebelum SOC jatuh di bawah 15%."
  };
}
export function nearKnownPlace(places,line,km,limitKm=15){
  if(!Array.isArray(places)||!line||!Number.isFinite(km))return null;
  const point=pointAtFraction(line,clamp(km/Math.max(.0001,line.lengthKm),0,1));
  if(!point)return null;
  let candidate=null;
  for(const p of places){
    if(!p?.name||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))continue;
    const direct=haversine(point,[p.lon,p.lat]);
    if(direct>limitKm)continue;
    const projection=nearLine([p.lon,p.lat],line);
    if(!projection||projection.offsetKm>8)continue;
    const score=direct+projection.offsetKm*.2;
    if(!candidate||score<candidate.score)
      candidate={name:p.name,kind:p.kind||"place",distanceKm:direct,score,
        approximate:true};
  }
  return candidate;
}
export function socAtDistance(result,km){
  if(!result||!result.effectiveBattery)return null;
  return clamp((result.startingEnergy-energyAt(result,km))/result.effectiveBattery*100,0,100);
}
export function chargeDuration(station,variant,addKwh,preferDC=true){
  const cap=CHARGING_LIMITS[variant==="prime"?"prime":"premium"];
  const isDC=preferDC&&station.dc;
  const site=isDC?station.dcPowerKw:station.acPowerKw;
  if(!isNum(site)||site<=0)return null;
  const effective=Math.min(site,isDC?cap.dcKw:cap.acKw)*(isDC?.72:.88);
  return effective>0?addKwh/effective*60:null; // Approximation, not a charging curve
}
function buildStop(station,arrivalEnergy,targetEnergy,result){
  const effectiveBattery=result.effectiveBattery,arrivalSoc=arrivalEnergy/effectiveBattery*100;
  const targetSoc=clamp(Math.ceil(targetEnergy/effectiveBattery*20)*5,Math.ceil(arrivalSoc/5)*5,90);
  const addKwh=Math.max(0,(targetSoc/100)*effectiveBattery-arrivalEnergy);
  const dc=station.dc;
  const mins=chargeDuration(station,result.variant,addKwh,dc);
  return {station,arrivalSoc,targetSoc,addKwh,minutes:mins,
    kind:dc?"DC":"AC",requiresVerification:true,
    provisional:true,drivingDetourKm:null,liveAvailability:null};
}
function eligible(stations){
  return stations.filter(s=>s.knownConnector&&!s.sourceConflict&&
    s.access!=="private"&&s.access!=="no"&&s.kmAlong>1&&s.offsetKm<=6);
}
function scores(stops){
  const worstOff=stops.reduce((a,s)=>a+s.station.offsetKm,0);
  const known=stops.reduce((a,s)=>a+(s.minutes??150),0);
  const unknown=stops.filter(s=>s.minutes===null).length;
  return stops.length*400+known+worstOff*4+unknown*90+
    stops.filter(s=>!s.station.dc).length*65+
    stops.filter(s=>s.station.accessNeedsCheck).length*35;
}
export function planCharging(result,stations=[],options={}){
  if(!result||!Number.isFinite(result.effectiveBattery)||!(result.km>0))
    return {kind:"invalid",stops:[],alternatives:[],message:"Perjalanan belum tersedia."};
  const cap=result.effectiveBattery,battery=result.startingEnergy;
  const reserveAtStop=cap*.15,reserveEnd=cap*.10;
  if(result.reachWithReserve)
    return {kind:"none",stops:[],alternatives:[],message:"Anggaran boleh sampai dengan sekurang-kurangnya 10% SOC. Hentian cas tidak wajib mengikut model."};
  const usable=eligible(stations).filter(s=>s.kmAlong<result.km-1);
  const first=usable.filter(s=>battery-energyAt(result,s.kmAlong)>=reserveAtStop-1e-6);
  const choices=[];
  for(const s of first){
    const arrive=battery-energyAt(result,s.kmAlong);
    const needFromStop=energyAt(result,result.km)-energyAt(result,s.kmAlong);
    const targetEnergy=needFromStop+reserveEnd;
    if(targetEnergy<=cap*.9+1e-6&&targetEnergy>arrive){
      choices.push({kind:"one",stops:[buildStop(s,arrive,Math.max(targetEnergy,cap*.65),result)]});
    }
  }
  // A two-stop provisional plan is considered only if 1-stop cannot work.
  // For large-scale routing a dedicated self-hosted router is recommended.
  if(!choices.length){
    for(const a of first.slice(0,35)){
      const aArrive=battery-energyAt(result,a.kmAlong),maxFirst=cap*.90;
      for(const b of usable){
        if(b.kmAlong<=a.kmAlong+8)continue;
        const travel=energyAt(result,b.kmAlong)-energyAt(result,a.kmAlong);
        const bArrival=maxFirst-travel;
        if(bArrival<reserveAtStop)continue;
        const neededFromB=energyAt(result,result.km)-energyAt(result,b.kmAlong)+reserveEnd;
        if(neededFromB>cap*.9||neededFromB<=bArrival)continue;
        choices.push({kind:"two",stops:[
          buildStop(a,aArrive,maxFirst,result),
          buildStop(b,bArrival,Math.max(neededFromB,cap*.65),result)
        ]});
        if(choices.length>180)break;
      }
      if(choices.length>180)break;
    }
  }
  if(!choices.length){
    return {kind:"unavailable",stops:[],alternatives:[],
      message:!usable.length?"Tiada pengecas dengan soket Type 2 atau CCS2 yang direkodkan dalam carian laluan ini.":
      "Tiada hentian yang boleh dibuktikan mencukupi mengikut jarak dan SOC semasa. Tambah bateri sebelum bertolak, tukar laluan atau semak pengecas lain."};
  }
  choices.sort((a,b)=>scores(a.stops)-scores(b.stops));
  const best=choices[0];
  return {kind:best.kind,stops:best.stops,alternatives:choices.slice(1,4),
    message:best.kind==="one"?"1 hentian dicadangkan untuk disemak — akses jalan, soket dan status masih belum disahkan.":
    "2 hentian dicadangkan untuk disemak — kedua-duanya perlu disahkan secara berasingan.",
    totalMinutesKnown:best.stops.every(s=>s.minutes!==null)?
      best.stops.reduce((n,s)=>n+s.minutes,0):null};
}

/** OCM fields are third-party catalog observations, not proof of service. */
export function parseOcmStations(records,line,routeKm){
  if(!Array.isArray(records)||!line||!(routeKm>0))return [];
  const out=[],seen=new Set();
  for(const item of records.slice(0,300)){
    const id=Number(item?.ID),address=item?.AddressInfo||{};
    const lat=Number(address.Latitude),lon=Number(address.Longitude);
    if(!Number.isSafeInteger(id)||!isNum(lat)||!isNum(lon)||lat<.8||lat>7.8||lon<99||lon>119.5||seen.has(id))continue;
    seen.add(id);
    const projection=nearLine([lon,lat],line);
    if(!projection||projection.offsetKm>7)continue;
    const connections=Array.isArray(item.Connections)?item.Connections:[];
    const compatible=connections.filter(c=>/\b(CCS|Type 2)\b/i.test(String(c?.ConnectionType?.Title||"")));
    const dc=compatible.some(c=>/CCS/i.test(String(c.ConnectionType?.Title||"")));
    const ac=compatible.some(c=>/Type 2/i.test(String(c.ConnectionType?.Title||""))&&!/CCS/i.test(String(c.ConnectionType?.Title||"")));
    const power=(list)=>list.map(c=>Number(c.PowerKW)).filter(v=>isNum(v)&&v>0&&v<=500);
    const dcPower=power(compatible.filter(c=>/CCS/i.test(String(c.ConnectionType?.Title||""))));
    const acPower=power(compatible.filter(c=>/Type 2/i.test(String(c.ConnectionType?.Title||""))&&!/CCS/i.test(String(c.ConnectionType?.Title||""))));
    const access=item?.UsageType?.IsPayAtLocation===true?"unknown":
      item?.UsageType?.IsPublicAccess===false?"private":"unknown";
    const name=String(address.Title||"Stesen cas (nama OCM tidak direkodkan)").slice(0,100);
    out.push({id:"ocm:"+id,osmUrl:"https://openchargemap.org/site/poi/details/"+id,
      name,operator:String(item?.OperatorInfo?.Title||"Tidak direkodkan").slice(0,90),
      coordinates:[lon,lat],ac,dc,otherDC:false,
      type:dc&&ac?"AC/DC":dc?"DC":ac?"AC":"Tidak diketahui",
      acPowerKw:acPower.length?Math.max(...acPower):null,
      dcPowerKw:dcPower.length?Math.max(...dcPower):null,
      powerKw:dcPower.length?Math.max(...dcPower):acPower.length?Math.max(...acPower):null,
      access,roadProgress:clamp(projection.progress,0,1),
      kmAlong:clamp(projection.progress,0,1)*routeKm,offsetKm:projection.offsetKm,
      lastOsmChecked:"Tidak diketahui",notes:"Sumber: Open Charge Map",
      accessNeedsCheck:true,knownConnector:dc||ac,availability:"Tidak diketahui",
      sources:["OCM"]});
  }
  return out;
}
export function mergeChargingStations(osm=[],ocm=[]){
  const result=[];
  for(const station of [...osm.map(s=>({...s,sources:s.sources?.length?s.sources:["OSM"]})),...ocm]){
    const name=String(station.name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
    const previous=result.find(x=>{
      const other=String(x.name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
      return haversine(x.coordinates,station.coordinates)<.12&&
        (name===other||(!name||!other)||Math.min(name.length,other.length)<8);
    });
    if(!previous){result.push(station);continue;}
    previous.sources=[...new Set([...(previous.sources||[]),...(station.sources||[])])];
    // Never fuse power values across providers into an asserted actual output.
    // Preserve the original observation and mark any source discrepancy.
    if(previous.dc!==station.dc||previous.ac!==station.ac||
      previous.powerKw!==station.powerKw)previous.sourceConflict=true;
  }
  return result.sort((a,b)=>a.kmAlong-b.kmAlong).slice(0,300);
}
