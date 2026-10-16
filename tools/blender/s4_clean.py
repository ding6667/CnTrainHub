import bpy, json, bmesh
from mathutils import Vector

SRC_OBJ = globals().get('SRC_OBJ', 'node_0')
SRC_COL = globals().get('SRC_COL', 'COL-CR400BF-SRC')
WIP_COL = 'COL-CR400BF-WIP'
DUP = globals().get('DUP', 'GEO-CR-head')
MIN_AREA = float(globals().get('MIN_AREA', 0.0004))
SMOOTH_ITERS = float(globals().get('SMOOTH_ITERS', 8))
# local axes: x = length, y = height, z = width (world = x, -z, y).
# Measured from the top view: the body shell occupies z in [-0.01, 0.137];
# the debris blob sits at z < -0.02, so the envelope is asymmetric on purpose.
ENV_ZLO = float(globals().get('ENV_ZLO', -0.025))
ENV_ZHI = float(globals().get('ENV_ZHI', 0.152))
ENV_Y = (float(globals().get('ENV_YLO', -0.015)), float(globals().get('ENV_YHI', 0.192)))

scene = bpy.context.scene
wip = bpy.data.collections.get(WIP_COL)
if wip is None:
    wip = bpy.data.collections.new(WIP_COL)
    scene.collection.children.link(wip)

src = bpy.data.objects[SRC_OBJ]
obj = bpy.data.objects.get(DUP)
fresh = obj is None
if fresh:
    obj = src.copy()
    obj.data = src.data.copy()
    obj.name = obj.data.name = DUP
    wip.objects.link(obj)
else:                       # re-run from the pristine source, never from last time
    obj.data = src.data.copy()
    obj.data.name = DUP

# park the import so it cannot be mistaken for the deliverable
src.hide_set(True)
src.hide_render = True

me = obj.data
bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()

seen, islands = set(), []
for f0 in bm.faces:
    if f0.index in seen:
        continue
    stack, comp = [f0], []
    while stack:
        g = stack.pop()
        if g.index in seen:
            continue
        seen.add(g.index)
        comp.append(g)
        for e in g.edges:
            for lf in e.link_faces:
                if lf.index not in seen:
                    stack.append(lf)
    islands.append(comp)

victims, drop = [], []
kept = kept_faces = 0
for comp in islands:
    area = sum(f.calc_area() for f in comp)
    zs = [v.co.z for f in comp for v in f.verts]
    ys = [v.co.y for f in comp for v in f.verts]
    inside = (ENV_ZLO <= min(zs) and max(zs) <= ENV_ZHI
              and min(ys) >= ENV_Y[0] and max(ys) <= ENV_Y[1])
    if area >= MIN_AREA and inside:
        kept += 1
        kept_faces += len(comp)
        continue
    drop.extend(comp)
    victims.append({'area': round(area, 5), 'faces': len(comp),
                    'w': [round(min(zs), 3), round(max(zs), 3)],
                    'h': [round(min(ys), 3), round(max(ys), 3)]})

bmesh.ops.delete(bm, geom=drop, context='FACES')
before = len(bm.faces)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)

# The generated mesh carries high-frequency surface noise, which reads as a
# hammered finish once it is decimated and smooth-shaded.  A few Laplacian
# iterations fair the panels; the livery detail lives in the texture anyway.
for _ in range(int(SMOOTH_ITERS)):
    bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5,
                          use_axis_x=True, use_axis_y=True, use_axis_z=True)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me)
bm.free()
me.update()

tris = sum(len(p.vertices) - 2 for p in me.polygons)
xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
zs = [v.co.z for v in me.vertices]
print(json.dumps({
    'created': fresh, 'islands_total': len(islands), 'islands_kept': kept,
    'faces_before': 50000, 'faces_after_clean': before,
    'faces_after_merge': len(me.polygons), 'tris': tris, 'verts': len(me.vertices),
    'local_x': [round(min(xs), 3), round(max(xs), 3)],
    'local_y_height': [round(min(ys), 3), round(max(ys), 3)],
    'local_z_width': [round(min(zs), 3), round(max(zs), 3)],
    'dropped_top': sorted(victims, key=lambda r: -r['faces'])[:10],
    'dropped_islands': len(victims), 'dropped_faces': sum(v['faces'] for v in victims),
}, ensure_ascii=False))
