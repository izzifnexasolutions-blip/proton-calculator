/**
 * FARIS PROTON e.MAS 5 — Drive Simulator Phase 1.
 * These are planning estimates, NOT telematics, homologation consumption,
 * live traffic, or a guarantee that an actual journey can be completed.
 * Baseline nominal-kWh/WLTP-km is an indicative energy proxy, not usable pack energy.
 */
export const VEHICLES=Object.freeze({
  prime:{name:"e.MAS 5 Prime",battery:30.12,wltp:225,powerKw:58,torqueNm:130},
  premium:{name:"e.MAS 5 Premium",battery:40.16,wltp:325,powerKw:85,torqueNm:150}
});
/* Approximate example road distances taken from published route summaries.
 * Start/end pins are representative town/city centres, not routing endpoints.
 * Never turn the straight guide line on the map into an alleged driving route.
 */
export const PRESETS=Object.freeze({
  putrajaya:{name:"KLCC → Putrajaya Sentral",km:31.7,origin:"KLCC, Kuala Lumpur",destination:"Putrajaya Sentral",from:[101.7116,3.1579],to:[101.6718,2.9305],road:"mixed",speed:65,source:"https://www.rome2rio.com/s/Klcc-Kuala-Lumpur-Malaysia/Putrajaya-Sentral"},
  genting:{name:"Kuala Lumpur → Genting Highlands",km:55,origin:"Kuala Lumpur",destination:"Genting Highlands",from:[101.6930,3.1412],to:[101.7943,3.4227],road:"hilly",speed:60,source:"https://malaysiaroutes.com/en/routes/kuala-lumpur-to-genting-highlands/"},
  melaka:{name:"Kuala Lumpur → Melaka",km:138.8,origin:"Kuala Lumpur",destination:"Melaka",from:[101.6930,3.1412],to:[102.2501,2.1959],road:"highway",speed:90,source:"https://www.rome2rio.com/s/Kuala-Lumpur/Malacca-Malaysia-State"},
  ipoh:{name:"Kuala Lumpur → Ipoh",km:198.4,origin:"Kuala Lumpur",destination:"Ipoh",from:[101.6930,3.1412],to:[101.0901,4.5975],road:"highway",speed:95,source:"https://www.rome2rio.com/s/Malaysia/Ipoh"},
  penang:{name:"Kuala Lumpur → George Town",km:353.3,origin:"Kuala Lumpur",destination:"George Town, Pulau Pinang",from:[101.6930,3.1412],to:[100.3328,5.4164],road:"highway",speed:95,source:"https://www.rome2rio.com/s/Kuala-Lumpur/George-Town"}
});
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const asNum=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
export function estimate(options={}){
  const variant=options.variant==="prime"?"prime":"premium";
  const car=VEHICLES[variant];
  const km=clamp(asNum(options.distance,31.7),1,1000);
  const startSoc=clamp(asNum(options.soc,80),5,100);
  const speed=clamp(asNum(options.speed,80),25,130);
  const people=clamp(Math.round(asNum(options.people,2)),1,5);
  const cargoKg=clamp(asNum(options.cargo,15),0,200);
  const mode=["eco","normal","sport"].includes(options.mode)?options.mode:"normal";
  const road=["mixed","highway","hilly","city"].includes(options.road)?options.road:"mixed";
  const rain=options.rain===true;
  const ac=options.ac!==false;
  const tariff=clamp(asNum(options.tariff,.50),0,5);
  const reserveSoc=10;
  const baseline=car.battery/car.wltp*100;
  // Transparent, indicative model. Speeds are user-selected AVERAGE speed.
  const extraSpeed=Math.max(0,speed-75),lowerSpeed=Math.max(0,75-speed);
  const speedFactor=1+.0027*extraSpeed+.000082*extraSpeed*extraSpeed+.00055*lowerSpeed;
  const terrainFactor={city:1.11,mixed:1.04,highway:1,hilly:1.16}[road];
  const loadFactor=1+(people-1)*.016+cargoKg*.00025;
  const rainFactor=rain?1.07:1;
  const acFactor=ac?1.07:1;
  const modeFactor={eco:.94,normal:1,sport:1.08}[mode];
  const factor=speedFactor*terrainFactor*loadFactor*rainFactor*acFactor*modeFactor;
  const kwh100=baseline*factor;
  const needed=km*kwh100/100;
  const startingEnergy=car.battery*startSoc/100;
  const rawArrivalSoc=(startingEnergy-needed)/car.battery*100;
  const arrivalSoc=clamp(rawArrivalSoc,0,100);
  const reserveEnergy=car.battery*reserveSoc/100;
  const travelHours=km/speed;
  const reachWithReserve=rawArrivalSoc>=reserveSoc;
  const reachAtAll=rawArrivalSoc>=0;
  const extraEnergyToReserve=Math.max(0,needed+reserveEnergy-startingEnergy);
  const rangeWithReserve=Math.max(0,(startingEnergy-reserveEnergy)/kwh100*100);
  const rangeWithoutReserve=Math.max(0,startingEnergy/kwh100*100);
  const arrivalLow=clamp((startingEnergy-needed*1.20)/car.battery*100,0,100);
  const arrivalHigh=clamp((startingEnergy-needed*.90)/car.battery*100,0,100);
  const rangeAtArrival=Math.max(0,(startingEnergy-needed-reserveEnergy)/kwh100*100);
  return {
    variant,car,km,speed,startSoc,people,cargoKg,mode,road,rain,ac,tariff,reserveSoc,
    baseline,kwh100,needed,startingEnergy,arrivalSoc,rawArrivalSoc,
    arrivalLow,arrivalHigh,rangeWithReserve,rangeWithoutReserve,rangeAtArrival,
    travelMinutes:travelHours*60,estimatedCost:needed*tariff,
    reachWithReserve,reachAtAll,extraEnergyToReserve,factor
  };
}
