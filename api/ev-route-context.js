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
// FOSSGIS endpoint began rejecting automated/cloud requests with HTTP 406
// in April 2026. Private.coffee permits app/commercial queries. No host
// rotation or automatic retries across public providers.
const OVERPASS="https://overpass.private.coffee/api/interpreter";
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
  if(charger.length<2||charger.length>42||elevation.length<2||elevation.length>21||
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
  // Two bounded datasets in ONE request. 7km samples of a <=42-point
  // corridor rather than an unbounded national charging-station query.
  const query='[out:json][timeout:22];'+
    'nwr["amenity"="charging_station"](around:7000,'+path+');out center 450;'+
    'node["place"~"^(city|town|village)$"](around:4000,'+path+');out body 140;';
  const loc=elevation.map(([lon,lat])=>lat.toFixed(5)+","+lon.toFixed(5)).join("|");
  const topourl=TOPO+"?locations="+encodeURIComponent(loc);
  const output={stations:[],places:[],elevations:[],stationError:null,elevationError:null,cacheHit:false};
  try{
    const [os,el]=await Promise.allSettled([
      fetch(OVERPASS,{method:"POST",body:new URLSearchParams({data:query}),
        headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json",
          "User-Agent":"FARISProtonJourney/1.2 (+https://www.farisprotonapp.com/)",
          "Referer":"https://www.farisprotonapp.com/"},
        signal:ctl.signal}),
      fetch(topourl,{headers:{Accept:"application/json"},signal:ctl.signal})
    ]);
    if(os.status==="fulfilled"&&os.value.ok){
      try{
        const raw=await os.value.json();
        if(Array.isArray(raw.elements)){
          output.stations=raw.elements.filter(x=>x?.tags?.amenity==="charging_station").slice(0,450);
          output.places=raw.elements.filter(x=>["city","town","village"].includes(x?.tags?.place))
            .slice(0,140).map(x=>({
              id:String(x.id),name:String(x.tags?.name||"").slice(0,90),
              kind:x.tags.place,lat:Number(x.lat??x.center?.lat),
              lon:Number(x.lon??x.center?.lon)
            })).filter(x=>x.name&&Number.isFinite(x.lat)&&Number.isFinite(x.lon));
          if(raw.remark)output.stationError="Overpass: "+String(raw.remark).slice(0,95);
        }else output.stationError="Data pengecas OSM tidak lengkap.";
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
