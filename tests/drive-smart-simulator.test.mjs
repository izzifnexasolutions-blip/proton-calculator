/**
 * FARIS e.MAS 5 — zero-dependency scenario regression tests.
 * Usage: node --test tests/drive-smart-simulator.test.mjs
 * Works without network, OSRM, browser, BMS or payment provider.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const root=new URL("../public/studio3d/",import.meta.url);
const encoded=s=>"data:text/javascript;base64,"+Buffer.from(s,"utf8").toString("base64");
const core=await readFile(new URL("drive-sim-core.js",root),"utf8");
const coreUrl=encoded(core);
const {estimate,VEHICLES,PRESETS}=await import(coreUrl);
const scenariosSource=(await readFile(new URL("drive-smart-scenarios.js",root),"utf8"))
  .replace('from "./drive-sim-core.js"', "from "+JSON.stringify(coreUrl));
const {SCENARIOS,calculateJourney,sampleJourney}=await import(encoded(scenariosSource));
const {decodeRoute,isMalaysiaArea}=await import(encoded(await readFile(new URL("drive-phase2.js",root),"utf8")));
const base={variant:"premium",distance:198.4,soc:80,people:2,cargo:15,traffic:"light",surface:"smooth",
  batteryHealth:100,road:"mixed",speed:80,tariff:.5,mode:"normal"};
const close=(a,b,eps=1e-5)=>assert.ok(Math.abs(a-b)<eps, "Expected "+a+"≈"+b);

test("official reference specs and scenario count",()=>{
  assert.equal(VEHICLES.prime.battery,30.12);
  assert.equal(VEHICLES.prime.wltp,225);
  assert.equal(VEHICLES.premium.battery,40.16);
  assert.equal(VEHICLES.premium.wltp,325);
  assert.equal(SCENARIOS.length,21);
  assert.equal(new Set(SCENARIOS.map(s=>s.id)).size,21);
  assert.equal(Object.keys(PRESETS).length,9);
});
test("all conditions sums to exactly seven distance sections",()=>{
  const x=calculateJourney(base,"all");
  assert.equal(x.composite,true);assert.equal(x.segments.length,7);
  close(x.segments.reduce((n,s)=>n+s.km,0),base.distance);
  close(x.segments.reduce((n,s)=>n+s.kwh,0),x.needed);
  close(x.segments.reduce((n,s)=>n+s.minutes,0),x.travelMinutes);
  assert.ok(x.segments.some(s=>s.settings.rain));
  assert.ok(x.segments.some(s=>s.settings.slope==="up"));
  assert.ok(x.segments.some(s=>s.settings.slope==="down"));
});
test("mild default is backward-compatible and all factors can change consumption",()=>{
  close(calculateJourney(base,"manual").needed,estimate(base).needed);
  assert.ok(estimate({...base,wind:"head"}).needed>estimate({...base,wind:"calm"}).needed);
  assert.ok(estimate({...base,tire:"low"}).needed>estimate(base).needed);
  assert.ok(estimate({...base,traffic:"heavy"}).needed>estimate(base).needed);
  assert.ok(estimate({...base,temperature:"extreme",hvac:"strong"}).needed>estimate(base).needed);
  assert.ok(estimate({...base,slope:"up"}).needed>estimate({...base,slope:"down"}).needed);
  assert.ok(estimate({...base,regen:"high"}).needed<estimate({...base,regen:"low"}).needed);
});
test("SOH reduces effective battery; no fake arrival when pack empties",()=>{
  const fresh=calculateJourney(base,"all");
  const aged=calculateJourney({...base,batteryHealth:80},"all");
  assert.ok(aged.effectiveBattery<fresh.effectiveBattery);
  assert.ok(aged.rawArrivalSoc<fresh.rawArrivalSoc);
  const noCharge=calculateJourney({...base,variant:"prime",soc:10,distance:353.3},"all");
  assert.equal(noCharge.reachAtAll,false);
  assert.equal(noCharge.arrivalSoc,0);
  assert.ok(noCharge.stopAtKm<353.3);
  assert.ok(noCharge.extraEnergyToReserve>0);
});
test("SOC graph monotonic in both route models, including depletion",()=>{
  for(const scenario of ["manual","all"])for(const variant of ["prime","premium"]){
    const journey=calculateJourney({...base,variant,soc:20,distance:353.3},scenario);
    let prev=100;
    for(let i=0;i<=100;i++){
      const r=sampleJourney(journey,i/100);
      assert.ok(Number.isFinite(r.soc)&&r.soc>=0&&r.soc<=100);
      assert.ok(r.soc<=prev+1e-7);
      prev=r.soc;
    }
  }
});
test("4,000+ finite scenario invariants",()=>{
  let count=0;
  for(const variant of ["prime","premium"])for(const scenario of ["manual","all"])
    for(const soc of [5,10,40,80,100])for(const distance of [1,12,31.7,55,92,198,353,1000])
    for(const batteryHealth of [75,80,90,100])for(const rain of [true,false])
    for(const speed of [30,70,110]){
      const v=calculateJourney({...base,variant,soc,distance,batteryHealth,rain,speed},scenario);
      assert.ok(Number.isFinite(v.kwh100)&&Number.isFinite(v.needed)&&Number.isFinite(v.stopAtKm));
      assert.ok(v.arrivalSoc>=0&&v.arrivalSoc<=100&&v.stopAtKm>=0&&v.stopAtKm<=distance+1e-6);
      count++;
    }
  assert.equal(count,3840);
});
test("OSRM geometry decoder accepts real roads, rejects fabricated/out-of-region coordinates",()=>{
  const from=[101.7116,3.1579],to=[101.6718,2.9305];
  const good={code:"Ok",routes:[{distance:35000,duration:2200,geometry:{coordinates:[from,[101.70,3.03],to]},legs:[]}]};
  const result=decodeRoute(good,from,to);
  assert.equal(result.km,35);assert.equal(result.minutes,37);
  assert.equal(result.coordinates.length,3);
  assert.ok(isMalaysiaArea([116,6])&&!isMalaysiaArea([2.35,48.85]));
  assert.throws(()=>decodeRoute({code:"NoRoute",routes:[]},from,to));
  assert.throws(()=>decodeRoute({code:"Ok",routes:[{...good.routes[0],geometry:{coordinates:[from,[2.35,48.85],to]}}]},from,to));
});
