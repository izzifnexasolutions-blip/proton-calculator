import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {OFFLINE_TOWNS,localPlaceMatches} from "../public/studio3d/malaysia-place-index-v3.js";
import {stationEvidence,routeChargerShortlist} from "../public/studio3d/ev-journey-v3-core.js";
const root=new URL("../public/studio3d/",import.meta.url);
test("Tanah Merah Kelantan is available without a Photon request",()=>{
 const matches=localPlaceMatches("tanah merah");
 assert.equal(matches[0].name,"Tanah Merah, Kelantan");
 assert.deepEqual(matches[0].coords,[102.14841,5.80978]);
 assert.match(matches[0].sourceUrl,/openstreetmap\.org\/node\/369488884/);
});
test("local place ranking prioritizes full city prefixes and excludes unrelated places",()=>{
 const matches=localPlaceMatches("tanah",[
  {name:"Kuala Lumpur",coords:[101.7,3.14]},
  {name:"Tanah Merah Set A",coords:[102.14,5.8]}
 ]);
 assert.ok(matches.length>=1);
 assert.ok(matches.every(x=>x.name.toLowerCase().includes("tanah")));
 assert.equal(localPlaceMatches("zzzz nomatch").length,0);
});
test("unverified user uploads never qualify for charging stop selection",()=>{
 const upload={name:"Unverified Excel",knownConnector:true,dc:true,access:"yes",
  sources:["User Excel"],kmAlong:50,offsetKm:1};
 assert.equal(stationEvidence(upload).planningCandidate,false);
 assert.equal(routeChargerShortlist([upload]).length,0);
});
test("private or incompatible public records are excluded even with OSM source",()=>{
 const base={name:"A",knownConnector:true,dc:true,access:"unknown",sources:["OSM"],
   kmAlong:50,offsetKm:1,coordinates:[101,3]};
 assert.equal(stationEvidence({...base,access:"private"}).planningCandidate,false);
 assert.equal(stationEvidence({...base,knownConnector:false}).planningCandidate,false);
 assert.equal(stationEvidence(base).planningCandidate,true);
 assert.equal(stationEvidence({...base,sourceConflict:true}).planningCandidate,false);
 assert.equal(routeChargerShortlist([{...base,access:"private"},base]).length,1);
});
test("shortlist obeys type filter and is ranked by geometric offset (not road distance)",()=>{
 const base={knownConnector:true,access:"unknown",sources:["Katalog OCM"],kmAlong:50,
  dc:true,ac:false,dcPowerKw:60,offsetKm:3,osmUrl:"https://example.com",id:"1"};
 const ac={...base,id:"2",name:"AC",dc:false,ac:true,acPowerKw:22,offsetKm:1};
 const dc={...base,id:"3",name:"DC",offsetKm:2};
 assert.deepEqual(routeChargerShortlist([base,ac,dc],5,"dc").map(x=>x.id),["3","1"]);
 assert.deepEqual(routeChargerShortlist([base,ac,dc],5,"ac").map(x=>x.id),["2"]);
 assert.equal(routeChargerShortlist([base,ac,dc],5,"all")[0].name,"AC");
});
test("Smart Journey 3.0 exposes explicit auto-planner and keeps uploaded data out of planner",async()=>{
 const js=await readFile(new URL("drive-simulator-ui.js",root),"utf8");
 const core=await readFile(new URL("drive-phase5.js",root),"utf8");
 const markup=await readFile(new URL("drive-simulator.html",root),"utf8");
 assert.match(js,/phase5\?\.autoPlan\(\)/);
 assert.match(core,/async function autoPlan\(\)/);
 assert.match(markup,/id="ev-v3-stops"/);
 assert.match(markup,/id="ev-v3-nearby-list"/);
 assert.doesNotMatch(core,/ev-user-import-catalog-20261113\.json/);
});
