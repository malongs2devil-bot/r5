import * as THREE from 'three';
import { ActorActionType, ClassId, NpcDef } from '../types/game';
import { ITEMS_CATALOG, RARITY_META } from '../data/gameData';
import { assetRegistry } from './AssetRegistry';

export interface CharacterVisualConfig {
  classId: ClassId;
  hairColor: string;
  accentColor: string;
  equippedWeapon: string;
  equippedArmor: string;
  equippedHelm: string;
  equippedWings: string;
  equippedMount: string;
  enhanceLevel: number;
  mounted: boolean;
  overrideSlotKey?: string;
}

export interface ArticulatedActorRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  torso: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  weaponGroup: THREE.Group;
  wingsGroup: THREE.Group | null;
  auraRing: THREE.Group | null;
  mountGroup: THREE.Group | null;
  mixer: THREE.AnimationMixer | null;
  clips: THREE.AnimationClip[];
  isCustomModel: boolean;
  currentClipKey: string;
  currentClipAction: THREE.AnimationAction | null;
  walkPhase: number;
  actionTimer: number;
  actionDuration: number;
  lastActionSeq: number;
  activeOneShotAction?: ActorActionType;
  activeOneShotSkillIndex?: number;
}

export interface MonsterActorRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  clips: THREE.AnimationClip[];
  isCustomModel: boolean;
  currentClipKey: string;
  currentClipAction: THREE.AnimationAction | null;
  actionTimer: number;
  lastActionSeq: number;
}

export function createThemedGroundTexture(
  mapId: number,
  baseHex: string,
  lineHex: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (mapId === 1) {
    return createCitadelMarbleTexture();
  }

  // Theme 1: Grasslands / Thảo Nguyên (Maps 2-8)
  if (mapId >= 2 && mapId <= 8) {
    ctx.fillStyle = '#14532d'; // lush green field
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 500; i++) {
      const x = (i * 73) % 512;
      const y = (i * 131) % 512;
      ctx.fillStyle = i % 3 === 0 ? '#16a34a' : i % 3 === 1 ? '#22c55e' : '#15803d';
      ctx.fillRect(x, y, 4, 14);
    }
    ctx.strokeStyle = '#86efac';
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 2;
    for (let g = 0; g <= 512; g += 64) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, g);
      ctx.lineTo(512, g);
      ctx.stroke();
    }
  }
  // Theme 2: Cyber Wasteland / Thành Phố Hoang Tàn (Maps 9-16)
  else if (mapId >= 9 && mapId <= 16) {
    ctx.fillStyle = '#090d16'; // dark asphalt/cyber grid
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 64) {
      for (let x = 0; x < 512; x += 64) {
        ctx.fillStyle = (x + y) % 128 === 0 ? '#0f172a' : '#1e293b';
        ctx.fillRect(x + 2, y + 2, 60, 60);
      }
    }
    ctx.strokeStyle = '#38bdf8'; // neon cyan grid
    ctx.globalAlpha = 0.38;
    ctx.lineWidth = 3;
    for (let g = 0; g <= 512; g += 128) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, g);
      ctx.lineTo(512, g);
      ctx.stroke();
    }
    // Neon energy nodes
    ctx.fillStyle = '#c084fc';
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 28; i++) {
      const cx = (i * 139) % 512;
      const cy = (i * 97) % 512;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Theme 3: Frozen Tundra / Pháo Đài Băng Giá (Maps 17-24)
  else if (mapId >= 17 && mapId <= 24) {
    ctx.fillStyle = '#1e3a8a'; // deep ice blue
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 420; i++) {
      const x = (i * 79) % 512;
      const y = (i * 143) % 512;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x, y, 18, 5);
    }
    ctx.strokeStyle = '#93c5fd';
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = 2.5;
    for (let g = 0; g <= 512; g += 64) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, g);
      ctx.lineTo(512, g);
      ctx.stroke();
    }
  }
  // Theme 4: Volcanic / Hầm Ngục Dung Hạm (Maps 25-32)
  else {
    ctx.fillStyle = '#0f0505'; // charred obsidian
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#ef4444'; // glowing magma cracks
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 4;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      let px = (i * 61) % 512;
      let py = 0;
      ctx.moveTo(px, py);
      while (py < 512) {
        px += (Math.random() - 0.5) * 70;
        py += 45;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    for (let g = 0; g <= 512; g += 128) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, g);
      ctx.lineTo(512, g);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.repeat.set(22, 22);
  return tex;
}


export function createCitadelMarbleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Royal slate-ivory stone plaza tile
  ctx.fillStyle = '#232838';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle marble veining & stone blocks
  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 512; x += 64) {
      const shade = ((x * 7 + y * 13) % 16) - 8;
      ctx.fillStyle = shade > 0 ? 'rgba(255,250,235,0.045)' : 'rgba(10,14,24,0.08)';
      ctx.fillRect(x + 2, y + 2, 60, 60);
    }
  }

  // Gold & obsidian architectural grout lines
  ctx.strokeStyle = '#d97706';
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 2;
  for (let g = 0; g <= 512; g += 64) {
    ctx.beginPath();
    ctx.moveTo(g, 0);
    ctx.lineTo(g, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, g);
    ctx.lineTo(512, g);
    ctx.stroke();
  }

  // Ornamental corner filigree diamonds
  ctx.fillStyle = '#fbbf24';
  ctx.globalAlpha = 0.24;
  for (let y = 64; y < 512; y += 128) {
    for (let x = 64; x < 512; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.repeat.set(24, 24);
  return tex;
}

export function createSoftShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWeaponMesh(weaponId: string, classId: ClassId): THREE.Group {
  const item = weaponId && weaponId !== 'none' ? ITEMS_CATALOG[weaponId] : undefined;
  const tier = item?.tier || 1;
  const slotKey = item?.assetSlotKey || `weapon_${classId}_t${tier}`;

  // 1. Strictly use uploaded custom 3D weapon assets if available
  const custom =
    assetRegistry.instantiateSlot(slotKey) ||
    assetRegistry.instantiateSlot(`weapon_${classId}_t1`);

  if (custom) {
    custom.group.scale.multiplyScalar(0.68);
    custom.group.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = true;
      }
    });
    return custom.group;
  }

  // User requested: No automatic procedural drawing. 
  // Return empty group if no replacement provided.
  return new THREE.Group();
}


export function buildWingsMesh(wingsId: string): THREE.Group | null {
  if (!wingsId || wingsId === 'none') return null;
  const item = ITEMS_CATALOG[wingsId];
  if (!item) return null;

  const custom =
    assetRegistry.instantiateSlot(item.assetSlotKey) ||
    assetRegistry.instantiateSlot('wings_t2');
  if (custom) {
    custom.group.scale.multiplyScalar(0.85);
    return custom.group;
  }

  return null;
}

export function buildMountMesh(mountId: string): THREE.Group | null {
  if (!mountId || mountId === 'none') return null;
  const item = ITEMS_CATALOG[mountId];
  const slotKey = item?.assetSlotKey || 'mount_bike';
  const custom = assetRegistry.instantiateSlot(slotKey);
  if (custom) {
    custom.group.scale.multiplyScalar(1.1);
    return custom.group;
  }

  return null;
}

export function buildEnhanceAura(enhanceLevel: number, accentHex: string): THREE.Group | null {
  if (enhanceLevel < 7) return null;
  const group = new THREE.Group();
  let auraColor = '#38bdf8';
  if (enhanceLevel >= 15) auraColor = '#fb7185';
  else if (enhanceLevel >= 13) auraColor = '#ef4444';
  else if (enhanceLevel >= 11) auraColor = '#fbbf24';
  else if (enhanceLevel >= 9) auraColor = accentHex || '#34d399';

  const ringMat = new THREE.MeshStandardMaterial({
    color: auraColor,
    emissive: auraColor,
    emissiveIntensity: 1.8,
    transparent: true,
    opacity: 0.85,
  });

  const groundRing = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.025, 8, 32), ringMat);
  groundRing.rotation.x = Math.PI / 2;
  groundRing.position.y = 0.05;
  group.add(groundRing);

  if (enhanceLevel >= 9) {
    const orbitRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.018, 6, 28), ringMat);
    orbitRing.rotation.x = Math.PI / 2.8;
    orbitRing.position.y = 1.05;
    group.add(orbitRing);
  }

  if (enhanceLevel >= 13) {
    for (let i = 0; i < 4; i++) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), ringMat);
      const angle = (i * Math.PI) / 2;
      shard.position.set(Math.cos(angle) * 0.72, 1.15 + (i % 2) * 0.25, Math.sin(angle) * 0.72);
      group.add(shard);
    }
  }

  return group;
}

export function buildCharacterRig(cfg: CharacterVisualConfig): ArticulatedActorRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  let mountGroup: THREE.Group | null = null;
  if (cfg.mounted && cfg.equippedMount && cfg.equippedMount !== 'none') {
    mountGroup = buildMountMesh(cfg.equippedMount);
    if (mountGroup) {
      root.add(mountGroup);
      bodyPivot.position.y = 0.62;
    }
  }

  const slotKeyToCheck = cfg.overrideSlotKey || `class_${cfg.classId}`;
  const customChar = assetRegistry.instantiateSlot(slotKeyToCheck);

  const torso = new THREE.Group();
  const waistY = 0.86;
  torso.position.y = waistY;
  bodyPivot.add(torso);

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  let mixer: THREE.AnimationMixer | null = null;
  let clips: THREE.AnimationClip[] = [];
  let currentClipAction: THREE.AnimationAction | null = null;

  const hasEquippedWeapon = Boolean(
    cfg.equippedWeapon && cfg.equippedWeapon !== 'none' && ITEMS_CATALOG[cfg.equippedWeapon]
  );
  const armorItem =
    cfg.equippedArmor && cfg.equippedArmor !== 'none' ? ITEMS_CATALOG[cfg.equippedArmor] : undefined;
  const helmItem =
    cfg.equippedHelm && cfg.equippedHelm !== 'none' ? ITEMS_CATALOG[cfg.equippedHelm] : undefined;

  const mainWeapon = buildWeaponMesh(cfg.equippedWeapon, cfg.classId);
  const hasCustomWeaponMesh = mainWeapon.children.length > 0;

  const customArmorMesh = armorItem
    ? assetRegistry.instantiateSlot(`armor_t${armorItem.tier}`) ||
      assetRegistry.instantiateSlot(armorItem.assetSlotKey)
    : null;
  const customHelmMesh = helmItem
    ? assetRegistry.instantiateSlot(`helm_t${helmItem.tier}`) ||
      assetRegistry.instantiateSlot(helmItem.assetSlotKey)
    : null;

  if (customChar) {
    torso.position.y = 0;

    // Dynamically hide baked weapon/clothes/hair on uploaded character rig based on equipped state!
    let rightHandBone: THREE.Object3D | null = null;
    let leftHandBone: THREE.Object3D | null = null;
    let headBone: THREE.Object3D | null = null;

    customChar.group.traverse((node) => {
      const n = node.name || '';
      if ((node as THREE.Bone).isBone) {
        if (!rightHandBone && /righthand|hand_r|r_hand|weapon_r/i.test(n)) {
          rightHandBone = node;
        }
        if (!leftHandBone && /lefthand|hand_l|l_hand|weapon_l/i.test(n)) {
          leftHandBone = node;
        }
        if (!headBone && /\bhead\b|head_jnt|bip001_head/i.test(n)) {
          headBone = node;
        }
      }
      if ((node as THREE.Mesh).isMesh) {
        // Hide baked default weapon ONLY when replaced by a newly equipped custom weapon asset
        if (/weapon|sword|blade|staff|wand|axe|dagger|spear|bow|gun|katana|scythe/i.test(n)) {
          if (hasCustomWeaponMesh) {
            node.visible = false;
          }
        }
        // Hide default starter clothes ONLY when replaced by newly equipped custom armor asset
        if (customArmorMesh && /starter|cloth|shirt|tunic|coat|jacket|vest|robe|underwear/i.test(n)) {
          node.visible = false;
        }
        // Hide default hair/cap ONLY when replaced by newly equipped custom helmet asset
        if (customHelmMesh && /hair|hat|cap|hood/i.test(n)) {
          node.visible = false;
        }
      }
    });

    torso.add(customChar.group);
    if (customArmorMesh) {
      torso.add(customArmorMesh.group);
    }
    if (customHelmMesh) {
      if (headBone) {
        (headBone as THREE.Object3D).add(customHelmMesh.group);
      } else {
        customHelmMesh.group.position.y = 1.62;
        torso.add(customHelmMesh.group);
      }
    }

    clips = customChar.animations || [];
    if (clips.length > 0) {
      mixer = new THREE.AnimationMixer(customChar.group);
      const idleClip = selectClipForAction(clips, 'idle') || clips[0];
      currentClipAction = mixer.clipAction(idleClip);
      currentClipAction.play();
    }

    rightArm.position.set(0.38, 1.15, 0.15);
    leftArm.position.set(-0.38, 1.15, 0.15);
    torso.add(leftArm, rightArm);

    if (hasCustomWeaponMesh) {
      if (rightHandBone) {
        mainWeapon.position.set(0, 0, 0);
        (rightHandBone as THREE.Object3D).add(mainWeapon);
      } else {
        mainWeapon.position.set(0.05, 0, 0.12);
        mainWeapon.rotation.x = Math.PI / 3;
        rightArm.add(mainWeapon);
      }

      if (cfg.classId === 'evolver') {
        const offWpn = buildWeaponMesh(cfg.equippedWeapon, cfg.classId);
        if (leftHandBone) {
          (leftHandBone as THREE.Object3D).add(offWpn);
        } else {
          offWpn.position.set(-0.05, 0, 0.12);
          offWpn.rotation.x = Math.PI / 3;
          leftArm.add(offWpn);
        }
      }
    }
  } else {
    const enhShine = cfg.enhanceLevel >= 7 ? 0.92 : 0.68;
    const enhRough = cfg.enhanceLevel >= 9 ? 0.16 : 0.34;

    const bareClothMat = new THREE.MeshStandardMaterial({
      color: '#27272a',
      metalness: 0.12,
      roughness: 0.85,
    });
    const armorMat = new THREE.MeshStandardMaterial({
      color: armorItem ? armorItem.primaryColor : '#3f3f46',
      metalness: armorItem ? enhShine : 0.18,
      roughness: armorItem ? enhRough : 0.78,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: '#d6b49c',
      metalness: 0.08,
      roughness: 0.65,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: cfg.hairColor || '#f59e0b',
      metalness: 0.25,
      roughness: 0.55,
    });
    const trimColor =
      armorItem && armorItem.tier >= 2 ? armorItem.glowColor : cfg.accentColor;
    const glowMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      emissive: trimColor,
      emissiveIntensity: cfg.enhanceLevel >= 9 ? 1.8 : 1.15,
      metalness: 0.3,
      roughness: 0.2,
    });

    leftLeg.position.set(-0.16, 0.78, 0);
    rightLeg.position.set(0.16, 0.78, 0);
    for (const leg of [leftLeg, rightLeg]) {
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.085, 0.42, 8),
        armorItem ? armorMat : bareClothMat
      );
      thigh.position.y = -0.21;
      leg.add(thigh);
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.36, 0.25),
        armorItem ? armorMat : bareClothMat
      );
      boot.position.set(0, -0.59, 0.03);
      leg.add(boot);
    }
    bodyPivot.add(leftLeg, rightLeg);

    const pelvis = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.19, 0.24),
      armorItem ? armorMat : bareClothMat
    );
    pelvis.position.y = 0.84;
    bodyPivot.add(pelvis);

    const chestWidth = cfg.classId === 'vanguard' ? 0.52 : 0.44;
    if (customArmorMesh) {
      customArmorMesh.group.position.y = -waistY;
      torso.add(customArmorMesh.group);
    } else if (armorItem) {
      // User requested: No automatic procedural drawing of gear.
      // If armorItem exists but NO customArmorMesh, we draw nothing for the chest.
    } else {
      // Unarmored new character: simple bare survivor vest
      const bareTorso = new THREE.Mesh(
        new THREE.BoxGeometry(chestWidth * 0.92, 0.48, 0.26),
        bareClothMat
      );
      bareTorso.position.y = 1.17 - waistY;
      torso.add(bareTorso);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), skinMat);
    head.position.y = 1.64 - waistY;
    torso.add(head);

    if (customHelmMesh) {
      customHelmMesh.group.position.y = 1.64 - waistY;
      torso.add(customHelmMesh.group);
    } else if (helmItem) {
      // User requested: No automatic procedural drawing of gear.
      // If helmItem exists but NO customHelmMesh, we draw nothing for the head gear.
    } else {
      // No helm equipped: bare survivor hair only!
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.195, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
        hairMat
      );
      hair.position.y = 1.67 - waistY;
      torso.add(hair);
    }

    leftArm.position.set(-(chestWidth * 0.6), 1.36 - waistY, 0);
    rightArm.position.set(chestWidth * 0.6, 1.36 - waistY, 0);
    for (const arm of [leftArm, rightArm]) {
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.07, 0.46, 8),
        armorItem ? armorMat : skinMat
      );
      upper.position.y = -0.22;
      arm.add(upper);
    }
    torso.add(leftArm, rightArm);

    if (hasCustomWeaponMesh) {
      mainWeapon.position.set(0, -0.44, 0.08);
      mainWeapon.rotation.x = cfg.classId === 'esper' ? Math.PI / 6 : Math.PI / 2.3;
      rightArm.add(mainWeapon);

      if (cfg.classId === 'evolver') {
        const offWpn = buildWeaponMesh(cfg.equippedWeapon, cfg.classId);
        offWpn.position.set(0, -0.44, 0.08);
        offWpn.rotation.x = Math.PI / 2.2;
        leftArm.add(offWpn);
      }
    }
  }

  const wingsGroup = buildWingsMesh(cfg.equippedWings);
  if (wingsGroup) {
    wingsGroup.position.set(0, customChar ? 1.26 : 1.26 - waistY, -0.2);
    torso.add(wingsGroup);
  }

  const auraRing = buildEnhanceAura(cfg.enhanceLevel, cfg.accentColor);
  if (auraRing) {
    root.add(auraRing);
  }

  root.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });

  return {
    root,
    bodyPivot,
    torso,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponGroup: mainWeapon,
    wingsGroup,
    auraRing,
    mountGroup,
    mixer,
    clips,
    isCustomModel: Boolean(customChar),
    currentClipKey: 'idle',
    currentClipAction,
    walkPhase: 0,
    actionTimer: 0,
    actionDuration: 0.32,
    lastActionSeq: 0,
  };
}

function selectClipForAction(
  clips: THREE.AnimationClip[],
  action: string,
  skillIndex?: number
): THREE.AnimationClip | null {
  if (!clips || clips.length === 0) return null;

  // 1. Prioritize explicitly uploaded per-action clips from Xưởng 3D (__custom_*)
  if (action === 'skill' && typeof skillIndex === 'number') {
    const exactSkillSlot = clips.find((c) => c.name === `__custom_skill${skillIndex + 1}`);
    if (exactSkillSlot) return exactSkillSlot;
  }

  const exactCustom = clips.find((c) => c.name === `__custom_${action}`);
  if (exactCustom) return exactCustom;

  if (action.startsWith('attack')) {
    const customAtk = clips.find((c) => c.name === '__custom_attack');
    if (customAtk) return customAtk;
  }
  if (action === 'chase' || action === 'patrol' || action === 'dash') {
    const customRun = clips.find((c) => c.name === '__custom_run');
    if (customRun) return customRun;
  }
  if (action === 'skill') {
    const customSkill =
      clips.find((c) => c.name === '__custom_skill') ||
      clips.find((c) => c.name === '__custom_attack');
    if (customSkill) return customSkill;
  }
  if (action === 'mount') {
    const customMount =
      clips.find((c) => c.name === '__custom_mount') ||
      clips.find((c) => c.name === '__custom_idle');
    if (customMount) return customMount;
  }

  // 2. Match embedded GLB/FBX clip names
  let pattern = /idle|stand|breath|wait/i;
  if (action === 'run' || action === 'patrol' || action === 'chase') {
    pattern = /run|walk|move|jog|sprint|fly/i;
  } else if (action === 'mount') {
    pattern = /mount|sit|ride|drive|idle|stand/i;
  } else if (action === 'dash') {
    pattern = /dash|roll|dodge|evade|sprint|run/i;
  } else if (action.startsWith('attack')) {
    pattern = /attack|slash|swing|punch|bite|claw|strike|combo/i;
  } else if (action === 'skill' || action.startsWith('skill')) {
    pattern = /skill|cast|spell|magic|ult|special|attack|slash/i;
  } else if (action === 'hit') {
    pattern = /hit|hurt|damage|impact/i;
  } else if (action === 'dead') {
    pattern = /dead|die|death|fall/i;
  }
  return clips.find((c) => pattern.test(c.name)) || clips[0];
}

// ============================================================================
// UNIFIED SERVER-SYNCHRONIZED ACTOR RIG ANIMATOR (LOCAL + PEERS + NPCS + CUSTOM GLB/FBX)
// ============================================================================
export function updateActorRigAnimation(params: {
  rig: ArticulatedActorRig;
  action: ActorActionType;
  actionSeq: number;
  skillIndex?: number;
  moveBlend: number;
  mounted: boolean;
  classId: ClassId;
  dt: number;
  elapsed: number;
}) {
  const { rig, action, actionSeq, skillIndex, moveBlend, mounted, classId, dt, elapsed } = params;

  let normalizedAction: ActorActionType = action;
  let normalizedSkillIndex: number | undefined = skillIndex;
  const skillMatch = String(action).match(/^skill([1-6])$/);
  if (skillMatch) {
    normalizedAction = 'skill';
    if (typeof normalizedSkillIndex !== 'number') {
      normalizedSkillIndex = parseInt(skillMatch[1], 10) - 1;
    }
  }

  const isOneShot =
    normalizedAction === 'attack_1' ||
    normalizedAction === 'attack_2' ||
    normalizedAction === 'attack_3' ||
    normalizedAction === 'skill' ||
    normalizedAction === 'dash' ||
    normalizedAction === 'hit';

  if (actionSeq !== rig.lastActionSeq) {
    rig.lastActionSeq = actionSeq;
    if (isOneShot) {
      rig.activeOneShotAction = normalizedAction;
      rig.activeOneShotSkillIndex = normalizedSkillIndex;
      const matchedClip =
        rig.clips.length > 0 ? selectClipForAction(rig.clips, normalizedAction, normalizedSkillIndex) : null;
      const defaultDur =
        normalizedAction === 'skill'
          ? typeof normalizedSkillIndex === 'number' && normalizedSkillIndex >= 3
            ? 1.20
            : 1.05
          : normalizedAction === 'attack_3'
          ? 0.55
          : normalizedAction === 'dash'
          ? 0.32
          : 0.38;
      rig.actionDuration =
        matchedClip && matchedClip.duration > 0.15
          ? Math.min(1.8, Math.max(defaultDur, matchedClip.duration * 0.95))
          : defaultDur;
      rig.actionTimer = rig.actionDuration;
    }
  }

  if (rig.actionTimer > 0) {
    rig.actionTimer = Math.max(0, rig.actionTimer - dt);
    if (rig.actionTimer <= 0) {
      rig.activeOneShotAction = undefined;
      rig.activeOneShotSkillIndex = undefined;
    }
  }

  const baseLocoAction: ActorActionType =
    moveBlend > 0.15 ? 'run' : mounted ? 'mount' : 'idle';
  const activeLogicalAction: ActorActionType =
    rig.actionTimer > 0 && rig.activeOneShotAction
      ? rig.activeOneShotAction
      : normalizedAction === 'dead'
      ? 'dead'
      : baseLocoAction;
  const currentSkillIdx =
    rig.actionTimer > 0 ? rig.activeOneShotSkillIndex ?? normalizedSkillIndex : normalizedSkillIndex;

  // 1. Skeletal GLTF/FBX AnimationMixer Crossfade with Clip Duration Sync
  if (rig.mixer && rig.clips.length > 0) {
    const desiredKey =
      rig.actionTimer > 0
        ? `${activeLogicalAction}_${currentSkillIdx ?? 0}_${actionSeq}`
        : activeLogicalAction;
    if (desiredKey !== rig.currentClipKey) {
      rig.currentClipKey = desiredKey;
      const clip = selectClipForAction(rig.clips, activeLogicalAction, currentSkillIdx);
      if (clip) {
        const nextAct = rig.mixer.clipAction(clip);
        const shouldPlayOnce =
          (rig.actionTimer > 0 && isOneShot) || activeLogicalAction === 'dead';
        if (nextAct !== rig.currentClipAction) {
          if (rig.currentClipAction) {
            rig.currentClipAction.fadeOut(0.14);
          }
          nextAct.reset();
          if (shouldPlayOnce) {
            nextAct.setLoop(THREE.LoopOnce, 1);
            nextAct.clampWhenFinished = true;
            // Match animation clip playback rate to rig action duration for seamless sync!
            if (clip.duration > 0.15 && rig.actionDuration > 0.1) {
              const speed = clip.duration / rig.actionDuration;
              nextAct.setEffectiveTimeScale(Math.min(1.4, Math.max(0.7, speed)));
            } else {
              nextAct.setEffectiveTimeScale(1.0);
            }
          } else {
            nextAct.setLoop(THREE.LoopRepeat, Infinity);
            nextAct.clampWhenFinished = false;
            nextAct.setEffectiveTimeScale(1.0);
          }
          nextAct.fadeIn(0.14).play();
          rig.currentClipAction = nextAct;
        } else if (shouldPlayOnce) {
          nextAct.reset();
          nextAct.setLoop(THREE.LoopOnce, 1);
          nextAct.clampWhenFinished = true;
          if (clip.duration > 0.15 && rig.actionDuration > 0.1) {
            const speed = clip.duration / rig.actionDuration;
            nextAct.setEffectiveTimeScale(Math.min(1.4, Math.max(0.7, speed)));
          }
          nextAct.play();
        }
      }
    }
    rig.mixer.update(dt);
  }

  // 2. Articulated Procedural & Static-Custom-Model Choreography ("Múa Võ / Tung Chiêu Đồng Bộ")
  const mountOffset = mounted ? 0.62 : 0;
  rig.walkPhase += dt * (11.5 * Math.max(0.25, moveBlend));
  const stride = Math.sin(rig.walkPhase) * 0.64 * moveBlend;
  const idleBob = Math.sin(elapsed * 2.6) * 0.024 * (1 - moveBlend);
  const runBob = Math.abs(Math.sin(rig.walkPhase)) * 0.075 * moveBlend;

  rig.bodyPivot.position.y =
    rig.mixer && rig.clips.length > 0 ? mountOffset : mountOffset + idleBob + runBob;

  if (!rig.isCustomModel) {
    if (mounted) {
      rig.leftLeg.rotation.x = THREE.MathUtils.damp(rig.leftLeg.rotation.x, -0.45, 10, dt);
      rig.rightLeg.rotation.x = THREE.MathUtils.damp(rig.rightLeg.rotation.x, -0.45, 10, dt);
      if (rig.mountGroup) {
        rig.mountGroup.position.y = Math.abs(Math.sin(rig.walkPhase)) * 0.055 * moveBlend;
        rig.mountGroup.rotation.x = Math.sin(rig.walkPhase) * 0.045 * moveBlend;
      }
    } else {
      const legL = activeLogicalAction === 'dash' && rig.actionTimer > 0 ? 0.55 : stride;
      const legR = activeLogicalAction === 'dash' && rig.actionTimer > 0 ? -0.45 : -stride;
      rig.leftLeg.rotation.x = THREE.MathUtils.damp(rig.leftLeg.rotation.x, legL, 16, dt);
      rig.rightLeg.rotation.x = THREE.MathUtils.damp(rig.rightLeg.rotation.x, legR, 16, dt);
    }
  } else if (rig.clips.length === 0) {
    const customLean =
      rig.actionTimer > 0
        ? Math.sin((1 - rig.actionTimer / Math.max(0.1, rig.actionDuration)) * Math.PI) * 0.28
        : 0.14 * moveBlend;
    const customSway = Math.sin(rig.walkPhase) * 0.08 * moveBlend;
    rig.torso.rotation.x = THREE.MathUtils.damp(rig.torso.rotation.x, customLean, 14, dt);
    rig.torso.rotation.z = THREE.MathUtils.damp(rig.torso.rotation.z, customSway, 14, dt);
  }

  if (!rig.mixer || rig.clips.length === 0) {
    if (activeLogicalAction === 'dash' && rig.actionTimer > 0) {
      if (!rig.isCustomModel) {
        rig.torso.rotation.x = THREE.MathUtils.damp(rig.torso.rotation.x, 0.44, 20, dt);
        rig.torso.rotation.y = THREE.MathUtils.damp(rig.torso.rotation.y, 0, 16, dt);
      }
      rig.leftArm.rotation.x = THREE.MathUtils.damp(rig.leftArm.rotation.x, 0.72, 18, dt);
      rig.rightArm.rotation.x = THREE.MathUtils.damp(rig.rightArm.rotation.x, 0.65, 18, dt);
    } else if (rig.actionTimer > 0) {
      // Harmonic 3-phase normalized progress p in [0, 1]
      const p = 1 - rig.actionTimer / Math.max(0.08, rig.actionDuration);
      const swingArc = Math.sin(p * Math.PI);

      if (activeLogicalAction === 'attack_1') {
        // Stage 1 Slash: Clean diagonal strike from top right to bottom left
        if (!rig.isCustomModel) {
          rig.torso.rotation.x = 0.18 * swingArc;
          rig.torso.rotation.y = THREE.MathUtils.lerp(-0.42, 0.46, p);
        }
        rig.rightArm.rotation.x = -1.95 + p * 2.45;
        rig.rightArm.rotation.z = 0.32 * (1 - p);
        rig.leftArm.rotation.x = 0.28 * swingArc;
      } else if (activeLogicalAction === 'attack_2') {
        // Stage 2 Slash: Backhand upward sweeping slash
        if (!rig.isCustomModel) {
          rig.torso.rotation.x = 0.22 * swingArc;
          rig.torso.rotation.y = THREE.MathUtils.lerp(0.52, -0.52, p);
        }
        rig.rightArm.rotation.x = -0.32 - swingArc * 1.35;
        rig.rightArm.rotation.z = -0.35 * swingArc;
        rig.leftArm.rotation.x = classId === 'evolver' ? -1.8 + p * 2.3 : -0.38 * swingArc;
      } else if (activeLogicalAction === 'attack_3') {
        // Stage 3 Finisher: Powerful leaping overhead execution slam
        if (!rig.isCustomModel) {
          rig.torso.rotation.x = THREE.MathUtils.lerp(-0.25, 0.38, p);
          rig.torso.rotation.y = Math.sin(p * Math.PI * 2) * 0.25;
        }
        rig.rightArm.rotation.x = -2.45 + Math.pow(p, 0.82) * 3.0;
        rig.rightArm.rotation.z = 0.12;
        rig.leftArm.rotation.x = -1.5 + Math.pow(p, 0.82) * 1.9;
      } else {
        // Class-Specific Artistic Skill Choreography ("Múa Võ / Vung Chiêu Theo Phái")
        const sIdx = currentSkillIdx ?? 0;

        if (classId === 'esper') {
          // ESPER (Pháp Sư / Niệm Lực):
          // Phase 1 (p < 0.38): Levitate & channel arcane runes high overhead
          // Phase 2 (0.38 <= p < 0.72): Decisive thrust forward releasing mystical beam/meteor
          // Phase 3 (p >= 0.72): Floating descent return to combat stance
          const floatHop = Math.sin(p * Math.PI) * 0.24;
          rig.bodyPivot.position.y += floatHop;

          if (!rig.isCustomModel) {
            rig.torso.rotation.x = THREE.MathUtils.lerp(-0.18, 0.22, Math.sin(p * Math.PI));
            rig.torso.rotation.y = Math.sin(p * Math.PI * 2) * 0.14;
          }
          if (p < 0.38) {
            const gatherP = p / 0.38;
            rig.rightArm.rotation.x = THREE.MathUtils.lerp(-0.8, -2.6, gatherP);
            rig.leftArm.rotation.x = THREE.MathUtils.lerp(-0.6, -2.4, gatherP);
            rig.rightArm.rotation.z = 0.42 * gatherP;
            rig.leftArm.rotation.z = -0.42 * gatherP;
          } else {
            const castP = (p - 0.38) / 0.62;
            rig.rightArm.rotation.x = THREE.MathUtils.lerp(-2.6, -0.65, castP);
            rig.leftArm.rotation.x = THREE.MathUtils.lerp(-2.4, -0.55, castP);
            rig.rightArm.rotation.z = THREE.MathUtils.lerp(0.42, 0.08, castP);
            rig.leftArm.rotation.z = THREE.MathUtils.lerp(-0.42, -0.08, castP);
          }
        } else if (classId === 'vanguard') {
          // VANGUARD (Chiến Binh / Trảm Kích):
          if (sIdx === 1) {
            // Whirlwind (Cơn Lốc Kiếm): Full 360-degree martial spin!
            if (!rig.isCustomModel) {
              rig.torso.rotation.y = p * Math.PI * 4;
              rig.torso.rotation.x = 0.16;
            }
            rig.rightArm.rotation.x = -1.55;
            rig.rightArm.rotation.z = 0.95;
            rig.leftArm.rotation.x = -1.55;
            rig.leftArm.rotation.z = -0.95;
          } else if (sIdx === 3 || sIdx === 4) {
            // Seismic Leap / Molten Eruption: Grand leap then sword slam into earth!
            const leapY = Math.sin(Math.min(1, p * 1.5) * Math.PI) * 0.35;
            rig.bodyPivot.position.y += leapY;
            if (!rig.isCustomModel) {
              rig.torso.rotation.x = p < 0.5 ? -0.28 : 0.45 * (1 - (p - 0.5) * 2);
            }
            rig.rightArm.rotation.x = p < 0.45 ? -2.7 : -0.4;
            rig.leftArm.rotation.x = p < 0.45 ? -2.5 : -0.35;
          } else {
            // Heavy Cleave / Judgement Blade: Great 2-handed overhead cleave
            if (!rig.isCustomModel) {
              rig.torso.rotation.x = 0.32 * swingArc;
              rig.torso.rotation.y = THREE.MathUtils.lerp(-0.55, 0.48, p);
            }
            rig.rightArm.rotation.x = -2.55 + p * 2.85;
            rig.leftArm.rotation.x = -2.2 + p * 2.45;
          }
        } else {
          // EVOLVER (Dị Nhân / Song Đao):
          // Acrobatic dual-blade dance with alternating cross-slashes!
          if (sIdx === 3 || sIdx === 4) {
            // Acid Vortex / Razor Tempest: Rapid spinning dual-blade cyclone
            if (!rig.isCustomModel) {
              rig.torso.rotation.y = p * Math.PI * 4;
              rig.torso.rotation.x = 0.18;
            }
            rig.rightArm.rotation.x = -1.45 + Math.sin(p * Math.PI * 6) * 0.4;
            rig.leftArm.rotation.x = -1.45 - Math.sin(p * Math.PI * 6) * 0.4;
          } else {
            // Twin Fang / Apex Predator: Dual cross-slash X-strike
            if (!rig.isCustomModel) {
              rig.torso.rotation.x = 0.26 * swingArc;
              rig.torso.rotation.y = Math.sin(p * Math.PI) * 0.42;
            }
            rig.rightArm.rotation.x = -2.1 + p * 2.4;
            rig.leftArm.rotation.x = -0.3 - swingArc * 1.6;
          }
        }
      }
    } else {
      if (!rig.isCustomModel) {
        const forwardLean =
          0.16 * moveBlend + Math.sin(elapsed * 2.6) * 0.025 * (1 - moveBlend);
        const waistTwist = -Math.sin(rig.walkPhase) * 0.17 * moveBlend;
        rig.torso.rotation.x = THREE.MathUtils.damp(rig.torso.rotation.x, forwardLean, 12, dt);
        rig.torso.rotation.y = THREE.MathUtils.damp(rig.torso.rotation.y, waistTwist, 12, dt);
      }
      rig.leftArm.rotation.x = THREE.MathUtils.damp(
        rig.leftArm.rotation.x,
        -stride * 0.72,
        14,
        dt
      );
      rig.rightArm.rotation.x = THREE.MathUtils.damp(
        rig.rightArm.rotation.x,
        stride * 0.72,
        14,
        dt
      );
      rig.rightArm.rotation.z = THREE.MathUtils.damp(rig.rightArm.rotation.z, 0.08, 10, dt);
    }
  }

  if (rig.wingsGroup) {
    const flapSpeed = rig.actionTimer > 0 ? 10.5 : moveBlend > 0.2 ? 6.2 : 3.6;
    rig.wingsGroup.rotation.y = Math.sin(elapsed * flapSpeed) * (moveBlend > 0.2 ? 0.22 : 0.13);
  }
  if (rig.auraRing) {
    rig.auraRing.rotation.y = elapsed * 1.8;
  }
}

export function buildMonsterRig(params: {
  style: 'mutant' | 'mecha' | 'hound' | 'wraith' | 'golem';
  assetSlot: string;
  accentColor: string;
  isBoss: boolean;
}): MonsterActorRig {
  const scale = params.isBoss ? 2.15 : 1.0;
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const custom = assetRegistry.instantiateSlot(params.assetSlot);
  if (custom) {
    custom.group.scale.multiplyScalar(scale);
    bodyGroup.add(custom.group);
    let mixer: THREE.AnimationMixer | null = null;
    let currentClipAction: THREE.AnimationAction | null = null;
    const clips = custom.animations || [];
    if (clips.length > 0) {
      mixer = new THREE.AnimationMixer(custom.group);
      const idle = selectClipForAction(clips, 'idle') || clips[0];
      currentClipAction = mixer.clipAction(idle);
      currentClipAction.play();
    }
    return {
      root,
      bodyGroup,
      mixer,
      clips,
      isCustomModel: true,
      currentClipKey: 'idle',
      currentClipAction,
      actionTimer: 0,
      lastActionSeq: 0,
    };
  }

  // User requested: No automatic procedural drawing.
  // Return an empty rig if no custom asset is provided.
  return {
    root,
    bodyGroup,
    mixer: null,
    clips: [],
    isCustomModel: false,
    currentClipKey: 'idle',
    currentClipAction: null,
    actionTimer: 0,
    lastActionSeq: 0,
  };
}

export function updateMonsterRigAnimation(params: {
  rig: MonsterActorRig;
  action: 'idle' | 'patrol' | 'chase' | 'attack' | 'hit' | 'dead';
  actionSeq: number;
  dt: number;
  elapsed: number;
  seedOffset: number;
}) {
  const { rig, action, actionSeq, dt, elapsed, seedOffset } = params;

  const isOneShot = action === 'attack' || action === 'hit';

  if (actionSeq !== rig.lastActionSeq) {
    rig.lastActionSeq = actionSeq;
    if (isOneShot) {
      const clip = rig.clips.length > 0 ? selectClipForAction(rig.clips, action) : null;
      rig.actionTimer =
        clip && clip.duration > 0.15 ? Math.min(1.6, Math.max(0.55, clip.duration * 0.95)) : 0.55;
    }
  }
  if (rig.actionTimer > 0) {
    rig.actionTimer = Math.max(0, rig.actionTimer - dt);
  }

  const activeAction = action === 'dead' ? 'dead' : rig.actionTimer > 0 ? action : action === 'attack' || action === 'hit' ? 'idle' : action;

  if (rig.mixer && rig.clips.length > 0) {
    const key = rig.actionTimer > 0 ? `${activeAction}_${actionSeq}` : activeAction;
    if (key !== rig.currentClipKey) {
      rig.currentClipKey = key;
      const clip = selectClipForAction(rig.clips, activeAction);
      if (clip) {
        const nextAct = rig.mixer.clipAction(clip);
        const once = activeAction === 'dead' || (rig.actionTimer > 0 && isOneShot);
        if (nextAct !== rig.currentClipAction) {
          rig.currentClipAction?.fadeOut(0.12);
          nextAct.reset();
          if (once) {
            nextAct.setLoop(THREE.LoopOnce, 1);
            nextAct.clampWhenFinished = true;
          } else {
            nextAct.setLoop(THREE.LoopRepeat, Infinity);
            nextAct.clampWhenFinished = false;
          }
          nextAct.fadeIn(0.12).play();
          rig.currentClipAction = nextAct;
        } else if (once) {
          nextAct.reset();
          nextAct.setLoop(THREE.LoopOnce, 1);
          nextAct.clampWhenFinished = true;
          nextAct.play();
        }
      }
    }
    rig.mixer.update(dt);
  }

  if (activeAction === 'dead') {
    if (!rig.mixer || rig.clips.length === 0) {
      rig.bodyGroup.rotation.x = THREE.MathUtils.damp(rig.bodyGroup.rotation.x, Math.PI * 0.46, 8, dt);
      rig.bodyGroup.position.y = THREE.MathUtils.damp(rig.bodyGroup.position.y, -0.15, 8, dt);
    }
    return;
  }

  const moving = activeAction === 'chase' || activeAction === 'patrol';
  const hop =
    rig.mixer && rig.clips.length > 0
      ? 0
      : moving
      ? Math.abs(Math.sin(elapsed * 7.5 + seedOffset)) * 0.14
      : Math.sin(elapsed * 3.0 + seedOffset) * 0.04;

  let pitchX = 0;
  if (!rig.mixer || rig.clips.length === 0) {
    if (rig.actionTimer > 0) {
      const wave = Math.sin((rig.actionTimer / 0.55) * Math.PI);
      pitchX = activeAction === 'hit' ? -wave * 0.28 : activeAction === 'attack' ? wave * 0.34 : 0;
    } else if (moving) {
      pitchX = 0.12;
    }
  }

  rig.bodyGroup.position.y = hop;
  rig.bodyGroup.rotation.x = THREE.MathUtils.damp(rig.bodyGroup.rotation.x, pitchX, 14, dt);
}

export function buildLootDropMesh(rarityHex: string): THREE.Group {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    metalness: 0.85,
    roughness: 0.25,
  });
  const gemMat = new THREE.MeshStandardMaterial({
    color: rarityHex || RARITY_META.rare.hex,
    emissive: rarityHex || RARITY_META.rare.hex,
    emissiveIntensity: 1.8,
    metalness: 0.2,
    roughness: 0.15,
  });
  const beamMat = new THREE.MeshBasicMaterial({
    color: rarityHex || '#38bdf8',
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const crate = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.14, 6), baseMat);
  crate.position.y = 0.07;
  group.add(crate);

  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), gemMat);
  crystal.position.y = 0.42;
  group.add(crystal);

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.22, 2.2, 8, 1, true), beamMat);
  beam.position.y = 1.1;
  group.add(beam);

  return group;
}

// ============================================================================
// GRAND 3D MAP THEMED PROPS BUILDER (31 UNIQUE HUNTING MAP BIOMES)
// ============================================================================
export function buildMapThemedProps(mapId: number, accentHex: string): THREE.Group {
  const group = new THREE.Group();
  const seed = mapId * 17.23;
  const count = 12 + (mapId % 5);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  // Paint 2.5D post-apocalyptic ruined skyscraper / rubble silhouette
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(40, 50, 176, 200);

  // Glowing ember windows / radioactive energy
  ctx.fillStyle = accentHex || '#f97316';
  for (let wy = 70; wy < 230; wy += 28) {
    for (let wx = 52; wx < 190; wx += 32) {
      if ((wx + wy + mapId) % 3 !== 0) {
        ctx.fillRect(wx, wy, 16, 18);
      }
    }
  }

  // Jagged ruined top skyline
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(40, 50);
  ctx.lineTo(75, 18);
  ctx.lineTo(110, 42);
  ctx.lineTo(145, 10);
  ctx.lineTo(180, 36);
  ctx.lineTo(216, 50);
  ctx.closePath();
  ctx.fill();

  // Glowing border
  ctx.strokeStyle = accentHex || '#fbbf24';
  ctx.lineWidth = 6;
  ctx.strokeRect(38, 48, 180, 202);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;

  const propMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.sin(seed + i * 1.5) * 1.1;
    const dist = 16 + ((i * 13 + mapId * 7) % 24);
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;

    const propGroup = new THREE.Group();
    propGroup.position.set(x, 0, z);
    propGroup.userData = { cullableProp: true, boundRadius: 6.0 };

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), propMat);
    plane.position.y = 3.25;
    propGroup.add(plane);
    group.add(propGroup);
  }

  return group;
}


// ============================================================================
// GRAND 3D IMPERIAL CITADEL BUILDER (HOÀNG THÀNH THÁNH TÍCH - MAP 1)
// ============================================================================
export function buildImperialCitadel3D(
  npcs: NpcDef[],
  isSoftwareGl: boolean
): {
  group: THREE.Group;
  animatedCrystals: THREE.Object3D[];
} {
  const group = new THREE.Group();
  const animatedCrystals: THREE.Object3D[] = [];

  const marbleMat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    metalness: 0.25,
    roughness: 0.42,
  });
  const darkObsidianMat = new THREE.MeshStandardMaterial({
    color: '#111827',
    metalness: 0.78,
    roughness: 0.26,
  });
  const royalGoldMat = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    emissive: '#b45309',
    emissiveIntensity: 0.45,
    metalness: 0.92,
    roughness: 0.18,
  });
  const crystalGlowMat = new THREE.MeshStandardMaterial({
    color: '#38bdf8',
    emissive: '#0284c7',
    emissiveIntensity: 1.65,
    metalness: 0.2,
    roughness: 0.15,
    transparent: true,
    opacity: 0.92,
  });
  const royalCarpetMat = new THREE.MeshStandardMaterial({
    color: '#7f1d1d',
    metalness: 0.15,
    roughness: 0.78,
  });

  // 1. Grand Circular Royal Plaza & Star Inlay at (0, 0)
  const outerPlaza = new THREE.Mesh(
    new THREE.CylinderGeometry(24, 24.8, 0.14, 48),
    darkObsidianMat
  );
  outerPlaza.position.set(0, 0.07, 0);
  outerPlaza.receiveShadow = true;
  group.add(outerPlaza);

  const innerMarblePlaza = new THREE.Mesh(
    new THREE.CylinderGeometry(18.5, 19.0, 0.18, 48),
    marbleMat
  );
  innerMarblePlaza.position.set(0, 0.09, 0);
  innerMarblePlaza.receiveShadow = true;
  group.add(innerMarblePlaza);

  const goldPlazaRing = new THREE.Mesh(
    new THREE.RingGeometry(18.1, 18.6, 64),
    new THREE.MeshBasicMaterial({
      color: '#fbbf24',
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  goldPlazaRing.rotation.x = -Math.PI / 2;
  goldPlazaRing.position.y = 0.19;
  group.add(goldPlazaRing);

  // North-South & East-West Royal Red-Gold Boulevards
  const nsCarpet = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.08, 76), royalCarpetMat);
  nsCarpet.position.set(0, 0.15, 0);
  nsCarpet.receiveShadow = true;
  group.add(nsCarpet);

  const ewCarpet = new THREE.Mesh(new THREE.BoxGeometry(44, 0.07, 4.4), royalCarpetMat);
  ewCarpet.position.set(0, 0.145, 0);
  ewCarpet.receiveShadow = true;
  group.add(ewCarpet);

  // 2. Central Resurrection Crystal Fountain at (0, 0) — Replaceable via 'map_building_fountain' or 'prop_citadel_fountain'!
  const customFountain =
    assetRegistry.instantiateSlot('map_building_fountain') ||
    assetRegistry.instantiateSlot('prop_citadel_fountain');
  if (customFountain) {
    customFountain.group.scale.multiplyScalar(2.2);
    customFountain.group.position.set(0, 0.18, 0);
    customFountain.group.userData = { cullableProp: true, boundRadius: 8.5 };
    group.add(customFountain.group);
  } else {
    const fountainGroup = new THREE.Group();
    fountainGroup.position.set(0, 0.18, 0);
    fountainGroup.userData = { cullableProp: true, boundRadius: 8.5 };

    const basinWall = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 4.6, 0.65, 32),
      darkObsidianMat
    );
    basinWall.position.y = 0.32;
    fountainGroup.add(basinWall);

    const waterPool = new THREE.Mesh(
      new THREE.CylinderGeometry(3.85, 3.85, 0.52, 32),
      new THREE.MeshStandardMaterial({
        color: '#0ea5e9',
        emissive: '#0369a1',
        emissiveIntensity: 0.9,
        roughness: 0.12,
        metalness: 0.3,
      })
    );
    waterPool.position.y = 0.36;
    fountainGroup.add(waterPool);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.55, 1.8, 12),
      marbleMat
    );
    pedestal.position.y = 1.0;
    fountainGroup.add(pedestal);

    const goldCrownRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.65, 0.08, 10, 32),
      royalGoldMat
    );
    goldCrownRing.rotation.x = Math.PI / 2;
    goldCrownRing.position.y = 2.45;
    fountainGroup.add(goldCrownRing);
    animatedCrystals.push(goldCrownRing);

    const centralCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.15, 0),
      crystalGlowMat
    );
    centralCrystal.scale.set(0.85, 1.85, 0.85);
    centralCrystal.position.y = 3.55;
    fountainGroup.add(centralCrystal);
    animatedCrystals.push(centralCrystal);

    group.add(fountainGroup);
  }

  // 3. Northern Grand Imperial Palace Citadel Keep (behind Commander Vance)
  const customPalace = assetRegistry.instantiateSlot('map_building_palace');
  if (customPalace) {
    customPalace.group.scale.multiplyScalar(5.5);
    customPalace.group.position.set(0, 0, -25.5);
    customPalace.group.userData = { cullableProp: true, boundRadius: 15.0 };
    group.add(customPalace.group);
  } else {
    const palaceGroup = new THREE.Group();
    palaceGroup.position.set(0, 0, -25.5);
    palaceGroup.userData = { cullableProp: true, boundRadius: 15.0 };

    const palaceDais = new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 11), marbleMat);
    palaceDais.position.y = 0.6;
    palaceDais.receiveShadow = true;
    palaceGroup.add(palaceDais);

    const palaceSteps = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 3.5), royalGoldMat);
    palaceSteps.position.set(0, 0.3, 6.2);
    palaceGroup.add(palaceSteps);

    const mainHall = new THREE.Mesh(new THREE.BoxGeometry(18, 7.5, 7.5), darkObsidianMat);
    mainHall.position.set(0, 4.8, -1.2);
    mainHall.castShadow = !isSoftwareGl;
    palaceGroup.add(mainHall);

    const spireRoof = new THREE.Mesh(new THREE.ConeGeometry(11.5, 4.6, 4), royalGoldMat);
    spireRoof.rotation.y = Math.PI / 4;
    spireRoof.position.set(0, 10.8, -1.2);
    palaceGroup.add(spireRoof);

    for (let i = -2; i <= 2; i++) {
      if (i === 0) continue;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 6.8, 12), marbleMat);
      col.position.set(i * 3.8, 4.5, 3.2);
      col.castShadow = !isSoftwareGl;
      palaceGroup.add(col);
    }
    group.add(palaceGroup);
  }

  // 4. Bespoke 3D Architectural Stations for Each of the 8 Citadel NPCs
  for (const npc of npcs) {
    const st = new THREE.Group();
    st.position.set(npc.x, 0.14, npc.z);
    st.rotation.y = npc.rotY;
    st.userData = { cullableProp: true, boundRadius: 5.8 };

    const accentMat = new THREE.MeshStandardMaterial({
      color: npc.accentColor,
      emissive: npc.accentColor,
      emissiveIntensity: 1.45,
      metalness: 0.35,
      roughness: 0.22,
    });

    // Ornate dais ring under every NPC
    const npcPad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.9, 0.2, 24),
      darkObsidianMat
    );
    npcPad.position.y = 0.1;
    st.add(npcPad);

    const npcHalo = new THREE.Mesh(
      new THREE.TorusGeometry(2.65, 0.05, 8, 32),
      accentMat
    );
    npcHalo.rotation.x = Math.PI / 2;
    npcHalo.position.y = 0.22;
    st.add(npcHalo);

    if (npc.stationStyle === 'forge') {
      // Molten Furnace & Heavy Anvil behind Blacksmith Kael
      const furnace = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 3.4, 8), darkObsidianMat);
      furnace.position.set(0, 1.7, -2.1);
      st.add(furnace);
      const lavaCore = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 12), accentMat);
      lavaCore.position.set(0, 1.35, -1.5);
      st.add(lavaCore);
      const anvil = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 0.65), royalGoldMat);
      anvil.position.set(1.45, 0.45, 0.4);
      st.add(anvil);
    } else if (npc.stationStyle === 'market') {
      // Royal Trade Pavilion Canopy
      for (const sx of [-1.8, 1.8]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 8), royalGoldMat);
        post.position.set(sx, 1.6, -1.4);
        st.add(post);
      }
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.35, 4), accentMat);
      canopy.rotation.y = Math.PI / 4;
      canopy.position.set(0, 3.6, -1.2);
      st.add(canopy);
    } else if (npc.stationStyle === 'sanctuary') {
      // Angelic Healing Crystal Arch
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(2.1, 0.14, 10, 28, Math.PI),
        marbleMat
      );
      arch.position.set(0, 1.5, -1.5);
      st.add(arch);
      const healGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), accentMat);
      healGem.position.set(0, 2.8, -1.5);
      st.add(healGem);
      animatedCrystals.push(healGem);
    } else if (npc.stationStyle === 'vault') {
      // Armored Royal Gold Safe & Bullion Stacks
      const safeBox = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 1.8), darkObsidianMat);
      safeBox.position.set(0, 1.35, -2.0);
      st.add(safeBox);
      const vaultWheel = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.1, 8, 20), royalGoldMat);
      vaultWheel.position.set(0, 1.4, -1.05);
      st.add(vaultWheel);
    } else if (npc.stationStyle === 'academy') {
      // Combat Skill Obelisks
      for (const sx of [-1.6, 1.6]) {
        const obelisk = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), accentMat);
        obelisk.scale.set(0.8, 2.2, 0.8);
        obelisk.position.set(sx, 2.1, -1.4);
        st.add(obelisk);
        animatedCrystals.push(obelisk);
      }
    } else if (npc.stationStyle === 'workshop') {
      // Holographic 3D Asset Scanner Ring
      const holoRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.08, 8, 28), accentMat);
      holoRing.position.set(0, 2.1, -1.6);
      st.add(holoRing);
      animatedCrystals.push(holoRing);
    }

    group.add(st);
  }

  // 5. North Stargate Warp Archway at (0, -38) -> Leads to 31 Hunting Maps!
  const customPortal = assetRegistry.instantiateSlot('map_portal_arch');
  if (customPortal) {
    customPortal.group.scale.multiplyScalar(2.6);
    customPortal.group.position.set(0, 0, -38);
    customPortal.group.userData = { cullableProp: true, boundRadius: 7.5 };
    group.add(customPortal.group);
  } else {
    const stargate = new THREE.Group();
    stargate.position.set(0, 0, -38);
    stargate.userData = { cullableProp: true, boundRadius: 7.5 };
    const gatePad = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.9, 0.28, 28), darkObsidianMat);
    gatePad.position.y = 0.14;
    stargate.add(gatePad);
    const gateRing = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.26, 12, 36), royalGoldMat);
    gateRing.position.y = 2.85;
    stargate.add(gateRing);
    const gateVortex = new THREE.Mesh(
      new THREE.CircleGeometry(2.38, 32),
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0284c7',
        emissiveIntensity: 2.0,
        transparent: true,
        opacity: 0.76,
        side: THREE.DoubleSide,
      })
    );
    gateVortex.position.y = 2.85;
    stargate.add(gateVortex);
    group.add(stargate);
  }

  // 6. Perimeter Citadel Bastion Walls & Watchtowers (InstancedMesh — 32 Wall Segments)
  const wallCount = 32;
  const wallGeo = new THREE.BoxGeometry(8.6, 7.2, 2.4);
  const wallInst = new THREE.InstancedMesh(wallGeo, darkObsidianMat, wallCount);
  wallInst.castShadow = !isSoftwareGl;
  wallInst.receiveShadow = true;

  const towerGeo = new THREE.CylinderGeometry(1.9, 2.2, 10.5, 10);
  const towerInst = new THREE.InstancedMesh(towerGeo, marbleMat, wallCount);
  towerInst.castShadow = !isSoftwareGl;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < wallCount; i++) {
    const ang = (i / wallCount) * Math.PI * 2;
    const rad = 52;
    const wx = Math.sin(ang) * rad;
    const wz = Math.cos(ang) * rad;

    dummy.position.set(wx, 3.6, wz);
    dummy.rotation.set(0, ang, 0);
    // Leave South Grand Entrance Gate open around angle 0
    if (Math.abs(wx) < 6 && wz > 40) {
      dummy.scale.set(0.001, 0.001, 0.001);
    } else {
      dummy.scale.set(1, 1, 1);
    }
    dummy.updateMatrix();
    wallInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(Math.sin(ang + 0.098) * rad, 5.2, Math.cos(ang + 0.098) * rad);
    dummy.scale.set(i % 2 === 0 ? 1 : 0.001, i % 2 === 0 ? 1 : 0.001, i % 2 === 0 ? 1 : 0.001);
    dummy.updateMatrix();
    towerInst.setMatrixAt(i, dummy.matrix);
  }
  wallInst.instanceMatrix.needsUpdate = true;
  towerInst.instanceMatrix.needsUpdate = true;
  wallInst.computeBoundingSphere();
  towerInst.computeBoundingSphere();
  group.add(wallInst, towerInst);

  // 7. 24 Royal Golden Avenue Lantern Pillars (InstancedMesh)
  const lampPostGeo = new THREE.CylinderGeometry(0.14, 0.2, 3.8, 8);
  const lampOrbGeo = new THREE.OctahedronGeometry(0.32, 0);
  const lampCount = 24;
  const lampPosts = new THREE.InstancedMesh(lampPostGeo, royalGoldMat, lampCount);
  const lampOrbs = new THREE.InstancedMesh(
    lampOrbGeo,
    new THREE.MeshStandardMaterial({
      color: '#fde047',
      emissive: '#f59e0b',
      emissiveIntensity: 2.1,
    }),
    lampCount
  );

  let lIdx = 0;
  for (let row = 0; row < 6; row++) {
    const zCoord = -32 + row * 13;
    for (const side of [-4.2, 4.2]) {
      if (lIdx >= lampCount) break;
      dummy.position.set(side, 1.9, zCoord);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lampPosts.setMatrixAt(lIdx, dummy.matrix);

      dummy.position.set(side, 4.05, zCoord);
      dummy.updateMatrix();
      lampOrbs.setMatrixAt(lIdx, dummy.matrix);
      lIdx++;
    }
  }
  for (; lIdx < lampCount; lIdx++) {
    const ang = ((lIdx - 12) / 12) * Math.PI * 2;
    const lx = Math.cos(ang) * 19.2;
    const lz = Math.sin(ang) * 19.2;
    dummy.position.set(lx, 1.9, lz);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lampPosts.setMatrixAt(lIdx, dummy.matrix);

    dummy.position.set(lx, 4.05, lz);
    dummy.updateMatrix();
    lampOrbs.setMatrixAt(lIdx, dummy.matrix);
  }
  lampPosts.instanceMatrix.needsUpdate = true;
  lampOrbs.instanceMatrix.needsUpdate = true;
  lampPosts.computeBoundingSphere();
  lampOrbs.computeBoundingSphere();
  group.add(lampPosts, lampOrbs);

  return { group, animatedCrystals };
}
