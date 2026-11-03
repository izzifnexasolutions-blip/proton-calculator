// Run from repository root: node tests/qa_iswara_repo.mjs
// Static structural QA; this does not claim WebGL/mobile browser runtime verification.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const base='public/studio3d';
const raw=fs.readFileSync(`${base}/assets/iswara-aeroback-2000-rigged.glb`);
const manifest=JSON.parse(fs.readFileSync(`${base}/assets/iswara_manifest.json`,'utf8'));
const jsonLen=raw.readUInt32LE(12);
const gltf=JSON.parse(raw.subarray(20,20+jsonLen).toString('utf8'));
let passed=0;function check(name,test){assert.ok(test,name);passed++;console.log('PASS',name);}
check('glTF v2 magic',raw.toString('ascii',0,4)==='glTF'&&raw.readUInt32LE(4)===2);
check('binary length',raw.readUInt32LE(8)===raw.length);
check('SHA256 matches manifest',crypto.createHash('sha256').update(raw).digest('hex')===manifest.asset.sha256);
check('source known',manifest.vehicle.modelKey==='iswara');
check('draft requires rights/privacy review',manifest.status==='draft'&&manifest.privacy===false&&manifest.rights===false);
check('has 27 photo references but not made publicly available',manifest.photos.length===27);
check('no 360 photo faked',manifest.featureAvailability.photoPanorama360===false);
check('six pivot nodes',["hood","trunk","door_fr","door_fl","door_rr","door_rl"].every(n=>gltf.nodes.some(node=>node.name===n)));
check('Studio supports local ZIP import',fs.readFileSync(`${base}/studio.js`,'utf8').includes('importIswaraZip'));
check('Staging-only preview exists',fs.existsSync(`${base}/iswara-preview.html`));
check('No direct publication by importing ZIP',fs.readFileSync(`${base}/studio.js`,'utf8').includes("rights:false,privacy:false,published:false"));
console.log(`Iswara static QA ${passed}/11 passed. Browser/WebGL verification is separate.`);