/*
 * e.MAS 5 · Interactive exterior + seated cabin POV.
 * Animate only real separable GLB nodes; no fake replacement geometry.
 * Fix: door hinges at their FRONT OUTBOARD edge, choose opening direction
 * from actual mesh position instead of assuming name/heading handedness.
 */
export function createExplorer({THREE,root,camera,controls,stage,requestRender,onInterior}) {
  const $=id=>document.getElementById(id);
  const ids={door_fl:"x-door-fl",door_fr:"x-door-fr",door_rl:"x-door-rl",door_rr:"x-door-rr",hood:"x-hood",trunk:"x-trunk"};
  const labels={door_fl:"Pintu depan kiri",door_fr:"Pintu depan kanan",door_rl:"Pintu belakang kiri",door_rr:"Pintu belakang kanan",hood:"Bonet depan",trunk:"Bonet belakang"};
  const patterns={
    door_fl:/(?:^|[_\s.-])door[_\s.-]*fl(?:[_\s.-]|$)/i,
    door_fr:/(?:^|[_\s.-])door[_\s.-]*fr(?:[_\s.-]|$)/i,
    door_rl:/(?:^|[_\s.-])door[_\s.-]*rl(?:[_\s.-]|$)/i,
    door_rr:/(?:^|[_\s.-])door[_\s.-]*rr(?:[_\s.-]|$)/i,
    hood:/(?:^|[_\s.-])(?:hood|bonnet)(?:[_\s.-]|$)/i,
    trunk:/(?:^|[_\s.-])(?:trunk|tailgate|boot)(?:[_\s.-]|$)/i
  };
  const buttons={exterior:$("view-exterior"),driver:$("view-driver"),passenger:$("view-passenger"),rear_left:$("view-rear-left"),rear:$("view-rear"),rear_right:$("view-rear-right")};
  const note=$("feature-note"),listeners=[],rigs=new Map();
  const up=new THREE.Vector3(0,1,0),bounds=new THREE.Box3().setFromObject(root);
  const bodySize=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const length=Math.max(bodySize.x,bodySize.z,1),height=Math.max(bodySize.y,.01);
  const baseFov=camera.fov,baseNear=camera.near,orbitPos=camera.position.clone(),orbitTarget=controls.target.clone();
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  let front=new THREE.Vector3(0,0,0),right=null,view="exterior",tween=null;
  let yaw=0,pitch=0,eyeAnchor=null,drag=null,tap=null,lastFrame=0,destroyed=false;
  const panels=["door_fl","door_fr","door_rl","door_rr","hood","trunk"];
  const clamp=THREE.MathUtils.clamp;
  function listen(el,event,fn,options){if(!el)return;el.addEventListener(event,fn,options);listeners.push(()=>el.removeEventListener(event,fn,options));}
  function message(msg,warn=false){if(note){note.textContent=msg;note.dataset.kind=warn?"warn":"";}}
  function findNodes(pattern){
    const list=[];
    root.traverse(o=>{
      if(o===root||!pattern.test(o.name||"")||!(o.isMesh||o.isGroup))return;
      let p=o.parent;
      while(p&&p!==root){if(pattern.test(p.name||""))return;p=p.parent;}
      if(o.isMesh||o.getObjectByProperty("isMesh",true))list.push(o);
    });
    return list;
  }
  function extent(nodes){
    const b=new THREE.Box3();
    for(const o of nodes)b.expandByObject(o);
    return b;
  }
  function projectedHalf(b,dir){
    const s=b.getSize(new THREE.Vector3());
    return (Math.abs(dir.x)*s.x+Math.abs(dir.z)*s.z)*.5;
  }
  function heading(){
    const hood=findNodes(patterns.hood),trunk=findNodes(patterns.trunk);
    if(!hood.length||!trunk.length)return;
    const direction=extent(hood).getCenter(new THREE.Vector3()).sub(extent(trunk).getCenter(new THREE.Vector3()));
    direction.y=0;
    if(direction.length()>length*.25){front.copy(direction.normalize());right=front.clone().cross(up).normalize();}
  }
  heading();
  function selectPart(key){
    const all=findNodes(patterns[key]);
    if(!all.length)return [];
    if(key.startsWith("door")){
      if(!all.some(o=>/(?:^|[_\s.-])(?:body|shell|carpaint)(?:[_\s.-]|$)/i.test(o.name||"")))return [];
    }
    if(key==="trunk"&&!all.some(o=>/(?:^|[_\s.-])(?:parts|panel|carpaint|tailgate)(?:[_\s.-]|$)/i.test(o.name||"")))return [];
    return all;
  }
  function localAxis(worldAxis){
    // Parent root may be rotated in imported GLB; convert world hinge axis to local.
    const worldQuaternion=new THREE.Quaternion();root.getWorldQuaternion(worldQuaternion);
    return worldAxis.clone().applyQuaternion(worldQuaternion.invert()).normalize();
  }
  function scoreHinge(point,hinge,axis,angle,desired){
    const v=point.clone().sub(hinge).applyAxisAngle(axis,angle).add(hinge);
    return v.sub(point).dot(desired);
  }
  function rigPart(key){
    if(!right)return;
    const nodes=selectPart(key);if(!nodes.length)return;
    root.updateWorldMatrix(true,true);
    const b=extent(nodes);if(b.isEmpty())return;
    const c=b.getCenter(new THREE.Vector3()),s=b.getSize(new THREE.Vector3());
    if(s.length()<length*.008)return;
    const h=c.clone(),longitudinal=projectedHalf(b,front);
    let axis=up.clone(),opening=1,angle=1.05;
    if(key.startsWith("door")){
      // All regular e.MAS 5 doors are front-hinged (including rear doors).
      // Detect the *actual exterior side* from mesh position, not FL/FR labels.
      const offset=c.clone().sub(center).dot(right);
      const side= Math.abs(offset)>bodySize.length()*.018 ? Math.sign(offset) : (key.endsWith("r")?1:-1);
      const outward=right.clone().multiplyScalar(side);
      const lateral=projectedHalf(b,right);
      // Physical hinge: forward edge + outward edge, rather than just leading-edge centre.
      h.addScaledVector(front,longitudinal*.985).addScaledVector(outward,lateral*.68);
      const trial=.22;
      const plus=scoreHinge(c,h,axis,trial,outward);
      const minus=scoreHinge(c,h,axis,-trial,outward);
      // If neither direction moves the panel outward, refuse an unsafe rig.
      if(Math.max(plus,minus)<Math.max(length*.006,.008))return;
      opening=plus>=minus?1:-1;
      angle=1.10;
    } else {
      // Hood pivots by the windscreen; tailgate pivots toward the roof.
      h.addScaledVector(front,key==="hood"?-longitudinal*.965:longitudinal*.965);
      h.y=b.max.y;
      axis=right.clone();
      const rise=new THREE.Vector3(0,1,0);
      opening=scoreHinge(c,h,axis,.20,rise)>=scoreHinge(c,h,axis,-.20,rise)?1:-1;
      angle=key==="hood"?.74:.88;
    }
    const pivot=new THREE.Group();pivot.name="InteractiveHinge_"+key;
    root.add(pivot);root.updateWorldMatrix(true,true);
    pivot.position.copy(root.worldToLocal(h.clone()));pivot.updateMatrixWorld(true);
    for(const part of nodes)pivot.attach(part);
    rigs.set(key,{pivot,axis:localAxis(axis),opening,angle,value:0,target:0});
  }
  if(right)for(const key of panels)rigPart(key);

  function seatAndCabin(){
    if(!right)return {};
    // Blender source names include Front seat above_R / below_R,
    // Rear seats_A / B, and Steering wheel_L.
    const wheel=findNodes(/steering[_\s.-]*wheel/i);
    const frontSeats=findNodes(/(?:^|[_\s.-])front[_\s.-]*seat(?:[_\s.-]|$)/i);
    const rearSeats=findNodes(/(?:^|[_\s.-])rear[_\s.-]*seat(?:[_\s.-]|$)/i);
    const meter=findNodes(/(?:^|[_\s.-])(?:instrument|cluster|meter|speedometer|gauge|driver[_\s.-]*display)(?:[_\s.-]|$)/i);
    const dash=findNodes(/(?:^|[_\s.-])(?:dashboard|cockpit|ip)(?:[_\s.-]|$)/i);
    const result={};
    const nodeCenter=o=>extent([o]).getCenter(new THREE.Vector3());
    const steeringCenter=wheel.length?extent(wheel).getCenter(new THREE.Vector3()):null;
    // The steering side provides the actual physical RIGHT side for a RHD vehicle.
    // This avoids relying on GLB scene axis naming to label passenger/rear seats.
    const wheelLateral=steeringCenter?steeringCenter.clone().sub(center).dot(right):0;
    const steeringSide=Math.abs(wheelLateral)>bodySize.length()*.04?Math.sign(wheelLateral):0;
    const carRight=right.clone().multiplyScalar(steeringSide||1);
    const cabinHalfWidth=projectedHalf(bounds,right);
    const roofLimit=bounds.max.y-height*.115;
    const forwardBearing=Math.atan2(front.x,front.z);
    const makeForwardView=(eyes,bearing=forwardBearing,pitch=-.09,source="seat")=>{
      const direction=new THREE.Vector3(Math.sin(bearing)*Math.cos(pitch),Math.sin(pitch),Math.cos(bearing)*Math.cos(pitch));
      return {position:eyes,target:eyes.clone().addScaledVector(direction,3),bearing,initialPitch:pitch,source};
    };
    let cushions=frontSeats.filter(o=>/(?:^|[_\s.-])(?:below|bottom|cushion|base)(?:[_\s.-]|$)/i.test(o.name||""));
    if(!cushions.length)cushions=frontSeats;
    let driverSeats=cushions.slice();
    if(cushions.length>1&&steeringCenter){
      const score=o=>{
        const c=nodeCenter(o);
        return Math.abs(c.clone().sub(steeringCenter).dot(right))*2+
          Math.abs(c.clone().sub(steeringCenter).dot(front))*.18;
      };
      const selected=cushions.reduce((best,o)=>score(o)<score(best)?o:best,cushions[0]);
      const seatLat=nodeCenter(selected).clone().sub(center).dot(right);
      driverSeats=cushions.filter(o=>Math.abs(nodeCenter(o).clone().sub(center).dot(right)-seatLat)<cabinHalfWidth*.14);
      if(!driverSeats.length)driverSeats=[selected];
    }
    if(driverSeats.length||steeringCenter){
      let eyes;
      if(driverSeats.length){
        const seat=extent(driverSeats),seatMid=seat.getCenter(new THREE.Vector3());
        const headrests=frontSeats.filter(o=>/(?:^|[_\s.-])(?:above|backrest|headrest)(?:[_\s.-]|$)/i.test(o.name||""));
        const nearby=headrests.filter(o=>Math.abs(nodeCenter(o).clone().sub(seatMid).dot(right))<cabinHalfWidth*.16);
        eyes=seatMid.clone().addScaledVector(front,length*.027);
        let eyeY=seat.max.y+height*.30;
        if(nearby.length)eyeY=Math.min(eyeY,extent(nearby).max.y-height*.07);
        eyes.y=clamp(eyeY,seat.max.y+height*.12,roofLimit);
        if(steeringCenter&&Math.abs(steeringCenter.clone().sub(eyes).dot(right))<height*.45){
          eyes.addScaledVector(right,clamp(steeringCenter.clone().sub(eyes).dot(right),-height*.075,height*.075));
        }
      } else {
        eyes=steeringCenter.clone().addScaledVector(front,-Math.min(length*.14,height*.49));
        eyes.y=clamp(steeringCenter.y+height*.13,bounds.min.y+height*.38,roofLimit);
      }
      let bearing=forwardBearing,pitch=-.17;
      const focus=meter.length?extent(meter).getCenter(new THREE.Vector3()):
        dash.length?extent(dash).getCenter(new THREE.Vector3()):null;
      if(focus){
        const delta=focus.clone().sub(eyes);
        const focusBearing=Math.atan2(delta.x,delta.z);
        const relative=Math.atan2(Math.sin(focusBearing-bearing),Math.cos(focusBearing-bearing));
        bearing+=clamp(relative,-.12,.12);
        pitch=clamp(Math.atan2(delta.y,Math.max(.7,Math.hypot(delta.x,delta.z))),-.30,-.09);
      }
      result.driver=makeForwardView(eyes,bearing,pitch,driverSeats.length?"front seat":"steering fallback");
      // Front passenger on the opposite side of the wheel. Use its cushion if
      // separately modelled; otherwise mirror the real driver's eye position
      // across the centreline (camera only, never clone or fabricate a seat).
      if(steeringSide&&cabinHalfWidth>height*.20){
        const driverLat=eyes.clone().sub(center).dot(right);
        const seatOffset=clamp(Math.abs(driverLat)>cabinHalfWidth*.18?Math.abs(driverLat):Math.abs(wheelLateral),
          cabinHalfWidth*.27,cabinHalfWidth*.68);
        const passengerLat=-steeringSide*seatOffset;
        const passengerEye=eyes.clone().addScaledVector(right,passengerLat-driverLat);
        const candidate=cushions.filter(o=>{
          const lat=nodeCenter(o).clone().sub(center).dot(right);
          return lat*steeringSide<-cabinHalfWidth*.22;
        });
        if(candidate.length){
          const closest=candidate.reduce((best,o)=>{
            const goal=Math.abs(nodeCenter(o).clone().sub(center).dot(right)-passengerLat);
            const old=Math.abs(nodeCenter(best).clone().sub(center).dot(right)-passengerLat);
            return goal<old?o:best;
          },candidate[0]);
          const pSeat=extent([closest]),pCenter=pSeat.getCenter(new THREE.Vector3());
          passengerEye.addScaledVector(right,pCenter.clone().sub(passengerEye).dot(right));
          passengerEye.addScaledVector(front,pCenter.clone().sub(passengerEye).dot(front)*.55);
          passengerEye.y=clamp(pSeat.max.y+height*.24,bounds.min.y+height*.42,roofLimit);
        }
        // Initial view also includes the centre display/dashboard, not just the window.
        const inward=carRight.clone().multiplyScalar(.22*length);
        const passengerTarget=passengerEye.clone().addScaledVector(front,3).add(inward);
        passengerTarget.y=passengerEye.y-.28;
        const v=passengerTarget.clone().sub(passengerEye).normalize();
        const passengerBearing=Math.atan2(v.x,v.z),passengerPitch=Math.asin(clamp(v.y,-1,1));
        result.passenger=makeForwardView(passengerEye,passengerBearing,passengerPitch,
          candidate.length?"passenger seat":"mirrored driver seat");
      }
    }
    if(rearSeats.length){
      const rear=extent(rearSeats),rearMid=rear.getCenter(new THREE.Vector3());
      // Rear seats_A/B are upholstery pieces, not guaranteed left/right seats.
      // Use their combined actual bench bounds and place eye points across it.
      const rearLateral=rearMid.clone().sub(center).dot(right);
      const rearCenter=rearMid.clone().addScaledVector(right,-rearLateral);
      rearCenter.addScaledVector(front,length*.017);
      const frontEyeY=result.driver?.position.y;
      const computedY=Number.isFinite(frontEyeY)?frontEyeY-height*.055:rear.min.y+height*.59;
      rearCenter.y=clamp(computedY,rear.min.y+height*.23,roofLimit);
      result.rear=makeForwardView(rearCenter.clone(),forwardBearing,-.08,"rear bench centre");
      const benchHalfWidth=projectedHalf(rear,right);
      // Two side seats need an actual wide rear-bench mesh; don't put the
      // camera into a door when only a narrow armrest is present.
      if(steeringSide&&benchHalfWidth>cabinHalfWidth*.36){
        const spread=Math.min(benchHalfWidth*.55,cabinHalfWidth*.57);
        const leftEye=rearCenter.clone().addScaledVector(carRight,-spread);
        const rightEye=rearCenter.clone().addScaledVector(carRight,spread);
        result.rear_left=makeForwardView(leftEye,forwardBearing,-.07,"rear left seat");
        result.rear_right=makeForwardView(rightEye,forwardBearing,-.07,"rear right seat");
      }
    }
    return result;
  }
  const seats=seatAndCabin();
  function updateUI(){
    for(const [key,id] of Object.entries(ids)){
      const el=$(id),rig=rigs.get(key);if(!el)continue;
      el.disabled=!rig;el.classList.toggle("active",!!rig?.target);
      el.setAttribute("aria-pressed",String(!!rig?.target));
      el.title=rig?(rig.target?"Tutup ":"Buka ")+labels[key]:"Komponen berasingan / engsel tidak disahkan";
      const text=el.querySelector(".x-action");if(text)text.textContent=rig?.target?"Tutup":"Buka";
    }
    $("x-close-all").disabled=!rigs.size;
    for(const [name,el] of Object.entries(buttons)){
      if(!el)continue;
      el.disabled=name!=="exterior"&&!seats[name];
      el.classList.toggle("active",view===name);
      el.setAttribute("aria-pressed",String(view===name));
      if(el.disabled)el.title="Aset kedudukan tempat duduk/stereng belum tersedia";
    }
    $("x-count").textContent=rigs.size+" / 6 bahagian interaktif tersedia";
  }
  function toggle(key){
    const rig=rigs.get(key);if(!rig)return;
    rig.target=rig.target?0:1;
    updateUI();message(labels[key]+(rig.target?" dibuka ke luar.":" ditutup."));requestRender();
  }
  function closeAll(){for(const rig of rigs.values())rig.target=0;updateUI();requestRender();}

  function lookTarget(){
    const direction=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    return camera.position.clone().addScaledVector(direction,3);
  }
  function lookAround(){
    if(!eyeAnchor)return;
    camera.position.copy(eyeAnchor);camera.lookAt(lookTarget());requestRender();
  }
  function setView(next){
    if(next!=="exterior"&&!seats[next]){
      message("Belum ada kedudukan kerusi/stereng yang boleh digunakan untuk POV ini.",true);return;
    }
    if(view===next&&!tween)return;
    if(view==="exterior"&&next!=="exterior"){
      orbitPos.copy(camera.position);orbitTarget.copy(controls.target);
    }
    if(next!=="exterior"){
      onInterior();
      $("turntable").disabled=true;
    } else $("turntable").disabled=false;
    const fromTarget=camera.position.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()),3);
    const dest=next==="exterior"?orbitPos.clone():seats[next].position.clone();
    const target=next==="exterior"?orbitTarget.clone():seats[next].target.clone();
    controls.enabled=false;
    const stamp=performance.now();
    tween={fromPos:camera.position.clone(),toPos:dest,fromTarget,toTarget:target,
      fromFov:camera.fov,toFov:next==="exterior"?baseFov:72,
      fromNear:camera.near,toNear:next==="exterior"?baseNear:Math.min(baseNear,.025),
      start:stamp,duration:820,next};
    view=next;drag=null;tap=null;eyeAnchor=null;updateUI();requestRender();
    const viewLabels={
      driver:"POV Pemandu",passenger:"POV Penumpang Depan",
      rear_left:"Belakang Kiri",rear:"Belakang Tengah",rear_right:"Belakang Kanan"
    };
    if(viewLabels[next])message(viewLabels[next]+": anda duduk di tempat duduk ini. Seret jari kiri/kanan/atas/bawah untuk menoleh.");
    else message("Kembali ke pandangan luar kereta 360°.");
  }
  function tick(now){
    if(destroyed)return false;
    const dt=lastFrame?Math.min(50,now-lastFrame):16;lastFrame=now;
    let active=false;
    for(const rig of rigs.values()){
      const diff=rig.target-rig.value;
      if(Math.abs(diff)<.0009){rig.value=rig.target;}
      else{rig.value+=diff*Math.min(1,dt*.014);active=true;}
      rig.pivot.quaternion.setFromAxisAngle(rig.axis,rig.opening*rig.angle*rig.value);
    }
    if(tween){
      const progress=Math.min(1,Math.max(0,(now-tween.start)/tween.duration));
      const ease=progress*progress*(3-2*progress);
      camera.position.copy(tween.fromPos).lerp(tween.toPos,ease);
      camera.lookAt(tween.fromTarget.clone().lerp(tween.toTarget,ease));
      camera.fov=tween.fromFov+(tween.toFov-tween.fromFov)*ease;
      camera.near=tween.fromNear+(tween.toNear-tween.fromNear)*ease;camera.updateProjectionMatrix();
      if(progress>=1){
        const destView=tween.next;
        if(destView==="exterior"){
          controls.target.copy(orbitTarget);controls.enabled=true;controls.update();
          eyeAnchor=null;
        }else{
          eyeAnchor=seats[destView].position.clone();
          camera.position.copy(eyeAnchor);
          const dir=seats[destView].target.clone().sub(eyeAnchor).normalize();
          yaw=Math.atan2(dir.x,dir.z);pitch=Math.asin(clamp(dir.y,-1,1));
          camera.lookAt(lookTarget());
        }
        tween=null;
      }else active=true;
    }
    return active;
  }
  // Touch/drag inside cabin = head movement, not exterior OrbitControls.
  listen(stage,"pointerdown",e=>{
    if(destroyed||tween)return;
    if(view==="exterior"){tap={id:e.pointerId,x:e.clientX,y:e.clientY};return;}
    drag={id:e.pointerId,x:e.clientX,y:e.clientY};
    stage.setPointerCapture?.(e.pointerId);
  });
  listen(stage,"pointermove",e=>{
    if(!drag||drag.id!==e.pointerId||view==="exterior"||tween)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    drag.x=e.clientX;drag.y=e.clientY;
    yaw-=dx*.0044;pitch=clamp(pitch-dy*.0044,-1.22,1.20);
    lookAround();
  });
  listen(stage,"pointerup",e=>{
    if(drag?.id===e.pointerId)drag=null;
    if(!tap||tap.id!==e.pointerId||view!=="exterior"||tween){tap=null;return;}
    const down=tap;tap=null;
    if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7||!rigs.size)return;
    const rect=stage.getBoundingClientRect();
    pointer.set((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height*2-1));
    raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObject(root,true);
    const first=hits[0];if(!first)return;
    for(const [key,rig] of rigs){
      let obj=first.object;
      while(obj&&obj!==root){
        if(obj===rig.pivot){toggle(key);return;}
        obj=obj.parent;
      }
    }
  });
  listen(stage,"pointercancel",()=>{drag=null;tap=null;});
  listen(stage,"wheel",e=>{
    if(view==="exterior"||tween||destroyed)return;
    e.preventDefault();camera.fov=clamp(camera.fov+Math.sign(e.deltaY)*2,56,86);
    camera.updateProjectionMatrix();requestRender();
  },{passive:false});
  for(const [key,id] of Object.entries(ids))listen($(id),"click",()=>toggle(key));
  listen($("x-close-all"),"click",closeAll);
  for(const [name,el] of Object.entries(buttons))listen(el,"click",()=>setView(name));
  updateUI();
  if(!right)message("GLB ini tidak mempunyai bonet depan/belakang yang boleh menentukan arah kereta. Engsel dinyahaktifkan.",true);
  else if(!rigs.size)message("Komponen pintu tidak dapat dipisahkan dengan selamat daripada model GLB semasa.",true);
  else message("Pintu membuka keluar. Pilih Pemandu, Penumpang Depan atau tempat duduk Belakang untuk POV boleh menoleh 360°.");
  return {
    tick,setView,
    get mode(){return view},
    get transitioning(){return !!tween},
    destroy(){
      destroyed=true;for(const remove of listeners)remove();
      for(const rig of rigs.values()){rig.pivot.quaternion.identity();rig.pivot.updateMatrixWorld(true);}
      rigs.clear();controls.enabled=true;camera.fov=baseFov;camera.near=baseNear;camera.updateProjectionMatrix();
      for(const id of Object.values(ids))$(id).disabled=true;
      $("x-close-all").disabled=true;for(const name of ["view-driver","view-passenger","view-rear-left","view-rear","view-rear-right"])$(name).disabled=true;
      $("turntable").disabled=false;
    }
  };
}
