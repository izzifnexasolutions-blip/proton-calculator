/* FARIS e.MAS 5 · Phase 5A-D: on-demand OSM + SRTM intelligence.
 * All route/charger claims are conditional and explicitly attributed.
 * Not EV navigation, real-time traffic or charger availability telemetry.
 */
import {cumulativeLine,pointAtFraction,haversine,buildRouteSituations,zoneAtDistance,planCharging,chargeSafetyWindow,nearKnownPlace,chargeDuration} from "./drive-phase5-core.js";
import {fetchRouteContext,verifyDrivingStops,verifyChargeEnergy} from "./drive-phase5-api.js?v=20261112wc";
import {WEST_COAST_CHARGERS,WEST_COAST_CATALOG_DATE} from "./west-coast-public-chargers.js";
const $=id=>document.getElementById(id);
const fmt=(n,d=1)=>Number(n).toLocaleString("ms-MY",{minimumFractionDigits:d,maximumFractionDigits:d});
const emptyGeo=()=>({type:"FeatureCollection",features:[]});
export function createPhase5Planner({getRoute,getResult,getMap,mapReady,onUpdated}){
  let route=null,line=null,profile=[],stations=[],elevations=null,plan=null,verified=null;
  let roadData=emptyGeo(),lastRenderedZone=null,lastRenderedKm=-1,
    chargerDataVerified=false,chargerScanStatus="not_checked",places=[];
  let cache=new Map(),rev=0,controller=null,verifyController=null,working=false,
    placeLookupController=null,placeLookupCache=new Map(),popupMap=null;
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
  function placeGeo(){
    // Only named place records actually obtained from OSM/Photon.
    return {type:"FeatureCollection",features:places.filter(p=>
      p.name&&Number.isFinite(p.lon)&&Number.isFinite(p.lat)).slice(0,16).map(p=>({
      type:"Feature",properties:{name:String(p.name).slice(0,65),kind:p.kind||"place"},
      geometry:{type:"Point",coordinates:[p.lon,p.lat]}
    }))};
  }
  function addPlaces(list){
    if(!Array.isArray(list)||!route)return;
    const keys=new Set(places.map(p=>String(p.name).toLowerCase()+"|"+
      Number(p.lat).toFixed(3)+"|"+Number(p.lon).toFixed(3)));
    for(const p of list){
      if(!p||!p.name||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))continue;
      if(!(p.lat>=.8&&p.lat<=7.8&&p.lon>=99&&p.lon<=119.5))continue;
      const key=String(p.name).toLowerCase()+"|"+p.lat.toFixed(3)+"|"+p.lon.toFixed(3);
      if(keys.has(key))continue;
      keys.add(key);places.push({name:String(p.name).slice(0,80),kind:p.kind||"place",
        lat:p.lat,lon:p.lon,source:p.source||"OSM"});
    }
    if(places.length>50)places=places.slice(0,50);
  }
  function westCoastGeo(){
    return {type:"FeatureCollection",features:WEST_COAST_CHARGERS.map(s=>({
      type:"Feature",properties:{id:s.id,name:s.name,operator:s.operator,dcKw:s.dcKw,acKw:s.acKw,state:s.state},
      geometry:{type:"Point",coordinates:[s.lon,s.lat]}
    }))};
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
    const labels=map.getSource("phase5NamedPlaces");
    if(labels)labels.setData(placeGeo());
    const safeLine=map.getSource("phase5ChargeWindow");
    if(safeLine)safeLine.setData(safetySegment());
    const safeDots=map.getSource("phase5SafetyPoints");
    if(safeDots)safeDots.setData(safetyPoints());
  }

  function bindMapPopups(map){
    if(popupMap===map||typeof map.on!=="function")return;
    popupMap=map;
    const addPopup=(coords,content)=>{
      if(!window.maplibregl?.Popup)return;
      const container=document.createElement("div");container.className="journey-map-popup";
      const name=document.createElement("strong");
      name.textContent=content.title;container.append(name);
      for(const line of content.lines){
        const el=document.createElement("small");el.textContent=line;container.append(el);
      }
      if(content.url){
        const link=document.createElement("a");link.href=content.url;
        link.target="_blank";link.rel="noopener noreferrer";
        link.textContent="Lihat rekod sumber pengecas ↗";container.append(link);
      }
      new window.maplibregl.Popup({closeButton:true,closeOnClick:true,maxWidth:"280px"})
        .setLngLat(coords).setDOMContent(container).addTo(map);
    };
    map.on("click","phase5BatteryMilestones",event=>{
      const feature=event?.features?.[0];if(!feature)return;
      const x=feature.properties||{},km=Number(x.km);
      const kind=x.kind;
      const titles={search:"Biru muda · Mula cari pengecas (30%)",
        last:"Kuning jingga · Had cadangan cas (15%)",
        warning:"Jingga · Simpanan bateri 10%",
        empty:"Merah · Bateri dijangka kosong (0%)"};
      addPopup(feature.geometry.coordinates,{
        title:titles[kind]||"Penanda bateri",
        lines:["Anggaran titik perjalanan: km "+fmt(km,1),
          "Peratus bateri ialah model anggaran, bukan bacaan BMS.",
          "Titik ini bukan pengecas fizikal. Semak stesen AC/DC berdekatan."]
      });
    });
    map.on("click","westCoastCatalogPins",event=>{
      const feature=event?.features?.[0];if(!feature)return;
      const station=WEST_COAST_CHARGERS.find(s=>s.id===Number(feature.properties?.id));
      if(!station)return;
      addPopup([station.lon,station.lat],{
        title:"⚡ "+station.name,
        lines:["Katalog Pantai Barat · "+station.state+" · "+station.operator,
          station.dcKw?"DC CCS2 "+station.dcKw+" kW direkodkan":"DC CCS2 tidak direkodkan",
          station.acKw?"AC Type 2 "+station.acKw+" kW direkodkan":"AC Type 2 tidak direkodkan",
          "Koordinat rekod OCM · data diperiksa "+WEST_COAST_CATALOG_DATE,
          "Status semasa, bay kosong dan akses mesti disahkan dengan operator."],
        url:station.sourceUrl
      });
    });
    map.on("click","phase5StationDots",event=>{
      const feature=event?.features?.[0];if(!feature)return;
      const name=String(feature.properties?.name||"Stesen pengecas (OSM)");
      const station=stations.find(s=>s.name===name&&
        haversine(s.coordinates,feature.geometry.coordinates)<.05);
      const type=station?.type||String(feature.properties?.type||"Tidak diketahui");
      addPopup(feature.geometry.coordinates,{
        title:"⚡ "+name,
        lines:["Rekod OpenStreetMap · "+type,
          "Kedudukan sekitar km "+(station?fmt(station.kmAlong,0):"—")+
            " pada laluan · jarak lurus "+(station?fmt(station.offsetKm,1)+" km":"tak diketahui"),
          "Status berfungsi, ketersediaan dan akses belum disahkan.",
          "Semak aplikasi operator sebelum pergi."],
        url:station?.osmUrl
      });
    });
    for(const id of ["phase5BatteryMilestones","phase5StationDots","westCoastCatalogPins"]){
      map.on("mouseenter",id,()=>{if(map.getCanvas?.())map.getCanvas().style.cursor="pointer";});
      map.on("mouseleave",id,()=>{if(map.getCanvas?.())map.getCanvas().style.cursor="";});
    }
  }
  function onMapReady(){
    const map=getMap();if(!map||!mapReady())return;
    if(!map.getSource("phase5Road"))map.addSource("phase5Road",{type:"geojson",data:roadData});
    if(!map.getLayer("phase5RoadOverlay"))
      map.addLayer({id:"phase5RoadOverlay",type:"line",source:"phase5Road",paint:{
        "line-width":5,"line-opacity":.7,
        "line-color":["match",["get","kind"],"highway","#64ddec","hilly","#ffcd84",
          "rural","#86e7ae","road","#ba9bea","#7c9cac"]}});
    if(!map.getSource("westCoastCatalog"))
      map.addSource("westCoastCatalog",{type:"geojson",data:westCoastGeo()});
    if(!map.getLayer("westCoastCatalogPins"))
      map.addLayer({id:"westCoastCatalogPins",type:"circle",source:"westCoastCatalog",
        paint:{"circle-color":"#f0b969","circle-radius":7,
          "circle-stroke-color":"#102537","circle-stroke-width":2,
          "circle-opacity":.95}});
    if(!map.getSource("phase5Stations"))map.addSource("phase5Stations",{
      type:"geojson",data:chargerGeo()});
    if(!map.getLayer("phase5StationDots"))
      map.addLayer({id:"phase5StationDots",type:"circle",source:"phase5Stations",paint:{
        "circle-color":["match",["get","type"],"DC","#cf9fff","AC","#8bebb4","#9fb2c4"],
        "circle-radius":["case",["get","selected"],8,5],
        "circle-stroke-color":"#102537","circle-stroke-width":2}});
    if(!map.getSource("phase5NamedPlaces"))
      map.addSource("phase5NamedPlaces",{type:"geojson",data:placeGeo()});
    if(!map.getLayer("phase5NamedPlaceLabels"))
      map.addLayer({id:"phase5NamedPlaceLabels",type:"symbol",source:"phase5NamedPlaces",
        layout:{"text-field":["get","name"],"text-size":12,"text-anchor":"top",
          "text-offset":[0,1.1],"text-allow-overlap":false},
        paint:{"text-color":"#e6f8ff","text-halo-color":"#153047","text-halo-width":2}});
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
    bindMapPopups(map);
    mapUpdate();
  }
  function reset(){
    rev++;controller?.abort();verifyController?.abort();placeLookupController?.abort();
    controller=null;verifyController=null;placeLookupController=null;
    working=false;route=null;line=null;profile=[];stations=[];elevations=null;plan=null;verified=null;
    roadData=emptyGeo();lastRenderedZone=null;lastRenderedKm=-1;
    chargerDataVerified=false;chargerScanStatus="not_checked";places=[];
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
    const area=$("journey-area-source");
    if(area)area.textContent="Nama jalan daripada OSRM. Nama bandar/pekan akan diperiksa pada OSM apabila laluan dikira.";
    mapUpdate();
  }

  /**
   * A few bounded, sequential OSM Photon reverse lookups after a customer
   * explicitly requests an OSRM route. The queried coordinate is *on* the
   * route. A city/county name from its returned address is attributed as an
   * approximate vicinity, not a guarantee the road passes through its centre.
   * A failure never creates fictional places; no retry/fanout/polling.
   */
  async function resolveRouteAreaNames(requestRevision){
    if(!route||!line||!line.lengthKm)return;
    const parent=new AbortController();placeLookupController=parent;
    const samples=route.km>300?[.11,.25,.39,.53,.67,.81,.92]:
      route.km>90?[.16,.34,.52,.70,.88]:[.3,.67];
    let successes=0,failures=0;
    const info=$("journey-area-source");
    if(info)info.textContent="Menyemak nama bandar/pekan berhampiran laluan OSM…";
    for(const fraction of samples){
      if(requestRevision!==rev||parent.signal.aborted)return;
      const xy=pointAtFraction(line,fraction),key=xy.map(x=>x.toFixed(3)).join(",");
      if(!placeLookupCache.has(key)){
        // Keep public Photon traffic modest: <= 1 request every 1.65 seconds.
        await new Promise(resolve=>setTimeout(resolve,1650));
        if(requestRevision!==rev||parent.signal.aborted)return;
        const url="https://photon.komoot.io/reverse?lon="+xy[0].toFixed(5)+
          "&lat="+xy[1].toFixed(5)+"&radius=28&limit=3&lang=en"+
          "&layer=city&layer=locality&layer=district";
        try{
          const response=await fetch(url,{signal:parent.signal,
            cache:"default",mode:"cors",referrerPolicy:"strict-origin-when-cross-origin"});
          if(!response.ok)throw new Error("Photon HTTP "+response.status);
          const result=await response.json();
          let place=null;
          for(const f of (result?.features||[]).slice(0,3)){
            const props=f.properties||{};
            if(props.countrycode&&String(props.countrycode).toUpperCase()!=="MY")continue;
            const label=String(props.city||props.district||props.county||
              (props.osm_key==="place"?props.name:"")||"").trim();
            if(!label||label.length>85)continue;
            const geo=f.geometry?.coordinates;
            if(!Array.isArray(geo)||haversine(xy,geo)>35)continue;
            place={name:label,kind:props.city?"city":props.district?"district":
              props.county?"county":props.osm_value||"place",
              // This is a sampled route-coordinate association, not a town
              // centroid or assertion that the route goes through the town.
              lon:xy[0],lat:xy[1],source:"Photon reverse (OSM) · anggaran"};
            break;
          }
          placeLookupCache.set(key,place);
        }catch(e){
          if(e?.name==="AbortError")return;
          failures++;
          if(failures>=2)break; // Fair-use: no retries of a failing public API.
          continue;
        }
      }
      if(requestRevision!==rev||parent.signal.aborted)return;
      const place=placeLookupCache.get(key);
      if(place){
        successes++;addPlaces([place]);renderRoads();
        onUpdated?.();mapUpdate();
      }
    }
    if(requestRevision!==rev||parent.signal.aborted)return;
    if(info)info.textContent=successes?
      "✓ "+successes+" sampel kawasan dikenal pasti melalui Photon/OSM. Nama jalan berasal daripada OSRM; label 'Sekitar' ialah anggaran.":
      "Nama kawasan tambahan belum dapat dimuatkan daripada Photon. Nama jalan OSRM masih digunakan; tiada nama tempat direka.";
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
    const requestRevision=rev;
    void resolveRouteAreaNames(requestRevision);
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
      const locality=nearKnownPlace(places,line,((s.startKm+s.endKm)/2)/Math.max(.001,route.km)*line.lengthKm,28);
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
    sub.textContent=s.type+(s.powerKw?" · "+fmt(s.powerKw,0)+" kW direkodkan":" · kuasa tak direkodkan");
    const desc=document.createElement("small");
    desc.textContent="±km "+fmt(s.kmAlong,0)+" pada laluan · "+
      fmt(s.offsetKm,1)+" km jarak lurus · akses: "+s.access+
      " · status langsung: tidak diketahui";
    const link=document.createElement("a");link.href=s.osmUrl;link.target="_blank";
    link.rel="noopener noreferrer";link.textContent="Lihat rekod pengecas ↗";
    const source=document.createElement("small");
    source.textContent="Sumber: "+(s.sources||["OSM"]).join(" + ")+
      (s.sourceConflict?" · Maklumat sumber bercanggah — semak operator":"");
    div.append(title,sub,desc,source,link);return div;
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
    items.slice(0,30).forEach(s=>list.append(stationCard(s)));
    if(items.length>30){
      const note=document.createElement("small");note.className="phase5-data-notice";
      note.textContent="Memaparkan 30 daripada "+items.length+
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
    meta.textContent=(s.sources||["OSM"]).join("+")+" · "+s.operator+" · anggaran km "+fmt(s.kmAlong,0)+
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
    const evidence=document.createElement("small");
    evidence.textContent="Sumber: "+(s.sources||["OSM"]).join(" + ");
    card.append(top,meta,metrics,evidence,warn,link);return card;
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
    onUpdated?.();
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
      elevations=data.elevations;stations=data.stations;
      addPlaces(data.places||[]);
      chargerDataVerified=!data.stationError;
      chargerScanStatus=data.stationError?"error":"success";
      profile=buildRouteSituations(route,elevations);
      roadData=roadGeo();
      if(!data.stationError&&!data.elevationError)cache.set(key,data);
      renderRoads();renderStations();replan();onMapReady();
      write("phase5-data-source",elevations?"SRTM 90m · anggaran":"SRTM tiada data");
      write("phase5-charger-source",data.stationError?"Tiada rekod koridor ditemui":
        (data.catalogCount?"Katalog Pantai Barat ("+data.catalogCount+") + ":"")+
        (data.providerStationError?"OSM terganggu":"OSM")+
        (["success","partial"].includes(data.ocmStatus)?" + OCM API":"")+
        " · "+stations.length+" rekod");
      write("phase5-scan-count",stations.length+" rekod");
      if(data.catalogFallback)
        status("✓ Menggunakan "+data.catalogCount+" rekod katalog OCM Pantai Barat berhampiran laluan. Overpass terganggu; kesahihan semasa tidak diketahui.","warn");
      else if(data.stationError||data.elevationError)
        status("Data separa. "+
          (data.stationError?data.stationError+" ":"")+
          (data.elevationError?data.elevationError:"")+
          ". Keputusan yang tiada data tidak diandaikan.","warn");
      else status("Carian selesai: "+stations.length+
        " rekod pengecas daripada OSM / katalog Pantai Barat dalam koridor. Sahkan akses dan status operator.","success");
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
    const timeout=setTimeout(()=>verifyController?.abort(),19000);
    $("phase5-verify").disabled=true;
    message("Menguji jarak jalan sebenar, penggunaan bateri dan masa cas bagi pilihan hentian…");
    try{
      // Route checks are explicit-user-action only and limited to at most two
      // candidate plans to avoid overloading the free community router.
      const candidates=[plan,...(plan.alternatives||[])].filter(p=>p?.stops?.length).slice(0,2);
      const inspected=[];
      for(const candidate of candidates){
        if(mine!==rev||verifyController.signal.aborted)break;
        try{
          const road=await verifyDrivingStops(route,candidate.stops,{signal:verifyController.signal});
          const battery=verifyChargeEnergy(getResult(),candidate.stops,road.legKm);
          const result=getResult(),cap=result.effectiveBattery;
          const stops=candidate.stops.map((stop,i)=>{
            const actual=battery.steps[i],addedKwh=Math.max(0,(stop.targetSoc-actual.arrivalSoc)/100*cap);
            const mins=chargeDuration(stop.station,result.variant,addedKwh,stop.kind==="DC");
            return {...stop,arrivalSoc:actual.arrivalSoc,addKwh:addedKwh,minutes:mins,
              drivingDetourKm:road.deltaKm,provisional:false,roadVerified:true};
          });
          const totalMinutesKnown=stops.every(x=>x.minutes!==null)?
            stops.reduce((n,x)=>n+x.minutes,0):null;
          inspected.push({candidate,road,battery,stops,totalMinutesKnown});
          if(battery.safe)break;
        }catch(error){
          inspected.push({candidate,error:String(error?.message||error)});
        }
      }
      if(mine!==rev)return;
      const best=inspected.find(x=>x.battery?.safe);
      if(!best){
        verified=null;
        const unsafe=inspected.find(x=>x.battery);
        message(unsafe?
          "⚠ OSRM menjumpai laluan tetapi baki bateri tidak selamat: SOC akhir ±"+
          fmt(unsafe.battery.finishSoc,1)+"%. Cari stesen lain atau cas sebelum bertolak.":
          "OSRM tidak dapat sahkan laluan ke pengecas. Jangan bergantung pada cadangan ini.","warn");
        return;
      }
      plan={...best.candidate,stops:best.stops,
        totalMinutesKnown:best.totalMinutesKnown,
        message:"Jalan melalui hentian disemak oleh OSRM. SOC dan masa cas ialah anggaran; status pengecas mesti disahkan dengan operator."};
      verified={...best.road,...best.battery,
        totalMinutesKnown:best.totalMinutesKnown,checkedWith:"OSRM"};
      renderPlan();
      message("✓ Jalan ke hentian telah disemak · "+fmt(best.road.totalKm,1)+
        " km termasuk lencongan (+"+fmt(Math.max(0,best.road.deltaKm),1)+" km) · "+
        best.battery.steps.map(x=>x.name+" tiba "+fmt(x.arrivalSoc,1)+"%").join(" · ")+
        " · baki destinasi "+fmt(best.battery.finishSoc,1)+"% · "+
        (best.totalMinutesKnown===null?"masa cas tidak diketahui":
          "masa mengecas ±"+fmt(best.totalMinutesKnown,0)+" min")+
        ". Ini bukan pengesahan stesen beroperasi, kadar cas sebenar atau kesesuaian akses.","success");
      onUpdated?.();
    }catch(error){
      if(mine===rev)message("Semakan laluan gagal: "+
        String(error?.message||error).slice(0,140),"error");
    }finally{
      clearTimeout(timeout);
      if(mine===rev){onUpdated?.();verifyController=null;working=false;$("phase5-verify").disabled=!plan?.stops?.length;}
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
    get places(){return places},get stationsVerified(){return chargerDataVerified},
    get chargerScanStatus(){return chargerScanStatus},
    get plan(){return plan},get verified(){return verified},
    scan,verify,customerReport};
}
