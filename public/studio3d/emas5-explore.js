/*
 * e.MAS 5 · Explore mode
 * Real GLB mesh-hinges only. Never synthesize missing geometry or interiors.
 * The source mesh hierarchy and part names remain the source of truth.
 */
export function createExplorer({THREE, root, camera, controls, stage, requestRender, onInterior}) {
  const $=id=>document.getElementById(id);
  const partButtons={
    door_fl:"x-door-fl",door_fr:"x-door-fr",door_rl:"x-door-rl",door_rr:"x-door-rr",
    hood:"x-hood",trunk:"x-trunk"
  };
  const partNames={
    door_fl:"Pintu depan kiri",door_fr:"Pintu depan kanan",door_rl:"Pintu belakang kiri",
    door_rr:"Pintu belakang kanan",hood:"Bonet depan",trunk:"Bonet belakang"
  };
  const partPatterns={
    door_fl:/(?:^|[_\s.-])door[_\s.-]*fl(?:[_\s.-]|$)/i,
    door_fr:/(?:^|[_\s.-])door[_\s.-]*fr(?:[_\s.-]|$)/i,
    door_rl:/(?:^|[_\s.-])door[_\s.-]*rl(?:[_\s.-]|$)/i,
    door_rr:/(?:^|[_\s.-])door[_\s.-]*rr(?:[_\s.-]|$)/i,
    hood:/(?:^|[_\s.-])hood(?:[_\s.-]|$)|(?:^|[_\s.-])bonnet(?:[_\s.-]|$)/i,
    trunk:/(?:^|[_\s.-])trunk(?:[_\s.-]|$)|(?:^|[_\s.-])tailgate(?:[_\s.-]|$)|(?:^|[_\s.-])boot(?:[_\s.-]|$)/i
  };
  const note=$("feature-note");
  const vbuttons={exterior:$("view-exterior"),driver:$("view-driver"),rear:$("view-rear")};
  const rigs=new Map(),listeners=[];
  const up=new THREE.Vector3(0,1,0);
  const box=new THREE.Box3().setFromObject(root);
  const bodyCenter=box.getCenter(new THREE.Vector3());
  const bodySize=box.getSize(new THREE.Vector3());
  const fullLength=Math.max(bodySize.x,bodySize.z,1);
  let destroyed=false,view="exterior",tween=null,drag=null,tapStart=null,yaw=0,pitch=0;
  const raycaster=new THREE.Raycaster();const screenPointer=new THREE.Vector2();
  let lastTime=0,animating=false;
  let front=new THREE.Vector3(0,0,1),right;
  const originalCamera=camera.position.clone();
  const originalTarget=controls.target.clone();
  const owned=[];

  function add(el,name,callback,options){
    if(!el)return;el.addEventListener(name,callback,options);
    listeners.push(()=>el.removeEventListener(name,callback,options));
  }
  function message(text,kind=""){
    if(!note)return;
    note.textContent=text;
    note.dataset.kind=kind;
  }
  function matchingNodes(pattern){
    const matches=[];
    root.traverse(o=>{
      if(o===root||!(o.isMesh||o.isGroup)||!pattern.test(o.name||""))return;
      let p=o.parent;
      while(p&&p!==root){if(pattern.test(p.name||""))return;p=p.parent;}
      if(o.isMesh||o.getObjectByProperty("isMesh",true))matches.push(o);
    });
    return matches;
  }
  function bound(nodes){
    const b=new THREE.Box3();
    for(const o of nodes)b.expandByObject(o);
    return b;
  }
  function projectedHalfExtent(b,dir){
    const s=b.getSize(new THREE.Vector3());
    return (Math.abs(dir.x)*s.x+Math.abs(dir.z)*s.z)/2;
  }
  function inferHeading(){
    const frontNodes=matchingNodes(partPatterns.hood),rearNodes=matchingNodes(partPatterns.trunk);
    if(frontNodes.length&&rearNodes.length){
      const h=bound(frontNodes).getCenter(new THREE.Vector3()),t=bound(rearNodes).getCenter(new THREE.Vector3());
      const dir=h.sub(t);dir.y=0;
      if(dir.length()>.2){front.copy(dir.normalize());return;}
    }
    // Without both hood and tailgate, direction cannot be established safely.
    front.set(0,0,0);
  }
  inferHeading();
  if(front.lengthSq()>0)right=front.clone().cross(up).normalize();

  function selectPartNodes(key){
    const nodes=matchingNodes(partPatterns[key]);
    if(!nodes.length)return [];
    // A door's named main shell must exist: handles/glass alone are not enough.
    if(key.startsWith("door")){
      const meaningful=nodes.some(o=>/(?:^|[_\s.-])(?:body|carpaint|shell)(?:[_\s.-]|$)/i.test(o.name||""));
      if(!meaningful)return [];
    }
    if(key==="trunk"&&!nodes.some(o=>/(?:^|[_\s.-])(?:parts|carpaint|panel|tailgate)(?:[_\s.-]|$)/i.test(o.name||"")))return [];
    return nodes;
  }
  function makeRig(key){
    if(!right)return;
    const nodes=selectPartNodes(key);
    if(!nodes.length)return;
    root.updateWorldMatrix(true,true);
    const b=bound(nodes);if(b.isEmpty())return;
    const c=b.getCenter(new THREE.Vector3()),partSize=b.getSize(new THREE.Vector3());
    const hinge=c.clone();
    let axis,sign=1,angle;
    const projected=projectedHalfExtent(b,front);
    if(key.startsWith("door")){
      hinge.addScaledVector(front,projected*.96);
      axis=up.clone();
      sign=key.endsWith("r")?1:-1;
      angle=1.12;
    } else if(key==="hood"){
      hinge.addScaledVector(front,-projected*.94);
      hinge.y=b.max.y;
      axis=right.clone();
      angle=.74;
    } else {
      hinge.addScaledVector(front,projected*.94);
      hinge.y=b.max.y;
      axis=right.clone();
      sign=-1;
      angle=.87;
    }
    if(partSize.length()<=0.01)return;
    const pivot=new THREE.Group();
    pivot.name="InteractiveHinge_"+key;
    root.add(pivot);
    // root has been positioned at car center; preserve world coordinates when attaching.
    pivot.position.copy(root.worldToLocal(hinge.clone()));
    pivot.updateMatrixWorld(true);
    for(const obj of nodes)pivot.attach(obj);
    const rig={key,pivot,axis,sign,angle,value:0,target:0,nodes};
    rigs.set(key,rig);
    owned.push(pivot);
  }
  if(right){
    for(const key of Object.keys(partButtons))makeRig(key);
  }

  function attachViews(){
    const wheel=matchingNodes(/steering[_\s.-]*wheel/i);
    const rearSeats=matchingNodes(/(?:^|[_\s.-])rear[_\s.-]*seat/i);
    const hood=matchingNodes(partPatterns.hood),tail=matchingNodes(partPatterns.trunk);
    const inside={};
    if(front.lengthSq()>0&&wheel.length){
      const steer=bound(wheel).getCenter(new THREE.Vector3());
      const pos=steer.clone().addScaledVector(front,-Math.max(.28,fullLength*.105)).add(new THREE.Vector3(0,.28,0));
      inside.driver={position:pos,target:pos.clone().addScaledVector(front,3).add(new THREE.Vector3(0,-.08,0))};
    }
    if(front.lengthSq()>0&&rearSeats.length){
      const rearSeatBox=bound(rearSeats),p=rearSeatBox.getCenter(new THREE.Vector3())
        .addScaledVector(front,-Math.max(.15,fullLength*.055));
      p.y=rearSeatBox.max.y+Math.max(.15,bodySize.y*.1);
      inside.rear={position:p,target:p.clone().addScaledVector(front,3)};
    }
    return inside;
  }
  const positions=attachViews();

  function updateUI(){
    for(const [key,id] of Object.entries(partButtons)){
      const btn=$(id);if(!btn)continue;
      const rig=rigs.get(key);
      btn.disabled=!rig;
      btn.title=rig?(rig.target?"Tutup ":"Buka ")+partNames[key]:
        "Model GLB tidak mempunyai bahagian berasingan yang selamat untuk digerakkan";
      btn.setAttribute("aria-pressed",String(!!rig?.target));
      btn.classList.toggle("active",!!rig?.target);
      btn.querySelector(".x-action").textContent=rig?.target?"Tutup":"Buka";
    }
    $("x-close-all").disabled=!rigs.size;
    for(const [key,button] of Object.entries(vbuttons)){
      button.disabled=key!=="exterior"&&!positions[key];
      button.classList.toggle("active",view===key);
      button.setAttribute("aria-pressed",String(view===key));
      if(button.disabled)button.title="Aset kabin / komponen model belum cukup untuk POV ini";
    }
    $("x-count").textContent=rigs.size+" / 6 bahagian interaktif tersedia";
    if(!right)message("Orientasi depan/belakang tidak dapat disahkan daripada model ini. Buka/tutup dinyahaktifkan untuk mengelakkan kerosakan bentuk.","warn");
    else if(!rigs.size)message("Model dimuatkan, tetapi komponen berengsel tidak dikenali sebagai mesh berasingan. Sediakan GLB dengan nama Door_FL/FR/RL/RR, hood dan Trunk.","warn");
    else message("Tap pada pintu/bonet dalam 3D atau gunakan butang Buka. Seret kereta untuk berpusing. Pilih POV Pemandu untuk melihat interior.");
  }

  function toggle(key){
    const rig=rigs.get(key);if(!rig)return;
    rig.target=rig.target?0:1;
    updateUI();message(partNames[key]+(rig.target?" sedang dibuka.":" sedang ditutup."));requestRender();
  }
  function closeAll(){
    for(const rig of rigs.values())rig.target=0;
    updateUI();requestRender();
  }
  function setView(next){
    if(next!=="exterior"&&!positions[next]){
      message("Kamera kabin tidak tersedia tanpa kedudukan stereng / tempat duduk yang dikenal pasti.","warn");
      return;
    }
    if(view===next&&!tween)return;
    if(next!=="exterior") {
      onInterior();
      $("turntable").disabled=true;
    } else {
      $("turntable").disabled=false;
    }
    const fromTarget=camera.position.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()),3);
    const target=next==="exterior"?originalTarget.clone():positions[next].target.clone();
    const destination=next==="exterior"?originalCamera.clone():positions[next].position.clone();
    controls.enabled=false;
    tween={fromPos:camera.position.clone(),toPos:destination,fromLook:fromTarget,toLook:target,start:performance.now(),duration:740,next};
    view=next;drag=null;updateUI();requestRender();
    message(next==="driver"?"Pandangan dari kerusi pemandu (berdasarkan kedudukan stereng dalam GLB).":
      next==="rear"?"Pandangan dari barisan tempat duduk belakang.":"Kembali ke pandangan luar 360°.");
  }
  function getLookTarget(){
    const d=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    return camera.position.clone().addScaledVector(d,3);
  }
  function updateLook(){
    camera.lookAt(getLookTarget());
    requestRender();
  }
  function tick(now){
    if(destroyed)return false;
    const dt=lastTime?Math.min(45,now-lastTime):16;lastTime=now;
    let moving=false;
    for(const rig of rigs.values()){
      const diff=rig.target-rig.value;
      if(Math.abs(diff)<.0007){rig.value=rig.target;}
      else{rig.value+=diff*Math.min(1,dt*.018);moving=true;}
      rig.pivot.quaternion.setFromAxisAngle(rig.axis,rig.sign*rig.angle*rig.value);
    }
    if(tween){
      const x=Math.min(1,(now-tween.start)/tween.duration),ease=x*x*(3-2*x);
      camera.position.copy(tween.fromPos).lerp(tween.toPos,ease);
      camera.lookAt(tween.fromLook.clone().lerp(tween.toLook,ease));
      if(x===1){
        if(tween.next==="exterior"){
          controls.target.copy(originalTarget);controls.enabled=true;controls.update();
        } else {
          const look=tween.toLook.clone().sub(tween.toPos).normalize();
          yaw=Math.atan2(look.x,look.z);pitch=Math.asin(THREE.MathUtils.clamp(look.y,-1,1));
          camera.lookAt(getLookTarget());
        }
        tween=null;
      }else moving=true;
    }
    animating=moving;
    return moving;
  }
  add(stage,"pointerdown",e=>{
    if(destroyed||tween)return;
    if(view==="exterior"){
      tapStart={id:e.pointerId,x:e.clientX,y:e.clientY};
      return;
    }
    drag={id:e.pointerId,x:e.clientX,y:e.clientY};
    stage.setPointerCapture?.(e.pointerId);
  });
  add(stage,"pointermove",e=>{
    if(!drag||e.pointerId!==drag.id)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
    yaw-=dx*.0048;pitch=THREE.MathUtils.clamp(pitch-dy*.0048,-1.22,1.22);
    updateLook();
  });
  add(stage,"pointerup",e=>{
    if(drag?.id===e.pointerId)drag=null;
    if(!tapStart||tapStart.id!==e.pointerId||view!=="exterior"||tween){tapStart=null;return;}
    const t=tapStart;tapStart=null;
    if(Math.hypot(e.clientX-t.x,e.clientY-t.y)>7||!rigs.size)return;
    const rect=stage.getBoundingClientRect();
    screenPointer.set((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height*2-1));
    raycaster.setFromCamera(screenPointer,camera);
    const hits=raycaster.intersectObject(root,true);
    for(const hit of hits){
      for(const rig of rigs.values()){
        let obj=hit.object;
        while(obj&&obj!==root){
          if(obj===rig.pivot){toggle(rig.key);return;}
          obj=obj.parent;
        }
      }
      // Do not open hidden parts behind an opaque body mesh.
      break;
    }
  });
  add(stage,"pointercancel",()=>{drag=null;tapStart=null;});
  add(stage,"wheel",e=>{
    if(view==="exterior"||tween||destroyed)return;
    e.preventDefault();
    camera.fov=THREE.MathUtils.clamp(camera.fov+Math.sign(e.deltaY)*2,42,80);
    camera.updateProjectionMatrix();requestRender();
  },{passive:false});
  for(const [key,id] of Object.entries(partButtons))add($(id),"click",()=>toggle(key));
  add($("x-close-all"),"click",closeAll);
  for(const [key,btn] of Object.entries(vbuttons))add(btn,"click",()=>setView(key));
  updateUI();
  return {
    tick,
    setView,
    get mode(){return view},
    destroy(){
      destroyed=true;
      for(const fn of listeners)fn();
      for(const rig of rigs.values()){
        rig.pivot.quaternion.identity();rig.pivot.updateMatrixWorld(true);
      }
      if(controls){controls.enabled=true;}
      for(const id of Object.values(partButtons))$(id).disabled=true;
      $("x-close-all").disabled=true;
      for(const name of ["view-driver","view-rear"])$(name).disabled=true;
      $("turntable").disabled=false;
      rigs.clear();
    }
  };
}
