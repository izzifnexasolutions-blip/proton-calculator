/*
 * FARIS e.MAS 5 Phase 2 — opt-in OSM road routing BETA.
 * Only a deliberate button click makes an external OSRM request.
 * Public FOSSGIS demo: at most 1 req/s globally; we throttle one request
 * every 4s per browser, cache identical requests, and NEVER auto-retry.
 * Not a production-scale routing backend and no availability guarantee.
 * Does not invent charging stations, live traffic, elevations or road surfaces.
 */
export const ROUTE_BASE="https://routing.openstreetmap.de/routed-car/route/v1/driving/";
export const MALAYSIA_BOX={west:99,east:119.5,south:.8,north:7.6};
export function isMalaysiaArea([lng,lat]){
  return Number.isFinite(lng)&&Number.isFinite(lat)&&lng>=MALAYSIA_BOX.west&&lng<=MALAYSIA_BOX.east&&lat>=MALAYSIA_BOX.south&&lat<=MALAYSIA_BOX.north;
}
export function crowKm(a,b){
  const rad=Math.PI/180,dlat=(b[1]-a[1])*rad,dlng=(b[0]-a[0])*rad;
  const sa=Math.sin(dlat/2),sb=Math.sin(dlng/2);
  const t=sa*sa+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*sb*sb;
  return 6371*2*Math.atan2(Math.sqrt(Math.max(0,t)),Math.sqrt(Math.max(0,1-t)));
}
export function decodeRoute(json,from,to){
  if(json?.code!=="Ok"||!Array.isArray(json.routes)||!json.routes.length)throw new Error("Tiada laluan jalan boleh dipandu untuk pasangan lokasi ini.");
  const r=json.routes[0];
  const coords=r?.geometry?.coordinates;
  if(!Number.isFinite(r.distance)||!Number.isFinite(r.duration)||r.distance<250||r.distance>1e6)
    throw new Error("Jarak laluan tiada atau di luar had simulator 1,000 km.");
  if(!Array.isArray(coords)||coords.length<2||coords.length>15000||
    coords.some(p=>!Array.isArray(p)||p.length<2||!isMalaysiaArea(p)))
    throw new Error("Geometri jalan yang diterima tidak sah atau di luar liputan Malaysia.");
  const straight=crowKm(from,to);
  if(straight>.5&&r.distance/1000<straight*.85)
    throw new Error("Jarak laluan tidak selaras dengan dua lokasi. Cuba titik lain.");
  const km=Math.round(r.distance/100)/10;
  const mins=Math.round(r.duration/60);
  const steps=(r.legs||[]).flatMap(leg=>leg.steps||[]).slice(0,32).map(step=>({
    type:String(step.maneuver?.type||"continue").slice(0,32),
    modifier:String(step.maneuver?.modifier||"").slice(0,32),
    road:String(step.name||"Jalan tanpa nama").slice(0,90),
    km:Math.round((Number(step.distance)||0)/100)/10
  })).filter(step=>step.km>.15).slice(0,8);
  // Keep road labels from the actual OSRM navigation instructions for
  // Phase 5 classification. A road name alone never proves terrain/traffic.
  const roadSteps=(r.legs||[]).flatMap(leg=>leg.steps||[]).slice(0,600)
    .filter(x=>Number.isFinite(x.distance)&&x.distance>0)
    .map(x=>({
      km:x.distance/1000,
      name:String(x.name||"").slice(0,110),
      ref:String(x.ref||"").slice(0,70),
      roadClassSource:"OSRM navigation step"
    }));
  return {km,minutes:mins,coordinates:coords,steps,roadSteps,
    source:"OpenStreetMap / OSRM",obtainedAt:Date.now()};
}
export function createRoutePlanner({PRESETS,mapProvider,mapReadyProvider,onRouteApplied,onRouteInvalidated,format}) {
  const $=id=>document.getElementById(id);
  const pointByKey=new Map();
  for(const value of Object.values(PRESETS)){
    for(const side of ["from","to"]){
      const coords=value[side],name=side==="from"?value.origin:value.destination;
      const key=coords.map(n=>n.toFixed(4)).join(",");
      if(!pointByKey.has(key))pointByKey.set(key,{name,coords});
    }
  }
  let points=[...pointByKey.entries()].map(([id,p])=>({id,...p}));
  let start={...points[0]},end={...points[1]};
  const markers=[],cache=new Map();
  let picking=null,controller=null,seq=0,lastRequestAt=0,applied=null,lastResolved=0,driveMarker=null,driveIndex=null;
  function status(msg,kind=""){
    const el=$("route2-status");el.textContent=msg;el.dataset.kind=kind;
  }
  function addOptions(select){
    select.replaceChildren();
    for(const item of points){
      const option=document.createElement("option");
      option.value=item.id;option.textContent=item.name;
      select.append(option);
    }
    const custom=document.createElement("option");custom.value="custom";custom.textContent="📍 Pin pilihan pada peta";
    select.append(custom);
  }
  addOptions($("route2-from"));addOptions($("route2-to"));
  function label(pt){return pt?.name||"Pin peta";}
  function lookup(id,previous){
    if(id==="custom")return previous;
    return points.find(p=>p.id===id)||previous;
  }
  function syncUI(){
    $("route2-from").value=start.id||"custom";
    $("route2-to").value=end.id||"custom";
    $("route2-start-title").textContent=label(start);
    $("route2-end-title").textContent=label(end);
    $("pin-current-from").textContent=label(start);
    $("pin-current-to").textContent=label(end);
    const instruction=$("route2-map-instruction");
    instruction.hidden=!picking;
    instruction.textContent=picking==="from"?"📍 PILIH TITIK MULA — tekan tempat pada peta":
      picking==="to"?"🏁 PILIH DESTINASI — tekan tempat pada peta":"";
    document.body?.classList?.toggle("is-picking",!!picking);
    const canvas=mapProvider()?.getCanvas?.();
    if(canvas?.style)canvas.style.cursor=picking?"crosshair":"";
    for(const key of ["from","to"]){
      const active=picking===key;
      for(const id of ["route2-pick-"+key,"route2-map-"+key]){
        const button=$(id);
        button.classList.toggle("active",active);
        button.setAttribute("aria-pressed",String(active));
      }
    }
  }
  function clearVisual(){
    const map=mapProvider();
    const src=map?.getSource?.("actualRoute");
    if(src)src.setData({type:"FeatureCollection",features:[]});
    const energy=map?.getSource?.("energyBreak");
    if(energy)energy.setData({type:"FeatureCollection",features:[]});
    while(markers.length)markers.pop().remove();
    driveMarker?.remove();driveMarker=null;driveIndex=null;
    $("route2-steps").replaceChildren();
    $("route2-measured").textContent="Belum dikira";
    $("route2-time").textContent="—";
    $("route2-charge-point").textContent="Kira laluan untuk lihat anggaran lokasi had bateri 10%. Bukan lokasi pengecas.";
  }
  function invalidate(affectBattery=true){
    seq++;controller?.abort();controller=null;applied=null;lastResolved=0;
    clearVisual();
    status("Lokasi berubah. Tekan ‘Kira Laluan Jalan’ selepas memilih dua titik. Tiada panggilan automatik.");
    if(affectBattery)onRouteInvalidated();
    syncUI();
    // Keep both selected pins VISIBLE even before OSRM has returned a route.
    draw();
  }
  function setWaypoints(preset){
    if(!preset){invalidate(false);return;}
    const byPosition=pos=>points.find(p=>p.coords[0]===pos[0]&&p.coords[1]===pos[1])||
      {id:"custom",name:"Pin peta",coords:pos.slice()};
    start=byPosition(preset.from);end=byPosition(preset.to);
    picking=null;invalidate(false);
  }
  // Search first: exact selected geocoder coordinates, not a map pin.
  // The app never routes a free-text guess without a chosen result.
  // Clear *old* verified route immediately when a customer edits free text.
  // Do not leave the previous trip displayed as if it matched new input.
  function clearSearchRoute(){
    if(!applied&&!controller)return;
    seq++;controller?.abort();controller=null;
    applied=null;driveIndex=null;lastResolved=0;picking=null;
    clearVisual();
    status("Lokasi carian berubah. Pilih hasil carian baharu dan kira semula.","warn");
    onRouteInvalidated();
  }
  function setSearchEndpoints(a,b){
    const good=p=>p&&typeof p.name==="string"&&p.name.length&&
      Array.isArray(p.coords)&&p.coords.length===2&&isMalaysiaArea(p.coords);
    if(!good(a)||!good(b)){status("Pilih lokasi Malaysia yang sah untuk mula dan destinasi.","error");return false;}
    if(crowKm(a.coords,b.coords)<.35){
      status("Lokasi mula dan destinasi terlalu dekat.","error");return false;
    }
    start={id:"custom",name:a.name.slice(0,120),coords:a.coords.map(Number)};
    end={id:"custom",name:b.name.slice(0,120),coords:b.coords.map(Number)};
    picking=null;
    invalidate(true);
    const m=mapProvider();
    if(m&&mapReadyProvider()&&window.maplibregl){
      try{
        const bounds=new window.maplibregl.LngLatBounds(start.coords,end.coords);
        m.fitBounds(bounds,{padding:Math.max(38,Math.min(90,(m.getCanvas?.()?.clientWidth||650)*.07)),
          maxZoom:13,duration:450});
      }catch{}
    }
    status("✓ Lokasi carian dipilih. Mengira laluan hanya selepas tekan butang.","success");
    return true;
  }
  function setPoint(which,p,fromMap=false){
    if(!p||!isMalaysiaArea(p.coords)){
      status("Titik ini di luar liputan beta. Pilih lokasi di Malaysia.", "error");return;
    }
    if(which==="from")start=p;else end=p;
    // Map capture is a guided two-tap flow: start pin, then destination.
    picking=fromMap&&which==="from"?"to":null;
    invalidate(true);
    if(picking){
      status("✓ Titik mula ditanda. Sekarang sentuh DESTINASI pada peta.","success");
    }else if(fromMap){
      status("✓ Dua titik dipilih. Tekan ‘Kira Laluan Jalan Sebenar’ untuk dapatkan jarak.","success");
      $("route2-calc").scrollIntoView?.({block:"center",behavior:"smooth"});
    }else{
      status("✓ Lokasi dikemas kini. Tekan ‘Kira Laluan Jalan Sebenar’ untuk jarak jalan.","success");
    }
  }
  function pick(which){
    picking=picking===which?null:which;
    syncUI();
    status(picking?"Mod pin aktif: sentuh kawasan "+(picking==="from"?"MULA":"DESTINASI")+" pada peta besar di atas.":"Mod pin dimatikan.");
    if(picking){
      $("map").scrollIntoView?.({block:"center",behavior:"smooth"});
      const map=mapProvider();
      if(map?.resize)map.resize();
    }
  }
  function handleMapClick(lngLat){
    if(!picking)return false;
    const p={id:"custom",name:"Pin peta ("+Number(lngLat.lat).toFixed(4)+", "+Number(lngLat.lng).toFixed(4)+")",
      coords:[Number(lngLat.lng),Number(lngLat.lat)]};
    setPoint(picking,p,true);
    return true;
  }
  function geoLine(){
    return {type:"FeatureCollection",features:applied?[{
      type:"Feature",properties:{route:"osrm-road-geometry"},geometry:{type:"LineString",coordinates:applied.coordinates}
    }]:[]};
  }
  function installLayers(){
    const map=mapProvider();if(!map||!mapReadyProvider())return;
    if(!map.getSource("actualRoute"))map.addSource("actualRoute",{type:"geojson",data:geoLine()});
    if(!map.getLayer("realRouteGlow"))map.addLayer({id:"realRouteGlow",type:"line",source:"actualRoute",
      paint:{"line-color":"#5de9ff","line-width":11,"line-opacity":.25,"line-blur":4}});
    if(!map.getLayer("realRoute"))map.addLayer({id:"realRoute",type:"line",source:"actualRoute",
      paint:{"line-color":"#82eeff","line-width":4,"line-opacity":.98}});
    if(!map.getSource("energyBreak"))map.addSource("energyBreak",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    if(!map.getLayer("energyBreakRing"))map.addLayer({id:"energyBreakRing",type:"circle",source:"energyBreak",
      paint:{"circle-radius":9,"circle-color":"#ffbc6a","circle-stroke-color":"#15283a","circle-stroke-width":3}});
    draw();
  }
  function draw(){
    const map=mapProvider();if(!map||!mapReadyProvider())return;
    const source=map.getSource("actualRoute");if(source)source.setData(geoLine());
    while(markers.length)markers.pop().remove();
    if(!window.maplibregl)return;
    for(const [color,p,desc]of [["#f8cb79",start,"Mula"],["#fc5279",end,"Destinasi"]]){
      const m=new window.maplibregl.Marker({color}).setLngLat(p.coords)
        .setPopup(new window.maplibregl.Popup().setText(desc+": "+label(p))).addTo(map);
      markers.push(m);
    }
    if(applied){
      const bounds=new window.maplibregl.LngLatBounds();
      for(const xy of applied.coordinates)bounds.extend(xy);
      map.fitBounds(bounds,{padding:Math.max(45,Math.min(100,(map.getCanvas?.()?.clientWidth||600)*.08)),maxZoom:14,duration:650});
    }
  }
  function indexRouteGeometry(points){
    if(!points||points.length<2)return null;
    const distance=new Float64Array(points.length);
    for(let i=1;i<points.length;i++)
      distance[i]=distance[i-1]+crowKm(points[i-1],points[i]);
    return {points,distance,total:distance[distance.length-1]};
  }
  function indexedRoutePoint(fraction){
    const index=driveIndex;
    if(!index||index.total<=0)return null;
    const target=index.total*Math.max(0,Math.min(1,fraction));
    const positions=index.distance;
    let left=1,right=positions.length-1;
    while(left<right){
      const middle=(left+right)>>1;
      if(positions[middle]<target)left=middle+1;else right=middle;
    }
    const start=left-1,end=left;
    const delta=positions[end]-positions[start];
    const mix=delta>0?(target-positions[start])/delta:0;
    const p=index.points;
    return [
      p[start][0]+(p[end][0]-p[start][0])*mix,
      p[start][1]+(p[end][1]-p[start][1])*mix
    ];
  }
  function findDistanceFractionPoint(points,fraction){
    if(!points||points.length<2)return null;
    const segments=[];let total=0;
    for(let i=1;i<points.length;i++){const len=crowKm(points[i-1],points[i]);segments.push(len);total+=len;}
    let target=total*Math.max(0,Math.min(1,fraction));
    for(let i=0;i<segments.length;i++){
      if(target<=segments[i]){
        const ratio=segments[i]?target/segments[i]:0;
        return [points[i][0]+(points[i+1][0]-points[i][0])*ratio,
          points[i][1]+(points[i+1][1]-points[i][1])*ratio];
      }
      target-=segments[i];
    }
    return points.at(-1);
  }
  // Phase 3: actual car position follows validated OSRM road points only.
  // Without real routing, no fake "drive on the road" marker is shown.
  function onDriveProgress(frac,result){
    if(!applied||!result||!mapReadyProvider()){
      driveMarker?.remove();driveMarker=null;return false;
    }
    const map=mapProvider();if(!map||!window.maplibregl)return false;
    const physicalFraction=Math.min(Math.max(0,Number(frac)||0),
      Math.min(1,Math.max(0,result.stopAtKm/result.km)));
    const location=indexedRoutePoint(physicalFraction)||findDistanceFractionPoint(applied.coordinates,physicalFraction);
    if(!location)return false;
    if(!driveMarker){
      const el=document.createElement("div");
      el.className="ev-travel-dot";
      el.textContent="🚘";
      el.setAttribute("aria-label","Anggaran lokasi kereta sepanjang jalan yang dikira");
      driveMarker=new window.maplibregl.Marker({element:el,anchor:"center"})
        .setLngLat(location).addTo(map);
    }else driveMarker.setLngLat(location);
    return true;
  }
  function onEstimate(result){
    const map=mapProvider(),src=map?.getSource?.("energyBreak");
    if(!applied||!result){
      $("route2-charge-point").textContent="Tiada titik anggaran; kira laluan jalan terlebih dahulu.";
      if(src)src.setData({type:"FeatureCollection",features:[]});
      return;
    }
    const kmTo10=Math.min(applied.km,Math.max(0,result.rangeWithReserve));
    if(result.reachWithReserve){
      $("route2-charger-link").href="https://www.openstreetmap.org/#map=13/"+end.coords[1].toFixed(5)+"/"+end.coords[0].toFixed(5);
      $("route2-charge-point").textContent="Anggaran sampai dengan simpanan ≥10% bateri. Stesen cas sebenar belum disemak.";
      if(src)src.setData({type:"FeatureCollection",features:[]});
      return;
    }
    const coord=indexedRoutePoint(kmTo10/applied.km)||findDistanceFractionPoint(applied.coordinates,kmTo10/applied.km);
    if(coord)$("route2-charger-link").href="https://www.openstreetmap.org/#map=13/"+coord[1].toFixed(5)+"/"+coord[0].toFixed(5);
    $("route2-charge-point").textContent="Anggaran capai 10% bateri selepas ±"+format(kmTo10,0)+
      " km dari mula. Penanda oren pada laluan ialah peringatan bateri, BUKAN lokasi stesen pengecas.";
    if(src&&coord)src.setData({type:"FeatureCollection",features:[{
      type:"Feature",properties:{kind:"battery-threshold-not-charger"},
      geometry:{type:"Point",coordinates:coord}
    }]});
  }
  function stepsUI(steps){
    const holder=$("route2-steps");holder.replaceChildren();
    if(!steps.length){
      const row=document.createElement("p");row.textContent="Arahan belok tidak tersedia daripada pelayan routing.";holder.append(row);return;
    }
    const changes={turn:"Belok",depart:"Mula",arrive:"Tiba",continue:"Teruskan",merge:"Masuk laluan",fork:"Simpang",roundabout:"Bulatan",newName:"Ikut jalan",endOfRoad:"Hujung jalan"};
    for(const item of steps){
      const row=document.createElement("div");row.className="turn-step";
      const turn=document.createElement("strong");turn.textContent=(changes[item.type]||"Ikut laluan")+
        (item.modifier?" ("+item.modifier.replaceAll("_"," ")+")":"");
      const desc=document.createElement("span");desc.textContent=item.road+" · "+format(item.km,1)+" km";
      row.append(turn,desc);holder.append(row);
    }
  }
  async function calculate(){
    if(controller)return;
    if(!isMalaysiaArea(start.coords)||!isMalaysiaArea(end.coords)){status("Koordinat mesti berada dalam kawasan Malaysia.","error");return;}
    if(crowKm(start.coords,end.coords)<.35){status("Dua lokasi terlalu dekat. Pilih dua lokasi berbeza.","error");return;}
    // Single user-triggered request, no autonomous retry or background polling.
    const key=start.coords.join(",")+"|"+end.coords.join(",");
    if(!cache.has(key)&&Date.now()-lastRequestAt<4000){
      status("Had perkhidmatan komuniti: cuba semula selepas beberapa saat.","warn");return;
    }
    controller=new AbortController();
    const mine=++seq;
    $("route2-calc").disabled=true;
    status("Mengira geometri jalan OpenStreetMap…");
    const timeout=setTimeout(()=>controller?.abort(),12000);
    try{
      let data=cache.get(key);
      if(!data){
        lastRequestAt=Date.now();
        const encode=p=>p.map(n=>Number(n).toFixed(6)).join(",");
        const url=ROUTE_BASE+encode(start.coords)+";"+encode(end.coords)+
          "?geometries=geojson&overview=full&steps=true&alternatives=false";
        const response=await fetch(url,{signal:controller.signal,mode:"cors",cache:"default",
          referrerPolicy:"strict-origin-when-cross-origin"});
        if(!response.ok)throw new Error(response.status===429?"Had permintaan pelayan dicapai. Cuba kemudian.":"Pelayan routing tidak tersedia (HTTP "+response.status+").");
        data=decodeRoute(await response.json(),start.coords,end.coords);
        cache.set(key,data);
      }
      if(mine!==seq)return;
      applied=data;driveIndex=indexRouteGeometry(data.coordinates);
      $("route2-measured").textContent=format(data.km,1)+" km · laluan jalan";
      $("route2-time").textContent=Math.floor(data.minutes/60)+"j "+(data.minutes%60)+"m (tanpa trafik)";
      status("Laluan jalan berjaya diperoleh daripada OSRM. Anggaran masa bukan masa trafik langsung.","success");
      stepsUI(data.steps);
      const modelResult=onRouteApplied({km:data.km,minutes:data.minutes,start:label(start),end:label(end),startCoords:start.coords.slice(),endCoords:end.coords.slice()});
      installLayers();onEstimate(modelResult);
    }catch(error){
      if(mine!==seq)return;
      applied=null;driveIndex=null;clearVisual();
      status(error.name==="AbortError"?"Pelayan lambat/tidak dapat dicapai. Guna jarak manual sementara.":
        "Tidak berjaya mengira laluan: "+error.message+" Gunakan jarak rujukan/manual.","error");
    }finally{
      clearTimeout(timeout);
      if(mine===seq){controller=null;$("route2-calc").disabled=false;}
    }
  }
  $("route2-from").addEventListener("change",()=>{
    if($("route2-from").value==="custom"){pick("from");return;}
    setPoint("from",lookup($("route2-from").value,start));
  });
  $("route2-to").addEventListener("change",()=>{
    if($("route2-to").value==="custom"){pick("to");return;}
    setPoint("to",lookup($("route2-to").value,end));
  });
  $("route2-pick-from").addEventListener("click",()=>pick("from"));
  $("route2-pick-to").addEventListener("click",()=>pick("to"));
  $("route2-map-from").addEventListener("click",()=>pick("from"));
  $("route2-map-to").addEventListener("click",()=>pick("to"));
  $("route2-calc").addEventListener("click",calculate);
  $("route2-clear").addEventListener("click",()=>{applied=null;invalidate(true)});
  const first=Object.values(PRESETS)[0];setWaypoints(first);
  return {onMapReady:installLayers,onMapClick:handleMapClick,onEstimate,onDriveProgress,
    onPresetChanged:setWaypoints,setSearchEndpoints,clearSearchRoute,calculate,
    get start(){return start},get end(){return end},
    get hasActualRoute(){return !!applied},get route(){return applied},get picking(){return picking}};
}
