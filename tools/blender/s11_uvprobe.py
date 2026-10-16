import bpy, json
import numpy as np

o = bpy.data.objects['Head']
me = o.data
uvl = me.uv_layers.active.data
img = bpy.data.images['texture_pbr_20250901']
W, H = img.size[0], img.size[1]
buf = np.empty(W * H * 4, dtype=np.float32)
img.pixels.foreach_get(buf)
buf = buf.reshape(-1, 4)


def texel(u, v):
    x = min(max(int(u * W), 0), W - 1)
    y = min(max(int((1.0 - v) * H), 0), H - 1)
    return [round(float(c), 2) for c in buf[y * W + x][:3]]


rows = []
for poly in me.polygons:
    if poly.material_index != 0:
        continue
    c = poly.center
    if c.z < 3.4 or abs(c.y) > 1.2:
        continue
    u = uvl[poly.loop_start].uv
    rows.append({'x': round(c.x, 1), 'z': round(c.z, 2),
                 'uv': [round(u[0], 3), round(u[1], 3)], 'texel': texel(u[0], u[1])})
    if len(rows) >= 8:
        break

side = []
for poly in me.polygons:
    if poly.material_index != 0:
        continue
    c = poly.center
    if not (2.3 < c.z < 2.9) or abs(c.y) < 1.5:
        continue
    u = uvl[poly.loop_start].uv
    side.append({'x': round(c.x, 1), 'uv': [round(u[0], 3), round(u[1], 3)], 'texel': texel(u[0], u[1])})
    if len(side) >= 6:
        break

print(json.dumps({
    'uv_layers': [l.name for l in me.uv_layers],
    'active': me.uv_layers.active.name,
    'uv_min': [round(min(d.uv[i] for d in uvl), 3) for i in (0, 1)],
    'uv_max': [round(max(d.uv[i] for d in uvl), 3) for i in (0, 1)],
    'roof': rows,
    'window_band': side,
}, ensure_ascii=False))
