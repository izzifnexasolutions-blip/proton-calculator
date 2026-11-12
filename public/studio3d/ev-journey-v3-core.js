/* Presentation-only charger evidence. No claims of live status.
 * Uploads are never eligible for trip planning until independently checked.
 */
export function stationEvidence(station){
 const sources=Array.isArray(station?.sources)?station.sources:[];
 const recognized=sources.filter(x=>["OSM","OCM","Katalog OCM"].includes(x));
 const listed=recognized.length>0;
 const compatible=station?.knownConnector===true&&(station.dc===true||station.ac===true);
 const publicCandidate=station?.access!=="private"&&station?.access!=="no";
 return {
   listed,compatible,publicCandidate,planningCandidate:listed&&compatible&&publicCandidate,
   tier:!listed?"unverified_upload":station?.sourceConflict?"conflicting":"catalog_record",
   label:!listed?"Rekod belum disahkan":station.sourceConflict?
     "Rekod sumber bercanggah":"Lokasi direkodkan · status langsung tidak diketahui"
 };
}
export function routeChargerShortlist(stations=[],limit=5,type="all"){
 if(!Array.isArray(stations))return [];
 return stations.filter(s=>stationEvidence(s).planningCandidate)
   .filter(s=>type==="all"||type==="dc"&&s.dc||type==="ac"&&s.ac)
   .sort((a,b)=>a.offsetKm-b.offsetKm||
     Number(b.dc===true)-Number(a.dc===true)||a.kmAlong-b.kmAlong)
   .slice(0,Math.max(0,Math.min(12,limit)))
   .map(s=>({
     id:s.id,name:s.name,operator:s.operator||"Tidak diketahui",
     type:s.dc?"DC CCS2":"AC Type 2",kmAlong:s.kmAlong,offsetKm:s.offsetKm,
     powerKw:s.dc?s.dcPowerKw:s.acPowerKw,
     source:(s.sources||[]).join(" + "),sourceUrl:s.osmUrl,
     status:"Belum disahkan aktif"
   }));
}
