import {VEHICLES,PRESETS,REGIONS,estimate} from "./drive-sim-core.js";
import {createRoutePlanner} from "./drive-phase2.js";
import {SCENARIOS,calculateJourney,sampleJourney} from "./drive-smart-scenarios.js";
import {createSmartDashboard} from "./drive-smart-ui.js";
import {createPhase4Controls} from "./drive-phase4-controls.js";
import {createPhase5Planner} from "./drive-phase5.js?v=20261113perf";
import {WEST_COAST_CHARGERS} from "./west-coast-public-chargers.js";
import {createUserEvCatalog} from "./drive-user-catalog.js?v=20261113perf";
import {createJourneyExperience} from "./drive-journey-experience.js?v=20261113perf";
const $=id=>document.getElementById(id);
// Customer-facing layout: map and pinless search FIRST. Move the original
// card rather than cloning its DOM: all old calculator/3D IDs remain intact.
function arrangeMapFirst(){
  const card=$("route-heading")?.closest("section.card");
  const map=document.querySelector(".map-hero-wrap");
  const search=$("journey-search"),legend=$("journey-map-legend"),
    charge=$("charge-v2"),catalog=$("ev-upload-catalog"),timeline=$("journey-timeline");
  const shell=document.querySelector(".shell"),mast=document.querySelector(".mast");
  if(!card||!shell||!search||!map||!legend||!charge||!catalog||!timeline||!mast)return;
  card.classList.add("primary-map-card");
  shell.insertBefore(card,mast);
  search.after(map);
  map.after(legend);
  legend.after(charge);
  charge.after(catalog);
  catalog.after(timeline);
}
arrangeMapFirst();
const fmt=(v,d=1)=>Number(v).toLocaleString("ms-MY",{minimumFractionDigits:d,maximumFractionDigits:d});
const params=new URLSearchParams(location.search);
let variant=params.get("variant")==="prime"?"prime":"premium";
let routeKey=PRESETS[params.get("route")]?params.get("route"):"putrajaya";
let regionKey=REGIONS[params.get("region")]?params.get("region"):"malaysia";
let activeMapStyle="fiord",mapInitialized=false;
let result=null,map=null,mapReady=false,markers=[],routePlanner=null,smart=null,phase4=null,phase5=null,journey=null,evCatalog=null,selectedScenario="manual";
let raf=0,playing=false,progress=0,elapsed=0,startedAt=0;
let simulationMs=12000;
function renderChargeV2(){
 const panel=$("charge-v2");if(!panel)return;
 const route=routePlanner?.route,stations=phase5?.stations||[],plan=phase5?.plan||null,verified=phase5?.verified||null;
 const searched=phase5?.chargerScanStatus==="success";
 const set=(id,value)=>{$(id).textContent=value;};
 const step=(i,done)=>$("charge-v2-step"+i).classList.toggle("done",!!done);
 step(1,route);step(2,route&&searched);step(3,route&&verified?.safe);
 const soc=verified?.safe?verified.finishSoc:(route&&result&&result.reachAtAll?result.arrivalSoc:null);
 set("charge-v2-soc",soc==null?"—":fmt(soc,1)+"%");
 set("charge-v2-count",searched?stations.length+" rekod":"—");
 set("charge-v2-stops",plan?.kind==="none"?"Tidak perlu":plan?.stops?.length?plan.stops.length+" hentian":searched?"Tiada yang sesuai":"—");
 set("charge-v2-time",plan?.totalMinutesKnown!=null?"±"+fmt(plan.totalMinutesKnown,0)+" min":"—");
 set("charge-v2-source",searched?"Sumber: "+(stations.some(s=>s.sources?.includes("OCM"))?"OSM + OCM":"OSM"):"OSM / OCM jika tersedia");
 const button=$("charge-v2-action");button.disabled=!route;
 let state,label,desc,action,evidence;
 if(!route){
   [state,label,desc,action,evidence]=["idle","BELUM ADA LALUAN",
     WEST_COAST_CHARGERS.length+" lokasi sumber OCM dipaparkan sebagai pin emas. Pilih lokasi mula/destinasi dan kira laluan OSRM.",
     "① Kira laluan dahulu","27 pin rekod lokasi tersedia pada peta walaupun pelayan Overpass tidak dapat dihubungi; status aktif belum diketahui."];
 }else if(!searched){
   [state,label,desc,action,evidence]=["search","SEDIA CARI PENGECAS",
     "Laluan dikira. Tekan carian untuk gabungkan stesen berhampiran daripada katalog Pantai Barat dan sumber OSM.",
     "② Cari pengecas laluan","Carian atas permintaan sahaja; status aktif pengecas tidak tersedia secara langsung."];
 }else if(verified?.safe){
   [state,label,desc,action,evidence]=["verified","JALAN DISAHKAN OSRM",
     "Laluan melalui hentian disemak. SOC dan masa cas masih anggaran.",
     "✓ Semak semula laluan","Semakan OSRM bukan bukti pengecas aktif. Sahkan dengan operator."];
 }else if(plan?.stops?.length){
   [state,label,desc,action,evidence]=["warn","HENTIAN BELUM DISAHKAN",
     plan.stops.length+" hentian dicadangkan. Sahkan jarak jalan dan baki bateri.",
     "③ Semak jalan & SOC","Jarak geografi bukan lencongan memandu. Semak OSRM dahulu."];
 }else{
   [state,label,desc,action,evidence]=[plan?.kind==="none"?"verified":"warn",
     plan?.kind==="none"?"ANGGARAN TAK PERLU CAS":"TIADA HENTIAN SESUAI",
     plan?.message||"Belum ada hentian dicadangkan daripada data semasa.",
     "↻ Cari semula pengecas","Tiada rekod bukan bukti tiada pengecas di lokasi."];
 }
 panel.dataset.state=state;
 set("charge-v2-state",label);set("charge-v2-message",desc);
 button.textContent=action;set("charge-v2-evidence",evidence);
}
function stopSimulation(){
  if(raf)cancelAnimationFrame(raf);
  raf=0;playing=false;progress=0;elapsed=0;startedAt=0;
  $("play").textContent="▶ Jalankan simulasi 12 saat";
}
function getInputs(){
  return {
    variant,distance:parseFloat($("distance").value),speed:parseFloat($("speed").value),
    soc:parseFloat($("soc").value),people:parseInt($("people").value,10),cargo:parseFloat($("cargo").value),
    road:$("road").value,mode:$("mode").value,traffic:$("traffic").value,surface:$("surface").value,
    ac:$("ac").checked,rain:$("rain").checked,
    batteryHealth:parseFloat($("battery-health").value),temperature:$("temperature").value,
    wind:$("wind").value,slope:$("slope").value,tire:$("tire").value,
    hvac:$("hvac").value,regen:$("regen").value,
    night:$("night").checked,aggressive:$("aggressive").checked,
    tariff:parseFloat($("tariff").value)
  };
}
function updateAnimation(){
  if(!result)return;
  const reading=sampleJourney(result,progress);
  if(!reading)return;
  // Do not imply that a depleted vehicle can still finish the trip.
  const limit=Math.min(1,result.stopAtKm/result.km);
  const kmDone=reading.km,kwhUsed=reading.kwh,currentSoc=reading.soc;
  $("battery-live").textContent=fmt(currentSoc,1)+"%";
  $("battery-label").textContent="Anggaran selepas "+fmt(kmDone,1)+" km";
  const fill=$("battery-fill");
  fill.style.width=Math.min(100,currentSoc)+"%";
  fill.style.background=currentSoc<12?"#ff7581":currentSoc<28?"#f5cc76":"linear-gradient(90deg,#74dba7,#b6f3b8)";
  $("used-live").textContent=fmt(kwhUsed,2)+" kWh daripada "+fmt(result.needed,2)+" kWh perlu";
  $("left-live").textContent=fmt(Math.max(0,result.km-kmDone),1)+" km belum dilalui";
  $("progress-fill").style.width=Math.round(progress*100)+"%";
  $("progress").setAttribute("aria-valuenow",String(Math.round(progress*100)));
  const depleted=limit<1-1e-7&&progress>=limit-1e-7;
  $("progress-text").textContent=Math.round(progress*100)+"% · "+(depleted?"Bateri habis sebelum tiba":playing?"Simulasi sedang berjalan":progress>=1?"Selesai":"Sedia");
  const mapAnimating=routePlanner?.onDriveProgress(progress,result)||false;
  smart?.frame(result,{...reading,canStillDrive:!depleted},playing&&!depleted,mapAnimating);
  const realZone=phase5?.onDrive(kmDone);
  // Apply a route scene only when OSRM or SRTM provides an identifiable
  // category. Unknown roads keep the user's scenario, not invented facts.
  const originalSettings=reading.stage?.settings||{};
  const roadKind=realZone?.kind;
  const actualRoad=roadKind==="highway"?"highway":roadKind==="rural"?"rural":
    roadKind==="hilly"?"hilly":null;
  const driveReading=realZone&&actualRoad?{...reading,stage:{
    ...reading.stage,settings:{...originalSettings,road:actualRoad,
      ...(realZone.type==="uphill"?{slope:"up"}:
        realZone.type==="downhill"?{slope:"down"}:{})}
  }}:reading;
  phase4?.render(result,progress,playing&&!depleted,{...driveReading,canStillDrive:!depleted});
  journey?.setProgress(kmDone);
  if(realZone&&realZone.kind!=="unknown")
    $("drive-current-zone").textContent=realZone.label+" · data laluan";
}
function animate(now){
  raf=0;if(!playing)return;
  if(!startedAt)startedAt=now;
  const maxProgress=Math.min(1,Math.max(0,result?.stopAtKm/result?.km||0));
  progress=Math.min(maxProgress,(elapsed+now-startedAt)/simulationMs);
  updateAnimation();
  if(progress>=maxProgress-1e-7){
    playing=false;elapsed=simulationMs;
    $("play").textContent=maxProgress<1?"↻ Ulang · perlu cas":"↻ Mainkan semula";
    smart?.frame(result,{...sampleJourney(result,progress),canStillDrive:maxProgress>=1},false,routePlanner?.hasActualRoute||false);
    phase4?.render(result,progress,false,{...sampleJourney(result,progress),canStillDrive:maxProgress>=1});
    return;
  }
  raf=requestAnimationFrame(animate);
}
function invalid(message){
  result=null;stopSimulation();$("play").disabled=true;
  $("trip-status").textContent=message;$("trip-status").className="status bad";
  for(const id of ["m-arrival","m-range","m-use","m-distance","m-cost","r-energy","r-duration",
    "r-range","r-topup","scenario-best","scenario-normal","scenario-worst",
    "cmp-prime-soc","cmp-premium-soc","verdict-soc"]){
    $(id).textContent="—";
  }
  $("verdict-title").textContent="BELUM DIKIRA";
  $("verdict-subtitle").textContent="Pilih laluan / jarak dan tekan Kira";
  $("charging-head").textContent="Laluan belum dikira";
  $("charging-detail").textContent="Dapatkan jarak jalan daripada OSRM atau masukkan jarak secara manual.";
  $("compare-summary").textContent="Keputusan memerlukan jarak perjalanan yang sah.";
  $("battery-live").textContent="—";
  $("battery-fill").style.width="0%";
  $("progress-fill").style.width="0%";
  routePlanner?.onEstimate(null);
  routePlanner?.onDriveProgress(0,null);
  phase5?.onBatteryChanged();
  smart?.render(null);
  phase4?.render(null,0,false,null);
  journey?.resetTimeline();
}
function refresh(){
  stopSimulation();
  const raw=getInputs();
  if(!Number.isFinite(raw.distance)||raw.distance<1||raw.distance>1000){invalid("Masukkan jarak 1 hingga 1,000 km.");return;}
  if(!Number.isFinite(raw.speed)||raw.speed<25||raw.speed>130){invalid("Masukkan purata kelajuan antara 25 hingga 130 km/j.");return;}
  if(!Number.isFinite(raw.tariff)||raw.tariff<0||raw.tariff>5){invalid("Masukkan kadar elektrik antara RM0 hingga RM5/kWh.");return;}
  result=calculateJourney(raw,selectedScenario);
  journey?.setSOC(result.startSoc);
  $("play").disabled=false;
  $("variant-prime").classList.toggle("active",variant==="prime");
  $("variant-premium").classList.toggle("active",variant==="premium");
  $("variant-prime").setAttribute("aria-pressed",String(variant==="prime"));
  $("variant-premium").setAttribute("aria-pressed",String(variant==="premium"));
  journey?.setVariant(variant);
  const c=VEHICLES[variant];
  $("spec-line").textContent=fmt(c.battery,2)+" kWh · "+c.wltp+" km WLTP · "+c.powerKw+" kW / "+c.torqueNm+" Nm";
  $("soc-out").textContent=result.startSoc+"%";
  $("people-out").textContent=result.people+" orang";
  $("cargo-out").textContent=result.cargoKg+" kg";
  $("m-arrival").textContent=result.reachAtAll?fmt(result.arrivalSoc,1)+"%":"0%*";
  const socMetric=$("m-arrival").closest?.(".metric");
  if(socMetric)socMetric.dataset.state=!result.reachAtAll?"bad":!result.reachWithReserve?"warn":"safe";
  $("m-range").textContent=fmt(result.rangeAtArrival,0);
  const dial=$("metric-dial");
  if(dial)dial.style.setProperty("--soc-angle",Math.max(0,Math.min(360,result.arrivalSoc*3.6))+"deg");
  $("m-use").textContent=fmt(result.kwh100,1);
  $("m-distance").textContent=fmt(result.km,1);
  $("m-cost").textContent="RM"+fmt(result.estimatedCost,2);
  $("r-energy").textContent=fmt(result.needed,2);
  const roundedMinutes=Math.round(result.travelMinutes),hours=Math.floor(roundedMinutes/60),mins=roundedMinutes%60;
  $("r-duration").textContent=hours+"j "+mins+"m";
  $("r-range").textContent=fmt(result.rangeWithReserve,0);
  $("r-topup").textContent=fmt(result.extraEnergyToReserve,2);
  $("scenario-best").textContent=fmt(result.arrivalHigh,0)+"%";
  $("scenario-normal").textContent=fmt(result.arrivalSoc,0)+"%";
  $("scenario-worst").textContent=fmt(result.arrivalLow,0)+"%";
  const status=$("trip-status");
  if(!result.reachAtAll){
    status.className="status bad";
    status.textContent="BATERI TIDAK CUKUP: anggaran kereta berhenti pada km "+fmt(result.stopAtKm,1)+" daripada "+fmt(result.km,1)+" km. Kos/tenaga di atas ialah keperluan untuk melengkapkan seluruh perjalanan, bukan tenaga yang tersedia sekarang.";
  }else if(result.startSoc<=10){
    status.className="status warn";
    status.textContent="Bateri awal hampir pada had simpanan 10%. Cas dahulu sebelum memulakan perjalanan untuk margin keselamatan.";
  }else if(!result.reachWithReserve){
    status.className="status warn";
    status.textContent="Baki di destinasi di bawah 10% SOC. Pertimbangkan tambahan sekitar "+fmt(result.extraEnergyToReserve,1)+" kWh untuk tiba dengan simpanan.";
  }else{
    status.className="status";
    status.textContent="Anggaran boleh tiba dengan sekurang-kurangnya 10% SOC. Semak juga keadaan sebenar dan pengecasan pada laluan.";
  }
  renderIntelligence(raw);
  routePlanner?.onEstimate(result);
  smart?.render(result);
  phase5?.onBatteryChanged();
  renderChargeV2();
  updateAnimation();
}
function syncRoute(focus=true){
  routeKey=$("route").value;
  const preset=PRESETS[routeKey];
  if(preset){
    $("distance").value=preset.km;
    $("speed").value=preset.speed;
    $("road").value=preset.road;
    $("route-names").textContent=preset.origin+" → "+preset.destination;
    $("route-source").hidden=false;
    $("route-source").href=preset.source;
  }else{
    $("route-names").textContent="Jarak sendiri · tiada laluan automatik atau geocoding.";
    $("route-source").hidden=true;
  }
  syncUrl();
  phase5?.reset();
  routePlanner?.onPresetChanged(preset);
  if(preset)journey?.setPreset(routeKey);
  else journey?.resetTimeline();
  refresh();updateMap(focus==="region"?"region":focus?"route":"overview");renderRegions();
}
function updateMap(focus="route"){
  if(!mapReady||!map)return;
  const preset=PRESETS[routeKey],region=REGIONS[regionKey]||REGIONS.malaysia;
  for(const marker of markers)marker.remove();markers=[];
  const source=map.getSource("guide");
  if(source)source.setData({type:"FeatureCollection",features:preset?[{
    type:"Feature",properties:{purpose:"locators-only"},geometry:{type:"LineString",coordinates:[preset.from,preset.to]}
  }]:[]});
  if(preset&&window.maplibregl){
    const mk=(color,coords,label)=>new window.maplibregl.Marker({color}).setLngLat(coords)
      .setPopup(new window.maplibregl.Popup().setText(label)).addTo(map);
    markers=[
      mk("#f7d692",preset.from,"Mula: "+preset.origin),
      mk("#f65c7a",preset.to,"Destinasi: "+preset.destination)
    ];
  }
  if(focus==="overview"){map.flyTo({center:REGIONS.malaysia.center,zoom:window.innerWidth<760?3.05:REGIONS.malaysia.zoom,duration:550});return;}
  if(focus==="region"||!preset){map.flyTo({center:region.center,zoom:region.zoom,duration:550});return;}
  if(window.maplibregl){
    const bounds=new window.maplibregl.LngLatBounds(preset.from,preset.to);
    map.fitBounds(bounds,{padding:55,maxZoom:10.8,duration:650});
  }
}
function installMapGuide(){
  if(!map)return;
  // Both style.load and load can fire on the initial render. Avoid a second
  // batch of source setup and an unwanted camera jump on the same style.
  if(mapReady&&map.getSource("guide"))return;
  if(!map.getSource("guide"))map.addSource("guide",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  if(!map.getLayer("guideHalo"))map.addLayer({id:"guideHalo",type:"line",source:"guide",
    paint:{"line-color":"#ff5378","line-width":8,"line-opacity":.22,"line-blur":4}});
  if(!map.getLayer("guideLine"))map.addLayer({id:"guideLine",type:"line",source:"guide",
    paint:{"line-color":"#ff6d95","line-width":3.5,"line-opacity":.96,"line-dasharray":[1.6,2]}});
  mapReady=true;$("map-fallback").hidden=true;
  updateMap(mapInitialized?"region":PRESETS[routeKey]?"route":"region");
  routePlanner?.onMapReady();
  phase5?.onMapReady();
  journey?.onMapReady();
  evCatalog?.onMapReady();
  mapInitialized=true;
}
function initMap(){
  const fallback=$("map-fallback");
  if(!window.maplibregl){
    fallback.textContent="Peta tidak tersedia di rangkaian ini. Simulasi bateri tetap boleh digunakan.";
    return;
  }
  try{
    const startPreset=PRESETS[routeKey];
    const startCenter=startPreset?
      [(startPreset.from[0]+startPreset.to[0])/2,(startPreset.from[1]+startPreset.to[1])/2]:
      (REGIONS[regionKey]||REGIONS.malaysia).center;
    const startZoom=startPreset?6.4:(REGIONS[regionKey]||REGIONS.malaysia).zoom;
    map=new window.maplibregl.Map({
      container:"map",style:"https://tiles.openfreemap.org/styles/"+activeMapStyle,
      center:startCenter,zoom:startZoom,minZoom:2.6,maxZoom:17,
      cooperativeGestures:true,attributionControl:true,renderWorldCopies:false
    });
    map.addControl(new window.maplibregl.NavigationControl({showCompass:false}),"top-right");
    map.on("click",e=>{
      // Avoid treating a click on a user-supplied, unverified station pin
      // as a request to move a journey start/end coordinate.
      if(map.getLayer("evUserUnverifiedDots")&&
         map.queryRenderedFeatures(e.point,{layers:["evUserUnverifiedDots"]}).length)return;
      routePlanner?.onMapClick(e.lngLat);
    });
    map.on("load",installMapGuide);
    map.on("style.load",installMapGuide);
    map.on("error",()=>{
      if(!mapReady)fallback.textContent="Peta gagal dimuatkan. Simulasi bateri masih boleh digunakan.";
    });
    window.addEventListener("resize",()=>map?.resize());
  }catch(error){
    fallback.textContent="Peta tidak dapat dipaparkan. Pengiraan bateri tetap boleh digunakan.";
  }
}
function syncUrl(){
  const p=new URLSearchParams({variant,region:regionKey});
  if(PRESETS[routeKey])p.set("route",routeKey);
  history.replaceState(null,"","?"+p.toString());
}
function renderRegions(){
  const region=REGIONS[regionKey]||REGIONS.malaysia;
  $("region-name").textContent=region.label;
  $("region-detail").textContent=region.notes;
  for(const chip of document.querySelectorAll(".region-chip")){
    const active=chip.dataset.region===regionKey;
    chip.classList.toggle("active",active);
    chip.setAttribute("aria-pressed",String(active));
  }
  const wrap=$("quick-routes");
  wrap.replaceChildren();
  const entries=Object.entries(PRESETS).filter(([,route])=>regionKey==="malaysia"||route.region===regionKey);
  for(const [key,route] of entries){
    const button=document.createElement("button");
    button.className="route-chip"+(key===routeKey?" active":"");
    button.type="button";
    button.setAttribute("aria-pressed",String(key===routeKey));
    const name=document.createElement("strong");name.textContent=route.name;
    const distance=document.createElement("span");distance.textContent=fmt(route.km,1)+" km · rujukan";
    button.append(name,distance);
    button.addEventListener("click",()=>{
      if(routeKey===key){updateMap("route");return;}
      $("route").value=key;routeKey=key;syncRoute(true);
    });
    wrap.append(button);
  }
}
function selectRegion(key){
  if(!REGIONS[key])return;
  regionKey=key;
  const region=REGIONS[key];
  if(key!=="malaysia"){
    $("route").value=region.route;
    routeKey=region.route;
    syncRoute("region");
  }else{
    renderRegions();syncUrl();updateMap("overview");
    refresh();
  }
}
function renderIntelligence(options){
  if(!result)return;
  const labels={
    roads:{city:"Bandar",mixed:"Campuran",highway:"Lebuh raya",hilly:"Berbukit",rural:"Jalan kampung"},
    surfaces:{smooth:"Baik / rata",rough:"Kasar",uneven:"Tidak rata"},
    traffic:{light:"Lancar",moderate:"Sederhana",heavy:"Sesak"},
    mode:{eco:"Eco",normal:"Normal",sport:"Sport"}
  };
  const tripRegion=PRESETS[routeKey]?.region||regionKey;
  $("ctx-region").textContent=REGIONS[tripRegion]?.short||"Malaysia";
  $("ctx-road").textContent=result.composite?"7 zon berbeza":labels.roads[result.road];
  $("ctx-surface").textContent=result.composite?"Ikut zon":labels.surfaces[result.surface];
  $("ctx-traffic").textContent=result.composite?"Ikut zon":labels.traffic[result.traffic];
  $("ctx-mode").textContent=labels.mode[result.mode];
  $("ctx-weather").textContent=result.composite?"Campuran 7 zon":result.rain?"Hujan (andaian)":"Kering (andaian)";
  $("hud-region").textContent=(REGIONS[tripRegion]?.short||"Malaysia").toUpperCase();
  $("hud-road").textContent=result.composite?"7 ZON":labels.roads[result.road].toUpperCase();
  const strip=$("verdict-strip");
  const isLow=result.startSoc<=10;
  const state=isLow||!result.reachWithReserve?(result.reachAtAll?"warn":"bad"):"safe";
  strip.dataset.state=state;
  let verdict=state==="safe"?"BOLEH SAMPAI":state==="bad"?"PERLU CAS":"AMARAN BATERI";
  let subtitle=state==="safe"?"Anggaran baki ≥10%":"Sediakan pengecasan tambahan";
  if(isLow&&result.reachAtAll){verdict="CAS DAHULU";subtitle="SOC mula ≤10%";}
  $("verdict-title").textContent=verdict;
  $("verdict-subtitle").textContent=subtitle;
  $("verdict-soc").textContent=fmt(result.arrivalSoc,0)+"%";
  const head=$("charging-head"),detail=$("charging-detail");
  if(result.extraEnergyToReserve>.005){
    head.textContent="Tambah sekurang-kurangnya "+fmt(result.extraEnergyToReserve,1)+" kWh";
    detail.textContent="Tenaga tambahan teoritikal untuk tiba dengan 10% SOC. Cas sebelum atau semasa perjalanan dan tambah margin untuk keadaan sebenar. Tiada stesen/masa DC disahkan.";
  }else{
    head.textContent="Tidak perlu top-up mengikut anggaran";
    detail.textContent="Anggaran baki "+fmt(result.arrivalSoc,1)+"% SOC dan buffer "+fmt(result.rangeAtArrival,0)+" km hingga 10%. Semak bateri, suhu dan lokasi pengecas sebenar.";
  }
  const compare={prime:calculateJourney({...options,variant:"prime"},selectedScenario),premium:calculateJourney({...options,variant:"premium"},selectedScenario)};
  for(const key of ["prime","premium"]){
    const item=compare[key];
    $("cmp-"+key+"-soc").textContent=fmt(item.arrivalSoc,1)+"%";
    const bar=$("cmp-"+key+"-bar");
    bar.style.width=Math.max(0,Math.min(item.arrivalSoc,100))+"%";
    bar.style.opacity=item.arrivalSoc<10?".60":"1";
    $("cmp-"+key+"-note").textContent=
      (item.reachWithReserve?"Baki ≥10%":"Perlu tambah cas")+" · "+
      fmt(item.needed,1)+" kWh untuk perjalanan";
  }
  const delta=compare.premium.rawArrivalSoc-compare.prime.rawArrivalSoc;
  $("compare-summary").textContent="Dengan andaian sama, Premium mempunyai "+
    fmt(Math.abs(delta),1)+" mata peratus "+
    (delta>=0?"lebih tinggi":"lebih rendah")+
    " SOC di destinasi berbanding Prime. Perbandingan ini anggaran, bukan ujian jalan sebenar.";
}
for(const chip of document.querySelectorAll(".region-chip")){
  chip.addEventListener("click",()=>selectRegion(chip.dataset.region));
}
$("map-reset").addEventListener("click",()=>selectRegion("malaysia"));
$("map-style").addEventListener("click",()=>{
  activeMapStyle=activeMapStyle==="fiord"?"liberty":"fiord";
  $("map-style").textContent=activeMapStyle==="fiord"?"☾ Digital Dark":"☀ Peta Cerah";
  if(map){mapReady=false;map.setStyle("https://tiles.openfreemap.org/styles/"+activeMapStyle);}
});
function chooseVariant(choice){
  variant=choice;
  syncUrl();
  refresh();
}
$("variant-prime").addEventListener("click",()=>chooseVariant("prime"));
$("variant-premium").addEventListener("click",()=>chooseVariant("premium"));
$("route").addEventListener("change",()=>{const preset=PRESETS[$("route").value];if(preset)regionKey=preset.region||"malaysia";syncRoute(true);});
for(const id of ["distance","speed","soc","people","cargo","road","mode","traffic","surface","ac","rain","tariff"]){
  $(id).addEventListener("input",()=>{
    if(selectedScenario!=="all"&&selectedScenario!=="manual"){
      selectedScenario="manual";smart?.setActive("manual");
    }
    refresh();
  });
  if(["distance","speed","tariff"].includes(id))$(id).addEventListener("change",refresh);
}
$("play").addEventListener("click",()=>{
  if(!result)return;
  if(progress>=1||progress>=Math.min(1,result.stopAtKm/result.km)-1e-7){stopSimulation();updateAnimation();}
  if(playing){
    playing=false;if(startedAt)elapsed=Math.min(simulationMs,elapsed+performance.now()-startedAt);
    startedAt=0;if(raf)cancelAnimationFrame(raf);raf=0;
    $("play").textContent="▶ Sambung simulasi";
    $("progress-text").textContent=Math.round(progress*100)+"% · Dijeda";
    return;
  }
  playing=true;startedAt=0;
  $("play").textContent="Ⅱ Jeda simulasi";
  raf=requestAnimationFrame(animate);
});
$("reset").addEventListener("click",()=>{stopSimulation();updateAnimation();smart?.resetFrame();});
$("copy").addEventListener("click",async()=>{
  if(!result)return;
  const route=PRESETS[routeKey];
  const lines=[
    "FARIS PROTON — e.MAS 5 Battery & Range Lab (anggaran)",
    "Varian: "+result.car.name,
    "Perjalanan: "+(route?.name||"Jarak sendiri"),
    "Jarak: "+fmt(result.km,1)+" km (rujukan/input)",
    "Bateri mula: "+result.startSoc+"%",
    "Purata kelajuan andaian: "+result.speed+" km/j",
    "Penggunaan tenaga: "+fmt(result.kwh100,1)+" kWh/100 km",
    "Tenaga diperlukan: "+fmt(result.needed,2)+" kWh",
    "Bateri destinasi: "+(result.reachAtAll?fmt(result.arrivalSoc,1)+"%":"TIDAK SAMPAI, habis sekitar km "+fmt(result.stopAtKm,1)),
    "Senario: "+result.scenarioName,
    "Kesihatan bateri (andaian): "+result.batteryHealth+"%",
    "Tenaga tambah ke 10%: "+fmt(result.extraEnergyToReserve,2)+" kWh",
    "Kos elektrik berdasarkan tarif input: RM"+fmt(result.estimatedCost,2),
    "Status simpanan 10%: "+(result.reachWithReserve?"Anggaran cukup":"Rancang pengecasan"),
    "Wilayah: "+REGIONS[PRESETS[routeKey]?.region||regionKey].label,
    "Jenis jalan: "+$("road").selectedOptions[0].text,
    "Permukaan jalan (andaian): "+$("surface").selectedOptions[0].text,
    "Trafik (andaian): "+$("traffic").selectedOptions[0].text,
    "Jumlah tenaga tambahan untuk tiba pada 10%: "+fmt(result.extraEnergyToReserve,2)+" kWh",
    "Prime SOC tiba (senario sama): "+fmt(calculateJourney({...getInputs(),variant:"prime"},selectedScenario).arrivalSoc,1)+"%",
    "Premium SOC tiba (senario sama): "+fmt(calculateJourney({...getInputs(),variant:"premium"},selectedScenario).arrivalSoc,1)+"%",
    "Nota: Ini anggaran simulasi; bukan data bateri/traffic sebenar."
  ];
  if(result.composite){
    lines.push("PECAHAN 7 ZON (SEMUA KEADAAN SINTETIK):");
    for(const part of result.segments){
      lines.push("- "+part.name+": "+fmt(part.km,1)+" km / "+fmt(part.kwh,1)+" kWh / "+fmt(part.speed,0)+" km/j");
    }
  }
  try{
    await navigator.clipboard.writeText(lines.join("\n"));
    $("copy-status").textContent="Ringkasan berjaya disalin.";
  }catch(error){$("copy-status").textContent="Salinan automatik tidak tersedia. Sila salin nilai daripada skrin.";}
});
const scenarioDefaults={
  speed:75,road:"mixed",traffic:"light",surface:"smooth",mode:"normal",
  people:2,cargo:15,rain:false,ac:true,batteryHealth:100,
  temperature:"mild",wind:"calm",slope:"flat",tire:"normal",
  hvac:"normal",regen:"normal",night:false,aggressive:false
};
function applyScenarioInputs(id,settings){
  selectedScenario=id;
  // The master journey owns speed, road, rain and traffic on each segment.
  // Those global fields are unavailable while the 7-zone model is active.
  const perZone=["speed","road","mode","traffic","surface","ac","rain","temperature","wind","slope","hvac","regen"];
  for(const field of perZone){const el=$(field);if(el)el.disabled=id==="all";}
  $("smart-advanced").open=id==="worst"||id==="battery";
  if(id==="all"){
    // Each zone has its own speed, road, rain and gradient. Reset the inherited
    // route parameters so the master result does not depend on which preset
    // happened to be clicked immediately beforehand. Preserve SOC, SOH, load.
    const zoneDefaults={...scenarioDefaults};
    for(const keep of ["people","cargo","batteryHealth"])delete zoneDefaults[keep];
    for(const [field,value] of Object.entries(zoneDefaults)){
      const el=$(field);if(!el)continue;
      if(typeof value==="boolean")el.checked=value;else el.value=String(value);
    }
  }else{
    // Scenario settings reset previous optional stress factors. Keep the user's
    // distance, initial SOC and tariff untouched.
    for(const [field,value] of Object.entries({...scenarioDefaults,...settings})){
      const inputId=field==="batteryHealth"?"battery-health":field;
      const el=$(inputId);if(!el)continue;
      if(typeof value==="boolean")el.checked=value;
      else el.value=String(value);
    }
  }
  $("battery-health-out").textContent=$("battery-health").value+"%";
  refresh();
}
smart=createSmartDashboard({
  onSelect:applyScenarioInputs,
  onAdvancedChange:()=>{
    // Editing a preset makes it user-customised, except the composite "all"
    // mode, which deliberately keeps user SOC/load/SOH and zone assumptions.
    if(selectedScenario!=="all"&&selectedScenario!=="manual"){
      selectedScenario="manual";smart?.setActive("manual");
    }
    $("battery-health-out").textContent=$("battery-health").value+"%";
    refresh();
  },
  onPlay:()=>{$("play").click();$("drive-theatre").scrollIntoView?.({block:"center",behavior:"smooth"});},
  onReset:()=>{$("reset").click();}
});
phase4=createPhase4Controls({
  getSnapshot:()=>({
    result,progress,playing,reading:result?sampleJourney(result,progress):null
  }),
  onSeek:fraction=>{
    if(!result)return;
    if(raf)cancelAnimationFrame(raf);
    raf=0;playing=false;startedAt=0;
    const limit=Math.min(1,Math.max(0,result.stopAtKm/result.km));
    progress=Math.max(0,Math.min(fraction,limit));
    elapsed=progress*simulationMs;
    $("play").textContent=progress>=limit-1e-7?
      (limit<1?"↻ Ulang · perlu cas":"↻ Mainkan semula"):
      "▶ Sambung simulasi";
    updateAnimation();
  },
  onRate:rate=>{
    simulationMs=12000/rate;
    elapsed=progress*simulationMs;
    startedAt=playing?performance.now():0;
    if(result)updateAnimation();
  }
});
function refreshJourneyView(){
  renderChargeV2();
  if(!journey)return;
  const realRoute=routePlanner?.route;
  if(!realRoute||!result){journey.resetTimeline();return;}
  const inputs=getInputs();
  journey.render({
    route:{...realRoute,startName:routePlanner.start?.name||"Mula",
      endName:routePlanner.end?.name||"Destinasi"},
    result,
    profile:phase5?.profile||[],
    places:phase5?.places||[],
    plan:phase5?.plan||null,
    stations:phase5?.stations||[],
    chargerStatus:phase5?.chargerScanStatus||"not_checked",
    settings:{speed:inputs.speed,people:inputs.people,cargoKg:inputs.cargo,
      rain:inputs.rain,traffic:inputs.traffic,mode:inputs.mode}
  });
}
routePlanner=createRoutePlanner({
  PRESETS,
  mapProvider:()=>map,
  mapReadyProvider:()=>mapReady,
  format:fmt,
  onRouteApplied:route=>{
    // Real OSRM distance takes precedence over an illustrative route preset.
    routeKey="custom";
    // Zone from the destination is a coordinate-based orientation only,
    // not an authoritative state boundary or geocoder result.
    const xy=route.endCoords||[];
    const [longitude,latitude]=xy;
    if(longitude>=114)regionKey="sabah";
    else if(longitude>=109)regionKey="sarawak";
    else if(longitude>=102.7&&latitude>=2.5||longitude>=102&&latitude>=5.3)regionKey="east";
    else if(latitude>=4.5)regionKey="north";
    else if(latitude<=2.65)regionKey="south";
    else regionKey="central";
    $("route").value="custom";
    $("distance").value=route.km;
    $("route-names").textContent=route.start+" → "+route.end+" · Laluan jalan OSRM";
    $("route-source").hidden=true;
    syncUrl();
    refresh();
    renderRegions();
    updateMap("region");
    phase5?.onRoute(routePlanner?.route);
    return result;
  },
  onRouteInvalidated:()=>{
    phase5?.reset();
    renderChargeV2();
    journey?.resetTimeline();
    // Invalidate the old route's battery output rather than leaving stale SOC.
    routeKey="custom";
    $("route").value="custom";
    $("distance").value="";
    $("route-names").textContent="Titik mula/destinasi baru · jarak jalan belum dikira.";
    $("route-source").hidden=true;
    syncUrl();
    refresh();
    // Remove old dashed preset reference immediately; do not zoom the map
    // away while the user is in the middle of dropping pins.
    const oldGuide=map?.getSource?.("guide");
    if(oldGuide)oldGuide.setData({type:"FeatureCollection",features:[]});
  }
});
phase5=createPhase5Planner({
  getRoute:()=>routePlanner?.route,
  getResult:()=>result,
  getMap:()=>map,
  mapReady:()=>mapReady,
  onUpdated:refreshJourneyView
});
journey=createJourneyExperience({
  PRESETS,
  getRoute:()=>routePlanner?.route,
  getResult:()=>result,
  getProfile:()=>phase5?.profile||[],
  getPlaces:()=>phase5?.places||[],
  getPlan:()=>phase5?.plan||null,
  getInputSettings:getInputs,
  getMap:()=>map,
  mapReady:()=>mapReady,
  onVariantChange:chooseVariant,
  onSOCChange:value=>{
    $("soc").value=String(value);
    refresh();
  },
  onChargerSearch:()=>phase5?.scan(),
  onSearchEdited:()=>routePlanner?.clearSearchRoute(),
  onPresetChange:key=>{
    const preset=PRESETS[key];
    if(preset)regionKey=preset.region||"malaysia";
    $("route").value=key;
    syncRoute(true);
  },
  onRouteRequest:async(from,to)=>{
    if(!routePlanner?.setSearchEndpoints(from,to))return false;
    await routePlanner.calculate();
    return !!routePlanner.hasActualRoute;
  }
});
$("charge-v2-action").addEventListener("click",async()=>{
  if(!routePlanner?.route)return;
  const button=$("charge-v2-action");button.disabled=true;
  try{
    if(phase5?.chargerScanStatus!=="success"||!phase5?.plan?.stops?.length)await phase5?.scan();
    else await phase5?.verify();
  }finally{renderChargeV2();}
});
$("charge-v2-detail").addEventListener("click",()=>{
  $("phase5-hub")?.scrollIntoView({behavior:"smooth",block:"start"});
});
$("route").value=routeKey;
syncRoute(false);
journey.setPreset(routeKey);
journey.setVariant(variant);
journey.setSOC($("soc").value);
evCatalog=createUserEvCatalog(()=>map);
window.addEventListener("load",initMap,{once:true});
