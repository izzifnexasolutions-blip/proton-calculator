import {VEHICLES,PRESETS,REGIONS,estimate} from "./drive-sim-core.js";
const $=id=>document.getElementById(id);
const fmt=(v,d=1)=>Number(v).toLocaleString("ms-MY",{minimumFractionDigits:d,maximumFractionDigits:d});
const params=new URLSearchParams(location.search);
let variant=params.get("variant")==="prime"?"prime":"premium";
let routeKey=PRESETS[params.get("route")]?params.get("route"):"putrajaya";
let regionKey=REGIONS[params.get("region")]?params.get("region"):"malaysia";
let activeMapStyle="fiord",mapInitialized=false;
let result=null,map=null,mapReady=false,markers=[];
let raf=0,playing=false,progress=0,elapsed=0,startedAt=0;
const simulationMs=12000;
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
    tariff:parseFloat($("tariff").value)
  };
}
function updateAnimation(){
  if(!result)return;
  const kmDone=result.km*progress,kwhUsed=result.needed*progress;
  const currentSoc=Math.max(0,result.startSoc-kwhUsed/result.car.battery*100);
  $("battery-live").textContent=fmt(currentSoc,1)+"%";
  $("battery-label").textContent="Bateri selepas "+fmt(kmDone,1)+" km";
  const fill=$("battery-fill");
  fill.style.width=Math.min(100,currentSoc)+"%";
  fill.style.background=currentSoc<12?"#ff7581":currentSoc<28?"#f5cc76":"linear-gradient(90deg,#74dba7,#b6f3b8)";
  $("used-live").textContent=fmt(kwhUsed,2)+" kWh digunakan";
  $("left-live").textContent=fmt(Math.max(0,result.km-kmDone),1)+" km lagi";
  $("progress-fill").style.width=Math.round(progress*100)+"%";
  $("progress").setAttribute("aria-valuenow",String(Math.round(progress*100)));
  $("progress-text").textContent=Math.round(progress*100)+"% · "+(playing?"Sedang disimulasikan":progress>=1?"Selesai":"Belum bermula");
}
function animate(now){
  raf=0;if(!playing)return;
  if(!startedAt)startedAt=now;
  progress=Math.min(1,(elapsed+now-startedAt)/simulationMs);
  updateAnimation();
  if(progress>=1){playing=false;elapsed=simulationMs;$("play").textContent="↻ Mainkan semula";return;}
  raf=requestAnimationFrame(animate);
}
function invalid(message){
  result=null;stopSimulation();$("play").disabled=true;
  $("trip-status").textContent=message;$("trip-status").className="status bad";
}
function refresh(){
  stopSimulation();
  const raw=getInputs();
  if(!Number.isFinite(raw.distance)||raw.distance<1||raw.distance>1000){invalid("Masukkan jarak 1 hingga 1,000 km.");return;}
  if(!Number.isFinite(raw.speed)||raw.speed<25||raw.speed>130){invalid("Masukkan purata kelajuan antara 25 hingga 130 km/j.");return;}
  if(!Number.isFinite(raw.tariff)||raw.tariff<0||raw.tariff>5){invalid("Masukkan kadar elektrik antara RM0 hingga RM5/kWh.");return;}
  result=estimate(raw);
  $("play").disabled=false;
  $("variant-prime").classList.toggle("active",variant==="prime");
  $("variant-premium").classList.toggle("active",variant==="premium");
  $("variant-prime").setAttribute("aria-pressed",String(variant==="prime"));
  $("variant-premium").setAttribute("aria-pressed",String(variant==="premium"));
  const c=VEHICLES[variant];
  $("spec-line").textContent=fmt(c.battery,2)+" kWh · "+c.wltp+" km WLTP · "+c.powerKw+" kW / "+c.torqueNm+" Nm";
  $("soc-out").textContent=result.startSoc+"%";
  $("people-out").textContent=result.people+" orang";
  $("cargo-out").textContent=result.cargoKg+" kg";
  $("m-arrival").textContent=fmt(result.arrivalSoc,1)+"%";
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
  if(result.startSoc<=10){
    status.className="status warn";
    status.textContent="Bateri awal hampir pada had simpanan 10%. Cas dahulu sebelum memulakan perjalanan untuk margin keselamatan.";
  }else if(!result.reachAtAll){
    status.className="status bad";
    status.textContent="Tenaga permulaan tidak mencukupi mengikut anggaran. Rancang pengecasan sepanjang perjalanan.";
  }else if(!result.reachWithReserve){
    status.className="status warn";
    status.textContent="Baki di destinasi di bawah 10% SOC. Pertimbangkan tambahan sekitar "+fmt(result.extraEnergyToReserve,1)+" kWh untuk tiba dengan simpanan.";
  }else{
    status.className="status";
    status.textContent="Anggaran boleh tiba dengan sekurang-kurangnya 10% SOC. Semak juga keadaan sebenar dan pengecasan pada laluan.";
  }
  renderIntelligence(raw);
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
  if(!map.getSource("guide"))map.addSource("guide",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  if(!map.getLayer("guideHalo"))map.addLayer({id:"guideHalo",type:"line",source:"guide",
    paint:{"line-color":"#ff5378","line-width":8,"line-opacity":.22,"line-blur":4}});
  if(!map.getLayer("guideLine"))map.addLayer({id:"guideLine",type:"line",source:"guide",
    paint:{"line-color":"#ff6d95","line-width":3.5,"line-opacity":.96,"line-dasharray":[1.6,2]}});
  mapReady=true;$("map-fallback").hidden=true;
  updateMap(mapInitialized?"region":"overview");
  mapInitialized=true;
}
function initMap(){
  const fallback=$("map-fallback");
  if(!window.maplibregl){
    fallback.textContent="Peta tidak tersedia di rangkaian ini. Simulasi bateri tetap boleh digunakan.";
    return;
  }
  try{
    map=new window.maplibregl.Map({
      container:"map",style:"https://tiles.openfreemap.org/styles/"+activeMapStyle,
      center:REGIONS.malaysia.center,zoom:window.innerWidth<760?3.05:REGIONS.malaysia.zoom,minZoom:2.6,maxZoom:17,
      cooperativeGestures:true,attributionControl:true,renderWorldCopies:false
    });
    map.addControl(new window.maplibregl.NavigationControl({showCompass:false}),"top-right");
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
  $("ctx-road").textContent=labels.roads[result.road];
  $("ctx-surface").textContent=labels.surfaces[result.surface];
  $("ctx-traffic").textContent=labels.traffic[result.traffic];
  $("ctx-mode").textContent=labels.mode[result.mode];
  $("ctx-weather").textContent=result.rain?"Hujan (andaian)":"Kering (andaian)";
  $("hud-region").textContent=(REGIONS[tripRegion]?.short||"Malaysia").toUpperCase();
  $("hud-road").textContent=labels.roads[result.road].toUpperCase();
  const strip=$("verdict-strip");
  const isLow=result.startSoc<=10;
  const state=isLow||!result.reachWithReserve?(result.reachAtAll?"warn":"bad"):"safe";
  strip.dataset.state=state;
  let verdict=state==="safe"?"BOLEH SAMPAI":state==="bad"?"PERLU CAS":"AMARAN BATERI";
  let subtitle=state==="safe"?"Anggaran baki ≥10%":"Sediakan pengecasan tambahan";
  if(isLow){verdict="CAS DAHULU";subtitle="SOC mula ≤10%";}
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
  const compare={prime:estimate({...options,variant:"prime"}),premium:estimate({...options,variant:"premium"})};
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
  $(id).addEventListener("input",refresh);
  if(["distance","speed","tariff"].includes(id))$(id).addEventListener("change",refresh);
}
$("play").addEventListener("click",()=>{
  if(!result)return;
  if(progress>=1){stopSimulation();updateAnimation();}
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
$("reset").addEventListener("click",()=>{stopSimulation();updateAnimation()});
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
    "Bateri destinasi: "+fmt(result.arrivalSoc,1)+"%",
    "Kos elektrik berdasarkan tarif input: RM"+fmt(result.estimatedCost,2),
    "Status simpanan 10%: "+(result.reachWithReserve?"Anggaran cukup":"Rancang pengecasan"),
    "Wilayah: "+REGIONS[PRESETS[routeKey]?.region||regionKey].label,
    "Jenis jalan: "+$("road").selectedOptions[0].text,
    "Permukaan jalan (andaian): "+$("surface").selectedOptions[0].text,
    "Trafik (andaian): "+$("traffic").selectedOptions[0].text,
    "Jumlah tenaga tambahan untuk tiba pada 10%: "+fmt(result.extraEnergyToReserve,2)+" kWh",
    "Prime SOC tiba: "+fmt(estimate({...getInputs(),variant:"prime"}).arrivalSoc,1)+"%",
    "Premium SOC tiba: "+fmt(estimate({...getInputs(),variant:"premium"}).arrivalSoc,1)+"%",
    "Nota: Ini anggaran simulasi; bukan data bateri/traffic sebenar."
  ];
  try{
    await navigator.clipboard.writeText(lines.join("\n"));
    $("copy-status").textContent="Ringkasan berjaya disalin.";
  }catch(error){$("copy-status").textContent="Salinan automatik tidak tersedia. Sila salin nilai daripada skrin.";}
});
$("route").value=routeKey;
syncRoute(false);
window.addEventListener("load",initMap,{once:true});
