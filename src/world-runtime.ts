/**
 * applyWorld — render a {@link WorldDoc} into a three.js scene (or any compatible object graph).
 *
 * Exported from the SDK's main entry, but with **zero** dependency on `three`: it only *manipulates*
 * objects your `loadGlb` returns (set transforms, add to the target, traverse) — it never constructs
 * three objects. The minimal structural `Object3DLike` interface below is satisfied by a real
 * `THREE.Object3D`, so games pass their own scene + GLTFLoader and nothing forces a three version.
 *
 * Usage (game side):
 *   const loader = new GLTFLoader();
 *   const loadGlb = (url) => loader.loadAsync(url).then(g => g.scene);
 *   await applyWorld(scene, await session.getWorld(id), { loadGlb });
 */
import type { WorldDoc } from "./protocol/worlds.js";

interface Vec3Like {
  fromArray(array: ArrayLike<number>, offset?: number): unknown;
}

/** Structural subset of THREE.Object3D used by applyWorld. A real Object3D satisfies it. */
export interface Object3DLike {
  name: string;
  visible: boolean;
  position: Vec3Like;
  quaternion: Vec3Like;
  scale: Vec3Like;
  add(child: Object3DLike): unknown;
  traverse(callback: (object: Object3DLike) => void): void;
  getObjectByName(name: string): Object3DLike | undefined;
}

export interface ApplyWorldOptions {
  /** Load a glb by URL and resolve to its root object (e.g. `loader.loadAsync(url).then(g => g.scene)`). */
  loadGlb: (url: string) => Promise<Object3DLike>;
}

/** Populate `target` with the world's base map (+ its modifications) and placed objects. */
export async function applyWorld(
  target: Object3DLike,
  world: WorldDoc,
  opts: ApplyWorldOptions,
): Promise<void> {
  const { map } = world;

  if (map.baseMap) {
    const base = await opts.loadGlb(map.baseMap);
    const mods = new Map(map.modifications.map((m) => [m.name, m]));
    base.traverse((o) => {
      const m = mods.get(o.name);
      if (!m) return;
      if (m.deleted) o.visible = false;
      if (m.position) o.position.fromArray(m.position);
      if (m.rotation) o.quaternion.fromArray(m.rotation);
      if (m.scale) o.scale.fromArray(m.scale);
    });
    target.add(base);
  }

  for (const a of map.addedObjects) {
    const root = await opts.loadGlb(a.source.glb);
    const node =
      a.source.objectName && a.source.objectName !== "root"
        ? root.getObjectByName(a.source.objectName) ?? root
        : root;
    node.position.fromArray(a.position);
    node.quaternion.fromArray(a.rotation);
    node.scale.fromArray(a.scale);
    target.add(node);
  }
}
