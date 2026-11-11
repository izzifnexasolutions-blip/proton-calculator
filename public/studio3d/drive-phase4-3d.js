/**
 * Phase 04 · Optional e.MAS 5 GLB driving stage.
 * Reuses the exact GLB reference already published by the e.MAS 5 Studio 3D.
 * Renders a SYNTHETIC road/weather scene; never represents real 3D terrain,
 * actual vehicle physics, or a verified Prime trim.
 * Three.js & GLB load ONLY on explicit 3D toggle. All imports are free CDNs.
 */
const EXISTING_EMAS5_GLB="https://d2ol7oe51mr4n9.cloudfront.net/user_2wyjxahmz9PtKeHoIbEemDKyafc/5a2c3542-6892-491c-b33d-9a25f6e404dd.glb";
const VIEW_POSES=Object.freeze({
  chase:{position:[5.2,2.8,8.6],target:[0,1.1,0]},
  front:{position:[-4,2.5,-7.6],target:[0,1.15,0]},
  side:{position:[9.5,2.6,0],target:[0,1.2,0]},
  top:{position:[.4,11.6,5.5],target:[0,0,0]}
});
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function createDrive3D({container,onStatus}){
  let version=0,pending=null,enabled=false,visible=true,Three=null;
  let renderer=null,scene=null,camera=null,carRig=null,model=null,rootGroup=null;
  let road=null,light=null,hemisphere=null,fog=null,resizeObserver=null,intersectionObserver=null;
  let cameraMode="chase",sceneKind="normal",roadDashes=[],scenery=[],timeOrigin=null;
  let lastInput={km:0,speed:0,playing:false,condition:{},night:false},lastFrame=0,scrollOffset=0,cameraRaf=0;
  const updateStatus=(message,state="")=>onStatus?.(message,state);
  const resize=()=>{
    if(!renderer||!camera||!container)return;
    const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);
    if(renderer.domElement.width===Math.round(w*renderer.getPixelRatio())&&renderer.domElement.height===Math.round(h*renderer.getPixelRatio()))return;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    render();
  };
  function render(){
    if(!renderer||!scene||!camera||!visible||document.hidden)return;
    renderer.render(scene,camera);
  }
  function buildWorld(THREE){
    scene=new THREE.Scene();
    scene.background=new THREE.Color("#162c48");
    fog=new THREE.Fog("#162c48",16,110);
    scene.fog=fog;
    camera=new THREE.PerspectiveCamera(42,1,.05,220);
    camera.position.set(...VIEW_POSES.chase.position);camera.lookAt(...VIEW_POSES.chase.target);
    hemisphere=new THREE.HemisphereLight(0xdcefff,0x3d5367,2.4);scene.add(hemisphere);
    light=new THREE.DirectionalLight(0xffffff,3.35);light.position.set(-6,13,9);scene.add(light);
    const fill=new THREE.DirectionalLight(0xb5dfff,1.1);fill.position.set(7,6,-8);scene.add(fill);
    const groundMat=new THREE.MeshStandardMaterial({color:0x152e38,roughness:.98});
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(210,210),groundMat);
    floor.rotation.x=-Math.PI/2;floor.position.y=-.065;scene.add(floor);
    const roadMat=new THREE.MeshStandardMaterial({color:0x202937,roughness:.86,metalness:.12});
    road=new THREE.Mesh(new THREE.PlaneGeometry(8.3,210),roadMat);
    road.rotation.x=-Math.PI/2;road.position.y=-.042;scene.add(road);
    const stripeMat=new THREE.MeshBasicMaterial({color:0xe5e8e5,transparent:true,opacity:.88,depthWrite:false});
    const dashGeo=new THREE.PlaneGeometry(.14,3.7);
    for(let j=0;j<21;j++){
      const dash=new THREE.Mesh(dashGeo,stripeMat);
      dash.rotation.x=-Math.PI/2;dash.position.set(0,-.020,-91+j*9);
      scene.add(dash);roadDashes.push(dash);
    }
    const borderMat=new THREE.MeshBasicMaterial({color:0xa1c0c4,transparent:true,opacity:.53});
    for(const x of [-3.95,3.95]){
      const border=new THREE.Mesh(new THREE.PlaneGeometry(.14,210),borderMat);
      border.rotation.x=-Math.PI/2;border.position.set(x,-.017,0);scene.add(border);
    }
    const treeGreen=new THREE.MeshStandardMaterial({color:0x305e66,roughness:1});
    const treeBark=new THREE.MeshStandardMaterial({color:0x4d4d4b,roughness:1});
    const buildingMat=new THREE.MeshStandardMaterial({color:0x38586e,metalness:.18,roughness:.8});
    const hillsMat=new THREE.MeshStandardMaterial({color:0x345768,roughness:.95});
    const trunkGeo=new THREE.CylinderGeometry(.12,.18,1.7,5);
    const leafGeo=new THREE.ConeGeometry(.95,3,6);
    const houseGeo=new THREE.BoxGeometry(2.8,4.3,2.6);
    const hillGeo=new THREE.ConeGeometry(5,8,7);
    for(let i=0;i<32;i++){
      const left=i%2===0,side=left?-1:1;
      const z=-90+(i/2)*11.5,x=side*(6.6+(i%3)*1.1);
      const group=new THREE.Group();
      group.position.set(x,0,z);
      const tree=i%5!==0;
      if(tree){
        const stem=new THREE.Mesh(trunkGeo,treeBark);stem.position.y=.83;group.add(stem);
        const foliage=new THREE.Mesh(leafGeo,treeGreen);foliage.position.y=2.7;group.add(foliage);
      }else{
        const house=new THREE.Mesh(houseGeo,buildingMat);house.position.y=2.15;group.add(house);
      }
      group.userData={baseZ:z,type:tree?"tree":"building"};
      scene.add(group);scenery.push(group);
    }
    for(const x of [-25,25]){
      const hill=new THREE.Mesh(hillGeo,hillsMat);
      hill.scale.set(1.4,1.7,1.8);hill.position.set(x,1.1,-40);
      scene.add(hill);scenery.push(hill);
      hill.userData={baseZ:-40,type:"hill"};
    }
    carRig=new THREE.Group();scene.add(carRig);
    renderer=new THREE.WebGLRenderer({
      antialias:window.innerWidth>760,alpha:false,powerPreference:"high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<760?1.15:1.4));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.48;
    renderer.shadowMap.enabled=false;
    container.appendChild(renderer.domElement);
    resize();
  }
  function alignCar(THREE,original){
    const bounds=new THREE.Box3().setFromObject(original);
    const size=bounds.getSize(new THREE.Vector3());
    if(bounds.isEmpty()||size.length()<1e-5)throw Error("Model 3D tiada geometri yang boleh dipaparkan.");
    const center=bounds.getCenter(new THREE.Vector3());
    const axis=size.x>size.z?"x":"z";
    let hood=null,trunk=null;
    original.traverse(node=>{
      const n=(node.name||"").toLowerCase();
      if(node.isMesh&&/hood/.test(n)&&!hood)hood=new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
      if(node.isMesh&&/trunk/.test(n)&&!trunk)trunk=new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
    });
    const frontPositive=hood&&trunk?hood[axis]>trunk[axis]:false;
    const angle=axis==="x"?(frontPositive?Math.PI/2:-Math.PI/2):(frontPositive?Math.PI:0);
    original.position.set(-center.x,-bounds.min.y,-center.z);
    carRig.rotation.y=angle;
    carRig.scale.setScalar(3.9/Math.max(size.x,size.z));
    carRig.add(original);
    model=original;
  }
  function configureEnvironment(input){
    const condition=input.condition||{},rain=!!condition.rain,night=!!input.night;
    const type=rain?"rain":condition.surface==="uneven"?"rough":"normal";
    sceneKind=type;
    const bg=night?"#071527":rain?"#1b2e43":"#162c48";
    scene.background.set(bg);fog.color.set(bg);
    fog.near=night?10:16;fog.far=rain?53:110;
    light.intensity=night?.48:rain?1.8:3.35;
    hemisphere.intensity=night?.9:rain?1.8:2.4;
    if(road?.material){
      road.material.roughness=rain?.24:.86;
      road.material.metalness=rain?.38:.12;
    }
    for(const item of scenery){
      if(item.userData?.type==="building")item.visible=condition.road==="city"||condition.traffic==="heavy";
      else if(item.userData?.type==="hill")item.visible=condition.road==="hilly"||condition.slope==="up"||condition.slope==="down";
      else item.visible=true;
    }
  }
  function setCamera(mode){
    if(!VIEW_POSES[mode])return false;
    cameraMode=mode;
    if(camera){
      if(cameraRaf){cancelAnimationFrame(cameraRaf);cameraRaf=0;}
      const pose=VIEW_POSES[mode];
      const from=camera.position.clone();
      const to=new Three.Vector3(...pose.position);
      const target=new Three.Vector3(...pose.target);
      const start=performance.now();
      function ease(now){
        cameraRaf=0;
        const t=Math.min(1,Math.max(0,(now-start)/420));
        const smooth=t*t*(3-2*t);
        camera.position.lerpVectors(from,to,smooth);
        camera.lookAt(target);
        render();
        if(t<1)cameraRaf=requestAnimationFrame(ease);
      }
      if(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches){
        camera.position.copy(to);camera.lookAt(target);render();
      }else cameraRaf=requestAnimationFrame(ease);
    }
    return true;
  }
  function update(input={}){
    lastInput={...lastInput,...input};
    if(!enabled||!Three||!renderer)return;
    const km=Number(lastInput.km)||0,speed=Number(lastInput.speed)||0;
    const active=lastInput.playing===true&&speed>0;
    // A smooth visual scroll clock. Do not translate simulation km directly
    // into metres/frame: 200 km compressed into 12s otherwise flickers.
    const now=performance.now();
    const delta=lastFrame?Math.max(0,Math.min(.055,(now-lastFrame)/1000)):0;
    lastFrame=now;
    if(active)scrollOffset=(scrollOffset+delta*26*(speed/75))%190;
    for(let i=0;i<roadDashes.length;i++)
      roadDashes[i].position.z=-95+((i*9+scrollOffset)%190);
    scenery.forEach((item,i)=>{
      if(item.userData?.type==="hill")return;
      item.position.z=-90+((item.userData.baseZ+90+scrollOffset)%183);
    });
    if(carRig)carRig.position.y=active?(Math.sin(km*250)*.012):0;
    configureEnvironment(lastInput);
    render();
  }
  async function enable(){
    if(enabled)return true;
    if(pending)return pending;
    const token=++version;
    pending=(async()=>{
      try{
        updateStatus("Mengaktifkan 3D… memuatkan renderer percuma.","loading");
        const [THREE,loaders,dracos]=await Promise.all([
          import("three"),
          import("three/addons/loaders/GLTFLoader.js"),
          import("three/addons/loaders/DRACOLoader.js")
        ]);
        if(version!==token)return false;
        Three=THREE;
        buildWorld(THREE);
        const draco=new dracos.DRACOLoader();
        draco.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
        const loader=new loaders.GLTFLoader();
        loader.setDRACOLoader(draco);
        updateStatus("Memuatkan model e.MAS 5 dari Studio 3D…","loading");
        let gltf;
        try{
          gltf=await loader.loadAsync(EXISTING_EMAS5_GLB,event=>{
            if(event.lengthComputable&&event.total>0&&version===token)
              updateStatus("Memuatkan model sebenar "+Math.round(event.loaded/event.total*100)+"%…","loading");
          });
        }finally{draco.dispose();}
        if(version!==token){
          gltf?.scene?.traverse(n=>{if(n.isMesh)n.geometry?.dispose();});
          return false;
        }
        alignCar(THREE,gltf.scene);
        enabled=true;
        if(typeof ResizeObserver!=="undefined"){
          resizeObserver=new ResizeObserver(resize);
          resizeObserver.observe(container);
        }
        if(typeof IntersectionObserver!=="undefined"){
          intersectionObserver=new IntersectionObserver(entries=>{
            visible=!!entries[0]?.isIntersecting;
            if(visible)render();
          },{threshold:.01});
          intersectionObserver.observe(container);
        }
        resize();setCamera(cameraMode);update(lastInput);
        updateStatus("3D aktif · Model GLB Premium daripada Studio 3D. Jalan ialah visual simulasi.","ready");
        return true;
      }catch(error){
        if(version===token){
          cleanup();
          updateStatus("3D tidak dapat dimuatkan pada peranti/rangkaian ini. Mod 2D masih berfungsi.","error");
        }
        return false;
      }finally{if(version===token)pending=null;}
    })();
    return pending;
  }
  function cleanup(){
    if(cameraRaf){cancelAnimationFrame(cameraRaf);cameraRaf=0;}
    resizeObserver?.disconnect();resizeObserver=null;
    intersectionObserver?.disconnect();intersectionObserver=null;
    if(scene){
      const geometries=new Set(),materials=new Set();
      scene.traverse(object=>{
        if(object.isMesh){
          if(object.geometry)geometries.add(object.geometry);
          for(const mat of Array.isArray(object.material)?object.material:[object.material])
            if(mat)materials.add(mat);
        }
      });
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    }
    renderer?.dispose();renderer?.forceContextLoss?.();
    container.replaceChildren();
    renderer=null;scene=null;camera=null;model=null;carRig=null;
    road=null;light=null;hemisphere=null;fog=null;Three=null;
    roadDashes=[];scenery=[];enabled=false;visible=true;lastFrame=0;scrollOffset=0;
  }
  function disable(){
    version++;
    pending=null;
    cleanup();
    updateStatus("Mod 2D Ringan aktif. 3D dinyahaktifkan untuk menjimatkan memori.","");
  }
  return {
    enable,disable,update,setCamera,
    get enabled(){return enabled},
    get busy(){return !!pending},
    get cameraMode(){return cameraMode},
    get source(){return EXISTING_EMAS5_GLB}
  };
}
