import * as T from 'three';

const DOWN = new T.Vector3(0, -1, 0);

/** Project a navigation-light marker onto a model surface in aircraft-root coordinates. */
export function projectSurfacePoint(root, surface, { x, z, clearance = .16 } = {}) {
 if (!root?.isObject3D || !surface?.isObject3D || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(clearance)) {
  throw Error('Invalid navigation-light surface projection');
 }
 root.updateMatrixWorld(true);
 const bounds = new T.Box3().setFromObject(surface, true);
 if (bounds.isEmpty()) throw Error('Navigation-light surface is empty');
 const ray = new T.Raycaster();
 ray.set(new T.Vector3(x, bounds.max.y + 2, z), DOWN);
 const hit = ray.intersectObject(surface, true)[0];
 if (!hit) throw Error('Navigation-light point did not intersect its wing surface');
 const point = root.worldToLocal(hit.point.clone());
 point.y += clearance;
 return point;
}

/** Find lights near both span tips of a horizontal wing surface. */
export function projectWingtipPoints(root, surface, { xInset = 2.4, spanInset = .8, clearance = .16 } = {}) {
 root.updateMatrixWorld(true);
 const bounds = new T.Box3().setFromObject(surface, true);
 if (bounds.isEmpty()) throw Error('Wing surface is empty');
 const x = bounds.min.x + xInset;
 return [-1, 1].map(side => {
  const z = side < 0 ? bounds.min.z + spanInset : bounds.max.z - spanInset;
  return projectSurfacePoint(root, surface, { x, z, clearance });
 });
}

/** A330's navigation lights sit on the sloped winglet tips, not beside the wing. */
export function projectA330WingtipPoints(root) {
 const winglets = ['winglet0', 'winglet1'].map(name => root.getObjectByName(name));
 if (winglets.some(winglet => !winglet)) throw Error('A330 winglet surfaces missing');
 return winglets.map(winglet => {
  const bounds = new T.Box3().setFromObject(winglet, true);
  const side = bounds.getCenter(new T.Vector3()).z < 0 ? -1 : 1;
  const x = (bounds.min.x + bounds.max.x) / 2;
  const z = side < 0 ? bounds.min.z + .3 : bounds.max.z - .3;
  return projectSurfacePoint(root, winglet, { x, z, clearance: .12 });
 });
}
