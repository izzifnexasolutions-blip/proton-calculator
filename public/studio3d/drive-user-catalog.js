/* FARIS: user-supplied EV references are review-only, NOT verified public chargers.
 * Never mix them into route stop planning or show them as live availability.
 * Pin render only when explicitly toggled on; named placeholders never get pins.
 */
import {REVIEW_BUCKETS,reviewBucket,auditSummary,auditFilter,exportAuditCsv} from "./ev-review-audit.js";
const URL="/studio3d/ev-user-import-catalog-20261113.json";
const $=id=>document.getElementById(id);
const empty=()=>({type:"FeatureCollection",features:[]});
let catalogPromise=null;
function loadCatalog(){
 if(!catalogPromise)catalogPromise=fetch(URL,{cache:"default"}).then(r=>{
   if(!r.ok)throw new Error("HTTP "+r.status);
   return r.json();
 }).catch(e=>{catalogPromise=null;throw e;});
 return catalogPromise;
}
function formatPlace(record){
 return [record.name,record.area,record.state,record.operator].filter(Boolean).join(" · ");
}
export function createUserEvCatalog(getMap){
 let records=[],enabled=false,layerMap=null,loadRequested=null,currentMatches=[];
 const feedback=$("ev-upload-status"),listing=$("ev-upload-results"),
   search=$("ev-upload-search"),toggle=$("ev-upload-toggle");
 function pointGeo(){
   const set=new Set();
   const rows=records.filter(r=>reviewBucket(r)==="candidate" &&
     Number.isFinite(r.lon)&&Number.isFinite(r.lat)).filter(r=>{
       const key=r.name.toLocaleLowerCase("ms-MY")+"|"+r.lat.toFixed(3)+"|"+r.lon.toFixed(3);
       if(set.has(key))return false;
       set.add(key);return true;
     });
   return {type:"FeatureCollection",features:rows.map((r,i)=>({
     type:"Feature",properties:{id:i,name:r.name,area:r.area,state:r.state,operator:r.operator,
       connectorRaw:r.connectorRaw,sourceFile:r.sourceFile,sourceRow:r.sourceRow},
     geometry:{type:"Point",coordinates:[r.lon,r.lat]}
   }))};
 }
 let pointCache=empty();
 function install(){
   const map=getMap();
   if(!map||!map.loaded?.())return;
   if(!map.getSource("evUserUnverified")){
     map.addSource("evUserUnverified",{type:"geojson",data:pointCache});
   }else map.getSource("evUserUnverified").setData(pointCache);
   if(!map.getLayer("evUserUnverifiedDots")){
     map.addLayer({id:"evUserUnverifiedDots",type:"circle",source:"evUserUnverified",
       minzoom:8,layout:{visibility:enabled?"visible":"none"},
       paint:{"circle-radius":["interpolate",["linear"],["zoom"],8,3,12,7],
         "circle-color":"#78b9f6","circle-opacity":.7,
         "circle-stroke-color":"#12233c","circle-stroke-width":1.7}});
   }else map.setLayoutProperty("evUserUnverifiedDots","visibility",enabled?"visible":"none");
   if(layerMap===map)return;
   layerMap=map;
   map.on("click","evUserUnverifiedDots",e=>{
     const f=e.features?.[0],props=f?.properties;if(!props||!window.maplibregl?.Popup)return;
     const div=document.createElement("div");
     const heading=document.createElement("strong");heading.textContent=props.name;div.append(heading);
     const fields=[
       "SUMBER: Excel pengguna — BELUM DISAHKAN",
       props.area+" · "+props.state,
       "Pengendali (dinyatakan): "+(props.operator||"Tiada"),
       "Jenis dinyatakan: "+(props.connectorRaw||"Tidak lengkap"),
       "Status beroperasi, akses dan koordinat belum disahkan",
       "Fail: "+props.sourceFile+" (baris "+props.sourceRow+")"
     ];
     for(const s of fields){const p=document.createElement("small");p.textContent=s;div.append(p);}
     new window.maplibregl.Popup({maxWidth:"300px"}).setLngLat(f.geometry.coordinates).setDOMContent(div).addTo(map);
   });
   map.on("mouseenter","evUserUnverifiedDots",()=>{map.getCanvas().style.cursor="pointer";});
   map.on("mouseleave","evUserUnverifiedDots",()=>{map.getCanvas().style.cursor="";});
 }
 function updateList(){
   if(!records.length)return;
   currentMatches=auditFilter(records,{query:search.value,
     state:$("ev-audit-state").value,status:$("ev-audit-bucket").value});
   const visible=currentMatches.slice(0,35);
   listing.replaceChildren();
   for(const r of visible){
     const item=document.createElement("div");item.className="ev-upload-item";
     const name=document.createElement("strong");name.textContent=r.name;
     const meta=document.createElement("small");
     meta.textContent=[r.area,r.state,r.operator,r.connectorRaw].filter(Boolean).join(" · ");
     const status=document.createElement("span");
     status.textContent=REVIEW_BUCKETS[reviewBucket(r)];
     status.dataset.risk=r.reviewStatus;
     const provenance=document.createElement("small");provenance.className="ev-audit-extra";
     provenance.textContent="Sumber: "+r.sourceFile+" · baris "+r.sourceRow+
       (r.duplicateOf?" · Pendua: "+r.duplicateOf:"");
     item.append(name,meta,status,provenance);listing.append(item);
   }
   feedback.textContent=currentMatches.length+" daripada "+records.length+
     " rekod dipadankan · menunjukkan "+visible.length+" pertama. Semua data belum disahkan.";
   $("ev-audit-export").disabled=currentMatches.length===0;
 }
 function downloadFiltered(){
   if(!currentMatches.length)return;
   const csv=exportAuditCsv(currentMatches);
   const url=globalThis.URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
   const a=document.createElement("a");a.href=url;
   a.download="FARIS_EV_Audit_Semakan_"+new Date().toISOString().slice(0,10)+".csv";
   document.body.append(a);a.click();a.remove();
   window.setTimeout(()=>globalThis.URL.revokeObjectURL(url),1000);
 }
 // The 510-row reference dataset is not required for route search or the
 // initial map. Load only when the user opens the review list or enables pins.
 function ensureLoaded(){
   if(records.length)return Promise.resolve(records);
   if(loadRequested)return loadRequested;
   feedback.textContent="Memuat senarai rujukan EV…";
   loadRequested=loadCatalog().then(data=>{
     if(!Array.isArray(data?.records)||data.records.length!==510)
       throw Error("Data import tidak lengkap");
     records=data.records;
     const summary=auditSummary(records);
     const stateSelect=$("ev-audit-state");
     for(const state of summary.states){
       const option=document.createElement("option");option.value=state;
       option.textContent=state;stateSelect.append(option);
     }
     $("ev-audit-count-candidate").textContent=summary.candidate+" calon";
     $("ev-audit-count-duplicate").textContent=summary.duplicate+" pendua";
     $("ev-audit-count-placeholder").textContent=summary.placeholder+" nama generik";
     $("ev-audit-count-missing").textContent=summary.no_coordinates+" tiada koordinat";
     pointCache=pointGeo();
     $("ev-upload-count").textContent=records.length+" rekod";
     $("ev-upload-geopins").textContent=pointCache.features.length+" pin calon";
     $("ev-upload-quarantine").textContent=records.filter(r=>r.reviewStatus==="needs_review_placeholder").length+" nama umum";
     $("ev-upload-geocode").textContent=records.filter(r=>r.reviewStatus==="needs_geocode").length+" tiada koordinat";
     updateList();install();
     return records;
   }).catch(error=>{
     loadRequested=null;
     feedback.textContent="Katalog tidak dapat dibaca: "+String(error.message||error);
     throw error;
   });
   return loadRequested;
 }
 const details=$("ev-upload-catalog").querySelector(".ev-upload-details");
 details.addEventListener("toggle",()=>{
   if(details.open)void ensureLoaded().catch(()=>{});
 });
 toggle.addEventListener("change",()=>{
   enabled=toggle.checked;
   if(enabled)void ensureLoaded().catch(()=>{});
   else install();
 });
 search.addEventListener("input",()=>{if(records.length)updateList();});
 $("ev-audit-state").addEventListener("change",updateList);
 $("ev-audit-bucket").addEventListener("change",updateList);
 $("ev-audit-export").addEventListener("click",downloadFiltered);
 $("ev-upload-count").textContent="510 rekod";
 $("ev-upload-geopins").textContent="194 calon unik";
 $("ev-upload-quarantine").textContent="235 nama umum";
 $("ev-upload-geocode").textContent="60 tiada koordinat";
 feedback.textContent="Buka senarai atau aktifkan pin untuk membaca data. Status lokasi belum disahkan.";
 return {onMapReady:install};
}
