import {VEHICLES,PRESETS,estimate} from "./drive-sim-core.js";
const $=id=>document.getElementById(id);
const fmt=(v,d=1)=>Number(v).toLocaleString("ms-MY",{minimumFractionDigits:d,maximumFractionDigits:d});
const params=new URLSearchParams(location.search);
let variant=params.get("variant")==="prime"?"prime":"premium";
let routeKey=PRESETS[params.get("route")]?params.get("route"):"putrajaya";
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
    road:$("road").value,mode:$("mode").value,ac:$("ac").checked,rain:$("rain").checked,
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
  $("m-use").textContent=fmt(result.kwh100,1);
  $("m-distance").textContent=fmt(result.km,1);
  $("m-cost").textContent="RM"+fmt(result.estimatedCost,2);
  $("r-energy").textContent=fmt(result.needed,2);
  const hours=Math.floor(result.travelMinutes/60),mins=Math.round(result.travelMinutes%60);
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
  updateAnimation();
}
function syncRoute(){
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
  history.replaceState(null,"","?variant="+variant+(preset?"&route="+routeKey:""));
  refresh();updateMap();
}
function updateMap(){
  if(!mapReady||!map)return;
  const preset=PRESETS[routeKey];
  for(const marker of markers)marker.remove();
  markers=[];
  const source=map.getSource("guide");
  if(source)source.setData({type:"FeatureCollection",features:preset?[{type:"Feature",properties:{},geometry:{type:"LineString",coordinates:[preset.from,preset.to]}}]:[]});
  if(!preset){map.flyTo({center:[101.693,3.141],zoom:7.7});return;}
  if(!window.maplibregl)return;
  const mk=(color,coords,label)=>new window.maplibregl.Marker({color}).setLngLat(coords)
    .setPopup(new window.maplibregl.Popup().setText(label)).addTo(map);
  markers=[mk("#f5c77d",preset.from,"Mula: "+preset.origin),mk("#ff4d73",preset.to,"Destinasi: "+preset.destination)];
  const bounds=new window.maplibregl.LngLatBounds(preset.from,preset.to);
  map.fitBounds(bounds,{padding:50,maxZoom:10,duration:500});
}
function initMap(){
  const fallback=$("map-fallback");
  if(!window.maplibregl){fallback.textContent="Peta belum tersedia pada rangkaian ini. Semua pengiraan bateri tetap boleh digunakan.";return;}
  try{
    map=new window.maplibregl.Map({container:"map",style:"https://tiles.openfreemap.org/styles/liberty",
      center:[101.693,3.141],zoom:8,minZoom:3,maxZoom:17,cooperativeGestures:true});
    map.addControl(new window.maplibregl.NavigationControl({showCompass:false}),"top-right");
    map.on("load",()=>{
      map.addSource("guide",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
      map.addLayer({id:"guideLine",type:"line",source:"guide",paint:{
        "line-color":"#f44b70","line-width":3,"line-opacity":.8,"line-dasharray":[2,2]
      }});
      mapReady=true;fallback.hidden=true;updateMap();
    });
    map.on("error",()=>{if(!mapReady)fallback.textContent="Peta gagal dimuatkan. Simulator bateri masih berfungsi tanpa peta.";});
  }catch(error){fallback.textContent="Peta tidak dapat dipaparkan. Pengiraan bateri masih berfungsi tanpa peta.";}
}
function chooseVariant(choice){
  variant=choice;
  history.replaceState(null,"","?variant="+variant+(PRESETS[routeKey]?"&route="+routeKey:""));
  refresh();
}
$("variant-prime").addEventListener("click",()=>chooseVariant("prime"));
$("variant-premium").addEventListener("click",()=>chooseVariant("premium"));
$("route").addEventListener("change",syncRoute);
for(const id of ["distance","speed","soc","people","cargo","road","mode","ac","rain","tariff"]){
  $(id).addEventListener("input",refresh);
  if(["distance","speed","tariff"].includes(id))$(id).addEventListener("change",refresh);
}
$("play").addEventListener("click",()=>{
  if(!result)return;
  if(progress>=1){stopSimulation();updateAnimation();}
  if(playing){
    playing=false;elapsed=Math.min(simulationMs,elapsed+performance.now()-startedAt);
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
    "Nota: Ini anggaran simulasi; bukan data bateri/traffic sebenar."
  ];
  try{
    await navigator.clipboard.writeText(lines.join("\n"));
    $("copy-status").textContent="Ringkasan berjaya disalin.";
  }catch(error){$("copy-status").textContent="Salinan automatik tidak tersedia. Sila salin nilai daripada skrin.";}
});
$("route").value=routeKey;
syncRoute();
window.addEventListener("load",initMap,{once:true});
