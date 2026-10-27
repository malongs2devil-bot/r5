import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  serverTimestamp,
  disableNetwork,
  setLogLevel,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AccountDoc, AssetOverrideDoc, CharacterDoc, ClassId } from './types/game';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
try {
  setLogLevel('silent');
} catch {}
export const auth = getAuth(app);

interface InternalPopupResolver {
  originValidationPromises?: Record<string, Promise<void>>;
  _originValidation?: (authInst: unknown) => Promise<void>;
  _initialize?: (authInst: unknown) => Promise<unknown>;
}

/**
 * Prevents Firebase Auth's client-side _validateOrigin preflight from:
 * 1) Permanently caching a rejected promise after a single transient network hiccup, and
 * 2) Killing an already-opened OAuth popup when mobile browsers suspend background-tab fetches
 *    during popup tab switching (firebaseapp.com/__/auth/handler still enforces domain checks server-side).
 */
function hardenPopupOriginValidation(authInstance: unknown): void {
  const internalAuth = authInstance as {
    _key?: () => string;
    _popupRedirectResolver?: InternalPopupResolver;
  };
  const resolver = internalAuth?._popupRedirectResolver;
  if (!resolver || typeof resolver._originValidation !== 'function') return;

  const origOriginValidation = resolver._originValidation.bind(resolver);
  resolver._originValidation = async (targetAuth: unknown): Promise<void> => {
    try {
      await origOriginValidation(targetAuth);
    } catch (err) {
      const key =
        typeof (targetAuth as { _key?: () => string })?._key === 'function'
          ? (targetAuth as { _key: () => string })._key()
          : undefined;
      if (key && resolver.originValidationPromises) {
        delete resolver.originValidationPromises[key];
      }
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/unauthorized-domain') {
        throw err;
      }
      // Do not abort an open popup or throw uncaught errors on transient client preflight network drops
      return;
    }
  };

  // Proactively warm origin validation while the tab is foregrounded (silently swallowing offline errors)
  if (typeof window !== 'undefined') {
    resolver._originValidation(authInstance).catch(() => {});
  }
}

hardenPopupOriginValidation(auth);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot per Firebase Integration guidelines
export let firestoreBackendAvailable = true;
let connectionChecked = false;

export async function testConnection(): Promise<boolean> {
  if (connectionChecked) return firestoreBackendAvailable;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    firestoreBackendAvailable = true;
  } catch (error: unknown) {
    firestoreBackendAvailable = false;
    const msg = String((error as { message?: string })?.message || '');
    if (
      msg.includes('token-service-api') ||
      msg.includes('offline') ||
      msg.includes('Fetching auth token failed') ||
      msg.includes('the client is offline')
    ) {
      disableNetwork(db).catch(() => {});
    }
  }
  connectionChecked = true;
  return firestoreBackendAvailable;
}
testConnection().catch(() => {});

// Blueprint-synchronized regexes & length guards
export const ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const HEX_REGEX = /^#[0-9a-fA-F]{3,8}$/;

export function sanitizeHandle(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  return cleaned.length >= 3 ? cleaned : `Survivor_${Math.floor(100 + Math.random() * 899)}`;
}

export function sanitizeCharName(raw: string): string {
  const trimmed = raw.trim().slice(0, 20);
  return trimmed.length >= 2 ? trimmed : 'ChiếnBinh';
}

let activePopupPromise: Promise<User> | null = null;

export async function signInWithGooglePopup(): Promise<User> {
  if (activePopupPromise) {
    return activePopupPromise;
  }
  activePopupPromise = signInWithPopup(auth, googleProvider)
    .then((cred) => cred.user)
    .finally(() => {
      activePopupPromise = null;
    });
  return activePopupPromise;
}

export function formatFirebaseAuthError(err: unknown): {
  code: string;
  message: string;
  suggestServerDirect: boolean;
} {
  const code =
    typeof (err as { code?: unknown })?.code === 'string'
      ? String((err as { code: string }).code)
      : '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return {
      code,
      message: 'Cửa sổ đăng nhập Google đã đóng. Bạn có thể thử lại hoặc Vào Trực Tiếp Máy Chủ bên dưới.',
      suggestServerDirect: true,
    };
  }
  if (code === 'auth/popup-blocked') {
    return {
      code,
      message:
        'Trình duyệt đang chặn cửa sổ bật lên (Popup). Hãy cho phép Popup hoặc Vào Trực Tiếp Máy Chủ bên dưới.',
      suggestServerDirect: true,
    };
  }
  if (code === 'auth/network-request-failed') {
    return {
      code,
      message:
        'Kết nối xác thực Google bị gián đoạn mạng hoặc bị trình duyệt chặn. Hãy dùng chế độ Vào Trực Tiếp Máy Chủ bên dưới để chiến ngay!',
      suggestServerDirect: true,
    };
  }
  if (code === 'auth/web-storage-unsupported') {
    return {
      code,
      message:
        'Trình duyệt đang tắt Cookie bên thứ ba cho Popup. Hãy chọn Vào Trực Tiếp Máy Chủ bên dưới.',
      suggestServerDirect: true,
    };
  }
  return {
    code: code || 'auth/unknown',
    message: 'Đăng nhập Google không thành công. Bạn có thể thử lại hoặc Vào Trực Tiếp Máy Chủ.',
    suggestServerDirect: true,
  };
}

export async function signOutAccount(): Promise<void> {
  await fbSignOut(auth);
}

export { onAuthStateChanged };
export type { User };

export async function fetchUserAccount(uid: string): Promise<AccountDoc | null> {
  if (firestoreBackendAvailable) {
    try {
      const snap = await getDoc(doc(db, 'accounts', uid));
      if (snap.exists()) return snap.data() as AccountDoc;
    } catch {
      firestoreBackendAvailable = false;
      disableNetwork(db).catch(() => {});
    }
  }
  try {
    const res = await fetch(`/api/server-auth/bootstrap/${uid}`);
    if (res.ok) {
      const data = await res.json();
      if (data.account) return data.account;
    }
  } catch (srvErr) {
    console.warn('Server auth fallback failed:', srvErr);
  }
  return {
    ownerId: uid,
    gameUsername: `Survivor_${uid.slice(0, 6)}`,
    serverId: 's1',
    status: 'active',
  };
}

export async function registerOrUpdateAccount(
  uid: string,
  gameUsername: string,
  serverId: string,
  isNew: boolean
): Promise<AccountDoc> {
  const cleanHandle = sanitizeHandle(gameUsername);
  const cleanServer = ID_REGEX.test(serverId) ? serverId.slice(0, 32) : 's1';
  if (firestoreBackendAvailable) {
    try {
      if (isNew) {
        await setDoc(doc(db, 'accounts', uid), {
          ownerId: uid,
          gameUsername: cleanHandle,
          serverId: cleanServer,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'accounts', uid), {
          gameUsername: cleanHandle,
          serverId: cleanServer,
          status: 'active',
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      firestoreBackendAvailable = false;
      disableNetwork(db).catch(() => {});
    }
  }
  try {
    await fetch('/api/server-auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: uid, gameUsername: cleanHandle, serverId: cleanServer }),
    });
  } catch {}
  return {
    ownerId: uid,
    gameUsername: cleanHandle,
    serverId: cleanServer,
    status: 'active',
  };
}

function safeInt(val: unknown, fallback: number, min: number, max: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  const clamped = Math.max(min, Math.min(max, Math.round(num)));
  return clamped === 0 ? 0 : clamped;
}

function safeEquipId(val: unknown, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim().slice(0, 48);
  return trimmed.length >= 1 ? trimmed : fallback;
}

function safeHex(val: unknown, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim().slice(0, 9);
  return HEX_REGEX.test(trimmed) ? trimmed : fallback;
}

function defaultWeaponForClass(classId: ClassId): string {
  if (classId === 'esper') return 'wpn_esper_1';
  if (classId === 'evolver') return 'wpn_evolver_1';
  return 'wpn_vanguard_1';
}

function normalizeCharacterDoc(id: string, raw: Partial<CharacterDoc>): CharacterDoc {
  const classId: ClassId =
    raw.classId === 'esper' || raw.classId === 'vanguard' || raw.classId === 'evolver'
      ? raw.classId
      : 'vanguard';

  const rawSkills = Array.isArray(raw.skillLevels) ? raw.skillLevels : [];
  const skillLevels = rawSkills.slice(0, 6).map((v) => safeInt(v, 1, 1, 20));
  while (skillLevels.length < 6) skillLevels.push(1);

  const rawInv = Array.isArray(raw.inventoryIds) ? raw.inventoryIds : [];
  const inventoryIds = rawInv
    .filter((item): item is string => typeof item === 'string' && item.trim().length >= 1 && item.trim().length <= 48)
    .map((item) => item.trim())
    .slice(0, 40);

  return {
    id,
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : '',
    name: sanitizeCharName(typeof raw.name === 'string' ? raw.name : 'ChiếnBinh'),
    classId,
    level: safeInt(raw.level, 1, 1, 500),
    exp: safeInt(raw.exp, 0, 0, 1000000000),
    gold: safeInt(raw.gold, 2500, 0, 1000000000),
    gems: safeInt(raw.gems, 15, 0, 1000000),
    statPoints: safeInt(raw.statPoints, 0, 0, 50000),
    str: safeInt(raw.str, 20, 1, 50000),
    agi: safeInt(raw.agi, 20, 1, 50000),
    vit: safeInt(raw.vit, 20, 1, 50000),
    ene: safeInt(raw.ene, 20, 1, 50000),
    hpPotions: safeInt(raw.hpPotions, 10, 0, 9999),
    mpPotions: safeInt(raw.mpPotions, 10, 0, 9999),
    mapId: safeInt(raw.mapId, 1, 1, 32),
    hairColor: safeHex(raw.hairColor, '#f59e0b'),
    accentColor: safeHex(raw.accentColor, '#f59e0b'),
    equippedWeapon: safeEquipId(raw.equippedWeapon, 'none'),
    equippedArmor: safeEquipId(raw.equippedArmor, 'none'),
    equippedHelm: safeEquipId(raw.equippedHelm, 'none'),
    equippedGloves: safeEquipId(raw.equippedGloves, 'none'),
    equippedPants: safeEquipId(raw.equippedPants, 'none'),
    equippedBoots: safeEquipId(raw.equippedBoots, 'none'),
    equippedRing: safeEquipId(raw.equippedRing, 'none'),
    equippedWings: safeEquipId(raw.equippedWings, 'none'),
    equippedMount: safeEquipId(raw.equippedMount, 'none'),
    enhanceLevel: safeInt(raw.enhanceLevel, 0, 0, 15),
    mounted: Boolean(raw.mounted),
    questIndex: safeInt(raw.questIndex, 0, 0, 200),
    questProgress: safeInt(raw.questProgress, 0, 0, 10000),
    skillLevels,
    inventoryIds,
    status: raw.status === 'deleted' ? 'deleted' : 'active',
  };
}

export function getCharacterSaveSignature(char: CharacterDoc): string {
  const norm = normalizeCharacterDoc(char.id, char);
  return JSON.stringify([
    norm.id,
    norm.level,
    norm.exp,
    norm.gold,
    norm.gems,
    norm.statPoints,
    norm.str,
    norm.agi,
    norm.vit,
    norm.ene,
    norm.hpPotions,
    norm.mpPotions,
    norm.mapId,
    norm.hairColor,
    norm.accentColor,
    norm.equippedWeapon,
    norm.equippedArmor,
    norm.equippedHelm,
    norm.equippedGloves,
    norm.equippedPants,
    norm.equippedBoots,
    norm.equippedRing,
    norm.equippedWings,
    norm.equippedMount,
    norm.enhanceLevel,
    norm.mounted,
    norm.questIndex,
    norm.questProgress,
    norm.skillLevels,
    norm.inventoryIds,
  ]);
}

export async function fetchUserCharacters(uid: string): Promise<CharacterDoc[]> {
  if (firestoreBackendAvailable) {
    try {
      const q = query(collection(db, 'characters'), where('ownerId', '==', uid));
      const snap = await getDocs(q);
      const list: CharacterDoc[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Partial<CharacterDoc>;
        if (data.status === 'active') {
          list.push(normalizeCharacterDoc(docSnap.id, data));
        }
      });
      if (list.length > 0) return list;
    } catch {
      firestoreBackendAvailable = false;
      disableNetwork(db).catch(() => {});
    }
  }
  try {
    const res = await fetch(`/api/server-auth/bootstrap/${uid}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.characters)) {
        return data.characters.map((c: Partial<CharacterDoc>) => normalizeCharacterDoc(c.id || 'char_1', c));
      }
    }
  } catch (srvErr) {
    console.warn('Server characters fallback failed:', srvErr);
  }
  return [];
}

export async function createNewCharacterDoc(params: {
  uid: string;
  name: string;
  classId: ClassId;
  hairColor: string;
  accentColor: string;
  baseStats: { str: number; agi: number; vit: number; ene: number };
  starterWeapon: string;
}): Promise<CharacterDoc> {
  const charId = `char_${params.uid.slice(0, 12)}_${Date.now()}`;
  const cleanName = sanitizeCharName(params.name);
  const cleanHair = safeHex(params.hairColor, '#f59e0b');
  const cleanAccent = safeHex(params.accentColor, '#f59e0b');

  const payload = {
    ownerId: params.uid,
    name: cleanName,
    classId: params.classId,
    level: 1,
    exp: 0,
    gold: 2500,
    gems: 15,
    statPoints: 10,
    str: safeInt(params.baseStats.str, 20, 1, 50000),
    agi: safeInt(params.baseStats.agi, 20, 1, 50000),
    vit: safeInt(params.baseStats.vit, 20, 1, 50000),
    ene: safeInt(params.baseStats.ene, 20, 1, 50000),
    hpPotions: 10,
    mpPotions: 10,
    mapId: 1,
    hairColor: cleanHair,
    accentColor: cleanAccent,
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
    inventoryIds: [] as string[],
    status: 'active' as const,
  };

  if (firestoreBackendAvailable) {
    try {
      await setDoc(doc(db, 'characters', charId), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { id: charId, ...payload };
    } catch {
      firestoreBackendAvailable = false;
      disableNetwork(db).catch(() => {});
    }
  }

  try {
    const res = await fetch('/api/server-auth/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerId: params.uid,
        name: cleanName,
        classId: params.classId,
        hairColor: cleanHair,
        accentColor: cleanAccent,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.character) {
        return normalizeCharacterDoc(data.character.id, data.character);
      }
    }
  } catch {}
  return normalizeCharacterDoc(charId, payload);
}

export async function saveCharacterProgress(char: CharacterDoc): Promise<void> {
  const norm = normalizeCharacterDoc(char.id, char);
  if (firestoreBackendAvailable) {
    try {
      await updateDoc(doc(db, 'characters', norm.id), {
        level: norm.level,
        exp: norm.exp,
        gold: norm.gold,
        gems: norm.gems,
        statPoints: norm.statPoints,
        str: norm.str,
        agi: norm.agi,
        vit: norm.vit,
        ene: norm.ene,
        hpPotions: norm.hpPotions,
        mpPotions: norm.mpPotions,
        mapId: norm.mapId,
        hairColor: norm.hairColor,
        accentColor: norm.accentColor,
        equippedWeapon: norm.equippedWeapon,
        equippedArmor: norm.equippedArmor,
        equippedHelm: norm.equippedHelm,
        equippedGloves: norm.equippedGloves,
        equippedPants: norm.equippedPants,
        equippedBoots: norm.equippedBoots,
        equippedRing: norm.equippedRing,
        equippedWings: norm.equippedWings,
        equippedMount: norm.equippedMount,
        enhanceLevel: norm.enhanceLevel,
        mounted: norm.mounted,
        questIndex: norm.questIndex,
        questProgress: norm.questProgress,
        skillLevels: norm.skillLevels,
        inventoryIds: norm.inventoryIds,
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    } catch {
      firestoreBackendAvailable = false;
      disableNetwork(db).catch(() => {});
    }
  }
  try {
    await fetch('/api/server-auth/character/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ character: norm }),
    });
  } catch {}
}

export async function removeCharacterDoc(charId: string): Promise<void> {
  if (firestoreBackendAvailable) {
    try {
      await updateDoc(doc(db, 'characters', charId), {
        status: 'deleted',
        updatedAt: serverTimestamp(),
      });
    } catch {
      firestoreBackendAvailable = false;
      disableNetwork(db).catch(() => {});
    }
  }
  try {
    await fetch(`/api/server-auth/characters/${charId}`, { method: 'DELETE' });
  } catch {}
}

export async function fetchUserAssetOverrides(uid: string): Promise<AssetOverrideDoc[]> {
  if (firestoreBackendAvailable) {
    try {
      const q = query(collection(db, 'assetOverrides'), where('ownerId', '==', uid));
      const snap = await getDocs(q);
      const list: AssetOverrideDoc[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Omit<AssetOverrideDoc, 'id'>;
        if (data.status === 'active') {
          list.push({ id: docSnap.id, ...data });
        }
      });
      if (list.length > 0) return list;
    } catch {
      firestoreBackendAvailable = false;
      disableNetwork(db).catch(() => {});
    }
  }
  try {
    const res = await fetch('/api/assets/manifest');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.overrides)) {
        return data.overrides;
      }
    }
  } catch {}
  return [];
}

export async function upsertAssetOverrideDoc(params: {
  uid: string;
  slotKey: string;
  label: string;
  modelUrl: string;
  scale: number;
  offsetY: number;
  rotationY: number;
  actions?: Record<string, string>;
  existingId?: string;
}): Promise<AssetOverrideDoc> {
  const cleanSlot = params.slotKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const overrideId = params.existingId || `ov_${params.uid.slice(0, 12)}_${cleanSlot}`;
  const cleanLabel = params.label.trim().slice(0, 80) || cleanSlot;
  const cleanUrl = params.modelUrl.trim().slice(0, 512);
  const scale = Math.max(0.05, Math.min(20, Number(params.scale) || 1));
  const offsetY = Math.max(-10, Math.min(10, Number(params.offsetY) || 0));
  const rotationY = Math.max(-360, Math.min(360, Number(params.rotationY) || 0));
  const actions = params.actions || {};

  if (firestoreBackendAvailable) {
    try {
      if (params.existingId) {
        await updateDoc(doc(db, 'assetOverrides', overrideId), {
          label: cleanLabel,
          modelUrl: cleanUrl,
          scale,
          offsetY,
          rotationY,
          actions,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'assetOverrides', overrideId), {
          ownerId: params.uid,
          slotKey: cleanSlot,
          label: cleanLabel,
          modelUrl: cleanUrl,
          scale,
          offsetY,
          rotationY,
          actions,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      firestoreBackendAvailable = false;
      disableNetwork(db).catch(() => {});
    }
  }

  try {
    await fetch('/api/assets/override', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-email': auth.currentUser?.email || '',
      },
      body: JSON.stringify({
        ownerId: params.uid,
        slotKey: cleanSlot,
        label: cleanLabel,
        modelUrl: cleanUrl,
        scale,
        offsetY,
        rotationY,
        actions,
      }),
    });
  } catch {}

  return {
    id: overrideId,
    ownerId: params.uid,
    slotKey: cleanSlot,
    label: cleanLabel,
    modelUrl: cleanUrl,
    scale,
    offsetY,
    rotationY,
    actions,
    status: 'active',
  };
}

export async function deleteAssetOverrideDoc(overrideId: string, slotKey?: string): Promise<void> {
  if (firestoreBackendAvailable) {
    try {
      await deleteDoc(doc(db, 'assetOverrides', overrideId));
    } catch {
      firestoreBackendAvailable = false;
      disableNetwork(db).catch(() => {});
    }
  }
  try {
    const targetKey = slotKey || overrideId.replace(/^srv_asset_/, '');
    await fetch(`/api/assets/override/${targetKey}`, {
      method: 'DELETE',
      headers: {
        'x-admin-email': auth.currentUser?.email || '',
      },
    });
  } catch {}
}

