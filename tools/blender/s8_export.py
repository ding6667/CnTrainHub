import bpy, json, os

GLB_OUT = globals().get('GLB_OUT', r'C:\Users\dingy\Desktop\CnTrainHub\public\models\CR400BF-G.glb')
BLEND_OUT = globals().get('BLEND_OUT', r'C:\Users\dingy\Desktop\CnTrainHub\.cache\blend\CR400BF-G-v1.blend')
TEX_MAX = int(globals().get('TEX_MAX', 1024))
HEAD = globals().get('HEAD', 'GEO-CR-head')
MID = globals().get('MID', 'GEO-CR-mid')

# ---- shrink the helper maps -----------------------------------------------
# The base-colour bake keeps its full resolution (s9_tex restores it from the
# source GLB and the exporter writes it as JPEG); only the roughness/metallic
# and normal maps are downscaled, where the eye cannot tell the difference.
resized = []
if TEX_MAX:
    for img in bpy.data.images:
        if img.size[0] <= 0 or img.name.startswith('Render Result'):
            continue
        n = img.name.lower()
        helper = ('pbr' in n) and ('roughness' in n or 'metallic' in n or 'normal' in n)
        if helper and max(img.size[0], img.size[1]) > TEX_MAX:
            img.scale(TEX_MAX, TEX_MAX)
            img.pack()          # Blender 5: pack() takes no update kwarg
            resized.append((img.name, img.size[0], img.size[1]))

# ---- stable node names for the runtime (Head / Middle, cloned per car) ------
def resolve(*names):
    for n in names:
        o = bpy.data.objects.get(n)
        if o:
            return o
    raise KeyError(f'none of {names}')

head = resolve(HEAD, 'Head')
mid = resolve(MID, 'Middle')
# A previous run renamed its outputs to Head/Middle, so those names can be held
# by stale geometry from that run.  Drop anything under those names that is not
# the object this chain just produced.
stale = [o for o in list(bpy.data.objects)
         if o.name.split('.')[0] in ('Head', 'Middle') and o not in (head, mid)]
for o in stale:
    me = o.data
    bpy.data.objects.remove(o, do_unlink=True)
    if me is not None and me.users == 0:
        bpy.data.meshes.remove(me)
head.name = head.data.name = 'Head'
mid.name = mid.data.name = 'Middle'

os.makedirs(os.path.dirname(GLB_OUT), exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
for n in ('Head', 'Middle'):
    o = bpy.data.objects[n]
    o.hide_set(False)
    o.hide_viewport = False
    o.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects['Head']

base = dict(filepath=GLB_OUT, export_format='GLB', use_selection=True,
            export_apply=True, export_materials='EXPORT',
            # AUTO kept the 4K bake as a 10.4 MB PNG; JPEG is what makes a
            # full-resolution livery affordable on the web.
            export_image_format=globals().get('IMG_FORMAT', 'JPEG'),
            export_normals=True, export_tangents=False, export_animations=False,
            export_skins=False, export_yup=True)
used = dict(base)
while True:
    try:
        bpy.ops.export_scene.gltf(**used)
        break
    except TypeError as e:
        import re
        m = re.search(r"['\"](\w+)['\"]", str(e))
        if m and m.group(1) in used:
            used.pop(m.group(1))
            continue
        raise

size = os.path.getsize(GLB_OUT)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)

tot = {}
for n in ('Head', 'Middle'):
    o = bpy.data.objects[n]
    tot[n] = sum(len(p.vertices) - 2 for p in o.data.polygons)
print(json.dumps({
    'glb': GLB_OUT, 'glb_MB': round(size / 1048576, 2),
    'blend': BLEND_OUT, 'blend_MB': round(os.path.getsize(BLEND_OUT) / 1048576, 2),
    'textures': resized, 'tris': tot,
    'consist_tris': tot['Head'] * 2 + tot['Middle'] * 6,
    'dropped_kwargs': [k for k in base if k not in used],
}, ensure_ascii=False))
