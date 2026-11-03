import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const $=id=>document.getElementById(id);
const host=$('stage');
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(44,1,.05,100);
camera.position.set(4.7,2.45,5.5);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'default'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.3;
host.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xd7edff,0x3a4b61,3.2));
let light=new THREE.DirectionalLight(0xffffff,3.5);light.position.set(5,10,6);scene.add(light);
light=new THREE.DirectionalLight(0xb7d0ff,1.8);light.position.set(-4,5,-5);scene.add(light);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x172332,roughness:.9,metalness:.05}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.025;scene.add(floor);
const grid=new THREE.GridHelper(12,24,0x4a6075,0x273747);grid.position.y=-.012;scene.add(grid);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.055;controls.maxPolarAngle=Math.PI*.505;
controls.minDistance=2.5;controls.maxDistance=13;controls.target.set(0,.71,0);
const settings={hood:{axis:'x',angle:-54},trunk:{axis:'x',angle:58},door_fr:{axis:'y',angle:-64},door_fl:{axis:'y',angle:64},door_rr:{axis:'y',angle:-64},door_rl:{axis:'y',angle:64}};
let root=null;let spin=false;let ready=false;const state={};
function feedback(v){$('feedback').textContent=v;}
function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);
new ResizeObserver(resize).observe(host);
resize();
function reset(){if(!ready)return;for(const [part,opt] of Object.entries(settings)){
 const o=root.getObjectByName(part);if(o)o.rotation[opt.axis]=0;state[part]=false;
 document.querySelector(`[data-part="${part}"]`)?.setAttribute('aria-pressed','false');
}camera.position.set(4.7,2.45,5.5);controls.target.set(0,.71,0);controls.update();feedback('Kedudukan asal dipulihkan.');}
for(const b of document.querySelectorAll('[data-part]'))b.addEventListener('click',()=>{
 if(!ready)return;const part=b.dataset.part,obj=root.getObjectByName(part),opt=settings[part];
 if(!obj){feedback('Komponen '+part+' tiada dalam model.');return;}
 state[part]=!state[part];obj.rotation[opt.axis]=state[part]?THREE.MathUtils.degToRad(opt.angle):0;
 b.setAttribute('aria-pressed',String(state[part]));feedback(part.replaceAll('_',' ')+' — '+(state[part]?'dibuka':'ditutup'));
});
$('reset').addEventListener('click',reset);
$('spin').addEventListener('click',()=>{spin=!spin;$('spin').setAttribute('aria-pressed',String(spin));feedback(spin?'Mod putar automatik aktif.':'Mod putar automatik dimatikan.');});
try{
 const loader=new GLTFLoader();
 const gltf=await loader.loadAsync('/studio3d/assets/iswara-aeroback-2000-rigged.glb');
 root=gltf.scene;root.name='ISWARA_3D_ROOT';
 if(!root.children.length)throw Error('GLB kosong.');
 scene.add(root);ready=true;
 $('loading').hidden=true;feedback('Model GLB 3D dimuat. Pintu, bonet dan hatch boleh dibuka.');
}catch(err){$('loading').textContent='Model tidak dapat dimuat: '+(err.message||err)+'. GLB boleh dimuat turun dan diuji secara tempatan.';feedback('Ralat memuat GLB. Tiada data diterbitkan.');}
const clock=new THREE.Clock();
function loop(){requestAnimationFrame(loop);const delta=Math.min(.04,clock.getDelta());if(spin&&ready){const off=camera.position.clone().sub(controls.target);off.applyAxisAngle(new THREE.Vector3(0,1,0),delta*.24);camera.position.copy(controls.target).add(off);}controls.update();renderer.render(scene,camera);}loop();