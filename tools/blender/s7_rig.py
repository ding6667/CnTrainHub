import bpy, json, math, bmesh

HEAD = globals().get('HEAD', 'GEO-CR-head')
MID = globals().get('MID', 'GEO-CR-mid')
GRAPHITE = 'MAT-CR-graphite'
UF_MAT = 'MAT-CR-underframe'
# Reference side elevations: the underframe is a slim light-grey equipment band
# that recedes behind the body side, and the wheels are almost entirely hidden.
WHEEL_R, WHEEL_W, WHEEL_Y, WHEEL_N = 0.465, 0.16, 0.72, 10
# The reference shows a shallow grey equipment apron that stays behind the body
# silhouette, not a plinth: keep it narrow, short and pulled in from the ends.
SKIRT_LO, SKIRT_HI, SKIRT_HALF_W = 0.30, 1.02, 1.30
SKIRT_END_INSET = 1.05
ROOF_SINK, ROOF_W, ROOF_D, ROOF_H = 0.07, 2.40, 1.45, 0.09


def flat_mat(name, rgb, rough=0.7, metal=0.0):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    nt = m.node_tree
    b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None:
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) \
            or nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    for sock, val in (('Base Color', (*rgb, 1.0)), ('Roughness', rough), ('Metallic', metal)):
        s = next((i for i in b.inputs if i.name == sock), None)
        if s:
            s.default_value = val
    m.diffuse_color = (*rgb, 1.0)     # Workbench fallback for untextured materials
    return m


graphite = flat_mat(GRAPHITE, (0.115, 0.122, 0.132), 0.72)
under = flat_mat(UF_MAT, (0.180, 0.188, 0.202), 0.85)


def rig_mesh(name, length, bogie_x, shell_mat, roof=(), nose_inset=0.0):
    verts, faces, face_mats = [], [], []

    def quad(idx, material):
        faces.append(tuple(idx))
        face_mats.append(material)

    def box(cx, cy, cz, sx, sy, sz, material):
        x0, x1 = cx - sx / 2, cx + sx / 2
        y0, y1 = cy - sy / 2, cy + sy / 2
        z0, z1 = cz - sz / 2, cz + sz / 2
        b = len(verts)
        verts.extend([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                      (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6),
                  (1, 2, 6, 5), (0, 4, 7, 3)):
            quad([b + k for k in f], material)

    def wheel(cx, cy):
        b = len(verts)
        for sign in (-1, 1):
            for k in range(WHEEL_N):
                a = 2 * math.pi * k / WHEEL_N
                verts.append((cx + WHEEL_R * math.cos(a), cy + sign * WHEEL_W / 2,
                              WHEEL_R + WHEEL_R * math.sin(a)))
        for k in range(WHEEL_N):
            quad([b + k, b + WHEEL_N + k, b + WHEEL_N + (k + 1) % WHEEL_N,
                  b + (k + 1) % WHEEL_N], graphite)
        quad([b + i for i in range(WHEEL_N - 1, -1, -1)], graphite)
        quad([b + WHEEL_N + i for i in range(WHEEL_N)], graphite)

    # Continuous slim equipment band.  It overlaps the shell's cut line so no
    # seam shows, and it hides the bogies the way the reference does.
    # The apron is asymmetric on the head car: the body tapers toward the nose,
    # so a symmetric box would poke out past the silhouette there.
    rear = -(length / 2 - SKIRT_END_INSET)
    front = length / 2 - (SKIRT_END_INSET + nose_inset)
    box((rear + front) / 2, 0, (SKIRT_LO + SKIRT_HI) / 2, front - rear,
        SKIRT_HALF_W * 2, SKIRT_HI - SKIRT_LO, under)
    for cx in (-bogie_x, bogie_x):
        box(cx, 0, 0.68, 2.50, 1.16, 0.32, graphite)
        for wy in (-WHEEL_Y, WHEEL_Y):
            for ax in (-1.25, 1.25):
                wheel(cx + ax, wy)
    for (ux, uy, uz) in roof:
        box(ux, uy, uz - ROOF_SINK + ROOF_H / 2, ROOF_W, ROOF_D, ROOF_H, under)

    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    for p, m in zip(me.polygons, face_mats):
        p.use_smooth = False
        p.material_index = 1 if m is graphite else 2
    # Slot order mirrors the shell's, so join() cannot remap the indices.
    me.materials.append(shell_mat)
    me.materials.append(graphite)
    me.materials.append(under)
    ob = bpy.data.objects.new(name, me)
    bpy.data.collections['COL-CR400BF-WIP'].objects.link(ob)
    return ob


def roof_units(car, length):
    """Wide low AC housings placed from the sampled roof height so they sit on
    the surface instead of floating above it."""
    pts = [(p.center.x, p.center.y, p.center.z) for p in car.data.polygons
           if p.material_index == 0]
    out = []
    for fx in (0.30, 0.50, 0.70):
        x = (fx - 0.5) * length
        cand = [z for (px, py, z) in pts if abs(px - x) < 0.6 and abs(py) < 1.0]
        if cand:
            out.append((x, 0.0, max(cand)))
    return out


def join(car, extra):
    # A hidden object silently refuses select_set(), which makes join() a no-op
    # that only warns -- so make the state explicit instead of assuming it.
    bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
    for o in (car, extra):
        o.hide_set(False)
        o.hide_viewport = False
        o.hide_render = False
    bpy.ops.object.select_all(action='DESELECT')
    extra.select_set(True)
    car.select_set(True)
    bpy.context.view_layer.objects.active = car
    if not car.select_get():
        raise RuntimeError(f'{car.name} could not be selected; join aborted')
    before = len(car.data.polygons)
    bpy.ops.object.join()
    if len(car.data.polygons) <= before:
        raise RuntimeError(f'join did not merge into {car.name}')
    bpy.ops.object.select_all(action='DESELECT')


def decimate_to(car, target_tris):
    """Collapse the shell only; the rig is added afterwards so the wheels keep
    their segment count."""
    cur = sum(len(p.vertices) - 2 for p in car.data.polygons)
    if cur <= target_tris or cur == 0:
        return cur, cur
    mod = car.modifiers.new('Dec', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = target_tris / cur
    mod.use_collapse_triangulate = True
    bpy.ops.object.select_all(action='DESELECT')
    car.select_set(True)
    bpy.context.view_layer.objects.active = car
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return cur, sum(len(p.vertices) - 2 for p in car.data.polygons)


def relax(car, iters):
    """Post-decimation Laplacian pass: collapse drops the edge loops that
    defined the curvature, which leaves a rippled roof under smooth shading."""
    if iters <= 0:
        return
    bm = bmesh.new()
    bm.from_mesh(car.data)
    for _ in range(iters):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.35,
                              use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(car.data)
    bm.free()
    car.data.update()


report = {}
for nm, length in ((HEAD, 25.85), (MID, 25.0)):
    car = bpy.data.objects[nm]
    tgt = int(globals().get('DEC_HEAD' if nm == HEAD else 'DEC_MID', 4000))
    src_tris, shell_tris = decimate_to(car, tgt)
    relax(car, int(globals().get('RELAX', 2)))
    ru = roof_units(car, length)
    r = rig_mesh(f'RIG-{nm}', length, 0.28 * length, car.data.materials[0], ru,
                 nose_inset=2.6 if nm == HEAD else 0.0)
    rig_tris = sum(len(p.vertices) - 2 for p in r.data.polygons)
    join(car, r)
    # Small patched holes in the upper body read as black tears against the
    # ivory panels; give them the same light grey as the rest of the shell trim.
    patched = 0
    for p in car.data.polygons:
        if p.material_index == 1 and p.area < 0.25 and p.center.z > 1.5:
            p.material_index = 2
            patched += 1
    total = sum(len(p.vertices) - 2 for p in car.data.polygons)
    report[nm] = {'source_tris': src_tris, 'shell_tris': shell_tris,
                  'rig_tris': rig_tris, 'total_tris': total, 'roof_units': len(ru),
                  'patched': patched,
                  'dims': [round(v, 2) for v in car.dimensions],
                  'mats': [s.material.name for s in car.material_slots if s.material]}
    # Smooth shading is what makes painted panels read as one fair surface; the
    # rig boxes stay flat.  (Mesh.use_auto_smooth is gone in Blender 5.x.)
    car.data.polygons.foreach_set('use_smooth', [p.material_index == 0 for p in car.data.polygons])
    car.data.update()
print(json.dumps(report, ensure_ascii=False))
