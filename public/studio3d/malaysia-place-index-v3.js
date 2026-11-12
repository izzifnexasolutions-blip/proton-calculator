/* Small, evidence-backed offline town index. Route endpoints remain explicit
 * user selections and are re-routed using OSRM. NOT a complete gazetteer.
 * Additional towns must have identifiable source coordinates.
 */
export const OFFLINE_TOWNS=Object.freeze([
 Object.freeze({name:"Tanah Merah, Kelantan",coords:[102.14841,5.80978],
   source:"OpenStreetMap · tempat direkodkan",
   sourceUrl:"https://www.openstreetmap.org/node/369488884",
   detail:"Pusat bandar Tanah Merah · Kelantan; titik anggaran bandar"})
]);
const tidy=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleLowerCase("ms-MY").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
export function localPlaceMatches(query,known=[],limit=6){
 const q=tidy(query);if(q.length<2)return [];
 const scored=[],seen=new Set();
 for(const point of [...OFFLINE_TOWNS,...known]){
   const name=tidy(point?.name),coords=point?.coords;
   if(!name||!Array.isArray(coords)||coords.length!==2||!coords.every(Number.isFinite))continue;
   const words=name.split(" ");
   const match=name.startsWith(q)?0:words.some((word,i)=>i>0&&name.slice(name.indexOf(word)).startsWith(q))?1:name.includes(q)?2:99;
   if(match===99)continue;
   const key=coords.map(x=>x.toFixed(4)).join(",");
   if(seen.has(key))continue;
   seen.add(key);scored.push({...point,score:match});
 }
 return scored.sort((a,b)=>a.score-b.score||a.name.localeCompare(b.name,"ms"))
   .slice(0,limit).map(({score,...p})=>p);
}
