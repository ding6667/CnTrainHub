import bpy, json, bmesh
from mathutils import Vector

HEAD = globals().get('HEAD', 'GEO-CR-head')
MID = globals().get('MID', 'GEO-CR-mid')
COL = 'COL-CR400BF-WIP'
X_CUT = float(globals().get('X_CUT', 6.5))     # everything forward of this is cab/nose
MID_L = float(globals().get('MID_L', 25.0))

src = bpy.data.objects[HEAD]
coll = bpy.data.collections[COL]

old = bpy.data.objects.get(MID)
if old:
    bpy.data.objects.remove(old, do_unlink=True)
obj = src.copy()
obj.data = src.data.copy()
obj.name = obj.data.name = MID
coll.objects.link(obj)

me = obj.data
bm = bmesh.new()
bm.from_mesh(me)
# keep the rear of the head car, drop the whole nose + cab region
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                       plane_co=(X_CUT, 0, 0), plane_no=(-1, 0, 0), clear_inner=True)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.normal_update()
res = bmesh.ops.edgenet_fill(bm, edges=[e for e in bm.edges if len(e.link_faces) < 2])
CAP = 1
cap_tris = 0
for f in res.get('faces', []):
    if len(f.verts) > 2:
        f.material_index = CAP
        cap_tris += len(f.verts) - 2
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

xs = [v.co.x for v in bm.verts]
x0, x1 = min(xs), max(xs)
k = MID_L / (x1 - x0)
cxm = (x0 + x1) / 2
for v in bm.verts:
    v.co.x = (v.co.x - cxm) * k
bm.to_mesh(me)
bm.free()
me.update()
bpy.context.view_layer.update()

print(json.dumps({
    'mid': MID, 'cut_at': X_CUT, 'stretch_x': round(k, 3), 'cap_tris': cap_tris,
    'faces': len(me.polygons), 'tris': sum(len(p.vertices) - 2 for p in me.polygons),
    'dims': [round(v, 3) for v in obj.dimensions],
    'mats': [s.material.name if s.material else None for s in obj.material_slots],
}, ensure_ascii=False))
