import test from "node:test";
import assert from "node:assert/strict";
import {WEST_COAST_CHARGERS,westCoastOcmRecords} from "../public/studio3d/west-coast-public-chargers.js";
import {cumulativeLine,parseOcmStations,mergeChargingStations} from "../public/studio3d/drive-phase5-core.js";
test("all 27 curated West Coast POIs have distinct OCM source and coordinates",()=>{
 assert.equal(WEST_COAST_CHARGERS.length,27);
 assert.equal(new Set(WEST_COAST_CHARGERS.map(x=>x.id)).size,27);
 for(const station of WEST_COAST_CHARGERS){
   assert.match(station.sourceUrl,new RegExp("/poi/details/"+station.id+"$"));
   assert.ok(station.lat>=1.2&&station.lat<=6.5&&station.lon>=100&&station.lon<=104);
   assert.equal(station.publicListing,true);
   assert.equal(station.liveVerified,false);
   assert.ok(station.dcKw>=0&&station.acKw>=0);
 }
});
test("never make CCS2 or charging power up for unrecorded connector",()=>{
 const s=WEST_COAST_CHARGERS.find(x=>x.id===174397);
 assert.equal(s.dcKw,0);assert.equal(s.acKw,0);
 const ocm=westCoastOcmRecords().find(x=>x.ID===174397);
 assert.deepEqual(ocm.Connections,[]);
});
test("public curated records are projected only near real route geometry",()=>{
 const line=cumulativeLine([[100.36,6.08],[100.38,6.13]]);
 const sites=parseOcmStations(westCoastOcmRecords(),line,6);
 assert.ok(sites.some(s=>s.name.includes("Alor Setar")));
 assert.ok(sites.every(s=>s.offsetKm<=7));
 assert.ok(sites.every(s=>s.access!=="private"));
});
test("merged stations preserve catalog provenance and not live status",()=>{
 const line=cumulativeLine([[101.57,3.22],[101.60,3.22]]);
 const catalog=parseOcmStations(westCoastOcmRecords(),line,4)
   .map(s=>({...s,sources:["Katalog OCM"]}));
 const result=mergeChargingStations([],catalog);
 assert.ok(result.some(s=>s.sources.includes("Katalog OCM")));
 assert.ok(result.every(s=>s.availability==="Tidak diketahui"));
});
