import bpy, json, math
from mathutils import Vector

TARGET = globals().get('TARGET', 'COL-CR400BF-WIP')
ONLY = globals().get('ONLY')
MODE = globals().get('MODE', 'quarter')
OUT = globals().get('OUT', r'C:\Users\dingy\Desktop\CnTrainHub\.cache\p-quarter.png')
PAD = float(globals().get('PAD', 1.12))
NORM = globals().get('NORM', '1') == '1'      # mute the baked normal map to A/B it
ENGINE = globals().get('ENGINE', 'EEVEE')

coll = bpy.data.collections.get(TARGET)
objs = [o for o in (coll.objects if coll else []) if o.type == 'MESH']
if ONLY:
    objs = [o for o in objs if o.name == ONLY]

for o in bpy.data.objects:
    if o.type in ('MESH', 'EMPTY', 'CURVE'):
        keep = o in objs
        o.hide_render = not keep
        o.hide_viewport = not keep

xs, ys, zs = [], [], []
for o in objs:
    for c in o.bound_box:
        p = o.matrix_world @ Vector(c)
        xs.append(p.x); ys.append(p.y); zs.append(p.z)
lo = Vector((min(xs), min(ys), min(zs)))
hi = Vector((max(xs), max(ys), max(zs)))
ctr = (lo + hi) / 2
ext = hi - lo

EYE = {
    'side': (0, -1, 0), 'side_n': (0, 1, 0), 'end': (1, 0, 0), 'end_n': (-1, 0, 0),
    'top': (0, 0, 1), 'quarter': (0.85, -1.0, 0.42), 'low_q': (0.9, -1.0, 0.12),
    'nose_low': (1.0, -0.55, 0.10), 'bogie': (0.15, -1.0, -0.30),
}
d = Vector(EYE[MODE]).normalized()
dist = max(ext) * 4
eye = ctr + d * dist

cam_data = bpy.data.cameras.get('CAM-CR-shot') or bpy.data.cameras.new('CAM-CR-shot')
cam = bpy.data.objects.get('CAM-CR-shot')
if cam is None:
    cam = bpy.data.objects.new('CAM-CR-shot', cam_data)
    bpy.context.scene.collection.objects.link(cam)
cam.hide_render = False
cam.hide_viewport = False
cam.location = eye
cam.rotation_euler = (ctr - eye).normalized().to_track_quat('-Z', 'Y').to_euler()
cam_data.type = 'ORTHO'
cam_data.clip_start = dist / 100.0
cam_data.clip_end = dist * 10.0

bpy.context.view_layer.update()
view = cam.matrix_world.inverted()
us, vs = [], []
for x in (lo.x, hi.x):
    for y in (lo.y, hi.y):
        for z in (lo.z, hi.z):
            p = view @ Vector((x, y, z))
            us.append(p.x); vs.append(p.y)
w, h = max(us) - min(us), max(vs) - min(vs)
cam_data.ortho_scale = max(w, h) * PAD

scene = bpy.context.scene
scene.camera = cam
for cand in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
    try:
        scene.render.engine = cand
        break
    except (TypeError, ValueError):
        continue
if scene.render.engine != 'BLENDER_EEVEE':
    raise RuntimeError(f'EEVEE unavailable, engine is {scene.render.engine}')
scene.eevee.taa_render_samples = int(globals().get('SAMPLES', 24))
# Standard matches the browser's plain sRGB output; AgX would desaturate the
# livery and make preview-vs-web comparison meaningless.
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
for o in bpy.data.objects:
    if o.type == 'LIGHT' and o.name not in ('LGT-key', 'LGT-fill'):
        o.hide_render = True

# neutral studio: one warm key like the web scene's directional light plus a
# soft fill, on a mid-grey world so reflections do not read as black
world = bpy.data.worlds.get('WD-preview') or bpy.data.worlds.new('WD-preview')
scene.world = world
world.use_nodes = True
nt = world.node_tree
bg = next((n for n in nt.nodes if n.type == 'BACKGROUND'), None)
if bg is None:
    bg = nt.nodes.new('ShaderNodeBackground')
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_WORLD'), None) or nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
bg.inputs[0].default_value = (0.28, 0.29, 0.31, 1)
bg.inputs[1].default_value = 1.0

for nm, (loc, energy) in {'LGT-key': ((28, -34, 34), 3.0), 'LGT-fill': ((-22, -18, 12), 0.7)}.items():
    ld = bpy.data.lights.get(nm) or bpy.data.lights.new(nm, 'SUN')
    ld.energy = energy
    ld.angle = math.radians(2.0)
    lo_ = bpy.data.objects.get(nm)
    if lo_ is None:
        lo_ = bpy.data.objects.new(nm, ld)
        scene.collection.objects.link(lo_)
    lo_.hide_render = False
    lo_.location = loc
    lo_.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).normalized().to_track_quat('-Z', 'Y').to_euler()

muted = 0
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    for n in m.node_tree.nodes:
        if n.type == 'NORMAL_MAP':
            n.inputs['Strength'].default_value = 1.0 if NORM else 0.0
            muted += 1

scene.render.resolution_x = 1200
scene.render.resolution_y = int(1200 * max(0.3, (h / max(w, 1e-6))))
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_depth = '8'
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print(json.dumps({'engine': scene.render.engine, 'mode': MODE, 'normal_strength': 1.0 if NORM else 0.0,
                  'normal_maps': muted, 'res': [scene.render.resolution_x, scene.render.resolution_y],
                  'out': OUT}))
