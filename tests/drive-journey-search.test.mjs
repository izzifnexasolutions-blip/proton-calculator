/**
 * FARIS journey/search regression: run `node --test tests/drive-journey-search.test.mjs`
 * No network, geocoder credentials, browser, or paid APIs needed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const base=new URL("../public/studio3d/",import.meta.url);
const read=async n=>readFile(new URL(n,base),"utf8");
const uri=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const coreSrc=await read("drive-phase5-core.js"),coreUrl=uri(coreSrc);
const routeUrl=uri(await read("drive-phase2.js"));
const evUrl=uri(await read("drive-sim-core.js"));
const modelCode=(await read("drive-journey-model.js"))
  .replace('from "./drive-phase5-core.js"', "from "+JSON.stringify(coreUrl))
  .replace('from "./malaysia-place-index-v3.js"', "from "+JSON.stringify(new URL("malaysia-place-index-v3.js",base).href));
const modelUrl=uri(modelCode);
const appCode=(await read("drive-journey-experience.js"))
  .replace('from "./drive-phase2.js"', "from "+JSON.stringify(routeUrl))
  .replace('from "./drive-journey-model.js"', "from "+JSON.stringify(modelUrl))
  .replace('from "./drive-phase5-core.js"', "from "+JSON.stringify(coreUrl));
const {parsePhotonResults,initialPoints}=await import(uri(appCode));
const {buildJourneyTimeline,suggestDriveMode,estimatedPressure}=await import(modelUrl);
const {buildRouteSituations,chargeSafetyWindow}=await import(coreUrl);
const {PRESETS,VEHICLES,estimate}=await import(evUrl);
const scenarios=(await read("drive-smart-scenarios.js"))
  .replace('from "./drive-sim-core.js"', "from "+JSON.stringify(evUrl));
const {calculateJourney}=await import(uri(scenarios));
test("search is powered by concrete Malaysia-only coordinates",()=>{
  const pts=initialPoints(PRESETS);
  assert.ok(pts.length>=8);
  assert.ok(pts.every(p=>Array.isArray(p.coords)&&p.coords.length===2));
  assert.ok(pts.find(p=>p.name.includes("Kuala Lumpur")));
});
test("Photon filters other countries; does not invent coordinates",()=>{
  const actual=parsePhotonResults({features:[
    {geometry:{coordinates:[101.712,3.147]},properties:{name:"KLCC",city:"Kuala Lumpur",countrycode:"MY"}},
    {geometry:{coordinates:[103.82,1.32]},properties:{name:"Singapore",countrycode:"SG"}},
    {geometry:{coordinates:[101.72,3.16]},properties:{name:"Petronas",countrycode:"TH"}},
    {geometry:{coordinates:[101.712,3.147]},properties:{name:"KLCC duplicate",countrycode:"MY"}},
    {geometry:{coordinates:[-73.98,40.76]},properties:{name:"New York",countrycode:"US"}}
  ]});
  assert.equal(actual.length,1);
  assert.match(actual[0].name,/KLCC/);
  assert.deepEqual(actual[0].coords,[101.712,3.147]);
});
const route={
 km:532.5,minutes:410,
 coordinates:Array.from({length:45},(_,i)=>[101.71+i*.012,3.14+i*.058]),
 startName:"KLCC",endName:"George Town",
 roadSteps:[{name:"PLUS Expressway",ref:"E1",km:500},
   {name:"Jalan Georgetown",ref:"",km:32.5}]
};
const profile=buildRouteSituations(route);
test("timeline has exact road distance, linked model SOC and no fake stations",()=>{
 const result=calculateJourney({variant:"premium",soc:80,distance:route.km,speed:100,road:"mixed",mode:"normal"},"manual");
 const model=buildJourneyTimeline({route,result,profile,settings:{speed:100,people:2,cargoKg:15,traffic:"light"}});
 assert.ok(model.rows.length>=profile.length+2);
 assert.equal(model.rows[0].name,"KLCC");
 assert.equal(model.rows.at(-1).name,"George Town");
 assert.ok(Math.abs(model.rail.reduce((a,x)=>a+x.km,0)-route.km)<1e-5);
 assert.ok(model.rows.some(x=>x.type==="charge"));
 assert.equal(model.rows.filter(x=>x.type==="stop").length,0);
 assert.equal(model.rows.at(-1).socEnd,0);
 assert.ok(model.summary.needsCharge);
 assert.ok(model.rows.some(x=>x.type==="zone"&&x.level==="high"&&x.mode==="Normal"));
 assert.ok(model.rows.filter(x=>x.type==="zone").every(x=>x.socEnd<=x.socStart));
});
test("mod suggestions are contextual but not automatic Sport",()=>{
 assert.equal(suggestDriveMode({kind:"rural"}).mode,"Eco");
 assert.equal(suggestDriveMode({kind:"highway"}).mode,"Normal");
 assert.equal(suggestDriveMode({kind:"hilly"}).mode,"Normal");
 assert.equal(estimatedPressure({kind:"highway"}, {speed:110}).level,"high");
 assert.equal(suggestDriveMode({kind:"road"},{rain:true}).mode,"Normal");
});
test("reachable trips do not trigger fictional charging requirements",()=>{
 const result=calculateJourney({variant:"premium",soc:100,distance:28,speed:45,road:"city"},"manual");
 const timeline=buildJourneyTimeline({route:{...route,km:28,minutes:42},result,
   profile:[{kind:"road",startKm:0,endKm:28,km:28,label:"Jalan utama",source:"OSRM · inferens"}]});
 assert.equal(timeline.summary.needsCharge,false);
 assert.equal(timeline.rows.filter(x=>x.type==="charge").length,0);
 assert.equal(chargeSafetyWindow(result).needed,false);
});
test("two battery capacities retain distinct SOC predictions",()=>{
 const params={soc:80,distance:210,road:"mixed",speed:85};
 const p=estimate({...params,variant:"prime"});
 const q=estimate({...params,variant:"premium"});
 assert.ok(p.effectiveBattery<q.effectiveBattery);
 assert.ok(p.rawArrivalSoc<q.rawArrivalSoc);
});
