/**
 * e.MAS 5 colour synchronisation. One paint material for all exterior panels.
 * Source names: EXT_CarPaint, Door_*_CarPaint, Trunk_CarPaint, hood.
 * Roof, tyres, glass, lighting, trim and all interior materials remain intact.
 */
export function createUnifiedBodyPaint({THREE,root,initialColor}) {
  const original=[],decorated=[],eligibleMaterials=new Set(),solidMeshes=[];
  const paintColor=new THREE.Color(initialColor),originalCream=new THREE.Color("#cbb69e");
  const roofPattern=/(?:^|[_\s.\-])(?:roof|sunroof)(?:[_\s.\-]|$)|premium\s*gloss\s*black\s*roof/i;
  const excludeMaterial=/glass|window|tyre|tire|rubber|rim|wheel|chrome|brushed|metal\s*silver|mirror|light|led|headlamp|interior|carpet|leather|seat|black|matte|plastic|handle|license|plate|tulisan|transparent|brake|windshield|stainless|floor|battery|trim/i;
  const explicitPaint=/proton\s*marble\s*cream|marble\s*cream\s*with|emas5[_\s.\-]*bodypaint|car[_\s.\-]*paint|body[_\s.\-]*paint/i;
  const paintMesh=/(?:^|[_\s.\-])(?:ext[_\s.\-]*carpaint|door[_\s.\-]*(?:fl|fr|rl|rr)[_\s.\-]*carpaint|trunk[_\s.\-]*carpaint)(?:[_\s.\-]|$)/i;
  const panelMesh=/(?:^|[_\s.\-])(?:hood|bonnet|fender|quarter[_\s.\-]*panel|bumper|tailgate)(?:[_\s.\-]|$)/i;
  const decalMaterial=/marble\s*cream\s*with.*(?:proton|e\.?\s*mas|graphics|emblem)/i;
  const uniformBodyMaterial=new THREE.MeshPhysicalMaterial({
    name:"FARIS_UnifiedExteriorPaint",color:paintColor,
    metalness:.23,roughness:.36,clearcoat:.42,clearcoatRoughness:.22,
    side:THREE.DoubleSide
  });
  function hasRoofAncestor(mesh){
    let p=mesh;
    while(p&&p!==root){if(roofPattern.test(p.name||""))return true;p=p.parent;}
    return false;
  }
  function isEligible(mesh,mat){
    const n=mesh.name||"",m=mat?.name||"";
    if(!mat||hasRoofAncestor(mesh)||roofPattern.test(m)||excludeMaterial.test(m))return false;
    // Painted body mesh names from the actual Blender scene override generic
    // material names like E22H_Character white.
    if(paintMesh.test(n))return true;
    if(explicitPaint.test(m))return true;
    if(panelMesh.test(n)&&/white|cream|paint|body/i.test(m))return true;
    return false;
  }
  function makeDecalMaterial(material){
    const copy=material.clone();
    copy.color.set("#ffffff");copy.vertexColors=false;
    const previous=copy.onBeforeCompile;
    copy.onBeforeCompile=function(shader,renderer){
      if(typeof previous==="function")previous.call(this,shader,renderer);
      shader.uniforms.farisBodyColor={value:paintColor};
      shader.uniforms.farisOriginalCream={value:originalCream};
      const needle="#include <map_fragment>";
      if(!shader.fragmentShader.includes(needle))return;
      const changed=[
        "#ifdef USE_MAP",
        "vec4 paintTexel=texture2D(map,vMapUv);",
        "#ifdef DECODE_VIDEO_TEXTURE",
        "paintTexel=sRGBTransferEOTF(paintTexel);",
        "#endif",
        "float paintDistance=distance(paintTexel.rgb,farisOriginalCream);",
        "float baseMask=1.0-smoothstep(0.065,0.22,paintDistance);",
        "float brightness=dot(paintTexel.rgb,vec3(.2126,.7152,.0722));",
        "baseMask*=smoothstep(.13,.29,brightness);",
        "paintTexel.rgb=mix(paintTexel.rgb,farisBodyColor,baseMask);",
        "diffuseColor*=paintTexel;",
        "#endif"
      ].join("\n");
      shader.fragmentShader="uniform vec3 farisBodyColor;\nuniform vec3 farisOriginalCream;\n"+
        shader.fragmentShader.replace(needle,changed);
    };
    copy.customProgramCacheKey=()=> "faris-decals-cream-map-v2";
    copy.needsUpdate=true;decorated.push(copy);
    return copy;
  }
  root.traverse(mesh=>{
    if(!mesh.isMesh||hasRoofAncestor(mesh))return;
    const before=mesh.material,mats=Array.isArray(before)?before:[before];
    let count=0;
    const updated=mats.map(mat=>{
      if(!isEligible(mesh,mat))return mat;
      count++;eligibleMaterials.add(mat.name||"(unnamed)");
      if(decalMaterial.test(mat.name||"")&&mat.map)return makeDecalMaterial(mat);
      return uniformBodyMaterial;
    });
    if(!count)return;
    original.push({mesh,material:before});
    mesh.material=Array.isArray(before)?updated:updated[0];
    solidMeshes.push({mesh,count});
  });
  function setColor(hex){paintColor.set(hex);uniformBodyMaterial.color.copy(paintColor);}
  function restore(){
    for(const {mesh,material} of original)mesh.material=material;
    for(const m of decorated)m.dispose();
    uniformBodyMaterial.dispose();original.length=0;
  }
  return {setColor,restore,
    get matchedMeshCount(){return solidMeshes.length;},
    get matchedMaterialNames(){return [...eligibleMaterials];},
    get decalCount(){return decorated.length;}
  };
}
