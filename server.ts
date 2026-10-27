import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  AccountDoc,
  ActorActionType,
  AssetOverrideDoc,
  AuthoritativeVaultState,
  CharacterDoc,
  ChatMessage,
  ClassId,
  EquipSlot,
  RemotePlayer,
  ServerCombatVfxEvent,
  ServerFloatingEvent,
  ServerLootSnapshot,
  ServerMonsterSnapshot,
  ServerPlayerSession,
  ServerWorldBossState,
  MapRoom,
  ClientSocketMeta,
  ServerMonsterEntity,
  ActiveStatusEffect,
  StatusEffectType,
} from './src/types/game.js';
import {
  ALL_ITEMS_LIST,
  CITADEL_MAP_ID,
  CLASSES_CORE,
  computeDerivedStats,
  expRequiredForLevel,
  FIRST_HUNTING_MAP_ID,
  ITEMS_CATALOG,
  MAPS_DATA,
  QUESTS_DATA,
  RARITY_META,
  generateDailyQuestsForToday,
  updateDailyQuestProgress,
} from './src/shared/universeData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads', 'custom-assets');
const DATA_DIR = path.join(__dirname, 'data');
const CHUNKS_DIR = path.join(DATA_DIR, 'upload-chunks');
const ASSET_MANIFEST_FILE = path.join(DATA_DIR, 'custom-assets-manifest.json');
const VAULT_STORAGE_FILE = path.join(DATA_DIR, 'server-vaults.json');
const ACCOUNT_STORAGE_FILE = path.join(DATA_DIR, 'server-accounts.json');
const CHARACTER_STORAGE_FILE = path.join(DATA_DIR, 'server-characters.json');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(CHUNKS_DIR, { recursive: true });

// Cleanup stale chunks on boot
try {
  const staleDirs = fs.readdirSync(CHUNKS_DIR);
  for (const d of staleDirs) {
    fs.rmSync(path.join(CHUNKS_DIR, d), { recursive: true, force: true });
  }
} catch {}

const EQUIP_SLOT_TO_FIELD: Record<EquipSlot, keyof CharacterDoc> = {
  weapon: 'equippedWeapon',
  helm: 'equippedHelm',
  armor: 'equippedArmor',
  gloves: 'equippedGloves',
  pants: 'equippedPants',
  boots: 'equippedBoots',
  ring: 'equippedRing',
  wings: 'equippedWings',
  mount: 'equippedMount',
};

const RARITY_ORDER: Record<string, number> = {
  mythic: 5,
  legendary: 4,
  excellent: 3,
  rare: 2,
  common: 1,
};

const ALLOWED_ASSET_EXTS = new Set([
  '.glb',
  '.gltf',
  '.fbx',
  '.obj',
  '.dae',
  '.stl',
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
  '.mp4',
  '.webm',
  '.mov',
  '.gif',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.apng',
  '.bmp',
  '.svg',
  '.unity',
  '.prefab',
  '.asset',
  '.mat',
  '.meta',
]);

const ARCHIVE_EXTS = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.unitypackage']);

// ============================================================================
// PERSISTENT SERVER ASSET MANIFEST & ROYAL VAULT STORAGE
// ============================================================================
let customAssetManifest: Record<string, AssetOverrideDoc> = {};
try {
  if (fs.existsSync(ASSET_MANIFEST_FILE)) {
    customAssetManifest = JSON.parse(fs.readFileSync(ASSET_MANIFEST_FILE, 'utf8')) || {};
  }
} catch {
  customAssetManifest = {};
}

function saveAssetManifest() {
  try {
    fs.writeFileSync(ASSET_MANIFEST_FILE, JSON.stringify(customAssetManifest, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist asset manifest:', err);
  }
}

let vaultStore: Record<string, AuthoritativeVaultState> = {};
try {
  if (fs.existsSync(VAULT_STORAGE_FILE)) {
    vaultStore = JSON.parse(fs.readFileSync(VAULT_STORAGE_FILE, 'utf8')) || {};
  }
} catch {
  vaultStore = {};
}

let vaultDirty = false;
function getVaultForOwner(key: string): AuthoritativeVaultState {
  if (!vaultStore[key]) {
    vaultStore[key] = { vaultIds: [], vaultGold: 0 };
  }
  return vaultStore[key];
}

let accountStore: Record<string, AccountDoc> = {};
try {
  if (fs.existsSync(ACCOUNT_STORAGE_FILE)) {
    accountStore = JSON.parse(fs.readFileSync(ACCOUNT_STORAGE_FILE, 'utf8')) || {};
  }
} catch {
  accountStore = {};
}

let characterStore: Record<string, CharacterDoc> = {};
try {
  if (fs.existsSync(CHARACTER_STORAGE_FILE)) {
    characterStore = JSON.parse(fs.readFileSync(CHARACTER_STORAGE_FILE, 'utf8')) || {};
  }
} catch {
  characterStore = {};
}

let charStoreDirty = false;
function flushAccountsToDisk() {
  try {
    fs.writeFileSync(ACCOUNT_STORAGE_FILE, JSON.stringify(accountStore, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist accounts:', err);
  }
}

function flushCharactersToDisk() {
  charStoreDirty = false;
  try {
    fs.writeFileSync(CHARACTER_STORAGE_FILE, JSON.stringify(characterStore, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist characters:', err);
  }
}

setInterval(() => {
  if (vaultDirty) {
    vaultDirty = false;
    try {
      fs.writeFileSync(VAULT_STORAGE_FILE, JSON.stringify(vaultStore, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to persist vaults:', err);
    }
  }
  if (charStoreDirty) {
    flushCharactersToDisk();
  }
}, 4000);

// ============================================================================
// AUTHORITATIVE WORLD SIMULATION STRUCTURES
// ============================================================================
// Redundant interfaces removed (moved to src/types/game.ts)


const sessions = new Map<string, ServerPlayerSession>();
const clients = new Set<ClientSocketMeta>();
const mapRooms = new Map<number, MapRoom>();

const chatHistory: ChatMessage[] = [
  {
    id: 'sys_boot_citadel',
    senderId: 'system',
    senderName: 'Hệ Thống Hoàng Thành',
    senderClass: 'system',
    senderLevel: 500,
    channel: 'system',
    mapId: CITADEL_MAP_ID,
    text: 'Chào mừng tới Hoàng Thành Thánh Tích (Đô Thành An Toàn - 0 Quái)! Mọi chỉ số Máu, Sát Thương, Quái, Kinh Nghiệm, Kho Đồ & Tài Nguyên 3D đều được đồng bộ 100% qua Máy Chủ.',
    timestamp: Date.now(),
  },
];

// ============================================================================
// WORLD BOSS ROTATION & LIVE EVENT SYSTEM
// ============================================================================
// Redundant interface removed (moved to src/types/game.ts)


const WORLD_BOSS_MAPS = [
  { mapId: 10, name: 'Bến Cảng Hoang Phế', code: 'MAP 10', bossName: 'Bạo Chúa Thần Máy Golgoth' },
  { mapId: 18, name: 'Thung Lũng Băng Trôi', code: 'MAP 18', bossName: 'Trùng Chúa Băng Bão Frostfang' },
  { mapId: 25, name: 'Thực Thể Hư Không', code: 'MAP 25', bossName: 'Dị Biến Cổ Vương Malakor' },
  { mapId: 30, name: 'Vùng Đất Tận Thế', code: 'MAP 30', bossName: 'Tà Thần Huỷ Diệt Apollyon' },
  { mapId: 32, name: 'Điểm Kỳ Dị Hư Không', code: 'MAP 32', bossName: 'Chúa Tể Không Gian Omega Zero' },
];

let worldBossMapIndex = 0;
let worldBossNextSpawnTime = Date.now() + 120000; // Spawn in 2 minutes
let currentWorldBossState: ServerWorldBossState = {
  active: false,
  bossName: WORLD_BOSS_MAPS[0].bossName,
  mapId: WORLD_BOSS_MAPS[0].mapId,
  mapName: WORLD_BOSS_MAPS[0].name,
  mapCode: WORLD_BOSS_MAPS[0].code,
  hp: 250000,
  maxHp: 250000,
  nextSpawnTime: worldBossNextSpawnTime,
  spawnCountdownSec: 120,
};

function tickWorldBossState() {
  const now = Date.now();
  const room = mapRooms.get(currentWorldBossState.mapId);

  if (!currentWorldBossState.active) {
    const remainSec = Math.max(0, Math.ceil((currentWorldBossState.nextSpawnTime - now) / 1000));
    currentWorldBossState.spawnCountdownSec = remainSec;

    if (remainSec <= 0) {
      currentWorldBossState.active = true;
      currentWorldBossState.maxHp = 250000 + worldBossMapIndex * 150000;
      currentWorldBossState.hp = currentWorldBossState.maxHp;

      const bossNotice: ChatMessage = {
        id: `sys_wb_${now}`,
        senderId: 'system',
        senderName: 'THÔNG BÁO TOÀN SERVER',
        senderClass: 'system',
        senderLevel: 500,
        channel: 'world',
        mapId: currentWorldBossState.mapId,
        text: `🔥 WORLD BOSS [${currentWorldBossState.bossName}] ĐÃ GIÁO CHIẾN TẠI [${currentWorldBossState.mapCode}] ${currentWorldBossState.mapName}! TẤT CẢ ANH HÙNG HÃY TẬP HỢP DỊCH CHUYỂN BÁO THÙ!`,
        timestamp: now,
      };
      chatHistory.push(bossNotice);
      if (chatHistory.length > 80) chatHistory.shift();
      broadcastAll({ type: 'chat:message', message: bossNotice });
    }
  } else if (room) {
    const bossMob = room.monsters.find((m) => m.isBoss);
    if (bossMob) {
      if (bossMob.dead || bossMob.hp <= 0) {
        currentWorldBossState.active = false;
        worldBossMapIndex = (worldBossMapIndex + 1) % WORLD_BOSS_MAPS.length;
        const nextMap = WORLD_BOSS_MAPS[worldBossMapIndex];
        currentWorldBossState.bossName = nextMap.bossName;
        currentWorldBossState.mapId = nextMap.mapId;
        currentWorldBossState.mapName = nextMap.name;
        currentWorldBossState.mapCode = nextMap.code;
        currentWorldBossState.nextSpawnTime = now + 180000; // 3 min countdown
        currentWorldBossState.spawnCountdownSec = 180;

        const killNotice: ChatMessage = {
          id: `sys_wb_dead_${now}`,
          senderId: 'system',
          senderName: 'THÔNG BÁO TOÀN SERVER',
          senderClass: 'system',
          senderLevel: 500,
          channel: 'world',
          mapId: currentWorldBossState.mapId,
          text: `🏆 WORLD BOSS ĐÃ BỊ DẬP TẮT! Boss tiếp theo [${nextMap.bossName}] sẽ xuất hiện sau 3 phút tại [${nextMap.code}] ${nextMap.name}!`,
          timestamp: now,
        };
        chatHistory.push(killNotice);
        if (chatHistory.length > 80) chatHistory.shift();
        broadcastAll({ type: 'chat:message', message: killNotice });
      } else {
        currentWorldBossState.hp = bossMob.hp;
        currentWorldBossState.maxHp = bossMob.maxHp;
      }
    }
  }

  broadcastAll({
    type: 'world:boss_event',
    bossState: currentWorldBossState,
  });
}

setInterval(tickWorldBossState, 1000);


function shortestAngleDiff(from: number, to: number): number {
  let diff = ((to - from + Math.PI) % (Math.PI * 2));
  if (diff < 0) diff += Math.PI * 2;
  return diff - Math.PI;
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const diff = shortestAngleDiff(current, target);
  return current + diff * (1 - Math.exp(-lambda * dt));
}

function clampCoord(v: number, bound = 46.5): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-bound, Math.min(bound, v));
}

// Initialize all 32 Authoritative Map Rooms
function initializeWorldRooms() {
  for (const mapDef of MAPS_DATA) {
    if (mapDef.id === CITADEL_MAP_ID || mapDef.safeZone) {
      // STRICT GUARANTEE: Map 1 (Hoàng Thành Thánh Tích) has ZERO monsters!
      mapRooms.set(mapDef.id, {
        mapId: mapDef.id,
        safeZone: true,
        monsters: [],
        loots: [],
      });
      continue;
    }

    const monsters: ServerMonsterEntity[] = [];
    const totalMobs = 13; // 12 Field Monsters + 1 Map Boss
    const powerIdx = Math.max(0, mapDef.id - FIRST_HUNTING_MAP_ID);

    for (let i = 0; i < totalMobs; i++) {
      const isBoss = i === totalMobs - 1;
      const angle = isBoss ? Math.PI * 0.92 : (i / (totalMobs - 1)) * Math.PI * 2;
      const dist = isBoss ? 30 : 16 + (i % 3) * 8.5;
      let hx = Math.sin(angle) * dist;
      let hz = isBoss ? -22 : Math.cos(angle) * dist;
      // Keep north/south warp portal corridors clear
      if (Math.abs(hx) < 6 && Math.abs(hz) > 31) {
        hx = hx >= 0 ? 9 : -9;
      }

      const lvl = isBoss ? mapDef.maxLevel : Math.min(mapDef.maxLevel, mapDef.minLevel + (i % 5));
      const maxHp = Math.round(
        (isBoss ? 1500 : 270) * Math.pow(1.135, powerIdx) + lvl * (isBoss ? 92 : 24)
      );
      const atk = Math.round((isBoss ? 38 : 14) * Math.pow(1.095, powerIdx) + lvl * 2.5);

      monsters.push({
        id: `mob_${mapDef.id}_${i}`,
        name: isBoss ? `[BOSS] ${mapDef.bossName}` : mapDef.mobName,
        isBoss,
        level: lvl,
        hp: maxHp,
        maxHp,
        atk,
        homeX: Number(hx.toFixed(2)),
        homeZ: Number(hz.toFixed(2)),
        x: Number(hx.toFixed(2)),
        z: Number(hz.toFixed(2)),
        rotY: Number((Math.random() * Math.PI * 2).toFixed(2)),
        style: mapDef.mobStyle,
        assetSlot: isBoss ? mapDef.bossAssetSlot : mapDef.mobAssetSlot,
        accentColor: isBoss ? '#fb7185' : mapDef.accentColor,
        action: 'idle',
        actionSeq: 1,
        attackTimer: 1.5,
        respawnTimer: 0,
        recoilTimer: 0,
        knockVx: 0,
        knockVz: 0,
        dead: false,
        burnUntil: 0,
        burnTickAccum: 0,
        burnDmgPerSec: 0,
        burnOwnerId: '',
        freezeUntil: 0,
        shockUntil: 0,
      });
    }

    mapRooms.set(mapDef.id, {
      mapId: mapDef.id,
      safeZone: false,
      monsters,
      loots: [],
    });
  }
}

initializeWorldRooms();

function sanitizeEquipSlot(rawVal: unknown): string {
  if (typeof rawVal !== 'string') return 'none';
  const trimmed = rawVal.trim().slice(0, 48);
  if (!trimmed || trimmed === 'none') return 'none';
  return ITEMS_CATALOG[trimmed] ? trimmed : 'none';
}

function sanitizeCharacterDoc(raw: Partial<CharacterDoc>): CharacterDoc {
  const classId: ClassId =
    raw.classId === 'vanguard' || raw.classId === 'evolver' ? raw.classId : 'esper';
  const base = CLASSES_CORE[classId].baseStats;

  const skillLevels = Array.isArray(raw.skillLevels)
    ? raw.skillLevels.slice(0, 6).map((v) => Math.max(1, Math.min(20, Math.round(Number(v) || 1))))
    : [1, 1, 1, 1, 1, 1];
  while (skillLevels.length < 6) skillLevels.push(1);

  const inventoryIds = Array.isArray(raw.inventoryIds)
    ? raw.inventoryIds
        .filter((id) => typeof id === 'string' && Boolean(ITEMS_CATALOG[id]))
        .slice(0, 40)
    : [];

  const equippedMount = sanitizeEquipSlot(raw.equippedMount);

  return {
    id: String(raw.id || `char_${Date.now()}`).slice(0, 80),
    ownerId: String(raw.ownerId || '').slice(0, 80),
    name: String(raw.name || 'Chiến Binh').slice(0, 24),
    classId,
    level: Math.max(1, Math.min(500, Math.round(Number(raw.level) || 1))),
    exp: Math.max(0, Math.round(Number(raw.exp) || 0)),
    gold: Math.max(0, Math.round(Number(raw.gold) ?? 1500)),
    gems: Math.max(0, Math.round(Number(raw.gems) ?? 20)),
    statPoints: Math.max(0, Math.round(Number(raw.statPoints) || 0)),
    str: Math.max(1, Math.round(Number(raw.str) || base.str)),
    agi: Math.max(1, Math.round(Number(raw.agi) || base.agi)),
    vit: Math.max(1, Math.round(Number(raw.vit) || base.vit)),
    ene: Math.max(1, Math.round(Number(raw.ene) || base.ene)),
    hpPotions: Math.max(0, Math.round(Number(raw.hpPotions) ?? 10)),
    mpPotions: Math.max(0, Math.round(Number(raw.mpPotions) ?? 10)),
    mapId: Math.max(1, Math.min(32, Math.round(Number(raw.mapId) || CITADEL_MAP_ID))),
    hairColor: String(raw.hairColor || '#f59e0b').slice(0, 12),
    accentColor: String(raw.accentColor || '#f59e0b').slice(0, 12),
    equippedWeapon: sanitizeEquipSlot(raw.equippedWeapon),
    equippedArmor: sanitizeEquipSlot(raw.equippedArmor),
    equippedHelm: sanitizeEquipSlot(raw.equippedHelm),
    equippedGloves: sanitizeEquipSlot(raw.equippedGloves),
    equippedPants: sanitizeEquipSlot(raw.equippedPants),
    equippedBoots: sanitizeEquipSlot(raw.equippedBoots),
    equippedRing: sanitizeEquipSlot(raw.equippedRing),
    equippedWings: sanitizeEquipSlot(raw.equippedWings),
    equippedMount,
    enhanceLevel: Math.max(0, Math.min(15, Math.round(Number(raw.enhanceLevel) || 0))),
    mounted: Boolean(raw.mounted) && equippedMount !== 'none',
    questIndex: Math.max(
      0,
      Math.min(QUESTS_DATA.length - 1, Math.round(Number(raw.questIndex) || 0))
    ),
    questProgress: Math.max(0, Math.round(Number(raw.questProgress) || 0)),
    skillLevels,
    inventoryIds,
    dailyQuests: raw.dailyQuests,
    status: raw.status === 'deleted' ? 'deleted' : 'active',
  };
}

function sendJson(ws: WebSocket | null | undefined, payload: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sendSessionPacket(s: ServerPlayerSession, payload: unknown) {
  if (s.ws && s.ws.readyState === WebSocket.OPEN) {
    s.ws.send(JSON.stringify(payload));
  } else {
    s.outbox.push(payload);
    if (s.outbox.length > 45) {
      s.outbox.shift();
    }
  }
}

function broadcastAll(payload: unknown, excludeWs?: WebSocket) {
  const raw = JSON.stringify(payload);
  for (const client of clients) {
    if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(raw);
    }
  }
  for (const s of sessions.values()) {
    if (!s.ws || s.ws.readyState !== WebSocket.OPEN) {
      s.outbox.push(payload);
      if (s.outbox.length > 45) s.outbox.shift();
    }
  }
}

function broadcastMap(mapId: number, payload: unknown, excludeWs?: WebSocket) {
  const raw = JSON.stringify(payload);
  for (const s of sessions.values()) {
    if (s.char.mapId !== mapId) continue;
    if (s.ws && s.ws !== excludeWs && s.ws.readyState === WebSocket.OPEN) {
      s.ws.send(raw);
    } else if (!s.ws || s.ws.readyState !== WebSocket.OPEN) {
      s.outbox.push(payload);
      if (s.outbox.length > 45) s.outbox.shift();
    }
  }
}

function sendSessionToast(
  s: ServerPlayerSession,
  text: string,
  tone: 'gold' | 'emerald' | 'rose' | 'sky' = 'gold'
) {
  sendSessionPacket(s, { type: 'server:toast', text, tone });
}

function emitMapVfx(mapId: number, event: Omit<ServerCombatVfxEvent, 'id'>) {
  broadcastMap(mapId, {
    type: 'world:vfx',
    event: {
      ...event,
      id: `vfx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    },
  });
}

function emitMapFloat(mapId: number, event: Omit<ServerFloatingEvent, 'id'>) {
  broadcastMap(mapId, {
    type: 'world:float',
    event: {
      ...event,
      id: `flt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    },
  });
}

function hasPriestessBuff(s: ServerPlayerSession, now = Date.now()): boolean {
  return s.buffUntil > now;
}

function serializePlayerStatuses(s: ServerPlayerSession, now: number): ActiveStatusEffect[] {
  const res: ActiveStatusEffect[] = [];
  if (s.burnUntil > now) {
    res.push({
      type: 'burn',
      remainingSec: Number(((s.burnUntil - now) / 1000).toFixed(1)),
      totalSec: 5,
    });
  }
  if (s.freezeUntil > now) {
    res.push({
      type: 'freeze',
      remainingSec: Number(((s.freezeUntil - now) / 1000).toFixed(1)),
      totalSec: 4,
    });
  }
  if (s.shockUntil > now) {
    res.push({
      type: 'shock',
      remainingSec: Number(((s.shockUntil - now) / 1000).toFixed(1)),
      totalSec: 4.5,
    });
  }
  return res;
}

function serializeMonsterStatuses(m: ServerMonsterEntity, now: number): ActiveStatusEffect[] {
  if (m.dead) return [];
  const res: ActiveStatusEffect[] = [];
  if (m.burnUntil > now) {
    res.push({
      type: 'burn',
      remainingSec: Number(((m.burnUntil - now) / 1000).toFixed(1)),
      totalSec: 5,
    });
  }
  if (m.freezeUntil > now) {
    res.push({
      type: 'freeze',
      remainingSec: Number(((m.freezeUntil - now) / 1000).toFixed(1)),
      totalSec: 4,
    });
  }
  if (m.shockUntil > now) {
    res.push({
      type: 'shock',
      remainingSec: Number(((m.shockUntil - now) / 1000).toFixed(1)),
      totalSec: 4.5,
    });
  }
  return res;
}

function toMonsterSnapshot(m: ServerMonsterEntity, now: number): ServerMonsterSnapshot {
  return {
    id: m.id,
    name: m.name,
    isBoss: m.isBoss,
    level: m.level,
    hp: m.hp,
    maxHp: m.maxHp,
    x: Number(m.x.toFixed(2)),
    z: Number(m.z.toFixed(2)),
    rotY: Number(m.rotY.toFixed(2)),
    style: m.style,
    assetSlot: m.assetSlot,
    accentColor: m.accentColor,
    action: m.action,
    actionSeq: m.actionSeq,
    dead: m.dead,
    statuses: serializeMonsterStatuses(m, now),
  };
}

function pickSkillStatusEffect(
  classId: ClassId,
  skillIndex: number | null,
  comboStage: number
): { type: StatusEffectType; durationMs: number; chance: number } | null {
  if (skillIndex === null) {
    if (comboStage < 3) return null;
    if (classId === 'vanguard') return { type: 'burn', durationMs: 4500, chance: 0.45 };
    if (classId === 'esper') return { type: 'shock', durationMs: 4200, chance: 0.45 };
    return { type: 'freeze', durationMs: 3800, chance: 0.45 };
  }
  if (classId === 'esper') {
    if (skillIndex === 0) return { type: 'freeze', durationMs: 4000, chance: 0.65 };
    if (skillIndex === 1 || skillIndex === 4) return { type: 'shock', durationMs: 4500, chance: 0.8 };
    if (skillIndex === 3 || skillIndex === 5) return { type: 'burn', durationMs: 5000, chance: 0.9 };
    return null;
  }
  if (classId === 'vanguard') {
    if (skillIndex === 0 || skillIndex === 4 || skillIndex === 5) {
      return { type: 'burn', durationMs: 5000, chance: 0.82 };
    }
    if (skillIndex === 1 || skillIndex === 3) {
      return { type: 'shock', durationMs: 4500, chance: 0.78 };
    }
    return null;
  }
  // evolver
  if (skillIndex === 0 || skillIndex === 1) return { type: 'shock', durationMs: 4200, chance: 0.72 };
  if (skillIndex === 3) return { type: 'burn', durationMs: 5000, chance: 0.85 };
  if (skillIndex === 4 || skillIndex === 5) return { type: 'freeze', durationMs: 4500, chance: 0.88 };
  return null;
}

function sendSelfSync(s: ServerPlayerSession, now = Date.now()) {
  const buffActive = hasPriestessBuff(s, now);
  const stats = computeDerivedStats(s.char, buffActive);
  s.hp = Math.min(s.hp, stats.maxHp);
  s.mp = Math.min(s.mp, stats.maxMp);
  const vault = getVaultForOwner(s.ownerKey);

  const skillCooldowns = s.skillReadyAt.map((t) =>
    t > now ? Number(((t - now) / 1000).toFixed(1)) : 0
  );
  const dodgeCooldown =
    s.dodgeReadyAt > now ? Number(((s.dodgeReadyAt - now) / 1000).toFixed(1)) : 0;
  const buffRemainingSec = buffActive ? Math.max(0, Math.round((s.buffUntil - now) / 1000)) : 0;

  characterStore[s.char.id] = s.char;
  charStoreDirty = true;
  s.stateSeq += 1;

  sendSessionPacket(s, {
    type: 'self:sync',
    char: s.char,
    hp: Math.round(s.hp),
    mp: Math.round(s.mp),
    maxHp: stats.maxHp,
    maxMp: stats.maxMp,
    x: Number(s.x.toFixed(3)),
    z: Number(s.z.toFixed(3)),
    rotY: Number(s.rotY.toFixed(3)),
    vx: Number(s.vx.toFixed(2)),
    vz: Number(s.vz.toFixed(2)),
    action: s.action,
    actionSeq: s.actionSeq,
    skillIndex: s.skillIndex,
    ackTime: Math.round(s.simClientTime),
    teleportSeq: s.teleportSeq,
    stateSeq: s.stateSeq,
    statuses: serializePlayerStatuses(s, now),
    comboStage: s.comboStage,
    skillCooldowns,
    dodgeCooldown,
    buffRemainingSec,
    vault,
  });
  s.dirtySync = false;
}

function toRemotePlayerSnapshot(s: ServerPlayerSession, now: number): RemotePlayer {
  const buffActive = hasPriestessBuff(s, now);
  const stats = computeDerivedStats(s.char, buffActive);
  s.stateSeq += 1;
  return {
    id: s.id,
    name: s.char.name,
    classId: s.char.classId,
    level: s.char.level,
    mapId: s.char.mapId,
    x: Number(s.x.toFixed(3)),
    z: Number(s.z.toFixed(3)),
    rotY: Number(s.rotY.toFixed(3)),
    vx: Number(s.vx.toFixed(2)),
    vz: Number(s.vz.toFixed(2)),
    hairColor: s.char.hairColor,
    accentColor: s.char.accentColor,
    equippedWeapon: s.char.equippedWeapon,
    equippedArmor: s.char.equippedArmor,
    equippedHelm: s.char.equippedHelm,
    equippedWings: s.char.equippedWings,
    equippedMount: s.char.equippedMount,
    enhanceLevel: s.char.enhanceLevel,
    mounted: s.char.mounted,
    hp: Math.round(s.hp),
    maxHp: stats.maxHp,
    mp: Math.round(s.mp),
    maxMp: stats.maxMp,
    action: s.action,
    actionSeq: s.actionSeq,
    skillIndex: s.skillIndex,
    buffActive,
    statuses: serializePlayerStatuses(s, now),
    ackTime: Math.round(s.simClientTime),
    teleportSeq: s.teleportSeq,
    stateSeq: s.stateSeq,
  };
}

function buildMapSnapshotPayload(s: ServerPlayerSession, now = Date.now()) {
  const room = mapRooms.get(s.char.mapId);
  if (!room) return null;
  const playersInMap: RemotePlayer[] = [];
  for (const peer of sessions.values()) {
    if (peer.char.mapId === s.char.mapId) {
      playersInMap.push(toRemotePlayerSnapshot(peer, now));
    }
  }
  return {
    type: 'world:snapshot',
    mapId: room.mapId,
    safeZone: room.safeZone,
    players: playersInMap,
    monsters: room.safeZone ? [] : room.monsters.map((m) => toMonsterSnapshot(m, now)),
    loots: room.safeZone ? [] : room.loots,
    onlineCount: sessions.size,
  };
}

function sendImmediateMapSnapshot(s: ServerPlayerSession, now = Date.now()) {
  const snap = buildMapSnapshotPayload(s, now);
  if (!snap) return;
  sendSessionPacket(s, snap);
}

function teleportSessionToMap(
  s: ServerPlayerSession,
  targetMapId: number,
  spawnX?: number,
  spawnZ?: number,
  toastMsg?: string,
  toastTone: 'gold' | 'emerald' | 'rose' | 'sky' = 'sky'
) {
  const clampedMapId = Math.max(1, Math.min(32, Math.round(targetMapId)));
  const mapDef = MAPS_DATA.find((m) => m.id === clampedMapId) || MAPS_DATA[0];
  const prevMapId = s.char.mapId;

  const now = Date.now();
  s.char.mapId = mapDef.id;
  s.x = spawnX ?? 0;
  s.z = spawnZ ?? (mapDef.id === CITADEL_MAP_ID ? 9 : 4);
  s.vx = 0;
  s.vz = 0;
  s.dirX = 0;
  s.dirZ = 0;
  s.moveTo = null;
  s.dashUntil = 0;
  s.burnUntil = 0;
  s.freezeUntil = 0;
  s.shockUntil = 0;
  s.action = 'idle';
  s.actionSeq += 1;
  s.teleportSeq += 1;
  s.lastSteppedAt = now;
  s.portalCooldownUntil = now + 2400;

  if (prevMapId !== mapDef.id) {
    broadcastMap(prevMapId, { type: 'player:left', playerId: s.id }, s.ws ?? undefined);
  }

  sendSelfSync(s);
  sendImmediateMapSnapshot(s);

  if (toastMsg) {
    sendSessionToast(s, toastMsg, toastTone);
  } else {
    sendSessionToast(
      s,
      mapDef.safeZone
        ? `Đã trở về [${mapDef.code}] ${mapDef.name} (Đô Thành An Toàn)`
        : `Dịch chuyển tới [${mapDef.code}] ${mapDef.name}`,
      mapDef.safeZone ? 'gold' : 'sky'
    );
  }

  // Update Daily Quest Progress (Visit Citadel)
  if (clampedMapId === CITADEL_MAP_ID) {
    const visitRes = updateDailyQuestProgress(s.char, 'visit_citadel', 1);
    s.char = visitRes.char;
    if (visitRes.completedTitle) {
      sendSessionToast(s, `Hoàn thành Nhiệm vụ Ngày: ${visitRes.completedTitle}`, 'emerald');
    }
  }
}

function spawnAuthoritativeLoot(room: MapRoom, mob: ServerMonsterEntity, mapId: number) {
  if (room.safeZone) return;
  const mapDef = MAPS_DATA.find((m) => m.id === mapId) || MAPS_DATA[1];
  const dropRoll = Math.random();
  let droppedItemId: string | undefined;

  if (mob.isBoss || dropRoll < 0.46) {
    const eligible = ALL_ITEMS_LIST.filter(
      (it) =>
        it.tier <= mapDef.dropTier + (mob.isBoss ? 1 : 0) &&
        it.tier >= Math.max(1, mapDef.dropTier - 1)
    );
    if (eligible.length > 0) {
      droppedItemId = eligible[Math.floor(Math.random() * eligible.length)].id;
    }
  }

  const lx = clampCoord(mob.x + (Math.random() - 0.5) * 1.6, 44);
  const lz = clampCoord(mob.z + (Math.random() - 0.5) * 1.6, 44);
  const lootId = `loot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (droppedItemId && ITEMS_CATALOG[droppedItemId]) {
    const itemDef = ITEMS_CATALOG[droppedItemId];
    const rMeta = RARITY_META[itemDef.rarity];
    room.loots.push({
      id: lootId,
      x: Number(lx.toFixed(2)),
      z: Number(lz.toFixed(2)),
      itemId: itemDef.id,
      gems: mob.isBoss ? 3 : Math.random() < 0.3 ? 1 : 0,
      label: itemDef.name,
      color: rMeta.hex,
    });
  } else {
    const powerIdx = Math.max(1, mapId - 1);
    const goldAmt = Math.round((48 + powerIdx * 30) * (mob.isBoss ? 5 : 1));
    room.loots.push({
      id: lootId,
      x: Number(lx.toFixed(2)),
      z: Number(lz.toFixed(2)),
      gold: goldAmt,
      gems: Math.random() < 0.25 ? 1 : 0,
      label: `${goldAmt} Tinh Thạch`,
      color: '#fbbf24',
    });
  }

  // Cap ground loot per map to 35 to prevent memory bloat
  if (room.loots.length > 35) {
    room.loots.shift();
  }
}

function awardMonsterKillToSession(
  s: ServerPlayerSession,
  room: MapRoom,
  mob: ServerMonsterEntity,
  now: number
) {
  const powerIdx = Math.max(0, room.mapId - FIRST_HUNTING_MAP_ID);
  const expGain = Math.round((mob.isBoss ? 340 : 56) * Math.pow(1.14, powerIdx));
  const goldGain = Math.round((mob.isBoss ? 280 : 42) * Math.pow(1.12, powerIdx));

  let nextLevel = s.char.level;
  let nextExp = s.char.exp + expGain;
  let nextStatPoints = s.char.statPoints;
  let leveledUp = false;

  while (nextLevel < 500 && nextExp >= expRequiredForLevel(nextLevel)) {
    nextExp -= expRequiredForLevel(nextLevel);
    nextLevel += 1;
    nextStatPoints += 5;
    leveledUp = true;
  }

  const curQuest = QUESTS_DATA[Math.min(s.char.questIndex, QUESTS_DATA.length - 1)];
  let nextQuestProgress = s.char.questProgress;
  if (curQuest && curQuest.targetMapId === room.mapId) {
    nextQuestProgress = Math.min(
      curQuest.requiredKills + 50,
      s.char.questProgress + (mob.isBoss ? 3 : 1)
    );
  }

  s.char = {
    ...s.char,
    level: nextLevel,
    exp: nextExp,
    gold: s.char.gold + goldGain,
    gems: s.char.gems + (mob.isBoss ? 2 : 0),
    statPoints: nextStatPoints,
    questProgress: nextQuestProgress,
  };

  // Update Daily Quest Progress (Kill Mobs/Bosses)
  const killRes = updateDailyQuestProgress(s.char, mob.isBoss ? 'kill_bosses' : 'kill_mobs', 1);
  s.char = killRes.char;
  if (killRes.completedTitle) {
    sendSessionToast(s, `Hoàn thành Nhiệm vụ Ngày: ${killRes.completedTitle}`, 'emerald');
  }

  if (leveledUp) {
    const newStats = computeDerivedStats(s.char, hasPriestessBuff(s, now));
    s.hp = newStats.maxHp;
    s.mp = newStats.maxMp;
    emitMapVfx(room.mapId, {
      kind: 'buff',
      actorId: s.id,
      color: '#fbbf24',
      ox: s.x,
      oz: s.z,
      tx: s.x,
      tz: s.z,
      radius: 3.5,
    });
    emitMapFloat(room.mapId, {
      wx: s.x,
      wy: 2.7,
      wz: s.z,
      text: `THĂNG CẤP Lv.${nextLevel}!`,
      color: '#fde047',
      crit: true,
    });
    sendSessionToast(s, `THĂNG CẤP Lv.${nextLevel}! Nhận +5 Điểm Tiềm Năng`, 'gold');
  } else if (mob.isBoss) {
    sendSessionToast(
      s,
      `Đã hạ gục ${mob.name}! +${goldGain.toLocaleString()} Tinh Thạch, +2 Ngọc Hỗn Nguyên`,
      'emerald'
    );
  }

  spawnAuthoritativeLoot(room, mob, room.mapId);
  s.dirtySync = true;
}

function applyAuthoritativeAoeDamage(
  s: ServerPlayerSession,
  room: MapRoom,
  cx: number,
  cz: number,
  radius: number,
  mult: number,
  skillColor: string,
  now: number,
  skillIndex: number | null = null
) {
  if (room.safeZone || room.monsters.length === 0) return;
  const stats = computeDerivedStats(s.char, hasPriestessBuff(s, now));
  const statusSpec = pickSkillStatusEffect(s.char.classId, skillIndex, s.comboStage);

  for (const mob of room.monsters) {
    if (mob.dead) continue;
    const dist = Math.hypot(mob.x - cx, mob.z - cz);
    if (dist > radius + (mob.isBoss ? 1.5 : 0.75)) continue;

    const baseRoll = stats.atkMin + Math.random() * (stats.atkMax - stats.atkMin);
    const isCrit = Math.random() * 100 < stats.critRate;
    const shockAmp = mob.shockUntil > now ? 1.18 : 1.0;
    const rawDmg = baseRoll * mult * shockAmp * (isCrit ? stats.critDmg / 100 : 1);
    const finalDmg = Math.max(8, Math.round(rawDmg));

    mob.hp = Math.max(0, mob.hp - finalDmg);
    mob.recoilTimer = 0.24;
    mob.action = mob.hp <= 0 ? 'dead' : 'hit';
    mob.actionSeq += 1;

    const kdx = mob.x - s.x;
    const kdz = mob.z - s.z;
    const kdLen = Math.max(0.05, Math.hypot(kdx, kdz));
    const knockForce = (mob.isBoss ? 1.5 : 4.2) * Math.min(1.6, 0.7 + mult * 0.35);
    mob.knockVx = (kdx / kdLen) * knockForce;
    mob.knockVz = (kdz / kdLen) * knockForce;

    emitMapFloat(room.mapId, {
      wx: mob.x,
      wy: mob.isBoss ? 3.2 : 2.0,
      wz: mob.z,
      text: isCrit ? `💥 ${finalDmg.toLocaleString()}` : `${finalDmg.toLocaleString()}`,
      color: isCrit ? '#fbbf24' : skillColor,
      crit: isCrit,
    });

    if (mob.hp <= 0) {
      mob.dead = true;
      mob.burnUntil = 0;
      mob.freezeUntil = 0;
      mob.shockUntil = 0;
      mob.respawnTimer = mob.isBoss ? 12.0 : 5.5;
      awardMonsterKillToSession(s, room, mob, now);
    } else if (statusSpec && Math.random() < statusSpec.chance) {
      if (statusSpec.type === 'burn') {
        mob.burnUntil = Math.max(mob.burnUntil, now + statusSpec.durationMs);
        mob.burnDmgPerSec = Math.max(6, Math.round(finalDmg * 0.22));
        mob.burnOwnerId = s.id;
        emitMapFloat(room.mapId, {
          wx: mob.x,
          wy: mob.isBoss ? 3.55 : 2.35,
          wz: mob.z,
          text: '🔥 THIÊU ĐỐT',
          color: '#fb923c',
        });
      } else if (statusSpec.type === 'freeze') {
        mob.freezeUntil = Math.max(mob.freezeUntil, now + statusSpec.durationMs);
        emitMapFloat(room.mapId, {
          wx: mob.x,
          wy: mob.isBoss ? 3.55 : 2.35,
          wz: mob.z,
          text: '❄️ ĐÓNG BĂNG',
          color: '#38bdf8',
        });
      } else if (statusSpec.type === 'shock') {
        mob.shockUntil = Math.max(mob.shockUntil, now + statusSpec.durationMs);
        emitMapFloat(room.mapId, {
          wx: mob.x,
          wy: mob.isBoss ? 3.55 : 2.35,
          wz: mob.z,
          text: '⚡ TÊ LIỆT',
          color: '#fde047',
        });
      }
    }
  }
}

function tryPickupLootForSession(
  s: ServerPlayerSession,
  room: MapRoom,
  lootId?: string,
  maxRadius = 8.5
): boolean {
  if (room.safeZone || room.loots.length === 0) return false;
  let targetIdx = -1;
  let bestDist = maxRadius;

  for (let i = 0; i < room.loots.length; i++) {
    const l = room.loots[i];
    if (lootId && l.id !== lootId) continue;
    const d = Math.hypot(l.x - s.x, l.z - s.z);
    if (d <= bestDist) {
      bestDist = d;
      targetIdx = i;
    }
  }

  if (targetIdx === -1) return false;
  const loot = room.loots[targetIdx];

  if (loot.itemId && ITEMS_CATALOG[loot.itemId]) {
    if (s.char.inventoryIds.length >= 40) {
      sendSessionToast(s, 'Túi Đồ 40 ô đã đầy! Hãy về Ngân Khố Hoàng Thành cất hoặc bán bớt.', 'rose');
      return false;
    }
    const itemDef = ITEMS_CATALOG[loot.itemId];
    room.loots.splice(targetIdx, 1);
    s.char = {
      ...s.char,
      gold: s.char.gold + (loot.gold || 0),
      gems: s.char.gems + (loot.gems || 0),
      inventoryIds: [...s.char.inventoryIds, itemDef.id],
    };
    emitMapFloat(room.mapId, {
      wx: s.x,
      wy: 2.35,
      wz: s.z,
      text: `+ ${itemDef.name}`,
      color: loot.color,
    });
    sendSessionToast(s, `Nhặt trang bị: ${itemDef.name}`, 'emerald');
    s.dirtySync = true;

    const lootRes = updateDailyQuestProgress(s.char, 'collect_gems', loot.gems || 0);
    s.char = lootRes.char;
    if (lootRes.completedTitle) {
      sendSessionToast(s, `Hoàn thành Nhiệm vụ Ngày: ${lootRes.completedTitle}`, 'emerald');
    }

    return true;
  }

  room.loots.splice(targetIdx, 1);
  s.char = {
    ...s.char,
    gold: s.char.gold + (loot.gold || 0),
    gems: s.char.gems + (loot.gems || 0),
  };

  let charWithLoot = s.char;
  if (loot.gold && loot.gold > 0) {
    const goldRes = updateDailyQuestProgress(charWithLoot, 'collect_gold', loot.gold);
    charWithLoot = goldRes.char;
    if (goldRes.completedTitle) sendSessionToast(s, `Hoàn thành Nhiệm vụ Ngày: ${goldRes.completedTitle}`, 'emerald');
  }
  if (loot.gems && loot.gems > 0) {
    const gemRes = updateDailyQuestProgress(charWithLoot, 'collect_gems', loot.gems);
    charWithLoot = gemRes.char;
    if (gemRes.completedTitle) sendSessionToast(s, `Hoàn thành Nhiệm vụ Ngày: ${gemRes.completedTitle}`, 'emerald');
  }
  s.char = charWithLoot;
  emitMapFloat(room.mapId, {
    wx: s.x,
    wy: 2.35,
    wz: s.z,
    text: `+ ${loot.label}`,
    color: loot.color,
  });
  if (loot.gems && loot.gems > 0) {
    sendSessionToast(s, `Nhặt +${loot.gems} Ngọc Hỗn Nguyên`, 'gold');
  }
  s.dirtySync = true;
  return true;
}

// ============================================================================
// AUTHORITATIVE SUB-TICK MOVEMENT INTEGRATOR & 30HZ SERVER GAME LOOP
// ============================================================================
function stepSessionMovement(s: ServerPlayerSession, now: number): boolean {
  const rawDt = (now - s.lastSteppedAt) / 1000;
  s.lastSteppedAt = now;
  const stepDt = Math.min(0.1, Math.max(0, rawDt));

  // Auto-stop joystick vector if client input stream stalls > 700ms (e.g. mobile disconnect)
  if (Math.hypot(s.dirX, s.dirZ) > 0.04 && now - s.lastMovePacketAt > 700) {
    s.dirX = 0;
    s.dirZ = 0;
  }

  const buffActive = hasPriestessBuff(s, now);
  const stats = computeDerivedStats(s.char, buffActive);
  const freezeSlowMult = s.freezeUntil > now ? 0.65 : 1.0;
  const baseSpeed = 7.2 * (stats.moveSpeed / 100) * freezeSlowMult;

  let moving = false;
  const prevX = s.x;
  const prevZ = s.z;
  let cmdVx = 0;
  let cmdVz = 0;

  if (s.dashUntil > now) {
    cmdVx = s.dashVx;
    cmdVz = s.dashVz;
    if (stepDt > 0) {
      s.x = clampCoord(s.x + cmdVx * stepDt);
      s.z = clampCoord(s.z + cmdVz * stepDt);
    }
    moving = true;
  } else if (Math.hypot(s.dirX, s.dirZ) > 0.04) {
    s.moveTo = null;
    const len = Math.hypot(s.dirX, s.dirZ);
    const mag = Math.min(1, len);
    const nx = s.dirX / Math.max(0.0001, len);
    const nz = s.dirZ / Math.max(0.0001, len);
    cmdVx = nx * baseSpeed * mag;
    cmdVz = nz * baseSpeed * mag;
    if (stepDt > 0) {
      s.x = clampCoord(s.x + cmdVx * stepDt);
      s.z = clampCoord(s.z + cmdVz * stepDt);
      if (s.simClientTime > 0) {
        s.simClientTime += stepDt * 1000;
      }
    }
    if (s.actionUntil <= now) {
      s.rotY = Math.atan2(nx, nz);
    }
    moving = true;
  } else if (s.moveTo) {
    const dx = s.moveTo.x - s.x;
    const dz = s.moveTo.z - s.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.45) {
      cmdVx = (dx / dist) * baseSpeed;
      cmdVz = (dz / dist) * baseSpeed;
      if (stepDt > 0) {
        const moveStep = Math.min(dist, baseSpeed * stepDt);
        s.x = clampCoord(s.x + (dx / dist) * moveStep);
        s.z = clampCoord(s.z + (dz / dist) * moveStep);
      }
      s.rotY = Math.atan2(dx, dz);
      moving = true;
    } else {
      s.moveTo = null;
    }
  }

  if (!moving) {
    s.vx = 0;
    s.vz = 0;
  } else if (stepDt >= 0.002) {
    s.vx = (s.x - prevX) / stepDt;
    s.vz = (s.z - prevZ) / stepDt;
  } else {
    s.vx = Math.abs(s.x) >= 46.49 && Math.sign(cmdVx) === Math.sign(s.x) ? 0 : cmdVx;
    s.vz = Math.abs(s.z) >= 46.49 && Math.sign(cmdVz) === Math.sign(s.z) ? 0 : cmdVz;
  }

  // Update authoritative animation action state
  if (s.actionUntil <= now) {
    const desiredAction: ActorActionType = moving
      ? 'run'
      : s.char.mounted
      ? 'mount'
      : 'idle';
    if (s.action !== desiredAction) {
      s.action = desiredAction;
      s.actionSeq += 1;
    }
  }

  return moving;
}

const SERVER_TICK_MS = 33; // ~30Hz real-time authoritative simulation
let lastWorldTickAt = Date.now();

setInterval(() => {
  const now = Date.now();
  const tickDt = Math.min(0.1, Math.max(0.005, (now - lastWorldTickAt) / 1000));
  lastWorldTickAt = now;
  const activeMapIds = new Set<number>();

  // Clean up expired disconnected sessions (>30s idle without active WebSocket or HTTP poll)
  for (const [sid, s] of sessions.entries()) {
    const wsOpen = Boolean(s.ws && s.ws.readyState === WebSocket.OPEN);
    if (!wsOpen && now - s.lastSeenAt > 30000) {
      sessions.delete(sid);
      broadcastMap(s.char.mapId, { type: 'player:left', playerId: s.id });
      broadcastAll({ type: 'presence:count', onlineCount: sessions.size });
    }
  }

  // 1. Update all connected player sessions (movement, statuses, safe regen, auto-loot, portals)
  for (const s of sessions.values()) {
    activeMapIds.add(s.char.mapId);
    const room = mapRooms.get(s.char.mapId);
    if (!room) continue;

    if (room.safeZone) {
      s.burnUntil = 0;
      s.freezeUntil = 0;
      s.shockUntil = 0;
    }

    const buffActive = hasPriestessBuff(s, now);
    const stats = computeDerivedStats(s.char, buffActive);

    stepSessionMovement(s, now);

    // Player Burn DoT tick (1s interval)
    if (s.burnUntil > now && !room.safeZone) {
      s.burnTickAccum += tickDt;
      if (s.burnTickAccum >= 1.0) {
        s.burnTickAccum = 0;
        const burnDmg = Math.max(3, Math.round(s.burnDmgPerSec || stats.maxHp * 0.035));
        s.hp = Math.max(1, s.hp - burnDmg);
        emitMapFloat(room.mapId, {
          wx: s.x,
          wy: 2.15,
          wz: s.z,
          text: `🔥 -${burnDmg}`,
          color: '#fb923c',
        });
        s.dirtySync = true;
      }
    } else {
      s.burnTickAccum = 0;
    }

    // Reset 3-hit combo stage if window expired
    if (s.comboStage !== 1 && now > s.comboResetAt) {
      s.comboStage = 1;
      s.dirtySync = true;
    }

    // Regenerate HP/MP authoritatively
    s.regenAccum += tickDt;
    if (s.regenAccum >= 1.2) {
      s.regenAccum = 0;
      const inOutpostSafe = room.safeZone || Math.hypot(s.x, s.z) < 10.5;
      const nextHp = inOutpostSafe
        ? Math.min(stats.maxHp, s.hp + Math.round(stats.maxHp * (room.safeZone ? 0.12 : 0.05)))
        : s.hp;
      const nextMp = Math.min(
        stats.maxMp,
        s.mp + Math.round(stats.maxMp * (room.safeZone ? 0.15 : inOutpostSafe ? 0.08 : 0.035))
      );
      if (nextHp !== s.hp || nextMp !== s.mp) {
        s.hp = nextHp;
        s.mp = nextMp;
        s.dirtySync = true;
      }
    }

    // Auto-pickup loot when walking directly over it
    if (!room.safeZone && room.loots.length > 0) {
      for (const l of room.loots) {
        if (Math.hypot(l.x - s.x, l.z - s.z) < 2.0) {
          tryPickupLootForSession(s, room, l.id, 2.5);
          break;
        }
      }
    }

    // Authoritative Warp Gate Triggers
    if (now > s.portalCooldownUntil) {
      if (Math.hypot(s.x - 0, s.z - -38) < 2.5) {
        const nextMapId =
          s.char.mapId === CITADEL_MAP_ID
            ? FIRST_HUNTING_MAP_ID
            : s.char.mapId < 32
            ? s.char.mapId + 1
            : FIRST_HUNTING_MAP_ID;
        teleportSessionToMap(s, nextMapId, 0, 4);
        continue;
      }
      if (!room.safeZone && Math.hypot(s.x - 0, s.z - 38) < 2.5) {
        teleportSessionToMap(s, CITADEL_MAP_ID, 0, -28);
        continue;
      }
    }

    if (s.dirtySync) {
      sendSelfSync(s, now);
    }
  }

  // 2. Simulate Monsters & Broadcast 30Hz Snapshots for Active Maps
  for (const mapId of activeMapIds) {
    const room = mapRooms.get(mapId);
    if (!room) continue;

    const mapPlayers: ServerPlayerSession[] = [];
    for (const s of sessions.values()) {
      if (s.char.mapId === mapId) {
        mapPlayers.push(s);
      }
    }

    if (room.safeZone) {
      room.monsters.length = 0;
      room.loots.length = 0;
    } else {
      for (const mob of room.monsters) {
        if (mob.dead) {
          mob.respawnTimer -= tickDt;
          if (mob.respawnTimer <= 0) {
            mob.dead = false;
            mob.hp = mob.maxHp;
            mob.x = mob.homeX;
            mob.z = mob.homeZ;
            mob.recoilTimer = 0;
            mob.knockVx = 0;
            mob.knockVz = 0;
            mob.burnUntil = 0;
            mob.freezeUntil = 0;
            mob.shockUntil = 0;
            mob.action = 'idle';
            mob.actionSeq += 1;
          }
          continue;
        }

        // Monster Burn DoT tick (1s interval)
        if (mob.burnUntil > now) {
          mob.burnTickAccum += tickDt;
          if (mob.burnTickAccum >= 1.0) {
            mob.burnTickAccum = 0;
            const dotDmg = Math.max(5, mob.burnDmgPerSec || 12);
            mob.hp = Math.max(0, mob.hp - dotDmg);
            emitMapFloat(mapId, {
              wx: mob.x,
              wy: mob.isBoss ? 3.1 : 1.95,
              wz: mob.z,
              text: `🔥 ${dotDmg}`,
              color: '#fb923c',
            });
            if (mob.hp <= 0) {
              mob.dead = true;
              mob.action = 'dead';
              mob.actionSeq += 1;
              mob.burnUntil = 0;
              mob.freezeUntil = 0;
              mob.shockUntil = 0;
              mob.respawnTimer = mob.isBoss ? 12.0 : 5.5;
              const killer = sessions.get(mob.burnOwnerId) || mapPlayers[0];
              if (killer) {
                awardMonsterKillToSession(killer, room, mob, now);
              }
              continue;
            }
          }
        } else {
          mob.burnTickAccum = 0;
        }

        if (mob.recoilTimer > 0) {
          mob.recoilTimer = Math.max(0, mob.recoilTimer - tickDt);
        }
        if (Math.hypot(mob.knockVx, mob.knockVz) > 0.05) {
          mob.x = clampCoord(mob.x + mob.knockVx * tickDt, 45);
          mob.z = clampCoord(mob.z + mob.knockVz * tickDt, 45);
          mob.knockVx *= Math.exp(-11 * tickDt);
          mob.knockVz *= Math.exp(-11 * tickDt);
        }

        // Find nearest player outside central outpost safe circle
        let nearestPlayer: ServerPlayerSession | null = null;
        let bestDist = mob.isBoss ? 15.0 : 10.0;
        for (const p of mapPlayers) {
          if (Math.hypot(p.x, p.z) < 10.2) continue;
          const d = Math.hypot(p.x - mob.x, p.z - mob.z);
          if (d < bestDist) {
            bestDist = d;
            nearestPlayer = p;
          }
        }

        const mobChillMult = mob.freezeUntil > now ? 0.62 : 1.0;

        if (nearestPlayer) {
          const desiredYaw = Math.atan2(nearestPlayer.x - mob.x, nearestPlayer.z - mob.z);
          mob.rotY = dampAngle(mob.rotY, desiredYaw, 10, tickDt);
          const atkRange = mob.isBoss ? 3.2 : 2.15;

          if (bestDist > atkRange && mob.recoilTimer <= 0.06) {
            const mSpd = (mob.isBoss ? 3.5 : 3.05) * mobChillMult;
            mob.x = clampCoord(mob.x + Math.sin(mob.rotY) * mSpd * tickDt, 45);
            mob.z = clampCoord(mob.z + Math.cos(mob.rotY) * mSpd * tickDt, 45);
            if (mob.action !== 'chase') {
              mob.action = 'chase';
              mob.actionSeq += 1;
            }
          } else if (bestDist <= atkRange + 0.25) {
            mob.attackTimer -= tickDt * mobChillMult;
            if (mob.attackTimer <= 0) {
              mob.attackTimer = mob.isBoss ? 1.6 : 1.9;
              mob.action = 'attack';
              mob.actionSeq += 1;

              const pStats = computeDerivedStats(
                nearestPlayer.char,
                hasPriestessBuff(nearestPlayer, now)
              );
              const evaded =
                nearestPlayer.evadeUntil > now ||
                Math.random() * 100 < Math.min(55, pStats.evasion * 0.28);

              if (evaded) {
                emitMapFloat(mapId, {
                  wx: nearestPlayer.x,
                  wy: 2.35,
                  wz: nearestPlayer.z,
                  text: 'NÉ ĐÒN!',
                  color: '#38bdf8',
                });
              } else {
                const shockVuln = nearestPlayer.shockUntil > now ? 1.18 : 1.0;
                const rawDmg = Math.max(
                  4,
                  Math.round((mob.atk - pStats.defense * 0.34) * shockVuln)
                );
                nearestPlayer.hp = Math.max(0, nearestPlayer.hp - rawDmg);
                emitMapVfx(mapId, {
                  kind: 'mob_attack',
                  actorId: mob.id,
                  color: mob.isBoss ? '#fb7185' : '#ef4444',
                  ox: mob.x,
                  oz: mob.z,
                  tx: nearestPlayer.x,
                  tz: nearestPlayer.z,
                  radius: 1.5,
                });
                emitMapFloat(mapId, {
                  wx: nearestPlayer.x,
                  wy: 2.2,
                  wz: nearestPlayer.z,
                  text: `-${rawDmg}`,
                  color: '#ef4444',
                });

                // Monster attack elemental status chance
                const statusChance = mob.isBoss ? 0.48 : 0.28;
                if (nearestPlayer.hp > 0 && Math.random() < statusChance) {
                  if (mob.style === 'mecha' || mob.style === 'wraith') {
                    nearestPlayer.shockUntil = Math.max(nearestPlayer.shockUntil, now + 4000);
                  } else if (mob.style === 'mutant' || mob.style === 'hound') {
                    nearestPlayer.burnUntil = Math.max(nearestPlayer.burnUntil, now + 4500);
                    nearestPlayer.burnDmgPerSec = Math.max(4, Math.round(rawDmg * 0.22));
                  } else {
                    nearestPlayer.freezeUntil = Math.max(nearestPlayer.freezeUntil, now + 3800);
                  }
                }

                if (nearestPlayer.hp <= 0) {
                  const reviveStats = computeDerivedStats(
                    nearestPlayer.char,
                    hasPriestessBuff(nearestPlayer, now)
                  );
                  nearestPlayer.hp = reviveStats.maxHp;
                  nearestPlayer.mp = reviveStats.maxMp;
                  teleportSessionToMap(
                    nearestPlayer,
                    CITADEL_MAP_ID,
                    0,
                    6,
                    'Trọng thương! Bạn đã được hồi sinh về Đài Tinh Thể Hoàng Thành.',
                    'rose'
                  );
                  emitMapVfx(CITADEL_MAP_ID, {
                    kind: 'heal',
                    actorId: nearestPlayer.id,
                    color: '#34d399',
                    ox: 0,
                    oz: 6,
                    tx: 0,
                    tz: 6,
                    radius: 3.2,
                  });
                } else {
                  sendSelfSync(nearestPlayer, now);
                }
              }
            }
          }
        } else {
          const dh = Math.hypot(mob.homeX - mob.x, mob.homeZ - mob.z);
          if (dh > 1.4) {
            const desiredYaw = Math.atan2(mob.homeX - mob.x, mob.homeZ - mob.z);
            mob.rotY = dampAngle(mob.rotY, desiredYaw, 8, tickDt);
            mob.x = clampCoord(mob.x + Math.sin(mob.rotY) * 2.3 * mobChillMult * tickDt, 45);
            mob.z = clampCoord(mob.z + Math.cos(mob.rotY) * 2.3 * mobChillMult * tickDt, 45);
            if (mob.action !== 'patrol') {
              mob.action = 'patrol';
              mob.actionSeq += 1;
            }
          } else if (mob.recoilTimer <= 0 && mob.action !== 'idle') {
            mob.action = 'idle';
          }
        }
      }
    }

    const playersPayload = mapPlayers.map((p) => toRemotePlayerSnapshot(p, now));
    const monstersPayload = room.safeZone
      ? []
      : room.monsters.map((m) => toMonsterSnapshot(m, now));
    const snapshotPacket = JSON.stringify({
      type: 'world:snapshot',
      mapId: room.mapId,
      safeZone: room.safeZone,
      players: playersPayload,
      monsters: monstersPayload,
      loots: room.safeZone ? [] : room.loots,
      onlineCount: sessions.size,
    });

    for (const p of mapPlayers) {
      if (p.ws && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(snapshotPacket);
      }
    }
  }
}, SERVER_TICK_MS);

// ============================================================================
// HTTP + WEBSOCKET SERVER BOOTSTRAP
const ADMIN_EMAIL = 'thongtruongzhz@gmail.com';

function isAdmin(req: express.Request): boolean {
  const email = String(req.headers['x-admin-email'] || '');
  return email === ADMIN_EMAIL;
}

// ============================================================================
// HTTP + WEBSOCKET SERVER BOOTSTRAP
// ============================================================================
async function startServer() {
  const app = express();

  // Serve uploaded custom 3D & image assets directly across all devices
  app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

  // Fast size inspection endpoint for chunked download coordination
  app.get('/api/assets/info', (req, res) => {
    const rawUrl = String(req.query.url || '');
    let cleanRel = rawUrl.startsWith('/') ? rawUrl.slice(1) : rawUrl;
    // Strip query parameters
    cleanRel = cleanRel.split('?')[0].split('#')[0];
    if (cleanRel.startsWith('uploads/')) {
      const fullPath = path.join(__dirname, 'public', cleanRel);
      if (fs.existsSync(fullPath)) {
        try {
          const stat = fs.statSync(fullPath);
          res.json({ ok: true, size: stat.size, ext: path.extname(fullPath).toLowerCase() });
          return;
        } catch {}
      }
    }
    res.status(404).json({ ok: false, error: 'File not found' });
  });

  // Chunked upload route for bypassing Cloud Run's 32MB payload limit
  app.post(
    '/api/assets/upload/chunk',
    (req, res, next) => {
      const len = req.headers['content-length'];
      if (Number(len) > 32 * 1024 * 1024) {
        res.status(413).json({ error: 'Chunk too large (max 32MB).' });
        return;
      }
      next();
    },
    express.raw({ type: '*/*', limit: '40mb' }),
    async (req, res) => {
      if (!isAdmin(req)) {
        res.status(403).json({ error: 'Chỉ Quản Trị Viên mới có quyền thay thế tài nguyên.' });
        return;
      }
      try {
        const uploadId = String(req.query.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const chunkIndex = parseInt(String(req.query.chunkIndex || '0'), 10);
        const totalChunks = parseInt(String(req.query.totalChunks || '1'), 10);
        const slotKey = String(req.query.slotKey || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        const origName = String(req.query.fileName || 'model.glb');
        const ext = path.extname(origName).toLowerCase() || '.glb';
        const actionKey = String(req.query.actionKey || '').replace(/[^a-z0-9_]/g, '').slice(0, 32);

        if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !slotKey) {
          res.status(400).json({ error: 'Thiếu thông tin tải lên theo mảnh (chunked upload).' });
          return;
        }

        const buf = req.body as Buffer;
        if (!Buffer.isBuffer(buf)) {
          res.status(400).json({ error: 'Dữ liệu mảnh file không hợp lệ.' });
          return;
        }

        const chunkDir = path.join(CHUNKS_DIR, uploadId);
        if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });

        const chunkPath = path.join(chunkDir, `chunk_${chunkIndex}`);
        fs.writeFileSync(chunkPath, buf);

        // Check if we have all chunks
        const files = fs.readdirSync(chunkDir).filter(f => f.startsWith('chunk_'));
        if (files.length === totalChunks) {
          // Reassemble
          const fileName = `${slotKey}_${Date.now()}${ext}`;
          const filePath = path.join(UPLOADS_DIR, fileName);

          // We'll write them in order
          const fd = fs.openSync(filePath, 'w');
          for (let i = 0; i < totalChunks; i++) {
            const p = path.join(chunkDir, `chunk_${i}`);
            const chunkBuf = fs.readFileSync(p);
            fs.writeSync(fd, chunkBuf, 0, chunkBuf.length);
          }
          fs.closeSync(fd);

          // Cleanup
          try {
            fs.rmSync(chunkDir, { recursive: true, force: true });
          } catch {}

          // Same logic as monolithic upload for manifest update
          const publicUrl = `/uploads/custom-assets/${fileName}`;
          const scale = Math.max(0.1, Math.min(8, Number(req.query.scale) || 1.0));
          const offsetY = Math.max(-5, Math.min(5, Number(req.query.offsetY) || 0));
          const rotationY = Math.max(-360, Math.min(360, Number(req.query.rotationY) || 0));
          const label = String(req.query.label || slotKey).slice(0, 90);
          const ownerId = String(req.query.ownerId || 'server').slice(0, 64);

          let overrideDoc = customAssetManifest[slotKey];
          if (!overrideDoc) {
            overrideDoc = {
              id: `srv_asset_${slotKey}`,
              ownerId,
              slotKey,
              label,
              modelUrl: '',
              actions: {},
              scale,
              offsetY,
              rotationY,
              status: 'active',
              updatedAt: Date.now(),
            };
          }

          if (actionKey) {
            if (!overrideDoc.actions) overrideDoc.actions = {};
            overrideDoc.actions[actionKey] = publicUrl;
            if (/^skill[1-6]$/.test(actionKey)) {
              (overrideDoc as any)[actionKey] = publicUrl;
            }
          } else {
            overrideDoc.modelUrl = publicUrl;
          }

          overrideDoc.updatedAt = Date.now();
          customAssetManifest[slotKey] = overrideDoc;
          saveAssetManifest();

          broadcastAll({
            type: 'assets:manifest',
            overrides: Object.values(customAssetManifest),
          });

          res.json({ ok: true, override: overrideDoc, completed: true });
        } else {
          res.json({ ok: true, completed: false, received: files.length, total: totalChunks });
        }
      } catch (err) {
        console.error('[CHUNK_UPLOAD] Error:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi xử lý mảnh tài nguyên.' });
      }
    }
  );

  // Raw binary upload route (up to 1GB for .glb/.gltf/.fbx/.obj/.png/.jpg/.webp)
  app.post(
    '/api/assets/upload',
    (req, res, next) => {
      const len = req.headers['content-length'];
      console.log(`[UPLOAD] Receiving asset: ${req.query.slotKey}, size: ${len} bytes`);
      if (Number(len) > 32 * 1024 * 1024) {
        console.warn(`[UPLOAD] Request size (${len}) exceeds platform 32MB limit. This may fail on Cloud Run.`);
      }
      next();
    },
    express.raw({ type: '*/*', limit: '1024mb' }),
    (req, res) => {
      if (!isAdmin(req)) {
        res.status(403).json({ error: 'Chỉ Quản Trị Viên mới có quyền thay thế tài nguyên.' });
        return;
      }
      try {
        const slotKey = String(req.query.slotKey || req.headers['x-slot-key'] || '')
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 64);
        const origName = String(req.query.fileName || req.headers['x-file-name'] || 'model.glb');
        const ext = path.extname(origName).toLowerCase() || '.glb';

        const actionKey = String(req.query.actionKey || req.headers['x-action-key'] || '')
          .replace(/[^a-z0-9_]/g, '')
          .slice(0, 32);

        if (!slotKey) {
          res.status(400).json({ error: 'Thiếu mã slotKey tài nguyên.' });
          return;
        }
        if (ARCHIVE_EXTS.has(ext)) {
          res.status(400).json({
            error: `File đang ở dạng nén (${ext}). Hãy giải nén thư mục trước rồi chọn file hiệu ứng (.glb, .fbx, .png, .gif, .mp4, .mov, .tscn, .prefab, .asset, .efk) bên trong!`,
          });
          return;
        }
        if (!ALLOWED_ASSET_EXTS.has(ext)) {
          res.status(400).json({
            error: `Đuôi file "${ext}" chưa hỗ trợ trực tiếp. Hãy chọn: .glb, .gltf, .fbx, .obj, .tscn, .prefab, .asset, .efk, .json, .mp4, .webm, .mov, .gif, .png, .jpg, .webp, .avif`,
          });
          return;
        }
        const buf = req.body as Buffer;
        if (!Buffer.isBuffer(buf) || buf.length < 4) {
          res.status(400).json({ error: 'Dữ liệu file tải lên trống hoặc không hợp lệ.' });
          return;
        }

        const fileName = `${slotKey}_${Date.now()}${ext}`;
        const filePath = path.join(UPLOADS_DIR, fileName);
        fs.writeFileSync(filePath, buf);

        const publicUrl = `/uploads/custom-assets/${fileName}`;
        const scale = Math.max(0.1, Math.min(8, Number(req.query.scale) || 1.0));
        const offsetY = Math.max(-5, Math.min(5, Number(req.query.offsetY) || 0));
        const rotationY = Math.max(-360, Math.min(360, Number(req.query.rotationY) || 0));
        const label = String(req.query.label || slotKey).slice(0, 90);
        const ownerId = String(req.query.ownerId || 'server').slice(0, 64);

        let overrideDoc = customAssetManifest[slotKey];
        if (!overrideDoc) {
          overrideDoc = {
            id: `srv_asset_${slotKey}`,
            ownerId,
            slotKey,
            label,
            modelUrl: '',
            actions: {},
            scale,
            offsetY,
            rotationY,
            status: 'active',
            updatedAt: Date.now(),
          };
        }

        if (actionKey) {
          if (!overrideDoc.actions) overrideDoc.actions = {};
          overrideDoc.actions[actionKey] = publicUrl;
          // Also map to top-level skill1-6 fields for the animation retargeting engine
          if (/^skill[1-6]$/.test(actionKey)) {
            (overrideDoc as any)[actionKey] = publicUrl;
          }
        } else {
          overrideDoc.modelUrl = publicUrl;
        }

        overrideDoc.updatedAt = Date.now();
        customAssetManifest[slotKey] = overrideDoc;
        saveAssetManifest();

        // Broadcast updated asset manifest to EVERY connected player immediately!
        broadcastAll({
          type: 'assets:manifest',
          overrides: Object.values(customAssetManifest),
        });

        res.json({ ok: true, override: overrideDoc });
      } catch (err) {
        console.error('Upload custom asset error:', err);
        res.status(500).json({ error: 'Lỗi máy chủ khi lưu file tài nguyên 3D.' });
      }
    }
  );

  app.use(express.json({ limit: '1024mb' }));
  app.use(express.urlencoded({ limit: '1024mb', extended: true }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      onlineCount: sessions.size,
      timestamp: Date.now(),
    });
  });

  app.get('/api/server-stats', (_req, res) => {
    res.json({
      onlineCount: sessions.size,
      servers: [
        {
          id: 's1',
          name: 'S1 - Hoàng Thành Thánh Tích',
          status: 'Mới Mở',
          load: Math.min(95, 28 + sessions.size * 5),
        },
        {
          id: 's2',
          name: 'S2 - Pháo Đài Băng Giá',
          status: 'Ổn Định',
          load: Math.min(90, 19 + sessions.size * 3),
        },
        {
          id: 's3',
          name: 'S3 - Kỷ Nguyên Tiến Hoá',
          status: 'Đông Đúc',
          load: Math.min(98, 42 + sessions.size * 4),
        },
      ],
    });
  });

  app.get('/api/assets/manifest', (_req, res) => {
    res.json({
      ok: true,
      overrides: Object.values(customAssetManifest),
    });
  });

  app.post('/api/assets/override', (req, res) => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Chỉ Quản Trị Viên mới có quyền thay thế tài nguyên.' });
      return;
    }
    const body = req.body || {};
    const slotKey = String(body.slotKey || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64);
    const modelUrl = String(body.modelUrl || '').trim();
    if (!slotKey || !modelUrl) {
      res.status(400).json({ error: 'Thiếu slotKey hoặc modelUrl.' });
      return;
    }

    const existing = customAssetManifest[slotKey];
    const overrideDoc: AssetOverrideDoc = {
      id: `srv_asset_${slotKey}`,
      ownerId: String(body.ownerId || existing?.ownerId || 'server').slice(0, 64),
      slotKey,
      label: String(body.label || existing?.label || slotKey).slice(0, 90),
      modelUrl,
      actions: existing?.actions || {},
      scale: Math.max(0.05, Math.min(20, Number(body.scale) || 1)),
      offsetY: Math.max(-10, Math.min(10, Number(body.offsetY) || 0)),
      rotationY: Math.max(-360, Math.min(360, Number(body.rotationY) || 0)),
      status: 'active',
      updatedAt: Date.now(),
    };

    customAssetManifest[slotKey] = overrideDoc;
    saveAssetManifest();
    broadcastAll({
      type: 'assets:manifest',
      overrides: Object.values(customAssetManifest),
    });
    res.json({ ok: true, override: overrideDoc });
  });

  app.delete('/api/assets/override/:slotKey', (req, res) => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: 'Chỉ Quản Trị Viên mới có quyền khôi phục tài nguyên.' });
      return;
    }
    const slotKey = String(req.params.slotKey || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64);
    if (customAssetManifest[slotKey]) {
      delete customAssetManifest[slotKey];
      saveAssetManifest();
      broadcastAll({
        type: 'assets:manifest',
        overrides: Object.values(customAssetManifest),
      });
    }
    res.json({ ok: true });
  });

  // Authoritative Server-Side Account & Character Endpoints
  app.get('/api/server-auth/bootstrap/:ownerId', (req, res) => {
    const ownerId = String(req.params.ownerId || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 128);
    if (!ownerId) {
      res.status(400).json({ error: 'Mã tài khoản không hợp lệ.' });
      return;
    }
    const account = accountStore[ownerId] || null;
    const characters = Object.values(characterStore).filter(
      (c) => c.ownerId === ownerId && c.status === 'active'
    );
    res.json({ ok: true, ownerId, account, characters });
  });

  app.post('/api/server-auth/session', (req, res) => {
    const body = req.body || {};
    const rawUsername = String(body.gameUsername || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 24);
    const gameUsername =
      rawUsername.length >= 3
        ? rawUsername
        : `ChienBinh_${Math.floor(100 + Math.random() * 899)}`;
    const rawServer = String(body.serverId || 's1')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 32);
    const serverId = rawServer || 's1';

    const requestedOwner = String(body.ownerId || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 128);
    const ownerId = requestedOwner || `srv_${gameUsername.toLowerCase()}`;

    const account: AccountDoc = {
      ownerId,
      gameUsername,
      serverId,
      status: 'active',
    };
    accountStore[ownerId] = account;
    flushAccountsToDisk();

    const characters = Object.values(characterStore).filter(
      (c) => c.ownerId === ownerId && c.status === 'active'
    );
    res.json({ ok: true, ownerId, account, characters });
  });

  app.post('/api/server-auth/characters', (req, res) => {
    const body = req.body || {};
    const ownerId = String(body.ownerId || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 128);
    if (!ownerId) {
      res.status(400).json({ error: 'Thiếu định danh tài khoản máy chủ.' });
      return;
    }
    const existingActive = Object.values(characterStore).filter(
      (c) => c.ownerId === ownerId && c.status === 'active'
    );
    if (existingActive.length >= 4) {
      res.status(400).json({ error: 'Tài khoản đã đạt tối đa 4 nhân vật.' });
      return;
    }

    const classId: ClassId =
      body.classId === 'esper' || body.classId === 'vanguard' || body.classId === 'evolver'
        ? body.classId
        : 'vanguard';
    const cls = CLASSES_CORE[classId];
    const charId = `char_${ownerId.slice(0, 12)}_${Date.now()}`;
    const created = sanitizeCharacterDoc({
      id: charId,
      ownerId,
      name: String(body.name || 'ChiếnBinh').trim().slice(0, 20) || 'ChiếnBinh',
      classId,
      level: 1,
      exp: 0,
      gold: 2500,
      gems: 15,
      statPoints: 10,
      str: cls.baseStats.str,
      agi: cls.baseStats.agi,
      vit: cls.baseStats.vit,
      ene: cls.baseStats.ene,
      hpPotions: 10,
      mpPotions: 10,
      mapId: CITADEL_MAP_ID,
      hairColor: String(body.hairColor || '#f59e0b'),
      accentColor: String(body.accentColor || '#ef4444'),
      equippedWeapon: 'none',
      equippedArmor: 'none',
      equippedHelm: 'none',
      equippedGloves: 'none',
      equippedPants: 'none',
      equippedBoots: 'none',
      equippedRing: 'none',
      equippedWings: 'none',
      equippedMount: 'none',
      enhanceLevel: 0,
      mounted: false,
      questIndex: 0,
      questProgress: 0,
      skillLevels: [1, 1, 1, 1, 1, 1],
      inventoryIds: [],
      status: 'active',
    });

    characterStore[created.id] = created;
    flushCharactersToDisk();
    res.json({ ok: true, character: created });
  });

  app.post('/api/server-auth/character/save', (req, res) => {
    const body = req.body || {};
    if (body.character && body.character.id) {
      const norm = sanitizeCharacterDoc(body.character);
      characterStore[norm.id] = norm;
      flushCharactersToDisk();
    }
    res.json({ ok: true });
  });

  app.delete('/api/server-auth/characters/:charId', (req, res) => {
    const charId = String(req.params.charId || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 128);
    const ownerId = String(req.query.ownerId || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 128);
    const target = characterStore[charId];
    if (target && (!ownerId || target.ownerId === ownerId)) {
      characterStore[charId] = { ...target, status: 'deleted' };
      flushCharactersToDisk();
    }
    res.json({ ok: true });
  });

  function joinOrResumeSession(
    rawChar: Partial<CharacterDoc>,
    ws: WebSocket | null,
    now: number
  ): ServerPlayerSession {
    const incomingChar = sanitizeCharacterDoc(rawChar);
    const prev = sessions.get(incomingChar.id);
    const persisted = characterStore[incomingChar.id];
    const char = prev ? prev.char : persisted ? sanitizeCharacterDoc(persisted) : incomingChar;
    const ownerKey = char.ownerId || char.id;
    const buffUntil = prev?.buffUntil && prev.buffUntil > now ? prev.buffUntil : 0;
    const stats = computeDerivedStats(char, buffUntil > now);

    if (prev) {
      prev.ws = ws;
      prev.lastSeenAt = now;
      prev.lastSteppedAt = now;
      prev.dirX = 0;
      prev.dirZ = 0;
      prev.vx = 0;
      prev.vz = 0;
      prev.simClientTime = 0;
      prev.teleportSeq += 1;
      prev.hp = Math.max(1, Math.min(stats.maxHp, prev.hp));
      prev.mp = Math.max(0, Math.min(stats.maxMp, prev.mp));
      return prev;
    }

    const startX = 0;
    const startZ = char.mapId === CITADEL_MAP_ID ? 9 : 4;

    const session: ServerPlayerSession = {
      ws,
      id: char.id,
      ownerKey,
      char,
      x: startX,
      z: startZ,
      rotY: Math.PI,
      vx: 0,
      vz: 0,
      dirX: 0,
      dirZ: 0,
      moveTo: null,
      hp: stats.maxHp,
      mp: stats.maxMp,
      action: 'idle',
      actionSeq: 1,
      actionUntil: 0,
      skillIndex: 0,
      comboStage: 1,
      comboResetAt: 0,
      basicReadyAt: 0,
      dodgeReadyAt: 0,
      evadeUntil: 0,
      dashUntil: 0,
      dashVx: 0,
      dashVz: 0,
      skillReadyAt: [0, 0, 0, 0, 0, 0],
      buffUntil,
      burnUntil: 0,
      burnTickAccum: 0,
      burnDmgPerSec: 0,
      freezeUntil: 0,
      shockUntil: 0,
      portalCooldownUntil: now + 1200,
      regenAccum: 0,
      dirtySync: false,
      lastSeenAt: now,
      lastSteppedAt: now,
      lastMovePacketAt: now,
      simClientTime: 0,
      teleportSeq: 1,
      stateSeq: 1,
      outbox: [],
    };

    sessions.set(char.id, session);
    broadcastAll({ type: 'presence:count', onlineCount: sessions.size });
    return session;
  }

  function processSessionCommand(
    s: ServerPlayerSession,
    msg: Record<string, unknown>,
    now: number
  ) {
    s.lastSeenAt = now;

    if (msg.type === 'chat:send') {
      const text = String(msg.text || '').trim().slice(0, 180);
      if (!text) return;
      const channel: 'world' | 'map' = msg.channel === 'map' ? 'map' : 'world';
      const chatItem: ChatMessage = {
        id: `chat_${now}_${Math.random().toString(36).slice(2, 7)}`,
        senderId: s.id,
        senderName: s.char.name,
        senderClass: s.char.classId,
        senderLevel: s.char.level,
        channel,
        mapId: s.char.mapId,
        text,
        timestamp: now,
      };
      chatHistory.push(chatItem);
      if (chatHistory.length > 80) chatHistory.shift();

      if (channel === 'map') {
        broadcastMap(s.char.mapId, { type: 'chat:message', message: chatItem });
      } else {
        broadcastAll({ type: 'chat:message', message: chatItem });
      }
      return;
    }

    const room = mapRooms.get(s.char.mapId);
    if (!room) return;

    // 2. MOVEMENT INTENT COMMANDS (Sub-tick authoritative integration + clientTime ack)
    if (msg.type === 'cmd:input') {
      const wasMoving = Math.hypot(s.dirX, s.dirZ) > 0.04;
      stepSessionMovement(s, now);

      const dx = Number(msg.dirX) || 0;
      const dz = Number(msg.dirZ) || 0;
      const len = Math.hypot(dx, dz);
      const clientTime =
        typeof msg.clientTime === 'number' && Number.isFinite(msg.clientTime)
          ? msg.clientTime
          : 0;

      if (len > 0.04) {
        const scale = Math.min(1, len) / len;
        s.dirX = dx * scale;
        s.dirZ = dz * scale;
        s.moveTo = null;
        s.lastMovePacketAt = now;
        if (clientTime > 0) {
          s.simClientTime = clientTime;
        }
        if (typeof msg.rotY === 'number' && Number.isFinite(msg.rotY) && s.actionUntil <= now) {
          s.rotY = msg.rotY;
        }
        stepSessionMovement(s, now);
      } else {
        s.dirX = 0;
        s.dirZ = 0;
        s.vx = 0;
        s.vz = 0;
        if (clientTime > 0) {
          s.simClientTime = Math.max(s.simClientTime, clientTime);
        }
        stepSessionMovement(s, now);
        if (wasMoving) {
          sendSelfSync(s, now);
        }
      }
      return;
    }

    if (msg.type === 'cmd:move_to') {
      stepSessionMovement(s, now);
      const tx = clampCoord(Number(msg.x) || 0);
      const tz = clampCoord(Number(msg.z) || 0);
      s.dirX = 0;
      s.dirZ = 0;
      s.moveTo = { x: tx, z: tz };
      stepSessionMovement(s, now);
      return;
    }

    // 3. KINETIC DODGE / EVADE DASH
    if (msg.type === 'cmd:dodge') {
      if (now < s.dodgeReadyAt) return;
      stepSessionMovement(s, now);
      s.dodgeReadyAt = now + 2800;
      s.evadeUntil = now + 520;
      s.dashUntil = now + 260;
      s.moveTo = null;

      let dx = Number(msg.dirX) || s.dirX;
      let dz = Number(msg.dirZ) || s.dirZ;
      const len = Math.hypot(dx, dz);
      if (len > 0.08) {
        dx /= len;
        dz /= len;
      } else {
        dx = Math.sin(s.rotY);
        dz = Math.cos(s.rotY);
      }

      s.rotY = Math.atan2(dx, dz);
      s.dashVx = dx * 21.5;
      s.dashVz = dz * 21.5;
      s.vx = s.dashVx;
      s.vz = s.dashVz;
      s.action = 'dash';
      s.actionSeq += 1;
      s.actionUntil = now + 280;

      emitMapVfx(s.char.mapId, {
        kind: 'dash',
        actorId: s.id,
        classId: s.char.classId,
        color: '#38bdf8',
        ox: s.x,
        oz: s.z,
        tx: clampCoord(s.x + dx * 5.2),
        tz: clampCoord(s.z + dz * 5.2),
      });
      sendSelfSync(s, now);
      return;
    }

    // 4. AUTHORITATIVE 3-STAGE BASIC ATTACK
    if (msg.type === 'cmd:attack') {
      if (now < s.basicReadyAt) return;
      stepSessionMovement(s, now);
      const stats = computeDerivedStats(s.char, hasPriestessBuff(s, now));
      const reach = s.char.classId === 'esper' ? 11.0 : 4.6;

      let targetMob: ServerMonsterEntity | undefined;
      if (!room.safeZone) {
        if (typeof msg.targetId === 'string') {
          targetMob = room.monsters.find((m) => m.id === msg.targetId && !m.dead);
        }
        if (!targetMob) {
          let bestD = reach + 2.5;
          for (const m of room.monsters) {
            if (m.dead) continue;
            const d = Math.hypot(m.x - s.x, m.z - s.z);
            if (d < bestD) {
              bestD = d;
              targetMob = m;
            }
          }
        }
        if (targetMob) {
          const dist = Math.hypot(targetMob.x - s.x, targetMob.z - s.z);
          s.rotY = Math.atan2(targetMob.x - s.x, targetMob.z - s.z);
          if (dist > reach) {
            if (Math.hypot(s.dirX, s.dirZ) <= 0.04) {
              s.moveTo = { x: targetMob.x, z: targetMob.z };
            }
            return;
          }
        }
      }

      s.comboStage = 1;
      s.comboResetAt = now + 1500;

      const isFinisher = false;
      const cdSec = Math.max(0.25, 0.66 - stats.atkSpeed * 0.0017) * 0.88; // Use faster attack speed
      s.basicReadyAt = now + Math.round(cdSec * 1000);
      s.action = 'attack_1';
      s.actionSeq += 1;
      s.actionUntil = now + 380;

      if (s.char.classId !== 'esper' && !room.safeZone && Math.hypot(s.dirX, s.dirZ) <= 0.04) {
        const stepDist = isFinisher ? 1.05 : 0.65;
        s.x = clampCoord(s.x + Math.sin(s.rotY) * stepDist);
        s.z = clampCoord(s.z + Math.cos(s.rotY) * stepDist);
      }

      const tx = targetMob ? targetMob.x : s.x + Math.sin(s.rotY) * 2.4;
      const tz = targetMob ? targetMob.z : s.z + Math.cos(s.rotY) * 2.4;

      emitMapVfx(s.char.mapId, {
        kind: 'basic',
        actorId: s.id,
        classId: s.char.classId,
        comboStage: s.comboStage,
        color: CLASSES_CORE[s.char.classId].primaryColor,
        ox: s.x,
        oz: s.z,
        tx: Number(tx.toFixed(2)),
        tz: Number(tz.toFixed(2)),
        radius: isFinisher ? 3.3 : 2.4,
      });

      const comboMult = 1.0;
      applyAuthoritativeAoeDamage(
        s,
        room,
        tx,
        tz,
        2.4, // radius
        comboMult,
        '#f4f4f5',
        now,
        null
      );
      sendSelfSync(s, now);
      return;
    }

    // 5. AUTHORITATIVE CLASS SKILL CAST (1..6)
    if (msg.type === 'cmd:skill') {
      const skillIdx = Math.max(0, Math.min(5, Math.round(Number(msg.skillIndex) || 0)));
      const cls = CLASSES_CORE[s.char.classId];
      const skill = cls.skills[skillIdx];
      if (!skill) return;

      if (s.char.level < skill.unlockLevel) {
        sendSessionToast(s, `Cần đạt Lv.${skill.unlockLevel} để mở khoá kỹ năng này!`, 'rose');
        return;
      }
      if (now < s.skillReadyAt[skillIdx]) return;
      if (s.mp < skill.mpCost) {
        emitMapFloat(s.char.mapId, {
          wx: s.x,
          wy: 2.3,
          wz: s.z,
          text: 'Không đủ Năng Lượng!',
          color: '#38bdf8',
        });
        return;
      }

      stepSessionMovement(s, now);
      const stats = computeDerivedStats(s.char, hasPriestessBuff(s, now));
      s.mp = Math.max(0, s.mp - skill.mpCost);
      s.skillReadyAt[skillIdx] = now + Math.round(skill.cooldown * 1000);

      // ONLY Esper (Dị Năng Giả) Skill 3 (esp_3) provides HP & MP healing to self and nearby team members!
      if (s.char.classId === 'esper' && skillIdx === 2) {
        const healRadius = 8.5;
        for (const p of sessions.values()) {
          if (p.char.mapId === s.char.mapId && Math.hypot(p.x - s.x, p.z - s.z) <= healRadius) {
            const pStats = computeDerivedStats(p.char, hasPriestessBuff(p, now));
            const healHp = Math.round(pStats.maxHp * 0.25);
            const healMp = Math.round(pStats.maxMp * 0.30);
            p.hp = Math.min(pStats.maxHp, p.hp + healHp);
            p.mp = Math.min(pStats.maxMp, p.mp + healMp);
            emitMapFloat(p.char.mapId, {
              wx: p.x,
              wy: 2.5,
              wz: p.z,
              text: `+${healHp} HP / +${healMp} MP (Trị Liệu)`,
              color: '#34d399',
            });
            emitMapVfx(p.char.mapId, {
              kind: 'heal',
              actorId: p.id,
              color: '#34d399',
              ox: p.x,
              oz: p.z,
              tx: p.x,
              tz: p.z,
              radius: 2.8,
            });
            p.dirtySync = true;
          }
        }
      }

      const ox = s.x;
      const oz = s.z;
      let tx =
        typeof msg.targetX === 'number'
          ? clampCoord(msg.targetX)
          : s.x + Math.sin(s.rotY) * Math.min(4.5, skill.range * 0.6);
      let tz =
        typeof msg.targetZ === 'number'
          ? clampCoord(msg.targetZ)
          : s.z + Math.cos(s.rotY) * Math.min(4.5, skill.range * 0.6);

      if (!room.safeZone) {
        let targetMob: ServerMonsterEntity | undefined;
        if (typeof msg.targetId === 'string') {
          targetMob = room.monsters.find((m) => m.id === msg.targetId && !m.dead);
        }
        if (!targetMob) {
          let bestD = skill.range + 3.5;
          for (const m of room.monsters) {
            if (m.dead) continue;
            const d = Math.hypot(m.x - s.x, m.z - s.z);
            if (d < bestD) {
              bestD = d;
              targetMob = m;
            }
          }
        }
        if (targetMob) {
          s.rotY = Math.atan2(targetMob.x - s.x, targetMob.z - s.z);
          if (Math.hypot(targetMob.x - s.x, targetMob.z - s.z) <= skill.range + 2.5) {
            tx = targetMob.x;
            tz = targetMob.z;
          }
        }
      }

      if (
        skill.vfx === 'psionic_blink' ||
        skill.vfx === 'seismic_leap' ||
        skill.vfx === 'phantom_dash'
      ) {
        const dx = tx - ox;
        const dz = tz - oz;
        const dist = Math.hypot(dx, dz);
        const maxBlink = skill.range;
        const clampedDist = Math.min(dist, maxBlink);
        if (dist > 0.1) {
          tx = clampCoord(ox + (dx / dist) * clampedDist);
          tz = clampCoord(oz + (dz / dist) * clampedDist);
        }
        s.x = tx;
        s.z = tz;
        s.teleportSeq += 1;
        s.evadeUntil = Math.max(s.evadeUntil, now + 420);
        s.moveTo = null;
      }

      if (
        skill.vfx === 'whirlwind' ||
        skill.vfx === 'crystal_shield' ||
        skill.vfx === 'titan_aegis' ||
        skill.vfx === 'bio_overdrive'
      ) {
        tx = s.x;
        tz = s.z;
      }

      s.action = 'skill';
      s.skillIndex = skillIdx;
      s.actionSeq += 1;
      s.actionUntil = now + (skillIdx >= 4 ? 1150 : 880);

      emitMapVfx(s.char.mapId, {
        kind: 'skill',
        actorId: s.id,
        classId: s.char.classId,
        skillIndex: skillIdx,
        vfx: skill.vfx,
        color: skill.color,
        ox: Number(ox.toFixed(2)),
        oz: Number(oz.toFixed(2)),
        tx: Number(tx.toFixed(2)),
        tz: Number(tz.toFixed(2)),
        radius: skill.aoeRadius,
      });

      const skillLvl = s.char.skillLevels[skillIdx] || 1;
      const mult = skill.damageMult * (1 + (skillLvl - 1) * 0.12);
      applyAuthoritativeAoeDamage(s, room, tx, tz, skill.aoeRadius, mult, skill.color, now, skillIdx);

      const skillRes = updateDailyQuestProgress(s.char, 'use_skills', 1);
      s.char = skillRes.char;
      if (skillRes.completedTitle) {
        sendSessionToast(s, `Hoàn thành Nhiệm vụ Ngày: ${skillRes.completedTitle}`, 'emerald');
      }

      sendSelfSync(s, now);
      return;
    }

    // 6. LOOT PICKUP COMMAND
    if (msg.type === 'cmd:pickup_loot') {
      const lootId = typeof msg.lootId === 'string' ? msg.lootId : undefined;
      const picked = tryPickupLootForSession(s, room, lootId, 8.8);
      if (picked) {
        sendSelfSync(s, now);
      }
      return;
    }

    // 7. POTIONS & MOUNT
    if (msg.type === 'cmd:use_potion') {
      const stats = computeDerivedStats(s.char, hasPriestessBuff(s, now));
      if (msg.kind === 'hp') {
        if (s.char.hpPotions <= 0) {
          sendSessionToast(
            s,
            'Đã hết Bình Máu! Hãy mua thêm tại Thương Hội (NPC Mira) Hoàng Thành.',
            'rose'
          );
          return;
        }
        s.char = { ...s.char, hpPotions: s.char.hpPotions - 1 };
        const heal = Math.round(stats.maxHp * 0.45);
        s.hp = Math.min(stats.maxHp, s.hp + heal);
        emitMapFloat(s.char.mapId, {
          wx: s.x,
          wy: 2.35,
          wz: s.z,
          text: `+${heal} HP`,
          color: '#fb7185',
        });
      } else {
        if (s.char.mpPotions <= 0) {
          sendSessionToast(
            s,
            'Đã hết Bình Năng Lượng! Hãy mua thêm tại Thương Hội (NPC Mira) Hoàng Thành.',
            'rose'
          );
          return;
        }
        s.char = { ...s.char, mpPotions: s.char.mpPotions - 1 };
        const gain = Math.round(stats.maxMp * 0.5);
        s.mp = Math.min(stats.maxMp, s.mp + gain);
        emitMapFloat(s.char.mapId, {
          wx: s.x,
          wy: 2.35,
          wz: s.z,
          text: `+${gain} MP`,
          color: '#38bdf8',
        });
      }
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:toggle_mount') {
      if (!s.char.equippedMount || s.char.equippedMount === 'none' || !ITEMS_CATALOG[s.char.equippedMount]) {
        sendSessionToast(s, 'Chưa trang bị Thú Cưỡi! Hãy đánh quái nhặt hoặc mua Thú Cưỡi.', 'rose');
        return;
      }
      const nextMounted = !s.char.mounted;
      s.char = { ...s.char, mounted: nextMounted };
      const mountDef = ITEMS_CATALOG[s.char.equippedMount];
      sendSessionToast(
        s,
        nextMounted ? `Triệu hồi ${mountDef?.name || 'Thú Cưỡi'}!` : 'Đã thu hồi Thú Cưỡi',
        'sky'
      );
      sendSelfSync(s, now);
      return;
    }

    // 8. INVENTORY, GEAR & STATS
    if (msg.type === 'cmd:equip_custom_weapon') {
      const slotKey = String(msg.slotKey || '');
      let targetItemId = '';
      for (const [id, item] of Object.entries(ITEMS_CATALOG)) {
        if (item.assetSlotKey === slotKey) {
          targetItemId = id;
          break;
        }
      }
      if (!targetItemId) {
        targetItemId = `wpn_${s.char.classId}_1`;
      }
      s.char = {
        ...s.char,
        equippedWeapon: targetItemId,
      };
      const wpnDef = ITEMS_CATALOG[targetItemId];
      sendSessionToast(
        s,
        `Đã kích hoạt và MẶC VŨ KHÍ 3D [${wpnDef?.name || 'Vũ Khí Mới'}] lên nhân vật!`,
        'emerald'
      );
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:equip_item') {
      const idx = Math.round(Number(msg.invIndex) ?? -1);
      if (idx < 0 || idx >= s.char.inventoryIds.length) return;
      const itemId = s.char.inventoryIds[idx];
      const item = ITEMS_CATALOG[itemId];
      if (!item) return;

      if (item.classReq !== 'all' && item.classReq !== s.char.classId) {
        sendSessionToast(
          s,
          `Trang bị này chỉ dành cho hệ phái ${CLASSES_CORE[item.classReq].name}!`,
          'rose'
        );
        return;
      }
      if (s.char.level < item.levelReq) {
        sendSessionToast(s, `Cần đạt Cấp ${item.levelReq} để trang bị ${item.name}!`, 'rose');
        return;
      }

      const field = EQUIP_SLOT_TO_FIELD[item.slot];
      const curEquipped = String(s.char[field] || '');
      const nextInv = [...s.char.inventoryIds];
      nextInv.splice(idx, 1);
      if (curEquipped && curEquipped !== 'none' && ITEMS_CATALOG[curEquipped]) {
        nextInv.push(curEquipped);
      }

      s.char = {
        ...s.char,
        [field]: item.id,
        mounted: item.slot === 'mount' ? true : s.char.mounted,
        inventoryIds: nextInv,
      };
      sendSessionToast(s, `Đã mặc trang bị: ${item.name}`, 'emerald');
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:unequip_item') {
      const slot = String(msg.slot || '') as EquipSlot;
      const field = EQUIP_SLOT_TO_FIELD[slot];
      if (!field) return;
      const curEquipped = String(s.char[field] || 'none');
      if (!curEquipped || curEquipped === 'none' || !ITEMS_CATALOG[curEquipped]) return;
      if (s.char.inventoryIds.length >= 40) {
        sendSessionToast(s, 'Túi Đồ 40 ô đã đầy, không thể tháo trang bị!', 'rose');
        return;
      }
      const removedItem = ITEMS_CATALOG[curEquipped];
      s.char = {
        ...s.char,
        [field]: 'none',
        mounted: slot === 'mount' ? false : s.char.mounted,
        inventoryIds: [...s.char.inventoryIds, curEquipped],
      };
      sendSessionToast(s, `Đã tháo [${removedItem.name}] cất vào Túi Đồ.`, 'sky');
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:sell_item') {
      const idx = Math.round(Number(msg.invIndex) ?? -1);
      if (idx < 0 || idx >= s.char.inventoryIds.length) return;
      const item = ITEMS_CATALOG[s.char.inventoryIds[idx]];
      const sellGold = item ? Math.max(50, Math.round(item.price * 0.35)) : 50;
      const nextInv = [...s.char.inventoryIds];
      nextInv.splice(idx, 1);
      s.char = {
        ...s.char,
        gold: s.char.gold + sellGold,
        inventoryIds: nextInv,
      };
      sendSessionToast(s, `Đã phân giải trang bị nhận +${sellGold} Tinh Thạch`, 'gold');
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:sort_bag') {
      const sorted = [...s.char.inventoryIds].sort((a, b) => {
        const ia = ITEMS_CATALOG[a];
        const ib = ITEMS_CATALOG[b];
        if (!ia || !ib) return 0;
        const rDiff = (RARITY_ORDER[ib.rarity] || 0) - (RARITY_ORDER[ia.rarity] || 0);
        if (rDiff !== 0) return rDiff;
        return ib.tier - ia.tier;
      });
      s.char = { ...s.char, inventoryIds: sorted };
      sendSessionToast(s, 'Đã sắp xếp Túi Đồ theo Phẩm Chất & Bậc', 'sky');
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:allocate_stat') {
      const stat = msg.stat as 'str' | 'agi' | 'vit' | 'ene';
      if (!['str', 'agi', 'vit', 'ene'].includes(stat)) return;
      const amount = Math.max(1, Math.round(Number(msg.amount) || 1));
      const add = Math.min(amount, s.char.statPoints);
      if (add <= 0) return;

      s.char = {
        ...s.char,
        statPoints: s.char.statPoints - add,
        [stat]: s.char[stat] + add,
      };
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:auto_stats') {
      const pts = s.char.statPoints;
      if (pts <= 0) return;
      let addStr = 0;
      let addAgi = 0;
      let addVit = 0;
      let addEne = 0;

      if (s.char.classId === 'esper') {
        addEne = Math.round(pts * 0.55);
        addVit = Math.round(pts * 0.25);
        addAgi = pts - addEne - addVit;
      } else if (s.char.classId === 'vanguard') {
        addStr = Math.round(pts * 0.55);
        addVit = Math.round(pts * 0.3);
        addAgi = pts - addStr - addVit;
      } else {
        addAgi = Math.round(pts * 0.55);
        addStr = Math.round(pts * 0.25);
        addVit = pts - addAgi - addStr;
      }

      s.char = {
        ...s.char,
        statPoints: 0,
        str: s.char.str + addStr,
        agi: s.char.agi + addAgi,
        vit: s.char.vit + addVit,
        ene: s.char.ene + addEne,
      };
      sendSessionToast(s, `Đã cộng tự động ${pts} điểm tiềm năng chuẩn Hệ Phái!`, 'emerald');
      sendSelfSync(s, now);
      return;
    }

    // 9. CITADEL NPC SERVICES: FORGE, TRAINER, SHOP, HEALER, VAULT, QUEST, TELEPORT
    if (msg.type === 'cmd:reset_stats') {
      const resetCost = 2000;
      if (s.char.gold < resetCost) {
        sendSessionToast(s, `Cần ${resetCost.toLocaleString()} Tinh Thạch để Tẩy Tuỷ chỉ số!`, 'rose');
        return;
      }
      const base = CLASSES_CORE[s.char.classId].baseStats;
      const totalAllocated =
        (s.char.str - base.str) +
        (s.char.agi - base.agi) +
        (s.char.vit - base.vit) +
        (s.char.ene - base.ene);
      const refunded = Math.max((s.char.level - 1) * 5, s.char.statPoints + Math.max(0, totalAllocated));

      s.char = {
        ...s.char,
        gold: s.char.gold - resetCost,
        str: base.str,
        agi: base.agi,
        vit: base.vit,
        ene: base.ene,
        statPoints: refunded,
      };
      emitMapVfx(s.char.mapId, {
        kind: 'buff',
        actorId: s.id,
        color: '#c084fc',
        ox: s.x,
        oz: s.z,
        tx: s.x,
        tz: s.z,
        radius: 3.0,
      });
      sendSessionToast(s, `Tẩy Tuỷ thành công! Đã hoàn lại ${refunded} điểm tiềm năng.`, 'gold');
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:enhance') {
      if (s.char.enhanceLevel >= 15) {
        sendSessionPacket(s, {
          type: 'forge:result',
          ok: false,
          message: 'Toàn bộ trang bị đã đạt cấp Cường Hoá tối đa +15!',
        });
        return;
      }
      const nextLv = s.char.enhanceLevel + 1;
      const goldCost = nextLv * 650;
      const gemCost = nextLv >= 7 ? 2 : 1;
      if (s.char.gold < goldCost || s.char.gems < gemCost) {
        const msgTxt = `Cần ${goldCost.toLocaleString()} Tinh Thạch và ${gemCost} Ngọc Hỗn Nguyên!`;
        sendSessionPacket(s, { type: 'forge:result', ok: false, message: msgTxt });
        sendSessionToast(s, msgTxt, 'rose');
        return;
      }

      const ratePct = nextLv <= 6 ? 100 : nextLv <= 9 ? 82 : nextLv <= 12 ? 65 : 48;
      const success = Math.random() * 100 <= ratePct;

      if (success) {
        s.char = {
          ...s.char,
          gold: s.char.gold - goldCost,
          gems: s.char.gems - gemCost,
          enhanceLevel: nextLv,
        };
        const msgTxt = `Cường hoá THÀNH CÔNG lên +${nextLv}! ${
          nextLv >= 7 ? 'Hào quang 3D trên người đã rực sáng!' : ''
        }`;
        sendSessionPacket(s, { type: 'forge:result', ok: true, message: msgTxt });
        sendSessionToast(s, msgTxt, 'gold');
        emitMapVfx(s.char.mapId, {
          kind: 'buff',
          actorId: s.id,
          color: '#f59e0b',
          ox: s.x,
          oz: s.z,
          tx: s.x,
          tz: s.z,
          radius: 3.2,
        });

        if (nextLv >= 9) {
          const sysChat: ChatMessage = {
            id: `sys_enh_${now}`,
            senderId: 'system',
            senderName: 'Lò Rèn Hoàng Thành',
            senderClass: 'system',
            senderLevel: 500,
            channel: 'system',
            mapId: s.char.mapId,
            text: `Chúc mừng [${s.char.name}] đã cường hoá toàn bộ trang bị đạt cấp +${nextLv} rực rỡ!`,
            timestamp: now,
          };
          chatHistory.push(sysChat);
          broadcastAll({ type: 'chat:message', message: sysChat });
        }
      } else {
        s.char = {
          ...s.char,
          gold: s.char.gold - goldCost,
          gems: s.char.gems - gemCost,
        };
        const msgTxt = `Cường hoá +${nextLv} thất bại! Trang bị được bảo toàn không tụt cấp.`;
        sendSessionPacket(s, { type: 'forge:result', ok: false, message: msgTxt });
        sendSessionToast(s, msgTxt, 'rose');
      }

      const enhRes = updateDailyQuestProgress(s.char, 'enhance_gear', 1);
      s.char = enhRes.char;
      if (enhRes.completedTitle) {
        sendSessionToast(s, `Hoàn thành Nhiệm vụ Ngày: ${enhRes.completedTitle}`, 'emerald');
      }

      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:upgrade_skill') {
      const idx = Math.max(0, Math.min(5, Math.round(Number(msg.skillIndex) || 0)));
      const curLv = s.char.skillLevels[idx] || 1;
      if (curLv >= 20) {
        sendSessionToast(s, 'Kỹ năng đã đạt cấp tối đa (Lv.20)!', 'sky');
        return;
      }
      const cost = curLv * 450;
      if (s.char.gold < cost) {
        sendSessionToast(s, `Cần ${cost.toLocaleString()} Tinh Thạch để nâng cấp kỹ năng!`, 'rose');
        return;
      }
      const nextSkills = [...s.char.skillLevels];
      nextSkills[idx] = curLv + 1;
      s.char = {
        ...s.char,
        gold: s.char.gold - cost,
        skillLevels: nextSkills,
      };
      sendSessionToast(s, `Truyền công thành công: Kỹ năng đạt Cấp ${curLv + 1}!`, 'emerald');
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:buy_item') {
      const itemId = String(msg.itemId || '');
      const item = ITEMS_CATALOG[itemId];
      if (!item) return;
      if (s.char.gold < item.price) {
        sendSessionToast(s, 'Không đủ Tinh Thạch để mua vật phẩm này!', 'rose');
        return;
      }
      if (s.char.inventoryIds.length >= 40) {
        sendSessionToast(s, 'Túi Đồ 40 ô đã đầy!', 'rose');
        return;
      }
      s.char = {
        ...s.char,
        gold: s.char.gold - item.price,
        inventoryIds: [...s.char.inventoryIds, item.id],
      };
      sendSessionToast(s, `Đã mua [${item.name}] từ Thương Hội Hoàng Thành!`, 'emerald');
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:buy_potions') {
      const kind: 'hp' | 'mp' = msg.kind === 'mp' ? 'mp' : 'hp';
      const count = Math.max(1, Math.min(50, Math.round(Number(msg.count) || 5)));
      const cost = count * 20;
      if (s.char.gold < cost) {
        sendSessionToast(s, 'Không đủ Tinh Thạch!', 'rose');
        return;
      }
      s.char = {
        ...s.char,
        gold: s.char.gold - cost,
        hpPotions: kind === 'hp' ? s.char.hpPotions + count : s.char.hpPotions,
        mpPotions: kind === 'mp' ? s.char.mpPotions + count : s.char.mpPotions,
      };
      sendSessionToast(
        s,
        `Đã mua +${count} Bình ${kind === 'hp' ? 'Máu' : 'Năng Lượng'} vào Túi Đồ!`,
        'emerald'
      );
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:healer_restore') {
      const stats = computeDerivedStats(s.char, hasPriestessBuff(s, now));
      s.hp = stats.maxHp;
      s.mp = stats.maxMp;
      s.burnUntil = 0;
      s.freezeUntil = 0;
      s.shockUntil = 0;
      emitMapVfx(s.char.mapId, {
        kind: 'heal',
        actorId: s.id,
        color: '#34d399',
        ox: s.x,
        oz: s.z,
        tx: s.x,
        tz: s.z,
        radius: 3.2,
      });
      emitMapFloat(s.char.mapId, {
        wx: s.x,
        wy: 2.5,
        wz: s.z,
        text: '100% HP & MP',
        color: '#34d399',
        crit: true,
      });
      sendSessionToast(
        s,
        'Đại Tư Tế Seraphina đã trị liệu đầy 100% Sinh Lực & Năng Lượng!',
        'emerald'
      );
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:healer_buff') {
      s.buffUntil = now + 30 * 60 * 1000;
      const stats = computeDerivedStats(s.char, true);
      s.hp = stats.maxHp;
      s.mp = stats.maxMp;
      emitMapVfx(s.char.mapId, {
        kind: 'buff',
        actorId: s.id,
        color: '#fde047',
        ox: s.x,
        oz: s.z,
        tx: s.x,
        tz: s.z,
        radius: 3.8,
      });
      emitMapFloat(s.char.mapId, {
        wx: s.x,
        wy: 2.6,
        wz: s.z,
        text: 'CHÚC PHÚC THÁNH TÍCH (+20% CÔNG/THỦ)',
        color: '#fde047',
        crit: true,
      });
      sendSessionToast(
        s,
        'Nhận Chúc Phúc Hoàng Thành 30 phút: +20% Công/Thủ, +15% Máu, +8% Tốc Chạy!',
        'gold'
      );
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:vault_deposit_item') {
      const invIdx = Math.round(Number(msg.invIndex) ?? -1);
      if (invIdx < 0 || invIdx >= s.char.inventoryIds.length) return;
      const vault = getVaultForOwner(s.ownerKey);
      if (vault.vaultIds.length >= 60) {
        sendSessionToast(s, 'Ngân Khố Hoàng Gia (60 ô) đã đầy!', 'rose');
        return;
      }
      const itemId = s.char.inventoryIds[invIdx];
      const nextInv = [...s.char.inventoryIds];
      nextInv.splice(invIdx, 1);
      vault.vaultIds.push(itemId);
      vaultDirty = true;

      s.char = { ...s.char, inventoryIds: nextInv };
      sendSessionToast(s, `Đã gửi [${ITEMS_CATALOG[itemId]?.name || itemId}] vào Ngân Khố!`, 'sky');
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:vault_withdraw_item') {
      const vIdx = Math.round(Number(msg.vaultIndex) ?? -1);
      const vault = getVaultForOwner(s.ownerKey);
      if (vIdx < 0 || vIdx >= vault.vaultIds.length) return;
      if (s.char.inventoryIds.length >= 40) {
        sendSessionToast(s, 'Túi Đồ cá nhân (40 ô) đã đầy!', 'rose');
        return;
      }
      const itemId = vault.vaultIds[vIdx];
      vault.vaultIds.splice(vIdx, 1);
      vaultDirty = true;

      s.char = {
        ...s.char,
        inventoryIds: [...s.char.inventoryIds, itemId],
      };
      sendSessionToast(s, `Đã rút [${ITEMS_CATALOG[itemId]?.name || itemId}] về Túi Đồ!`, 'emerald');
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:vault_gold') {
      const amount = Math.max(0, Math.round(Number(msg.amount) || 0));
      if (amount <= 0) return;
      const vault = getVaultForOwner(s.ownerKey);
      if (msg.mode === 'deposit') {
        const dep = Math.min(amount, s.char.gold);
        if (dep <= 0) return;
        s.char = { ...s.char, gold: s.char.gold - dep };
        vault.vaultGold += dep;
        vaultDirty = true;
        sendSessionToast(s, `Đã gửi ${dep.toLocaleString()} Tinh Thạch vào Ngân Khố!`, 'gold');
      } else {
        const wit = Math.min(amount, vault.vaultGold);
        if (wit <= 0) return;
        vault.vaultGold -= wit;
        s.char = { ...s.char, gold: s.char.gold + wit };
        vaultDirty = true;
        sendSessionToast(s, `Đã rút ${wit.toLocaleString()} Tinh Thạch từ Ngân Khố!`, 'emerald');
      }
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:claim_quest') {
      const q = QUESTS_DATA[Math.min(s.char.questIndex, QUESTS_DATA.length - 1)];
      if (!q || s.char.questProgress < q.requiredKills) {
        sendSessionToast(s, 'Chưa tiêu diệt đủ số lượng quái nhiệm vụ yêu cầu!', 'rose');
        return;
      }

      let nextLevel = s.char.level;
      let nextExp = s.char.exp + q.rewardExp;
      let nextStatPoints = s.char.statPoints;
      while (nextLevel < 500 && nextExp >= expRequiredForLevel(nextLevel)) {
        nextExp -= expRequiredForLevel(nextLevel);
        nextLevel += 1;
        nextStatPoints += 5;
      }

      const nextInv = [...s.char.inventoryIds];
      if (q.rewardItemId && ITEMS_CATALOG[q.rewardItemId] && nextInv.length < 40) {
        nextInv.push(q.rewardItemId);
      }

      s.char = {
        ...s.char,
        level: nextLevel,
        exp: nextExp,
        statPoints: nextStatPoints,
        gold: s.char.gold + q.rewardGold,
        gems: s.char.gems + q.rewardGems,
        inventoryIds: nextInv,
        questIndex: Math.min(QUESTS_DATA.length - 1, s.char.questIndex + 1),
        questProgress: 0,
      };

      const newStats = computeDerivedStats(s.char, hasPriestessBuff(s, now));
      s.hp = newStats.maxHp;
      s.mp = newStats.maxMp;

      emitMapVfx(s.char.mapId, {
        kind: 'buff',
        actorId: s.id,
        color: '#fbbf24',
        ox: s.x,
        oz: s.z,
        tx: s.x,
        tz: s.z,
        radius: 3.5,
      });
      sendSessionToast(
        s,
        `Hoàn thành Nhiệm Vụ Ch.${q.index + 1}! +${q.rewardGold.toLocaleString()} Tinh Thạch, +${q.rewardGems} Ngọc`,
        'gold'
      );
      sendSelfSync(s, now);
      return;
    }

    if (msg.type === 'cmd:teleport') {
      const targetMapId = Math.max(1, Math.min(32, Math.round(Number(msg.mapId) || 1)));
      teleportSessionToMap(s, targetMapId);
      return;
    }

    if (msg.type === 'cmd:claim_daily_reward') {
      const questId = String(msg.questId || '');
      const daily = generateDailyQuestsForToday(s.char.dailyQuests);
      const quest = daily.quests.find((q) => q.id === questId);

      if (!quest) {
        sendSessionToast(s, 'Nhiệm vụ không tồn tại.', 'rose');
        return;
      }
      if (quest.claimed) {
        sendSessionToast(s, 'Phần thưởng đã được nhận.', 'sky');
        return;
      }
      if (quest.current < quest.target) {
        sendSessionToast(s, 'Chưa hoàn thành mục tiêu nhiệm vụ.', 'rose');
        return;
      }

      const nextInv = [...s.char.inventoryIds];
      let itemMsg = '';
      if (quest.rewardItemId && ITEMS_CATALOG[quest.rewardItemId]) {
        if (nextInv.length < 40) {
          nextInv.push(quest.rewardItemId);
          itemMsg = `, +${ITEMS_CATALOG[quest.rewardItemId].name}`;
        } else {
          sendSessionToast(s, 'Túi đồ đầy! Hãy dọn dẹp trước khi nhận thưởng vật phẩm.', 'rose');
          return;
        }
      }

      const updatedQuests = daily.quests.map((q) =>
        q.id === questId ? { ...q, claimed: true } : q
      );
      s.char = {
        ...s.char,
        gold: s.char.gold + quest.rewardGold,
        gems: s.char.gems + quest.rewardGems,
        inventoryIds: nextInv,
        dailyQuests: { ...daily, quests: updatedQuests },
      };

      sendSessionToast(
        s,
        `Nhận thưởng: +${quest.rewardGold.toLocaleString()} Vàng, +${quest.rewardGems} Ngọc${itemMsg}`,
        'emerald'
      );
      emitMapVfx(s.char.mapId, {
        kind: 'buff',
        actorId: s.id,
        color: '#fbbf24',
        ox: s.x,
        oz: s.z,
        tx: s.x,
        tz: s.z,
        radius: 3.0,
      });
      sendSelfSync(s, now);
      return;
    }
  }

  // Authoritative HTTP Sync Endpoint (Seamless fallback if mobile carrier / proxy blocks WebSocket!)
  app.post('/api/world/sync', (req, res) => {
    try {
      const now = Date.now();
      const body = req.body || {};
      const commands = Array.isArray(body.commands) ? body.commands : [];
      let s: ServerPlayerSession | undefined =
        typeof body.playerId === 'string' ? sessions.get(body.playerId) : undefined;

      if (!s && body.character && typeof body.character === 'object') {
        s = joinOrResumeSession(body.character as Partial<CharacterDoc>, null, now);
        sendSelfSync(s, now);
      }

      if (s) {
        s.lastSeenAt = now;
        for (const cmd of commands) {
          if (cmd && typeof cmd.type === 'string') {
            if (cmd.type === 'cmd:join' && cmd.character) {
              s = joinOrResumeSession(cmd.character as Partial<CharacterDoc>, s.ws, now);
              sendSelfSync(s, now);
            } else {
              processSessionCommand(s, cmd as Record<string, unknown>, now);
            }
          }
        }
      }

      if (!s) {
        res.json({ ok: true, events: [] });
        return;
      }

      const events = s.outbox.splice(0, s.outbox.length);
      const snap = buildMapSnapshotPayload(s, now);
      if (snap) {
        events.push(snap);
      }
      res.json({
        ok: true,
        events,
        bossState: currentWorldBossState,
      });
    } catch {
      res.status(500).json({ ok: false, events: [] });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const meta: ClientSocketMeta = { ws, playerId: null };
    clients.add(meta);

    sendJson(ws, {
      type: 'init:welcome',
      chatHistory: chatHistory.slice(-40),
      onlineCount: sessions.size,
      assetOverrides: Object.values(customAssetManifest),
      bossState: currentWorldBossState,
    });

    ws.on('message', (rawBuf) => {
      try {
        const msg = JSON.parse(String(rawBuf));
        if (!msg || typeof msg.type !== 'string') return;
        const now = Date.now();

        if (msg.type === 'cmd:join' && msg.character) {
          const session = joinOrResumeSession(msg.character, ws, now);
          meta.playerId = session.id;
          // Flush any queued packets accumulated during transient disconnect
          while (session.outbox.length > 0) {
            sendJson(ws, session.outbox.shift());
          }
          sendSelfSync(session, now);
          sendImmediateMapSnapshot(session, now);
          return;
        }

        if (!meta.playerId) return;
        const s = sessions.get(meta.playerId);
        if (!s) return;
        processSessionCommand(s, msg, now);
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      clients.delete(meta);
      if (meta.playerId) {
        const prev = sessions.get(meta.playerId);
        if (prev && prev.ws === ws) {
          // Detach ws & stop joystick vector, but keep session coordinates warm for 30s reconnect!
          prev.ws = null;
          prev.dirX = 0;
          prev.dirZ = 0;
          prev.lastSeenAt = Date.now();
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Tận Thế Kỷ Nguyên 3D Authoritative Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
