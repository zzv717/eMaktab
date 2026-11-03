// 🧊 Uch o'lchamli sahna yordamchilari — Laboratoriya bo'limi uchun
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts?.bg ?? "#eef2f7");

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 2.6, opts?.camZ ?? 7.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.56;
  controls.minDistance = 3;
  controls.maxDistance = 16;
  controls.target.set(0, 1, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.05);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(5, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe8ff, 0.5);
  fill.position.set(-6, 4, -4);
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
      for (const m of mats) m.dispose();
    });
    renderer.dispose();
  };

  return { scene, camera, renderer, controls, dispose };
}

/** Shaffof shisha materiali (idishlar uchun). */
export function glassMaterial(color = "#cfe8f2", opacity = 0.28): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.12,
    metalness: 0,
    transmission: 0.55,
    thickness: 0.4,
    side: THREE.DoubleSide,
  });
}

/** Suyuqlik materiali (ranglanuvchan). */
export function liquidMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.88,
    roughness: 0.25,
    metalness: 0.02,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.12,
  });
}

/** Sopol stol yuzasi. */
export function benchTop(width = 14, depth = 9): THREE.Mesh {
  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.35, depth),
    new THREE.MeshStandardMaterial({ color: "#8a6a4c", roughness: 0.75, metalness: 0.05 }),
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
