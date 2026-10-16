import bpy, json

SRC_GLB = globals().get('SRC_GLB', r'C:\Users\dingy\Desktop\CnTrainHub\2b7d8fa377a8940c746ee2111afac46b.glb')
MAT = 'Material.001'
KEEP_NORMAL = globals().get('KEEP_NORMAL', '0') == '1'
TMP_COL = 'COL-CR400BF-TEXSRC'

# The in-session image datablocks were downscaled in place, so the 4K originals
# have to come back off disk.
before = {i.name for i in bpy.data.images}
coll = bpy.data.collections.get(TMP_COL)
if coll is None:
    coll = bpy.data.collections.new(TMP_COL)
    bpy.context.scene.collection.children.link(coll)

imported = [o.name for o in bpy.data.objects]
bpy.ops.import_scene.gltf(filepath=SRC_GLB)
fresh_objs = [o for o in bpy.data.objects if o.name not in imported]
for o in fresh_objs:
    for c in o.users_collection:
        c.objects.unlink(o)
    coll.objects.link(o)
    o.hide_render = True
    o.hide_viewport = True

fresh_imgs = [i for i in bpy.data.images if i.name not in before]
by_kind = {}
for i in fresh_imgs:
    if i.size[0] < 512:
        continue
    kind = 'normal' if 'normal' in i.name.lower() else (
        'orm' if ('roughness' in i.name.lower() or 'metallic' in i.name.lower()) else 'base')
    prev = by_kind.get(kind)
    if prev is None or i.size[0] > prev.size[0]:
        by_kind[kind] = i

m = bpy.data.materials[MAT]
nt = m.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')


def link_from(img, socket_name, srgb):
    tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image == img), None)
    if tex is None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.location = (-700, 200 if socket_name == 'Base Color' else -200)
    tex.image.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    sock = next((s for s in bsdf.inputs if s.name == socket_name), None)
    if sock:
        for l in list(nt.links):
            if l.to_node == bsdf and l.to_socket == sock:
                nt.links.remove(l)
        src = tex.outputs['Color'] if socket_name == 'Base Color' else tex.outputs['Color']
        nt.links.new(src, sock)
    return tex


done = {}
if by_kind.get('base'):
    link_from(by_kind['base'], 'Base Color', True)
    done['base'] = [by_kind['base'].size[0], by_kind['base'].size[1]]
if not KEEP_NORMAL:
    # The A/B render showed the baked normal map contributes nothing visible,
    # so it is dropped: smaller file and no residual surface noise.
    def is_normal_node(n):
        if n.type == 'NORMAL_MAP':
            return True
        return n.type == 'TEX_IMAGE' and bool(n.image) and 'normal' in n.image.name.lower()

    for n in [n for n in nt.nodes if is_normal_node(n)]:
        nt.nodes.remove(n)
    done['normal'] = 'dropped'
elif by_kind.get('normal'):
    link_from(by_kind['normal'], 'Normal', False)
    done['normal'] = [by_kind['normal'].size[0], by_kind['normal'].size[1]]

# Clean up the throwaway geometry; only its textures were wanted.
for o in fresh_objs:
    if o.type == 'MESH':
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if me.users == 0:
            bpy.data.meshes.remove(me)

# Re-running this script used to pile up orphaned 4K copies inside the .blend.
orphans = [i for i in bpy.data.images
           if 'texture_pbr' in i.name and i.users == 0 and i not in by_kind.values()]
for i in orphans:
    bpy.data.images.remove(i)

print(json.dumps({'fresh_images': [(i.name, i.size[0], i.size[1]) for i in fresh_imgs],
                  'applied': done, 'orphans_purged': len(orphans),
                  'nodes_left': [n.type for n in nt.nodes]}, ensure_ascii=False))
