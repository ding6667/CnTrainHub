import bpy, json, bmesh
from mathutils import Vector

DUP = globals().get('DUP', 'GEO-CR-head')
# Input frame is still the import's local space: x = length, y = height,
# z = width.  The source mesh degenerates into torn debris below ~1.0 m of a
# 4.05 m car, so the equipment-skirt line is where the cut goes.
CUT_Y = float(globals().get('CUT_Y', 0.045))
TARGET = (25.85, 4.05, 3.36)          # length, height, width in metres
CAP_MAT = 'MAT-CR-graphite'

obj = bpy.data.objects[DUP]
me = obj.data

mcap = bpy.data.materials.get(CAP_MAT)
if mcap is None:
    mcap = bpy.data.materials.new(CAP_MAT)
    mcap.use_nodes = True
    nt = mcap.node_tree
    b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None:
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) \
            or nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    b.inputs['Base Color'].default_value = (0.115, 0.122, 0.132, 1)
    b.inputs['Roughness'].default_value = 0.7
# Workbench 'TEXTURE' mode falls back to this for untextured materials, so it
# has to be set even when the material already exists from an earlier run.
mcap.diffuse_color = (0.115, 0.122, 0.132, 1)
if len(me.materials) < 2 or me.materials[1] != mcap:
    while len(me.materials) < 2:
        me.materials.append(None)
    me.materials[1] = mcap
CAP_IDX = list(me.materials).index(mcap)

bm = bmesh.new()
bm.from_mesh(me)
# The source mesh's full height range already spans rail-to-roof, so the height
# scale is measured before the cut.  Scaling the remainder to 4.05 instead would
# lift the skirt line to z=0 and leave no room for the bogies.
y_min_src = min(v.co.y for v in bm.verts)
y_max_src = max(v.co.y for v in bm.verts)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                       plane_co=(0, CUT_Y, 0), plane_no=(0, 1, 0), clear_inner=True)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')

# Cap the open loops: the nose coupler pocket and the new underside plane.
# Anything newly created is interior/underfloor, so it reads dark.
bm.normal_update()
open_edges = [e for e in bm.edges if len(e.link_faces) < 2]
res = bmesh.ops.edgenet_fill(bm, edges=open_edges)
caps = [f for f in res.get('faces', []) if len(f.verts) > 2]
for f in caps:
    f.material_index = CAP_IDX
cap_tris = sum(len(f.verts) - 2 for f in caps)   # read before bm.free() invalidates them
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

xs = [v.co.x for v in bm.verts]
zs = [v.co.z for v in bm.verts]
cx = (min(xs) + max(xs)) / 2
cz = (min(zs) + max(zs)) / 2
kx = TARGET[0] / (max(xs) - min(xs))
ky = TARGET[2] / (max(zs) - min(zs))
kz = TARGET[1] / (y_max_src - y_min_src)
for v in bm.verts:
    x, y, z = v.co
    v.co = Vector(((x - cx) * kx, (z - cz) * ky, (y - y_min_src) * kz))

bm.to_mesh(me)
bm.free()
me.update()

# glTF import stores its axis fix as a QUATERNION: writing rotation_euler alone
# is a no-op, which silently double-applies the rotation.
obj.rotation_mode = 'XYZ'
obj.rotation_euler = (0, 0, 0)
obj.rotation_quaternion = (1, 0, 0, 0)
obj.delta_rotation_euler = (0, 0, 0)
obj.delta_location = (0, 0, 0)
obj.location = (0, 0, 0)
obj.scale = (1, 1, 1)
bpy.context.view_layer.update()

tris = sum(len(p.vertices) - 2 for p in me.polygons)
print(json.dumps({
    'caps': len(caps), 'cap_tris': cap_tris,
    'faces': len(me.polygons), 'tris': tris, 'verts': len(me.vertices),
    'dims': [round(v, 3) for v in obj.dimensions],
    'z_range': [round(min(v.co.z for v in me.vertices), 3), round(max(v.co.z for v in me.vertices), 3)],
    'mats': [s.material.name if s.material else None for s in obj.material_slots],
    'non_manifold': sum(1 for e in me.edges if getattr(e, 'is_boundary', False)),
}, ensure_ascii=False))
