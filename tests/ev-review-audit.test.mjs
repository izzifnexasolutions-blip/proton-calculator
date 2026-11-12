import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {auditSummary,reviewBucket,auditFilter,exportAuditCsv} from "../public/studio3d/ev-review-audit.js";
const data=JSON.parse(await readFile(new URL("../public/studio3d/ev-user-import-catalog-20261113.json",import.meta.url),"utf8"));
const rows=data.records;
test("510 imported EV records preserve evidence and mutually exclusive review buckets",()=>{
 const summary=auditSummary(rows);
 assert.equal(summary.total,510);
 assert.equal(summary.candidate,194);
 assert.equal(summary.duplicate,21);
 assert.equal(summary.placeholder,235);
 assert.equal(summary.no_coordinates,60);
 assert.equal(Object.values(summary).filter(x=>Number.isInteger(x)).reduce((a,b)=>a+b,0),1020);
});
test("duplicate checks override valid coordinates; placeholders never become map candidates",()=>{
 const dupe=rows.find(x=>x.duplicateOf);
 assert.equal(reviewBucket(dupe),"duplicate");
 assert.ok(auditFilter(rows,{status:"candidate"}).every(r=>!r.duplicateOf&&Number.isFinite(r.lat)));
});
test("combined status + state filters find exact recorded source rows",()=>{
 const negeri="Perak";
 const result=auditFilter(rows,{state:negeri,status:"candidate",query:"Taiping"});
 assert.ok(result.length>0);
 assert.ok(result.every(x=>x.state===negeri&&!x.duplicateOf));
 assert.ok(result.every(x=>x.name.toLowerCase().includes("taiping")||x.area.toLowerCase().includes("taiping")));
});
test("CSV export is filtered, escapes quotes, and prevents spreadsheet formula injection",()=>{
 const csv=exportAuditCsv([{name:"=HYPERLINK(\"https://evil\")",state:"Perak",sourceRow:2,
   reviewStatus:"user_supplied_unverified",lat:4.2,lon:101.2},
   {name:"Bob, Said \"Hi\"",reviewStatus:"needs_geocode",lat:null,lon:null}]);
 assert.match(csv,/'=HYPERLINK/);
 assert.match(csv,/"Bob, Said ""Hi"""/);
 assert.match(csv,/candidate/);
 assert.match(csv,/no_coordinates/);
 assert.equal(csv.trim().split("\r\n").length,3);
});
test("live map does not import upload records into automatic EV route selection",async()=>{
 const planner=await readFile(new URL("../public/studio3d/drive-phase5.js",import.meta.url),"utf8");
 const catalog=await readFile(new URL("../public/studio3d/drive-user-catalog.js",import.meta.url),"utf8");
 assert.doesNotMatch(planner,/ev-user-import-catalog-20261113\.json/);
 assert.match(catalog,/reviewBucket\(r\)==="candidate"/);
});
