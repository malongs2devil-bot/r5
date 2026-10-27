import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ActiveStatusEffect,
  ActorActionType,
  CharacterDoc,
  ClassId,
  DerivedStats,
  FloatingTextEvent,
  NpcDef,
  RemotePlayer,
  ServerCombatVfxEvent,
  ServerFloatingEvent,
  ServerLootSnapshot,
  ServerMonsterSnapshot,
  SkillVfxType,
} from '../types/game';
import {
  CITADEL_MAP_ID,
  CLASSES_DATA,
  FIRST_HUNTING_MAP_ID,
  MAPS_DATA,
  NPCS_DATA,
} from '../data/gameData';
import {
  ArticulatedActorRig,
  buildCharacterRig,
  buildImperialCitadel3D,
  buildLootDropMesh,
  buildMapThemedProps,
  buildMonsterRig,
  createThemedGroundTexture,
  createSoftShadowTexture,
  MonsterActorRig,
  updateActorRigAnimation,
  updateMonsterRigAnimation,
} from './ProceduralModels';
import { assetRegistry, IS_SOFTWARE_GL } from './AssetRegistry';
import { soundFX } from './SoundFX';

export interface ActiveMonsterInfo {
  id: string;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  isBoss: boolean;
  statuses?: ActiveStatusEffect[];
}

export interface MinimapEntityDot {
  x: number;
  z: number;
  kind: 'mob' | 'boss' | 'npc' | 'loot' | 'portal' | 'peer';
}

export interface OverheadLabelItem {
  id: string;
  title: string;
  subtitle?: string;
  hpPct?: number;
  kind: 'player' | 'peer' | 'npc' | 'mob' | 'boss' | 'loot' | 'portal';
  color: string;
  x: number;
  y: number;
}

export interface AuthoritativeSelfPose {
  mapId: number;
  x: number;
  z: number;
  vx?: number;
  vz?: number;
  rotY: number;
  action: ActorActionType;
  actionSeq: number;
  skillIndex?: number;
  ackTime?: number;
  teleportSeq?: number;
  stateSeq?: number;
  synced?: boolean;
  statuses?: ActiveStatusEffect[];
  lastSyncAt?: number;
}

export interface WorldControllerHandle {
  triggerBasicAttack: () => void;
  triggerDodgeDash: () => void;
  triggerSkill: (skillIndex: number) => void;
  playServerVfxEvent: (ev: ServerCombatVfxEvent) => void;
  playServerFloatingEvent: (ev: ServerFloatingEvent) => void;
  pickupNearestLoot: () => void;
  navigateToQuestTarget: () => void;
  navigateToNpc: (npcId: string) => void;
  cycleCameraPreset: () => number;
  zoomCamera: (deltaScale: number) => void;
  resetCamera: () => void;
}

interface WorldCanvas3DProps {
  character: CharacterDoc;
  derivedStats: DerivedStats;
  hp: number;
  mp: number;
  autoBattle: boolean;
  isRotatedPortrait?: boolean;
  joystickVecRef: React.MutableRefObject<{ x: number; y: number }>;
  serverSelfRef: React.MutableRefObject<AuthoritativeSelfPose>;
  remotePlayersRef: React.MutableRefObject<Map<string, RemotePlayer>>;
  serverMonstersRef: React.MutableRefObject<Map<string, ServerMonsterSnapshot>>;
  serverLootsRef: React.MutableRefObject<Map<string, ServerLootSnapshot>>;
  worldControlRef: React.MutableRefObject<WorldControllerHandle | null>;
  onNpcInteract: (npc: NpcDef) => void;
  onTargetUpdate: (target: ActiveMonsterInfo | null) => void;
  onFpsUpdate?: (fps: number, frameMs: number) => void;
  onHudRealtimeSync: (payload: {
    playerX: number;
    playerZ: number;
    dots: MinimapEntityDot[];
    labels: OverheadLabelItem[];
    floatingTexts: FloatingTextEvent[];
    lootCountNearby: number;
  }) => void;
  onSendInput: (dirX: number, dirZ: number, rotY: number, clientTime: number) => void;
  onSendMoveTo: (x: number, z: number) => void;
  onSendAttack: (targetId?: string) => void;
  onSendDodge: (dirX: number, dirZ: number) => void;
  onSendSkill: (skillIndex: number, targetId?: string, targetX?: number, targetZ?: number) => void;
  onSendPickupLoot: (lootId?: string) => void;
}

// Pre-allocated math helpers outside the render loop (Zero GC)
const _projVec = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPoint = new THREE.Vector3();
const _dummyObj = new THREE.Object3D();
const _tempColor = new THREE.Color();
const _vfxColorA = new THREE.Color();
const _vfxColorB = new THREE.Color();
const _frustum = new THREE.Frustum();
const _projScreenMat = new THREE.Matrix4();
const _cullSphere = new THREE.Sphere();

interface CullableWorldProp {
  obj: THREE.Object3D;
  x: number;
  z: number;
  radius: number;
}

const sparkleShaderMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#fef08a') },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      float sparkle = sin(vUv.x * 45.0 + uTime * 12.0) * cos(vUv.y * 45.0 - uTime * 10.0);
      sparkle = smoothstep(0.1, 0.9, sparkle * 0.5 + 0.5);
      vec3 finalRgb = mix(uColor, vec3(1.0, 1.0, 1.0), sparkle * 0.9);
      gl_FragColor = vec4(finalRgb, 0.95);
    }
  `,
  transparent: true,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

function shortestAngleDiff(from: number, to: number): number {
  let diff = (to - from + Math.PI) % (Math.PI * 2);
  if (diff < 0) diff += Math.PI * 2;
  return diff - Math.PI;
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const diff = shortestAngleDiff(current, target);
  return current + diff * (1 - Math.exp(-lambda * dt));
}



function createArcaneSigilTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const cx = 128;
  const cy = 128;

  ctx.clearRect(0, 0, 256, 256);

  const grad = ctx.createRadialGradient(cx, cy, 12, cx, cy, 124);
  grad.addColorStop(0, 'rgba(255,255,255,0.28)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.88, 'rgba(255,255,255,0.32)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 124, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 114, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 94, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.stroke();

  for (let offset = 0; offset < 2; offset++) {
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const ang = (offset * Math.PI) / 3 + (i * Math.PI * 2) / 3;
      const px = cx + Math.cos(ang) * 92;
      const py = cy + Math.sin(ang) * 92;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  for (let i = 0; i < 12; i++) {
    const ang = (i * Math.PI * 2) / 12;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * 96, cy + Math.sin(ang) * 96);
    ctx.lineTo(cx + Math.cos(ang) * 112, cy + Math.sin(ang) * 112);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface PooledSkillConstruct {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  delay: number;
  age: number;
  duration: number;
  sx: number;
  sy: number;
  sz: number;
  ex: number;
  ey: number;
  ez: number;
  sScaleX: number;
  sScaleY: number;
  sScaleZ: number;
  eScaleX: number;
  eScaleY: number;
  eScaleZ: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  peakOpacity: number;
  trailColorHex: number;
  emitTrail: boolean;
  impactShake: number;
}

interface RenderedMonsterVisual {
  id: string;
  holder: THREE.Group;
  rig: MonsterActorRig;
  x: number;
  z: number;
  rotY: number;
  wasDead: boolean;
  deathTimer: number;
  frozenVisual: boolean;
  freezeShard: THREE.Mesh;
  seedOffset: number;
  slotSig: string;
}

interface RenderedLootVisual {
  id: string;
  group: THREE.Group;
  x: number;
  z: number;
  color: string;
}

interface RenderedNpcVisual {
  npc: NpcDef;
  holder: THREE.Group;
  rig: ArticulatedActorRig;
}

export const WorldCanvas3D: React.FC<WorldCanvas3DProps> = ({
  character,
  derivedStats,
  hp,
  mp,
  autoBattle,
  isRotatedPortrait = false,
  joystickVecRef,
  serverSelfRef,
  remotePlayersRef,
  serverMonstersRef,
  serverLootsRef,
  worldControlRef,
  onNpcInteract,
  onTargetUpdate,
  onFpsUpdate,
  onHudRealtimeSync,
  onSendInput,
  onSendMoveTo,
  onSendAttack,
  onSendDodge,
  onSendSkill,
  onSendPickupLoot,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const charRef = useRef(character);
  const prevMapIdRef = useRef<number>(character.mapId);
  const statsRef = useRef(derivedStats);
  const hpRef = useRef(hp);
  const mpRef = useRef(mp);
  const autoBattleRef = useRef(autoBattle);
  const rotatedPortraitRef = useRef(isRotatedPortrait);

  charRef.current = character;
  statsRef.current = derivedStats;
  hpRef.current = hp;
  mpRef.current = mp;
  autoBattleRef.current = autoBattle;
  rotatedPortraitRef.current = isRotatedPortrait;

  const callbacksRef = useRef({
    onNpcInteract,
    onTargetUpdate,
    onFpsUpdate,
    onHudRealtimeSync,
    onSendInput,
    onSendMoveTo,
    onSendAttack,
    onSendDodge,
    onSendSkill,
    onSendPickupLoot,
  });
  callbacksRef.current = {
    onNpcInteract,
    onTargetUpdate,
    onFpsUpdate,
    onHudRealtimeSync,
    onSendInput,
    onSendMoveTo,
    onSendAttack,
    onSendDodge,
    onSendSkill,
    onSendPickupLoot,
  };

  const rebuildPlayerRigRef = useRef<(() => void) | null>(null);
  const rebuildMapRef = useRef<((mapId: number, preservePlayerPos?: boolean) => void) | null>(null);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const width = Math.max(container.offsetWidth || container.clientWidth, 320);
    const height = Math.max(container.offsetHeight || container.clientHeight, 240);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.25, 62);

    const isMobileGpu =
      typeof window !== 'undefined' &&
      (window.innerWidth < 1024 || 'ontouchstart' in window || navigator.maxTouchPoints > 0);
    const getSharpPixelRatio = () =>
      IS_SOFTWARE_GL ? 1 : Math.min(window.devicePixelRatio || 1, 2.0);
    const targetPixelRatio = getSharpPixelRatio();

    const renderer = new THREE.WebGLRenderer({
      antialias: !IS_SOFTWARE_GL,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.setPixelRatio(targetPixelRatio);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.shadowMap.enabled = !IS_SOFTWARE_GL;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const hemiLight = new THREE.HemisphereLight('#93c5fd', '#292524', 0.8);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#fde68a', 1.92);
    keyLight.position.set(18, 32, 16);
    keyLight.castShadow = !IS_SOFTWARE_GL;
    keyLight.shadow.mapSize.set(1024, 1024);
    const sd = 18;
    keyLight.shadow.camera.left = -sd;
    keyLight.shadow.camera.right = sd;
    keyLight.shadow.camera.top = sd;
    keyLight.shadow.camera.bottom = -sd;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 76;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.018;
    scene.add(keyLight);
    scene.add(keyLight.target);

    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.68);
    rimLight.position.set(-22, 18, -24);
    scene.add(rimLight);

    const mapEnvironmentGroup = new THREE.Group();
    const npcGroup = new THREE.Group();
    const monstersGroup = new THREE.Group();
    const lootGroup = new THREE.Group();
    const vfxGroup = new THREE.Group();
    const peersGroup = new THREE.Group();
    const playerHolder = new THREE.Group();

    scene.add(
      mapEnvironmentGroup,
      npcGroup,
      monstersGroup,
      lootGroup,
      vfxGroup,
      peersGroup,
      playerHolder
    );

    const shadowTex = createSoftShadowTexture();
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    });
    const playerShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), contactShadowMat);
    playerShadow.rotation.x = -Math.PI / 2;
    playerShadow.position.y = 0.03;
    playerHolder.add(playerShadow);

    const targetRingMat = new THREE.MeshBasicMaterial({
      color: '#ef4444',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.18, 28), targetRingMat);
    targetRing.rotation.x = -Math.PI / 2;
    targetRing.position.y = 0.05;
    targetRing.visible = false;
    scene.add(targetRing);

    const moveMarkerMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const moveMarker = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.52, 20), moveMarkerMat);
    moveMarker.rotation.x = -Math.PI / 2;
    moveMarker.position.y = 0.05;
    moveMarker.visible = false;
    scene.add(moveMarker);

    // Thin-Client Visual State (Reconciled smoothly against authoritative server snapshots!)
    let playerRig: ArticulatedActorRig | null = null;
    let playerX = serverSelfRef.current.x ?? 0;
    let playerZ = serverSelfRef.current.z ?? 9;
    let playerRotY = serverSelfRef.current.rotY ?? Math.PI;
    let playerBankZ = 0;
    let moveBlend = 0;
    let footstepAccum = 0;
    let whirlwindSpinTimer = 0;
    let lodFrameCounter = 0;
    let pendingNpcTarget: NpcDef | null = null;
    let selectedMonsterId: string | null = null;
    const pendingInputs: { timeMs: number; dx: number; dz: number }[] = [];
    let visualErrX = 0;
    let visualErrZ = 0;
    let lastAppliedStateSeq = -1;
    let lastTeleportSeq = -1;
    let hasInitialServerSync = false;
    let isBuildingMap = false; // Add flag

    let citadelAnimatedCrystals: THREE.Object3D[] = [];
    let cullableProps: CullableWorldProp[] = [];
    let activeFogBaseNear = 20;
    let activeFogBaseFar = 42;
    let npcVisuals: RenderedNpcVisual[] = [];
    const monsterVisuals = new Map<string, RenderedMonsterVisual>();
    const lootVisuals = new Map<string, RenderedLootVisual>();
    const peerRigs = new Map<
      string,
      {
        rig: ArticulatedActorRig;
        gearHash: string;
        x: number;
        z: number;
        rotY: number;
        moveBlend: number;
      }
    >();

    let floatingSeq = 1;
    const floatingEvents: {
      id: number;
      text: string;
      color: string;
      crit?: boolean;
      wx: number;
      wy: number;
      wz: number;
      age: number;
    }[] = [];

    const NORTH_PORTAL_POS = { x: 0, z: -38 };
    const SOUTH_PORTAL_POS = { x: 0, z: 38 };

    let camPresetIdx = 0;
    const camPresets = [
      { dist: 16.0, height: 12.8 },
      { dist: 10.2, height: 6.4 },
      { dist: 22.5, height: 18.5 },
      { dist: 15.0, height: 22.0 },
    ];
    let camZoomScale = 1.0;
    let camPitchOffset = 0;
    let camYaw = 0;
    let camCurX = 0;
    let camCurY = 14;
    let camCurZ = 20;
    let camShakeAmp = 0;
    let impactFrameTimer = 0;

    interface ActiveCustomVfxEntry {
      group: THREE.Group;
      mixer: THREE.AnimationMixer | null;
      age: number;
      duration: number;
      isProjectile: boolean;
      ox: number;
      oz: number;
      tx: number;
      tz: number;
      baseScale: number;
    }
    const activeCustomVfxList: ActiveCustomVfxEntry[] = [];

    const freezeIceGeo = new THREE.OctahedronGeometry(0.95, 0);
    const freezeIceMat = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.3,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const playerFreezeCrystal = new THREE.Mesh(freezeIceGeo, freezeIceMat);
    playerFreezeCrystal.position.y = 1.05;
    playerFreezeCrystal.scale.set(0.88, 1.35, 0.88);
    playerFreezeCrystal.visible = false;
    playerHolder.add(playerFreezeCrystal);
    let playerWasFrozen = false;
    let statusFxAccum = 0;

    const weatherState = {
      type: 'clear' as 'clear' | 'rain' | 'snow' | 'sandstorm' | 'embers' | 'void',
      accum: 0,
      soundPlaying: 'none',
    };

    // =========================================================================
    // HIGH-FPS MOBILE GPU PARTICLE ENGINE (1 Draw Call, Zero GC Ring Buffer)
    // =========================================================================
    const MAX_PARTICLES = 2048; // Increased from 1280
    const particleBudgetScale = IS_SOFTWARE_GL ? 0.25 : isMobileGpu ? 0.35 : 1.0;

    const pPositions = new Float32Array(MAX_PARTICLES * 3);
    const pColors = new Float32Array(MAX_PARTICLES * 3);
    const pSizes = new Float32Array(MAX_PARTICLES);
    const pAlphas = new Float32Array(MAX_PARTICLES);
    const pKinds = new Float32Array(MAX_PARTICLES);

    const pVelX = new Float32Array(MAX_PARTICLES);
    const pVelY = new Float32Array(MAX_PARTICLES);
    const pVelZ = new Float32Array(MAX_PARTICLES);
    const pAge = new Float32Array(MAX_PARTICLES);
    const pLife = new Float32Array(MAX_PARTICLES);
    const pBaseSize = new Float32Array(MAX_PARTICLES);
    const pGravity = new Float32Array(MAX_PARTICLES);
    const pDrag = new Float32Array(MAX_PARTICLES);
    const pSwirl = new Float32Array(MAX_PARTICLES);
    const pOriginX = new Float32Array(MAX_PARTICLES);
    const pOriginZ = new Float32Array(MAX_PARTICLES);
    const pBounce = new Uint8Array(MAX_PARTICLES);

    let particleCursor = 0;
    let liveParticleCount = 0;

    const particleGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pPositions, 3);
    const colAttr = new THREE.BufferAttribute(pColors, 3);
    const sizeAttr = new THREE.BufferAttribute(pSizes, 1);
    const alphaAttr = new THREE.BufferAttribute(pAlphas, 1);
    const kindAttr = new THREE.BufferAttribute(pKinds, 1);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    sizeAttr.setUsage(THREE.DynamicDrawUsage);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    kindAttr.setUsage(THREE.DynamicDrawUsage);

    particleGeo.setAttribute('position', posAttr);
    particleGeo.setAttribute('aColor', colAttr);
    particleGeo.setAttribute('aSize', sizeAttr);
    particleGeo.setAttribute('aAlpha', alphaAttr);
    particleGeo.setAttribute('aKind', kindAttr);

    const particleMat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: targetPixelRatio },
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        attribute float aKind;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vKind;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vKind = aKind;
          if (aAlpha <= 0.001 || aSize <= 0.001) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            return;
          }
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float dist = max(1.4, -mvPosition.z);
          gl_PointSize = clamp(aSize * uPixelRatio * (195.0 / dist), 1.0, 66.0);
        }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vKind;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.5) discard;

          float intensity = 0.0;
          float hotCore = 0.0;

          if (vKind < 0.5) {
            float falloff = max(0.0, 1.0 - d * 2.0);
            intensity = pow(falloff, 1.75);
            hotCore = smoothstep(0.22, 0.0, d);
          } else if (vKind < 1.5) {
            float crossFlare = exp(-abs(uv.x) * 14.0) * exp(-abs(uv.y) * 3.2)
                             + exp(-abs(uv.y) * 14.0) * exp(-abs(uv.x) * 3.2);
            float core = smoothstep(0.26, 0.0, d);
            float radial = max(0.0, 1.0 - d * 2.0);
            intensity = clamp((crossFlare * 0.85 + core * 0.95) * radial * 1.45, 0.0, 1.0);
            hotCore = core;
          } else {
            float ring = exp(-abs(d - 0.33) * 18.0);
            float softFill = max(0.0, 1.0 - d * 2.1) * 0.35;
            intensity = clamp(ring + softFill, 0.0, 1.0);
            hotCore = ring * 0.55;
          }

          vec3 finalRgb = mix(vColor, vec3(1.0, 0.99, 0.94), hotCore * 0.78);
          gl_FragColor = vec4(finalRgb, intensity * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const particlePoints = new THREE.Points(particleGeo, particleMat);
    particlePoints.frustumCulled = false;
    particlePoints.renderOrder = 14;
    vfxGroup.add(particlePoints);

    const emitParticle = (
      x: number,
      y: number,
      z: number,
      vx: number,
      vy: number,
      vz: number,
      r: number,
      g: number,
      b: number,
      size: number,
      life: number,
      gravity: number,
      drag: number,
      kind: 0 | 1 | 2,
      swirl = 0,
      ox = 0,
      oz = 0,
      bounce = 0
    ) => {
      const idx = particleCursor;
      particleCursor = (particleCursor + 1) % MAX_PARTICLES;
      if (pLife[idx] <= 0) {
        liveParticleCount++;
      }

      const i3 = idx * 3;
      pPositions[i3] = x;
      pPositions[i3 + 1] = y;
      pPositions[i3 + 2] = z;

      pColors[i3] = r;
      pColors[i3 + 1] = g;
      pColors[i3 + 2] = b;

      pVelX[idx] = vx;
      pVelY[idx] = vy;
      pVelZ[idx] = vz;
      pAge[idx] = 0;
      pLife[idx] = life;
      pBaseSize[idx] = size;
      pSizes[idx] = size * 0.5;
      pAlphas[idx] = 1.0;
      pKinds[idx] = kind;
      pGravity[idx] = gravity;
      pDrag[idx] = drag;
      pSwirl[idx] = swirl;
      pOriginX[idx] = ox;
      pOriginZ[idx] = oz;
      pBounce[idx] = bounce;
    };

    const emitRadialBurst = (params: {
      x: number;
      y: number;
      z: number;
      count: number;
      colorA: string;
      colorB?: string;
      speedMin: number;
      speedMax: number;
      upMin: number;
      upMax: number;
      sizeMin: number;
      sizeMax: number;
      lifeMin: number;
      lifeMax: number;
      gravity?: number;
      drag?: number;
      kind?: 0 | 1 | 2;
      spreadRadius?: number;
      bounce?: boolean;
    }) => {
      const scaledCount = Math.max(4, Math.round(params.count * particleBudgetScale));
      _vfxColorA.set(params.colorA);
      _vfxColorB.set(params.colorB || '#ffffff');
      const grav = params.gravity ?? -9.5;
      const drag = params.drag ?? 1.8;
      const kind = params.kind ?? 1;
      const spread = params.spreadRadius ?? 0.25;
      const bounceFlag = params.bounce ? 1 : 0;

      for (let i = 0; i < scaledCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = params.speedMin + Math.random() * (params.speedMax - params.speedMin);
        const vy = params.upMin + Math.random() * (params.upMax - params.upMin);
        const rad = Math.random() * spread;
        const mixT = Math.random() * 0.45;
        const cr = _vfxColorA.r + (_vfxColorB.r - _vfxColorA.r) * mixT;
        const cg = _vfxColorA.g + (_vfxColorB.g - _vfxColorA.g) * mixT;
        const cb = _vfxColorA.b + (_vfxColorB.b - _vfxColorA.b) * mixT;
        const sz = params.sizeMin + Math.random() * (params.sizeMax - params.sizeMin);
        const lf = params.lifeMin + Math.random() * (params.lifeMax - params.lifeMin);

        emitParticle(
          params.x + Math.cos(ang) * rad,
          params.y + (Math.random() - 0.3) * 0.25,
          params.z + Math.sin(ang) * rad,
          Math.cos(ang) * spd,
          vy,
          Math.sin(ang) * spd,
          cr,
          cg,
          cb,
          sz,
          lf,
          grav,
          drag,
          kind,
          0,
          0,
          0,
          bounceFlag
        );
      }
    };

    const emitVortexSwirl = (params: {
      x: number;
      z: number;
      count: number;
      radius: number;
      heightMax: number;
      colorA: string;
      colorB: string;
      swirlSpeed: number;
      inwardSpeed: number;
      upMin: number;
      upMax: number;
      sizeMin: number;
      sizeMax: number;
      lifeMin: number;
      lifeMax: number;
      kind?: 0 | 1 | 2;
    }) => {
      const scaledCount = Math.max(8, Math.round(params.count * particleBudgetScale));
      _vfxColorA.set(params.colorA);
      _vfxColorB.set(params.colorB);
      const kind = params.kind ?? 0;

      for (let i = 0; i < scaledCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rDist = (0.25 + Math.random() * 0.75) * params.radius;
        const px = params.x + Math.cos(ang) * rDist;
        const pz = params.z + Math.sin(ang) * rDist;
        const py = 0.12 + Math.random() * params.heightMax;
        const vx = -Math.cos(ang) * params.inwardSpeed;
        const vz = -Math.sin(ang) * params.inwardSpeed;
        const vy = params.upMin + Math.random() * (params.upMax - params.upMin);
        const t = Math.random();

        emitParticle(
          px,
          py,
          pz,
          vx,
          vy,
          vz,
          _vfxColorA.r + (_vfxColorB.r - _vfxColorA.r) * t,
          _vfxColorA.g + (_vfxColorB.g - _vfxColorA.g) * t,
          _vfxColorA.b + (_vfxColorB.b - _vfxColorA.b) * t,
          params.sizeMin + Math.random() * (params.sizeMax - params.sizeMin),
          params.lifeMin + Math.random() * (params.lifeMax - params.lifeMin),
          0.6,
          0.6,
          kind,
          params.swirlSpeed,
          params.x,
          params.z,
          0
        );
      }
    };

    // =========================================================================
    // ZERO-GC POOLED 3D SKILL CONSTRUCTS + DYNAMIC IMPACT LIGHT
    // =========================================================================
    const sigilTex = createArcaneSigilTexture();
    const sharedSigilPlaneGeo = new THREE.PlaneGeometry(2, 2);
    sharedSigilPlaneGeo.rotateX(-Math.PI / 2);

    const sharedShockRingGeo = new THREE.RingGeometry(0.72, 1.0, 36);
    sharedShockRingGeo.rotateX(-Math.PI / 2);

    const sharedWideWaveGeo = new THREE.RingGeometry(0.32, 1.0, 32);
    sharedWideWaveGeo.rotateX(-Math.PI / 2);

    const sharedSlashArcGeo = new THREE.RingGeometry(
      0.56,
      1.0,
      28,
      1,
      -Math.PI * 0.58,
      Math.PI * 1.16
    );
    sharedSlashArcGeo.rotateX(-Math.PI / 2);

    const sharedCylinderBeamGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.0, 16, 1, true);
    const sharedConeSpikeGeo = new THREE.ConeGeometry(0.42, 1.65, 5);
    sharedConeSpikeGeo.translate(0, 0.825, 0);

    const sharedSphereCoreGeo = new THREE.IcosahedronGeometry(0.55, 1);
    const sharedTorusHaloGeo = new THREE.TorusGeometry(0.85, 0.065, 8, 28);
    sharedTorusHaloGeo.rotateX(Math.PI / 2);

    const sharedGreatBladeGeo = new THREE.ConeGeometry(0.55, 4.2, 4);

    // 3D Celestial Dragon geometries ("Rồng Bay")
    const sharedDragonHeadGeo = new THREE.ConeGeometry(0.75, 2.4, 5);
    sharedDragonHeadGeo.rotateX(Math.PI / 2);
    const sharedDragonBodyGeo = new THREE.DodecahedronGeometry(0.78, 1);
    const sharedDragonWingGeo = new THREE.ConeGeometry(0.5, 3.2, 4);
    sharedDragonWingGeo.rotateZ(Math.PI / 2);

    // 3D Multi-forked Lightning Arc geometries ("Lôi Điện")
    const sharedLightningBoltGeo = new THREE.CylinderGeometry(0.14, 0.32, 7.5, 6);
    sharedLightningBoltGeo.rotateX(Math.PI / 2);

    const CONSTRUCT_POOL_SIZE = 256; // Increased from 120
    const constructPool: PooledSkillConstruct[] = [];
    let constructCursor = 0;

    for (let i = 0; i < CONSTRUCT_POOL_SIZE; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const mesh = new THREE.Mesh(sharedShockRingGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 11;
      vfxGroup.add(mesh);

      constructPool.push({
        mesh,
        mat,
        active: false,
        delay: 0,
        age: 0,
        duration: 0.5,
        sx: 0,
        sy: 0,
        sz: 0,
        ex: 0,
        ey: 0,
        ez: 0,
        sScaleX: 1,
        sScaleY: 1,
        sScaleZ: 1,
        eScaleX: 1,
        eScaleY: 1,
        eScaleZ: 1,
        spinX: 0,
        spinY: 0,
        spinZ: 0,
        peakOpacity: 0.9,
        trailColorHex: 0xffffff,
        emitTrail: false,
        impactShake: 0,
      });
    }

    const skillFlashLight = new THREE.PointLight('#f59e0b', 0, 15, 2.0);
    skillFlashLight.position.set(0, 2, 0);
    scene.add(skillFlashLight);

    const triggerCombatFlash = (
      x: number,
      y: number,
      z: number,
      colorHex: string,
      power: number,
      shake = 0
    ) => {
      skillFlashLight.color.set(colorHex);
      skillFlashLight.position.set(x, y, z);
      skillFlashLight.intensity = Math.max(skillFlashLight.intensity, power);
      if (shake > camShakeAmp) {
        camShakeAmp = shake;
      }
    };

    const spawnFallingParticleRain = (
      cx: number,
      cz: number,
      radius: number,
      colorHex: string,
      totalCount = 130
    ) => {
      _vfxColorA.set(colorHex);
      for (let i = 0; i < totalCount; i++) {
        const delaySec = Math.random() * 1.5;
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius;
        const dropX = cx + Math.sin(ang) * dist;
        const dropZ = cz + Math.cos(ang) * dist;
        const startY = 8.5 + Math.random() * 7.0;

        window.setTimeout(() => {
          if (disposed) return;
          emitParticle(
            dropX,
            startY,
            dropZ,
            (Math.random() - 0.5) * 1.6,
            -8.0 - Math.random() * 7.0,
            (Math.random() - 0.5) * 1.6,
            _vfxColorA.r,
            _vfxColorA.g,
            _vfxColorA.b,
            0.42 + Math.random() * 0.52,
            0.35 + Math.random() * 0.42,
            2.0,
            0,
            1
          );
        }, delaySec * 1000);
      }
    };


    const spawnConstruct = (opts: {
      geo: THREE.BufferGeometry;
      color: string;
      useSigilMap?: boolean;
      delay?: number;
      duration: number;
      sx: number;
      sy: number;
      sz: number;
      ex?: number;
      ey?: number;
      ez?: number;
      sScale: [number, number, number];
      eScale: [number, number, number];
      rot?: [number, number, number];
      spin?: [number, number, number];
      opacity?: number;
      emitTrail?: boolean;
      impactShake?: number;
    }) => {
      let slot: PooledSkillConstruct | null = null;
      for (let k = 0; k < CONSTRUCT_POOL_SIZE; k++) {
        const idx = (constructCursor + k) % CONSTRUCT_POOL_SIZE;
        if (!constructPool[idx].active) {
          slot = constructPool[idx];
          constructCursor = (idx + 1) % CONSTRUCT_POOL_SIZE;
          break;
        }
      }
      if (!slot) {
        slot = constructPool[constructCursor];
        constructCursor = (constructCursor + 1) % CONSTRUCT_POOL_SIZE;
      }

      slot.mesh.geometry = opts.geo;
      const nextMap = opts.useSigilMap ? sigilTex : null;
      if (slot.mat.map !== nextMap) {
        slot.mat.map = nextMap;
        slot.mat.needsUpdate = true;
      }
      slot.mat.color.set(opts.color);
      slot.trailColorHex = slot.mat.color.getHex();

      slot.active = true;
      slot.delay = opts.delay ?? 0;
      slot.age = 0;
      slot.duration = Math.max(0.08, opts.duration);
      slot.sx = opts.sx;
      slot.sy = opts.sy;
      slot.sz = opts.sz;
      slot.ex = opts.ex ?? opts.sx;
      slot.ey = opts.ey ?? opts.sy;
      slot.ez = opts.ez ?? opts.sz;
      slot.sScaleX = opts.sScale[0];
      slot.sScaleY = opts.sScale[1];
      slot.sScaleZ = opts.sScale[2];
      slot.eScaleX = opts.eScale[0];
      slot.eScaleY = opts.eScale[1];
      slot.eScaleZ = opts.eScale[2];

      const r = opts.rot || [0, 0, 0];
      slot.mesh.rotation.set(r[0], r[1], r[2]);
      const sp = opts.spin || [0, 0, 0];
      slot.spinX = sp[0];
      slot.spinY = sp[1];
      slot.spinZ = sp[2];
      slot.peakOpacity = opts.opacity ?? 0.9;
      slot.emitTrail = Boolean(opts.emitTrail);
      slot.impactShake = opts.impactShake ?? 0;

      if (slot.delay <= 0) {
        slot.mesh.position.set(slot.sx, slot.sy, slot.sz);
        slot.mesh.scale.set(slot.sScaleX, slot.sScaleY, slot.sScaleZ);
        slot.mat.opacity = slot.peakOpacity;
        slot.mesh.visible = true;
      } else {
        slot.mesh.visible = false;
      }
    };

    const spawnDragonSwoopVfx = (
      cx: number,
      cz: number,
      colorHex: string,
      isUltimate = true
    ) => {
      const segCount = isUltimate ? 14 : 9;
      const radius = isUltimate ? 5.8 : 4.0;
      const heightMax = isUltimate ? 15.0 : 10.0;
      _vfxColorA.set(colorHex);

      for (let s = 0; s < segCount; s++) {
        const delay = s * 0.042;
        const isHead = s === 0;
        const ang = (s / segCount) * Math.PI * 3.6;
        const startX = cx + Math.cos(ang) * radius;
        const startZ = cz + Math.sin(ang) * radius;
        const startY = 0.2 + (s / segCount) * 4.5;
        const endY = heightMax - s * 0.75;

        spawnConstruct({
          geo: isHead ? sharedDragonHeadGeo : s % 4 === 0 ? sharedDragonWingGeo : sharedDragonBodyGeo,
          color: isHead ? '#ffffff' : colorHex,
          delay,
          duration: isUltimate ? 0.85 : 0.6,
          sx: startX,
          sy: startY,
          sz: startZ,
          ex: cx + Math.cos(ang + 0.9) * (radius * 0.35),
          ey: endY,
          ez: cz + Math.sin(ang + 0.9) * (radius * 0.35),
          sScale: isHead ? [1.5, 1.5, 1.5] : [1.1 - s * 0.04, 1.1 - s * 0.04, 1.1 - s * 0.04],
          eScale: isHead ? [2.2, 2.2, 2.2] : [1.4, 1.4, 1.4],
          rot: [Math.PI / 4, ang, 0.35],
          spin: [3, 9, 2],
          opacity: 0.98,
          emitTrail: true,
          impactShake: isHead && isUltimate ? 0.55 : 0,
        });
      }

      emitVortexSwirl({
        x: cx,
        z: cz,
        count: isUltimate ? 180 : 100,
        radius: radius * 1.15,
        heightMax: heightMax * 0.85,
        colorA: colorHex,
        colorB: '#fef08a',
        swirlSpeed: 15.0,
        inwardSpeed: -1.8,
        upMin: 3.5,
        upMax: 13.0,
        sizeMin: 0.34,
        sizeMax: 0.9,
        lifeMin: 0.65,
        lifeMax: 1.35,
        kind: 1,
      });

      try { soundFX.playSkill(isUltimate ? 5 : 3); } catch {}
    };

    const spawnLightningStrikeVfx = (
      tx: number,
      tz: number,
      colorHex = '#38bdf8',
      boltCount = 5
    ) => {
      _vfxColorA.set(colorHex);
      for (let b = 0; b < boltCount; b++) {
        const delay = b * 0.045;
        const offsetX = (Math.random() - 0.5) * 3.8;
        const offsetZ = (Math.random() - 0.5) * 3.8;
        spawnConstruct({
          geo: sharedLightningBoltGeo,
          color: b % 2 === 0 ? '#ffffff' : colorHex,
          delay,
          duration: 0.28,
          sx: tx + offsetX + (Math.random() - 0.5) * 1.6,
          sy: 16.0,
          sz: tz + offsetZ + (Math.random() - 0.5) * 1.6,
          ex: tx + offsetX,
          ey: 0.2,
          ez: tz + offsetZ,
          sScale: [0.6, 2.6, 0.6],
          eScale: [1.3, 3.4, 1.3],
          rot: [(Math.random() - 0.5) * 0.4, Math.random() * Math.PI, (Math.random() - 0.5) * 0.4],
          opacity: 1.0,
          emitTrail: true,
        });
      }
    };

    const spawnFloatingText = (
      wx: number,
      wy: number,
      wz: number,
      text: string,
      color: string,
      crit = false
    ) => {
      floatingEvents.push({
        id: floatingSeq++,
        text,
        color,
        crit,
        wx: wx + (Math.random() - 0.5) * 0.7,
        wy,
        wz,
        age: 0,
      });
      if (floatingEvents.length > 26) floatingEvents.shift();
    };

    const spawnBasicAttackVfx = (
      clsId: ClassId,
      stage: 1 | 2 | 3,
      ox: number,
      oz: number,
      tx: number,
      tz: number,
      facingY: number,
      isLocal: boolean
    ) => {
      const isFinisher = stage === 3;
      const tilt = stage === 1 ? 0.36 : stage === 2 ? -0.38 : 0.08;
      const scaleBoost = isFinisher ? 1.38 : stage === 2 ? 1.12 : 1.0;

      if (clsId === 'esper') {
        const boltCount = isFinisher ? 3 : 1;
        for (let b = 0; b < boltCount; b++) {
          const offsetAng = boltCount === 3 ? (b - 1) * 0.22 : 0;
          spawnConstruct({
            geo: sharedSphereCoreGeo,
            color: isFinisher ? '#fde047' : '#fbbf24',
            duration: 0.28,
            sx: ox + Math.sin(facingY + Math.PI / 2) * (b - 1) * (boltCount === 3 ? 0.45 : 0),
            sy: 1.35,
            sz: oz + Math.cos(facingY + Math.PI / 2) * (b - 1) * (boltCount === 3 ? 0.45 : 0),
            ex: tx,
            ey: 1.1,
            ez: tz,
            sScale: [0.34 * scaleBoost, 0.34 * scaleBoost, 0.78 * scaleBoost],
            eScale: [0.46 * scaleBoost, 0.46 * scaleBoost, 0.98 * scaleBoost],
            rot: [0, facingY + offsetAng, 0],
            opacity: 0.96,
            emitTrail: true,
          });
        }
        spawnConstruct({
          geo: sharedShockRingGeo,
          color: isFinisher ? '#fef08a' : '#fde68a',
          delay: 0.14,
          duration: isFinisher ? 0.48 : 0.36,
          sx: tx,
          sy: 0.12,
          sz: tz,
          sScale: [0.45, 1, 0.45],
          eScale: [2.1 * scaleBoost, 1, 2.1 * scaleBoost],
          opacity: 0.9,
        });
        emitRadialBurst({
          x: tx,
          y: 1.05,
          z: tz,
          count: isFinisher ? 42 : 24,
          colorA: '#f59e0b',
          colorB: '#fef08a',
          speedMin: 2.4,
          speedMax: isFinisher ? 9.0 : 6.5,
          upMin: 1.5,
          upMax: isFinisher ? 6.8 : 5.0,
          sizeMin: 0.22,
          sizeMax: isFinisher ? 0.56 : 0.46,
          lifeMin: 0.35,
          lifeMax: 0.68,
          kind: 1,
          bounce: true,
        });
      } else if (clsId === 'vanguard') {
        const midX = ox + Math.sin(facingY) * 1.75;
        const midZ = oz + Math.cos(facingY) * 1.75;
        spawnConstruct({
          geo: sharedSlashArcGeo,
          color: isFinisher ? '#fbbf24' : '#ef4444',
          duration: isFinisher ? 0.46 : 0.35,
          sx: midX,
          sy: 1.15,
          sz: midZ,
          sScale: [1.15 * scaleBoost, 1, 1.15 * scaleBoost],
          eScale: [2.9 * scaleBoost, 1, 2.9 * scaleBoost],
          rot: [tilt * 0.45, facingY, tilt],
          spin: [0, stage === 2 ? -6.5 : isFinisher ? 11.5 : 5.8, 0],
          opacity: 0.96,
        });
        emitRadialBurst({
          x: tx,
          y: 1.0,
          z: tz,
          count: isFinisher ? 48 : 26,
          colorA: '#ef4444',
          colorB: '#fbbf24',
          speedMin: 2.8,
          speedMax: isFinisher ? 10.2 : 7.5,
          upMin: 1.8,
          upMax: isFinisher ? 7.2 : 5.5,
          sizeMin: 0.24,
          sizeMax: isFinisher ? 0.58 : 0.48,
          lifeMin: 0.32,
          lifeMax: 0.68,
          kind: 1,
          bounce: true,
        });
      } else {
        const midX = ox + Math.sin(facingY) * 1.55;
        const midZ = oz + Math.cos(facingY) * 1.55;
        const slashLayers = stage >= 2 ? 2 : 1;
        for (let s = 0; s < slashLayers; s++) {
          const dir = s === 0 ? 1 : -1;
          spawnConstruct({
            geo: sharedSlashArcGeo,
            color: isFinisher && s === 1 ? '#67e8f9' : '#10b981',
            delay: s * 0.05,
            duration: isFinisher ? 0.42 : 0.32,
            sx: midX,
            sy: 1.18,
            sz: midZ,
            sScale: [0.95 * scaleBoost, 1, 0.95 * scaleBoost],
            eScale: [2.45 * scaleBoost, 1, 2.45 * scaleBoost],
            rot: [0.22 * dir, facingY, (tilt || 0.35) * 1.3 * dir],
            spin: [0, (stage === 2 ? -7.8 : 8.8) * dir, 0],
            opacity: 0.96,
          });
        }
        emitRadialBurst({
          x: tx,
          y: 1.05,
          z: tz,
          count: isFinisher ? 44 : 24,
          colorA: '#10b981',
          colorB: '#67e8f9',
          speedMin: 2.6,
          speedMax: isFinisher ? 9.5 : 7.0,
          upMin: 1.6,
          upMax: isFinisher ? 6.5 : 5.0,
          sizeMin: 0.22,
          sizeMax: isFinisher ? 0.54 : 0.44,
          lifeMin: 0.3,
          lifeMax: 0.65,
          kind: 1,
          bounce: true,
        });
      }

      if (isFinisher && clsId !== 'esper' && isLocal) {
        whirlwindSpinTimer = Math.max(whirlwindSpinTimer, 0.28);
      }

      if (isLocal && isFinisher) {
        impactFrameTimer = 0.065; // Brief freeze-frame on critical finisher
      }

      triggerCombatFlash(
        tx,
        1.4,
        tz,
        CLASSES_DATA[clsId].primaryColor,
        isFinisher ? 3.8 : 2.2,
        isLocal ? (isFinisher ? 0.18 : 0.045) : 0
      );
    };

    const spawnChoreographedSkillVfx = (params: {
      vfx: SkillVfxType;
      color: string;
      ox: number;
      oz: number;
      tx: number;
      tz: number;
      radius: number;
      isLocalPlayer: boolean;
    }) => {
      const { vfx, color, ox, oz, tx, tz, radius, isLocalPlayer } = params;
      const facingY = Math.atan2(tx - ox, tz - oz) || playerRotY;
      const r = Math.max(2.2, radius);

      const customVfx = assetRegistry.instantiateSlot('vfx_' + vfx);
      if (customVfx) {
        const isProj = vfx === 'shard_bolt';
        const duration = isProj ? 0.52 : 1.15;
        const group = customVfx.group;
        const box = new THREE.Box3().setFromObject(group);
        const sz = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(sz.x, sz.y, sz.z, 0.01);
        const desiredSize = isProj ? 1.8 : Math.min(6.5, Math.max(2.4, r * 0.85));
        const baseScale = THREE.MathUtils.clamp(desiredSize / maxDim, 0.25, 4.5);
        group.scale.setScalar(baseScale);
        if (isProj) {
          group.position.set(ox, 1.15, oz);
          group.lookAt(tx, 1.15, tz);
        } else {
          group.position.set(tx, 0.12, tz);
          group.rotation.y = facingY;
        }
        let mixer: THREE.AnimationMixer | null = null;
        if (customVfx.animations.length > 0) {
          mixer = new THREE.AnimationMixer(group);
          for (const clip of customVfx.animations) {
            const act = mixer.clipAction(clip);
            act.setLoop(THREE.LoopRepeat, Infinity);
            act.play();
          }
        }
        vfxGroup.add(group);
        activeCustomVfxList.push({
          group,
          mixer,
          age: 0,
          duration,
          isProjectile: isProj,
          ox,
          oz,
          tx,
          tz,
          baseScale,
        });
      }

      const isUltimate =
        vfx === 'meteor_storm' || vfx === 'judgement_blade' || vfx === 'apex_predator';
      const skillBaseDur = isUltimate ? 1.25 : 1.05;

      spawnConstruct({
        geo: sharedSigilPlaneGeo,
        useSigilMap: true,
        color,
        duration: skillBaseDur,
        sx: ox,
        sy: 0.07,
        sz: oz,
        sScale: [1.1, 1, 1.1],
        eScale: [2.5, 1, 2.5],
        spin: [0, 2.8, 0],
        opacity: 0.88,
      });

      if (customVfx) {
        triggerCombatFlash(tx, 1.6, tz, color, isLocalPlayer ? 3.8 : 2.2, isLocalPlayer ? 0.12 : 0);
        return;
      }

      switch (vfx) {
        case 'shard_bolt': {
          for (let k = -1; k <= 1; k++) {
            const ang = facingY + k * 0.18;
            const endX = tx + Math.sin(ang + Math.PI / 2) * (k * 0.65);
            const endZ = tz + Math.cos(ang + Math.PI / 2) * (k * 0.65);
            spawnConstruct({
              geo: sharedConeSpikeGeo,
              color: k === 0 ? '#fef08a' : color,
              delay: 0.12 + Math.abs(k) * 0.05,
              duration: 0.38,
              sx: ox,
              sy: 1.4,
              sz: oz,
              ex: endX,
              ey: 1.0,
              ez: endZ,
              sScale: [0.45, 0.9, 0.45],
              eScale: [0.55, 1.25, 0.55],
              rot: [Math.PI / 2, 0, -ang],
              opacity: 0.95,
              emitTrail: true,
            });
          }
          spawnConstruct({
            geo: sharedShockRingGeo,
            color: '#fde047',
            delay: 0.28,
            duration: 0.65,
            sx: tx,
            sy: 0.1,
            sz: tz,
            sScale: [0.5, 1, 0.5],
            eScale: [r * 1.15, 1, r * 1.15],
            opacity: 0.92,
          });
          emitRadialBurst({
            x: tx,
            y: 1.0,
            z: tz,
            count: 48,
            colorA: color,
            colorB: '#fef9c3',
            speedMin: 3.0,
            speedMax: 9.5,
            upMin: 2.0,
            upMax: 6.5,
            sizeMin: 0.26,
            sizeMax: 0.58,
            lifeMin: 0.45,
            lifeMax: 0.95,
            kind: 1,
            bounce: true,
          });
          triggerCombatFlash(tx, 1.8, tz, color, 4.0, isLocalPlayer ? 0.08 : 0);
          break;
        }
        case 'gravity_well': {
          spawnConstruct({
            geo: sharedSigilPlaneGeo,
            useSigilMap: true,
            color: '#fb923c',
            duration: 1.25,
            sx: tx,
            sy: 0.08,
            sz: tz,
            sScale: [r * 0.95, 1, r * 0.95],
            eScale: [r * 1.15, 1, r * 1.15],
            spin: [0, -3.2, 0],
            opacity: 0.9,
          });
          spawnConstruct({
            geo: sharedSphereCoreGeo,
            color: '#c084fc',
            duration: 1.15,
            sx: tx,
            sy: 1.45,
            sz: tz,
            sScale: [0.6, 0.6, 0.6],
            eScale: [1.6, 1.6, 1.6],
            spin: [2.5, 4.2, 1.8],
            opacity: 0.92,
          });
          emitVortexSwirl({
            x: tx,
            z: tz,
            count: 96,
            radius: r * 1.05,
            heightMax: 2.6,
            colorA: '#fb923c',
            colorB: '#c084fc',
            swirlSpeed: 7.5,
            inwardSpeed: 3.4,
            upMin: 0.4,
            upMax: 2.6,
            sizeMin: 0.26,
            sizeMax: 0.62,
            lifeMin: 0.75,
            lifeMax: 1.35,
            kind: 0,
          });
          triggerCombatFlash(tx, 2.0, tz, '#fb923c', 5.2, isLocalPlayer ? 0.12 : 0);
          break;
        }
        case 'crystal_shield': {
          spawnConstruct({
            geo: sharedSphereCoreGeo,
            color: '#fde047',
            duration: 1.25,
            sx: tx,
            sy: 1.15,
            sz: tz,
            sScale: [1.5, 1.7, 1.5],
            eScale: [2.2, 2.3, 2.2],
            spin: [0, 3.4, 0],
            opacity: 0.48,
          });
          emitVortexSwirl({
            x: tx,
            z: tz,
            count: 75,
            radius: 2.4,
            heightMax: 1.2,
            colorA: '#fde047',
            colorB: '#34d399',
            swirlSpeed: 5.5,
            inwardSpeed: -0.6,
            upMin: 2.2,
            upMax: 5.2,
            sizeMin: 0.25,
            sizeMax: 0.55,
            lifeMin: 0.75,
            lifeMax: 1.25,
            kind: 1,
          });
          triggerCombatFlash(tx, 1.8, tz, '#fde047', 4.5, 0);
          break;
        }
        case 'solar_beam': {
          const dx = tx - ox;
          const dz = tz - oz;
          const beamLen = Math.max(3.5, Math.hypot(dx, dz));
          const midX = ox + (dx / Math.max(0.01, Math.hypot(dx, dz))) * (beamLen * 0.5);
          const midZ = oz + (dz / Math.max(0.01, Math.hypot(dx, dz))) * (beamLen * 0.5);
          const yaw = Math.atan2(dx, dz);

          spawnConstruct({
            geo: sharedCylinderBeamGeo,
            color: '#f97316',
            delay: 0.15,
            duration: 0.75,
            sx: midX,
            sy: 1.25,
            sz: midZ,
            sScale: [1.35, beamLen, 1.35],
            eScale: [0.15, beamLen, 0.15],
            rot: [Math.PI / 2, 0, -yaw],
            opacity: 0.88,
          });
          spawnConstruct({
            geo: sharedCylinderBeamGeo,
            color: '#fef08a',
            delay: 0.15,
            duration: 0.68,
            sx: midX,
            sy: 1.25,
            sz: midZ,
            sScale: [0.65, beamLen, 0.65],
            eScale: [0.08, beamLen, 0.08],
            rot: [Math.PI / 2, 0, -yaw],
            opacity: 1.0,
          });
          emitRadialBurst({
            x: tx,
            y: 1.25,
            z: tz,
            count: 56,
            colorA: '#f97316',
            colorB: '#fef08a',
            speedMin: 3.5,
            speedMax: 10.5,
            upMin: 1.5,
            upMax: 7.5,
            sizeMin: 0.25,
            sizeMax: 0.62,
            lifeMin: 0.55,
            lifeMax: 0.95,
            kind: 1,
            bounce: true,
          });
          triggerCombatFlash(tx, 1.8, tz, '#f97316', 5.8, isLocalPlayer ? 0.15 : 0);
          break;
        }
        case 'psionic_blink': {
          spawnConstruct({
            geo: sharedShockRingGeo,
            color: '#fde047',
            duration: 0.45,
            sx: ox,
            sy: 0.9,
            sz: oz,
            sScale: [2.6, 1, 2.6],
            eScale: [0.2, 1, 0.2],
            opacity: 0.9,
          });
          spawnConstruct({
            geo: sharedSigilPlaneGeo,
            useSigilMap: true,
            color: '#fde047',
            delay: 0.15,
            duration: 0.85,
            sx: tx,
            sy: 0.08,
            sz: tz,
            sScale: [0.8, 1, 0.8],
            eScale: [r * 1.15, 1, r * 1.15],
            spin: [0, 5.0, 0],
            opacity: 0.95,
          });
          emitRadialBurst({
            x: tx,
            y: 1.0,
            z: tz,
            count: 68,
            colorA: '#fde047',
            colorB: '#ffffff',
            speedMin: 3.5,
            speedMax: 11.0,
            upMin: 2.0,
            upMax: 7.5,
            sizeMin: 0.28,
            sizeMax: 0.64,
            lifeMin: 0.45,
            lifeMax: 0.95,
            kind: 1,
            bounce: true,
          });
          triggerCombatFlash(tx, 2.0, tz, '#fde047', 5.5, isLocalPlayer ? 0.14 : 0);
          break;
        }
        case 'meteor_storm': {
          spawnDragonSwoopVfx(tx, tz, '#f59e0b', true);
          spawnLightningStrikeVfx(tx, tz, '#fde047', 6);
          spawnConstruct({
            geo: sharedSigilPlaneGeo,
            useSigilMap: true,
            color: '#ef4444',
            duration: 1.55,
            sx: tx,
            sy: 0.08,
            sz: tz,
            sScale: [r * 0.6, 1, r * 0.6],
            eScale: [r * 1.35, 1, r * 1.35],
            spin: [0, 2.4, 0],
            opacity: 0.95,
          });
          for (let m = 0; m < 5; m++) {
            const delay = 0.18 + m * 0.12;
            const ang = (m * Math.PI * 2) / 5;
            const hitX = m === 0 ? tx : tx + Math.cos(ang) * (r * 0.48);
            const hitZ = m === 0 ? tz : tz + Math.sin(ang) * (r * 0.48);
            spawnConstruct({
              geo: sharedSphereCoreGeo,
              color: m === 0 ? '#fef08a' : '#f97316',
              delay,
              duration: 0.45,
              sx: hitX - 4.8,
              sy: 14.5,
              sz: hitZ - 3.6,
              ex: hitX,
              ey: 0.45,
              ez: hitZ,
              sScale: [1.35, 1.35, 1.35],
              eScale: [1.9, 1.9, 1.9],
              spin: [6, 6, 4],
              opacity: 1.0,
              emitTrail: true,
              impactShake: isLocalPlayer ? (m === 0 ? 0.24 : 0.12) : 0,
            });
            spawnConstruct({
              geo: sharedShockRingGeo,
              color: '#fb923c',
              delay: delay + 0.28,
              duration: 0.72,
              sx: hitX,
              sy: 0.11,
              sz: hitZ,
              sScale: [0.6, 1, 0.6],
              eScale: [r * 1.05, 1, r * 1.05],
              opacity: 0.95,
            });
          }
          emitRadialBurst({
            x: tx,
            y: 0.8,
            z: tz,
            count: 140,
            colorA: '#ef4444',
            colorB: '#fde047',
            speedMin: 4.0,
            speedMax: 14.5,
            upMin: 4.5,
            upMax: 13.5,
            sizeMin: 0.34,
            sizeMax: 0.82,
            lifeMin: 0.65,
            lifeMax: 1.45,
            gravity: -12.5,
            kind: 0,
            spreadRadius: r * 0.45,
            bounce: true,
          });
          triggerCombatFlash(tx, 3.0, tz, '#f97316', 32.0, isLocalPlayer ? 1.45 : 0.6);
          spawnFallingParticleRain(tx, tz, r * 1.3, '#fef08a', 160);
          break;
        }
        case 'heavy_cleave': {
          const midX = ox + Math.sin(facingY) * 1.9;
          const midZ = oz + Math.cos(facingY) * 1.9;
          spawnConstruct({
            geo: sharedSlashArcGeo,
            color: '#ef4444',
            delay: 0.16,
            duration: 0.52,
            sx: midX,
            sy: 1.15,
            sz: midZ,
            ex: tx,
            ey: 1.0,
            ez: tz,
            sScale: [1.5, 1, 1.5],
            eScale: [r * 1.25, 1, r * 1.25],
            rot: [0.18, facingY, 0.24],
            spin: [0, 4.2, 0],
            opacity: 0.96,
          });
          spawnConstruct({
            geo: sharedShockRingGeo,
            color: '#fbbf24',
            delay: 0.22,
            duration: 0.65,
            sx: tx,
            sy: 0.1,
            sz: tz,
            sScale: [0.6, 1, 0.6],
            eScale: [r * 1.15, 1, r * 1.15],
            opacity: 0.92,
          });
          emitRadialBurst({
            x: tx,
            y: 1.0,
            z: tz,
            count: 56,
            colorA: '#ef4444',
            colorB: '#fde047',
            speedMin: 3.5,
            speedMax: 10.0,
            upMin: 2.0,
            upMax: 6.8,
            sizeMin: 0.26,
            sizeMax: 0.58,
            lifeMin: 0.45,
            lifeMax: 0.88,
            kind: 1,
            bounce: true,
          });
          triggerCombatFlash(tx, 1.6, tz, '#ef4444', 4.4, isLocalPlayer ? 0.1 : 0);
          break;
        }
        case 'whirlwind': {
          if (isLocalPlayer) whirlwindSpinTimer = 0.95;
          for (let layer = 0; layer < 3; layer++) {
            spawnConstruct({
              geo: sharedSlashArcGeo,
              color: layer === 1 ? '#fde047' : '#f97316',
              duration: 0.95,
              sx: tx,
              sy: 0.55 + layer * 0.65,
              sz: tz,
              sScale: [r * 0.55, 1, r * 0.55],
              eScale: [r * (1.05 - layer * 0.08), 1, r * (1.05 - layer * 0.08)],
              rot: [0.18 * (layer - 1), layer * 2.1, 0.15],
              spin: [0, 16.5, 0],
              opacity: 0.92,
            });
          }
          emitVortexSwirl({
            x: tx,
            z: tz,
            count: 110,
            radius: r * 0.95,
            heightMax: 2.4,
            colorA: '#f97316',
            colorB: '#fef08a',
            swirlSpeed: 11.5,
            inwardSpeed: -1.1,
            upMin: 1.5,
            upMax: 5.5,
            sizeMin: 0.25,
            sizeMax: 0.58,
            lifeMin: 0.65,
            lifeMax: 1.15,
            kind: 1,
          });
          triggerCombatFlash(tx, 1.6, tz, '#f97316', 5.0, isLocalPlayer ? 0.1 : 0);
          break;
        }
        case 'titan_aegis': {
          spawnConstruct({
            geo: sharedShockRingGeo,
            color: '#fbbf24',
            duration: 1.05,
            sx: tx,
            sy: 0.1,
            sz: tz,
            sScale: [0.8, 1, 0.8],
            eScale: [r * 1.25, 1, r * 1.25],
            opacity: 0.95,
          });
          emitRadialBurst({
            x: tx,
            y: 0.4,
            z: tz,
            count: 75,
            colorA: '#fbbf24',
            colorB: '#ef4444',
            speedMin: 1.5,
            speedMax: 6.5,
            upMin: 3.5,
            upMax: 8.5,
            sizeMin: 0.26,
            sizeMax: 0.58,
            lifeMin: 0.65,
            lifeMax: 1.15,
            gravity: -2.0,
            kind: 1,
          });
          triggerCombatFlash(tx, 2.0, tz, '#fbbf24', 5.0, isLocalPlayer ? 0.12 : 0);
          break;
        }
        case 'seismic_leap': {
          for (let k = 0; k < 6; k++) {
            const ang = (k * Math.PI * 2) / 6;
            spawnConstruct({
              geo: sharedConeSpikeGeo,
              color: k % 2 === 0 ? '#ef4444' : '#f97316',
              delay: 0.22,
              duration: 0.72,
              sx: tx + Math.cos(ang) * (r * 0.58),
              sy: 0.02,
              sz: tz + Math.sin(ang) * (r * 0.58),
              sScale: [0.7, 0.2, 0.7],
              eScale: [0.95, 1.85, 0.95],
              opacity: 0.92,
            });
          }
          emitRadialBurst({
            x: tx,
            y: 0.4,
            z: tz,
            count: 85,
            colorA: '#dc2626',
            colorB: '#fde047',
            speedMin: 4.0,
            speedMax: 12.0,
            upMin: 3.5,
            upMax: 10.0,
            sizeMin: 0.28,
            sizeMax: 0.68,
            lifeMin: 0.55,
            lifeMax: 1.15,
            gravity: -13.0,
            kind: 1,
            bounce: true,
          });
          triggerCombatFlash(tx, 1.8, tz, '#dc2626', 6.0, isLocalPlayer ? 0.18 : 0);
          break;
        }
        case 'molten_eruption': {
          spawnDragonSwoopVfx(tx, tz, '#ea580c', false);
          spawnLightningStrikeVfx(tx, tz, '#f97316', 4);
          for (let k = 0; k < 8; k++) {
            const ang = (k * Math.PI * 2) / 8;
            const dist = (0.28 + (k % 2) * 0.38) * r;
            spawnConstruct({
              geo: sharedConeSpikeGeo,
              color: k % 2 === 0 ? '#f97316' : '#fde047',
              delay: 0.22 + k * 0.05,
              duration: 0.75,
              sx: tx + Math.cos(ang) * dist,
              sy: 0.02,
              sz: tz + Math.sin(ang) * dist,
              sScale: [0.65, 0.15, 0.65],
              eScale: [1.05, 2.35, 1.05],
              opacity: 0.94,
            });
          }
          emitRadialBurst({
            x: tx,
            y: 0.35,
            z: tz,
            count: 105,
            colorA: '#ea580c',
            colorB: '#fef08a',
            speedMin: 2.5,
            speedMax: 9.5,
            upMin: 5.0,
            upMax: 13.0,
            sizeMin: 0.3,
            sizeMax: 0.72,
            lifeMin: 0.65,
            lifeMax: 1.35,
            gravity: -12.0,
            kind: 0,
            spreadRadius: r * 0.55,
            bounce: true,
          });
          triggerCombatFlash(tx, 2.5, tz, '#ea580c', 28.0, isLocalPlayer ? 1.3 : 0.5);
          spawnFallingParticleRain(tx, tz, r * 1.1, '#ea580c', 120);
          break;
        }
        case 'judgement_blade': {
          spawnDragonSwoopVfx(tx, tz, '#ef4444', true);
          spawnLightningStrikeVfx(tx, tz, '#f43f5e', 7);
          for (let s = 0; s < 16; s++) {
            const delay = 0.15 + s * 0.045;
            const ang = (s / 16) * Math.PI * 2;
            const dropDist = 1.2 + (s % 3) * 1.5;
            const destX = tx + Math.sin(ang) * dropDist;
            const destZ = tz + Math.cos(ang) * dropDist;
            spawnConstruct({
              geo: sharedGreatBladeGeo,
              color: s % 2 === 0 ? '#fef08a' : '#38bdf8',
              delay,
              duration: 0.85,
              sx: destX + (Math.random() - 0.5) * 6,
              sy: 16.0 + (s % 4) * 2,
              sz: destZ + (Math.random() - 0.5) * 6,
              ex: destX,
              ey: 1.2,
              ez: destZ,
              sScale: [1.1, 1.8, 0.35],
              eScale: [1.5, 2.2, 0.45],
              rot: [Math.PI, ang, 0.25],
              opacity: 1.0,
              emitTrail: true,
              impactShake: isLocalPlayer && s === 0 ? 0.75 : 0,
            });
          }
          spawnConstruct({
            geo: sharedShockRingGeo,
            color: '#fef08a',
            delay: 0.35,
            duration: 1.05,
            sx: tx,
            sy: 0.12,
            sz: tz,
            sScale: [0.5, 1, 0.5],
            eScale: [r * 1.45, 1, r * 1.45],
            opacity: 0.95,
          });
          emitRadialBurst({
            x: tx,
            y: 0.6,
            z: tz,
            count: 220,
            colorA: '#fbbf24',
            colorB: '#f43f5e',
            speedMin: 6.0,
            speedMax: 20.0,
            upMin: 6.0,
            upMax: 18.0,
            sizeMin: 0.38,
            sizeMax: 0.95,
            lifeMin: 0.75,
            lifeMax: 1.65,
            gravity: -14.0,
            kind: 1,
            spreadRadius: r * 0.8,
            bounce: true,
          });
          triggerCombatFlash(tx, 3.8, tz, '#fbbf24', 36.0, isLocalPlayer ? 1.65 : 0.85);
          spawnFallingParticleRain(tx, tz, r * 1.4, '#fde047', 180);
          break;
        }

        case 'twin_fang': {
          for (let k = 0; k < 2; k++) {
            const sign = k === 0 ? 1 : -1;
            spawnConstruct({
              geo: sharedSlashArcGeo,
              color: k === 0 ? '#10b981' : '#6ee7b7',
              delay: 0.14 + k * 0.12,
              duration: 0.48,
              sx: tx,
              sy: 1.15,
              sz: tz,
              sScale: [0.9, 1, 0.9],
              eScale: [r * 1.15, 1, r * 1.15],
              rot: [0.25 * sign, facingY, 0.68 * sign],
              spin: [0, 7.5 * sign, 0],
              opacity: 0.96,
            });
          }
          emitRadialBurst({
            x: tx,
            y: 1.1,
            z: tz,
            count: 48,
            colorA: '#10b981',
            colorB: '#a7f3d0',
            speedMin: 3.5,
            speedMax: 9.8,
            upMin: 1.8,
            upMax: 6.2,
            sizeMin: 0.24,
            sizeMax: 0.52,
            lifeMin: 0.45,
            lifeMax: 0.85,
            kind: 1,
          });
          triggerCombatFlash(tx, 1.5, tz, '#10b981', 4.0, isLocalPlayer ? 0.07 : 0);
          break;
        }
        case 'phantom_dash': {
          const dx = tx - ox;
          const dz = tz - oz;
          const dashLen = Math.max(2.5, Math.hypot(dx, dz));
          const midX = (ox + tx) * 0.5;
          const midZ = (oz + tz) * 0.5;
          const yaw = Math.atan2(dx, dz);

          spawnConstruct({
            geo: sharedCylinderBeamGeo,
            color: '#34d399',
            duration: 0.55,
            sx: midX,
            sy: 1.1,
            sz: midZ,
            sScale: [1.2, dashLen, 1.2],
            eScale: [0.1, dashLen, 0.1],
            rot: [Math.PI / 2, 0, -yaw],
            opacity: 0.85,
          });
          emitRadialBurst({
            x: tx,
            y: 1.05,
            z: tz,
            count: 48,
            colorA: '#10b981',
            colorB: '#67e8f9',
            speedMin: 2.5,
            speedMax: 8.5,
            upMin: 1.2,
            upMax: 5.5,
            sizeMin: 0.22,
            sizeMax: 0.52,
            lifeMin: 0.45,
            lifeMax: 0.85,
            kind: 1,
          });
          triggerCombatFlash(tx, 1.5, tz, '#34d399', 4.6, isLocalPlayer ? 0.1 : 0);
          break;
        }
        case 'bio_overdrive': {
          for (let h = 0; h < 3; h++) {
            spawnConstruct({
              geo: sharedTorusHaloGeo,
              color: h % 2 === 0 ? '#10b981' : '#22d3ee',
              delay: h * 0.08,
              duration: 1.15,
              sx: tx,
              sy: 0.25,
              sz: tz,
              ex: tx,
              ey: 2.45,
              ez: tz,
              sScale: [1.6, 1.6, 1.6],
              eScale: [2.2, 2.2, 2.2],
              spin: [0, 8.0 * (h % 2 === 0 ? 1 : -1), 0],
              opacity: 0.9,
            });
          }
          emitVortexSwirl({
            x: tx,
            z: tz,
            count: 85,
            radius: 2.2,
            heightMax: 1.0,
            colorA: '#10b981',
            colorB: '#67e8f9',
            swirlSpeed: 7.5,
            inwardSpeed: -0.5,
            upMin: 2.8,
            upMax: 6.2,
            sizeMin: 0.24,
            sizeMax: 0.54,
            lifeMin: 0.75,
            lifeMax: 1.25,
            kind: 2,
          });
          triggerCombatFlash(tx, 1.8, tz, '#10b981', 4.6, 0);
          break;
        }
        case 'acid_vortex': {
          spawnConstruct({
            geo: sharedCylinderBeamGeo,
            color: '#10b981',
            duration: 1.15,
            sx: tx,
            sy: 2.2,
            sz: tz,
            sScale: [1.1, 4.4, 1.1],
            eScale: [r * 0.78, 5.2, r * 0.78],
            spin: [0, 9.5, 0],
            opacity: 0.58,
          });
          emitVortexSwirl({
            x: tx,
            z: tz,
            count: 115,
            radius: r * 1.0,
            heightMax: 3.0,
            colorA: '#10b981',
            colorB: '#a3e635',
            swirlSpeed: 9.8,
            inwardSpeed: 2.2,
            upMin: 1.4,
            upMax: 5.5,
            sizeMin: 0.26,
            sizeMax: 0.62,
            lifeMin: 0.75,
            lifeMax: 1.35,
            kind: 2,
          });
          triggerCombatFlash(tx, 1.8, tz, '#10b981', 5.2, isLocalPlayer ? 0.12 : 0);
          break;
        }
        case 'razor_tempest': {
          if (isLocalPlayer) whirlwindSpinTimer = 0.95;
          for (let b = 0; b < 7; b++) {
            spawnConstruct({
              geo: sharedSlashArcGeo,
              color: b % 2 === 0 ? '#14b8a6' : '#a7f3d0',
              delay: b * 0.08,
              duration: 0.48,
              sx: tx,
              sy: 0.9 + (b % 3) * 0.55,
              sz: tz,
              sScale: [r * 0.48, 1, r * 0.48],
              eScale: [r * 1.1, 1, r * 1.1],
              rot: [(b % 3) * 0.4, (b * Math.PI) / 3.5, 0.3],
              spin: [0, (b % 2 === 0 ? 1 : -1) * 14.0, 0],
              opacity: 0.95,
            });
          }
          emitRadialBurst({
            x: tx,
            y: 1.3,
            z: tz,
            count: 95,
            colorA: '#14b8a6',
            colorB: '#f0fdfa',
            speedMin: 4.0,
            speedMax: 12.5,
            upMin: 1.5,
            upMax: 7.5,
            sizeMin: 0.25,
            sizeMax: 0.6,
            lifeMin: 0.55,
            lifeMax: 1.15,
            kind: 1,
            spreadRadius: r * 0.45,
          });
          triggerCombatFlash(tx, 1.8, tz, '#14b8a6', 5.8, isLocalPlayer ? 0.14 : 0);
          break;
        }
        case 'apex_predator': {
          spawnDragonSwoopVfx(tx, tz, '#10b981', true);
          spawnLightningStrikeVfx(tx, tz, '#34d399', 6);
          for (let cIdx = -1; cIdx <= 1; cIdx++) {
            const perpX = Math.cos(facingY) * (cIdx * 1.35);
            const perpZ = -Math.sin(facingY) * (cIdx * 1.35);
            spawnConstruct({
              geo: sharedSlashArcGeo,
              color: cIdx === 0 ? '#a7f3d0' : '#10b981',
              delay: 0.2 + (cIdx + 1) * 0.08,
              duration: 0.75,
              sx: tx + perpX,
              sy: 1.45,
              sz: tz + perpZ,
              sScale: [r * 0.5, 1, r * 0.5],
              eScale: [r * 1.25, 1, r * 1.25],
              rot: [0.55, facingY, 0.32 * cIdx],
              spin: [0, 6.0, 0],
              opacity: 0.98,
              impactShake: isLocalPlayer && cIdx === 0 ? 0.22 : 0,
            });
          }
          spawnConstruct({
            geo: sharedShockRingGeo,
            color: '#34d399',
            delay: 0.32,
            duration: 1.05,
            sx: tx,
            sy: 0.12,
            sz: tz,
            sScale: [0.5, 1, 0.5],
            eScale: [r * 1.35, 1, r * 1.35],
            opacity: 0.95,
          });
          emitRadialBurst({
            x: tx,
            y: 0.7,
            z: tz,
            count: 150,
            colorA: '#10b981',
            colorB: '#67e8f9',
            speedMin: 5.0,
            speedMax: 16.5,
            upMin: 4.0,
            upMax: 14.0,
            sizeMin: 0.32,
            sizeMax: 0.85,
            lifeMin: 0.65,
            lifeMax: 1.45,
            gravity: -13.0,
            kind: 1,
            spreadRadius: r * 0.55,
            bounce: true,
          });
          triggerCombatFlash(tx, 3.2, tz, '#10b981', 30.0, isLocalPlayer ? 1.4 : 0.6);
          spawnFallingParticleRain(tx, tz, r * 1.2, '#6ee7b7', 140);
          break;
        }

      }
    };

    const rebuildPlayerActor = () => {
      if (playerRig) {
        playerHolder.remove(playerRig.root);
      }
      const c = charRef.current;
      playerRig = buildCharacterRig({
        classId: c.classId,
        hairColor: c.hairColor,
        accentColor: c.accentColor,
        equippedWeapon: c.equippedWeapon,
        equippedArmor: c.equippedArmor,
        equippedHelm: c.equippedHelm,
        equippedWings: c.equippedWings,
        equippedMount: c.equippedMount,
        enhanceLevel: c.enhanceLevel,
        mounted: c.mounted,
      });
      playerHolder.add(playerRig.root);
    };
    rebuildPlayerRigRef.current = rebuildPlayerActor;

    // =========================================================================
    // BUILD 3D MAP ENVIRONMENT: HOÀNG THÀNH THÁNH TÍCH (MAP 1) VS 31 HUNTING MAPS
    // =========================================================================
    const buildMapWorld = (mapId: number, preservePlayerPos = false) => {
      isBuildingMap = true; // Pause rendering
      const mapDef = MAPS_DATA.find((m) => m.id === mapId) || MAPS_DATA[0];
      const isCitadel = mapDef.id === CITADEL_MAP_ID || mapDef.safeZone;

      for (const grp of [mapEnvironmentGroup, npcGroup, monstersGroup, lootGroup]) {
        while (grp.children.length > 0) {
          grp.remove(grp.children[0]);
        }
      }
      citadelAnimatedCrystals = [];
      cullableProps = [];
      npcVisuals = [];
      monsterVisuals.clear();
      lootVisuals.clear();
      selectedMonsterId = null;
      callbacksRef.current.onTargetUpdate(null);

      // AAA Linear/Exponential Horizon Fog
      activeFogBaseNear = isCitadel ? 22 : 19;
      activeFogBaseFar = isCitadel ? 46 : 41;
      
      scene.background = new THREE.Color(mapDef.fogColor).lerp(new THREE.Color(mapDef.skyColor), 0.35);
      
      // Use FogExp2 for depth-based atmospheric fog
      const fogDensity = mapDef.fogDensity || 0.035;
      scene.fog = new THREE.FogExp2(mapDef.fogColor, fogDensity * (1.0 / camZoomScale));
      
      camera.far = Math.max(52, activeFogBaseFar * camZoomScale + 9);
      camera.updateProjectionMatrix();

      const customMap = assetRegistry.instantiateSlot('map_env_' + mapId);
      if (customMap) {
        // RENDER CUSTOM 3D ENVIRONMENT (Overrides all procedural terrain/props!)
        mapEnvironmentGroup.add(customMap.group);

        // We still need a collision/raycast ground plane (invisible)
        const collisionGround = new THREE.Mesh(
          new THREE.PlaneGeometry(400, 400),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        collisionGround.rotation.x = -Math.PI / 2;
        mapEnvironmentGroup.add(collisionGround);
      } else {
        const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        const groundSlotKey = isCitadel
          ? 'map_ground_citadel'
          : mapId <= 6
          ? 'map_ground_hunting_1'
          : mapId <= 10
          ? 'map_ground_marsh'
          : mapId <= 13
          ? 'map_ground_frost'
          : mapId >= 29
          ? 'map_ground_void'
          : mapId >= 24
          ? 'map_ground_magma'
          : 'map_ground_hunting_1';
        const customGroundOv = assetRegistry.getOverride(groundSlotKey);
        const customGroundModel = assetRegistry.instantiateSlot(groundSlotKey);

        let groundTex: THREE.Texture = createThemedGroundTexture(
          mapDef.id,
          mapDef.groundColor,
          mapDef.accentColor
        );
        if (
          customGroundOv?.modelUrl &&
          /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(customGroundOv.modelUrl)
        ) {
          const loadedTex = new THREE.TextureLoader().load(customGroundOv.modelUrl);
          loadedTex.colorSpace = THREE.SRGBColorSpace;
          loadedTex.wrapS = THREE.RepeatWrapping;
          loadedTex.wrapT = THREE.RepeatWrapping;
          loadedTex.repeat.set(22, 22);
          loadedTex.generateMipmaps = true;
          loadedTex.minFilter = THREE.LinearMipmapLinearFilter;
          loadedTex.magFilter = THREE.LinearFilter;
          groundTex = loadedTex;
        }
        groundTex.anisotropy = maxAniso;

        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(240, 240),
          new THREE.MeshStandardMaterial({
            map: groundTex,
            roughness: isCitadel ? 0.58 : 0.88,
            metalness: isCitadel ? 0.22 : 0.12,
          })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        mapEnvironmentGroup.add(ground);

        if (customGroundModel && !/\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(customGroundOv?.modelUrl || '')) {
          customGroundModel.group.position.set(0, 0.02, 0);
          mapEnvironmentGroup.add(customGroundModel.group);
        }

        if (isCitadel) {
          // MAP 1: GRAND MONSTER-FREE IMPERIAL CITADEL + ALL 8 AAA MMO NPCS!
          const citadelBuilt = buildImperialCitadel3D(NPCS_DATA, IS_SOFTWARE_GL);
          mapEnvironmentGroup.add(citadelBuilt.group);
          citadelAnimatedCrystals = citadelBuilt.animatedCrystals;
        } else {
          // MAPS 2..32: 31 HUNTING & BOSS BATTLEFIELDS (NO TOWN NPCS, DUAL PORTALS)
          const safePadMat = new THREE.MeshStandardMaterial({
            color: '#1e293b',
            metalness: 0.78,
            roughness: 0.32,
          });
          const safePad = new THREE.Mesh(
            new THREE.CylinderGeometry(10.2, 10.8, 0.12, 36),
            safePadMat
          );
          safePad.position.set(0, 0.06, 0);
          safePad.receiveShadow = true;
          mapEnvironmentGroup.add(safePad);

          const safeRing = new THREE.Mesh(
            new THREE.RingGeometry(10.0, 10.4, 48),
            new THREE.MeshBasicMaterial({
              color: mapDef.accentColor,
              side: THREE.DoubleSide,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1,
            })
          );
          safeRing.rotation.x = -Math.PI / 2;
          safeRing.position.y = 0.13;
          mapEnvironmentGroup.add(safeRing);

          // Perimeter Cliffs (InstancedMesh)
          const rockGeo = new THREE.DodecahedronGeometry(3.2, 0);
          const rockMat = new THREE.MeshStandardMaterial({
            color: '#3f3f46',
            roughness: 0.85,
            metalness: 0.15,
          });
          const cliffCount = 44;
          const cliffInst = new THREE.InstancedMesh(rockGeo, rockMat, cliffCount);
          cliffInst.castShadow = !IS_SOFTWARE_GL;
          cliffInst.receiveShadow = true;

          for (let i = 0; i < cliffCount; i++) {
            const ang = (i / cliffCount) * Math.PI * 2;
            const rad = 52 + (i % 3) * 4.5;
            _dummyObj.position.set(Math.cos(ang) * rad, 1.4 + (i % 4) * 0.6, Math.sin(ang) * rad);
            _dummyObj.rotation.set((i * 0.7) % 3, ang, (i * 0.3) % 2);
            const s = 0.85 + ((i * 17) % 35) / 100;
            _dummyObj.scale.set(s * 1.4, s * (1.2 + (i % 3) * 0.55), s * 1.3);
            _dummyObj.updateMatrix();
            cliffInst.setMatrixAt(i, _dummyObj.matrix);
            _tempColor.set(mapDef.groundColor).lerp(new THREE.Color('#52525b'), (i % 5) * 0.12);
            cliffInst.setColorAt(i, _tempColor);
          }
          cliffInst.instanceMatrix.needsUpdate = true;
          if (cliffInst.instanceColor) cliffInst.instanceColor.needsUpdate = true;
          cliffInst.computeBoundingSphere();
          mapEnvironmentGroup.add(cliffInst);

          // Load Custom User-Placed 3D Objects (Unity / Godot Style Map Editor)
          const placements = assetRegistry.getMapPlacements(mapId);
          for (const plc of placements) {
            const customObj = assetRegistry.instantiateSlot(plc.slotKey);
            if (customObj) {
              customObj.group.position.set(plc.x, 0, plc.z);
              customObj.group.scale.multiplyScalar(plc.scale || 1.0);
              customObj.group.rotation.y = THREE.MathUtils.degToRad(plc.rotationY || 0);
              customObj.group.userData = { cullableProp: true, boundRadius: 6.0, customPlacementId: plc.id };
              mapEnvironmentGroup.add(customObj.group);
              cullableProps.push({
                obj: customObj.group,
                x: plc.x,
                z: plc.z,
                radius: 6.0,
              });
            }
          }
        }
      }

      if (isCitadel) {
        for (const npc of NPCS_DATA) {
          const nHolder = new THREE.Group();
          nHolder.position.set(npc.x, 0.34, npc.z);
          nHolder.rotation.y = npc.rotY;
          nHolder.userData = { kind: 'npc', npc };

          const npcRig = buildCharacterRig({
            classId:
              npc.action === 'forge' || npc.action === 'vault' || npc.action === 'trainer'
                ? 'vanguard'
                : npc.action === 'shop' || npc.action === 'assets'
                ? 'evolver'
                : 'esper',
            hairColor: npc.accentColor,
            accentColor: npc.accentColor,
            equippedWeapon:
              npc.action === 'forge'
                ? 'wpn_vanguard_5'
                : npc.action === 'trainer'
                ? 'wpn_vanguard_4'
                : npc.action === 'shop'
                ? 'wpn_evolver_4'
                : 'wpn_esper_5',
            equippedArmor: 'arm_t5',
            equippedHelm: npc.action === 'healer' || npc.action === 'shop' ? 'hlm_t1' : 'hlm_t4',
            equippedWings:
              npc.action === 'teleport' || npc.action === 'healer' || npc.action === 'quest'
                ? 'wng_t4_void'
                : 'none',
            equippedMount: 'none',
            enhanceLevel: 13,
            mounted: false,
            overrideSlotKey: npc.assetSlotKey,
          });
          nHolder.add(npcRig.root);

          const hitCyl = new THREE.Mesh(
            new THREE.CylinderGeometry(1.35, 1.35, 2.6, 8),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          hitCyl.position.y = 1.3;
          hitCyl.userData = { kind: 'npc', npc };
          nHolder.add(hitCyl);

          npcGroup.add(nHolder);
          npcVisuals.push({ npc, holder: nHolder, rig: npcRig });
        }
      } else {
        // North Advance Portal (0, -38) & South Return-to-Citadel Portal (0, 38)
        const buildPortalArch = (x: number, z: number, glowColor: string) => {
          const customPortal = assetRegistry.instantiateSlot('map_portal_arch');
          if (customPortal) {
            customPortal.group.scale.multiplyScalar(2.2);
            customPortal.group.position.set(x, 0, z);
            customPortal.group.userData = { cullableProp: true, boundRadius: 6.5 };
            mapEnvironmentGroup.add(customPortal.group);
            return;
          }
          const pg = new THREE.Group();
          pg.position.set(x, 0, z);
          pg.userData = { cullableProp: true, boundRadius: 6.5 };
          const archMat = new THREE.MeshStandardMaterial({
            color: '#18181b',
            metalness: 0.9,
            roughness: 0.2,
          });
          const pGlow = new THREE.MeshStandardMaterial({
            color: glowColor,
            emissive: glowColor,
            emissiveIntensity: 1.9,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide,
          });
          const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 0.22, 24), archMat);
          pad.position.y = 0.11;
          pg.add(pad);

          const outerTorus = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.22, 10, 32), archMat);
          outerTorus.position.y = 2.3;
          pg.add(outerTorus);

          const vortex = new THREE.Mesh(new THREE.CircleGeometry(1.9, 28), pGlow);
          vortex.position.y = 2.3;
          pg.add(vortex);
          mapEnvironmentGroup.add(pg);
        };

        buildPortalArch(NORTH_PORTAL_POS.x, NORTH_PORTAL_POS.z, mapDef.accentColor);
        buildPortalArch(SOUTH_PORTAL_POS.x, SOUTH_PORTAL_POS.z, '#fbbf24');
      }

      // Collect all cullable world props (houses, trees, rocks, statues, palace, portals, NPC stations)
      mapEnvironmentGroup.updateMatrixWorld(true);
      mapEnvironmentGroup.traverse((obj) => {
        if (obj.userData?.cullableProp) {
          _projVec.setFromMatrixPosition(obj.matrixWorld);
          cullableProps.push({
            obj,
            x: _projVec.x,
            z: _projVec.z,
            radius: obj.userData.boundRadius || 6.8,
          });
        }
      });

      if (!preservePlayerPos) {
        if (serverSelfRef.current.mapId === mapId) {
          playerX = serverSelfRef.current.x;
          playerZ = serverSelfRef.current.z;
          playerRotY = serverSelfRef.current.rotY;
        } else {
          playerX = 0;
          playerZ = isCitadel ? 9 : 4;
        }
        pendingInputs.length = 0;
        visualErrX = 0;
        visualErrZ = 0;
        hasInitialServerSync = Boolean(
          serverSelfRef.current.synced && serverSelfRef.current.mapId === mapId
        );
        lastTeleportSeq = serverSelfRef.current.teleportSeq ?? -1;
        lastAppliedStateSeq = serverSelfRef.current.stateSeq ?? -1;
        moveMarker.visible = false;
        pendingNpcTarget = null;
      }

      // Reset weather on map change
      if (mapDef.biome === 'toxic_marsh') weatherState.type = 'rain';
      else if (mapDef.biome === 'permafrost') weatherState.type = 'snow';
      else if (mapDef.biome === 'iron_desert') weatherState.type = 'sandstorm';
      else if (mapDef.biome === 'magma_rift') weatherState.type = 'embers';
      else if (mapDef.biome === 'void_singularity') weatherState.type = 'void';
      else weatherState.type = 'clear';

      try {
        if (weatherState.type !== 'clear') {
          soundFX.playWeather(weatherState.type);
        } else {
          soundFX.stopWeather();
        }
      } catch {}
      isBuildingMap = false; // Resume rendering
    };

    rebuildMapRef.current = buildMapWorld;
    rebuildPlayerActor();
    buildMapWorld(charRef.current.mapId);

    if (!IS_SOFTWARE_GL) {
      renderer.compile(scene, camera);
    }

    // Helper: Find nearest living monster from authoritative server snapshot
    const findNearestServerMonster = (maxDist = 48): ServerMonsterSnapshot | null => {
      if (charRef.current.mapId === CITADEL_MAP_ID) return null;
      let best: ServerMonsterSnapshot | null = null;
      let bestD = maxDist;
      for (const m of serverMonstersRef.current.values()) {
        if (m.dead) continue;
        const d = Math.hypot(m.x - playerX, m.z - playerZ);
        if (d < bestD) {
          bestD = d;
          best = m;
        }
      }
      return best;
    };

    const sendAttackIntent = () => {
      const target =
        (selectedMonsterId ? serverMonstersRef.current.get(selectedMonsterId) : null) ||
        findNearestServerMonster(15);
      if (target && !target.dead) {
        selectedMonsterId = target.id;
        callbacksRef.current.onSendAttack(target.id);
      } else {
        callbacksRef.current.onSendAttack(undefined);
      }
    };

    const sendDodgeIntent = (rawKx = 0, rawKz = 0) => {
      let ix = rawKx;
      let iz = rawKz;
      if (Math.hypot(ix, iz) < 0.08) {
        ix = joystickVecRef.current.x;
        iz = joystickVecRef.current.y;
      }
      let wx = Math.sin(playerRotY);
      let wz = Math.cos(playerRotY);
      if (Math.hypot(ix, iz) > 0.08) {
        const len = Math.hypot(ix, iz);
        const nx = ix / len;
        const nz = iz / len;
        const sinY = Math.sin(camYaw);
        const cosY = Math.cos(camYaw);
        wx = nx * cosY + nz * sinY;
        wz = -nx * sinY + nz * cosY;
      }
      pendingNpcTarget = null;
      moveMarker.visible = false;
      callbacksRef.current.onSendDodge(wx, wz);
    };

    const sendSkillIntent = (skillIdx: number) => {
      const cls = CLASSES_DATA[charRef.current.classId];
      const skill = cls.skills[skillIdx];
      if (!skill) return;
      const target =
        (selectedMonsterId ? serverMonstersRef.current.get(selectedMonsterId) : null) ||
        findNearestServerMonster(skill.range + 4);
      if (target && !target.dead) {
        selectedMonsterId = target.id;
        callbacksRef.current.onSendSkill(skillIdx, target.id, target.x, target.z);
      } else {
        const tx = playerX + Math.sin(playerRotY) * Math.min(4.5, skill.range * 0.6);
        const tz = playerZ + Math.cos(playerRotY) * Math.min(4.5, skill.range * 0.6);
        callbacksRef.current.onSendSkill(skillIdx, undefined, tx, tz);
      }
    };

    // Imperative Controller Handle (Triggered by HUD & Server Broadcast Packets)
    worldControlRef.current = {
      triggerBasicAttack: sendAttackIntent,
      triggerDodgeDash: () => sendDodgeIntent(),
      triggerSkill: sendSkillIntent,
      playServerVfxEvent: (ev: ServerCombatVfxEvent) => {
        const isLocal = ev.actorId === charRef.current.id;
        if (ev.kind === 'basic') {
          const clsId = ev.classId || 'esper';
          const stage = ev.comboStage || 1;
          const facing = Math.atan2(ev.tx - ev.ox, ev.tz - ev.oz) || playerRotY;
          if (isLocal) {
            soundFX.playSlash((clsId === 'esper' ? 350 : 205) + (stage === 2 ? 45 : 0));
            if (stage === 3) {
              soundFX.playComboFinisher(clsId === 'esper' ? 340 : 250);
            }
          }
          spawnBasicAttackVfx(clsId, stage, ev.ox, ev.oz, ev.tx, ev.tz, facing, isLocal);
        } else if (ev.kind === 'skill' && ev.vfx) {
          if (isLocal && typeof ev.skillIndex === 'number') {
            soundFX.playSkill(ev.skillIndex);
          }
          spawnChoreographedSkillVfx({
            vfx: ev.vfx,
            color: ev.color,
            ox: ev.ox,
            oz: ev.oz,
            tx: ev.tx,
            tz: ev.tz,
            radius: ev.radius || 4.0,
            isLocalPlayer: isLocal,
          });
        } else if (ev.kind === 'dash') {
          if (isLocal) soundFX.playDash();
          spawnConstruct({
            geo: sharedShockRingGeo,
            color: '#38bdf8',
            duration: 0.34,
            sx: ev.ox,
            sy: 0.12,
            sz: ev.oz,
            sScale: [0.55, 1, 0.55],
            eScale: [2.3, 1, 2.3],
            opacity: 0.88,
          });
          emitRadialBurst({
            x: ev.ox,
            y: 0.85,
            z: ev.oz,
            count: 24,
            colorA: '#38bdf8',
            colorB: '#ffffff',
            speedMin: 2.2,
            speedMax: 6.5,
            upMin: 0.6,
            upMax: 3.2,
            sizeMin: 0.22,
            sizeMax: 0.48,
            lifeMin: 0.24,
            lifeMax: 0.48,
            kind: 1,
          });
        } else if (ev.kind === 'mob_attack') {
          emitRadialBurst({
            x: ev.tx,
            y: 1.0,
            z: ev.tz,
            count: 14,
            colorA: ev.color,
            colorB: '#ffffff',
            speedMin: 1.8,
            speedMax: 5.2,
            upMin: 0.8,
            upMax: 3.5,
            sizeMin: 0.2,
            sizeMax: 0.4,
            lifeMin: 0.2,
            lifeMax: 0.4,
            kind: 1,
          });
        } else if (ev.kind === 'heal' || ev.kind === 'buff') {
          if (isLocal) soundFX.playLevelUp();
          spawnConstruct({
            geo: sharedSigilPlaneGeo,
            useSigilMap: true,
            color: ev.color,
            duration: 0.9,
            sx: ev.tx,
            sy: 0.08,
            sz: ev.tz,
            sScale: [0.9, 1, 0.9],
            eScale: [3.2, 1, 3.2],
            spin: [0, 3.4, 0],
            opacity: 0.92,
          });
          emitVortexSwirl({
            x: ev.tx,
            z: ev.tz,
            count: 64,
            radius: 2.4,
            heightMax: 1.4,
            colorA: ev.color,
            colorB: '#ffffff',
            swirlSpeed: 6.2,
            inwardSpeed: -0.5,
            upMin: 2.4,
            upMax: 6.0,
            sizeMin: 0.24,
            sizeMax: 0.54,
            lifeMin: 0.5,
            lifeMax: 0.95,
            kind: 1,
          });
          triggerCombatFlash(ev.tx, 2.0, ev.tz, ev.color, 4.5, 0);
        }
      },
      playServerFloatingEvent: (ev: ServerFloatingEvent) => {
        spawnFloatingText(ev.wx, ev.wy, ev.wz, ev.text, ev.color, ev.crit);
      },
      pickupNearestLoot: () => {
        callbacksRef.current.onSendPickupLoot(undefined);
      },
      navigateToQuestTarget: () => {
        const mob = findNearestServerMonster(85);
        if (mob) {
          selectedMonsterId = mob.id;
          callbacksRef.current.onSendMoveTo(mob.x, mob.z);
        }
      },
      navigateToNpc: (npcId: string) => {
        const npc = NPCS_DATA.find((n) => n.id === npcId);
        if (!npc) return;
        if (Math.hypot(npc.x - playerX, npc.z - playerZ) < 4.8) {
          callbacksRef.current.onNpcInteract(npc);
        } else {
          pendingNpcTarget = npc;
          callbacksRef.current.onSendMoveTo(npc.x, npc.z + 2.0);
          moveMarker.position.set(npc.x, 0.06, npc.z + 2.0);
          moveMarker.visible = true;
        }
      },
      cycleCameraPreset: () => {
        camPresetIdx = (camPresetIdx + 1) % camPresets.length;
        camZoomScale = 1.0;
        camPitchOffset = 0;
        return camPresetIdx;
      },
      zoomCamera: (deltaScale: number) => {
        camZoomScale = THREE.MathUtils.clamp(camZoomScale + deltaScale, 0.55, 1.75);
      },
      resetCamera: () => {
        camPresetIdx = 0;
        camZoomScale = 1.0;
        camPitchOffset = 0;
        camYaw = 0;
      },
    };

    // Keyboard & Pointer Controls (Send Intent Only!)
    const keysDown = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      keysDown.add(k);
      if (k === ' ') {
        e.preventDefault();
        sendAttackIntent();
      } else if (k === 'shift') {
        e.preventDefault();
        let kx = 0;
        let kz = 0;
        if (keysDown.has('w') || keysDown.has('arrowup')) kz -= 1;
        if (keysDown.has('s') || keysDown.has('arrowdown')) kz += 1;
        if (keysDown.has('a') || keysDown.has('arrowleft')) kx -= 1;
        if (keysDown.has('d') || keysDown.has('arrowright')) kx += 1;
        sendDodgeIntent(kx, kz);
      } else if (k >= '1' && k <= '6') {
        sendSkillIntent(Number(k) - 1);
      } else if (k === 'f') {
        callbacksRef.current.onSendPickupLoot(undefined);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const raycaster = new THREE.Raycaster();
    let pointerDownPos = { x: 0, y: 0 };
    let isOrbitDrag = false;
    let activeOrbitPointerId = -1;
    let prevOrbitH = 0;
    let prevOrbitV = 0;
    const activeTouchPoints = new Map<number, { x: number; y: number }>();
    const canvasDownPointers = new Set<number>();
    let prevPinchDist = 0;

    const getLogicalAxes = (clientX: number, clientY: number) =>
      rotatedPortraitRef.current
        ? { h: clientY, v: -clientX }
        : { h: clientX, v: clientY };

    const onPointerDown = (e: PointerEvent) => {
      canvasDownPointers.add(e.pointerId);
      activeTouchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activeTouchPoints.size === 2) {
        const pts = Array.from(activeTouchPoints.values());
        prevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        isOrbitDrag = false;
        return;
      }

      pointerDownPos = { x: e.clientX, y: e.clientY };
      const axes = getLogicalAxes(e.clientX, e.clientY);
      activeOrbitPointerId = e.pointerId;
      prevOrbitH = axes.h;
      prevOrbitV = axes.v;
      isOrbitDrag = e.button === 2;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activeTouchPoints.has(e.pointerId)) {
        activeTouchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (activeTouchPoints.size >= 2) {
        const pts = Array.from(activeTouchPoints.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (prevPinchDist > 8) {
          const delta = prevPinchDist - dist;
          camZoomScale = THREE.MathUtils.clamp(camZoomScale + delta * 0.0042, 0.55, 1.75);
        }
        prevPinchDist = dist;
        return;
      }

      if (e.pointerId !== activeOrbitPointerId) return;
      const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (!isOrbitDrag && (e.buttons & 1 || e.pointerType === 'touch') && moveDist > 11) {
        isOrbitDrag = true;
      }
      if (isOrbitDrag) {
        const axes = getLogicalAxes(e.clientX, e.clientY);
        const dh = axes.h - prevOrbitH;
        const dv = axes.v - prevOrbitV;
        prevOrbitH = axes.h;
        prevOrbitV = axes.v;
        camYaw -= dh * 0.0075;
        camPitchOffset = THREE.MathUtils.clamp(camPitchOffset + dv * 0.045, -5.5, 9.5);
      } else {
        const axes = getLogicalAxes(e.clientX, e.clientY);
        prevOrbitH = axes.h;
        prevOrbitV = axes.v;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const startedOnCanvas = canvasDownPointers.delete(e.pointerId);
      const wasMultiTouch = activeTouchPoints.size >= 2;
      activeTouchPoints.delete(e.pointerId);
      if (activeTouchPoints.size < 2) {
        prevPinchDist = 0;
      }
      if (e.pointerId === activeOrbitPointerId) {
        activeOrbitPointerId = -1;
      }
      if (!startedOnCanvas) {
        return;
      }
      if (e.button === 2 || isOrbitDrag || wasMultiTouch) {
        if (activeTouchPoints.size === 0) isOrbitDrag = false;
        return;
      }
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 12) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      if (rotatedPortraitRef.current) {
        const u = (e.clientY - rect.top) / Math.max(1, rect.height);
        const v = 1 - (e.clientX - rect.left) / Math.max(1, rect.width);
        _rayMouse.x = u * 2 - 1;
        _rayMouse.y = -(v * 2 - 1);
      } else {
        _rayMouse.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        _rayMouse.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      }
      raycaster.setFromCamera(_rayMouse, camera);

      const interactables = [
        ...npcGroup.children,
        ...monstersGroup.children.filter((c) => c.visible),
        ...lootGroup.children,
      ];
      const hits = raycaster.intersectObjects(interactables, true);
      for (const hit of hits) {
        let cur: THREE.Object3D | null = hit.object;
        while (cur) {
          if (cur.userData?.kind === 'npc') {
            const npc = cur.userData.npc as NpcDef;
            if (Math.hypot(npc.x - playerX, npc.z - playerZ) < 5.0) {
              callbacksRef.current.onNpcInteract(npc);
            } else {
              pendingNpcTarget = npc;
              callbacksRef.current.onSendMoveTo(npc.x, npc.z + 2.0);
              moveMarker.position.set(npc.x, 0.06, npc.z + 2.0);
              moveMarker.visible = true;
            }
            return;
          }
          if (cur.userData?.kind === 'loot') {
            const lootId = String(cur.userData.lootId || '');
            const loot = serverLootsRef.current.get(lootId);
            if (loot) {
              if (Math.hypot(loot.x - playerX, loot.z - playerZ) < 4.5) {
                callbacksRef.current.onSendPickupLoot(loot.id);
              } else {
                callbacksRef.current.onSendMoveTo(loot.x, loot.z);
              }
              return;
            }
          }
          if (cur.userData?.kind === 'mob') {
            const mobId = String(cur.userData.mobId || '');
            const mob = serverMonstersRef.current.get(mobId);
            if (mob && !mob.dead) {
              selectedMonsterId = mob.id;
              callbacksRef.current.onTargetUpdate({
                id: mob.id,
                name: mob.name,
                level: mob.level,
                hp: mob.hp,
                maxHp: mob.maxHp,
                isBoss: mob.isBoss,
                statuses: mob.statuses,
              });
              callbacksRef.current.onSendAttack(mob.id);
              return;
            }
          }
          cur = cur.parent;
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camZoomScale = THREE.MathUtils.clamp(camZoomScale + e.deltaY * 0.001, 0.55, 1.75);
    };

    const domEl = renderer.domElement;
    domEl.style.touchAction = 'none';
    const preventContext = (e: MouseEvent) => e.preventDefault();
    domEl.addEventListener('contextmenu', preventContext);
    domEl.addEventListener('pointerdown', onPointerDown);
    domEl.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    const onResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth || container.offsetWidth, 240);
      const h = Math.max(container.clientHeight || container.offsetHeight, 180);
      const nextPr = getSharpPixelRatio();
      renderer.setPixelRatio(nextPr);
      particleMat.uniforms.uPixelRatio.value = nextPr;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', onResize);
    const resizeObs =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => onResize()) : null;
    resizeObs?.observe(container);

    let lastTime = performance.now();
    const startTime = lastTime;
    let frameId = 0;
    let disposed = false;
    let hudSyncAccum = 0;
    let inputSendAccum = 0;
    let autoBattleAccum = 0;
    let lastSentMoving = false;
    let lastSentYaw = 0;
    let lastSentDirX = 0;
    let lastSentDirZ = 0;

    // Genuine hardware WebGL rendered FPS measurement (works across 30Hz/60Hz/90Hz/120Hz phones & PCs)
    let fpsWindowStart = performance.now();
    let fpsRenderedFrames = 0;
    let prevRenderNow = performance.now();
    let frameMsAccum = 0;
    let lowFpsStreak = 0;
    let highFpsStreak = 0;

    const recordHardwareRenderedFrame = () => {
      const now = performance.now();
      const frameDeltaMs = Math.max(0.5, Math.min(250, now - prevRenderNow));
      prevRenderNow = now;
      fpsRenderedFrames++;
      frameMsAccum += frameDeltaMs;
      const windowElapsed = now - fpsWindowStart;
      if (windowElapsed >= 500) {
        const realFps = Math.max(1, Math.round((fpsRenderedFrames * 1000) / windowElapsed));
        const avgMs = Math.round((frameMsAccum / Math.max(1, fpsRenderedFrames)) * 10) / 10;

        // Gentle sustained-FPS adaptive scaling (preserves crisp character sharpness >= 1.35x on Retina phones!)
        const sharpPr = getSharpPixelRatio();
        const minCrispPr = Math.min(sharpPr, 1.35);
        if (realFps < 24) {
          lowFpsStreak++;
          highFpsStreak = 0;
          if (lowFpsStreak >= 3 && renderer.getPixelRatio() > minCrispPr) {
            const steppedPr = Math.max(minCrispPr, Math.round(sharpPr * 0.78 * 100) / 100);
            renderer.setPixelRatio(steppedPr);
            particleMat.uniforms.uPixelRatio.value = steppedPr;
          }
        } else if (realFps >= 45) {
          highFpsStreak++;
          lowFpsStreak = 0;
          if (highFpsStreak >= 3 && renderer.getPixelRatio() < sharpPr) {
            renderer.setPixelRatio(sharpPr);
            particleMat.uniforms.uPixelRatio.value = sharpPr;
          }
        } else {
          lowFpsStreak = 0;
          highFpsStreak = 0;
        }

        fpsRenderedFrames = 0;
        frameMsAccum = 0;
        fpsWindowStart = now;
        callbacksRef.current.onFpsUpdate?.(realFps, avgMs);
      }
    };

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (sync && state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 16); // Target 60fps
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const projectToScreen = (wx: number, wy: number, wz: number, w: number, h: number) => {
      _projVec.set(wx, wy, wz).project(camera);
      if (_projVec.z > 1) return null;
      return {
        x: (_projVec.x * 0.5 + 0.5) * w,
        y: (-_projVec.y * 0.5 + 0.5) * h,
      };
    };

    let lastRenderTime = 0;
    const tick = (time: number) => {
      if (disposed) return;
      
      // 60fps throttle
      if (time - lastRenderTime < 16) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      lastRenderTime = time;

      const nowPerf = performance.now();
      const dt = Math.min((nowPerf - lastTime) / 1000, 0.033);
      lastTime = nowPerf;

      // IMPACT FRAME (HIT-STOP)
      if (impactFrameTimer > 0) {
        impactFrameTimer -= dt;
        renderer.render(scene, camera);
        recordHardwareRenderedFrame();
        if (IS_SOFTWARE_GL) afterDraw(() => tick(performance.now()));
        else frameId = requestAnimationFrame(tick);
        return;
      }

      const elapsed = (nowPerf - startTime) / 1000;
      const isCitadel = charRef.current.mapId === CITADEL_MAP_ID;
      sparkleShaderMat.uniforms.uTime.value = elapsed;

      if (whirlwindSpinTimer > 0) whirlwindSpinTimer = Math.max(0, whirlwindSpinTimer - dt);

      // 1. Gather Client Input & Send Intent Command to Authoritative Server Immediately + 30Hz
      // nowPerf already defined at start of tick

      let moveX = joystickVecRef.current.x;
      let moveZ = joystickVecRef.current.y;
      if (keysDown.has('w') || keysDown.has('arrowup')) moveZ -= 1;
      if (keysDown.has('s') || keysDown.has('arrowdown')) moveZ += 1;
      if (keysDown.has('a') || keysDown.has('arrowleft')) moveX -= 1;
      if (keysDown.has('d') || keysDown.has('arrowright')) moveX += 1;

      const rawMag = Math.hypot(moveX, moveZ);
      const hasDirectInput = rawMag > 0.05;
      const srvSelf = serverSelfRef.current;
      const selfFrozen = Boolean(srvSelf.statuses?.some((s) => s.type === 'freeze'));
      // Exact match with server.ts movement formula (7.2 base * moveSpeed% * 0.65 freeze slow)
      const freezeMult = selfFrozen ? 0.65 : 1.0;
      const predSpeed = 7.2 * (statsRef.current.moveSpeed / 100) * freezeMult;

      let worldDirX = 0;
      let worldDirZ = 0;
      let desiredInputYaw = playerRotY;
      if (hasDirectInput) {
        pendingNpcTarget = null;
        moveMarker.visible = false;
        const analogScale = Math.min(1, rawMag);
        const nx = moveX / rawMag;
        const nz = moveZ / rawMag;
        const sinY = Math.sin(camYaw);
        const cosY = Math.cos(camYaw);
        worldDirX = (nx * cosY + nz * sinY) * analogScale;
        worldDirZ = (-nx * sinY + nz * cosY) * analogScale;
        desiredInputYaw = Math.atan2(worldDirX, worldDirZ);
      }

      inputSendAccum += dt;
      if (hasDirectInput) {
        const yawChanged = Math.abs(shortestAngleDiff(lastSentYaw, desiredInputYaw)) > 0.08;
        const vecChanged = Math.hypot(worldDirX - lastSentDirX, worldDirZ - lastSentDirZ) > 0.07;
        if (!lastSentMoving || yawChanged || vecChanged || inputSendAccum >= 0.033) {
          inputSendAccum = 0;
          lastSentMoving = true;
          lastSentYaw = desiredInputYaw;
          lastSentDirX = worldDirX;
          lastSentDirZ = worldDirZ;
          callbacksRef.current.onSendInput(
            worldDirX,
            worldDirZ,
            desiredInputYaw,
            Math.round(nowPerf)
          );
        }
      } else if (lastSentMoving) {
        inputSendAccum = 0;
        lastSentMoving = false;
        lastSentDirX = 0;
        lastSentDirZ = 0;
        callbacksRef.current.onSendInput(0, 0, playerRotY, Math.round(nowPerf));
      }

      // 2. Server-Authoritative Reconciliation (ackTime Unacknowledged Input Replay + Visual Decay = Zero Snap-Back!)
      const frameLocalDx =
        hasDirectInput && srvSelf.action !== 'dash'
          ? worldDirX * predSpeed * dt
          : pendingInputs.length === 0
          ? (srvSelf.vx || 0) * dt
          : 0;
      const frameLocalDz =
        hasDirectInput && srvSelf.action !== 'dash'
          ? worldDirZ * predSpeed * dt
          : pendingInputs.length === 0
          ? (srvSelf.vz || 0) * dt
          : 0;

      if (srvSelf.synced && srvSelf.mapId === charRef.current.mapId) {
        if (hasDirectInput && srvSelf.action !== 'dash') {
          pendingInputs.push({
            timeMs: nowPerf,
            dx: frameLocalDx,
            dz: frameLocalDz,
          });
        }

        const incomingTeleportSeq = srvSelf.teleportSeq ?? 0;
        const incomingStateSeq = srvSelf.stateSeq ?? 0;

        if (!hasInitialServerSync || incomingTeleportSeq !== lastTeleportSeq) {
          // Authoritative join / map teleport / blink skill: snap cleanly once & clear input buffer
          hasInitialServerSync = true;
          lastTeleportSeq = incomingTeleportSeq;
          lastAppliedStateSeq = incomingStateSeq;
          pendingInputs.length = 0;
          visualErrX = 0;
          visualErrZ = 0;
          playerX = srvSelf.x;
          playerZ = srvSelf.z;
          playerRotY = srvSelf.rotY;
        } else {
          const ackMs = srvSelf.ackTime || 0;
          while (
            pendingInputs.length > 0 &&
            (pendingInputs[0].timeMs <= ackMs || nowPerf - pendingInputs[0].timeMs > 1500)
          ) {
            pendingInputs.shift();
          }

          let authX = srvSelf.x;
          let authZ = srvSelf.z;
          if (pendingInputs.length > 0 && srvSelf.action !== 'dash') {
            let unackedDx = 0;
            let unackedDz = 0;
            for (let i = 0; i < pendingInputs.length; i++) {
              unackedDx += pendingInputs[i].dx;
              unackedDz += pendingInputs[i].dz;
            }
            authX = THREE.MathUtils.clamp(srvSelf.x + unackedDx, -46.5, 46.5);
            authZ = THREE.MathUtils.clamp(srvSelf.z + unackedDz, -46.5, 46.5);
          } else {
            const ageSec = srvSelf.lastSyncAt
              ? Math.min(0.065, Math.max(0, (nowPerf - srvSelf.lastSyncAt) / 1000))
              : 0;
            authX = THREE.MathUtils.clamp(srvSelf.x + (srvSelf.vx || 0) * ageSec, -46.5, 46.5);
            authZ = THREE.MathUtils.clamp(srvSelf.z + (srvSelf.vz || 0) * ageSec, -46.5, 46.5);
          }

          if (incomingStateSeq !== lastAppliedStateSeq) {
            lastAppliedStateSeq = incomingStateSeq;
            const seamlessX = THREE.MathUtils.clamp(playerX + frameLocalDx, -46.5, 46.5);
            const seamlessZ = THREE.MathUtils.clamp(playerZ + frameLocalDz, -46.5, 46.5);
            const jumpErrX = seamlessX - authX;
            const jumpErrZ = seamlessZ - authZ;
            const jumpMag = Math.hypot(jumpErrX, jumpErrZ);
            if (jumpMag > 15.0) {
              visualErrX = 0;
              visualErrZ = 0;
            } else if (jumpMag > 3.2) {
              const scale = 3.2 / jumpMag;
              visualErrX = jumpErrX * scale;
              visualErrZ = jumpErrZ * scale;
            } else {
              visualErrX = jumpErrX;
              visualErrZ = jumpErrZ;
            }
          }

          visualErrX = THREE.MathUtils.damp(visualErrX, 0, 12.5, dt);
          visualErrZ = THREE.MathUtils.damp(visualErrZ, 0, 12.5, dt);
          playerX = THREE.MathUtils.clamp(authX + visualErrX, -46.5, 46.5);
          playerZ = THREE.MathUtils.clamp(authZ + visualErrZ, -46.5, 46.5);
        }
      } else if (hasDirectInput) {
        playerX = THREE.MathUtils.clamp(playerX + frameLocalDx, -46.5, 46.5);
        playerZ = THREE.MathUtils.clamp(playerZ + frameLocalDz, -46.5, 46.5);
      }

      const isCombatLockFacing =
        srvSelf.action === 'attack_1' ||
        srvSelf.action === 'attack_2' ||
        srvSelf.action === 'attack_3' ||
        srvSelf.action === 'skill';
      const desiredRotY = hasDirectInput
        ? desiredInputYaw
        : pendingInputs.length > 0 && !isCombatLockFacing
        ? lastSentYaw
        : srvSelf.rotY;
      const turnErr = shortestAngleDiff(playerRotY, desiredRotY);
      playerRotY = dampAngle(playerRotY, desiredRotY, 16, dt);

      const srvVelMag = Math.hypot(srvSelf.vx || 0, srvSelf.vz || 0);
      const isServerMovingNonInput =
        !hasDirectInput &&
        pendingInputs.length === 0 &&
        (srvSelf.action === 'run' || srvSelf.action === 'dash' || srvVelMag > 0.25);
      const isMovingNow = hasDirectInput || isServerMovingNonInput || srvSelf.action === 'dash';
      const desiredBank = isMovingNow ? THREE.MathUtils.clamp(-turnErr * 0.18, -0.2, 0.2) : 0;
      playerBankZ = THREE.MathUtils.damp(playerBankZ, desiredBank, 11, dt);
      moveBlend = THREE.MathUtils.damp(moveBlend, isMovingNow ? 1 : 0, 12, dt);

      // Trigger pending NPC dialog when player arrives near NPC in Hoàng Thành
      if (pendingNpcTarget && Math.hypot(pendingNpcTarget.x - playerX, pendingNpcTarget.z - playerZ) < 3.6) {
        const npcToOpen = pendingNpcTarget;
        pendingNpcTarget = null;
        moveMarker.visible = false;
        callbacksRef.current.onNpcInteract(npcToOpen);
      }

      if (moveMarker.visible && Math.hypot(moveMarker.position.x - playerX, moveMarker.position.z - playerZ) < 0.9) {
        moveMarker.visible = false;
      }

      // 3. Auto-Battle Thin-Client Intent Emitter (Sends commands to Server!)
      if (autoBattleRef.current && !hasDirectInput && !isCitadel) {
        autoBattleAccum += dt;
        if (autoBattleAccum >= 0.22) {
          autoBattleAccum = 0;
          let nearLoot: ServerLootSnapshot | null = null;
          for (const l of serverLootsRef.current.values()) {
            if (Math.hypot(l.x - playerX, l.z - playerZ) < 6.5) {
              nearLoot = l;
              break;
            }
          }
          if (nearLoot) {
            callbacksRef.current.onSendPickupLoot(nearLoot.id);
          } else {
            const targetMob =
              (selectedMonsterId ? serverMonstersRef.current.get(selectedMonsterId) : null) ||
              findNearestServerMonster(48);
            if (targetMob && !targetMob.dead) {
              selectedMonsterId = targetMob.id;
              const d = Math.hypot(targetMob.x - playerX, targetMob.z - playerZ);
              const desiredRange = charRef.current.classId === 'esper' ? 8.5 : 3.2;
              if (d > desiredRange) {
                callbacksRef.current.onSendMoveTo(targetMob.x, targetMob.z);
              } else {
                const clsSkills = CLASSES_DATA[charRef.current.classId].skills;
                let sentSkill = false;
                for (let sIdx = 5; sIdx >= 0; sIdx--) {
                  if (sIdx === 2 && hpRef.current > statsRef.current.maxHp * 0.65) continue;
                  if (mpRef.current >= clsSkills[sIdx].mpCost && Math.random() < 0.45) {
                    callbacksRef.current.onSendSkill(sIdx, targetMob.id, targetMob.x, targetMob.z);
                    sentSkill = true;
                    break;
                  }
                }
                if (!sentSkill) {
                  callbacksRef.current.onSendAttack(targetMob.id);
                }
              }
            }
          }
        }
      }

      // Footstep dust particles
      if (isMovingNow) {
        footstepAccum += dt * (charRef.current.mounted ? 7.0 : 5.0);
        if (footstepAccum >= 1) {
          footstepAccum = 0;
          _vfxColorA.set(isCitadel ? '#fde68a' : '#a1a1aa');
          emitParticle(
            playerX + (Math.random() - 0.5) * 0.35,
            0.12,
            playerZ + (Math.random() - 0.5) * 0.35,
            (Math.random() - 0.5) * 1.0,
            0.5 + Math.random() * 0.8,
            (Math.random() - 0.5) * 1.0,
            _vfxColorA.r,
            _vfxColorA.g,
            _vfxColorA.b,
            charRef.current.mounted ? 0.32 : 0.22,
            0.26,
            -1.2,
            2.2,
            0
          );
        }
      }

      // 3.5 Dynamic Weather Particle Emitters
      if (weatherState.type !== 'clear' && !IS_SOFTWARE_GL) {
        weatherState.accum += dt;
        const spawnRate = weatherState.type === 'sandstorm' ? 0.015 : 0.045;
        if (weatherState.accum >= spawnRate) {
          weatherState.accum = 0;
          const range = 35;
          const wx = playerX + (Math.random() - 0.5) * range * 2;
          const wz = playerZ + (Math.random() - 0.5) * range * 2;
          
          if (weatherState.type === 'rain') {
            emitParticle(wx, 18, wz, 0, -18 - Math.random() * 8, 0, 0.6, 0.8, 1.0, 0.28, 1.1, 0, 0, 0);
          } else if (weatherState.type === 'snow') {
            emitParticle(wx, 18, wz, Math.sin(elapsed + wx) * 1.5, -3 - Math.random() * 2, 0, 0.9, 0.95, 1.0, 0.35, 4.5, 0, 0.2, 0);
          } else if (weatherState.type === 'sandstorm') {
            for(let k=0; k<3; k++) {
              emitParticle(playerX - 25, 0.5 + Math.random() * 12, playerZ + (Math.random()-0.5)*50, 22 + Math.random()*15, (Math.random()-0.5)*2, (Math.random()-0.5)*4, 0.6, 0.5, 0.4, 0.6 + Math.random()*0.8, 1.8, 0, 0.1, 0);
            }
          } else if (weatherState.type === 'embers') {
            emitParticle(wx, 0.2, wz, (Math.random()-0.5)*2, 2 + Math.random()*4, (Math.random()-0.5)*2, 1.0, 0.4, 0.1, 0.25, 2.5, 0.5, 0.4, 0);
          } else if (weatherState.type === 'void') {
            if (Math.random() > 0.7) {
              emitParticle(wx, 0.1 + Math.random()*15, wz, 0, (Math.random()-0.5)*0.5, 0, 0.7, 0.3, 1.0, 0.5, 3.0, 0, 0.1, 2);
            }
          }
        }
      }

      // 4. Animate Local Player Rig + Visual Status Effects (Burn / Freeze / Shock)
      playerHolder.position.set(playerX, 0, playerZ);
      playerHolder.rotation.y =
        whirlwindSpinTimer > 0 ? playerRotY + whirlwindSpinTimer * 18.5 : playerRotY;

      statusFxAccum += dt;
      const doEmitStatusTick = statusFxAccum >= 0.085;
      if (doEmitStatusTick) statusFxAccum = 0;

      const emitActorStatusVfx = (
        ax: number,
        az: number,
        heightScale: number,
        statuses?: ActiveStatusEffect[]
      ) => {
        if (!statuses || statuses.length === 0 || !doEmitStatusTick) return;
        for (let s = 0; s < statuses.length; s++) {
          const st = statuses[s];
          if (st.type === 'burn') {
            for (let k = 0; k < 2; k++) {
              const ang = Math.random() * Math.PI * 2;
              const rad = 0.25 + Math.random() * 0.45 * heightScale;
              emitParticle(
                ax + Math.cos(ang) * rad,
                0.25 + Math.random() * 1.15 * heightScale,
                az + Math.sin(ang) * rad,
                (Math.random() - 0.5) * 0.9,
                2.2 + Math.random() * 2.8,
                (Math.random() - 0.5) * 0.9,
                1.0,
                0.22 + Math.random() * 0.35,
                0.05,
                0.34 + Math.random() * 0.22,
                0.38 + Math.random() * 0.25,
                0.8,
                1.2,
                0
              );
            }
          } else if (st.type === 'freeze') {
            const ang = Math.random() * Math.PI * 2;
            const rad = 0.3 + Math.random() * 0.55 * heightScale;
            emitParticle(
              ax + Math.cos(ang) * rad,
              0.3 + Math.random() * 1.2 * heightScale,
              az + Math.sin(ang) * rad,
              Math.cos(ang) * 0.4,
              0.35 + Math.random() * 0.65,
              Math.sin(ang) * 0.4,
              0.25,
              0.82,
              1.0,
              0.32 + Math.random() * 0.2,
              0.48,
              -0.3,
              1.5,
              1
            );
          } else if (st.type === 'shock') {
            if (Math.random() < 0.65) {
              spawnConstruct({
                geo: sharedLightningBoltGeo,
                color: Math.random() > 0.45 ? '#fde047' : '#38bdf8',
                duration: 0.14,
                sx: ax + (Math.random() - 0.5) * 0.9 * heightScale,
                sy: 0.35 + Math.random() * 1.3 * heightScale,
                sz: az + (Math.random() - 0.5) * 0.9 * heightScale,
                ex: ax + (Math.random() - 0.5) * 0.9 * heightScale,
                ey: 0.55 + Math.random() * 1.4 * heightScale,
                ez: az + (Math.random() - 0.5) * 0.9 * heightScale,
                sScale: [0.22, 0.24 * heightScale, 0.22],
                eScale: [0.32, 0.32 * heightScale, 0.32],
                rot: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI],
                opacity: 0.96,
              });
            }
          }
        }
      };

      const applyRigFreezeTint = (root: THREE.Object3D, frozen: boolean) => {
        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh || !mesh.material) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            const std = m as THREE.MeshStandardMaterial;
            if (!std.emissive) continue;
            if (frozen) {
              if (std.userData.__origEmissiveHex === undefined) {
                std.userData.__origEmissiveHex = std.emissive.getHex();
                std.userData.__origEmissiveInt = std.emissiveIntensity;
              }
              std.emissive.setHex(0x0ea5e9);
              std.emissiveIntensity = Math.max(0.65, std.userData.__origEmissiveInt || 0.65);
            } else if (std.userData.__origEmissiveHex !== undefined) {
              std.emissive.setHex(std.userData.__origEmissiveHex);
              std.emissiveIntensity = std.userData.__origEmissiveInt ?? 0;
              delete std.userData.__origEmissiveHex;
              delete std.userData.__origEmissiveInt;
            }
          }
        });
      };

      if (playerRig) {
        playerRig.root.rotation.z = playerBankZ;
        if (selfFrozen !== playerWasFrozen) {
          playerWasFrozen = selfFrozen;
          playerFreezeCrystal.visible = selfFrozen;
          applyRigFreezeTint(playerRig.root, selfFrozen);
        }
        if (playerFreezeCrystal.visible) {
          playerFreezeCrystal.rotation.y = elapsed * 1.8;
        }
        emitActorStatusVfx(playerX, playerZ, 1.0, srvSelf.statuses);

        const serverNonLocoAction =
          srvSelf.action !== 'idle' && srvSelf.action !== 'run' && srvSelf.action !== 'mount';
        const effectiveSelfAction: ActorActionType = serverNonLocoAction
          ? srvSelf.action
          : isMovingNow
          ? charRef.current.mounted
            ? 'mount'
            : 'run'
          : charRef.current.mounted
          ? 'mount'
          : 'idle';

        updateActorRigAnimation({
          rig: playerRig,
          action: effectiveSelfAction,
          actionSeq: srvSelf.actionSeq,
          skillIndex: srvSelf.skillIndex,
          moveBlend,
          mounted: charRef.current.mounted,
          classId: charRef.current.classId,
          dt: selfFrozen ? dt * 0.55 : dt,
          elapsed,
        });
      }

      // 4.5 AAA Smooth Chase Camera + Horizon Fog Scaling + Camera Radius & Frustum Culling + LOD System!
      const preset = camPresets[camPresetIdx];
      const desiredFov =
        srvSelf.action === 'dash' ? 50.0 : charRef.current.mounted && isMovingNow ? 48.0 : 46.0;
      const nextFov = THREE.MathUtils.damp(camera.fov, desiredFov, 8.5, dt);

      const fogNearTarget = activeFogBaseNear * camZoomScale;
      const fogFarTarget = activeFogBaseFar * camZoomScale;
      if (scene.fog && (scene.fog as THREE.Fog).isFog) {
        const linFog = scene.fog as THREE.Fog;
        linFog.near = fogNearTarget;
        linFog.far = fogFarTarget;
      }
      const desiredFarPlane = Math.max(50, fogFarTarget + 9);
      if (Math.abs(nextFov - camera.fov) > 0.02 || Math.abs(camera.far - desiredFarPlane) > 0.4) {
        camera.fov = nextFov;
        camera.far = desiredFarPlane;
        camera.updateProjectionMatrix();
      }

      const effDist = preset.dist * camZoomScale;
      const effHeight = THREE.MathUtils.clamp(
        preset.height * camZoomScale + camPitchOffset,
        2.6,
        34.0
      );
      const desiredCamX = playerX + Math.sin(camYaw) * effDist;
      const desiredCamZ = playerZ + Math.cos(camYaw) * effDist;
      const desiredCamY = effHeight;

      camCurX = THREE.MathUtils.damp(camCurX, desiredCamX, 8.0, dt);
      camCurY = THREE.MathUtils.damp(camCurY, desiredCamY, 8.0, dt);
      camCurZ = THREE.MathUtils.damp(camCurZ, desiredCamZ, 8.0, dt);

      let shakeX = 0;
      let shakeY = 0;
      if (camShakeAmp > 0.002) {
        shakeX = Math.sin(elapsed * 58) * camShakeAmp;
        shakeY = Math.cos(elapsed * 49) * camShakeAmp * 0.75;
        camShakeAmp = THREE.MathUtils.damp(camShakeAmp, 0, 11, dt);
      } else {
        camShakeAmp = 0;
      }

      camera.position.set(camCurX + shakeX, camCurY + shakeY, camCurZ);
      camera.lookAt(playerX, 1.15, playerZ);
      camera.updateMatrixWorld();
      _projScreenMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_projScreenMat);

      keyLight.position.set(playerX + 14, 28, playerZ + 12);
      keyLight.target.position.set(playerX, 0, playerZ);

      // LOD (Level of Detail) & Frustum Culling Engine
      const activeCullRadius = (isCitadel ? 60 : 55) * camZoomScale; // Increased radius
      const evaluateLodTier = (wx: number, wz: number, boundRadius: number): number => {
        const dx = wx - playerX;
        const dz = wz - playerZ;
        const distSq = dx * dx + dz * dz;
        const maxR = activeCullRadius + boundRadius;
        if (distSq > maxR * maxR) return 3; // LOD3: Culled (Outside radius)
        _cullSphere.center.set(wx, 1.15, wz);
        _cullSphere.radius = boundRadius;
        if (!_frustum.intersectsSphere(_cullSphere)) return 3; // LOD3: Culled (Outside Frustum)

        if (distSq < 400) return 0; // LOD0: < 20m
        if (distSq < 1600) return 1; // LOD1: 20m - 40m
        return 2;                   // LOD2: 40m - 55m
      };

      // Cull & apply LOD tier to 3D Map Props
      for (let i = 0; i < cullableProps.length; i++) {
        const cp = cullableProps[i];
        const tier = evaluateLodTier(cp.x, cp.z, cp.radius);
        cp.obj.visible = tier < 3;
      }

      // Increment frame counter for LOD animation throttling
      lodFrameCounter = (lodFrameCounter + 1) % 60;

      // 5. Animate Citadel Crystals & 8 NPCs (When in Hoàng Thành Map 1)
      if (isCitadel) {
        for (let i = 0; i < citadelAnimatedCrystals.length; i++) {
          const obj = citadelAnimatedCrystals[i];
          if (obj.parent && !obj.parent.visible) continue;
          obj.rotation.y = elapsed * (0.9 + (i % 3) * 0.35);
        }
        for (let i = 0; i < npcVisuals.length; i++) {
          const nv = npcVisuals[i];
          const tier = evaluateLodTier(nv.npc.x, nv.npc.z, 2.8);
          nv.holder.visible = tier < 3;
          if (tier >= 3 || (tier === 1 && lodFrameCounter % 2 !== 0)) continue;
          updateActorRigAnimation({
            rig: nv.rig,
            action: 'idle',
            actionSeq: 1,
            moveBlend: 0,
            mounted: false,
            classId: 'esper',
            dt: tier === 2 ? dt * 2 : dt,
            elapsed: elapsed + i * 0.8,
          });
        }
      }

      // 6. Reconcile & Animate Remote Online Players (LOD + Frustum Culling!)
      const activePeers = remotePlayersRef.current;
      for (const [peerId, peer] of activePeers.entries()) {
        if (peer.id === charRef.current.id || peer.mapId !== charRef.current.mapId) {
          const old = peerRigs.get(peerId);
          if (old) {
            peersGroup.remove(old.rig.root);
            peerRigs.delete(peerId);
          }
          continue;
        }
        const gearHash = `${peer.classId}_${peer.equippedWeapon}_${peer.equippedArmor}_${peer.equippedHelm}_${peer.equippedWings}_${peer.equippedMount}_${peer.enhanceLevel}_${peer.mounted}`;
        let entry = peerRigs.get(peerId);
        if (!entry || entry.gearHash !== gearHash) {
          if (entry) peersGroup.remove(entry.rig.root);
          const built = buildCharacterRig({
            classId: peer.classId,
            hairColor: peer.hairColor,
            accentColor: peer.accentColor,
            equippedWeapon: peer.equippedWeapon,
            equippedArmor: peer.equippedArmor,
            equippedHelm: peer.equippedHelm,
            equippedWings: peer.equippedWings,
            equippedMount: peer.equippedMount,
            enhanceLevel: peer.enhanceLevel,
            mounted: peer.mounted,
          });
          built.root.position.set(peer.x, 0, peer.z);
          peersGroup.add(built.root);
          entry = {
            rig: built,
            gearHash,
            x: peer.x,
            z: peer.z,
            rotY: peer.rotY,
            moveBlend: 0,
          };
          peerRigs.set(peerId, entry);
        }

        const peerDist = Math.hypot(peer.x - entry.x, peer.z - entry.z);
        if (peerDist > 12) {
          entry.x = peer.x;
          entry.z = peer.z;
        } else {
          entry.x = THREE.MathUtils.damp(entry.x, peer.x, 12, dt);
          entry.z = THREE.MathUtils.damp(entry.z, peer.z, 12, dt);
        }
        entry.rotY = dampAngle(entry.rotY, peer.rotY, 14, dt);
        entry.rig.root.position.set(entry.x, 0, entry.z);
        entry.rig.root.rotation.y = entry.rotY;

        const lodTier = evaluateLodTier(entry.x, entry.z, 2.8);
        entry.rig.root.visible = lodTier < 3;
        if (lodTier >= 3 || (lodTier === 1 && lodFrameCounter % 2 !== 0) || (lodTier === 2 && lodFrameCounter % 4 !== 0)) {
          continue;
        }

        const peerMoving =
          peer.action === 'run' ||
          peer.action === 'dash' ||
          Math.hypot(peer.vx || 0, peer.vz || 0) > 0.25 ||
          peerDist > 0.08;
        entry.moveBlend = THREE.MathUtils.damp(entry.moveBlend, peerMoving ? 1 : 0, 12, dt);
        emitActorStatusVfx(entry.x, entry.z, 1.0, peer.statuses);

        updateActorRigAnimation({
          rig: entry.rig,
          action: peer.action || 'idle',
          actionSeq: peer.actionSeq || 1,
          skillIndex: peer.skillIndex,
          moveBlend: entry.moveBlend,
          mounted: peer.mounted,
          classId: peer.classId,
          dt: lodTier === 2 ? dt * 2 : dt,
          elapsed,
        });
      }
      for (const [peerId, entry] of peerRigs.entries()) {
        if (!activePeers.has(peerId)) {
          peersGroup.remove(entry.rig.root);
          peerRigs.delete(peerId);
        }
      }

      // 7. Reconcile & Animate Authoritative Server Monsters (Culled Outside Camera Radius / Frustum!)
      if (isCitadel) {
        if (monsterVisuals.size > 0) {
          for (const mv of monsterVisuals.values()) {
            monstersGroup.remove(mv.holder);
          }
          monsterVisuals.clear();
        }
        if (lootVisuals.size > 0) {
          for (const lv of lootVisuals.values()) {
            lootGroup.remove(lv.group);
          }
          lootVisuals.clear();
        }
      } else {
        const srvMonsters = serverMonstersRef.current;
        for (const [mobId, sm] of srvMonsters.entries()) {
          const override = assetRegistry.getOverride(sm.assetSlot);
          const slotSig = `${sm.assetSlot}_${sm.style}_${sm.isBoss}_${override?.updatedAt || 0}`;
          let vis = monsterVisuals.get(mobId);
          if (!vis || vis.slotSig !== slotSig) {
            if (vis) monstersGroup.remove(vis.holder);
            const built = buildMonsterRig({
              style: sm.style,
              assetSlot: sm.assetSlot,
              accentColor: sm.accentColor,
              isBoss: sm.isBoss,
            });
            const holder = new THREE.Group();
            holder.position.set(sm.x, 0, sm.z);
            holder.add(built.root);

            const mobShadow = new THREE.Mesh(
              new THREE.PlaneGeometry(sm.isBoss ? 3.8 : 1.7, sm.isBoss ? 3.8 : 1.7),
              contactShadowMat
            );
            mobShadow.rotation.x = -Math.PI / 2;
            mobShadow.position.y = 0.03;
            holder.add(mobShadow);

            const freezeShard = new THREE.Mesh(freezeIceGeo, freezeIceMat);
            const fsScale = sm.isBoss ? 1.85 : 0.92;
            freezeShard.position.y = sm.isBoss ? 1.9 : 1.0;
            freezeShard.scale.set(fsScale, fsScale * 1.35, fsScale);
            freezeShard.visible = false;
            holder.add(freezeShard);

            const hitRadius = sm.isBoss ? 2.2 : 1.15;
            const hitBox = new THREE.Mesh(
              new THREE.CylinderGeometry(hitRadius, hitRadius, sm.isBoss ? 3.8 : 2.2, 8),
              new THREE.MeshBasicMaterial({ visible: false })
            );
            hitBox.position.y = sm.isBoss ? 1.9 : 1.1;
            hitBox.userData = { kind: 'mob', mobId };
            holder.add(hitBox);

            holder.visible = !sm.dead;
            monstersGroup.add(holder);

            vis = {
              id: mobId,
              holder,
              rig: built,
              x: sm.x,
              z: sm.z,
              rotY: sm.rotY,
              wasDead: sm.dead,
              deathTimer: sm.dead ? 0 : 0.85,
              frozenVisual: false,
              freezeShard,
              seedOffset: Math.random() * 6.28,
              slotSig,
            };
            monsterVisuals.set(mobId, vis);
          }

          const mobBoundRadius = sm.isBoss ? 5.2 : 2.6;

          if (sm.dead) {
            if (!vis.wasDead) {
              vis.wasDead = true;
              vis.deathTimer = 0.85;
              if (vis.frozenVisual) {
                vis.frozenVisual = false;
                vis.freezeShard.visible = false;
                applyRigFreezeTint(vis.rig.root, false);
              }
              if (evaluateLodTier(vis.x, vis.z, mobBoundRadius) < 3) {
                emitRadialBurst({
                  x: vis.x,
                  y: sm.isBoss ? 2.0 : 1.1,
                  z: vis.z,
                  count: sm.isBoss ? 68 : 26,
                  colorA: sm.accentColor,
                  colorB: '#fde047',
                  speedMin: 3.0,
                  speedMax: sm.isBoss ? 11.0 : 7.5,
                  upMin: 2.5,
                  upMax: sm.isBoss ? 9.0 : 5.8,
                  sizeMin: 0.26,
                  sizeMax: sm.isBoss ? 0.7 : 0.48,
                  lifeMin: 0.35,
                  lifeMax: 0.8,
                  kind: 0,
                  bounce: true,
                });
              }
              if (selectedMonsterId === mobId) {
                selectedMonsterId = null;
                callbacksRef.current.onTargetUpdate(null);
              }
            }
            if (vis.deathTimer > 0) {
              vis.deathTimer -= dt;
              const deathInView = evaluateLodTier(vis.x, vis.z, mobBoundRadius) < 3;
              vis.holder.visible = deathInView && vis.deathTimer > 0;
              if (vis.holder.visible) {
                updateMonsterRigAnimation({
                  rig: vis.rig,
                  action: 'dead',
                  actionSeq: sm.actionSeq,
                  dt,
                  elapsed,
                  seedOffset: vis.seedOffset,
                });
              }
            } else {
              vis.holder.visible = false;
            }
            continue;
          }

          if (vis.wasDead) {
            vis.wasDead = false;
            vis.deathTimer = 0.85;
            vis.x = sm.x;
            vis.z = sm.z;
            vis.rig.root.rotation.x = 0;
            vis.rig.root.position.y = 0;
          }

          vis.x = THREE.MathUtils.damp(vis.x, sm.x, 12, dt);
          vis.z = THREE.MathUtils.damp(vis.z, sm.z, 12, dt);
          vis.rotY = dampAngle(vis.rotY, sm.rotY, 12, dt);
          vis.holder.position.set(vis.x, 0, vis.z);
          vis.holder.rotation.y = vis.rotY;

          // LOD System & Frustum Culling for Monsters
          const lodTier = evaluateLodTier(vis.x, vis.z, mobBoundRadius);
          vis.holder.visible = lodTier < 3;
          if (lodTier >= 3 || (lodTier === 1 && lodFrameCounter % 2 !== 0) || (lodTier === 2 && lodFrameCounter % 4 !== 0)) {
            continue;
          }

          const mobFrozen = Boolean(sm.statuses?.some((s) => s.type === 'freeze'));
          if (mobFrozen !== vis.frozenVisual) {
            vis.frozenVisual = mobFrozen;
            vis.freezeShard.visible = mobFrozen;
            applyRigFreezeTint(vis.rig.root, mobFrozen);
          }
          if (vis.freezeShard.visible) {
            vis.freezeShard.rotation.y = elapsed * 1.6 + vis.seedOffset;
          }
          emitActorStatusVfx(vis.x, vis.z, sm.isBoss ? 1.85 : 1.0, sm.statuses);

          updateMonsterRigAnimation({
            rig: vis.rig,
            action: sm.action,
            actionSeq: sm.actionSeq,
            dt: (mobFrozen ? dt * 0.45 : dt) * (lodTier === 2 ? 2 : 1),
            elapsed,
            seedOffset: vis.seedOffset,
          });
        }

        for (const [mobId, vis] of monsterVisuals.entries()) {
          if (!srvMonsters.has(mobId)) {
            monstersGroup.remove(vis.holder);
            monsterVisuals.delete(mobId);
          }
        }

        // Reconcile Server Ground Loots (Culled Outside Camera Radius / Frustum!)
        const srvLoots = serverLootsRef.current;
        for (const [lootId, sl] of srvLoots.entries()) {
          let lv = lootVisuals.get(lootId);
          if (!lv) {
            const mesh = buildLootDropMesh(sl.color);
            mesh.position.set(sl.x, 0, sl.z);
            const hit = new THREE.Mesh(
              new THREE.CylinderGeometry(0.95, 0.95, 1.8, 8),
              new THREE.MeshBasicMaterial({ visible: false })
            );
            hit.position.y = 0.9;
            hit.userData = { kind: 'loot', lootId };
            mesh.add(hit);
            lootGroup.add(mesh);

            lv = { id: lootId, group: mesh, x: sl.x, z: sl.z, color: sl.color };
            lootVisuals.set(lootId, lv);
          }
          const inView = evaluateLodTier(lv.x, lv.z, 1.8) < 3;
          lv.group.visible = inView;
          if (inView) {
            lv.group.rotation.y += dt * 1.8;
          }
        }
        for (const [lootId, lv] of lootVisuals.entries()) {
          if (!srvLoots.has(lootId)) {
            lootGroup.remove(lv.group);
            lootVisuals.delete(lootId);
            soundFX.playLoot();
            if (evaluateLodTier(lv.x, lv.z, 2.2) < 3) {
              emitRadialBurst({
                x: lv.x,
                y: 0.6,
                z: lv.z,
                count: 14,
                colorA: lv.color,
                colorB: '#ffffff',
                speedMin: 1.5,
                speedMax: 4.5,
                upMin: 2.2,
                upMax: 5.5,
                sizeMin: 0.2,
                sizeMax: 0.4,
                lifeMin: 0.28,
                lifeMax: 0.55,
                gravity: -4.0,
                kind: 1,
              });
            }
          }
        }
      }

      // Target Lock Ring & HUD Target Sync
      const lockedMob = selectedMonsterId ? serverMonstersRef.current.get(selectedMonsterId) : null;
      const lockedVis = selectedMonsterId ? monsterVisuals.get(selectedMonsterId) : null;
      if (lockedMob && !lockedMob.dead && lockedVis && lockedVis.holder.visible && !isCitadel) {
        targetRing.visible = true;
        targetRing.scale.setScalar(lockedMob.isBoss ? 2.1 : 1.0);
        targetRing.position.set(lockedVis.x, 0.05, lockedVis.z);
        targetRing.rotation.z = elapsed * 1.5;
      } else {
        targetRing.visible = false;
      }

      // Update Custom Uploaded 3D / Video / .tscn Skill VFX Instances
      for (let i = activeCustomVfxList.length - 1; i >= 0; i--) {
        const cv = activeCustomVfxList[i];
        cv.age += dt;
        const p = cv.age / cv.duration;
        if (p >= 1) {
          vfxGroup.remove(cv.group);
          activeCustomVfxList.splice(i, 1);
          continue;
        }
        cv.mixer?.update(dt);
        if (cv.isProjectile) {
          cv.group.position.set(
            cv.ox + (cv.tx - cv.ox) * p,
            1.15,
            cv.oz + (cv.tz - cv.oz) * p
          );
        } else {
          const grow = p < 0.18 ? 0.55 + (p / 0.18) * 0.45 : 1.0 + (p - 0.18) * 0.12;
          const fadeOut = p > 0.78 ? Math.max(0.05, 1 - (p - 0.78) / 0.22) : 1.0;
          cv.group.scale.setScalar(cv.baseScale * grow * fadeOut);
        }
      }

      // Update Pooled 3D Skill Constructs
      for (let i = 0; i < CONSTRUCT_POOL_SIZE; i++) {
        const slot = constructPool[i];
        if (!slot.active) continue;

        if (slot.delay > 0) {
          slot.delay -= dt;
          if (slot.delay <= 0) {
            slot.mesh.position.set(slot.sx, slot.sy, slot.sz);
            slot.mesh.scale.set(slot.sScaleX, slot.sScaleY, slot.sScaleZ);
            slot.mat.opacity = slot.peakOpacity;
            slot.mesh.visible = true;
          } else {
            continue;
          }
        }

        slot.age += dt;
        const p = slot.age / slot.duration;
        if (p >= 1) {
          slot.active = false;
          slot.mesh.visible = false;
          if (slot.impactShake > 0) {
            camShakeAmp = Math.max(camShakeAmp, slot.impactShake);
            slot.impactShake = 0;
          }
          continue;
        }

        const ease = 1 - Math.pow(1 - p, 2.4);
        const cx = slot.sx + (slot.ex - slot.sx) * p;
        const cy = slot.sy + (slot.ey - slot.sy) * p;
        const cz = slot.sz + (slot.ez - slot.sz) * p;
        slot.mesh.position.set(cx, cy, cz);

        slot.mesh.scale.set(
          slot.sScaleX + (slot.eScaleX - slot.sScaleX) * ease,
          slot.sScaleY + (slot.eScaleY - slot.sScaleY) * ease,
          slot.sScaleZ + (slot.eScaleZ - slot.sScaleZ) * ease
        );

        slot.mesh.rotation.x += slot.spinX * dt;
        slot.mesh.rotation.y += slot.spinY * dt;
        slot.mesh.rotation.z += slot.spinZ * dt;

        const fade = p < 0.14 ? p / 0.14 : Math.pow(1 - (p - 0.14) / 0.86, 1.55);
        slot.mat.opacity = slot.peakOpacity * Math.max(0, fade);

        if (slot.emitTrail) {
          _vfxColorA.setHex(slot.trailColorHex);
          emitParticle(
            cx + (Math.random() - 0.5) * 0.28,
            cy + (Math.random() - 0.5) * 0.28,
            cz + (Math.random() - 0.5) * 0.28,
            (Math.random() - 0.5) * 1.4,
            0.8 + Math.random() * 1.6,
            (Math.random() - 0.5) * 1.4,
            _vfxColorA.r,
            _vfxColorA.g,
            _vfxColorA.b,
            0.36 + Math.random() * 0.34,
            0.22 + Math.random() * 0.2,
            0.2,
            2.0,
            0
          );
        }
      }

      // Update Single-Draw-Call GPU Ring-Buffer Particles
      if (liveParticleCount > 0) {
        let activeNow = 0;
        for (let i = 0; i < MAX_PARTICLES; i++) {
          const life = pLife[i];
          if (life <= 0) continue;

          const nextAge = pAge[i] + dt;
          if (nextAge >= life) {
            pLife[i] = 0;
            pAlphas[i] = 0;
            pSizes[i] = 0;
            continue;
          }

          activeNow++;
          pAge[i] = nextAge;
          const norm = nextAge / life;

          const i3 = i * 3;
          let px = pPositions[i3];
          let py = pPositions[i3 + 1];
          let pz = pPositions[i3 + 2];

          const dragFactor = Math.max(0, 1 - pDrag[i] * dt);
          let vx = pVelX[i] * dragFactor;
          let vy = pVelY[i] * dragFactor + pGravity[i] * dt;
          let vz = pVelZ[i] * dragFactor;

          const sw = pSwirl[i];
          if (sw !== 0) {
            const dx = px - pOriginX[i];
            const dz = pz - pOriginZ[i];
            const angStep = sw * dt;
            const cosA = Math.cos(angStep);
            const sinA = Math.sin(angStep);
            px = pOriginX[i] + dx * cosA - dz * sinA;
            pz = pOriginZ[i] + dx * sinA + dz * cosA;
          }

          px += vx * dt;
          py += vy * dt;
          pz += vz * dt;

          if (py < 0.08 && pBounce[i] === 1 && vy < 0) {
            py = 0.08;
            vy = -vy * 0.46;
            vx *= 0.78;
            vz *= 0.78;
          }

          pPositions[i3] = px;
          pPositions[i3 + 1] = py;
          pPositions[i3 + 2] = pz;
          pVelX[i] = vx;
          pVelY[i] = vy;
          pVelZ[i] = vz;

          const sizeCurve = norm < 0.12 ? 0.5 + (norm / 0.12) * 0.5 : 1 - (norm - 0.12) * 0.65;
          pSizes[i] = pBaseSize[i] * Math.max(0.05, sizeCurve);
          pAlphas[i] = norm < 0.1 ? norm / 0.1 : Math.pow(1 - (norm - 0.1) / 0.9, 1.35);
        }

        liveParticleCount = activeNow;
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
        alphaAttr.needsUpdate = true;
        kindAttr.needsUpdate = true;
      }

      if (skillFlashLight.intensity > 0.01) {
        skillFlashLight.intensity = THREE.MathUtils.damp(skillFlashLight.intensity, 0, 7.5, dt);
      } else {
        skillFlashLight.intensity = 0;
      }

      // Dynamic Downsampling (Resolution Scaling) for 2.5D Map Environments during Movement
      const isRapidlyMoving = isMovingNow || srvSelf.action === 'dash';
      const effectiveDpr = isRapidlyMoving ? targetPixelRatio * 0.72 : targetPixelRatio;
      if (Math.abs(renderer.getPixelRatio() - effectiveDpr) > 0.05) {
        renderer.setPixelRatio(effectiveDpr);
        renderer.setSize(width, height, false);
      }

      if (!isBuildingMap) { // Only render if not rebuilding map
        renderer.render(scene, camera);
        recordHardwareRenderedFrame();
      }

      // HUD Minimap + Projected 2D Semantic Labels + Floating Damage Numbers (18Hz)
      hudSyncAccum += dt;
      if (hudSyncAccum >= 0.055) {
        hudSyncAccum = 0;
        const cw = container.offsetWidth || renderer.domElement.clientWidth || width;
        const ch = container.offsetHeight || renderer.domElement.clientHeight || height;

        const dots: MinimapEntityDot[] = [
          { x: NORTH_PORTAL_POS.x, z: NORTH_PORTAL_POS.z, kind: 'portal' },
        ];
        if (!isCitadel) {
          dots.push({ x: SOUTH_PORTAL_POS.x, z: SOUTH_PORTAL_POS.z, kind: 'portal' });
        }

        const labels: OverheadLabelItem[] = [];
        const labelRadius = 25 * camZoomScale;

        if (lockedMob && !lockedMob.dead && !isCitadel) {
          callbacksRef.current.onTargetUpdate({
            id: lockedMob.id,
            name: lockedMob.name,
            level: lockedMob.level,
            hp: lockedMob.hp,
            maxHp: lockedMob.maxHp,
            isBoss: lockedMob.isBoss,
            statuses: lockedMob.statuses,
          });
        } else if (selectedMonsterId) {
          selectedMonsterId = null;
          callbacksRef.current.onTargetUpdate(null);
        }

        const pScreen = projectToScreen(
          playerX,
          charRef.current.mounted ? 2.65 : 2.15,
          playerZ,
          cw,
          ch
        );
        if (pScreen) {
          labels.push({
            id: 'self',
            title: `Lv.${charRef.current.level} ${charRef.current.name}`,
            subtitle:
              charRef.current.enhanceLevel >= 7 ? `[+${charRef.current.enhanceLevel}]` : undefined,
            kind: 'player',
            color: '#fbbf24',
            x: pScreen.x,
            y: pScreen.y,
          });
        }

        // North Portal Label (only when within sharp camera focus radius)
        if (Math.hypot(NORTH_PORTAL_POS.x - playerX, NORTH_PORTAL_POS.z - playerZ) < labelRadius) {
          const nPortalScr = projectToScreen(NORTH_PORTAL_POS.x, 4.9, NORTH_PORTAL_POS.z, cw, ch);
          if (nPortalScr) {
            const nextMapId = isCitadel
              ? FIRST_HUNTING_MAP_ID
              : charRef.current.mapId < 32
              ? charRef.current.mapId + 1
              : FIRST_HUNTING_MAP_ID;
            const nextMap = MAPS_DATA.find((m) => m.id === nextMapId) || MAPS_DATA[1];
            labels.push({
              id: 'portal_north',
              title: `Cổng Tiến Quân → ${nextMap.code}`,
              subtitle: nextMap.name,
              kind: 'portal',
              color: '#38bdf8',
              x: nPortalScr.x,
              y: nPortalScr.y,
            });
          }
        }

        // South Return-to-Citadel Portal Label on Hunting Maps
        if (
          !isCitadel &&
          Math.hypot(SOUTH_PORTAL_POS.x - playerX, SOUTH_PORTAL_POS.z - playerZ) < labelRadius
        ) {
          const sPortalScr = projectToScreen(SOUTH_PORTAL_POS.x, 4.9, SOUTH_PORTAL_POS.z, cw, ch);
          if (sPortalScr) {
            labels.push({
              id: 'portal_south',
              title: 'Cổng Trở Về → HOÀNG THÀNH',
              subtitle: 'Đô Thành An Toàn · NPC',
              kind: 'portal',
              color: '#fbbf24',
              x: sPortalScr.x,
              y: sPortalScr.y,
            });
          }
        }

        // NPC Labels (Strictly ONLY in Hoàng Thành Map 1 & when visible in camera!)
        if (isCitadel) {
          for (let i = 0; i < npcVisuals.length; i++) {
            const nv = npcVisuals[i];
            const npc = nv.npc;
            dots.push({ x: npc.x, z: npc.z, kind: 'npc' });
            if (nv.holder.visible && Math.hypot(npc.x - playerX, npc.z - playerZ) < labelRadius) {
              const nScr = projectToScreen(npc.x, 2.65, npc.z, cw, ch);
              if (nScr) {
                labels.push({
                  id: npc.id,
                  title: npc.name,
                  subtitle: npc.role,
                  kind: 'npc',
                  color: npc.accentColor,
                  x: nScr.x,
                  y: nScr.y,
                });
              }
            }
          }
        }

        // Monster & Boss Labels (Strictly ONLY on Hunting Maps 2..32 & when visible in camera!)
        if (!isCitadel) {
          for (const [mobId, sm] of serverMonstersRef.current.entries()) {
            if (sm.dead) continue;
            const vis = monsterVisuals.get(mobId);
            const mx = vis ? vis.x : sm.x;
            const mz = vis ? vis.z : sm.z;
            dots.push({ x: mx, z: mz, kind: sm.isBoss ? 'boss' : 'mob' });
            if (vis?.holder.visible && Math.hypot(mx - playerX, mz - playerZ) < labelRadius) {
              const mScr = projectToScreen(mx, sm.isBoss ? 3.8 : 2.1, mz, cw, ch);
              if (mScr) {
                labels.push({
                  id: sm.id,
                  title: `Lv.${sm.level} ${sm.name}`,
                  hpPct: Math.round((sm.hp / Math.max(1, sm.maxHp)) * 100),
                  kind: sm.isBoss ? 'boss' : 'mob',
                  color: sm.isBoss ? '#fb7185' : '#f87171',
                  x: mScr.x,
                  y: mScr.y,
                });
              }
            }
          }

          for (const [lootId, sl] of serverLootsRef.current.entries()) {
            dots.push({ x: sl.x, z: sl.z, kind: 'loot' });
            const lv = lootVisuals.get(lootId);
            if (lv?.group.visible && Math.hypot(sl.x - playerX, sl.z - playerZ) < 20 * camZoomScale) {
              const lScr = projectToScreen(sl.x, 1.15, sl.z, cw, ch);
              if (lScr) {
                labels.push({
                  id: sl.id,
                  title: sl.label,
                  kind: 'loot',
                  color: sl.color,
                  x: lScr.x,
                  y: lScr.y,
                });
              }
            }
          }
        }

        // Remote Players (Minimap shows all on map; overhead label only when visible in camera!)
        for (const [peerId, entry] of peerRigs.entries()) {
          const peer = activePeers.get(peerId);
          if (!peer) continue;
          dots.push({ x: entry.x, z: entry.z, kind: 'peer' });
          if (entry.rig.root.visible && Math.hypot(entry.x - playerX, entry.z - playerZ) < labelRadius) {
            const rScr = projectToScreen(entry.x, peer.mounted ? 2.6 : 2.1, entry.z, cw, ch);
            if (rScr) {
              labels.push({
                id: peerId,
                title: `Lv.${peer.level} ${peer.name}`,
                subtitle: peer.enhanceLevel >= 7 ? `[+${peer.enhanceLevel}]` : undefined,
                hpPct: Math.round((peer.hp / Math.max(1, peer.maxHp)) * 100),
                kind: 'peer',
                color: '#34d399',
                x: rScr.x,
                y: rScr.y,
              });
            }
          }
        }

        // Floating Damage / Heal / Level-Up Numbers
        const screenFloats: FloatingTextEvent[] = [];
        for (let i = floatingEvents.length - 1; i >= 0; i--) {
          const fe = floatingEvents[i];
          fe.age += 0.055;
          fe.wy += 0.09;
          if (fe.age > 0.98) {
            floatingEvents.splice(i, 1);
            continue;
          }
          const fs = projectToScreen(fe.wx, fe.wy, fe.wz, cw, ch);
          if (fs) {
            screenFloats.push({
              id: fe.id,
              text: fe.text,
              color: fe.color,
              crit: fe.crit,
              screenX: fs.x,
              screenY: fs.y,
            });
          }
        }

        let nearbyLootCount = 0;
        if (!isCitadel) {
          for (const sl of serverLootsRef.current.values()) {
            if (Math.hypot(sl.x - playerX, sl.z - playerZ) < 8.5) {
              nearbyLootCount++;
            }
          }
        }

        callbacksRef.current.onHudRealtimeSync({
          playerX,
          playerZ,
          dots,
          labels,
          floatingTexts: screenFloats,
          lootCountNearby: nearbyLootCount,
        });
      }

      if (IS_SOFTWARE_GL) {
        afterDraw(() => tick(performance.now()));
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    const unsubAssets = assetRegistry.subscribe(() => {
      rebuildPlayerActor();
      peerRigs.clear();
      while (peersGroup.children.length > 0) peersGroup.remove(peersGroup.children[0]);
      buildMapWorld(charRef.current.mapId, true);
    });

    tick(performance.now());

    return () => {
      disposed = true;
      unsubAssets();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs?.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      domEl.removeEventListener('contextmenu', preventContext);
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    rebuildPlayerRigRef.current?.();
  }, [
    character.classId,
    character.hairColor,
    character.accentColor,
    character.equippedWeapon,
    character.equippedArmor,
    character.equippedHelm,
    character.equippedWings,
    character.equippedMount,
    character.enhanceLevel,
    character.mounted,
  ]);

  useEffect(() => {
    if (prevMapIdRef.current !== character.mapId) {
      prevMapIdRef.current = character.mapId;
      rebuildMapRef.current?.(character.mapId);
    }
  }, [character.mapId]);

  return (
    <div ref={canvasMountRef} className="w-full h-full absolute inset-0 z-0 overflow-hidden" />
  );
};
