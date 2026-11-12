import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const root=new URL("../public/studio3d/",import.meta.url);
const encoded=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const coreSource=await readFile(new URL("drive-phase5-core.js",root),"utf8");
const p5=await import(encoded(coreSource));
const engineSource=await readFile(new URL("drive-sim-core.js",root),"utf8");
const {estimate}=await import(encoded(engineSource));
const fixtures={
  coords:[[101.7,3.14],[101.58,3.5],[101.39,3.9],[101.19,4.28],[101.09,4.6]],
  osm:{elements:[
    {type:"node",id:101,lat:3.9,lon:101.39,tags:{amenity:"charging_station",name:"Test DC","socket:type2_combo":"2","socket:type2_combo:output":"60 kW",access:"yes"}},
    {type:"node",id:102,lat:4.28,lon:101.19,tags:{amenity:"charging_station",name:"Test AC","socket:type2":"2","socket:type2:output":"22 kW",access:"yes"}},
    {type:"node",id:103,lat:3.75,lon:101.46,tags:{amenity:"charging_station",name:"Test CHAdeMO only","socket:chademo":"yes"}},
    {type:"node",id:104,lat:3.91,lon:101.40,tags:{amenity:"charging_station",name:"Private","socket:type2_combo":"yes",access:"private"}}
  ]}
};
test("OSM tags decode CCS2 DC, Type2 AC and unknown CHAdeMO",()=>{
  const records=p5.parseChargingStations(fixtures.osm,p5.cumulativeLine(fixtures.coords),210);
  const dc=records.find(x=>x.id==="node:101"),ac=records.find(x=>x.id==="node:102");
  assert.equal(dc.type,"DC");assert.equal(dc.dcPowerKw,60);
  assert.equal(ac.type,"AC");assert.equal(ac.acPowerKw,22);
  assert.equal(records.find(x=>x.id==="node:103").knownConnector,false);
  assert.equal(records.find(x=>x.id==="node:104").access,"private");
  assert.equal(p5.parsePower("60000 W"),60);
  assert.equal(p5.parsePower("unknown"),null);
});
test("OSRM road names and coarse SRTM create fact-labelled, fully covering zones",()=>{
  const route={km:200,coordinates:fixtures.coords,roadSteps:[
    {name:"Lebuhraya Utara-Selatan",ref:"E1",km:160},
    {name:"Jalan Kuala Kangsar",ref:"A1",km:40}
  ]};
  const elev=[120,150,210,600,450,320,180].map((h,i)=>({height:h,progress:i/6}));
  const zones=p5.buildRouteSituations(route,elev);
  assert.ok(zones.some(s=>s.type==="highway"));
  assert.ok(zones.some(s=>s.type==="highland"));
  assert.ok(zones.every(s=>s.source.includes("OSRM")||s.source.includes("SRTM")));
  assert.ok(Math.abs(zones.reduce((n,s)=>n+s.km,0)-200)<.00001);
  assert.ok(p5.zoneAtDistance(zones,130));
});
test("charging requires real compatible access and respects reserve",()=>{
  const model=estimate({variant:"premium",soc:35,distance:200,road:"mixed",speed:80});
  const stations=[
    {id:"dc",name:"Fixture DC",knownConnector:true,dc:true,ac:false,dcPowerKw:60,kmAlong:32,offsetKm:.4,access:"yes",accessNeedsCheck:false},
    {id:"private",name:"Private",knownConnector:true,dc:true,dcPowerKw:60,kmAlong:25,offsetKm:.1,access:"private",accessNeedsCheck:true},
    {id:"unknown",name:"Unknown",knownConnector:false,dc:false,ac:false,kmAlong:20,offsetKm:.1,access:"yes"}
  ];
  const p=p5.planCharging(model,stations);
  assert.equal(p.kind,"one");assert.equal(p.stops.length,1);assert.equal(p.stops[0].station.id,"dc");
  assert.ok(p.stops[0].arrivalSoc>=15);
  assert.equal(p.stops[0].requiresVerification,true);
  assert.ok(p5.chargeDuration(stations[0],"prime",10,true)>10/53*60);
});
test("no invented stops for no route stations, no stop on short journeys",()=>{
  const impossible=estimate({variant:"prime",soc:10,distance:450});
  assert.equal(p5.planCharging(impossible,[]).kind,"unavailable");
  const short=estimate({variant:"premium",soc:100,distance:40});
  assert.equal(p5.planCharging(short,[]).kind,"none");
});
test("route projection and scene classifications do not claim guessed traffic",()=>{
  const line=p5.cumulativeLine(fixtures.coords);
  const near=p5.nearLine(fixtures.coords[2],line);
  assert.ok(near.offsetKm<.0001);
  assert.equal(p5.categorizeRoad("Jalan Kampung Terentang").type,"rural");
  assert.equal(p5.categorizeRoad("E1 PLUS Highway").type,"highway");
  assert.equal(p5.categorizeRoad("Unnamed").type,"unknown");
});
const apiCode=(await readFile(new URL("drive-phase5-api.js",root),"utf8"))
  .replace('from "./drive-phase5-core.js"', "from "+JSON.stringify(encoded(coreSource)));
const api=await import(encoded(apiCode));
test("bounded user-triggered Overpass & SRTM requests",()=>{
  const query=api.makeOverpassQuery(fixtures.coords);
  assert.match(query,/amenity/);
  assert.match(query,/charging_station/);
  assert.match(query,/around:4500/);
  assert.match(query,/out center 350/);
  const url=api.makeElevationURL(fixtures.coords);
  assert.match(url,/opentopodata.org/);
  assert.ok(decodeURIComponent(url).split("|").length<=21);
});
test("OSRM verified charging legs recompute the actual route energy",()=>{
  const x=estimate({variant:"premium",soc:40,distance:200,road:"mixed"});
  const stop={station:{name:"Fixture only"},targetSoc:80};
  const v=api.verifyChargeEnergy(x,[stop],[35,165]);
  assert.ok(v.steps.length===1);
  assert.equal(typeof v.safe,"boolean");
  assert.ok(Number.isFinite(v.finishSoc));
});

test("532 km road retains >10 honest checkpoints instead of two blocks",()=>{
  const km=532.5,coords=Array.from({length:35},(_,i)=>[101.7+i*.02,3.1+i*.05]);
  const road={km,coordinates:coords,roadSteps:[{name:"Lebuhraya Utara Selatan",ref:"E1",km}]};
  const sectors=p5.buildRouteSituations(road);
  assert.ok(sectors.length>=10&&sectors.length<=28);
  assert.ok(Math.abs(sectors.reduce((n,s)=>n+s.km,0)-km)<.0001);
  assert.ok(sectors.every(s=>s.source.includes("OSRM")&&s.kind==="highway"));
});
test("charging search window works even when OSM returns no charger records",()=>{
  const trip=estimate({variant:"premium",soc:80,distance:532.5,road:"mixed",speed:75,ac:true});
  const window=p5.chargeSafetyWindow(trip);
  assert.equal(window.needed,true);
  assert.ok(window.searchFromKm>0&&window.searchFromKm<window.latestStopKm);
  assert.ok(window.latestStopKm<window.reserve10Km);
  assert.ok(window.reserve10Km<window.emptyKm&&window.emptyKm<532.5);
  assert.equal(p5.planCharging(trip,[]).kind,"unavailable");
});
test("short trip says no compulsory stop; very low SOC says charge before departure",()=>{
  const enough=p5.chargeSafetyWindow(estimate({variant:"premium",soc:100,distance:35}));
  assert.equal(enough.needed,false);
  const low=p5.chargeSafetyWindow(estimate({variant:"prime",soc:10,distance:100}));
  assert.equal(low.needed,true);
  assert.equal(low.alreadyLow,true);
  assert.equal(low.searchFromKm,0);
  assert.equal(low.latestStopKm,0);
});
test("nearest place is an attributed OSM vicinity not a charger promise",()=>{
  const coords=[[101.7,3.15],[101.8,3.20],[101.9,3.25]];
  const index=p5.cumulativeLine(coords);
  const near=p5.nearKnownPlace([{name:"Pekan Sampel",kind:"town",lon:101.8,lat:3.20}],index,index.lengthKm/2);
  assert.equal(near.name,"Pekan Sampel");
  assert.equal(near.approximate,true);
});
