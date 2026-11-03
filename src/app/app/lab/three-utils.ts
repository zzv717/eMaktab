// 🧊 Uch o'lchamli sahna yordamchilari — Laboratoriya bo'limi uchun
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export interface SceneHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  dispose: () => void;
}

/** Canvas ichida toza 3D sahna yaratadi (yorug'lik + orbit kamera + resize). */
export function createScene(canvas: HTMLCanvasElement, opts?: { camZ?: number; bg?: string }): SceneHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts?.bg ?? "#e8eef4");
  // haqiqiy xona yorug'ligi — metall/shisha akslari real ko'rinadi
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  } catch {
    /* muhit kerak emas — oddiy yorug'lik yetarli */
  }

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  camera.position.set(0, 3, opts?.camZ ?? 7.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.56;
  controls.minDistance = 3;
  controls.maxDistance = 20;
  controls.target.set(0, 1, 0);
  // barmoq: 1 tasi = aylantirish, 2 tasi = yaqinlashtirish
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  canvas.style.touchAction = "none";

  const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa7b5, 0.85);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.65);
  key.position.set(6, 10, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe8ff, 0.45);
  fill.position.set(-7, 5, -5);
  scene.add(fill);

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  const dispose = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial;
        if (mat.map) mat.map.dispose();
        m.dispose();
      }
    });
    renderer.dispose();
  };

  return { scene, camera, renderer, controls, dispose };
}

/** Joystik/tugmalar uchun kamerani siljitish. */
/**
 * Kamerani (va nishonni) o'qlar bo'ylab KO'CHIRADI — joystick tugmalari uchun.
 * dy>0 — y o'qini TEPAGA ko'tarish; dx — chap/o'ng; dz — yaqin/uzoq (dolly).
 */
export function translateBy(handle: SceneHandle | null, dx: number, dy: number, dz: number) {
  if (!handle) return;
  const cam = handle.camera;
  const target = handle.controls.target;
  const forward = new THREE.Vector3().subVectors(target, cam.position);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const delta = new THREE.Vector3()
    .addScaledVector(right, dx)
    .add(new THREE.Vector3(0, dy, 0))
    .addScaledVector(forward, dz);
  cam.position.add(delta);
  target.add(delta);
  handle.controls.update();
}

export function orbitBy(
  handle: SceneHandle | null,
  opts: { dAz?: number; dPolar?: number; zoom?: number; reset?: boolean },
) {
  if (!handle) return;
  const { camera, controls } = handle;
  const target = controls.target;
  const off = camera.position.clone().sub(target);
  const sph = new THREE.Spherical().setFromVector3(off);
  if (opts.reset) {
    sph.set(10.5, Math.PI / 3.1, 0);
  } else {
    sph.theta += opts.dAz ?? 0;
    sph.phi = Math.max(0.25, Math.min(Math.PI * 0.55, sph.phi + (opts.dPolar ?? 0)));
    sph.radius = Math.max(controls.minDistance, Math.min(controls.maxDistance, sph.radius * (opts.zoom ?? 1)));
  }
  camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sph));
  camera.lookAt(target);
  controls.update();
}

export interface PointerOpts {
  /** tanlanuvchi obyektlar ildizlari */
  getRoots: () => THREE.Object3D[];
  /** siljitilayotgan obyekt (null = siljitish rejimi emas) */
  moveRef: { current: THREE.Object3D | null };
  /** bosilganda (siljitmasdan) — nomini ko'rsatish uchun (root, urilgan qism, hodisa) */
  onPick: (root: THREE.Object3D, hit: THREE.Object3D, ev: PointerEvent) => void;
  /** siljitish boshlanganda/tugaganda */
  onMoveEnd?: (root: THREE.Object3D) => void;
}

/**
 * Bosib tanlash + sudrab siljitish (qo'l bilan boshqarish).
 * - Qisqa bosish → onPick (obyekt nomi chiqadi)
 * - Siljitish rejimida sudrash → obyekt ish stolida ko'chadi
 */
export function attachPointer(handle: SceneHandle, canvas: HTMLCanvasElement, opts: PointerOpts) {
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let dragging = false;
  let downX = 0;
  let downY = 0;
  let moved = 0;
  const offset = new THREE.Vector3();

  const toNdc = (ev: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    ptr.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ptr.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ptr, handle.camera);
  };
  const pickBoth = (ev: PointerEvent): { root: THREE.Object3D | null; hit: THREE.Object3D | null } => {
    toNdc(ev);
    const hits = ray.intersectObjects(opts.getRoots(), true);
    if (hits.length === 0) return { root: null, hit: null };
    let o: THREE.Object3D | null = hits[0].object;
    while (o) {
      if (o.userData?.pickRoot) return { root: o.userData.pickRoot as THREE.Object3D, hit: hits[0].object };
      if (o.userData?.kind) return { root: o, hit: hits[0].object };
      o = o.parent;
    }
    return { root: null, hit: hits[0].object };
  };
  const pickRoot = (ev: PointerEvent): THREE.Object3D | null => pickBoth(ev).root;

  const onDown = (ev: PointerEvent) => {
    downX = ev.clientX;
    downY = ev.clientY;
    moved = 0;
    const { root, hit } = pickBoth(ev);
    // drag: obyektning istalgan qismidan (terminal, qopqoq) bossa ham siljiydi
    let onMoveTarget = root === opts.moveRef.current;
    if (!onMoveTarget && opts.moveRef.current && hit) {
      let o: THREE.Object3D | null = hit;
      while (o) {
        if (o === opts.moveRef.current) {
          onMoveTarget = true;
          break;
        }
        o = o.parent;
      }
    }
    const dragObj = opts.moveRef.current;
    if (dragObj && onMoveTarget) {
      dragging = true;
      // 🔒 obyekt siltayotganda KAMERA harakatlanmasligi uchun
      handle.controls.enabled = false;
      const hitPt = new THREE.Vector3();
      ray.ray.intersectPlane(plane, hitPt);
      offset.copy(dragObj.position).sub(hitPt);
      canvas.setPointerCapture(ev.pointerId);
    }
  };
  const onMove = (ev: PointerEvent) => {
    moved = Math.max(moved, Math.abs(ev.clientX - downX) + Math.abs(ev.clientY - downY));
    if (!dragging || !opts.moveRef.current) return;
    toNdc(ev);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) {
      opts.moveRef.current.position.x = THREE.MathUtils.clamp(hit.x + offset.x, -8.5, 8.5);
      opts.moveRef.current.position.z = THREE.MathUtils.clamp(hit.z + offset.z, -4.5, 5);
    }
  };
  const onUp = (ev: PointerEvent) => {
    if (dragging) {
      dragging = false;
      handle.controls.enabled = true; // 🔓 kamera qayta yoqiladi
      if (opts.moveRef.current) opts.onMoveEnd?.(opts.moveRef.current);
      return;
    }
    if (moved < 8) {
      const { root, hit } = pickBoth(ev);
      if (root && hit) opts.onPick(root, hit, ev);
    }
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  return () => {
    handle.controls.enabled = true;
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
  };
}

/** Shaffof shisha materiali (idishlar uchun). */
export function glassMaterial(color = "#cfe8f2", opacity = 0.28): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.08,
    metalness: 0,
    transmission: 0.6,
    thickness: 0.35,
    ior: 1.45,
    envMapIntensity: 1.2,
    side: THREE.DoubleSide,
  });
}

/** Suyuqlik materiali (ranglanuvchan). */
export function liquidMaterial(color: string): THREE.MeshStandardMaterial {
  // Muhim: transparent BO'LMSIN — transmission'li shisha shaffof narsalarni ko'rsatmaydi
  // (pastdan qaraganda idish bo'sh ko'rinardi). Endi suyuqlik har tomondan ko'rinadi.
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.18,
    metalness: 0.02,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.12,
    side: THREE.DoubleSide,
  });
}

/** Sopol stol yuzasi. */
export function benchTop(width = 14, depth = 9): THREE.Mesh {
  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.35, depth),
    new THREE.MeshStandardMaterial({ color: "#8a6a4c", roughness: 0.72, metalness: 0.05 }),
  );
  bench.position.y = -0.18;
  bench.receiveShadow = true;
  return bench;
}

/** Har bir kadrda chaqiriladigan yangilashlar ro'yxati. */
export type FrameHook = (t: number, dt: number) => void;

export function attachFrameHooks(handle: SceneHandle, hooks: FrameHook[]): () => void {
  let raf = 0;
  let prev = performance.now();
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    for (const h of hooks) h(now / 1000, dt);
  };
  tick();
  return () => cancelAnimationFrame(raf);
}
