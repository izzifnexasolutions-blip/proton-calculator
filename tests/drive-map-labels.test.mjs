/**
 * Run with Node 20+: node --test tests/drive-map-labels.test.mjs
 * No web calls, paid services or mutable browser state required.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const base=new URL("../public/studio3d/",import.meta.url);
const read=async name=>readFile(new URL(name,base),"utf8");
const dataURI=s=>"data:text/javascript;base64,"+Buffer.from(s).toString("base64");
const coreCode=await read("drive-phase5-core.js");
const coreURI=dataURI(coreCode);
const core=await import(coreURI);
const modelURI=dataURI((await read("drive-journey-model.js"))
 .replace('from "./drive-phase5-core.js"', 'from '+JSON.stringify(coreURI)));
const {buildJourneyTimeline}=await import(modelURI);
const ev=await import(dataURI(await read("drive-sim-core.js")));
test("actual OSRM road names and references replace generic road categories",()=>{
 const route={km:180,coordinates:[[101.5,3.5],[101.6,3.9],[101.8,4.1]],
   roadSteps:[{km:105,name:"Jalan Kuala Lipis",ref:"8"},
    {km:75,name:"Lebuhraya Pantai Timur",ref:"E8"}]};
 const zones=core.buildRouteSituations(route);
 assert.ok(zones.some(z=>z.label.includes("Jalan Kuala Lipis (8)")));
 assert.ok(zones.some(z=>z.label.includes("Lebuhraya Pantai Timur (E8)")));
 assert.ok(zones.every(z=>z.source.includes("OSRM")||z.source.includes("SRTM")));
 assert.ok(Math.abs(zones.reduce((n,z)=>n+z.km,0)-180)<1e-5);
});
test("unmapped road never gets an invented name",()=>{
 const zones=core.buildRouteSituations({
   km:48,coordinates:[[101,3],[101.4,3.3]],roadSteps:[{km:48,name:"",ref:""}]
 });
 assert.ok(zones.every(z=>z.label==="Jenis jalan tidak dikenal pasti"));
});
test("a source failure never fabricates charging availability",()=>{
 const stations=[{kmAlong:80,offsetKm:.5,dc:true,ac:false,knownConnector:true,
   access:"yes",name:"Example OSM DC"}];
 const missing=core.chargerEvidenceForSection(stations,"not_checked",70,90);
 assert.equal(missing.confidence,"unknown");assert.equal(missing.total,0);
 const failed=core.chargerEvidenceForSection(stations,"error",70,90);
 assert.equal(failed.confidence,"unknown");
 assert.match(failed.label,/gagal/);
});
test("actual OSM Type2/CCS2 tags drive source-backed per-section evidence",()=>{
 const data=[
 {kmAlong:82,offsetKm:.7,dc:true,ac:false,knownConnector:true,access:"yes",name:"DC Fixture"},
 {kmAlong:87,offsetKm:1.1,dc:false,ac:true,knownConnector:true,access:"yes",name:"AC Fixture"},
 {kmAlong:89,offsetKm:2.1,dc:true,ac:false,knownConnector:true,access:"private",name:"Private Fixture"},
 {kmAlong:95,offsetKm:.5,dc:false,ac:false,knownConnector:false,access:"unknown",name:"Unknown Fixture"}
 ];
 const x=core.chargerEvidenceForSection(data,"success",80,91);
 assert.equal(x.dc,1);assert.equal(x.ac,1);
 assert.equal(x.unknown,1);
 assert.match(x.label,/1 DC CCS2/);assert.match(x.label,/1 AC Type 2/);
 assert.ok(!x.label.includes("Private Fixture"));
 assert.equal(x.confidence,"recorded");
});
test("no observed station means no OSM record, not zero real chargers",()=>{
 const x=core.chargerEvidenceForSection([],"success",20,60);
 assert.equal(x.confidence,"none_recorded");
 assert.match(x.label,/bukan bukti tiada pengecas/);
});
test("nearby locality is explicitly approximate and linked to route point",()=>{
 const route={km:155,coordinates:[[101.6,3.1],[101.8,3.9],[102.2,4.2]],
   roadSteps:[{km:155,name:"Jalan Kuala Lipis",ref:"8"}],startName:"KL",endName:"Kuala Lipis"};
 const result=ev.estimate({variant:"premium",soc:80,distance:route.km,road:"mixed"});
 const zone=core.buildRouteSituations(route);
 const line=core.cumulativeLine(route.coordinates);
 const mid=core.pointAtFraction(line,.5);
 const places=[{name:"Bentong",kind:"town",lon:mid[0],lat:mid[1]}];
 const rows=buildJourneyTimeline({route,result,profile:zone,places,
   stations:[],chargerStatus:"error"});
 assert.ok(rows.rows.some(r=>r.type==="zone"&&r.name.includes("Sekitar Bentong")));
 assert.ok(rows.rows.filter(r=>r.type==="zone").every(r=>r.charger.status==="error"));
 assert.ok(rows.rows.some(r=>r.type==="zone"&&r.roadName==="Jalan Kuala Lipis"));
});
