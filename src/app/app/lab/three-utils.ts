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
/** 🏫 Laboratoriya xonasi — kafel pol, devorlar, derazalar, shkaf, lavabo, xavfsizlik jihozlari (protsedural). */
export function labRoom(): THREE.Group {
  const room = new THREE.Group();
  const tex = (w: number, h: number, draw: (c: THREE.CanvasTexture, ctx: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d")!;
    const t = new THREE.CanvasTexture(cv);
    draw(t, ctx);
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  // 🧱 kafel pol (protsedural)
  const floorTex = tex(512, 512, (_t, ctx) => {
    ctx.fillStyle = "#cdd5dd";
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const v = 198 + ((x * 7 + y * 13) % 16);
        ctx.fillStyle = `rgb(${v},${v + 7},${v + 14})`;
        ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      }
    }
    ctx.fillStyle = "rgba(120,132,145,0.85)";
    for (let i = 0; i <= 8; i++) {
      ctx.fillRect(i * 64 - 1.5, 0, 3, 512);
      ctx.fillRect(0, i * 64 - 1.5, 512, 3);
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(7, 5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.82, metalness: 0.04 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -3.2, 1); // pol ish stoli oyoqlari ostida
  floor.receiveShadow = true;
  room.add(floor);

  // 🧱 devorlar
  const wallMat = new THREE.MeshStandardMaterial({ color: "#e9eef3", roughness: 0.94 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(34, 11.6), wallMat);
  back.position.set(0, 2.6, -10.2);
  back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.PlaneGeometry(24, 11.6), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-17, 2.6, 1);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(24, 11.6), wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(17, 2.6, 1);
  room.add(back, left, right);

  // 🪟 derazalar (osmon rangli shisha + romlar)
  for (const wx of [-9.5, -2.5, 4.5, 11.5]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.4, 0.16), new THREE.MeshStandardMaterial({ color: "#5c6b7a", roughness: 0.5, metalness: 0.35 }));
    frame.position.set(wx, 2.4, -10.05);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 3.0), new THREE.MeshBasicMaterial({ color: "#bfe3f7" }));
    glass.position.set(wx, 2.4, -9.94);
    const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.0, 0.06), new THREE.MeshStandardMaterial({ color: "#5c6b7a" }));
    bar1.position.set(wx, 2.4, -9.9);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: "#5c6b7a" }));
    bar2.position.set(wx, 2.4, -9.9);
    room.add(frame, glass, bar1, bar2);
  }

  // 💡 shift + yoritish panellari
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), new THREE.MeshStandardMaterial({ color: "#f3f6f9", roughness: 0.96 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, 8.4, 1);
  room.add(ceil);
  for (const [lx, lz] of [[-8, -3], [8, -3], [-8, 5], [8, 5]] as Array<[number, number]>) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 1.5), new THREE.MeshStandardMaterial({ color: "#fff8e6", emissive: "#ffe9b8", emissiveIntensity: 0.85 }));
    panel.position.set(lx, 8.25, lz);
    room.add(panel);
    const pl = new THREE.PointLight(0xfff2d6, 22, 26, 2);
    pl.position.set(lx, 7.6, lz);
    room.add(pl);
  }

  // 🚪 eshik (o'ng devor)
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.4, 2.6), new THREE.MeshStandardMaterial({ color: "#8a6b4f", roughness: 0.6 }));
  doorFrame.position.set(16.9, -1.0, 5.5);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.1, 2.25), new THREE.MeshStandardMaterial({ color: "#b08968", roughness: 0.55 }));
  door.position.set(16.82, -1.15, 5.5);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 10), new THREE.MeshStandardMaterial({ color: "#d8c27a", metalness: 0.85, roughness: 0.25 }));
  handle.rotation.x = Math.PI / 2;
  handle.position.set(16.68, -1.1, 4.65);
  room.add(doorFrame, door, handle);

  // 🛟 xavfsizlik buyumlari
  const sign = (text: string, fg: string, bg: string, w = 1.9, h = 0.8) => {
    const t = tex(256, 110, (_ct, ctx) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 256, 110);
      ctx.fillStyle = fg;
      ctx.font = "bold 34px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 128, 55);
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
  };
  const exitSign = sign("CHIQISH ➜", "#ffffff", "#1f7a3d");
  exitSign.position.set(16.75, 3.4, 5.5);
  exitSign.rotation.y = -Math.PI / 2;
  room.add(exitSign);
  const warnSign = sign("⚠ EHTIYOT — KIMYO", "#3a2c00", "#ffd23e", 2.6, 0.85);
  warnSign.position.set(-13.5, 2.9, -10.05);
  room.add(warnSign);
  const labSign = sign("🧪 KIMYO · FIZIKA · BIOLOGIYA", "#0c3547", "#d7ecf5", 5.2, 0.9);
  labSign.position.set(-6, 4.35, -10.05);
  room.add(labSign);

  // 🔴 yong'in susishtirgichi
  const extingu = new THREE.Group();
  const extBody = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.95, 16), new THREE.MeshStandardMaterial({ color: "#c0392b", roughness: 0.35, metalness: 0.25 }));
  extBody.position.y = 0.48;
  const extTop = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.28, 10), new THREE.MeshStandardMaterial({ color: "#222" }));
  extTop.position.y = 1.08;
  const extHose = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 16, Math.PI * 1.25), new THREE.MeshStandardMaterial({ color: "#1c1c1c" }));
  extHose.position.set(0.16, 0.92, 0);
  extingu.add(extBody, extTop, extHose);
  extingu.position.set(-15.4, -3.2, -8.6);
  extingu.rotation.y = 0.5;
  extingu.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  room.add(extingu);

  // ⛑ birinchi yordam to'plami
  const aid = new THREE.Group();
  const aidBox = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.7, 0.22), new THREE.MeshStandardMaterial({ color: "#f4f6f8", roughness: 0.5 }));
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.03), new THREE.MeshStandardMaterial({ color: "#d3352b" }));
  crossV.position.z = 0.125;
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.03), new THREE.MeshStandardMaterial({ color: "#d3352b" }));
  crossH.position.z = 0.125;
  aid.add(aidBox, crossV, crossH);
  aid.position.set(-15.2, -0.2, -10.02);
  room.add(aid);

  // 🧹 chiqindi idishi
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.95, 18), new THREE.MeshStandardMaterial({ color: "#39434d", roughness: 0.6 }));
  bin.position.set(14.6, -2.72, -7.6);
  bin.castShadow = true;
  room.add(bin);

  // 🗄 shkaflar (devor bo'ylab)
  for (const cx of [-10.5, -6.2]) {
    const cab = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.7, 3.4, 1.35), new THREE.MeshStandardMaterial({ color: "#c9d3dc", roughness: 0.55 }));
    body.position.y = 1.7;
    body.castShadow = true;
    body.receiveShadow = true;
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(1.72, 3.1, 0.07), new THREE.MeshStandardMaterial({ color: "#aebfcd", roughness: 0.45, metalness: 0.15 }));
    doorL.position.set(-0.9, 1.7, 0.71);
    const doorR = doorL.clone();
    doorR.position.x = 0.9;
    const glassFront = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.15, 0.05), new THREE.MeshStandardMaterial({ color: "#8fb6c9", transparent: true, opacity: 0.55, roughness: 0.12, metalness: 0.2 }));
    glassFront.position.set(0, 2.55, 0.76);
    for (const hx of [-0.25, 0.25]) {
      const hd = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.09), new THREE.MeshStandardMaterial({ color: "#6c7a88", metalness: 0.7, roughness: 0.3 }));
      hd.position.set(hx, 1.6, 0.8);
      cab.add(hd);
    }
    cab.add(body, doorL, doorR, glassFront);
    cab.position.set(cx, -3.2, -9.1);
    room.add(cab);
  }

  // 🚰 lavabo + kran (o'ng tomon)
  const counter = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.05, 1.6), new THREE.MeshStandardMaterial({ color: "#b9c4cd", roughness: 0.5 }));
  counter.position.set(12.2, -2.67, -8.2);
  counter.castShadow = true;
  counter.receiveShadow = true;
  const basin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 1.0), new THREE.MeshStandardMaterial({ color: "#dde5eb", roughness: 0.25, metalness: 0.35 }));
  basin.position.set(12.2, -2.14, -8.2);
  const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.85, 10), new THREE.MeshStandardMaterial({ color: "#c6d0d8", metalness: 0.85, roughness: 0.2 }));
  faucet.position.set(12.2, -1.65, -8.85);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 10), faucet.material);
  spout.rotation.x = Math.PI / 2;
  spout.position.set(12.2, -1.28, -8.6);
  room.add(counter, basin, faucet, spout);

  return room;
}

export function createScene(canvas: HTMLCanvasElement, opts?: { camZ?: number; bg?: string; noRoom?: boolean }): SceneHandle {
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

  // 🏫 laboratoriya xonasi (barcha lablar uchun)
  if (!opts?.noRoom) scene.add(labRoom());

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

  // ⌨️ KLAVIATURA: WASD/стрелka = yurish, Shift = tez
  const keys = new Set<string>();
  const onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (keys.size) {
      const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 0.16 : 0.065;
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      const step = new THREE.Vector3();
      if (keys.has("KeyW") || keys.has("ArrowUp")) step.add(fwd);
      if (keys.has("KeyS") || keys.has("ArrowDown")) step.sub(fwd);
      if (keys.has("KeyA") || keys.has("ArrowLeft")) step.sub(right);
      if (keys.has("KeyD") || keys.has("ArrowRight")) step.add(right);
      if (step.lengthSq() > 0) {
        step.normalize().multiplyScalar(speed);
        camera.position.add(step);
        controls.target.add(step);
      }
    }
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  const dispose = () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
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
  /** 🧱 buyumlar faqat ish stol YUZASIDA harakatlansin (tepaga ko'tarilmaydi) — fizika uchun */
  flat?: boolean;
  /** 🖱 ustiga kelganda (hover) — nom ko'rsatish va yoritish uchun */
  onHover?: (root: THREE.Object3D | null) => void;
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
  let dragTarget: THREE.Object3D | null = null;
  const dragPlane = new THREE.Plane();
  const dragStart = new THREE.Vector3();
  const dragHit0 = new THREE.Vector3();
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
    dragging = false;
    dragTarget = null;
    const { root, hit } = pickBoth(ev);
    // 🟢 TERMINAL — sim ulash uchun saqlanadi (obyekt drag EMAS!)
    const isTerminal = hit?.userData?.kind === "terminal";
    let candidate: THREE.Object3D | null = null;
    if (!isTerminal) {
      if (opts.moveRef.current) {
        let o: THREE.Object3D | null = hit;
        while (o) {
          if (o === opts.moveRef.current) {
            candidate = opts.moveRef.current;
            break;
          }
          o = o.parent;
        }
      }
      if (!candidate && root && root.userData?.kind) {
        candidate = ((root.userData.pickRoot as THREE.Object3D | undefined) ?? root);
      }
    }
    if (candidate) {
      // obyekt ustidan bosilgan — kamera qimirlamaydi; drag 8px dan keyin boshlanadi
      dragTarget = candidate;
      handle.controls.enabled = false;
      canvas.setPointerCapture(ev.pointerId);
    }
  };
  const onMove = (ev: PointerEvent) => {
    moved = Math.max(moved, Math.abs(ev.clientX - downX) + Math.abs(ev.clientY - downY));
    if (!dragTarget) {
      onMoveHover(ev);
      return;
    }
    if (!dragging) {
      // ✋ 8px dan oldin qo'l qimirlasa ham — bu "bosish" (tap) bo'lib qoladi (sim ulash ishlaydi)
      if (moved < 8) return;
      dragging = true;
      dragPlane.setFromNormalAndCoplanarPoint(
        handle.camera.getWorldDirection(new THREE.Vector3()).negate(),
        dragTarget.position,
      );
      toNdc(ev);
      dragStart.copy(dragTarget.position);
      if (ray.ray.intersectPlane(dragPlane, dragHit0)) {
        // dragHit0 tayyor
      } else {
        dragHit0.copy(dragTarget.position);
      }
    }
    toNdc(ev);
    const hitPt = new THREE.Vector3();
    if (ray.ray.intersectPlane(dragPlane, hitPt)) {
      // 🖐 BARMoQ QAERDA BOLSA — obyekt OSHA YERDA (1:1, "tez qimirlash" yo'q)
      dragTarget.position.set(
        THREE.MathUtils.clamp(dragStart.x + (hitPt.x - dragHit0.x), -9.5, 9.5),
        opts.flat ? dragStart.y : THREE.MathUtils.clamp(dragStart.y + (hitPt.y - dragHit0.y), 0.15, 5.5),
        THREE.MathUtils.clamp(dragStart.z + (hitPt.z - dragHit0.z), -5, 5.5),
      );
    }
  };
  // 🖱 HOVER — ustiga kelganda obyekt YORITILADI + nom chiqadi
  const hoverMats = new Map<THREE.Mesh, { emissive: THREE.Color; intensity: number }>();
  let hoveredRoot: THREE.Object3D | null = null;
  const clearHover = () => {
    for (const [m, orig] of hoverMats) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat && mat.emissive) {
        mat.emissive.copy(orig.emissive);
        mat.emissiveIntensity = orig.intensity;
      }
    }
    hoverMats.clear();
    hoveredRoot = null;
    opts.onHover?.(null);
  };
  const applyHover = (root: THREE.Object3D) => {
    clearHover();
    hoveredRoot = root;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      const mat = m.material as THREE.MeshStandardMaterial | undefined;
      if (m.isMesh && mat && mat.emissive && !mat.transparent) {
        hoverMats.set(m, { emissive: mat.emissive.clone(), intensity: mat.emissiveIntensity });
        mat.emissive.lerp(new THREE.Color("#3ddc84"), 0.38);
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 0.3);
      }
    });
    opts.onHover?.(root);
  };
  const onMoveHover = (ev: PointerEvent) => {
    if (dragTarget) return;
    toNdc(ev);
    ray.setFromCamera(ptr, handle.camera);
    const hits = ray.intersectObjects(opts.getRoots(), true);
    let root: THREE.Object3D | null = null;
    if (hits.length) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData?.kind) o = o.parent;
      root = o;
    }
    if (root !== hoveredRoot) {
      if (root) applyHover(root);
      else clearHover();
    }
  };

  const onUp = (ev: PointerEvent) => {
    const wasDragging = dragging;
    const target = dragTarget;
    dragging = false;
    dragTarget = null;
    if (target) {
      handle.controls.enabled = true; // 🔓 kamera qayta yoqiladi
      if (wasDragging) {
        if (opts.moveRef.current) opts.onMoveEnd?.(opts.moveRef.current);
        return;
      }
    }
    if (moved < 8) {
      const { root, hit } = pickBoth(ev);
      if (root && hit) opts.onPick(root, hit, ev);
    }
  };
  // ⎋ ESC — siljitishni bekor qilish (obyekt joyiga qaytadi)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && dragTarget) {
      dragTarget.position.copy(dragStart);
      dragTarget = null;
      dragging = false;
      handle.controls.enabled = true;
    }
  };
  window.addEventListener("keydown", onKey);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  return () => {
    window.removeEventListener("keydown", onKey);
    clearHover();
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
export function benchTop(width = 14, depth = 9): THREE.Group {
  // 🪑 TO'LIQ ish stoli — yassi quti EMAS: yuza, qirra, ramka, 4 ta oyoq, pastki javon
  const g = new THREE.Group();
  const woodTop = new THREE.MeshStandardMaterial({ color: "#8a6a4c", roughness: 0.72, metalness: 0.05 });
  const woodDark = new THREE.MeshStandardMaterial({ color: "#6e5238", roughness: 0.78 });
  const metal = new THREE.MeshStandardMaterial({ color: "#46525f", metalness: 0.55, roughness: 0.42 });
  // stol yuza — yuqori qismi aynan y=0 (obyektlar shu yerda turadi)
  const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, depth), woodTop);
  top.position.y = -0.08;
  top.receiveShadow = true;
  top.castShadow = true;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.14, 0.1, depth + 0.14), woodDark);
  trim.position.y = -0.21;
  trim.receiveShadow = true;
  // yon ramka (apron)
  for (const sz of [-1, 1]) {
    const apron = new THREE.Mesh(new THREE.BoxGeometry(width - 0.9, 0.42, 0.09), woodDark);
    apron.position.set(0, -0.5, sz * (depth / 2 - 0.24));
    apron.castShadow = true;
    g.add(apron);
    const apronX = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, depth - 0.9), woodDark);
    apronX.position.set(sz * (width / 2 - 0.24), -0.5, 0);
    apronX.castShadow = true;
    g.add(apronX);
  }
  // 🦵 4 ta metall oyoq — polgacha (−3.2)
  const legH = 2.95;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, legH, 0.26), metal);
      leg.position.set(sx * (width / 2 - 0.5), -0.26 - legH / 2, sz * (depth / 2 - 0.5));
      leg.castShadow = true;
      // oyoq cho'ntagi (oyoq usti)
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.34), metal);
      foot.position.set(leg.position.x, -0.24 - legH, leg.position.z);
      g.add(leg, foot);
    }
  }
  // 📦 pastki javon
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(width - 1.15, 0.1, depth - 1.15), woodDark);
  shelf.position.y = -2.15;
  shelf.receiveShadow = true;
  shelf.castShadow = true;
  g.add(top, trim, shelf);
  return g;
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
