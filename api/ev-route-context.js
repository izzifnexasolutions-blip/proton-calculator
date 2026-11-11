/**
 * FARIS e.MAS 5 · Malaysia free open-data route context proxy.
 *
 * This endpoint is NOT a production-scale Overpass proxy. Intentionally:
 * - fixed upstream allowlist, no user-supplied URLs
 * - no API key, no persistent location storage
 * - bounded sampling and JSON output
 * - one click, no background polling or retry
 * - short in-memory cache, public-source etiquette / soft per-instance throttle
 * - partial failure reporting instead of fabricating terrain/charger entries.
 */
export const config={maxDuration:30};
const OVERPASS="https://overpass-api.de/api/interpreter";
const TOPO="https://api.opentopodata.org/v1/srtm90m";
const cache=new Map();
let lastUpstream=0;
const MAX_BYTES=11000;
function valid(p){
  return Array.isArray(p)&&p.length===2&&p.every(v=>typeof v==="number"&&Number.isFinite(v))&&
    p[0]>=99&&p[0]<=119.5&&p[1]>=.8&&p[1]<=7.6;
}
function result(res,status,payload){
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.end(JSON.stringify(payload));
}
export default async function handler(req,res){
  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return result(res,405,{error:"Guna POST untuk carian laluan Malaysia."});
  }
  if(Number(req.headers?.["content-length"]||0)>MAX_BYTES)
    return result(res,413,{error:"Permintaan laluan terlalu besar."});
  let body;
  try{body=typeof req.body==="string"?JSON.parse(req.body):req.body;}
  catch{return result(res,400,{error:"Format koordinat JSON tidak sah."});}
  if(!body||!Array.isArray(body.chargerPoints)||!Array.isArray(body.elevationPoints))
    return result(res,400,{error:"Koordinat carian tidak lengkap."});
  const charger=body.chargerPoints,elevation=body.elevationPoints;
  if(charger.length<2||charger.length>30||elevation.length<2||elevation.length>21||
    !charger.every(valid)||!elevation.every(valid))
    return result(res,400,{error:"Had koordinat atau kawasan carian Malaysia tidak dipenuhi."});
  const key=JSON.stringify([charger,elevation]);
  const now=Date.now(),hit=cache.get(key);
  if(hit&&now-hit.t<15*60000)
    return result(res,200,{...hit.data,cacheHit:true});
  // Protect the volunteer service from bursts on the same Vercel instance.
  if(now-lastUpstream<8000)
    return result(res,429,{error:"Perkhidmatan komuniti sedang dihadkan. Cuba kemudian."});
  lastUpstream=now;
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),18000);
  const path=charger.map(([lon,lat])=>lat.toFixed(5)+","+lon.toFixed(5)).join(",");
  const query='[out:json][timeout:18];nwr["amenity"="charging_station"](around:4500,'+
    path+');out center 350;';
  const loc=elevation.map(([lon,lat])=>lat.toFixed(5)+","+lon.toFixed(5)).join("|");
  const topourl=TOPO+"?locations="+encodeURIComponent(loc);
  const output={stations:[],elevations:[],stationError:null,elevationError:null,cacheHit:false};
  try{
    const [os,el]=await Promise.allSettled([
      fetch(OVERPASS,{method:"POST",body:new URLSearchParams({data:query}),
        headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
        signal:ctl.signal}),
      fetch(topourl,{headers:{Accept:"application/json"},signal:ctl.signal})
    ]);
    if(os.status==="fulfilled"&&os.value.ok){
      try{
        const raw=await os.value.json();
        if(Array.isArray(raw.elements))output.stations=raw.elements.slice(0,350);
        else output.stationError="Data pengecas OSM tidak lengkap.";
      }catch{output.stationError="Respons pengecas OSM tidak sah.";}
    }else output.stationError=os.status==="rejected"?"Overpass tidak dapat dihubungi.":
      "Overpass HTTP "+os.value.status;
    if(el.status==="fulfilled"&&el.value.ok){
      try{
        const raw=await el.value.json();
        if(Array.isArray(raw.results))output.elevations=raw.results.slice(0,21);
        else output.elevationError="Data ketinggian tidak lengkap.";
      }catch{output.elevationError="Respons ketinggian tidak sah.";}
    }else output.elevationError=el.status==="rejected"?"SRTM tidak dapat dihubungi.":
      "SRTM HTTP "+el.value.status;
  }catch(e){
    output.stationError="Sumber pengecas tidak tersedia.";
    output.elevationError="Sumber ketinggian tidak tersedia.";
  }finally{clearTimeout(timer);}
  // Cache partial success too, to prevent bursts from repeated button presses.
  if(cache.size>30)cache.clear();
  cache.set(key,{t:Date.now(),data:output});
  return result(res,200,output);
}
