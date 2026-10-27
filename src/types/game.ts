export type ClassId = 'esper' | 'vanguard' | 'evolver';

export type EquipSlot =
  | 'weapon'
  | 'helm'
  | 'armor'
  | 'gloves'
  | 'pants'
  | 'boots'
  | 'ring'
  | 'wings'
  | 'mount';

export type ItemRarity = 'common' | 'rare' | 'excellent' | 'legendary' | 'mythic';

export type StatusEffectType = 'burn' | 'freeze' | 'shock';

export interface ActiveStatusEffect {
  type: StatusEffectType;
  remainingSec: number;
  totalSec?: number;
  stacks?: number;
}

export type ActorActionType =
  | 'idle'
  | 'run'
  | 'dash'
  | 'mount'
  | 'attack_1'
  | 'attack_2'
  | 'attack_3'
  | 'skill'
  | 'skill1'
  | 'skill2'
  | 'skill3'
  | 'skill4'
  | 'skill5'
  | 'skill6'
  | 'hit'
  | 'dead';

export interface AccountDoc {
  ownerId: string;
  gameUsername: string;
  serverId: string;
  status: 'active' | 'archived';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type DailyQuestType =
  | 'kill_mobs'
  | 'kill_bosses'
  | 'collect_gold'
  | 'collect_gems'
  | 'use_skills'
  | 'enhance_gear'
  | 'visit_citadel';

export interface DailyQuestObj {
  id: string;
  type: DailyQuestType;
  title: string;
  desc: string;
  current: number;
  target: number;
  rewardGold: number;
  rewardGems: number;
  rewardItemId?: string;
  claimed: boolean;
}

export interface DailyQuestData {
  dateStr: string;
  quests: DailyQuestObj[];
}

export interface CharacterDoc {
  id: string;
  ownerId: string;
  name: string;
  classId: ClassId;
  level: number;
  exp: number;
  gold: number;
  gems: number;
  statPoints: number;
  str: number;
  agi: number;
  vit: number;
  ene: number;
  hpPotions: number;
  mpPotions: number;
  mapId: number;
  hairColor: string;
  accentColor: string;
  equippedWeapon: string;
  equippedArmor: string;
  equippedHelm: string;
  equippedGloves: string;
  equippedPants: string;
  equippedBoots: string;
  equippedRing: string;
  equippedWings: string;
  equippedMount: string;
  enhanceLevel: number;
  mounted: boolean;
  questIndex: number;
  questProgress: number;
  dailyQuests?: DailyQuestData;
  skillLevels: number[];
  inventoryIds: string[];
  status: 'active' | 'deleted';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AssetOverrideDoc {
  id: string;
  ownerId: string;
  slotKey: string;
  label: string;
  modelUrl: string;
  actions?: Record<string, string>;
  skill1?: string;
  skill2?: string;
  skill3?: string;
  skill4?: string;
  skill5?: string;
  skill6?: string;
  sfxMapping?: Record<string, string>;
  uiMapping?: Record<string, string>;
  materialParams?: Record<string, any>;
  scale: number;
  offsetY: number;
  rotationY: number;
  status: 'active' | 'archived';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type SkillVfxType =
  | 'shard_bolt'
  | 'gravity_well'
  | 'crystal_shield'
  | 'solar_beam'
  | 'psionic_blink'
  | 'meteor_storm'
  | 'heavy_cleave'
  | 'heavy_smash'
  | 'whirlwind'
  | 'van_jian_gui_zong'
  | 'titan_aegis'
  | 'seismic_leap'
  | 'molten_eruption'
  | 'judgement_blade'
  | 'twin_fang'
  | 'toxic_mist'
  | 'phantom_dash'
  | 'bio_overdrive'
  | 'acid_vortex'
  | 'razor_tempest'
  | 'apex_predator';

export interface SkillDef {
  id: string;
  index: number;
  name: string;
  description: string;
  cooldown: number;
  mpCost: number;
  damageMult: number;
  range: number;
  aoeRadius: number;
  color: string;
  vfx: SkillVfxType;
  unlockLevel: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  title: string;
  role: string;
  weaponType: string;
  description: string;
  portraitUrl: string;
  primaryColor: string;
  secondaryColor: string;
  baseStats: {
    str: number;
    agi: number;
    vit: number;
    ene: number;
  };
  skills: SkillDef[];
}

export interface ItemDef {
  id: string;
  name: string;
  slot: EquipSlot;
  classReq: ClassId | 'all';
  tier: number;
  levelReq: number;
  rarity: ItemRarity;
  atk: number;
  def: number;
  hp: number;
  mp: number;
  critPct: number;
  moveSpdPct: number;
  price: number;
  primaryColor: string;
  glowColor: string;
  meshStyle: string;
  assetSlotKey: string;
  description: string;
}

export type BiomeType =
  | 'imperial_citadel'
  | 'ruined_city'
  | 'industrial_refinery'
  | 'toxic_marsh'
  | 'permafrost'
  | 'broken_spire'
  | 'iron_desert'
  | 'submerged_atlans'
  | 'sky_icarus'
  | 'magma_rift'
  | 'void_singularity';

export interface MapDef {
  id: number;
  code: string;
  name: string;
  region: string;
  minLevel: number;
  maxLevel: number;
  biome: BiomeType;
  safeZone: boolean;
  skyColor: string;
  fogColor: string;
  groundColor: string;
  accentColor: string;
  fogDensity?: number;
  mobName: string;
  mobAssetSlot: string;
  mobStyle: 'mutant' | 'mecha' | 'hound' | 'wraith' | 'golem';
  bossName: string;
  bossAssetSlot: string;
  dropTier: number;
  description: string;
}

export type NpcActionType =
  | 'quest'
  | 'forge'
  | 'shop'
  | 'healer'
  | 'vault'
  | 'trainer'
  | 'teleport'
  | 'assets';

export type NpcStationStyle =
  | 'palace'
  | 'forge'
  | 'market'
  | 'sanctuary'
  | 'vault'
  | 'academy'
  | 'workshop'
  | 'stargate';

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  x: number;
  z: number;
  rotY: number;
  accentColor: string;
  action: NpcActionType;
  stationStyle: NpcStationStyle;
  assetSlotKey: string;
  greeting: string;
}

export interface QuestDef {
  index: number;
  title: string;
  npcName: string;
  targetMapId: number;
  targetMobName: string;
  requiredKills: number;
  rewardExp: number;
  rewardGold: number;
  rewardGems: number;
  rewardItemId?: string;
  description: string;
}

export interface DerivedStats {
  combatPower: number;
  maxHp: number;
  maxMp: number;
  atkMin: number;
  atkMax: number;
  defense: number;
  critRate: number;
  critDmg: number;
  atkSpeed: number;
  evasion: number;
  moveSpeed: number;
  setBonusLabel: string;
}

export interface RemotePlayer {
  id: string;
  name: string;
  classId: ClassId;
  level: number;
  mapId: number;
  x: number;
  z: number;
  vx?: number;
  vz?: number;
  rotY: number;
  hairColor: string;
  accentColor: string;
  equippedWeapon: string;
  equippedArmor: string;
  equippedHelm: string;
  equippedWings: string;
  equippedMount: string;
  enhanceLevel: number;
  mounted: boolean;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  action: ActorActionType;
  actionSeq: number;
  skillIndex?: number;
  targetX?: number;
  targetZ?: number;
  buffActive?: boolean;
  statuses?: ActiveStatusEffect[];
  ackTime?: number;
  teleportSeq?: number;
  stateSeq?: number;
}

export interface ServerMonsterSnapshot {
  id: string;
  name: string;
  isBoss: boolean;
  level: number;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
  rotY: number;
  style: 'mutant' | 'mecha' | 'hound' | 'wraith' | 'golem';
  assetSlot: string;
  accentColor: string;
  action: 'idle' | 'patrol' | 'chase' | 'attack' | 'hit' | 'dead';
  actionSeq: number;
  dead: boolean;
  statuses?: ActiveStatusEffect[];
}

export interface ServerLootSnapshot {
  id: string;
  x: number;
  z: number;
  itemId?: string;
  gold?: number;
  gems?: number;
  label: string;
  color: string;
}

export interface ServerCombatVfxEvent {
  id: string;
  kind: 'basic' | 'skill' | 'dash' | 'mob_attack' | 'heal' | 'buff';
  actorId: string;
  classId?: ClassId;
  comboStage?: 1 | 2 | 3;
  skillIndex?: number;
  vfx?: SkillVfxType;
  color: string;
  ox: number;
  oz: number;
  tx: number;
  tz: number;
  radius?: number;
}

export interface ServerFloatingEvent {
  id: string;
  wx: number;
  wy: number;
  wz: number;
  text: string;
  color: string;
  crit?: boolean;
}

export interface AuthoritativeVaultState {
  vaultIds: string[];
  vaultGold: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderClass: string;
  senderLevel: number;
  channel: 'world' | 'map' | 'system';
  mapId: number;
  text: string;
  timestamp: number;
}

export interface FloatingTextEvent {
  id: number;
  text: string;
  color: string;
  crit?: boolean;
  screenX: number;
  screenY: number;
}

export interface ServerWorldBossState {
  active: boolean;
  bossName: string;
  mapId: number;
  mapName: string;
  mapCode: string;
  hp: number;
  maxHp: number;
  nextSpawnTime: number;
  spawnCountdownSec: number;
}

export interface ServerWorldBossEvent {
  type: 'world:boss_event';
  bossState: ServerWorldBossState;
}


export interface ServerMonsterEntity extends ServerMonsterSnapshot {
  atk: number;
  homeX: number;
  homeZ: number;
  attackTimer: number;
  respawnTimer: number;
  recoilTimer: number;
  knockVx: number;
  knockVz: number;
  burnUntil: number;
  burnTickAccum: number;
  burnDmgPerSec: number;
  burnOwnerId: string;
  freezeUntil: number;
  shockUntil: number;
}

export interface MapRoom {
  mapId: number;
  safeZone: boolean;
  monsters: ServerMonsterEntity[];
  loots: ServerLootSnapshot[];
}

export interface ServerPlayerSession {
  ws: any; // Using any to avoid ws dependency in frontend
  id: string;
  ownerKey: string;
  char: CharacterDoc;
  x: number;
  z: number;
  vx: number;
  vz: number;
  rotY: number;
  dirX: number;
  dirZ: number;
  moveTo: { x: number; z: number } | null;
  hp: number;
  mp: number;
  action: ActorActionType;
  actionSeq: number;
  actionUntil: number;
  skillIndex: number;
  comboStage: 1 | 2 | 3;
  comboResetAt: number;
  basicReadyAt: number;
  dodgeReadyAt: number;
  evadeUntil: number;
  dashUntil: number;
  dashVx: number;
  dashVz: number;
  skillReadyAt: number[];
  buffUntil: number;
  burnUntil: number;
  burnTickAccum: number;
  burnDmgPerSec: number;
  freezeUntil: number;
  shockUntil: number;
  portalCooldownUntil: number;
  regenAccum: number;
  dirtySync: boolean;
  lastSeenAt: number;
  lastSteppedAt: number;
  lastMovePacketAt: number;
  simClientTime: number;
  teleportSeq: number;
  stateSeq: number;
  outbox: any[];
}

export interface ClientSocketMeta {
  ws: any;
  playerId: string | null;
}
