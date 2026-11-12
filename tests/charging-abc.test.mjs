import test from "node:test";
import assert from "node:assert/strict";
import {cumulativeLine,parseOcmStations,mergeChargingStations,chargeDuration}
  from "../public/studio3d/drive-phase5-core.js";

const line=cumulativeLine([[101.0,3.0],[101.4,3.0]]);
const record={
  ID:42,AddressInfo:{Title:"Stesen Ujian",Latitude:3,Longitude:101.2},
  Connections:[{ConnectionType:{Title:"CCS (Type 2)"},PowerKW:60}],
  OperatorInfo:{Title:"Contoh"},UsageType:{IsPublicAccess:true}
};

test("OCM connector and bounded corridor record",()=>{
  const items=parseOcmStations([record],line,45);
  assert.equal(items.length,1);
  assert.equal(items[0].dc,true);
  assert.equal(items[0].dcPowerKw,60);
  assert.equal(items[0].availability,"Tidak diketahui");
});
test("reject OCM records far from route",()=>{
  assert.equal(parseOcmStations([{...record,ID:43,AddressInfo:{Latitude:6,Longitude:112}}],line,45).length,0);
});
test("deduplicate close matching observations and preserve both sources",()=>{
  const ocm=parseOcmStations([record],line,45);
  const osm=[{...ocm[0],id:"node:100",sources:["OSM"]}];
  const combined=mergeChargingStations(osm,ocm);
  assert.equal(combined.length,1);
  assert.deepEqual(combined[0].sources,["OSM","OCM"]);
});
test("charging duration stays unknown if station power not observed",()=>{
  const station=parseOcmStations([{...record,Connections:[{ConnectionType:{Title:"CCS (Type 2)"}}]}],line,45)[0];
  assert.equal(chargeDuration(station,"prime",10,true),null);
});
