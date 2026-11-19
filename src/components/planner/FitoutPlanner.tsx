"use client";

// THE FITOUT PLANNER: lay a gym floor out with MasterKraft equipment and see it
// in bird's-eye, 3D and walk-in views, then send it to the design team.
//
// Everything here runs in the browser. The products (photo, price, assembled
// size) come from the page as props, read from the same catalogue the product
// pages use; a layout lives in the URL fragment (layout-code.ts), so sharing
// one needs no storage and nothing a visitor plans is sent anywhere until they
// choose to send the brief.
//
// three.js is driven imperatively from refs: React owns the room, the items and
// the selection, and two effects push those into the scene. Pointer handlers
// read the latest state through refs, so the scene is built once.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import FitoutBriefForm from "@/components/marketing/FitoutBriefForm";
import { track } from "@/lib/analytics";
import { PLANNER_GROUPS, type PlannerProduct } from "@/lib/planner-catalogue";
import { buildModel, makeMaterials, type Materials } from "./models";
import { decodeLayout, encodeLayout, type Layout, type PlacedItem } from "./layout-code";

type View = "bird" | "3d" | "eye";
type Tab = "All" | (typeof PLANNER_GROUPS)[number];

const WALL_H = 2.4;
const SNAP = 0.05;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
let nextId = 0;
const newId = () => `p${Date.now().toString(36)}${(nextId++).toString(36)}`;

/** Half-extents of a footprint rotated by `rot` degrees, as an axis-aligned box. */
function halfExtents(w: number, d: number, rot: number) {
  const r = THREE.MathUtils.degToRad(rot);
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { ex: (c * w + s * d) / 2, ez: (s * w + c * d) / 2 };
}

/** Items that sit outside the room or overlap another item. */
function clashes(items: PlacedItem[], room: Layout["room"], bySlug: Map<string, PlannerProduct>): Set<string> {
  const boxes = items.map((it) => {
    const p = bySlug.get(it.slug)!;
    const { ex, ez } = halfExtents(p.footprint.w, p.footprint.d, it.rot);
    return { id: it.id, x1: it.x - ex, x2: it.x + ex, z1: it.z - ez, z2: it.z + ez, wall: p.kind === "wall" };
  });
  const out = new Set<string>();
  const tol = 0.02;
  for (const b of boxes) {
    if (b.x1 < -tol || b.z1 < -tol || b.x2 > room.w + tol || b.z2 > room.d + tol) out.add(b.id);
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      // A wall rack hangs above the floor, so it may sit over a low item.
      if (a.wall || b.wall) continue;
      if (a.x1 < b.x2 - tol && b.x1 < a.x2 - tol && a.z1 < b.z2 - tol && b.z1 < a.z2 - tol) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  return out;
}

function fleckTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2c2c30";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() > 0.7 ? "rgba(239,83,80,0.55)" : "rgba(200,200,205,0.18)";
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4);
  }
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.lineWidth = 2;
  g.strokeRect(0, 0, 256, 256); // 1 m tile seam
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function numberSprite(n: number, selected: boolean): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = selected ? "#111113" : "#ef5350";
  g.beginPath();
  g.arc(48, 48, 44, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#fff";
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = "#fff";
  g.font = "700 46px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), 48, 51);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  return s;
}

function textSprite(text: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.fillRect(0, 8, 256, 48);
  g.fillStyle = "#111113";
  g.font = "600 30px ui-monospace, monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 9;
  return s;
}

type Scene3 = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  persp: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  controls: OrbitControls;
  orthoControls: OrbitControls;
  materials: Materials;
  roomGroup: THREE.Group;
  itemsGroup: THREE.Group;
  meshes: Map<string, { group: THREE.Group; slug: string; outline: THREE.Mesh; tag: THREE.Sprite }>;
  camera: THREE.Camera;
};

/** Point the camera for `view` at a room of `room` metres, centred on the origin. */
function fitCamera(t: Scene3, mount: HTMLElement, room: Layout["room"], view: View) {
  const { w, d } = room;
  const aspect = mount.clientWidth / Math.max(1, mount.clientHeight);
  if (view === "bird") {
    const half = Math.max(d / 2, w / 2 / aspect) * 1.15;
    Object.assign(t.ortho, { left: -half * aspect, right: half * aspect, top: half, bottom: -half, zoom: 1 });
    t.ortho.position.set(0, 50, 0);
    t.ortho.lookAt(0, 0, 0);
    t.ortho.updateProjectionMatrix();
    t.orthoControls.target.set(0, 0, 0);
    t.camera = t.ortho;
    t.controls.enabled = false;
    t.orthoControls.enabled = true;
    return;
  }
  t.camera = t.persp;
  t.controls.enabled = true;
  t.orthoControls.enabled = false;
  if (view === "eye") {
    t.persp.fov = 62;
    t.persp.position.set(-w * 0.32, 1.65, d * 0.46);
    t.controls.target.set(w * 0.1, 1.1, -d * 0.2);
  } else {
    t.persp.fov = 40;
    const span = Math.max(w, d) * Math.pow(Math.max(1, 1.45 / aspect), 0.85);
    t.persp.position.set(-span * 0.55, span * 1.05, span * 1.0);
    t.controls.target.set(0, 0, 0);
  }
  t.persp.updateProjectionMatrix();
}

/** A starting layout so the planner opens on a floor, not an empty box. */
function sampleLayout(products: PlannerProduct[]): Layout {
  // Prefer a product whose name says what it is, so the sample's "treadmill" is one.
  const pick = (kind: PlannerProduct["kind"]) =>
    products.find((p) => p.kind === kind && p.name.toLowerCase().includes(kind === "dbRack" ? "dumbbell" : kind)) ??
    products.find((p) => p.kind === kind);
  const items: PlacedItem[] = [];
  const put = (p: PlannerProduct | undefined, x: number, z: number, rot = 0) => {
    if (p) items.push({ id: newId(), slug: p.slug, x, z, rot });
  };
  const tread = pick("treadmill");
  [1.6, 2.8, 4.0].forEach((x) => put(tread, x, 1.4, 180));
  const bike = pick("bike");
  [5.2, 6.1].forEach((x) => put(bike, x, 1.1, 180));
  put(pick("rack"), 9.6, 2.2, 180);
  put(pick("dbRack"), 0.5, 6.0, 90);
  [2.2, 2.2].forEach((x, i) => put(pick("bench"), x, 5.2 + i * 1.6, 90));
  const stacks = products.filter((p) => p.kind === "stack").slice(0, 3);
  stacks.forEach((p, i) => put(p, 5.5 + i * 1.8, 7.6, 0));
  put(pick("cable"), 9.8, 6.0, 270);
  return { room: { w: 12, d: 9 }, items };
}

export default function FitoutPlanner({ products }: { products: PlannerProduct[] }) {
  const bySlug = useMemo(() => new Map(products.map((p) => [p.slug, p])), [products]);
  const [layout, setLayout] = useState<Layout>(() => ({ room: { w: 12, d: 9 }, items: [] }));
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("3d");
  const [tab, setTab] = useState<Tab>("All");
  const [query, setQuery] = useState("");
  const [shareNote, setShareNote] = useState("");
  const [brief, setBrief] = useState<{ key: number; message: string }>({ key: 0, message: "" });

  const mountRef = useRef<HTMLDivElement>(null);
  const three = useRef<Scene3 | null>(null);
  // The latest room and view, for the pointer handlers and resize observer the
  // scene effect sets up once. Declared first so they update before the effects
  // below run.
  const layoutRef = useRef(layout);
  const viewRef = useRef(view);
  useEffect(() => {
    layoutRef.current = layout;
    viewRef.current = view;
  }, [layout, view]);

  // Open the shared layout in the URL, or the sample. After hydration, because
  // the fragment exists only in the browser: rendering it on the first pass would
  // not match the server's HTML.
  useEffect(() => {
    const m = window.location.hash.match(/[#&]l=([\w-]+)/);
    const shared = m ? decodeLayout(m[1], new Set(bySlug.keys())) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayout(shared ?? sampleLayout(products));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clashing = useMemo(() => clashes(layout.items, layout.room, bySlug), [layout, bySlug]);
  const numberOf = useMemo(() => new Map(layout.items.map((it, i) => [it.id, i + 1])), [layout.items]);

  // ---------- scene setup (once) ----------
  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f4f5);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c8cc, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(-12, 26, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    const persp = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
    ortho.up.set(0, 0, -1);
    const controls = new OrbitControls(persp, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    const orthoControls = new OrbitControls(ortho, renderer.domElement);
    orthoControls.enableRotate = false;
    orthoControls.screenSpacePanning = true;
    orthoControls.enabled = false;

    const roomGroup = new THREE.Group();
    const itemsGroup = new THREE.Group();
    scene.add(roomGroup, itemsGroup);
    three.current = {
      renderer, scene, persp, ortho, controls, orthoControls,
      materials: makeMaterials(), roomGroup, itemsGroup, meshes: new Map(), camera: persp,
    };

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      persp.aspect = w / h;
      persp.updateProjectionMatrix();
      if (three.current) fitCamera(three.current, mount, layoutRef.current.room, viewRef.current);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    renderer.setAnimationLoop(() => {
      const t = three.current!;
      (t.camera === persp ? controls : orthoControls).update();
      renderer.render(scene, t.camera);
    });

    // ----- pointer: select, drag along the floor, click empty to deselect -----
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    let drag: { id: string; dx: number; dz: number; moved: boolean; sx: number; sy: number } | null = null;
    let downAt: { x: number; y: number } | null = null;

    const setRay = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, three.current!.camera);
    };
    const itemAt = (): string | null => {
      const t = three.current!;
      const hit = ray.intersectObjects(t.itemsGroup.children, true)[0];
      for (let o: THREE.Object3D | null = hit?.object ?? null; o; o = o.parent) if (o.userData.id) return o.userData.id;
      return null;
    };
    const floorAt = () => (ray.ray.intersectPlane(floorPlane, hitPoint) ? hitPoint.clone() : null);
    const origin = () => {
      const { w, d } = layoutRef.current.room;
      return { ox: -w / 2, oz: -d / 2 };
    };

    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
      setRay(e);
      const id = itemAt();
      if (!id) return;
      const p = floorAt();
      const it = layoutRef.current.items.find((i) => i.id === id);
      if (!p || !it) return;
      const { ox, oz } = origin();
      drag = { id, dx: it.x - (p.x - ox), dz: it.z - (p.z - oz), moved: false, sx: e.clientX, sy: e.clientY };
      controls.enabled = false;
      orthoControls.enabled = false;
      setSelected(id);
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      setRay(e);
      if (!drag) {
        if (e.pointerType === "mouse" && !e.buttons) renderer.domElement.style.cursor = itemAt() ? "grab" : "";
        return;
      }
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true;
      renderer.domElement.style.cursor = "grabbing";
      const p = floorAt();
      if (!p) return;
      const { ox, oz } = origin();
      const { w, d } = layoutRef.current.room;
      const id = drag.id;
      const x = clamp(snap(p.x - ox + drag.dx), 0, w);
      const z = clamp(snap(p.z - oz + drag.dz), 0, d);
      setLayout((l) => ({ ...l, items: l.items.map((i) => (i.id === id ? { ...i, x, z } : i)) }));
    };
    const onUp = (e: PointerEvent) => {
      const wasClick = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4;
      if (drag) {
        drag = null;
        renderer.domElement.style.cursor = "";
        if (viewRef.current === "bird") orthoControls.enabled = true;
        else controls.enabled = true;
      } else if (wasClick) {
        setRay(e);
        setSelected(itemAt());
      }
      downAt = null;
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);

    return () => {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      orthoControls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  // ---------- cameras ----------
  useEffect(() => {
    if (three.current && mountRef.current) fitCamera(three.current, mountRef.current, layout.room, view);
  }, [view, layout.room]);

  // ---------- room: floor, walls, dimensions ----------
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const { w, d } = layout.room;
    t.roomGroup.clear();
    const tex = fleckTexture();
    tex.repeat.set(w, d);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    t.roomGroup.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe9e9ec, roughness: 0.9 });
    const capMat = new THREE.MeshBasicMaterial({ color: 0x111113 });
    const T = 0.15;
    const walls: [number, number, number, number][] = [
      [0, -d / 2 - T / 2, w + 2 * T, T],
      [0, d / 2 + T / 2, w + 2 * T, T],
      [-w / 2 - T / 2, 0, T, d],
      [w / 2 + T / 2, 0, T, d],
    ];
    for (const [x, z, sx, sz] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, WALL_H, sz), wallMat);
      m.position.set(x, WALL_H / 2, z);
      m.castShadow = m.receiveShadow = true;
      t.roomGroup.add(m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.02, sz), capMat);
      cap.position.set(x, WALL_H + 0.01, z);
      t.roomGroup.add(cap);
    }
    const wl = textSprite(`${w.toFixed(1)} m`);
    wl.position.set(0, 0.3, d / 2 + 0.7);
    const dl = textSprite(`${d.toFixed(1)} m`);
    dl.position.set(w / 2 + 1.1, 0.3, 0);
    t.roomGroup.add(wl, dl);
  }, [layout.room]);

  // ---------- items ----------
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const { w, d } = layout.room;
    const live = new Set(layout.items.map((i) => i.id));
    for (const [id, m] of t.meshes) {
      if (!live.has(id)) {
        t.itemsGroup.remove(m.group);
        t.meshes.delete(id);
      }
    }
    for (const it of layout.items) {
      const p = bySlug.get(it.slug);
      if (!p) continue;
      let m = t.meshes.get(it.id);
      if (!m || m.slug !== it.slug) {
        if (m) t.itemsGroup.remove(m.group);
        const group = buildModel(p.kind, p.footprint, t.materials);
        group.userData.id = it.id;
        const outline = new THREE.Mesh(
          new THREE.PlaneGeometry(p.footprint.w, p.footprint.d),
          new THREE.MeshBasicMaterial({ color: 0xef5350, transparent: true, opacity: 0.18, depthWrite: false }),
        );
        outline.rotation.x = -Math.PI / 2;
        outline.position.y = 0.01;
        group.add(outline);
        const tag = numberSprite(0, false);
        group.add(tag);
        t.itemsGroup.add(group);
        m = { group, slug: it.slug, outline, tag };
        t.meshes.set(it.id, m);
      }
      m.group.position.set(it.x - w / 2, 0, it.z - d / 2);
      m.group.rotation.y = THREE.MathUtils.degToRad(-it.rot);
      const isSel = it.id === selected;
      const bad = clashing.has(it.id);
      const om = m.outline.material as THREE.MeshBasicMaterial;
      om.color.set(bad ? 0xd32f2f : isSel ? 0x111113 : 0xef5350);
      om.opacity = bad ? 0.45 : isSel ? 0.3 : 0.14;
      // Number above the model, upright whatever the rotation.
      const n = numberOf.get(it.id) ?? 0;
      const fresh = numberSprite(n, isSel);
      (m.tag.material as THREE.SpriteMaterial).map?.dispose();
      m.tag.material = fresh.material;
      m.tag.position.set(0, Math.max(1.2, p.footprint.h) + 0.5, 0);
      const s = isSel ? 0.75 : 0.5;
      m.tag.scale.set(s, s, 1);
    }
  }, [layout, selected, clashing, numberOf, bySlug]);

  // ---------- actions ----------
  const sel = layout.items.find((i) => i.id === selected) ?? null;
  const selProduct = sel ? bySlug.get(sel.slug) : undefined;

  const updateSel = (f: (i: PlacedItem) => PlacedItem | null) =>
    setLayout((l) => ({
      ...l,
      items: l.items.flatMap((i) => {
        if (i.id !== selected) return [i];
        const n = f(i);
        return n ? [n] : [];
      }),
    }));
  const rotate = (deg: number) => updateSel((i) => ({ ...i, rot: (((i.rot + deg) % 360) + 360) % 360 }));
  const remove = () => {
    updateSel(() => null);
    setSelected(null);
  };

  function freeSpot(p: PlannerProduct, items: PlacedItem[], room: Layout["room"]) {
    const test = (x: number, z: number) => {
      const it = { id: "_", slug: p.slug, x, z, rot: 0 };
      return !clashes([...items, it], room, bySlug).has("_");
    };
    const cx = room.w / 2;
    const cz = room.d / 2;
    for (let r = 0; r < Math.max(room.w, room.d); r += 0.5)
      for (let a = 0; a < 16; a++) {
        const x = snap(cx + Math.cos((a / 16) * Math.PI * 2) * r);
        const z = snap(cz + Math.sin((a / 16) * Math.PI * 2) * r);
        if (test(x, z)) return { x, z };
        if (r === 0) break;
      }
    return { x: cx, z: cz };
  }

  const addProduct = (p: PlannerProduct) => {
    const id = newId();
    setLayout((l) => {
      const { x, z } = freeSpot(p, l.items, l.room);
      return { ...l, items: [...l.items, { id, slug: p.slug, x, z, rot: 0 }] };
    });
    setSelected(id);
    track("planner_add", { item: p.code });
  };
  const duplicate = () => {
    if (!sel || !selProduct) return;
    const id = newId();
    setLayout((l) => {
      const { x, z } = freeSpot(selProduct, l.items, l.room);
      return { ...l, items: [...l.items, { ...sel, id, x, z }] };
    });
    setSelected(id);
  };

  // Keyboard: R rotates, Delete removes, Escape deselects. Not while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") setSelected(null);
      if (!selected) return;
      if (e.key === "r" || e.key === "R") rotate(e.shiftKey ? -15 : 90);
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const setRoom = (key: "w" | "d", value: number) => {
    if (!Number.isFinite(value)) return;
    const v = clamp(Math.round(value * 10) / 10, 3, 40);
    setLayout((l) => {
      const room = { ...l.room, [key]: v };
      return { room, items: l.items.map((i) => ({ ...i, x: clamp(i.x, 0, room.w), z: clamp(i.z, 0, room.d) })) };
    });
  };

  const shareUrl = () => {
    const url = new URL(window.location.href);
    url.hash = `l=${encodeLayout(layout)}`;
    return url.toString();
  };
  const copyLink = async () => {
    const url = shareUrl();
    window.history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied. Anyone with it sees this layout.");
    } catch {
      setShareNote("Your browser blocked copying. The link is now in the address bar.");
    }
    track("planner_share", { items: layout.items.length });
  };

  // ---------- summary ----------
  const lines = useMemo(() => {
    const m = new Map<string, { p: PlannerProduct; qty: number; numbers: number[] }>();
    layout.items.forEach((it, i) => {
      const p = bySlug.get(it.slug);
      if (!p) return;
      const row = m.get(p.slug) ?? { p, qty: 0, numbers: [] };
      row.qty += 1;
      row.numbers.push(i + 1);
      m.set(p.slug, row);
    });
    return [...m.values()];
  }, [layout.items, bySlug]);
  const total = lines.reduce((s, l) => s + (l.p.price > 0 ? l.p.price * l.qty : 0), 0);
  const poa = lines.filter((l) => l.p.price <= 0).length;
  const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

  const sendToTeam = () => {
    const url = shareUrl();
    window.history.replaceState(null, "", url);
    const message = [
      `My layout from the fitout planner: ${url}`,
      `Room: ${layout.room.w.toFixed(1)} m × ${layout.room.d.toFixed(1)} m`,
      "Equipment:",
      ...lines.map((l) => `- ${l.qty} × ${l.p.name} (${l.p.code})`),
    ].join("\n");
    setBrief((b) => ({ key: b.key + 1, message }));
    track("planner_send", { items: layout.items.length });
    requestAnimationFrame(() => document.getElementById("planner-brief")?.scrollIntoView({ behavior: "smooth" }));
  };

  // ---------- library ----------
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) => (tab === "All" || p.group === tab) && (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)),
    );
  }, [products, tab, query]);

  const viewBtn = (v: View, label: string) => (
    <button
      key={v}
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] ${view === v ? "bg-ink text-white" : "text-ink hover:bg-smoke"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Library */}
        <aside className="flex max-h-[78vh] min-w-0 flex-col border border-line bg-white" aria-label="Equipment library">
          <div className="border-b border-line p-3">
            <label htmlFor="planner-search" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ash">
              Add equipment
            </label>
            <input
              id="planner-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or code"
              className="mt-2 w-full border border-line px-3 py-2 text-sm focus:border-ink focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Category">
              {(["All", ...PLANNER_GROUPS] as Tab[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  aria-selected={tab === g}
                  onClick={() => setTab(g)}
                  className={`border px-2 py-1 text-xs ${tab === g ? "border-ink bg-ink text-white" : "border-line text-ink hover:border-ink"}`}
                >
                  {g === "Equipment Storage" ? "Storage" : g}
                </button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {shown.map((p) => (
              <li key={p.slug} className="flex items-center gap-3 p-2">
                <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden bg-smoke">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" loading="lazy" className="max-h-14 max-w-14 object-contain" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink" title={p.name}>
                    {p.name}
                  </p>
                  <p className="text-xs text-ash">
                    {p.footprint.w.toFixed(2)} × {p.footprint.d.toFixed(2)} m{p.measured ? "" : " (typical)"} · {p.priceLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => addProduct(p)}
                  className="shrink-0 border border-ink px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink hover:bg-ink hover:text-white"
                  aria-label={`Add ${p.name}`}
                >
                  Add
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="p-4 text-sm text-ash">Nothing matches that search.</li>}
          </ul>
        </aside>

        {/* Canvas */}
        <section className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <div className="inline-flex border border-line bg-white" role="group" aria-label="View">
              {viewBtn("bird", "Bird's-eye")}
              {viewBtn("3d", "3D")}
              {viewBtn("eye", "Walk-in")}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="room-w" className="text-ash">Room</label>
              <input
                id="room-w"
                type="number"
                min={3}
                max={40}
                step={0.1}
                value={layout.room.w}
                onChange={(e) => setRoom("w", parseFloat(e.target.value))}
                className="w-20 border border-line px-2 py-1.5"
                aria-label="Room width in metres"
              />
              <span className="text-ash">×</span>
              <input
                id="room-d"
                type="number"
                min={3}
                max={40}
                step={0.1}
                value={layout.room.d}
                onChange={(e) => setRoom("d", parseFloat(e.target.value))}
                className="w-20 border border-line px-2 py-1.5"
                aria-label="Room depth in metres"
              />
              <span className="text-ash">m · {(layout.room.w * layout.room.d).toFixed(1)} m²</span>
            </div>
          </div>
          <div className="relative">
            <div ref={mountRef} className="h-[62vh] min-h-[380px] w-full border border-line" />
            {sel && selProduct && (
              <div className="absolute right-3 top-3 w-[min(300px,calc(100%-24px))] border border-line bg-white p-3 shadow-lg">
                <div className="flex items-start gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">
                    {numberOf.get(sel.id)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight text-ink">{selProduct.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ash">{selProduct.code}</p>
                  </div>
                  <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="text-lg leading-none text-ash hover:text-ink">
                    ×
                  </button>
                </div>
                {selProduct.image && (
                  <div className="mt-2 grid h-32 place-items-center bg-smoke">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selProduct.image} alt={selProduct.name} className="max-h-28 max-w-full object-contain" />
                  </div>
                )}
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-ash">Size</dt>
                  <dd className="text-ink">
                    {selProduct.assembledSize && selProduct.measured
                      ? selProduct.assembledSize
                      : `${selProduct.footprint.w.toFixed(2)} × ${selProduct.footprint.d.toFixed(2)} m, typical (size not published)`}
                  </dd>
                  {selProduct.netWeight && (
                    <>
                      <dt className="text-ash">Weight</dt>
                      <dd className="text-ink">{selProduct.netWeight}</dd>
                    </>
                  )}
                  <dt className="text-ash">Price</dt>
                  <dd className="text-ink">{selProduct.priceLabel}</dd>
                </dl>
                {clashing.has(sel.id) && (
                  <p className="mt-2 text-xs font-medium text-[#d32f2f]">Overlaps another item or the wall. Drag it clear.</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[
                    ["Rotate 90°", () => rotate(90)],
                    ["Rotate 15°", () => rotate(15)],
                    ["Duplicate", duplicate],
                    ["Remove", remove],
                  ].map(([label, fn]) => (
                    <button
                      key={label as string}
                      type="button"
                      onClick={fn as () => void}
                      className="border border-line px-2 py-1 text-xs text-ink hover:border-ink"
                    >
                      {label as string}
                    </button>
                  ))}
                </div>
                <a href={`/product/${selProduct.slug}`} target="_blank" rel="noopener" className="mt-3 inline-block text-xs font-medium text-accent-600 underline">
                  View product
                </a>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-ash">
            Drag equipment to move it. Select an item to rotate (R), duplicate or remove (Delete) it. Drag empty floor to orbit;
            scroll or pinch to zoom. Red footprints overlap or cross a wall.
          </p>

          {/* Summary */}
          <div className="mt-4 border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ash">
                Your layout · {layout.items.length} item{layout.items.length === 1 ? "" : "s"}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyLink} className="btn btn-out text-ink !px-4 !py-2.5">
                  Copy share link
                </button>
                <button type="button" onClick={sendToTeam} disabled={!layout.items.length} className="btn btn-accent !px-4 !py-2.5 disabled:opacity-50">
                  Send to our design team
                </button>
              </div>
            </div>
            {shareNote && <p className="border-b border-line px-3 py-2 text-xs text-ink" role="status">{shareNote}</p>}
            {lines.length === 0 ? (
              <p className="p-3 text-sm text-ash">Add equipment from the library to start your floor.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-line">
                  {lines.map((l) => (
                    <tr key={l.p.slug}>
                      <td className="px-3 py-2 font-mono text-xs text-ash">{l.numbers.join(", ")}</td>
                      <td className="px-3 py-2 text-ink">
                        <a href={`/product/${l.p.slug}`} target="_blank" rel="noopener" className="hover:underline">
                          {l.p.name}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ash">× {l.qty}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink">
                        {l.p.price > 0 ? money(l.p.price * l.qty) : "On application"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line">
                    <td colSpan={3} className="px-3 py-2 text-ash">
                      Indicative equipment total, inc. GST{poa ? ` (+ ${poa} line${poa === 1 ? "" : "s"} on application)` : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{money(total)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </section>
      </div>

      <div id="planner-brief" className="mt-12 scroll-mt-24">
        <h2 className="text-2xl text-ink">Send it to our design team</h2>
        <p className="mt-2 max-w-2xl text-sm text-ash">
          Tell us about the space and we&rsquo;ll come back within one business day with a 3D concept and an indicative price.
          {brief.message ? " Your layout link and equipment list are already in the message." : ""}
        </p>
        <div className="mt-6">
          <FitoutBriefForm key={brief.key} initialMessage={brief.message} />
        </div>
      </div>
    </div>
  );
}
