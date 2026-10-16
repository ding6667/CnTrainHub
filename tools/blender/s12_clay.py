import bpy, json

ONLY = globals().get('ONLY', 'Head')
COLOR = globals().get('CLAY', '0.86,0.86,0.87')

o = bpy.data.objects[ONLY]
rgb = tuple(float(v) for v in COLOR.split(','))

# Clip the textured inputs and shade everything as one matte clay surface, so
# the image shows geometry fairness alone: no bake, no ORM, no colour.
clipped = []
for slot in o.material_slots:
    m = slot.material
    if m is None or not m.use_nodes:
        continue
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        continue
    for s in list(bsdf.inputs):
        for l in list(s.links):
            nt.links.remove(l)
    for name, val in (('Base Color', (*rgb, 1.0)), ('Metallic', 0.0), ('Roughness', 0.55)):
        s = next((i for i in bsdf.inputs if i.name == name), None)
        if s:
            s.default_value = val
    clipped.append(m.name)
print(json.dumps({'clipped': clipped}, ensure_ascii=False))
