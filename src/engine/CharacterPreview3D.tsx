import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ArticulatedActorRig,
  buildCharacterRig,
  CharacterVisualConfig,
} from './ProceduralModels';
import { assetRegistry, IS_SOFTWARE_GL } from './AssetRegistry';

interface CharacterPreview3DProps {
  config: CharacterVisualConfig;
  className?: string;
  isRotatedPortrait?: boolean;
}

export const CharacterPreview3D: React.FC<CharacterPreview3DProps> = ({
  config,
  className = 'w-full h-full',
  isRotatedPortrait = false,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const configRef = useRef<CharacterVisualConfig>(config);
  const rotatedRef = useRef<boolean>(isRotatedPortrait);
  const rebuildFnRef = useRef<(() => void) | null>(null);
  const [assetTick, setAssetTick] = useState(0);

  configRef.current = config;
  rotatedRef.current = isRotatedPortrait;

  useEffect(() => {
    return assetRegistry.subscribe(() => {
      setAssetTick((t) => t + 1);
    });
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const getContainerSize = () => {
      const w = Math.max(container.clientWidth || container.offsetWidth, 120);
      const h = Math.max(container.clientHeight || container.offsetHeight, 120);
      return { w, h };
    };

    const { w: initW, h: initH } = getContainerSize();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, initW / initH, 0.1, 50);

    const updateCameraFraming = (w: number, h: number) => {
      const aspect = w / Math.max(1, h);
      // Automatically pull camera back on narrow portrait-shaped slots so wings/weapons/podium never clip
      const narrowPullback = aspect < 1.05 ? (1.05 - aspect) * 2.15 : 0;
      camera.aspect = aspect;
      if (configRef.current.mounted) {
        camera.position.set(0, 1.52, 4.95 + narrowPullback * 1.15);
        camera.lookAt(0, 1.05, 0);
      } else {
        camera.position.set(0, 1.28, 3.95 + narrowPullback);
        camera.lookAt(0, 0.94, 0);
      }
      camera.updateProjectionMatrix();
    };

    const renderer = new THREE.WebGLRenderer({
      antialias: !IS_SOFTWARE_GL,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(IS_SOFTWARE_GL ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    // Pass updateStyle = false so inline pixel height never prevents flexbox shrinking on small phones
    renderer.setSize(initW, initH, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    updateCameraFraming(initW, initH);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight('#93c5fd', '#27272a', 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#fde68a', 2.1);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight('#38bdf8', 1.25);
    rimLight.position.set(-3, 3, -3);
    scene.add(rimLight);

    // Studio Podium Pedestal (3-part composite)
    const podiumGroup = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({
      color: '#18181b',
      metalness: 0.85,
      roughness: 0.25,
    });
    const ringMat = new THREE.MeshStandardMaterial({
      color: '#f59e0b',
      emissive: '#f59e0b',
      emissiveIntensity: 1.2,
    });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.14, 1.28, 0.14, 32), baseMat);
    disc.position.y = -0.07;
    podiumGroup.add(disc);

    const trimRing = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.025, 8, 40), ringMat);
    trimRing.rotation.x = Math.PI / 2;
    trimRing.position.y = 0.01;
    podiumGroup.add(trimRing);
    scene.add(podiumGroup);

    const stageHolder = new THREE.Group();
    scene.add(stageHolder);

    let currentRig: ArticulatedActorRig | null = null;
    const rebuildActor = () => {
      while (stageHolder.children.length > 0) {
        stageHolder.remove(stageHolder.children[0]);
      }
      currentRig = buildCharacterRig(configRef.current);
      const { w, h } = getContainerSize();
      updateCameraFraming(w, h);
      stageHolder.add(currentRig.root);
    };
    rebuildFnRef.current = rebuildActor;
    rebuildActor();

    let isDragging = false;
    let prevAxis = 0;
    let targetYaw = 0.35;
    let currentYaw = 0.35;

    const getHorizontalDragCoord = (e: PointerEvent) =>
      rotatedRef.current ? e.clientY : e.clientX;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevAxis = getHorizontalDragCoord(e);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const curAxis = getHorizontalDragCoord(e);
      const delta = curAxis - prevAxis;
      prevAxis = curAxis;
      targetYaw += delta * 0.014;
    };
    const onPointerUp = () => {
      isDragging = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    const onResize = () => {
      if (!container) return;
      const { w, h } = getContainerSize();
      updateCameraFraming(w, h);
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
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const t = (now - startTime) / 1000;

      if (!isDragging) {
        targetYaw += dt * 0.45;
      }
      currentYaw = THREE.MathUtils.damp(currentYaw, targetYaw, 8, dt);
      stageHolder.rotation.y = currentYaw;

      if (currentRig) {
        if (currentRig.mixer) {
          currentRig.mixer.update(dt);
        } else {
          currentRig.bodyPivot.position.y =
            (configRef.current.mounted ? 0.62 : 0) + Math.sin(t * 2.4) * 0.025;
          currentRig.torso.rotation.x = Math.sin(t * 2.4) * 0.03;
          currentRig.torso.rotation.y = Math.cos(t * 1.4) * 0.04;
          currentRig.rightArm.rotation.z = 0.12 + Math.sin(t * 2.4) * 0.04;
          currentRig.leftArm.rotation.z = -0.12 - Math.sin(t * 2.4) * 0.04;
        }
        if (currentRig.wingsGroup) {
          currentRig.wingsGroup.rotation.y = Math.sin(t * 3.2) * 0.12;
        }
        if (currentRig.auraRing) {
          currentRig.auraRing.rotation.y = t * 1.4;
        }
      }

      renderer.render(scene, camera);
      if (IS_SOFTWARE_GL) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs?.disconnect();
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    rebuildFnRef.current?.();
  }, [
    config.classId,
    config.hairColor,
    config.accentColor,
    config.equippedWeapon,
    config.equippedArmor,
    config.equippedHelm,
    config.equippedWings,
    config.equippedMount,
    config.enhanceLevel,
    config.mounted,
    assetTick,
  ]);

  return (
    <div
      ref={mountRef}
      className={`absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing touch-none ${className}`}
      title="Kéo trái/phải để xoay nhân vật 360°"
    />
  );
};
