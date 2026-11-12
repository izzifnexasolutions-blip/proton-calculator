/**
 * Search-first Malaysia journey UX · FARIS Proton e.MAS 5
 * - Never infers endpoints from unselected free text.
 * - Photon (OSM) for limited fair-use geocoding with 1.1s debounce,
 *   global per-page >1.5s throttle, AbortController, tiny in-memory cache.
 * - OSRM is called only on explicit form submission, never on keystrokes.
 * - Timeline/energy/charger zone reuse same result, never fake real traffic.
 */
import {isMalaysiaArea,crowKm} from "./drive-phase2.js";
import {buildJourneyTimeline,formatKm} from "./drive-journey-model.js";
import {cumulativeLine,pointAtFraction} from "./drive-phase5-core.js";
const $=id=>document.getElementById(id);
const PHOTON="https://photon.komoot.io/api/";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=s=>String(s||"").toLocaleLowerCase("ms-MY").trim();
export function initialPoints(presets){
  const map=new Map();
  for(const p of Object.values(presets||{})){
    for(const x of [{name:p.origin,coords:p.from},{name:p.destination,coords:p.to}]){
      if(!Array.isArray(x.coords)||!isMalaysiaArea(x.coords))continue;
      const key=x.coords.map(n=>Number(n).toFixed(4)).join(",");
      if(!map.has(key))map.set(key,{name:x.name,coords:[...x.coords],source:"Laluan popular"});
    }
  }
  return [...map.values()];
}
export function parsePhotonResults(data){
  if(!Array.isArray(data?.features))return [];
  const list=[],seen=new Set();
  for(const f of data.features.slice(0,15)){
    const coords=f?.geometry?.coordinates,prop=f?.properties||{};
    if(!Array.isArray(coords)||!isMalaysiaArea(coords))continue;
    if(prop.countrycode&&String(prop.countrycode).toUpperCase()!=="MY")continue;
    if(prop.country&&/singapore|thailand|indonesia|brunei/i.test(prop.country))continue;
    const names=[prop.name,prop.street&&prop.name?prop.street:null,prop.city||prop.county,prop.state].filter(Boolean);
    const name=[...new Set(names)].join(", ").slice(0,126);
    if(!name)continue;
    const key=coords.map(n=>Number(n).toFixed(4)).join(",");
    if(seen.has(key))continue;
    seen.add(key);
    list.push({name,coords:coords.slice(0,2).map(Number),
      source:"OpenStreetMap · Photon",detail:(prop.country||"Malaysia")+
        (prop.osm_value?" · "+prop.osm_value:"")});
  }
  return list.slice(0,6);
}
export function createJourneyExperience({PRESETS,getRoute,getResult,getProfile,getPlaces,getPlan,
  getInputSettings,getMap,mapReady,onRouteRequest,onVariantChange,onPresetChange,onSOCChange,onChargerSearch}){
  const inputs={from:$("journey-from"),to:$("journey-to")},lists={from:$("journey-from-results"),to:$("journey-to-results")};
  const chosen={from:null,to:null},versions={from:0,to:0},debounce={from:0,to:0};
  const local=initialPoints(PRESETS),cache=new Map();
  let flight=null,lastSent=0,routeModel=null,activeZoneId=null,busy=false,selectedPreset="";
  let currentResults=[],context=null,hasGeoRoute=false;
  const status=(message,type="")=>{const el=$("journey-search-status");el.textContent=message;el.dataset.state=type};
  const fmtSoc=n=>Number.isFinite(n)?formatKm(Math.max(0,n),1)+"%":"—";
  function suggestLocals(query){
    const q=esc(query);
    return !q?[]:local.filter(p=>esc(p.name).includes(q)).slice(0,5);
  }
  function closeSuggestions(side){
    const list=lists[side];list.hidden=true;list.replaceChildren();
    inputs[side].setAttribute("aria-expanded","false");
  }
  function openSuggestions(side,values,loading=false,error=false){
    const list=lists[side];list.replaceChildren();
    values.forEach(p=>{
      const btn=document.createElement("button");btn.type="button";btn.className="journey-suggest-item";
      btn.setAttribute("role","option");
      const ico=document.createElement("span");ico.className="suggest-icon";ico.textContent="⌖";
      const label=document.createElement("span");
      const title=document.createElement("strong");title.textContent=p.name;
      const sub=document.createElement("small");sub.textContent=p.source+(p.detail?" · "+p.detail:"");
      label.append(title,sub);btn.append(ico,label);
      btn.addEventListener("click",()=>select(side,p));
      list.append(btn);
    });
    if(loading||error||values.length===0){
      const note=document.createElement("div");note.className="journey-suggest-note";
      note.textContent=error?
        "Pelayan carian lokasi belum tersedia. Cuba nama bandar lain atau Laluan Popular.":
        loading?"Mencari tempat di Malaysia…":
        "Tiada padanan. Cuba nama penuh bandar/tempat.";
      list.append(note);
    }
    list.hidden=false;
    inputs[side].setAttribute("aria-expanded","true");
  }
  function select(side,point){
    if(!point||!isMalaysiaArea(point.coords))return;
    chosen[side]={name:point.name,coords:[...point.coords],source:point.source};
    inputs[side].value=point.name;
    versions[side]++;clearTimeout(debounce[side]);
    closeSuggestions(side);
    const other=side==="from"?"to":"from";
    if(chosen[other]&&crowKm(chosen.from.coords,chosen.to.coords)<.35)
      status("Lokasi mula dan destinasi terlalu dekat. Pilih dua lokasi berbeza.","warn");
    else status("✓ Lokasi dipilih. Tekan Kira Laluan untuk jalan OSRM sebenar.","success");
    $("journey-preset").value="";
    selectedPreset="";
  }
  async function searchRemote(side,query,version){
    if(versions[side]!==version||esc(inputs[side].value)!==esc(query))return;
    const remaining=1650-(Date.now()-lastSent);
    if(remaining>0){
      await new Promise(resolve=>setTimeout(resolve,remaining));
      if(versions[side]!==version)return;
    }
    const key=esc(query);
    if(cache.has(key)){
      openSuggestions(side,merge(suggestLocals(query),cache.get(key)));return;
    }
    flight?.abort();
    const token=new AbortController();flight=token;lastSent=Date.now();
    try{
      const url=PHOTON+"?q="+encodeURIComponent(query)+
        "&limit=6&lang=en&bbox=99,0.8,119.5,7.6";
      const response=await fetch(url,{signal:token.signal,mode:"cors",
        cache:"default",referrerPolicy:"strict-origin-when-cross-origin"});
      if(!response.ok)throw Error("HTTP "+response.status);
      const geo=parsePhotonResults(await response.json());
      cache.set(key,geo);
      if(cache.size>55)cache.delete(cache.keys().next().value);
      if(versions[side]===version&&esc(inputs[side].value)===key)
        openSuggestions(side,merge(suggestLocals(query),geo));
    }catch(e){
      if(e?.name!=="AbortError"&&versions[side]===version)
        openSuggestions(side,suggestLocals(query),false,true);
    }finally{if(flight===token)flight=null;}
  }
  function merge(a,b){
    const out=[],keys=new Set();
    for(const p of [...a,...b]){
      const k=p.coords.map(x=>Number(x).toFixed(4)).join(",");
      if(!keys.has(k)){out.push(p);keys.add(k);}
    }
    return out.slice(0,7);
  }
  for(const side of ["from","to"]){
    const input=inputs[side];
    input.addEventListener("input",()=>{
      versions[side]++;const version=versions[side];
      chosen[side]=null;
      selectedPreset="";$("journey-preset").value="";
      clearTimeout(debounce[side]);
      const value=input.value.trim(),locals=suggestLocals(value);
      if(value.length<3){if(value)openSuggestions(side,locals);else closeSuggestions(side);return;}
      openSuggestions(side,locals,true);
      debounce[side]=setTimeout(()=>searchRemote(side,value,version),1100);
    });
    input.addEventListener("keydown",e=>{
      if(e.key==="Escape"){closeSuggestions(side);return;}
      if(e.key==="ArrowDown"){
        const first=lists[side].querySelector(".journey-suggest-item");
        if(first){e.preventDefault();first.focus();}
      }
    });
    input.addEventListener("focus",()=>{
      if(!chosen[side]&&input.value.trim().length>0)
        openSuggestions(side,suggestLocals(input.value.trim()),input.value.trim().length>=3);
    });
    input.addEventListener("blur",()=>{
      // Let click on a suggestion register before dismissing.
      setTimeout(()=>{if(!lists[side].contains(document.activeElement))closeSuggestions(side)},200);
    });
    lists[side].addEventListener("keydown",e=>{
      if(e.key==="Escape"){closeSuggestions(side);input.focus();}
    });
  }
  $("journey-swap").addEventListener("click",()=>{
    [chosen.from,chosen.to]=[chosen.to,chosen.from];
    const tmp=inputs.from.value;inputs.from.value=inputs.to.value;inputs.to.value=tmp;
    versions.from++;versions.to++;
    closeSuggestions("from");closeSuggestions("to");
    $("journey-preset").value="";selectedPreset="";
    status("Arah perjalanan ditukar. Tekan Kira Laluan untuk mengemas kini jalan.","");
  });
  const preset=$("journey-preset");
  preset.replaceChildren();
  const label=document.createElement("option");
  label.value="";label.textContent="Pilih contoh perjalanan";preset.append(label);
  for(const [key,p] of Object.entries(PRESETS||{})){
    const opt=document.createElement("option");opt.value=key;opt.textContent=p.name||p.origin+" → "+p.destination;
    preset.append(opt);
  }
  function setPreset(key){
    const p=PRESETS[key];if(!p)return false;
    chosen.from={name:p.origin,coords:[...p.from],source:"Laluan popular"};
    chosen.to={name:p.destination,coords:[...p.to],source:"Laluan popular"};
    inputs.from.value=p.origin;inputs.to.value=p.destination;
    versions.from++;versions.to++;
    closeSuggestions("from");closeSuggestions("to");
    preset.value=key;selectedPreset=key;
    status("✓ Laluan popular dipilih. Tekan Kira Laluan untuk jarak jalan sebenar.","success");
    return true;
  }
  preset.addEventListener("change",()=>{
    if(setPreset(preset.value)){onPresetChange?.(preset.value);resetTimeline();}
  });
  $("journey-variant").addEventListener("change",()=>onVariantChange?.($("journey-variant").value));
  function setSOC(value){
    const v=clamp(Number(value)||80,5,100);
    $("journey-start-soc").value=String(v);
    $("journey-start-soc-value").textContent=Math.round(v)+"%";
    $("journey-start-soc").style.setProperty("--journey-soc-fill",v+"%");
  }
  $("journey-start-soc").addEventListener("input",()=>{
    const v=Number($("journey-start-soc").value);
    setSOC(v);
    onSOCChange?.(v);
  });
  $("journey-find-chargers").addEventListener("click",async()=>{
    if(!getRoute()){status("Kira laluan OSRM dahulu sebelum cari pengecas.","warn");return;}
    const button=$("journey-find-chargers");
    if(button.disabled)return;
    button.disabled=true;
    $("journey-charger-feedback").textContent="Mencari rekod pengecas OSM sepanjang laluan…";
    try{
      await onChargerSearch?.();
      $("journey-charger-feedback").textContent=
        $("phase5-status")?.textContent||"Carian selesai. Semak kad pengecas di bawah peta.";
    }catch(e){
      $("journey-charger-feedback").textContent=
        "Carian belum berjaya: "+String(e?.message||e).slice(0,120);
    }finally{button.disabled=!getRoute();}
  });
  function setVariant(v){
    $("journey-variant").value=v==="prime"?"prime":"premium";
  }
  $("journey-search-form").addEventListener("submit",async event=>{
    event?.preventDefault?.();
    if(busy)return;
    for(const side of ["from","to"]){
      if(!chosen[side]||esc(chosen[side].name)!==esc(inputs[side].value)){
        status("Pilih cadangan tempat bagi kedua-dua ruangan. Teks sahaja belum mempunyai koordinat.","warn");
        inputs[side].focus();return;
      }
    }
    if(crowKm(chosen.from.coords,chosen.to.coords)<.35){
      status("Pilih destinasi yang berbeza daripada tempat mula.","warn");return;
    }
    busy=true;
    $("journey-calculate").disabled=true;
    closeSuggestions("from");closeSuggestions("to");
    status("Mengira laluan jalan Malaysia melalui OSRM…","");
    try{
      const ok=await onRouteRequest({...chosen.from},{...chosen.to});
      if(ok)status("✓ Laluan berjaya dikira. Buka timeline untuk melihat zon bateri dan mod pemanduan.","success");
      else status($("route2-status")?.textContent||"Laluan jalan tidak dapat dikira. Cuba semula kemudian.","error");
    }catch(e){status("Laluan tidak dapat dikira: "+String(e.message||e).slice(0,140),"error");}
    finally{busy=false;$("journey-calculate").disabled=false;}
  });
  function resetTimeline(){
    routeModel=null;hasGeoRoute=false;activeZoneId=null;
    $("journey-find-chargers").disabled=true;
    $("journey-charger-feedback").textContent="Kira laluan dulu. Status pengecas sebenar perlu disahkan dengan operator.";
    $("journey-timeline").open=false;
    $("journey-timeline-brief").textContent="Kira laluan untuk melihat zon";
    $("journey-timeline-list").replaceChildren();
    const empty=document.createElement("p");empty.className="journey-empty";
    empty.textContent="Taip dua tempat, pilih cadangan, kemudian Kira Laluan.";
    $("journey-timeline-list").append(empty);
    $("journey-rail").replaceChildren();
    for(const id of ["journey-distance","journey-time","journey-arrival",
      "journey-charge","journey-mode"])$(id).textContent="—";
    for(const el of document.querySelectorAll("#journey-kpis>div"))el.dataset.state="";
    clearDrainMap();
  }
  function clearDrainMap(){
    const s=getMap()?.getSource?.("journeyEnergyHints");
    if(s)s.setData({type:"FeatureCollection",features:[]});
  }
  function zoneMapData(){
    if(!context?.route||!routeModel)return {type:"FeatureCollection",features:[]};
    const index=cumulativeLine(context.route.coordinates);
    if(!index)return {type:"FeatureCollection",features:[]};
    const features=routeModel.rows.filter(r=>r.type==="zone"&&r.level==="high"&&r.routeEvidence)
      .slice(0,20).map(r=>{
        const ratio=((r.fromKm+r.toKm)/2)/context.route.km;
        return {type:"Feature",properties:{kind:r.level,title:r.name},
          geometry:{type:"Point",coordinates:pointAtFraction(index,ratio)}};
      });
    return {type:"FeatureCollection",features};
  }
  function onMapReady(){
    const m=getMap();if(!m||!mapReady())return;
    if(!m.getSource("journeyEnergyHints"))
      m.addSource("journeyEnergyHints",{type:"geojson",data:zoneMapData()});
    if(!m.getLayer("journeyHighEnergyDots"))
      m.addLayer({id:"journeyHighEnergyDots",type:"circle",source:"journeyEnergyHints",
        paint:{"circle-radius":9,"circle-color":"#ed638b","circle-stroke-color":"#fff0d9",
          "circle-stroke-width":2,"circle-opacity":.92}});
    const source=m.getSource("journeyEnergyHints");
    if(source)source.setData(zoneMapData());
  }
  const short=s=>String(s||"").length>110?String(s).slice(0,110)+"…":String(s||"");
  function pill(parent,text,className=""){
    const span=document.createElement("span");if(className)span.className=className;
    span.textContent=text;parent.append(span);return span;
  }
  function render(contextInfo){
    context=contextInfo;
    const {route,result,profile,places,plan,settings}=contextInfo||{};
    if(!route||!result){resetTimeline();return;}
    routeModel=buildJourneyTimeline({route,result,profile,places,plan,settings});
    $("journey-find-chargers").disabled=false;
    setSOC(result.startSoc);
    hasGeoRoute=true;
    const summary=routeModel.summary||{};
    $("journey-distance").textContent=formatKm(route.km,1)+" km";
    const duration=Number(route.minutes);
    $("journey-time").textContent=Number.isFinite(duration)?
      Math.floor(duration/60)+"j "+Math.round(duration%60)+"m":"—";
    $("journey-arrival").textContent=result.reachAtAll?fmtSoc(result.arrivalSoc):"0%*";
    $("journey-charge").textContent=summary.needsCharge?"PERLU":"TIDAK";
    $("journey-mode").textContent=summary.mode||"Normal";
    $("journey-arrival").closest("div").dataset.state=!result.reachAtAll?"bad":
      !result.reachWithReserve?"warn":"";
    $("journey-charge").closest("div").dataset.state=summary.needsCharge?"warn":"";
    $("journey-timeline-brief").textContent=summary.sectionCount+" zon · "+
      summary.highZones+" zon tekanan tinggi · "+(summary.needsCharge?"cari cas":"boleh sampai*");
    $("journey-timeline").open=true;
    const list=$("journey-timeline-list"),rail=$("journey-rail");
    list.replaceChildren();rail.replaceChildren();
    for(const segment of routeModel.rail){
      const bar=document.createElement("div");bar.className="journey-rail-segment";
      bar.dataset.level=segment.level;bar.style.flexGrow=String(Math.max(.001,segment.km));
      bar.title="km "+formatKm(segment.fromKm,0)+"–"+formatKm(segment.toKm,0)+
        " · tekanan tenaga "+segment.level+" (petunjuk)";
      rail.append(bar);
    }
    for(const r of routeModel.rows){
      const item=document.createElement("article");item.className="journey-timeline-item";
      item.dataset.kind=r.kind;item.dataset.id=r.id;item.dataset.current="false";
      const badge=document.createElement("div");badge.className="journey-step-circle";badge.dataset.level=r.level;badge.textContent=r.icon;
      const main=document.createElement("div");main.className="journey-step-main";
      const card=document.createElement("div");card.className="journey-step-card";
      const head=document.createElement("div");head.className="journey-step-head";
      const title=document.createElement("strong");title.textContent=short(r.name);
      const range=document.createElement("small");range.textContent=r.type==="start"?"MULA":
        r.type==="end"?"DESTINASI":r.type==="charge"?"ZON CARI CAS":
        "km "+formatKm(r.fromKm,0)+"–"+formatKm(r.toKm,0);
      head.append(title,range);card.append(head);
      if(r.type==="zone"){
        const sub=document.createElement("div");sub.className="journey-step-sub";
        sub.textContent=short(r.note);card.append(sub);
      }
      const stats=document.createElement("div");stats.className="journey-step-metrics";
      pill(stats,"🔋 "+fmtSoc(r.socStart)+" → "+fmtSoc(r.socEnd));
      if(r.type==="zone"){
        pill(stats,"⚡ "+r.drainLabel,"journey-drain");
        stats.lastChild.dataset.level=r.level;
        pill(stats,"MODE "+r.mode,"journey-step-mode");
      }else if(r.type==="charge")pill(stats,"⚠ BUKAN lokasi pengecas");
      else if(r.type==="stop")pill(stats,"AC/DC · semak operator");
      card.append(stats);
      const note=document.createElement("div");note.className="journey-step-note";
      note.textContent=r.type==="zone"?
        (r.reason?r.reason+" · ":"")+r.modeReason:
        r.note||"";
      card.append(note);main.append(card);item.append(badge,main);list.append(item);
    }
    activeZoneId=null;
    onMapReady();
  }
  function setProgress(km){
    if(!routeModel||!Number.isFinite(km))return;
    let selected=null;
    const rows=routeModel.rows.filter(r=>r.type==="zone");
    for(const r of rows){if(km>=r.fromKm&&km<=r.toKm){selected=r;break;}}
    if(!selected||selected.id===activeZoneId)return;
    activeZoneId=selected.id;
    for(const el of $("journey-timeline-list").children)
      el.dataset.current=String(el.dataset.id===selected.id);
    for(let i=0;i<$("journey-rail").children.length;i++)
      $("journey-rail").children[i].dataset.current=String(routeModel.rail[i]?.id===selected.id);
  }
  resetTimeline();
  return {setPreset,setVariant,setSOC,render,resetTimeline,setProgress,onMapReady,
    get selected(){return {...chosen}},get routeModel(){return routeModel}};
}
