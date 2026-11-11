"""Export the open Proton e.MAS 5 .blend scene as browser-friendly GLB.
Run: blender -b model.blend --python tools/export_emas5_glb.py -- --variant premium --out public/studio3d/models/emas5-premium.glb
The original .blend is never saved or overwritten by this script.
"""
import argparse
import bpy
import os
import re
import sys

args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--variant', choices=['prime','premium'], default='premium')
parser.add_argument('--out', required=True)
parser.add_argument('--paint-material', action='append', default=[])
opt = parser.parse_args(args)

pattern = re.compile(r'(?:car.?paint|body.?paint|exterior.?paint|proton marble cream|marble cream with)', re.I)
paints = [mat for mat in bpy.data.materials
          if pattern.search(mat.name) or mat.name in opt.paint_material]
for idx, mat in enumerate(paints):
    old = mat.name
    mat.name = 'EMAS5_BodyPaint' if idx == 0 else 'EMAS5_BodyPaint_%02d' % idx
    print('BODY PAINT:', old, '=>', mat.name)
if not paints:
    print('WARNING: No body paint material detected; select manually in 3D viewer.')
    print('Material names:', ', '.join(m.name for m in bpy.data.materials))
out = os.path.abspath(opt.out)
os.makedirs(os.path.dirname(out), exist_ok=True)
print('EXPORT', opt.variant, 'mesh count', sum(o.type=='MESH' for o in bpy.data.objects))
result = bpy.ops.export_scene.gltf(filepath=out, export_format='GLB',
                                   use_selection=False, export_yup=True,
                                   export_cameras=False, export_lights=False)
if 'FINISHED' not in result or not os.path.exists(out):
    raise RuntimeError('Blender GLB export failed: '+str(result))
print('SUCCESS GLB:', out, os.path.getsize(out), 'bytes')
print('Visual check required: body paint, logos, wheels, lights and RHD.')
