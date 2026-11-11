/**
 * Phase 04 customer controls.
 * Owns optional 3D lifecycle and screen widgets; main simulation owns
 * time and battery. No two competing playback clocks.
 */
import {createDrive3D} from "./drive-phase4-3d.js";
const $=id=>document.getElementById(id);
const fmt=(n,d=1)=>Number(n).toLocaleString("ms-MY",{minimumFractionDigits:d,maximumFractionDigits:d});
const validModes=new Set(["chase","front","side","top"]);
export function createPhase4Controls({onSeek,onRate,getSnapshot}){
  const screen=$("drive-screen"),layer=$("drive-3d-layer"),status=$("drive-3d-status");
  const mode2d=$("drive-view-2d"),mode3d=$("drive-view-3d"),cameras=$("drive-camera-tabs");
  const seek=$("drive-seek"),seekLabel=$("drive-seek-value");
  const statusText=(message,state="")=>{status.textContent=message;status.dataset.state=state};
  const drive=createDrive3D({container:layer,onStatus:statusText});
  let view3d=false,loading=false,currentCamera="chase",rate=1;
  let latestResult=null,latestProgress=0,latestPlaying=false,latestReading=null;
  function syncModeButtons(){
    mode2d.classList.toggle("active",!view3d);
    mode3d.classList.toggle("active",view3d);
    mode2d.setAttribute("aria-pressed",String(!view3d));
    mode3d.setAttribute("aria-pressed",String(view3d));
    cameras.hidden=!view3d;
    screen.classList.toggle("mode-3d",view3d);
    layer.hidden=!view3d;
    mode3d.disabled=loading;
  }
  function backTo2D(){
    loading=false;view3d=false;drive.disable();syncModeButtons();
  }
  mode2d.addEventListener("click",backTo2D);
  mode3d.addEventListener("click",async()=>{
    if(view3d||loading)return;
    loading=true;
    layer.hidden=false;mode3d.disabled=true;
    statusText("Memuatkan model kereta e.MAS 5…","loading");
    const ready=await drive.enable();
    loading=false;
    if(ready){
      view3d=true;drive.setCamera(currentCamera);
      const current=getSnapshot?.();
      if(current?.result)render(current.result,current.progress,current.playing,current.reading);
    }else{drive.disable();statusText("3D tidak tersedia. 2D automatik dikekalkan; pengiraan tidak terjejas.","error");}
    syncModeButtons();
  });
  for(const btn of document.querySelectorAll("[data-camera]")){
    btn.addEventListener("click",()=>{
      const mode=btn.dataset.camera;
      if(!validModes.has(mode))return;
      currentCamera=mode;drive.setCamera(mode);
      for(const x of document.querySelectorAll("[data-camera]")){
        const selected=x===btn;
        x.classList.toggle("active",selected);
        x.setAttribute("aria-pressed",String(selected));
      }
    });
  }
  for(const btn of document.querySelectorAll("[data-rate]")){
    btn.addEventListener("click",()=>{
      const next=Number(btn.dataset.rate);
      if(![.5,1,2].includes(next))return;
      rate=next;
      for(const item of document.querySelectorAll("[data-rate]")){
        const active=item===btn;item.classList.toggle("active",active);
        item.setAttribute("aria-pressed",String(active));
      }
      onRate(next);
    });
  }
  seek.addEventListener("input",()=>{
    const f=Math.max(0,Math.min(1,Number(seek.value)/1000));
    onSeek(f);
  });
  function render(result,progress,playing,reading){
    latestResult=result;latestProgress=progress;latestPlaying=playing;latestReading=reading;
    if(!result||!reading){
      seek.disabled=true;seek.value="0";
      seek.style.setProperty("--seek-fill","0%");
      seekLabel.textContent="—";
      $("drive-seek-limit").textContent="Had tenaga · belum dikira";
      if(drive.enabled)drive.update({playing:false,speed:0});
      return;
    }
    seek.disabled=false;
    seek.value=String(Math.round(Math.max(0,Math.min(1,progress))*1000));
    seek.style.setProperty("--seek-fill",(progress*100)+"%");
    seekLabel.textContent=fmt(progress*100,0)+"% · "+fmt(reading.km,1)+" km";
    const stop=result.stopAtKm;
    $("drive-seek-limit").textContent=stop<result.km-.01?
      "⚠ Berhenti pada km "+fmt(stop,1)+" (bateri habis)" :
      "Simulasi hingga km "+fmt(result.km,1);
    $("drive-seek-end").textContent=fmt(result.km,1)+" km";
    if(view3d&&drive.enabled){
      const config=reading.stage?.settings||{};
      drive.update({
        km:reading.km,
        speed:playing&&reading.canStillDrive?(reading.stage?.speed||result.speed):0,
        playing:playing&&reading.canStillDrive,
        condition:{...config,road:config.road||result.road,rain:config.rain||false},
        night:config.night||result.night||false
      });
    }
  }
  function dispose(){backTo2D();}
  syncModeButtons();
  return {render,dispose,get enabled3d(){return view3d},get rate(){return rate},get camera(){return currentCamera}};
}
