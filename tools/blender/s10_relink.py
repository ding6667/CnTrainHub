import bpy, json

MAT = 'Material.001'
m = bpy.data.materials[MAT]
nt = m.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
sep = next((n for n in nt.nodes if n.type == 'SEPARATE_COLOR'), None)

imgs = {i.name: i for i in bpy.data.images if 'pbr' in i.name}
orm = next((v for k, v in imgs.items() if 'roughness' in k or 'metallic' in k), None)
base = next((v for k, v in imgs.items() if 'roughness' not in k and 'normal' not in k), None)

# re-attach the metallic/roughness bake to the image node that feeds the
# Separate Colour -> Metallic/Roughness chain, which an earlier purge emptied
target = None
if sep:
    for l in nt.links:
        if l.to_node == sep:
            target = l.from_node
            break
if target is None:
    target = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image is None), None)
    if target and sep:
        nt.links.new(target.outputs['Color'], sep.inputs['Color'])
if orm is not None and target is not None:
    target.image = orm
    orm.colorspace_settings.name = 'Non-Color'
    if sep:
        for sock, ch in (('Metallic', 'Blue'), ('Roughness', 'Green')):
            dst = next((i for i in bsdf.inputs if i.name == sock), None)
            if dst and not dst.is_linked:
                nt.links.new(sep.outputs[ch], dst)

# restore the clay test's flattened base colour before re-linking
flat = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image is base), None)
if flat is None and base is not None:
    flat = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image is None), None)
    if flat is not None:
        flat.image = base

if base is not None:
    node = next((l.from_node for l in nt.links if l.to_node == bsdf and l.to_socket.name == 'Base Color'), None)
    if node is None:
        node = nt.nodes.new('ShaderNodeTexImage')
        nt.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
    node.image = base
    base.colorspace_settings.name = 'sRGB'

# drop dead image nodes: they make the exporter warn about ambiguous samplers
empties = [n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image is None]
for n in empties:
    nt.nodes.remove(n)
normals = [n for n in nt.nodes if n.type in ('NORMAL_MAP',)
           or (n.type == 'TEX_IMAGE' and n.image and 'normal' in n.image.name.lower())]
for n in normals:
    nt.nodes.remove(n)

report = {
    'nodes': [[n.type, (n.image.name[-40:] if getattr(n, 'image', None) else None)] for n in nt.nodes],
    'links': [[l.from_node.type, l.from_socket.name, l.to_socket.name] for l in nt.links],
    'orm_size': list(orm.size) if orm else None,
    'base_size': list(base.size) if base else None,
}
print(json.dumps(report, ensure_ascii=False))
