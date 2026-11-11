/**
 * Smart EV visual controls. All scenarios are simulated ("what if")
 * and never claim real road, live weather, vehicle BMS, charger status.
 */
import {SCENARIOS,sampleJourney} from "./drive-smart-scenarios.js";
const $=id=>document.getElementById(id);
const fmt=(n,d=1)=>Number(n).toLocaleString("ms-MY",{minimumFractionDigits:d,maximumFractionDigits:d});
const GROUPS={
  harian:["manual","city","jam","highway","family","balik","eco"],
  jalan:["rain","monsoon","uphill","downhill","kampung","hot","wind","night"],
  kereta:["battery","tyres","fast","aggressive"],
  ekstrem:["all","worst"]
};
const SPEC_FIELDS=["battery-health","temperature","wind","slope","tire","hvac","regen","night","aggressive"];
export function createSmartDashboard({onSelect,onAdvancedChange,onPlay,onReset}){
  let activeScenario="manual",group="harian",latest=null,lastProgress=0;
  const tabs=[...document.querySelectorAll(".scenario-tab")];
  const scenarioById=new Map(SCENARIOS.map(s=>[s.id,s]));
  const updateSelection=()=>{
    $("scenario-all").setAttribute("aria-pressed",String(activeScenario==="all"));
    for(const chip of document.querySelectorAll(".scenario-card")){
      const selected=chip.dataset.scenario===activeScenario;
      chip.classList.toggle("active",selected);
      chip.setAttribute("aria-pressed",String(selected));
    }
  };
  function renderPicker(){
    const parent=$("scenario-grid");parent.replaceChildren();
    for(const id of GROUPS[group]){
      const scenario=scenarioById.get(id);
      if(!scenario)continue;
      const btn=document.createElement("button");
      btn.type="button";btn.className="scenario-card";btn.dataset.scenario=id;
      const ico=document.createElement("span");ico.className="emoji";ico.textContent=scenario.icon;
      const body=document.createElement("div");
      const name=document.createElement("strong");name.textContent=scenario.title;
      const small=document.createElement("small");small.textContent=scenario.tag;
      const detail=document.createElement("p");detail.textContent=scenario.detail;
      body.append(name,small,detail);btn.append(ico,body);
      btn.addEventListener("click",()=>selectScenario(id));
      parent.append(btn);
    }
    updateSelection();
  }
  function selectScenario(id){
    if(!scenarioById.has(id))return;
    activeScenario=id;
    const s=scenarioById.get(id);
    if(id==="all")group="ekstrem";
    for(const tab of tabs){
      const selected=tab.dataset.group===group;
      tab.classList.toggle("active",selected);
      tab.setAttribute("aria-pressed",String(selected));
    }
    renderPicker();
    onSelect(id,s.inputs||{});
  }
  for(const tab of tabs){
    tab.setAttribute("aria-pressed",String(tab.dataset.group===group));
    tab.addEventListener("click",()=>{
      group=tab.dataset.group;for(const x of tabs){const active=x===tab;x.classList.toggle("active",active);x.setAttribute("aria-pressed",String(active));}
      renderPicker();
    });
  }
  $("scenario-all").addEventListener("click",()=>selectScenario("all"));
  for(const id of SPEC_FIELDS){
    const el=$(id);
    if(el)el.addEventListener("input",()=>onAdvancedChange());
  }
  $("drive-play-now").addEventListener("click",onPlay);
  $("drive-reset-now").addEventListener("click",onReset);
  $("smart-scenario-count")?.replaceChildren?.(document.createTextNode(String(SCENARIOS.length)));
  function drawGraph(result){
    const canvas=$("smart-energy-graph");
    if(!canvas?.getContext||!result)return;
    const displayW=Math.max(300,Math.round(canvas.clientWidth||680)),displayH=195;
    const pixelRatio=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(displayW*pixelRatio);
    canvas.height=Math.round(displayH*pixelRatio);
    const ctx=canvas.getContext("2d");
    if(!ctx)return;
    ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
    const w=displayW,h=displayH,l=38,r=16,t=15,b=26;
    ctx.clearRect(0,0,w,h);
    ctx.lineWidth=1;ctx.font="10px system-ui,sans-serif";
    for(const soc of [0,10,25,50,75,100]){
      const y=t+(100-soc)/100*(h-b-t);
      ctx.strokeStyle=soc===10?"#eabd7478":"#5783a12e";
      ctx.setLineDash(soc===10?[5,5]:[]);
      ctx.beginPath();ctx.moveTo(l,y);ctx.lineTo(w-r,y);ctx.stroke();
      ctx.fillStyle=soc===10?"#f7ca87":"#83aec7";
      ctx.fillText(soc+"%",6,y+3);
    }
    ctx.setLineDash([]);
    ctx.fillStyle="#8fbbd2";ctx.textAlign="right";
    ctx.fillText(fmt(result.km,0)+" km",w-r,h-7);ctx.textAlign="left";ctx.fillText("0 km",l,h-7);
    if(result.composite){
      for(const seg of result.segments.slice(0,-1)){
        const x=l+seg.endKm/result.km*(w-r-l);
        ctx.strokeStyle="#7dbbb848";
        ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(x,t);ctx.lineTo(x,h-b);ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    const n=100,plotW=w-r-l,plotH=h-b-t;
    const samples=Array.from({length:n+1},(_,i)=>sampleJourney(result,i/n));
    const path=()=>{ctx.beginPath();samples.forEach((v,i)=>{
      const x=l+(i/n)*plotW,y=t+(100-v.soc)/100*plotH;
      i?ctx.lineTo(x,y):ctx.moveTo(x,y);
    })};
    const gradient=ctx.createLinearGradient(0,t,0,h-b);
    gradient.addColorStop(0,"rgba(111,236,199,.25)");
    gradient.addColorStop(1,"rgba(96,176,226,.015)");
    ctx.beginPath();ctx.moveTo(l,h-b);
    samples.forEach((v,i)=>ctx.lineTo(l+(i/n)*plotW,t+(100-v.soc)/100*plotH));
    ctx.lineTo(w-r,h-b);ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
    path();ctx.strokeStyle="#86eec4";ctx.lineWidth=3;ctx.stroke();
    const stop=result.stopAtKm/result.km;
    if(stop<1-1e-6){
      const x=l+stop*plotW;
      ctx.beginPath();ctx.arc(x,h-b,5,0,Math.PI*2);ctx.fillStyle="#ff8799";ctx.fill();
      ctx.fillStyle="#ffc7d0";ctx.fillText("TIDAK SAMPAI",Math.min(x+8,w-114),h-b-8);
    }
  }
  function renderStages(result){
    const stages=$("smart-stage-list");stages.replaceChildren();
    $("smart-stages-heading").textContent=result.composite?"PECAHAN 7 ZON SEMUA KEADAAN":"PROFIL TENAGA TERPILIH";
    $("smart-stages-description").textContent=result.composite?"Zon sintetik · ikut jarak":"Satu profil";
    const max=Math.max(.001,...result.segments.map(s=>s.kwh));
    for(const seg of result.segments){
      const row=document.createElement("div");row.className="smart-stage-row";
      const title=document.createElement("div");title.className="smart-stage-name";
      title.textContent=(seg.icon||"⚡")+" "+seg.name;
      const small=document.createElement("small");
      small.textContent=fmt(seg.km,1)+" km · "+fmt(seg.speed,0)+" km/j";
      title.append(small);
      const bar=document.createElement("div");bar.className="smart-stage-energy";
      const track=document.createElement("div");const fill=document.createElement("span");
      fill.style.width=Math.max(0,Math.min(100,seg.kwh/max*100))+"%";track.append(fill);bar.append(track);
      const energy=document.createElement("strong");energy.className="smart-stage-kwh";
      energy.textContent=fmt(seg.kwh,1)+" kWh";
      row.append(title,bar,energy);stages.append(row);
    }
  }
  function render(result){
    latest=result;
    $("battery-health-out").textContent=String(result?.batteryHealth||100)+"%";
    if(!result){
      for(const id of ["smart-arrival","smart-topup","smart-energy"]){$(id).textContent="—";}
      $("smart-risk-label").textContent="BELUM DIKIRA";
      $("smart-shortfall").hidden=true;
      $("smart-stage-list").replaceChildren();
      resetFrame();
      return;
    }
    const s=scenarioById.get(result.scenario)||scenarioById.get("manual");
    $("smart-active-title").textContent=(s?.icon||"⚡")+" "+result.scenarioName;
    $("smart-active-desc").textContent=result.composite?
      "Tujuh zon sintetik: setiap zon mempunyai corak tenaga dan masa yang berbeza.":
      (s?.detail||"Profil pilihan");
    $("smart-arrival").textContent=result.reachAtAll?fmt(result.arrivalSoc,1)+"%":"0%*";
    $("smart-soh").textContent=fmt(result.batteryHealth,0)+"%";
    $("smart-topup").textContent=fmt(result.extraEnergyToReserve,1)+" kWh";
    $("smart-energy").textContent=fmt(result.needed,1)+" kWh";
    const risk=result.reachWithReserve?"selamat":result.reachAtAll?"warn":"bad";
    $("smart-risk").dataset.risk=risk;
    $("smart-risk-label").textContent=risk==="selamat"?"RENDAH":risk==="warn"?"TINGGI":"PERLU CAS";
    $("smart-shortfall").hidden=result.reachAtAll;
    if(!result.reachAtAll){
      $("smart-shortfall-text").textContent="Bateri mungkin habis pada km "+fmt(result.stopAtKm,1)+
        " daripada "+fmt(result.km,1)+" km. Tambah sekurang-kurangnya "+
        fmt(result.extraEnergyToReserve,1)+" kWh untuk sampai dengan simpanan 10%.";
    }
    $("smart-graph-note").textContent=result.composite?"Semua Keadaan · 7 zon":"Simulasi · "+s.title;
    renderStages(result);
    drawGraph(result);
    updateSelection();
  }
  function frame(result,sample,playing=false,hasActualRoute=false){
    if(!result||!sample)return;
    lastProgress=sample.km/result.km;
    const theatre=$("drive-screen");
    const condition=sample.stage?.settings||{};
    theatre.dataset.condition=condition.rain?"rain":condition.surface==="uneven"?"rough":"normal";
    theatre.classList.toggle("is-moving",!!playing&&sample.canStillDrive);
    $("drive-current-zone").textContent=sample.stage?.name||result.scenarioName;
    $("drive-conditions").textContent=(condition.road||result.road||"mixed").toUpperCase()+
      " · "+(condition.traffic||result.traffic||"light").toUpperCase();
    $("drive-speed").textContent=playing&&sample.canStillDrive?fmt(sample.stage?.speed||result.speed,0):"0";
    $("drive-soc").textContent=fmt(sample.soc,1)+"%";
    $("drive-km").textContent=fmt(sample.km,1);
    $("drive-route-status").textContent=hasActualRoute?"ROAD GEOMETRY · OSRM":"VISUAL ONLY · NO ROAD DATA";
    $("drive-playback-status").textContent=playing?"Animasi sedang berjalan · "+fmt(sample.km,1)+" km":
      sample.canStillDrive?"Boleh mainkan perjalanan ini.":"Bateri kosong — rancang pengecasan.";
    $("drive-warning").hidden=sample.canStillDrive;
  }
  function resetFrame(){
    const t=$("drive-screen");t.classList.remove("is-moving");
    t.dataset.condition="normal";
    $("drive-speed").textContent="0";$("drive-km").textContent="0.0";
    $("drive-soc").textContent=latest?fmt(latest.startSoc,1)+"%":"—";
    $("drive-current-zone").textContent=latest?.scenarioName||"Tetapan Sendiri";
    $("drive-route-status").textContent="SIMULASI";
    $("drive-playback-status").textContent="Tekan mula untuk melihat animasi.";
    $("drive-warning").hidden=true;
  }
  window.addEventListener("resize",()=>{if(latest)drawGraph(latest)},{passive:true});
  renderPicker();
  return {selectScenario,render,frame,resetFrame,setActive:id=>{if(scenarioById.has(id)){activeScenario=id;updateSelection();}},get activeScenario(){return activeScenario;}};
}
