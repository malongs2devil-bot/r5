import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { ActorActionType, ClassId, SkillVfxType } from '../types/game';
import { ITEMS_CATALOG } from '../data/gameData';
import {
  ArticulatedActorRig,
  buildCharacterRig,
  buildMonsterRig,
  CharacterVisualConfig,
  MonsterActorRig,
  updateActorRigAnimation,
  updateMonsterRigAnimation,
} from './ProceduralModels';
import { assetRegistry, IS_SOFTWARE_GL } from './AssetRegistry';

interface Studio3DPreviewCanvasProps {
  mode: 'character' | 'monster' | 'map' | 'vfx';
  slotKey: string;
  modelUrl?: string;
  action: ActorActionType | 'chase' | 'patrol';
  mounted?: boolean;
  classId?: ClassId;
  mobStyle?: 'mutant' | 'mecha' | 'hound' | 'wraith' | 'golem';
  isBoss?: boolean;
  scale?: number;
  offsetY?: number;
  rotationY?: number;
  accentColor?: string;
  vfxType?: SkillVfxType | null;
  vfxTriggerTick?: number;
  isRotatedPortrait?: boolean;
  className?: string;
}

export const Studio3DPreviewCanvas: React.FC<Studio3DPreviewCanvasProps> = ({
  mode,
  slotKey,
  modelUrl,
  action,
  mounted = false,
  classId = 'vanguard',
  mobStyle = 'mutant',
  isBoss = false,
  scale = 1.0,
  offsetY = 0,
  rotationY = 0,
  accentColor = '#f59e0b',
  vfxType = null,
  vfxTriggerTick = 0,
  isRotatedPortrait = false,
  className = 'w-full h-full min-h-[220px]',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [assetTick, setAssetTick] = useState(0);
  const zoomMulRef = useRef(1.0);
  const resetViewRef = useRef<(() => void) | null>(null);
  const spawnVfxRef = useRef<((vfxName: string | null, hex: string) => void) | null>(null);

  const propsRef = useRef({
    mode,
    slotKey,
    modelUrl,
    action,
    mounted,
    classId,
    mobStyle,
    isBoss,
    scale,
    offsetY,
    rotationY,
    accentColor,
    vfxType,
    isRotatedPortrait,
  });

  propsRef.current = {
    mode,
    slotKey,
    modelUrl,
    action,
    mounted,
    classId,
    mobStyle,
    isBoss,
    scale,
    offsetY,
    rotationY,
    accentColor,
    vfxType,
    isRotatedPortrait,
  };

  const actionSeqRef = useRef(1);
  const prevActionRef = useRef(action);
  if (prevActionRef.current !== action) {
    prevActionRef.current = action;
    actionSeqRef.current += 1;
  }

  useEffect(() => {
    return assetRegistry.subscribe(() => setAssetTick((t) => t + 1));
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const getViewportSize = () => {
      const rect = container.getBoundingClientRect();
      const rot = propsRef.current.isRotatedPortrait;
      const cw = container.clientWidth || (rot ? rect.height : rect.width) || 260;
      const ch = container.clientHeight || (rot ? rect.width : rect.height) || 220;
      return { w: Math.max(cw, 120), h: Math.max(ch, 120) };
    };

    const { w, h } = getViewportSize();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 1200);

    const renderer = new THREE.WebGLRenderer({
      antialias: !IS_SOFTWARE_GL,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.setPixelRatio(
      IS_SOFTWARE_GL ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight('#93c5fd', '#18181b', 0.95);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#fde68a', 2.25);
    keyLight.position.set(3.5, 6.5, 5.0);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#38bdf8', 1.45);
    rimLight.position.set(-3.5, 4.0, -3.5);
    scene.add(rimLight);

    // Compact Studio Pedestal (sits cleanly beneath feet without blocking camera!)
    const stageGroup = new THREE.Group();
    if (mode !== 'map') {
      const baseMat = new THREE.MeshStandardMaterial({
        color: '#111827',
        metalness: 0.82,
        roughness: 0.28,
      });
      const ringMat = new THREE.MeshStandardMaterial({
        color: accentColor || '#f59e0b',
        emissive: accentColor || '#f59e0b',
        emissiveIntensity: 1.5,
      });

      const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.28, 0.1, 32), baseMat);
      disc.position.y = -0.05;
      stageGroup.add(disc);

      const trimRing = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.025, 8, 48), ringMat);
      trimRing.rotation.x = Math.PI / 2;
      trimRing.position.y = 0.005;
      stageGroup.add(trimRing);
      scene.add(stageGroup);
    }

    const holderGroup = new THREE.Group();
    scene.add(holderGroup);

    const vfxGroup = new THREE.Group();
    scene.add(vfxGroup);

    let charRig: ArticulatedActorRig | null = null;
    let mobRig: MonsterActorRig | null = null;
    let standaloneMixer: THREE.AnimationMixer | null = null;
    const activeVfxMixers: THREE.AnimationMixer[] = [];

    let baseCamDist = mode === 'map' ? 75 : 4.8;
    let baseLookY = mode === 'map' ? 0 : 1.05;
    let camPitch = mode === 'map' ? 0.55 : 0.22;

    const rebuildRig = () => {
      while (holderGroup.children.length > 0) {
        holderGroup.remove(holderGroup.children[0]);
      }
      standaloneMixer = null;
      const p = propsRef.current;

      if (p.mode === 'character') {
        const matchedCatalogItem = Object.values(ITEMS_CATALOG).find(
          (it) => it.assetSlotKey === p.slotKey
        );
        const defaultWpnId =
          p.classId === 'esper'
            ? 'wpn_esper_1'
            : p.classId === 'evolver'
            ? 'wpn_evolver_1'
            : 'wpn_vanguard_1';
        const previewWeapon =
          matchedCatalogItem?.slot === 'weapon'
            ? matchedCatalogItem.id
            : defaultWpnId;
        const previewArmor =
          matchedCatalogItem?.slot === 'armor'
            ? matchedCatalogItem.id
            : assetRegistry.getOverride('armor_t1')
            ? 'arm_t1'
            : 'arm_t1';
        const previewHelm =
          matchedCatalogItem?.slot === 'helm'
            ? matchedCatalogItem.id
            : assetRegistry.getOverride('helm_t1')
            ? 'hlm_t1'
            : 'none';
        const previewWings =
          matchedCatalogItem?.slot === 'wings'
            ? matchedCatalogItem.id
            : assetRegistry.getOverride('wings_t2')
            ? 'wng_t2_cyber'
            : 'none';
        const previewMount =
          matchedCatalogItem?.slot === 'mount'
            ? matchedCatalogItem.id
            : p.mounted
            ? 'mnt_bike'
            : 'none';
        const isDirectCharacterOrNpcSlot =
          p.slotKey.startsWith('class_') || p.slotKey.startsWith('npc_');

        const visualCfg: CharacterVisualConfig = {
          classId: p.classId,
          hairColor: p.accentColor,
          accentColor: p.accentColor,
          equippedWeapon: previewWeapon,
          equippedArmor: previewArmor,
          equippedHelm: previewHelm,
          equippedWings: previewWings,
          equippedMount: previewMount,
          enhanceLevel: matchedCatalogItem ? Math.min(15, (matchedCatalogItem.tier || 1) + 4) : 0,
          mounted: p.mounted || matchedCatalogItem?.slot === 'mount',
          overrideSlotKey: isDirectCharacterOrNpcSlot ? p.slotKey : undefined,
        };
        charRig = buildCharacterRig(visualCfg);
        mobRig = null;
        holderGroup.add(charRig.root);
      } else if (p.mode === 'monster') {
        mobRig = buildMonsterRig({
          style: p.mobStyle,
          assetSlot: p.slotKey,
          accentColor: p.accentColor,
          isBoss: p.isBoss,
        });
        charRig = null;
        holderGroup.add(mobRig.root);
      } else {
        const custom = assetRegistry.instantiateSlot(p.slotKey);
        if (custom) {
          holderGroup.add(custom.group);
          if (custom.animations.length > 0) {
            standaloneMixer = new THREE.AnimationMixer(custom.group);
            standaloneMixer.clipAction(custom.animations[0]).play();
          }
        }
        charRig = null;
        mobRig = null;
      }

      holderGroup.scale.setScalar(p.scale);
      holderGroup.position.y = p.offsetY;
      holderGroup.rotation.y = THREE.MathUtils.degToRad(p.rotationY);

      // Auto-frame camera distance to bounding box so model is NEVER clipped or zoomed into pedestal!
      const box = new THREE.Box3().setFromObject(holderGroup);
      if (!box.isEmpty() && p.mode !== 'map') {
        const sz = box.getSize(new THREE.Vector3());
        const ctr = box.getCenter(new THREE.Vector3());
        const maxExtent = Math.max(sz.y, sz.x * 1.15, sz.z * 1.15, 1.8);
        baseCamDist = Math.max(4.4, maxExtent * 2.25);
        baseLookY = Math.max(0.75, Math.min(2.6, ctr.y));
      } else if (p.mode === 'map') {
        baseCamDist = 72;
        baseLookY = 0;
      } else {
        baseCamDist = 4.8;
        baseLookY = 1.0;
      }
    };

    rebuildRig();

    const activeTimers: number[] = [];

    // Synchronized Skill VFX Spawner:
    // Phase 1 (t = 0ms): Arcane ground sigil / rune circle lights up beneath the caster for full duration (1.25s)
    // Phase 2 (t = 280ms): Exact hit-frame when weapons strike -> shockwave ring, burst sparks, and custom 3D VFX erupt
    // Phase 3 (t = 1.05s - 1.25s): Visual particles and character martial arts choreography finish simultaneously!
    spawnVfxRef.current = (vfxName: string | null, hex: string) => {
      const vfxColor = hex || '#f59e0b';
      const vfxSlotKey = vfxName
        ? vfxName.startsWith('vfx_')
          ? vfxName
          : `vfx_${vfxName}`
        : propsRef.current.slotKey.startsWith('vfx_')
        ? propsRef.current.slotKey
        : '';

      // Phase 1: Immediate Ground Sigil Aura (t = 0ms)
      const sigilGeo = new THREE.RingGeometry(0.35, 1.45, 32);
      const sigilMat = new THREE.MeshBasicMaterial({
        color: vfxColor,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const sigilMesh = new THREE.Mesh(sigilGeo, sigilMat);
      sigilMesh.rotation.x = -Math.PI / 2;
      sigilMesh.position.set(0, 0.04, propsRef.current.mode === 'character' ? 0.35 : 0);
      sigilMesh.userData = {
        life: 0,
        maxLife: 1.25,
        expandScalar: 1.35,
        initialOpacity: 0.88,
        rotSpeed: 2.2,
      };
      vfxGroup.add(sigilMesh);

      // Phase 2: Hit-Frame Strike & Shockwave Burst (t = 280ms)
      const strikeTimer = window.setTimeout(() => {
        if (disposed) return;

        const customVfx = vfxSlotKey ? assetRegistry.instantiateSlot(vfxSlotKey) : null;
        if (customVfx) {
          const fxHolder = new THREE.Group();
          fxHolder.position.set(0, 0.05, propsRef.current.mode === 'character' ? 0.65 : 0);
          fxHolder.add(customVfx.group);
          let maxLife = 0.95;
          if (customVfx.animations.length > 0) {
            const mx = new THREE.AnimationMixer(customVfx.group);
            const act = mx.clipAction(customVfx.animations[0]);
            act.setLoop(THREE.LoopOnce, 1);
            act.clampWhenFinished = true;
            act.play();
            activeVfxMixers.push(mx);
            maxLife = Math.max(0.85, Math.min(1.8, customVfx.animations[0].duration));
            fxHolder.userData = { life: 0, maxLife, isCustomVfx: true, mixer: mx };
          } else {
            fxHolder.userData = { life: 0, maxLife: 0.95, isCustomVfx: true, pulseCustom: true };
          }
          vfxGroup.add(fxHolder);
        }

        // Synchronized shockwave ring expanding outward at strike impact
        const ringGeo = new THREE.TorusGeometry(0.65, 0.06, 10, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: vfxColor,
          transparent: true,
          opacity: 0.92,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, 0.12, propsRef.current.mode === 'character' ? 0.55 : 0);
        ring.userData = { life: 0, maxLife: 0.95, expandScalar: 3.2, initialOpacity: 0.92 };
        vfxGroup.add(ring);

        // Burst sparks radiating outward at strike
        for (let i = 0; i < 24; i++) {
          const pGeo = new THREE.OctahedronGeometry(0.12, 0);
          const pMat = new THREE.MeshBasicMaterial({
            color: i % 2 === 0 ? vfxColor : '#ffffff',
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const pMesh = new THREE.Mesh(pGeo, pMat);
          const angle = (i / 24) * Math.PI * 2;
          pMesh.position.set(
            Math.cos(angle) * 0.35,
            0.75 + (i % 3) * 0.25,
            Math.sin(angle) * 0.35 + (propsRef.current.mode === 'character' ? 0.55 : 0)
          );
          pMesh.userData = {
            life: 0,
            maxLife: 0.95,
            expandScalar: 1.8,
            initialOpacity: 0.95,
            vx: Math.cos(angle) * (2.4 + (i % 3) * 0.6),
            vy: 1.2 + (i % 3) * 0.9,
            vz: Math.sin(angle) * (2.4 + (i % 3) * 0.6),
          };
          vfxGroup.add(pMesh);
        }
      }, 280);

      activeTimers.push(strikeTimer);
    };

    // Orbit + Pinch Zoom Camera Controls (Rotated-Portrait Aware!)
    const activePointers = new Map<number, { x: number; y: number }>();
    let prevPinchDist = 0;
    let targetYaw = 0.25;
    let currentYaw = 0.25;

    resetViewRef.current = () => {
      zoomMulRef.current = 1.0;
      targetYaw = 0.25;
      camPitch = propsRef.current.mode === 'map' ? 0.55 : 0.22;
    };

    const mapPointerCoords = (clientX: number, clientY: number) => {
      if (propsRef.current.isRotatedPortrait) {
        return { x: clientY, y: -clientX };
      }
      return { x: clientX, y: clientY };
    };

    const onPointerDown = (e: PointerEvent) => {
      const pt = mapPointerCoords(e.clientX, e.clientY);
      activePointers.set(e.pointerId, pt);
      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        prevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return;
      const prevPt = activePointers.get(e.pointerId)!;
      const curPt = mapPointerCoords(e.clientX, e.clientY);
      activePointers.set(e.pointerId, curPt);

      if (activePointers.size === 1) {
        const dx = curPt.x - prevPt.x;
        const dy = curPt.y - prevPt.y;
        targetYaw += dx * 0.012;
        camPitch = Math.max(0.05, Math.min(0.85, camPitch + dy * 0.006));
      } else if (activePointers.size >= 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (prevPinchDist > 8) {
          const ratio = prevPinchDist / Math.max(8, dist);
          zoomMulRef.current = Math.max(0.45, Math.min(2.6, zoomMulRef.current * ratio));
        }
        prevPinchDist = dist;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) prevPinchDist = 0;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomMulRef.current = Math.max(
        0.45,
        Math.min(2.6, zoomMulRef.current + (e.deltaY > 0 ? 0.12 : -0.12))
      );
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      const next = getViewportSize();
      renderer.setPixelRatio(
        IS_SOFTWARE_GL ? 1 : Math.min(window.devicePixelRatio || 1, 2)
      );
      camera.aspect = next.w / next.h;
      camera.updateProjectionMatrix();
      renderer.setSize(next.w, next.h, false);
    };

    const resizeObs =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => onResize()) : null;
    resizeObs?.observe(container);
    window.addEventListener('resize', onResize);

    let lastTime = performance.now();
    const startTime = lastTime;
    let frameId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const t = (now - startTime) / 1000;
      const p = propsRef.current;

      if (activePointers.size === 0 && p.action === 'idle') {
        targetYaw += dt * 0.25;
      }
      currentYaw = THREE.MathUtils.damp(currentYaw, targetYaw, 8, dt);
      holderGroup.rotation.y = THREE.MathUtils.degToRad(p.rotationY) + currentYaw;
      holderGroup.scale.setScalar(p.scale);
      holderGroup.position.y = p.offsetY;

      // Aspect-aware camera distance so narrow mobile studio columns NEVER crop the character!
      const aspectPullback = camera.aspect < 1.0 ? 1.0 / Math.max(0.45, camera.aspect * 0.92) : 1.0;
      const finalDist = baseCamDist * zoomMulRef.current * aspectPullback;
      camera.position.set(
        0,
        baseLookY + Math.sin(camPitch) * finalDist,
        Math.cos(camPitch) * finalDist
      );
      camera.lookAt(0, baseLookY, 0);

      if (charRig) {
        const skillMatch = String(p.action).match(/^skill([1-6])$/);
        const resolvedSkillIdx = skillMatch ? parseInt(skillMatch[1], 10) - 1 : undefined;

        updateActorRigAnimation({
          rig: charRig,
          action: p.action as ActorActionType,
          actionSeq: actionSeqRef.current,
          skillIndex: resolvedSkillIdx,
          moveBlend: p.action === 'run' ? 1.0 : 0.0,
          mounted: p.mounted,
          classId: p.classId,
          dt,
          elapsed: t,
        });
      } else if (mobRig) {
        updateMonsterRigAnimation({
          rig: mobRig,
          action: (p.action === 'run' ? 'chase' : p.action) as
            | 'idle'
            | 'patrol'
            | 'chase'
            | 'attack'
            | 'hit'
            | 'dead',
          actionSeq: actionSeqRef.current,
          dt,
          elapsed: t,
          seedOffset: 0,
        });
      } else if (standaloneMixer) {
        standaloneMixer.update(dt);
      }

      for (let i = vfxGroup.children.length - 1; i >= 0; i--) {
        const child = vfxGroup.children[i];
        const u = child.userData;
        if (!u || u.life === undefined) continue;
        u.life += dt;
        if (u.mixer) {
          (u.mixer as THREE.AnimationMixer).update(dt);
        }
        if (u.life >= u.maxLife) {
          if (u.mixer) {
            const idx = activeVfxMixers.indexOf(u.mixer);
            if (idx >= 0) activeVfxMixers.splice(idx, 1);
          }
          vfxGroup.remove(child);
          continue;
        }
        const prog = u.life / u.maxLife;
        if (u.isCustomVfx) {
          if (u.pulseCustom) {
            const pulse = prog < 0.2 ? prog / 0.2 : prog > 0.78 ? (1 - prog) / 0.22 : 1.0;
            child.scale.setScalar(Math.max(0.05, pulse * 1.15));
            child.rotation.y += dt * 2.4;
          }
        } else {
          if (u.rotSpeed) {
            child.rotation.z += dt * u.rotSpeed;
          }
          if (u.vx !== undefined) {
            child.position.x += u.vx * dt;
            child.position.y += u.vy * dt;
            child.position.z += u.vz * dt;
          }
          child.scale.setScalar(1 + prog * (u.expandScalar || 2.2));
          if ((child as THREE.Mesh).material) {
            const mat = (child as THREE.Mesh).material as THREE.Material;
            mat.opacity = (1 - prog) * (u.initialOpacity || 0.88);
          }
        }
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      disposed = true;
      activeTimers.forEach((tid) => clearTimeout(tid));
      spawnVfxRef.current = null;
      resetViewRef.current = null;
      cancelAnimationFrame(frameId);
      resizeObs?.disconnect();
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, [mode, slotKey, classId, mobStyle, isBoss, mounted, assetTick]);

  useEffect(() => {
    if (!vfxTriggerTick) return;
    actionSeqRef.current += 1;
    spawnVfxRef.current?.(vfxType || null, accentColor || '#f59e0b');
  }, [vfxTriggerTick, vfxType, accentColor]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border border-zinc-800 ${className}`}
    >
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        title="Vuốt xoay 360° · Chụm 2 ngón hoặc lăn chuột để Thu/Phóng Camera"
      />
      {/* Built-in Studio Camera Zoom & Framing Controls */}
      <div className="absolute bottom-2 right-2 z-20 flex items-center gap-1 bg-zinc-950/92 border border-zinc-700/80 rounded-lg p-1">
        <button
          type="button"
          onClick={() => {
            zoomMulRef.current = Math.max(0.45, zoomMulRef.current - 0.22);
          }}
          className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 active:scale-95"
          title="Phóng gần Camera"
        >
          <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
        </button>
        <button
          type="button"
          onClick={() => {
            zoomMulRef.current = Math.min(2.6, zoomMulRef.current + 0.22);
          }}
          className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-200 active:scale-95"
          title="Thu xa Camera"
        >
          <ZoomOut className="w-3.5 h-3.5 text-sky-400" />
        </button>
        <button
          type="button"
          onClick={() => resetViewRef.current?.()}
          className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-[10px] font-bold text-amber-300 flex items-center gap-1 active:scale-95"
          title="Đặt lại góc nhìn Toàn Cảnh"
        >
          <RotateCcw className="w-3 h-3" />
          Toàn Cảnh
        </button>
      </div>
    </div>
  );
};
