/**
 * World types — a shared 3D environment authored in the platform world editor and loadable by
 * any game via `session.listWorlds()` / `session.getWorld(id)`. Mirrors the platform's
 * `PlatformWorld`/`CatalogItem` (the SDK can't import platform code). The on-disk format is a
 * `MapDelta`: a base glb plus modifications and added objects (each referencing a glb by URL).
 */

/** Modification to an existing object in the base map. */
export interface WorldObjectMod {
  name: string;
  uuid?: string;
  deleted?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

/** An object added to the world (a duplicate, or a placed catalog item referenced by glb URL). */
export interface WorldAddedObject {
  id: string;
  source: { glb: string; objectName: string };
  position: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
}

/** Changes to a base map: small and self-describing. `baseMap` is a glb URL (or "" for none). */
export interface WorldMapDelta {
  baseMap: string;
  modifications: WorldObjectMod[];
  addedObjects: WorldAddedObject[];
}

/** Optional lighting/fog for a world. */
export interface WorldEnv {
  background: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientColor: string;
  ambientIntensity: number;
  keyColor: string;
  keyIntensity: number;
  keyAzimuthDeg: number;
  keyElevationDeg: number;
}

/** A platform world: a shared environment any game can load and render. */
export interface WorldDoc {
  version: number;
  id: string;
  name: string;
  env?: WorldEnv;
  map: WorldMapDelta;
  createdAt: number;
  updatedAt: number;
}
