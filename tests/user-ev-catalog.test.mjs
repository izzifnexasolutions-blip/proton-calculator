import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const base=new URL("../public/studio3d/",import.meta.url);
const data=JSON.parse(await readFile(new URL("ev-user-import-catalog-20261113.json",base),"utf8"));
test("all 510 spreadsheet rows are preserved in staging",()=>{
 assert.equal(data.count,510);assert.equal(data.records.length,510);
 assert.ok(data.records.every(x=>x.name&&x.sourceFile&&Number.isInteger(x.sourceRow)));
});
test("ambiguous placeholders and ungeocoded entries are explicitly segregated",()=>{
 const by=v=>data.records.filter(r=>r.reviewStatus===v);
 assert.equal(by("needs_review_placeholder").length,235);
 assert.equal(by("needs_geocode").length,60);
 assert.equal(by("user_supplied_unverified").length,215);
 assert.ok(by("needs_geocode").every(r=>r.lat===null&&r.lon===null));
});
test("only unverified candidates have map coordinates, never claim live availability",()=>{
 const candidate=data.records.filter(r=>r.reviewStatus==="user_supplied_unverified");
 assert.ok(candidate.every(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lon)));
 assert.ok(!JSON.stringify(data).includes('"liveVerified":true'));
});
