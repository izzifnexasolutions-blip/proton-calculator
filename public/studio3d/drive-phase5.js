/* FARIS e.MAS 5 · Phase 5A-D: on-demand OSM + SRTM intelligence.
 * All route/charger claims are conditional and explicitly attributed.
 * Not EV navigation, real-time traffic or charger availability telemetry.
 */
import {cumulativeLine,pointAtFraction,buildRouteSituations,zoneAtDistance,planCharging,chargeSafetyWindow,nearKnownPlace} from "./drive-phase5-core.js";
import {fetchRouteContext,verifyDrivingStops,verifyChargeEnergy} from "./drive-phase5-api.js";
const $=id=>document.getElementById(id);
const fmt=(n,d=1)=>Number(n).toLocaleString("ms-MY",{minimumFractionDigits:d,maximumFractionDigits:d});
const emptyGeo=()=>({type:"FeatureCollection",features:[]});
export function createPhase5Planner({getRoute,getResult,getMap,mapReady}){
  let route=null,line=null,profile=[],stations=[],elevations=null,plan=null,verified=null;
  let roadData=emptyGeo(),lastRenderedZone=null,lastRenderedKm=-1,chargerDataVerified=false,places=[];
  let cache=new Map(),rev=0,controller=null,verifyController=null,working=false;
  let lastScan=0,lastVerify=0;
  const write=(id,str)=>{$(id).textContent=str;};
  const status=(str,level="")=>{write("phase5-status",str);$("phase5-status").dataset.state=level;};
  const message=(str,level="")=>{write("phase5-verified",str);$("phase5-verified").dataset.state=level;};
  function roadGeo(){
    if(!line||!profile.length)return emptyGeo();
    return {type:"FeatureCollection",features:profile.map(s=>{
      const start=s.startKm/route.km,end=s.endKm/route.km,coords=[pointAtFraction(line,start)];
      for(let i=1;i<line.coords.length-1;i++){
        const p=line.distances[i]/line.lengthKm;
        if(p>start&&p<end)coords.push(line.coords[i]);
      }
      coords.push(pointAtFraction(line,end));
      return {type:"Feature",properties:{kind:s.kind,name:s.label},
        geometry:{type:"LineString",coordinates:coords}};
    })};
  }
  function chargerGeo(){
    const sel=new Set(plan?.stops?.map(x=>x.station.id)||[]);
    return {type:"FeatureCollection",features:stations.slice(0,150).map(s=>({
      type:"Feature",properties:{type:s.dc?"DC":s.ac?"AC":"unknown",
        selected:sel.has(s.id),name:s.name},
      geometry:{type:"Point",coordinates:s.coordinates}
    }))};
  }

  function safetyWindow(){return route?chargeSafetyWindow(getResult()):null;}
  function safetyPoints(){
    const w=safetyWindow();
    if(!line||!w?.needed)return emptyGeo();
    const markers=[
      {at:w.searchFromKm,kind:"search",label:"Mula cari DC/AC (30%)"},
      {at:w.latestStopKm,kind:"last",label:"Had cadangan tiba stesen (15%)"},
      {at:w.reserve10Km,kind:"warning",label:"Reserve 10%"},
      {at:w.emptyKm,kind:"empty",label:"Bateri kosong (anggaran)"}
    ];
    return {type:"FeatureCollection",features:markers.map(m=>({
      type:"Feature",properties:{kind:m.kind,label:m.label,km:m.at},
      geometry:{type:"Point",coordinates:pointAtFraction(line,m.at/route.km)}
    }))};
  }
  function safetySegment(){
    const w=safetyWindow();
    if(!line||!w?.needed||w.latestStopKm<=w.searchFromKm)return emptyGeo();
    const start=w.searchFromKm/route.km,end=w.latestStopKm/route.km;
    const points=[pointAtFraction(line,start)];
    for(let i=1;i<line.coords.length-1;i++){
      const ratio=line.distances[i]/line.lengthKm;
      if(ratio>start&&ratio<end)points.push(line.coords[i]);
    }
    points.push(pointAtFraction(line,end));
    return {type:"FeatureCollection",features:[{
      type:"Feature",properties:{label:"Zon cari cas 30%–15%"},
      geometry:{type:"LineString",coordinates:points}
    }]};
  }
  function mapUpdate(){
    const map=getMap();if(!map||!mapReady())return;
    const road=map.getSource("phase5Road");
    if(road)road.setData(roadData);
    const station=map.getSource("phase5Stations");
    if(station)station.setData(chargerGeo());
    const safeLine=map.getSource("phase5ChargeWindow");
    if(safeLine)safeLine.setData(safetySegment());
    const safeDots=map.getSource("phase5SafetyPoints");
    if(safeDots)safeDots.setData(safetyPoints());
  }
  function onMapReady(){
    const map=getMap();if(!map||!mapReady())return;
    if(!map.getSource("phase5Road"))map.addSource("phase5Road",{type:"geojson",data:roadData});
    if(!map.getLayer("phase5RoadOverlay"))
      map.addLayer({id:"phase5RoadOverlay",type:"line",source:"phase5Road",paint:{
        "line-width":5,"line-opacity":.7,
        "line-color":["match",["get","kind"],"highway","#64ddec","hilly","#ffcd84",
          "rural","#86e7ae","road","#ba9bea","#7c9cac"]}});
    if(!map.getSource("phase5Stations"))map.addSource("phase5Stations",{
      type:"geojson",data:chargerGeo()});
    if(!map.getLayer("phase5StationDots"))
      map.addLayer({id:"phase5StationDots",type:"circle",source:"phase5Stations",paint:{
        "circle-color":["match",["get","type"],"DC","#cf9fff","AC","#8bebb4","#9fb2c4"],
        "circle-radius":["case",["get","selected"],8,5],
        "circle-stroke-color":"#102537","circle-stroke-width":2}});
    if(!map.getSource("phase5ChargeWindow"))
      map.addSource("phase5ChargeWindow",{type:"geojson",data:safetySegment()});
    if(!map.getLayer("phase5ChargeCorridor"))
      map.addLayer({id:"phase5ChargeCorridor",type:"line",source:"phase5ChargeWindow",
        paint:{"line-color":"#ffc27b","line-width":9,"line-opacity":.87}});
    if(!map.getSource("phase5SafetyPoints"))
      map.addSource("phase5SafetyPoints",{type:"geojson",data:safetyPoints()});
    if(!map.getLayer("phase5BatteryMilestones"))
      map.addLayer({id:"phase5BatteryMilestones",type:"circle",source:"phase5SafetyPoints",
        paint:{"circle-radius":["match",["get","kind"],"last",9,"empty",10,7],
          "circle-color":["match",["get","kind"],"search","#63e4f0",
            "last","#ffc27b","warning","#ffad6a","empty","#ed5379","#b8d0d9"],
          "circle-stroke-color":"#0c263e","circle-stroke-width":3}});
    mapUpdate();
  }
  function reset(){
    rev++;controller?.abort();verifyController?.abort();controller=null;verifyController=null;
    working=false;route=null;line=null;profile=[];stations=[];elevations=null;plan=null;verified=null;
    roadData=emptyGeo();lastRenderedZone=null;lastRenderedKm=-1;chargerDataVerified=false;places=[];
    $("phase5-scan").disabled=false;$("phase5-verify").disabled=true;$("phase5-copy").disabled=true;
    write("phase5-route-source","Tiada laluan OSRM");
    write("phase5-data-source","SRTM belum dimuatkan");
    write("phase5-charger-source","OSM belum dimuatkan");
    write("phase5-scan-count","Belum dicari");
    write("phase5-road-count","0 zon");
    write("phase5-plan-title","Kira laluan dahulu");
    write("phase5-plan-desc","Dapatkan geometri OSRM sebelum merancang hentian.");
    write("phase5-arrival-status","—");write("phase5-total-time","Belum dikira");
    $("phase5-window").dataset.needed="unknown";
    $("phase5-zoom-zone").disabled=true;
    write("phase5-window-summary","Kira laluan OSRM untuk tahu di mana perlu cas.");
    for(const id of ["phase5-window-start","phase5-window-last","phase5-window-reserve","phase5-window-empty"])write(id,"—");
    write("phase5-window-place","Nama tempat berhampiran dipaparkan jika direkodkan dalam OSM.");
    message("Akses jalan ke stesen belum disahkan.");
    for(const id of ["phase5-road-list","phase5-road-strip","phase5-stops",
      "phase5-alternatives","phase5-station-list"])$(id).replaceChildren();
    write("phase5-active-zone","Jenis jalan akan ditunjukkan ketika perjalanan.");
    mapUpdate();
  }
  function onRoute(data){
    reset();
    if(!data||!Array.isArray(data.coordinates)||!data.km)return;
    route=data;line=cumulativeLine(data.coordinates);
    profile=buildRouteSituations(route,null);
    roadData=roadGeo();
    write("phase5-route-source","OSRM · "+fmt(route.km,1)+" km");
    renderRoads();
    onMapReady();
    status("Geometri OSRM tersedia. Tekan Analisis Laluan + Cari Pengecas untuk dapatkan data OSM/SRTM.","");
    replan();
  }
  function renderRoads(){
    const list=$("phase5-road-list"),strip=$("phase5-road-strip");
    list.replaceChildren();strip.replaceChildren();
    write("phase5-road-count",profile.length+" zon");
    const icons={highway:"🛣",hilly:"⛰",rural:"🌴",road:"🏙",unknown:"◌"};
    if(!profile.length){const p=document.createElement("p");p.textContent="Tiada profil jalan.";list.append(p);return;}
    for(const [i,s]of profile.entries()){
      const piece=document.createElement("div");piece.className="phase5-road-piece";
      piece.dataset.kind=s.kind;piece.style.flexGrow=String(Math.max(.01,s.km));
      piece.title=s.label+" · km "+fmt(s.startKm,1)+"–"+fmt(s.endKm,1)+" · "+s.source;
      piece.dataset.index=String(i);strip.append(piece);
      const row=document.createElement("div");row.className="phase5-road-item";
      row.dataset.kind=s.kind;
      const icon=document.createElement("span");icon.className="phase5-road-icon";icon.textContent=icons[s.kind]||"◌";
      const text=document.createElement("div");text.className="phase5-road-info";
      const title=document.createElement("strong");title.textContent=s.label;
      const desc=document.createElement("small");
      const locality=nearKnownPlace(places,line,(s.startKm+s.endKm)/2,9);
      desc.textContent=fmt(s.startKm,0)+"–"+fmt(s.endKm,0)+" km · "+
        (locality?"Sekitar "+locality.name+" (OSM) · ":"")+s.source;
      const length=document.createElement("b");length.textContent=fmt(s.km,1)+" km";
      text.append(title,desc);row.append(icon,text,length);list.append(row);
    }
    mapUpdate();
  }
  function stationCard(s){
    const div=document.createElement("article");div.className="phase5-station-card";
    div.dataset.type=s.dc?"DC":s.ac?"AC":"unknown";
    const title=document.createElement("strong");title.textContent=s.name;
    const sub=document.createElement("div");sub.className="phase5-connectors";
    sub.textContent=s.type+(s.powerKw?" · "+fmt(s.powerKw,0)+" kW (OSM)":" · kuasa tak direkodkan");
    const desc=document.createElement("small");
    desc.textContent="±km "+fmt(s.kmAlong,0)+" pada laluan · "+
      fmt(s.offsetKm,1)+" km jarak lurus · akses: "+s.access+
      " · status pengecas: tidak diketahui";
    const link=document.createElement("a");link.href=s.osmUrl;link.target="_blank";
    link.rel="noopener noreferrer";link.textContent="Lihat rekod pengecas ↗";
    div.append(title,sub,desc,link);return div;
  }
  function renderStations(){
    const list=$("phase5-station-list");list.replaceChildren();
    const filter=$("phase5-filter").value;
    const items=stations.filter(s=>filter==="all"||filter==="dc"&&s.dc||
      filter==="ac"&&s.ac||filter==="unknown"&&!s.knownConnector);
    if(!items.length){
      const text=document.createElement("p");text.className="phase5-empty";
      text.textContent=stations.length?"Tiada stesen dalam kategori ini.":
        !chargerDataVerified?"Carian OSM belum berjaya. Zon cas di atas tetap sah sebagai anggaran, tetapi lokasi pengecas belum dapat disahkan.":
        "Tiada rekod pengecas daripada carian semasa. Ini bukan bukti tiada pengecas di kawasan tersebut.";
      list.append(text);return;
    }
    items.slice(0,16).forEach(s=>list.append(stationCard(s)));
    if(items.length>16){
      const note=document.createElement("small");note.className="phase5-data-notice";
      note.textContent="Memaparkan 16 daripada "+items.length+
        " rekod. Had hasil dikenakan untuk paparan LIVE.";list.append(note);
    }
  }
  function stopCard(stop,i){
    const s=stop.station,card=document.createElement("article");card.className="phase5-stop-card";
    card.dataset.kind=stop.kind;
    const top=document.createElement("div");top.className="phase5-stop-top";
    const type=document.createElement("span");type.className="phase5-charger-type";type.textContent=stop.kind;
    const title=document.createElement("strong");title.textContent=(i+1)+". "+s.name;
    top.append(type,title);
    const meta=document.createElement("p");
    meta.textContent="OSM · "+s.operator+" · anggaran km "+fmt(s.kmAlong,0)+
      " · "+fmt(s.offsetKm,1)+" km jarak lurus"+
      (s.powerKw?" · kuasa direkodkan "+fmt(s.powerKw,0)+" kW":" · kuasa tidak diketahui");
    const metrics=document.createElement("div");metrics.className="phase5-stop-metrics";
    for(const content of ["SOC tiba ±"+fmt(stop.arrivalSoc,0)+"%",
      "Sasaran ±"+fmt(stop.targetSoc,0)+"%",
      stop.minutes!=null?"Cas ±"+fmt(stop.minutes,0)+" min*":"Masa cas belum diketahui"]){
      const box=document.createElement("span");box.textContent=content;metrics.append(box);
    }
    const warn=document.createElement("small");warn.className="phase5-stop-warning";
    warn.textContent="Akses, kuasa sebenar, pengecas kosong/berfungsi dan masa cas belum disahkan.";
    const link=document.createElement("a");link.href=s.osmUrl;link.rel="noopener noreferrer";
    link.target="_blank";link.textContent="Semak lokasi OSM";
    card.append(top,meta,metrics,warn,link);return card;
  }

  function showSafetyWindow(){
    const w=safetyWindow();
    if(!w){$("phase5-zoom-zone").disabled=true;return;}
    const result=getResult();
    $("phase5-window").dataset.needed=String(w.needed);
    $("phase5-zoom-zone").disabled=!w.needed;
    const showKm=n=>"km "+fmt(n,0);
    write("phase5-window-start",w.needed?showKm(w.searchFromKm):"Tidak perlu");
    write("phase5-window-last",w.needed?showKm(w.latestStopKm):"Tidak perlu");
    write("phase5-window-reserve",w.needed?showKm(w.reserve10Km):"Tidak perlu");
    write("phase5-window-empty",w.needed?showKm(w.emptyKm):"Tidak perlu");
    if(!w.needed)
      write("phase5-window-summary","✓ Anggaran bateri cukup untuk sampai dengan reserve sekurang-kurangnya 10%.");
    else if(w.alreadyLow)
      write("phase5-window-summary","⚠ CAS SEBELUM BERTOLAK — SOC mula "+fmt(result.startSoc,0)+"%, bawah had cadangan 15%.");
    else write("phase5-window-summary","⚡ CARI PENGECAS DALAM ZON km "+
      fmt(w.searchFromKm,0)+"–"+fmt(w.latestStopKm,0)+
      ". Jangan tunggu sehingga bateri kosong pada sekitar km "+fmt(w.emptyKm,0)+".");
    const local=nearKnownPlace(places,line,(w.searchFromKm+w.latestStopKm)/2,16);
    if(local&&w.needed)
      write("phase5-window-place","Kawasan berhampiran: "+local.name+
        " (OSM: "+local.kind+", ±"+fmt(local.distanceKm,1)+
        " km jarak lurus daripada laluan; bukan lokasi pengecas).");
    else if(w.needed){
      const coords=pointAtFraction(line,w.latestStopKm/route.km);
      write("phase5-window-place",coords?
        "Had 15% pada peta: "+coords[1].toFixed(4)+"°N, "+
        coords[0].toFixed(4)+"°E. Nama tempat belum disahkan oleh OSM.":
        "Nama kawasan belum diketahui. Rujuk titik amaran pada peta.");
    }else write("phase5-window-place","Model meramalkan boleh sampai tanpa berhenti cas. Baki sebenar bergantung pada perjalanan.");
  }
  function renderPlan(){
    const res=getResult(),holder=$("phase5-stops"),alts=$("phase5-alternatives");
    holder.replaceChildren();alts.replaceChildren();
    $("phase5-copy").disabled=!route;
    $("phase5-verify").disabled=!plan?.stops?.length;
    if(!route||!res){write("phase5-plan-title","Kira laluan dahulu");return;}
    showSafetyWindow();
    const needed=!res.reachWithReserve;
    $("phase5-risk").dataset.state=!res.reachAtAll?"bad":needed?"warn":"safe";
    write("phase5-arrival-status",needed?
      "⚠ 10% SOC sekitar km "+fmt(res.rangeWithReserve,0)+
      " · bateri habis sekitar km "+fmt(res.stopAtKm,0):
      "✓ Anggaran boleh tiba dengan simpanan ≥10% SOC");
    const label={one:"1 HENTIAN · CADANGAN",two:"2 HENTIAN · CADANGAN",
      none:"TIDAK PERLU CAS · ANGGARAN",unavailable:"TIADA HENTIAN SELAMAT DIJUMPAI"};
    write("phase5-plan-title",label[plan?.kind]||"Data pengecas belum tersedia");
    write("phase5-plan-desc",plan?.message||"Tekan Analisis Laluan + Cari Pengecas.");
    plan?.stops?.forEach((s,i)=>holder.append(stopCard(s,i)));
    for(const alt of (plan?.alternatives||[]).slice(0,2)){
      const line=document.createElement("p");line.className="phase5-alternative";
      line.textContent="Pilihan lain: "+alt.stops.map(s=>s.station.name).join(" → ")+" (belum disahkan)";
      alts.append(line);
    }
    write("phase5-total-time",plan?.totalMinutesKnown!=null?
      "±"+fmt(plan.totalMinutesKnown,0)+" min*":"Kuasa / masa belum boleh disahkan");
    mapUpdate();
  }
  function replan(){
    if(!route)return;
    const result=getResult();
    plan=result&&chargerDataVerified?planCharging(result,stations):null;
    verified=null;
    message("Laluan masuk ke pengecas belum disahkan. Tekan semak setelah memilih hentian.");
    renderPlan();
  }
  function zoneAtKm(km){return route?zoneAtDistance(profile,km):null;}
  function onDrive(km){
    const zone=zoneAtKm(km);
    if(!zone)return null;
    if(zone===lastRenderedZone&&Math.floor(km)===lastRenderedKm)return zone;
    lastRenderedZone=zone;lastRenderedKm=Math.floor(km);
    write("phase5-active-zone",zone.label+" · km "+fmt(km,0)+
      " · "+zone.source+(zone.kind==="unknown"?" · visual guna senario pilihan":""));
    const idx=profile.indexOf(zone);
    const pieces=$("phase5-road-strip").children;
    for(let i=0;i<pieces.length;i++)pieces[i].dataset.active=String(i===idx);
    return zone;
  }
  async function scan(){
    if(working)return;
    const liveRoute=getRoute();
    if(!liveRoute?.coordinates||!liveRoute.km){
      status("Sila tekan Kira Laluan Jalan Sebenar (OSRM) dahulu.","error");return;
    }
    if(!route||route.obtainedAt!==liveRoute.obtainedAt)onRoute(liveRoute);
    const key=route.coordinates[0].join(",")+"|"+route.coordinates.at(-1).join(",")+"|"+route.km;
    const now=Date.now();
    if(!cache.has(key)&&now-lastScan<15000){
      status("Had pelayan komuniti: cuba semula selepas beberapa saat.","warn");return;
    }
    const mine=++rev;working=true;controller=new AbortController();
    const timeout=setTimeout(()=>controller?.abort(),19000);
    $("phase5-scan").disabled=true;
    status("Memuat data ketinggian SRTM + pengecas OSM. Tiada carian berulang automatik…");
    try{
      let data=cache.get(key);
      if(!data){lastScan=now;data=await fetchRouteContext(route,{signal:controller.signal});}
      if(mine!==rev)return;
      elevations=data.elevations;stations=data.stations;places=data.places||[];
      chargerDataVerified=!data.stationError;
      profile=buildRouteSituations(route,elevations);
      roadData=roadGeo();
      if(!data.stationError&&!data.elevationError)cache.set(key,data);
      renderRoads();renderStations();replan();onMapReady();
      write("phase5-data-source",elevations?"SRTM 90m · anggaran":"SRTM tiada data");
      write("phase5-charger-source",data.stationError?"Overpass gagal":
        "OSM · "+stations.length+" rekod");
      write("phase5-scan-count",data.stationError?"Carian gagal":stations.length+" stesen");
      if(data.stationError||data.elevationError)
        status("Data separa. "+
          (data.stationError?data.stationError+" ":"")+
          (data.elevationError?data.elevationError:"")+
          ". Keputusan yang tiada data tidak diandaikan.","warn");
      else status("Carian selesai: "+stations.length+
        " stesen OSM dalam koridor sampel. Semak soket dan ketersediaan sebelum bertolak.","success");
    }catch(e){
      if(mine!==rev)return;
      status("Pelayan awam tidak tersedia: "+String(e.message||e).slice(0,160)+
        ". Simulator bateri masih berfungsi.","error");
    }finally{
      clearTimeout(timeout);
      if(mine===rev){controller=null;working=false;$("phase5-scan").disabled=false;}
    }
  }
  async function verify(){
    if(working||!route||!plan?.stops?.length)return;
    const now=Date.now();
    if(now-lastVerify<8000){status("Tunggu seketika sebelum permintaan OSRM seterusnya.","warn");return;}
    lastVerify=now;working=true;const mine=++rev;
    verifyController=new AbortController();
    const timeout=setTimeout(()=>verifyController?.abort(),13000);
    $("phase5-verify").disabled=true;
    message("Memeriksa jalan memandu ke hentian yang dicadangkan menggunakan OSRM…");
    try{
      const res=await verifyDrivingStops(route,plan.stops,{signal:verifyController.signal});
      if(mine!==rev)return;
      const battery=verifyChargeEnergy(getResult(),plan.stops,res.legKm);
      verified={...res,...battery};
      message((battery.safe?"✓ Jalan ke stesen ditemui. ":"⚠ Margin bateri tidak cukup. ")+
        "Jarak laluan melalui stesen ±"+fmt(res.totalKm,1)+" km"+
        " (perbezaan berbanding terus ±"+fmt(res.deltaKm,1)+" km). "+
        battery.steps.map(x=>x.name+" tiba ±"+fmt(x.arrivalSoc,0)+"%").join(" · ")+
        ". SOC akhir ±"+fmt(battery.finishSoc,0)+"%. "+
        battery.reason+" Semak operator: kuasa, akses, soket, harga, tempahan dan stesen berfungsi.",
        battery.safe?"success":"warn");
    }catch(e){
      if(mine!==rev)return;
      message("OSRM tidak dapat sahkan jalan masuk ke pengecas. "+
        String(e.message||e).slice(0,130)+" · Jangan bergantung pada hentian ini.","error");
    }finally{
      clearTimeout(timeout);
      if(mine===rev){verifyController=null;working=false;$("phase5-verify").disabled=!plan?.stops?.length;}
    }
  }
  function customerReport(){
    const r=getResult();
    if(!route||!r)return "Kira laluan terlebih dahulu.";
    const lines=["FARIS PROTON · SMART EV JOURNEY & CHARGING",
      "Laluan OSRM: "+fmt(route.km,1)+" km",
      "Varian: "+r.car.name,"Bateri mula: "+fmt(r.startSoc,0)+"%",
      "SOC tiba: "+(r.reachAtAll?fmt(r.arrivalSoc,1)+"%":"TIDAK SAMPAI"),
      "Jika tidak cukup, bateri habis sekitar km "+fmt(r.stopAtKm,0),
      "Reserve: 15% di stesen, 10% ketika tiba",
      "Data: "+(elevations?"OSRM + SRTM anggaran":"OSRM; SRTM tiada"),
      "Bilangan stesen OSM dalam carian: "+(chargerDataVerified?stations.length:"Belum disahkan — carian OSM gagal/belum dibuat"),
      "Pelan: "+(plan?.message||"Belum dibuat")];
    const safety=safetyWindow();
    if(safety?.needed)lines.push("ZON CARI PENGECAS: km "+fmt(safety.searchFromKm,0)+
      " hingga "+fmt(safety.latestStopKm,0)+
      "; 10% sekitar km "+fmt(safety.reserve10Km,0)+
      "; 0% sekitar km "+fmt(safety.emptyKm,0)+
      ". Zon ialah anggaran, bukan stesen fizikal.");
    for(const s of plan?.stops||[])lines.push(
      s.station.name+" · "+s.kind+" · ±km "+fmt(s.station.kmAlong,0)+
      " · SOC ±"+fmt(s.arrivalSoc,0)+"% → "+fmt(s.targetSoc,0)+"%"+
      (s.minutes===null?" · masa tidak diketahui":" · masa cas kasar ±"+fmt(s.minutes,0)+" min"));
    lines.push("PENTING: Status hidup, kuasa, harga, akses stesen dan jarak lencongan belum disahkan.",
      "Bateri, ketinggian dan masa mengecas ialah anggaran simulasi — semak dengan operator sebelum memandu.");
    return lines.join("\n");
  }
  $("phase5-zoom-zone").addEventListener("click",()=>{
    const w=safetyWindow(),map=getMap();
    if(!w?.needed||!line||!map||!mapReady()){
      status("Peta belum sedia. Kira dan buka laluan dahulu.","warn");return;
    }
    const coords=pointAtFraction(line,((w.searchFromKm+w.latestStopKm)/2)/route.km);
    if(coords&&typeof map.flyTo==="function")
      map.flyTo({center:coords,zoom:11,essential:true});
    status("Peta difokuskan pada zon cari cas km "+fmt(w.searchFromKm,0)+"–"+
      fmt(w.latestStopKm,0)+". Cari stesen berhampiran selepas data OSM dimuatkan.","success");
  });
  $("phase5-scan").addEventListener("click",scan);
  $("phase5-verify").addEventListener("click",verify);
  $("phase5-filter").addEventListener("change",renderStations);
  $("phase5-copy").addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(customerReport());status("Ringkasan pelanggan disalin.","success");}
    catch{status("Pelayar tidak membenarkan salinan automatik.","warn");}
  });
  reset();
  return {onRoute,reset,onBatteryChanged:replan,onMapReady,onDrive,
    get route(){return route},get profile(){return profile},get stations(){return stations},
    get plan(){return plan},get verified(){return verified},
    scan,verify,customerReport};
}
