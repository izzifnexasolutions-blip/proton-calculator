/** Regression tests for Phase 4. Run: node --test tests/drive-phase4-controls.test.mjs
 * No network, GLB downloads, or WebGL context needed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
class E{
 constructor(id){this.id=id;this.value="";this.textContent="";this.dataset={};this.hidden=false;this.disabled=false;
   this.events={};this.style={setProperty:(k,v)=>this.style[k]=v};this.classList={toggle(){}};}
 addEventListener(k,fn){(this.events[k]??=[]).push(fn)}
 async emit(k){await Promise.all((this.events[k]||[]).map(fn=>fn()))}
 setAttribute(k,v){this[k]=v}
}
const ids=["drive-screen","drive-3d-layer","drive-3d-status","drive-view-2d","drive-view-3d",
 "drive-camera-tabs","drive-seek","drive-seek-value","drive-seek-limit","drive-seek-end"];
const el=Object.fromEntries(ids.map(id=>[id,new E(id)]));
const cameras=["chase","front","side","top"].map(x=>Object.assign(new E("camera"),{dataset:{camera:x}}));
const rates=[.5,1,2].map(x=>Object.assign(new E("rate"),{dataset:{rate:String(x)}}));
globalThis.document={getElementById:id=>el[id],
 querySelectorAll:s=>s==="[data-camera]"?cameras:s==="[data-rate]"?rates:[]};
let loads=0,disposals=0,updates=0,success=true;
globalThis.__driveStub=()=>{let active=false;return{
 get enabled(){return active},async enable(){loads++;active=success;return active},
 disable(){disposals++;active=false},setCamera(){},update(){updates++}
}};
const file=await readFile(new URL("../public/studio3d/drive-phase4-controls.js",import.meta.url),"utf8");
const patched=file.replace('import {createDrive3D} from "./drive-phase4-3d.js";',
 'const createDrive3D=globalThis.__driveStub;');
const {createPhase4Controls}=await import("data:text/javascript;base64,"+Buffer.from(patched).toString("base64"));
const scrubs=[],speeds=[];
const api=createPhase4Controls({
 onSeek:value=>scrubs.push(value),onRate:value=>speeds.push(value),
 getSnapshot:()=>({result:{km:200,stopAtKm:150},progress:.3,playing:false,
   reading:{km:60,soc:70,stage:{speed:65,settings:{road:"mixed"}}}})
});
test("2D initial state and no eager GLB load",()=>{
 assert.equal(loads,0);assert.equal(api.enabled3d,false);assert.equal(el["drive-3d-layer"].hidden,true);
});
test("3D, camera, scrubber and playback controls",async()=>{
 await el["drive-view-3d"].emit("click");
 assert.equal(loads,1);assert.equal(api.enabled3d,true);
 await cameras[2].emit("click");assert.equal(api.camera,"side");
 api.render({km:200,stopAtKm:150,road:"mixed"},.3,true,{km:60,soc:70,
   canStillDrive:true,stage:{speed:65,settings:{road:"mixed"}}});
 assert.equal(el["drive-seek"].value,"300");assert.ok(updates>0);
 el["drive-seek"].value="900";await el["drive-seek"].emit("input");
 assert.equal(scrubs.at(-1),.9);
 await rates[2].emit("click");assert.equal(speeds.at(-1),2);
 await el["drive-view-2d"].emit("click");assert.equal(api.enabled3d,false);assert.ok(disposals>0);
});
test("unavailable 3D fails back to fully usable 2D",async()=>{
 success=false;await el["drive-view-3d"].emit("click");
 assert.equal(api.enabled3d,false);
 assert.equal(el["drive-3d-layer"].hidden,true);
 assert.match(el["drive-3d-status"].textContent,/2D automatik/);
});
