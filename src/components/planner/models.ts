// Simple 3D stand-ins for the fitout planner, one builder per ModelKind.
//
// Each is built at its kind's TYPICAL footprint (lib/planner-catalogue) with the
// user's side at +Z and the origin at the centre of the footprint, then scaled
// to the product's own assembled size, so a product with published dimensions
// takes exactly its real floor space. They are recognisable shapes, not
// renders of the actual products: the photo in the details panel is the product.
import * as THREE from "three";
import { TYPICAL, type Footprint, type ModelKind } from "@/lib/planner-catalogue";

export type Materials = ReturnType<typeof makeMaterials>;

export function makeMaterials() {
  return {
    frame: new THREE.MeshStandardMaterial({ color: 0x1f1f22, roughness: 0.45, metalness: 0.55 }),
    frameLight: new THREE.MeshStandardMaterial({ color: 0x4a4a50, roughness: 0.5, metalness: 0.45 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc4c7cc, roughness: 0.25, metalness: 0.9 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.6 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xef5350, roughness: 0.5 }),
    belt: new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.9 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x0e1a24, roughness: 0.2, emissive: 0x16324a, emissiveIntensity: 0.6 }),
    timber: new THREE.MeshStandardMaterial({ color: 0xc69c6d, roughness: 0.7 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x2a2a2d, roughness: 0.95 }),
  };
}

type Builder = (g: THREE.Group, m: Materials) => void;

function add(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
/** A box standing on y (its base), centred on x/z. */
const box = (g: THREE.Group, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) =>
  add(g, new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z);
/** A box centred on (x, yc, z), tilted about x by `deg`. */
const tilt = (g: THREE.Group, mat: THREE.Material, w: number, h: number, d: number, x: number, yc: number, z: number, deg: number) => {
  const m = add(g, new THREE.BoxGeometry(w, h, d), mat, x, yc, z);
  m.rotation.x = THREE.MathUtils.degToRad(deg);
  return m;
};
const cyl = (g: THREE.Group, mat: THREE.Material, r: number, len: number, x: number, y: number, z: number, axis?: "x" | "z") => {
  const m = add(g, new THREE.CylinderGeometry(r, r, len, 20), mat, x, y, z);
  if (axis === "x") m.rotation.z = Math.PI / 2;
  if (axis === "z") m.rotation.x = Math.PI / 2;
  return m;
};

function stackTower(g: THREE.Group, m: Materials, x: number, z: number, h = 2.0) {
  box(g, m.frame, 0.07, h, 0.07, x - 0.2, 0.05, z);
  box(g, m.frame, 0.07, h, 0.07, x + 0.2, 0.05, z);
  box(g, m.frameLight, 0.3, 0.8, 0.16, x, 0.1, z);
  box(g, m.accent, 0.46, h - 0.25, 0.02, x, 0.15, z - 0.1);
  box(g, m.frame, 0.5, 0.08, 0.16, x, h, z);
}
function plates(g: THREE.Group, m: Materials, y: number, z: number, span = 0.8) {
  cyl(g, m.chrome, 0.015, span * 2.7, 0, y, z, "x");
  for (const s of [-1, 1]) {
    cyl(g, m.accent, 0.225, 0.06, s * span, y, z, "x");
    cyl(g, m.pad, 0.225, 0.05, s * (span + 0.06), y, z, "x");
  }
}

const BUILDERS: Record<ModelKind, Builder> = {
  treadmill(g, m) {
    box(g, m.frame, 0.86, 0.18, 2.05, 0, 0, 0);
    box(g, m.belt, 0.56, 0.02, 1.55, 0, 0.18, 0.15);
    for (const s of [-1, 1]) {
      tilt(g, m.frame, 0.07, 1.25, 0.09, s * 0.36, 0.72, -0.78, -7);
      box(g, m.chrome, 0.035, 0.035, 0.55, s * 0.36, 1.05, -0.5);
    }
    box(g, m.frame, 0.86, 0.22, 0.24, 0, 1.25, -0.82);
    tilt(g, m.screen, 0.52, 0.32, 0.03, 0, 1.46, -0.68, -20);
  },
  bike(g, m) {
    box(g, m.frame, 0.55, 0.06, 1.2, 0, 0, 0);
    tilt(g, m.frame, 0.09, 0.85, 0.09, 0, 0.47, -0.15, 20);
    cyl(g, m.frameLight, 0.27, 0.12, 0, 0.42, 0.32, "x");
    box(g, m.frame, 0.07, 0.95, 0.07, 0, 0.05, 0.42);
    box(g, m.pad, 0.2, 0.07, 0.32, 0, 0.9, -0.42);
    box(g, m.chrome, 0.5, 0.04, 0.05, 0, 1.0, 0.45);
    box(g, m.screen, 0.22, 0.15, 0.03, 0, 1.05, 0.38);
  },
  rower(g, m) {
    box(g, m.frame, 0.12, 0.06, 2.45, 0, 0.32, -0.1);
    box(g, m.frame, 0.5, 0.06, 0.08, 0, 0, -1.2);
    box(g, m.frame, 0.06, 0.32, 0.06, 0, 0, -1.2);
    cyl(g, m.pad, 0.27, 0.22, 0, 0.5, 0.95, "x");
    box(g, m.pad, 0.32, 0.07, 0.32, 0, 0.38, -0.3);
    box(g, m.frame, 0.5, 0.06, 0.18, 0, 0, 0.95);
    box(g, m.screen, 0.18, 0.13, 0.03, 0, 0.95, 0.85);
  },
  ski(g, m) {
    box(g, m.frame, 0.7, 0.04, 0.9, 0, 0, 0.05);
    box(g, m.frame, 0.2, 2.05, 0.18, 0, 0.04, -0.35);
    cyl(g, m.pad, 0.2, 0.1, 0, 1.6, -0.3, "z");
    for (const s of [-1, 1]) box(g, m.accent, 0.04, 0.15, 0.04, s * 0.15, 1.55, -0.2);
  },
  elliptical(g, m) {
    box(g, m.frame, 0.65, 0.12, 1.9, 0, 0, 0);
    cyl(g, m.frameLight, 0.3, 0.18, 0, 0.42, -0.72, "x");
    for (const s of [-1, 1]) {
      box(g, m.pad, 0.16, 0.05, 0.42, s * 0.18, 0.32, 0.05);
      tilt(g, m.chrome, 0.04, 1.3, 0.04, s * 0.26, 0.9, 0.62, -11);
    }
    box(g, m.frame, 0.1, 1.35, 0.1, 0, 0.05, 0.78);
    box(g, m.screen, 0.3, 0.2, 0.04, 0, 1.38, 0.72);
  },
  stack(g, m) {
    box(g, m.frame, 1.2, 0.06, 1.5, 0, 0, 0);
    stackTower(g, m, -0.3, -0.6);
    box(g, m.frame, 0.1, 0.45, 0.1, 0.2, 0.06, 0.15);
    box(g, m.pad, 0.5, 0.1, 0.5, 0.2, 0.5, 0.2);
    tilt(g, m.pad, 0.5, 0.75, 0.1, 0.2, 0.95, -0.1, -12);
    box(g, m.frame, 0.08, 1.7, 0.08, 0.2, 0.05, -0.25);
    box(g, m.chrome, 0.75, 0.04, 0.04, 0.2, 1.2, 0.25);
  },
  plate(g, m) {
    box(g, m.frame, 1.5, 0.06, 1.7, 0, 0, 0);
    box(g, m.pad, 0.5, 0.1, 0.45, 0, 0.5, -0.35);
    tilt(g, m.pad, 0.5, 0.8, 0.1, 0, 0.95, -0.6, -12);
    box(g, m.frame, 0.1, 1.9, 0.1, 0, 0.06, -0.72);
    for (const s of [-1, 1]) {
      tilt(g, m.frame, 0.08, 0.08, 1.3, s * 0.45, 1.4, -0.1, -15);
      cyl(g, m.chrome, 0.025, 0.3, s * 0.62, 1.55, 0.35, "x");
      cyl(g, m.pad, 0.225, 0.045, s * 0.7, 1.55, 0.35, "x");
    }
  },
  smith(g, m) {
    box(g, m.frame, 2.2, 0.06, 1.7, 0, 0, 0);
    for (const x of [-0.95, 0.95]) for (const z of [-0.65, 0.65]) box(g, m.frame, 0.09, 2.25, 0.09, x, 0.05, z);
    for (const z of [-0.65, 0.65]) box(g, m.frame, 1.98, 0.09, 0.09, 0, 2.25, z);
    for (const x of [-0.8, 0.8]) box(g, m.chrome, 0.04, 2.15, 0.04, x, 0.06, 0.05);
    plates(g, m, 1.3, 0.05, 0.85);
  },
  cable(g, m) {
    box(g, m.frame, 1.8, 0.06, 1.0, 0, 0, 0);
    for (const x of [-0.7, 0.7]) {
      box(g, m.frame, 0.3, 2.2, 0.3, x, 0.06, -0.25);
      box(g, m.accent, 0.32, 1.7, 0.02, x, 0.3, -0.09);
      box(g, m.chrome, 0.05, 1.9, 0.05, x + (x < 0 ? 0.22 : -0.22), 0.15, 0);
    }
    box(g, m.frame, 1.7, 0.1, 0.1, 0, 2.25, -0.25);
  },
  rack(g, m) {
    box(g, m.timber, 1.0, 0.04, 1.5, 0, 0, 0.05);
    box(g, m.rubber, 0.3, 0.04, 1.5, -0.65, 0, 0.05);
    box(g, m.rubber, 0.3, 0.04, 1.5, 0.65, 0, 0.05);
    for (const x of [-0.6, 0.6]) for (const z of [-0.65, 0.35]) box(g, m.frame, 0.08, 2.25, 0.08, x, 0.04, z);
    for (const x of [-0.6, 0.6]) box(g, m.frame, 0.08, 0.08, 1.08, x, 2.25, -0.15);
    for (const z of [-0.65, 0.35]) box(g, m.frame, 1.28, 0.08, 0.08, 0, 2.25, z);
    box(g, m.accent, 1.2, 0.12, 0.02, 0, 2.05, 0.4);
    plates(g, m, 1.15, 0.38, 0.8);
  },
  bench(g, m) {
    box(g, m.frame, 0.4, 0.06, 1.3, 0, 0, 0);
    box(g, m.frame, 0.08, 0.38, 0.08, 0, 0.04, -0.4);
    box(g, m.frame, 0.08, 0.38, 0.08, 0, 0.04, 0.4);
    box(g, m.pad, 0.3, 0.07, 1.2, 0, 0.42, 0);
  },
  dbRack(g, m) {
    const len = 1.8;
    box(g, m.frame, len, 0.06, 0.7, 0, 0, 0);
    for (const x of [-len / 2 + 0.05, 0, len / 2 - 0.05]) box(g, m.frame, 0.06, 0.85, 0.6, x, 0, 0);
    for (let tier = 0; tier < 2; tier++) {
      const y = tier ? 0.85 : 0.52;
      const z = tier ? -0.12 : 0.15;
      box(g, m.frame, len, 0.04, 0.3, 0, y - 0.07, z);
      for (let i = 0; i < 7; i++) {
        const x = -len / 2 + 0.2 + i * 0.235;
        const r = 0.05 + (tier ? i : i + 7) * 0.003;
        for (const dz of [-0.09, 0.09]) cyl(g, i % 2 ? m.pad : m.accent, r, 0.07, x, y + r - 0.05, z + dz, "z");
      }
    }
  },
  barbellRack(g, m) {
    box(g, m.frame, 1.0, 0.05, 0.72, 0, 0, 0);
    for (const x of [-0.35, 0.35]) tilt(g, m.frame, 0.06, 1.3, 0.08, x, 0.68, 0, 12);
    for (let i = 0; i < 5; i++) {
      const y = 0.35 + i * 0.22;
      const z = 0.12 - i * 0.05;
      cyl(g, m.chrome, 0.014, 0.95, 0, y, z, "x");
      for (const s of [-1, 1]) cyl(g, i % 2 ? m.pad : m.accent, 0.09 + i * 0.012, 0.08, s * 0.42, y, z, "x");
    }
  },
  plateTree(g, m) {
    box(g, m.frame, 0.8, 0.05, 0.65, 0, 0, 0);
    box(g, m.frame, 0.1, 1.35, 0.1, 0, 0.05, 0);
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const y = 0.35 + Math.floor(i / 2) * 0.27;
      const r = [0.225, 0.225, 0.2, 0.17][Math.floor(i / 2)];
      cyl(g, m.chrome, 0.025, 0.24, 0, y + r - 0.2, side * 0.16, "z");
      for (let k = 0; k < 2; k++) cyl(g, i < 4 ? m.accent : m.pad, r, 0.05, 0, y + r - 0.2, side * (0.12 + k * 0.06), "z");
    }
  },
  storage(g, m) {
    for (const x of [-0.78, 0.78]) box(g, m.frame, 0.05, 1.55, 0.6, x, 0, 0);
    for (const y of [0.12, 0.62, 1.12, 1.52]) box(g, m.frameLight, 1.6, 0.03, 0.6, 0, y, 0);
    for (let i = 0; i < 8; i++) {
      const x = -0.6 + (i % 4) * 0.4;
      const y = i < 4 ? 0.15 : 0.65;
      add(g, new THREE.SphereGeometry(0.11, 16, 10), i % 2 ? m.pad : m.accent, x, y + 0.11, 0);
    }
    for (let i = 0; i < 4; i++) add(g, new THREE.SphereGeometry(0.15, 16, 10), i % 2 ? m.accent : m.pad, -0.55 + i * 0.37, 1.3, 0);
  },
  wall(g, m) {
    box(g, m.frame, 1.0, 0.9, 0.04, 0, 0.9, -0.05);
    for (let i = 0; i < 4; i++) box(g, i % 2 ? m.accent : m.pad, 0.05, 0.75, 0.05, -0.36 + i * 0.24, 0.95, 0.02);
  },
  box(g, m) {
    box(g, m.frameLight, 1.1, 1.1, 1.1, 0, 0, 0);
    box(g, m.accent, 1.12, 0.06, 1.12, 0, 1.0, 0);
  },
};

/** A model for `kind`, scaled to `fp`. Height is scaled more gently than the floor. */
export function buildModel(kind: ModelKind, fp: Footprint, m: Materials): THREE.Group {
  const inner = new THREE.Group();
  BUILDERS[kind](inner, m);
  const t = TYPICAL[kind];
  const sy = Math.min(1.4, Math.max(0.6, fp.h / t.h));
  inner.scale.set(fp.w / t.w, sy, fp.d / t.d);
  const outer = new THREE.Group();
  outer.add(inner);
  return outer;
}
