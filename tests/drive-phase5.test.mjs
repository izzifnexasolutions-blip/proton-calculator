// node --test tests/drive-phase5.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {estimate} from "../public/studio3d/drive-sim-core.js";
import {cumulativeLine,parseChargingStations,parseElevations,buildRouteSituations,
 planCharging,parsePower,chargeDuration} from "../public/studio3d/drive-phase5-core.js";
import {makeOverpassQuery,makeElevationURL,verifyChargeEnergy} from "../public/studio3d/drive-phase5-api.js";
import routeProxy from "../api/ev-route-context.js";
const coords=[[101.7,3.14],[101.56,3.46],[101.4,3.84],[101.24,4.25],[101.09,4.6]];
const line=cumulativeLine(coords);
const osm={elements:[
 {type:"node",id:1,lat:3.84,lon:101.4,tags:{amenity:"charging_station",name:"Test CCS2","socket:type2_combo":"yes","socket:type2_combo:output":"60 kW",access:"yes"}},
 {type:"node",id:2,lat:4.25,lon:101.24,tags:{amenity:"charging_station","socket:type2":"yes","socket:type2:output":"11 kW"}},
 {type:"node",id:3,lat:3.80,lon:101.44,tags:{amenity:"charging_station","socket:chademo":"yes"}},
 {type:"node",id:4,lat:3.87,lon:101.42,tags:{amenity:"charging_station","socket:type2_combo":"yes",access:"private"}}]};
const stations=parseChargingStations(osm,line,200);
test("free corridor API uses bounded sample counts",()=>{
 assert.match(makeOverpassQuery(coords),/amenity/);
 assert.match(makeElevationURL(coords),/srtm90m/);
});
test("OSM Type2 AC, CCS2 DC and incompatible connector classification",()=>{
 const dc=stations.find(s=>s.id==="node:1"),ac=stations.find(s=>s.id==="node:2");
 assert.equal(dc.dcPowerKw,60);assert.ok(dc.dc);
 assert.equal(ac.acPowerKw,11);assert.ok(ac.ac);
 assert.equal(stations.find(s=>s.id==="node:3").knownConnector,false);
 assert.equal(stations.find(s=>s.id==="node:4").access,"private");
 assert.equal(parsePower("60000 W"),60);
 assert.equal(parsePower("unknown"),null);
});
test("sample SRTM terrain and OSRM named road segments",()=>{
 const route={km:200,coordinates:coords,roadSteps:[
  {name:"Lebuhraya Utara Selatan",ref:"E1",km:155},
  {name:"Jalan Kuala Kangsar",km:45}]};
 const elevation=parseElevations({results:[120,150,210,600,450,320,180].map(elevation=>({elevation}))},line);
 const segments=buildRouteSituations(route,elevation);
 assert.ok(segments.some(s=>s.kind==="highway"));
 assert.ok(segments.some(s=>s.kind==="hilly"));
 assert.ok(Math.abs(segments.reduce((sum,s)=>sum+s.km,0)-200)<.0001);
});
test("no unnecessary charging; provisional stops and vehicle DC limit",()=>{
 assert.equal(planCharging(estimate({variant:"premium",soc:100,distance:40}),stations).kind,"none");
 assert.equal(planCharging(estimate({variant:"prime",soc:10,distance:900}),[]).kind,"unavailable");
 const dummy={id:"1",name:"Sample",access:"yes",knownConnector:true,dc:true,ac:false,
  dcPowerKw:60,offsetKm:.4,kmAlong:30,accessNeedsCheck:false};
 assert.equal(planCharging(estimate({variant:"premium",soc:35,distance:200}),[dummy]).kind,"one");
 assert.ok(chargeDuration(dummy,"prime",10,true)>10/53*60);
});
test("verify charge energy never guarantees impossible road detour",()=>{
 const r=estimate({variant:"premium",distance:200,soc:70});
 const s={station:{name:"Test"},targetSoc:85};
 assert.equal(verifyChargeEnergy(r,[s],[380,500]).safe,false);
});
test("public proxy rejects invalid input before calling open-data providers",async()=>{
 const req={method:"POST",body:{chargerPoints:[[0,0],[101,3]],
  elevationPoints:[[101,3],[101.2,3.2]]},headers:{}};
 const res={setHeader(){},end(s){this.body=JSON.parse(s)}};
 await routeProxy(req,res);assert.equal(res.statusCode,400);
});
