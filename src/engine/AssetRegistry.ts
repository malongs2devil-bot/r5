import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { AssetOverrideDoc, ClassId } from '../types/game';
import { assetManifest } from './AssetManifestManager';

const IDB_NAME = 'TanTheKyNguyen3DAssets';
const IDB_STORE = 'glb_blobs';

function openAssetDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalGlbBuffer(slotKey: string, buffer: ArrayBuffer): Promise<string> {
  const db = await openAssetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(buffer, slotKey);
    tx.oncomplete = () => resolve(`idb://${slotKey}`);
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadLocalGlbBuffer(slotKey: string): Promise<ArrayBuffer | null> {
  const db = await openAssetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(slotKey);
    req.onsuccess = () => resolve((req.result as ArrayBuffer) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLocalGlbBuffer(slotKey: string): Promise<void> {
  const db = await openAssetDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(slotKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Downloads arbitrary large binary 3D assets (.fbx, .glb, .obj) in 8MB chunks using HTTP Range headers,
 * completely avoiding Cloud Run's 32MB single HTTP response payload limit (which otherwise yields HTTP 500),
 * and caches the assembled ArrayBuffer in IndexedDB for instant 0ms offline loads.
 */
export async function fetchBufferWithChunking(url: string, slotKey?: string): Promise<ArrayBuffer> {
  // 1. Check IndexedDB cache first
  if (slotKey) {
    try {
      const cached = await loadLocalGlbBuffer(slotKey);
      if (cached && cached.byteLength > 100) {
        return cached;
      }
    } catch {}
  }

  const urlCleanKey = `url_${url.split('?')[0].split('#')[0]}`;
  try {
    const urlCached = await loadLocalGlbBuffer(urlCleanKey);
    if (urlCached && urlCached.byteLength > 100) {
      return urlCached;
    }
  } catch {}

  // 2. Query file size from /api/assets/info or HEAD request
  let totalSize = 0;
  try {
    const infoResp = await fetch(`/api/assets/info?url=${encodeURIComponent(url)}`);
    if (infoResp.ok) {
      const info = await infoResp.json();
      if (typeof info.size === 'number' && info.size > 0) {
        totalSize = info.size;
      }
    }
  } catch {}

  if (!totalSize) {
    try {
      const headResp = await fetch(url, { method: 'HEAD' });
      const lenHeader = headResp.headers.get('content-length');
      if (lenHeader) {
        totalSize = parseInt(lenHeader, 10);
      }
    } catch {}
  }

  // 3. For small files <= 15MB, try direct fetch first
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB per chunk
  if (totalSize > 0 && totalSize <= 15 * 1024 * 1024) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        if (slotKey) saveLocalGlbBuffer(slotKey, buf).catch(() => {});
        saveLocalGlbBuffer(urlCleanKey, buf).catch(() => {});
        return buf;
      }
    } catch {}
  }

  // 4. Large file or probe Range support
  if (!totalSize) {
    try {
      const probe = await fetch(url, { headers: { Range: 'bytes=0-0' } });
      const cr = probe.headers.get('content-range');
      if (cr) {
        const match = cr.match(/\/(\d+)$/);
        if (match) totalSize = parseInt(match[1], 10);
      }
    } catch {}
  }

  if (!totalSize) {
    // Fallback direct fetch if server doesn't report size
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} khi tải ${url}`);
    const buf = await resp.arrayBuffer();
    if (slotKey) saveLocalGlbBuffer(slotKey, buf).catch(() => {});
    saveLocalGlbBuffer(urlCleanKey, buf).catch(() => {});
    return buf;
  }

  // 5. Download in 8MB chunks using HTTP Range requests
  const numChunks = Math.ceil(totalSize / CHUNK_SIZE);
  const targetBuffer = new Uint8Array(totalSize);

  for (let i = 0; i < numChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(totalSize - 1, start + CHUNK_SIZE - 1);
    const rangeHeader = `bytes=${start}-${end}`;

    const resp = await fetch(url, {
      headers: {
        Range: rangeHeader,
      },
    });

    if (resp.status !== 206 && resp.status !== 200) {
      throw new Error(`Mảnh ${i + 1}/${numChunks} tải thất bại với HTTP ${resp.status}`);
    }

    const chunkArrayBuf = await resp.arrayBuffer();
    targetBuffer.set(new Uint8Array(chunkArrayBuf), start);
  }

  const finalBuffer = targetBuffer.buffer;
  // Cache in IndexedDB for 0ms subsequent loads!
  if (slotKey) saveLocalGlbBuffer(slotKey, finalBuffer).catch(() => {});
  saveLocalGlbBuffer(urlCleanKey, finalBuffer).catch(() => {});

  return finalBuffer;
}

export interface LoadedCustomAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  override: AssetOverrideDoc;
}

export interface MapObjectPlacement {
  id: string;
  mapId: number;
  slotKey: string;
  x: number;
  z: number;
  scale: number;
  rotationY: number;
}


function normalizeBoneKey(name: string): string {
  return name
    .replace(/^.*\|/, '')
    .replace(/^mixamorig:?/i, '')
    .replace(/^bip001[_\s-]*/i, '')
    .replace(/^armature[_\s-]*/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function isRootOrHipsNode(leafNode: string, normKey: string): boolean {
  if (!normKey) return true;
  if (/^(hips|pelvis|root|origin|center|character|armature|bip|waist)$/i.test(normKey)) {
    return true;
  }
  return /hips|pelvis|root|armature|bip001/i.test(leafNode);
}

/**
 * Locks horizontal X/Z root-motion translation on root/hips/pelvis bones to frame-0 values
 * while preserving vertical Y bounce, preventing skeletal clips from snapping the 3D mesh back
 * when looping or transitioning to idle while the server controls world (x, z) coordinates.
 */
function lockHorizontalRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  for (const track of clip.tracks) {
    const dotIdx = track.name.lastIndexOf('.');
    if (dotIdx <= 0) continue;
    const rawNodePath = track.name.slice(0, dotIdx);
    const propName = track.name.slice(dotIdx + 1);
    if (propName !== 'position') continue;
    const leafNode = rawNodePath.split('/').pop() || rawNodePath;
    const norm = normalizeBoneKey(leafNode);
    if (!isRootOrHipsNode(leafNode, norm)) continue;

    const vals = track.values;
    if (vals.length >= 3) {
      const baseX = vals[0];
      const baseZ = vals[2];
      for (let i = 0; i < vals.length; i += 3) {
        vals[i] = baseX;
        vals[i + 2] = baseZ;
      }
    }
  }
  return clip;
}

function retargetClipToRoot(
  clip: THREE.AnimationClip,
  targetRoot: THREE.Object3D | null,
  forcedName: string
): THREE.AnimationClip {
  const cloned = clip.clone();
  cloned.name = forcedName;
  if (!targetRoot) return lockHorizontalRootMotion(cloned);

  const exactNames = new Set<string>();
  const normalizedMap = new Map<string, string>();

  targetRoot.traverse((node) => {
    if (node.name) {
      exactNames.add(node.name);
      const norm = normalizeBoneKey(node.name);
      if (norm && !normalizedMap.has(norm)) {
        normalizedMap.set(norm, node.name);
      }
    }
  });

  if (exactNames.size === 0) return lockHorizontalRootMotion(cloned);

  const keptTracks: THREE.KeyframeTrack[] = [];
  for (const track of cloned.tracks) {
    const dotIdx = track.name.lastIndexOf('.');
    if (dotIdx <= 0) {
      keptTracks.push(track);
      continue;
    }
    const rawNodePath = track.name.slice(0, dotIdx);
    const propName = track.name.slice(dotIdx + 1);
    const leafNode = rawNodePath.split('/').pop() || rawNodePath;
    if (exactNames.has(leafNode) || exactNames.has(rawNodePath)) {
      keptTracks.push(track);
      continue;
    }

    const norm = normalizeBoneKey(leafNode);
    const mappedTarget = normalizedMap.get(norm);
    if (mappedTarget) {
      // Drop cross-skeleton root/hips translation tracks to avoid cm-vs-meter scale spikes
      if (propName === 'position' && isRootOrHipsNode(leafNode, norm)) {
        continue;
      }
      track.name = `${mappedTarget}.${propName}`;
      keptTracks.push(track);
    }
  }

  cloned.tracks = keptTracks;
  return lockHorizontalRootMotion(cloned);
}

/**
 * Parses Godot (.tscn / .tres), JSON (.json / .vfx), or Unity/Effekseer scene descriptors
 * to extract authored colors, emission, particle count, lifetime, and mesh primitives,
 * building a real multi-layered animated Three.js 3D VFX Group + AnimationClip!
 */
function buildParsedSceneVfxAsset(rawText: string, slotKey: string): {
  root: THREE.Group;
  animations: THREE.AnimationClip[];
} {
  const colors: THREE.Color[] = [];

  // 1. Extract Godot Color(r, g, b, a) definitions
  const godotColorRegex = /Color\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = godotColorRegex.exec(rawText)) !== null) {
    const r = Math.min(1, Math.max(0, parseFloat(match[1]) || 0));
    const g = Math.min(1, Math.max(0, parseFloat(match[2]) || 0));
    const b = Math.min(1, Math.max(0, parseFloat(match[3]) || 0));
    // Skip pure black/grey background colors
    if (r + g + b > 0.25) {
      colors.push(new THREE.Color(r, g, b));
    }
  }

  // 2. Extract hex colors (#rrggbb) if present in JSON/VFX
  const hexRegex = /#([0-9a-fA-F]{6})\b/g;
  while ((match = hexRegex.exec(rawText)) !== null) {
    colors.push(new THREE.Color(`#${match[1]}`));
  }

  // Fallback vibrant VFX palette seeded by slotKey if file has binary/minimal color tokens
  if (colors.length === 0) {
    if (/ice|frost|crystal|razor|shard/i.test(slotKey)) {
      colors.push(new THREE.Color('#38bdf8'), new THREE.Color('#bae6fd'));
    } else if (/acid|bio|twin|phantom|apex/i.test(slotKey)) {
      colors.push(new THREE.Color('#10b981'), new THREE.Color('#6ee7b7'));
    } else if (/gravity|blink|void|psionic/i.test(slotKey)) {
      colors.push(new THREE.Color('#a855f7'), new THREE.Color('#f0abfc'));
    } else {
      colors.push(new THREE.Color('#f97316'), new THREE.Color('#fde047'));
    }
  }

  const primaryCol = colors[0];
  const secondaryCol = colors[1] || primaryCol.clone().offsetHSL(0.06, 0.1, 0.18);

  const amountMatch = rawText.match(/amount\s*=\s*(\d+)/i);
  const particleCount = amountMatch
    ? Math.max(8, Math.min(36, parseInt(amountMatch[1], 10)))
    : 18;

  const lifeMatch = rawText.match(/lifetime\s*=\s*([0-9.]+)/i);
  const clipDuration = lifeMatch
    ? Math.max(0.55, Math.min(2.4, parseFloat(lifeMatch[1]) || 1.0))
    : 0.95;

  const hasCylinderBeam = /CylinderMesh|beam|laser|pillar|tornado/i.test(rawText);
  const hasTorusWave = /TorusMesh|ring|shockwave|wave|aura/i.test(rawText);
  const hasSlashArc = /slash|cleave|blade|sword|crescent/i.test(rawText) || /cleave|fang|blade/i.test(slotKey);

  const root = new THREE.Group();
  const corePivot = new THREE.Group();
  corePivot.name = 'vfx_core_pivot';
  corePivot.position.y = 0.9;
  root.add(corePivot);

  const coreMat = new THREE.MeshBasicMaterial({
    color: secondaryCol,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const outerMat = new THREE.MeshBasicMaterial({
    color: primaryCol,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Central Energy Core
  const coreSphere = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 1), coreMat);
  corePivot.add(coreSphere);

  // Shockwave Rings
  const ringCount = hasTorusWave ? 3 : 2;
  for (let r = 0; r < ringCount; r++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.65 + r * 0.34, 0.055 - r * 0.01, 10, 32),
      r === 0 ? coreMat : outerMat
    );
    ring.rotation.x = r === 0 ? Math.PI / 2 : Math.PI / 3 * (r % 2 === 0 ? 1 : -1);
    ring.rotation.y = r * 0.7;
    corePivot.add(ring);
  }

  if (hasCylinderBeam) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.62, 2.6, 16, 1, true),
      outerMat
    );
    pillar.position.y = 0.35;
    corePivot.add(pillar);
  }

  if (hasSlashArc) {
    const crescent = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 1.32, 28, 1, 0, Math.PI * 1.25),
      coreMat
    );
    crescent.rotation.x = Math.PI / 2.2;
    corePivot.add(crescent);
  }

  // Orbiting Burst Shards
  const shardGeo = new THREE.ConeGeometry(0.09, 0.42, 5);
  for (let i = 0; i < particleCount; i++) {
    const shard = new THREE.Mesh(shardGeo, i % 2 === 0 ? coreMat : outerMat);
    const theta = (i / particleCount) * Math.PI * 2;
    const elev = ((i % 5) - 2) * 0.24;
    const rad = 0.55 + (i % 3) * 0.28;
    shard.position.set(Math.cos(theta) * rad, elev, Math.sin(theta) * rad);
    shard.lookAt(Math.cos(theta) * rad * 2, elev * 1.5, Math.sin(theta) * rad * 2);
    shard.rotateX(Math.PI / 2);
    corePivot.add(shard);
  }

  // Keyframe AnimationClip for the parsed VFX
  const times = [0, clipDuration * 0.3, clipDuration * 0.75, clipDuration];
  const scaleTrack = new THREE.VectorKeyframeTrack(
    'vfx_core_pivot.scale',
    times,
    [0.25, 0.25, 0.25, 1.25, 1.25, 1.25, 1.48, 1.48, 1.48, 0.08, 0.08, 0.08]
  );
  const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
  const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.75);
  const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 1.5);
  const q3 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 2.0);
  const rotTrack = new THREE.QuaternionKeyframeTrack(
    'vfx_core_pivot.quaternion',
    times,
    [
      q0.x, q0.y, q0.z, q0.w,
      q1.x, q1.y, q1.z, q1.w,
      q2.x, q2.y, q2.z, q2.w,
      q3.x, q3.y, q3.z, q3.w,
    ]
  );

  const clip = new THREE.AnimationClip('vfx_play', clipDuration, [scaleTrack, rotTrack]);
  root.userData.isParsedVfx = true;
  return { root, animations: [clip] };
}

class AssetRegistryManager {
  private overrides = new Map<string, AssetOverrideDoc>();
  private parsedCache = new Map<
    string,
    { urlSig: string; scene: THREE.Group; animations: THREE.AnimationClip[]; videoEl?: HTMLVideoElement }
  >();
  private loadingPromises = new Map<string, { promise: Promise<void>; urlSig: string }>();
  private listeners = new Set<() => void>();
  private gltfLoader: GLTFLoader;
  private ktx2Loader: KTX2Loader;
  private fbxLoader: FBXLoader;
  private objLoader: OBJLoader;
  private texLoader: THREE.TextureLoader;

  constructor() {
    this.gltfLoader = new GLTFLoader();
    
    // Initialize KTX2Loader
    this.ktx2Loader = new KTX2Loader();
    // Basis transcoder path
    this.ktx2Loader.setTranscoderPath('https://threejs.org/examples/jsm/libs/basis/');
    
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this.gltfLoader.setDRACOLoader(draco);
    // Configure GLTFLoader with KTX2Loader
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);

    // Auto-sync with manifest when loaded
    assetManifest.subscribe(() => this.syncFromManifest());

    this.fbxLoader = new FBXLoader();
    this.objLoader = new OBJLoader();
    this.texLoader = new THREE.TextureLoader();
  }

  private async syncFromManifest() {
    const overrides = assetManifest.getOverrides();
    if (overrides.length > 0) {
      await this.mergeServerManifest(overrides);
    }
  }

  public detectSoftwareGl(): boolean {
    if (typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  private customMapPlacements: MapObjectPlacement[] = [];

  private loadPlacements() {
    try {
      const saved = localStorage.getItem('tanthe_custom_map_placements');
      if (saved) {
        this.customMapPlacements = JSON.parse(saved);
      }
    } catch {}
  }

  public getMapPlacements(mapId: number): MapObjectPlacement[] {
    if (this.customMapPlacements.length === 0) {
      this.loadPlacements();
    }
    return this.customMapPlacements.filter((p) => p.mapId === mapId);
  }

  public saveMapPlacement(placement: MapObjectPlacement): void {
    this.loadPlacements();
    const idx = this.customMapPlacements.findIndex((p) => p.id === placement.id);
    if (idx >= 0) {
      this.customMapPlacements[idx] = placement;
    } else {
      this.customMapPlacements.push(placement);
    }
    try {
      localStorage.setItem('tanthe_custom_map_placements', JSON.stringify(this.customMapPlacements));
    } catch {}
    this.notify();
  }

  public deleteMapPlacement(id: string): void {
    this.loadPlacements();
    this.customMapPlacements = this.customMapPlacements.filter((p) => p.id !== id);
    try {
      localStorage.setItem('tanthe_custom_map_placements', JSON.stringify(this.customMapPlacements));
    } catch {}
    this.notify();
  }

  public getAllOverrides(): AssetOverrideDoc[] {
    return Array.from(this.overrides.values());
  }

  public getOverride(slotKey: string): AssetOverrideDoc | undefined {
    return this.overrides.get(slotKey);
  }

  public getIconUrl(slotKey: string): string | null {
    const ov = this.overrides.get(slotKey);
    if (!ov || !ov.modelUrl || ov.modelUrl.startsWith('idb://')) return null;
    const ext = this.getCleanExtension(ov.modelUrl);
    if (
      ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.apng', '.bmp'].includes(ext)
    ) {
      return ov.modelUrl;
    }
    return null;
  }

  public getCharacterPortraitUrl(classId: ClassId): string | null {
    const direct = this.getIconUrl(`portrait_${classId}`);
    if (direct) return direct;
    const classAsset = this.getIconUrl(`class_${classId}`);
    if (classAsset) return classAsset;
    return null;
  }

  private hasUsableContent(d: AssetOverrideDoc | undefined | null): d is AssetOverrideDoc {
    if (!d || !d.slotKey) return false;
    return Boolean(d.modelUrl || (d.actions && Object.keys(d.actions).length > 0));
  }

  public async syncOverrides(docs: AssetOverrideDoc[]): Promise<void> {
    const incomingKeys = new Set<string>();
    for (const d of docs) {
      if (!this.hasUsableContent(d)) continue;
      incomingKeys.add(d.slotKey);
      this.overrides.set(d.slotKey, d);
    }
    for (const [k, existing] of this.overrides.entries()) {
      if (!incomingKeys.has(k) && !existing.modelUrl.startsWith('idb://')) {
        this.overrides.delete(k);
        this.parsedCache.delete(k);
      }
    }

    await Promise.all(Array.from(this.overrides.values()).map((d) => this.preloadSlot(d)));
    this.notify();
  }

  public async mergeServerManifest(serverDocs: AssetOverrideDoc[]): Promise<void> {
    const nextMap = new Map<string, AssetOverrideDoc>();
    for (const [k, v] of this.overrides.entries()) {
      if (!v.id.startsWith('srv_asset_')) {
        nextMap.set(k, v);
      }
    }
    for (const sd of serverDocs) {
      if (this.hasUsableContent(sd)) {
        nextMap.set(sd.slotKey, sd);
      }
    }
    this.overrides = nextMap;
    await Promise.all(Array.from(this.overrides.values()).map((d) => this.preloadSlot(d)));
    this.notify();
  }

  public async setOverrideRuntime(doc: AssetOverrideDoc): Promise<void> {
    this.parsedCache.delete(doc.slotKey);
    this.overrides.set(doc.slotKey, doc);
    await this.preloadSlot(doc);
    this.notify();
  }

  public removeOverrideRuntime(slotKey: string) {
    const cached = this.parsedCache.get(slotKey);
    if (cached?.videoEl) {
      cached.videoEl.pause();
      cached.videoEl.src = '';
    }
    this.overrides.delete(slotKey);
    this.parsedCache.delete(slotKey);
    this.notify();
  }

  private getCleanExtension(url: string): string {
    const clean = url.split('?')[0].split('#')[0].toLowerCase();
    const dot = clean.lastIndexOf('.');
    return dot >= 0 ? clean.slice(dot) : '.glb';
  }

  private async preloadSlot(doc: AssetOverrideDoc): Promise<void> {
    const key = doc.slotKey;
    // Pure 2D icon overrides don't need 3D scene parsing unless used on 3D canvas
    if (key.startsWith('icon_') || key.startsWith('portrait_')) {
      return;
    }

    const actionsSig = doc.actions ? JSON.stringify(doc.actions) : '';
    const urlSig = `${doc.modelUrl}|${actionsSig}|${doc.updatedAt || ''}`;
    
    // If already loading this EXACT version, return existing promise
    const existingPromise = this.loadingPromises.get(key);
    if (existingPromise && existingPromise.urlSig === urlSig) {
      return existingPromise.promise;
    }

    // If cached version is already this EXACT version, we're done
    const existingCache = this.parsedCache.get(key);
    if (existingCache && existingCache.urlSig === urlSig) {
      return;
    }

    const taskPromise = (async () => {
      try {
        let rawRoot: THREE.Object3D | null = null;
        let animations: THREE.AnimationClip[] = [];
        let videoEl: HTMLVideoElement | undefined;

        if (doc.modelUrl && doc.modelUrl.startsWith('idb://')) {
          const idbKey = doc.modelUrl.replace('idb://', '');
          const buffer = await loadLocalGlbBuffer(idbKey);
          if (!buffer) return;
          const gltf = await new Promise<GLTF>((resolve, reject) => {
            this.gltfLoader.parse(buffer, '', resolve, reject);
          });
          rawRoot = gltf.scene;
          animations = [...(gltf.animations || [])];
        } else if (doc.modelUrl) {
          const ext = this.getCleanExtension(doc.modelUrl);
          if (ext === '.fbx') {
            const buffer = await fetchBufferWithChunking(doc.modelUrl, key);
            const originalWarn = console.warn;
            console.warn = (...args: any[]) => {
              const msg = args[0] ? String(args[0]) : '';
              if (
                msg.includes('ShininessExponent') ||
                msg.includes('ReflectionFactor') ||
                msg.includes('no "Texture" property')
              ) {
                return;
              }
              originalWarn.apply(console, args);
            };
            try {
              const fbxGroup = this.fbxLoader.parse(buffer, '');
              console.warn = originalWarn;
              rawRoot = fbxGroup;
              animations = [...(fbxGroup.animations || [])];
            } catch (err) {
              console.warn = originalWarn;
              throw err;
            }
          } else if (ext === '.obj') {
            const buffer = await fetchBufferWithChunking(doc.modelUrl, key);
            const text = new TextDecoder().decode(buffer);
            const objGroup = this.objLoader.parse(text);
            rawRoot = objGroup;
            animations = [];
          } else if (
            [
              '.tscn',
              '.tres',
              '.scn',
              '.json',
              '.vfx',
              '.fx',
              '.efk',
              '.efkefc',
              '.plist',
              '.atlas',
              '.xml',
              '.yaml',
              '.unity',
              '.prefab',
              '.asset',
              '.mat',
              '.meta',
            ].includes(ext)
          ) {
            const resp = await fetch(doc.modelUrl);
            const rawText = await resp.text();
            // Check if .json is actually a glTF JSON file
            if (ext === '.json' && /"asset"\s*:\s*\{/.test(rawText) && /"scenes"/.test(rawText)) {
              const gltf = await new Promise<GLTF>((resolve, reject) => {
                this.gltfLoader.load(doc.modelUrl, resolve, undefined, reject);
              });
              rawRoot = gltf.scene;
              animations = [...(gltf.animations || [])];
            } else {
              const built = buildParsedSceneVfxAsset(rawText, key);
              rawRoot = built.root;
              animations = built.animations;
            }
          } else if (ext === '.mp4' || ext === '.webm' || ext === '.mov') {
            if (typeof document !== 'undefined') {
              const vid = document.createElement('video');
              vid.src = doc.modelUrl;
              vid.crossOrigin = 'anonymous';
              vid.muted = true;
              vid.loop = true;
              vid.playsInline = true;
              vid.autoplay = true;
              vid.play().catch(() => {});
              videoEl = vid;

              const vTex = new THREE.VideoTexture(vid);
              vTex.colorSpace = THREE.SRGBColorSpace;
              const vMat = new THREE.MeshBasicMaterial({
                map: vTex,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
              });
              const holder = new THREE.Group();
              const p1 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), vMat);
              p1.position.y = 1.1;
              const p2 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), vMat);
              p2.position.y = 1.1;
              p2.rotation.y = Math.PI / 2;
              const groundDisc = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), vMat);
              groundDisc.rotation.x = -Math.PI / 2;
              groundDisc.position.y = 0.08;
              holder.add(p1, p2, groundDisc);
              rawRoot = holder;
              animations = [];
            }
          } else if (
            ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.apng', '.bmp'].includes(
              ext
            )
          ) {
            const tex = await new Promise<THREE.Texture>((resolve, reject) => {
              this.texLoader.load(doc.modelUrl, resolve, undefined, reject);
            });
            tex.colorSpace = THREE.SRGBColorSpace;
            const img = tex.image as { width?: number; height?: number } | undefined;
            const aspect =
              img && img.width && img.height ? Math.max(0.35, Math.min(2.5, img.width / img.height)) : 1;

            const isVfxSlot = key.startsWith('vfx_');
            const holder = new THREE.Group();

            if (isVfxSlot) {
              const vfxMat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
              });
              const p1 = new THREE.Mesh(new THREE.PlaneGeometry(2.2 * aspect, 2.2), vfxMat);
              p1.position.y = 1.05;
              const p2 = new THREE.Mesh(new THREE.PlaneGeometry(2.2 * aspect, 2.2), vfxMat);
              p2.position.y = 1.05;
              p2.rotation.y = Math.PI / 2;
              const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.2 * aspect, 2.2), vfxMat);
              groundPlane.rotation.x = -Math.PI / 2;
              groundPlane.position.y = 0.06;
              holder.add(p1, p2, groundPlane);
            } else {
              const mat = new THREE.MeshStandardMaterial({
                map: tex,
                transparent: true,
                alphaTest: 0.12,
                side: THREE.DoubleSide,
                roughness: 0.55,
                metalness: 0.1,
              });
              const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.0 * aspect, 2.0), mat);
              plane.position.y = 1.0;
              holder.add(plane);
            }
            rawRoot = holder;
            animations = [];
          } else {
            const buffer = await fetchBufferWithChunking(doc.modelUrl || '', key);
            const gltf = await new Promise<GLTF>((resolve, reject) => {
              this.gltfLoader.parse(buffer, '', resolve, reject);
            });
            rawRoot = gltf.scene;
            animations = [...(gltf.animations || [])];
          }
        }

        // Load & retarget all custom per-action animation clips (idle, run, attack, skill, dead, mount...)
        const actionsToLoad: Record<string, string> = { ...doc.actions };
        for (let i = 1; i <= 6; i++) {
          const key = `skill${i}` as keyof AssetOverrideDoc;
          if (doc[key]) {
             actionsToLoad[`skill${i}`] = doc[key] as string;
          }
        }

        const actionKeys = Object.keys(actionsToLoad);
        const animTasks = actionKeys.map(async (actionKey) => {
          const animUrl = actionsToLoad[actionKey];
          if (!animUrl) return;
          try {
            const ext = this.getCleanExtension(animUrl);
            let loadedAnims: THREE.AnimationClip[] = [];
            let animSceneRoot: THREE.Object3D | null = null;
            if (ext === '.fbx') {
              const buffer = await fetchBufferWithChunking(animUrl);
              const originalWarn = console.warn;
              console.warn = (...args: any[]) => {
                const msg = args[0] ? String(args[0]) : '';
                if (
                  msg.includes('ShininessExponent') ||
                  msg.includes('ReflectionFactor') ||
                  msg.includes('no "Texture" property')
                ) {
                  return;
                }
                originalWarn.apply(console, args);
              };
              try {
                const fbx = this.fbxLoader.parse(buffer, '');
                console.warn = originalWarn;
                loadedAnims = fbx.animations || [];
                animSceneRoot = fbx;
              } catch (err) {
                console.warn = originalWarn;
                throw err;
              }
            } else if (ext === '.glb' || ext === '.gltf') {
              const buffer = await fetchBufferWithChunking(animUrl);
              const gltf = await new Promise<GLTF>((res, rej) =>
                this.gltfLoader.parse(buffer, '', res, rej)
              );
              loadedAnims = gltf.animations || [];
              animSceneRoot = gltf.scene;
            }
            // If the user uploaded an action file BEFORE uploading a base mesh, use the first action's mesh as base!
            if (!rawRoot && animSceneRoot) {
              rawRoot = animSceneRoot;
            }
            loadedAnims.forEach((clip) => {
              const retargeted = retargetClipToRoot(clip, rawRoot, `__custom_${actionKey}`);
              animations.unshift(retargeted);
            });
          } catch (err) {
            console.warn(`Failed to load custom action [${actionKey}] for [${key}]:`, err);
          }
        });
        await Promise.all(animTasks);

        if (!rawRoot) return;

        const wrapper = new THREE.Group();
        const isVfx = key.startsWith('vfx_');
        const isMap = key.startsWith('map_env_');
        if (!isVfx && !isMap && animations.length > 0) {
          animations = animations.map((clip) =>
            clip.name.startsWith('__custom_') ? clip : lockHorizontalRootMotion(clip.clone())
          );
        }
        rawRoot.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = !isVfx;
            mesh.receiveShadow = !isVfx;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              if (!mat) continue;
              const std = mat as THREE.MeshStandardMaterial;
              const colorTextures = [std.map, std.emissiveMap];
              for (const tex of colorTextures) {
                if (tex && !(tex as THREE.VideoTexture).isVideoTexture) {
                  tex.colorSpace = THREE.SRGBColorSpace;
                  tex.anisotropy = 8;
                  tex.minFilter = THREE.LinearMipmapLinearFilter;
                  tex.magFilter = THREE.LinearFilter;
                  tex.generateMipmaps = true;
                  tex.needsUpdate = true;
                }
              }
              const dataTextures = [std.normalMap, std.roughnessMap, std.metalnessMap, std.aoMap];
              for (const tex of dataTextures) {
                if (tex) {
                  tex.anisotropy = 8;
                  tex.minFilter = THREE.LinearMipmapLinearFilter;
                  tex.magFilter = THREE.LinearFilter;
                  tex.generateMipmaps = true;
                  tex.needsUpdate = true;
                }
              }
            }
          }
        });
        const box = new THREE.Box3().setFromObject(rawRoot);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        if (isMap || rawRoot.userData.isParsedVfx) {
          wrapper.add(rawRoot);
        } else {
          const maxDim = Math.max(size.x, size.y, size.z, 0.001);
          const normScale = 2.0 / maxDim;

          rawRoot.position.set(
            -center.x * normScale,
            -box.min.y * normScale,
            -center.z * normScale
          );
          rawRoot.scale.multiplyScalar(normScale);
          wrapper.add(rawRoot);
        }

        this.parsedCache.set(key, {
          urlSig,
          scene: wrapper,
          animations,
          videoEl,
        });
      } catch (err) {
        console.warn(`Custom asset fallback activated for slot [${key}]:`, err);
      } finally {
        const current = this.loadingPromises.get(key);
        if (current && current.urlSig === urlSig) {
          this.loadingPromises.delete(key);
        }
      }
    })();

    this.loadingPromises.set(key, { promise: taskPromise, urlSig });
    return taskPromise;
  }

  public instantiateSlot(
    slotKey: string
  ): { group: THREE.Group; animations: THREE.AnimationClip[] } | null {
    const cached = this.parsedCache.get(slotKey);
    const ov = this.overrides.get(slotKey);
    if (!cached || !ov) return null;

    if (cached.videoEl && cached.videoEl.paused) {
      cached.videoEl.play().catch(() => {});
    }

    const cloned = SkeletonUtils.clone(cached.scene) as THREE.Group;
    const holder = new THREE.Group();
    cloned.scale.multiplyScalar(ov.scale || 1);
    cloned.position.y += ov.offsetY || 0;
    cloned.rotation.y += THREE.MathUtils.degToRad(ov.rotationY || 0);
    holder.add(cloned);

    return {
      group: holder,
      animations: cached.animations,
    };
  }
}

export const assetRegistry = new AssetRegistryManager();
export const IS_SOFTWARE_GL = assetRegistry.detectSoftwareGl();
