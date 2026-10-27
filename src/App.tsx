import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccountDoc,
  ActiveStatusEffect,
  AssetOverrideDoc,
  AuthoritativeVaultState,
  CharacterDoc,
  ChatMessage,
  ClassId,
  EquipSlot,
  FloatingTextEvent,
  ItemDef,
  NpcDef,
  RemotePlayer,
  ServerCombatVfxEvent,
  ServerFloatingEvent,
  ServerLootSnapshot,
  ServerMonsterSnapshot,
  ServerWorldBossState,
} from './types/game';

import {
  CITADEL_MAP_ID,
  CLASSES_DATA,
  computeDerivedStats,
  FIRST_HUNTING_MAP_ID,
  MAPS_DATA,
  QUESTS_DATA,
} from './data/gameData';
import {
  auth,
  createNewCharacterDoc,
  deleteAssetOverrideDoc,
  fetchUserAccount,
  fetchUserAssetOverrides,
  fetchUserCharacters,
  formatFirebaseAuthError,
  getCharacterSaveSignature,
  onAuthStateChanged,
  registerOrUpdateAccount,
  removeCharacterDoc,
  saveCharacterProgress,
  signInWithGooglePopup,
  signOutAccount,
  upsertAssetOverrideDoc,
  User,
} from './firebase';
import { assetRegistry } from './engine/AssetRegistry';
import { soundFX } from './engine/SoundFX';
import {
  ActiveMonsterInfo,
  AuthoritativeSelfPose,
  MinimapEntityDot,
  OverheadLabelItem,
  WorldCanvas3D,
  WorldControllerHandle,
} from './engine/WorldCanvas3D';
import { useTouchScrollBooster } from './engine/useTouchScrollBooster';
import { AuthGateScreen } from './components/AuthGateScreen';
import { CharacterSelectCreate } from './components/CharacterSelectCreate';
import { LandscapeHUD } from './components/LandscapeHUD';
import { InventoryPaperdollModal } from './components/InventoryPaperdollModal';
import { SkillsModal } from './components/SkillsModal';
import { WorldMapModal } from './components/WorldMapModal';
import { NpcShopQuestModal } from './components/NpcShopQuestModal';
import { AssetStudioModal } from './components/AssetStudioModal';
import { DailyQuestModal } from './components/DailyQuestModal';
import { generateDailyQuestsForToday } from './shared/universeData';

type AppStage = 'gate' | 'char_select' | 'world';
type ActiveModal =
  | 'none'
  | 'paperdoll_bag'
  | 'paperdoll_stats'
  | 'paperdoll_forge'
  | 'skills'
  | 'world_map'
  | 'npc'
  | 'asset_studio'
  | 'daily_quests';

const ADMIN_EMAIL = 'thongtruongzhz@gmail.com';
const CAMERA_PRESET_LABELS = ['Chuẩn', 'Cận Cảnh', 'Toàn Cảnh', 'Góc Cao'] as const;

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [serverOwnerId, setServerOwnerId] = useState<string | null>(null);
  const serverOwnerRef = useRef<string | null>(null);
  const [account, setAccount] = useState<AccountDoc | null>(null);
  const [characters, setCharacters] = useState<CharacterDoc[]>([]);
  const [activeChar, setActiveChar] = useState<CharacterDoc | null>(null);
  const [assetOverrides, setAssetOverrides] = useState<AssetOverrideDoc[]>([]);

  const [stage, setStage] = useState<AppStage>('gate');
  const [busyLoading, setBusyLoading] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  // Authoritative server-synced runtime states
  const [hp, setHp] = useState(500);
  const [mp, setMp] = useState(200);
  const [playerStatuses, setPlayerStatuses] = useState<ActiveStatusEffect[]>([]);
  const [fpsStats, setFpsStats] = useState<{ fps: number; frameMs: number }>({
    fps: 60,
    frameMs: 16.7,
  });
  const [camPresetIdx, setCamPresetIdx] = useState<number>(0);
  const [buffRemainingSec, setBuffRemainingSec] = useState(0);
  const isAdmin = firebaseUser?.email === ADMIN_EMAIL;
  const [vaultState, setVaultState] = useState<AuthoritativeVaultState>({
    vaultGold: 0,
    vaultIds: [],
  });
  const [forgeNotice, setForgeNotice] = useState<string | null>(null);

  const [autoBattle, setAutoBattle] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>('none');
  const [interactingNpc, setInteractingNpc] = useState<NpcDef | null>(null);

  const [activeTarget, setActiveTarget] = useState<ActiveMonsterInfo | null>(null);
  const [playerCoords, setPlayerCoords] = useState<{ x: number; z: number }>({ x: 0, z: 9 });
  const [minimapDots, setMinimapDots] = useState<MinimapEntityDot[]>([]);
  const [overheadLabels, setOverheadLabels] = useState<OverheadLabelItem[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingTextEvent[]>([]);
  const [lootCountNearby, setLootCountNearby] = useState(0);
  const [skillCooldowns, setSkillCooldowns] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [dodgeCooldown, setDodgeCooldown] = useState<number>(0);
  const [comboStage, setComboStage] = useState<1 | 2 | 3>(1);
  const [onlineCount, setOnlineCount] = useState(1);
  const [worldBossState, setWorldBossState] = useState<ServerWorldBossState | undefined>(undefined);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [toastBanner, setToastBanner] = useState<{
    text: string;
    tone: 'gold' | 'emerald' | 'rose' | 'sky';
  } | null>(null);


  // Fullscreen & universal mobile landscape viewport state
  const [winSize, setWinSize] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));
  const [autoRotatePortrait, setAutoRotatePortrait] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const updateViewport = () => {
      const vv = window.visualViewport;
      setWinSize({
        w: Math.round(vv ? vv.width : window.innerWidth),
        h: Math.round(vv ? vv.height : window.innerHeight),
      });
    };
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      updateViewport();
    };
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, []);

  const isPortraitDevice = winSize.w < winSize.h && winSize.w < 760;
  const isRotatedPortrait = isPortraitDevice && autoRotatePortrait;
  const layoutWidth = Math.max(320, isRotatedPortrait ? winSize.h : winSize.w);
  const layoutHeight = Math.max(240, isRotatedPortrait ? winSize.w : winSize.h);
  // Proportional Virtual Canvas Scaler (Reference: 980x520 landscape)
  const uiScale = Math.max(
    0.46,
    Math.min(1.38, Math.min(layoutWidth / 980, layoutHeight / 520))
  );
  const virtualWidth = Math.round(layoutWidth / uiScale);
  const virtualHeight = Math.round(layoutHeight / uiScale);

  useTouchScrollBooster(isRotatedPortrait, uiScale);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        const orient = screen.orientation as ScreenOrientation & {
          lock?: (mode: string) => Promise<void>;
        };
        if (orient && typeof orient.lock === 'function') {
          orient.lock('landscape').catch(() => {});
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if iframe/browser blocks Fullscreen API
    }
  }, []);

  // Authoritative Refs shared between WebSocket & 3D Renderer
  const joystickVecRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const serverSelfRef = useRef<AuthoritativeSelfPose>({
    mapId: CITADEL_MAP_ID,
    x: 0,
    z: 9,
    vx: 0,
    vz: 0,
    rotY: Math.PI,
    action: 'idle',
    actionSeq: 0,
    ackTime: 0,
    teleportSeq: 0,
    stateSeq: 0,
    synced: false,
  });
  const remotePlayersRef = useRef<Map<string, RemotePlayer>>(new Map());
  const serverMonstersRef = useRef<Map<string, ServerMonsterSnapshot>>(new Map());
  const serverLootsRef = useRef<Map<string, ServerLootSnapshot>>(new Map());
  const worldControlRef = useRef<WorldControllerHandle | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingHttpCmdsRef = useRef<Record<string, unknown>[]>([]);
  const httpSyncInFlightRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);
  const activeCharRef = useRef<CharacterDoc | null>(null);
  const lastSavedSigRef = useRef<string>('');
  const pendingNpcWalkRef = useRef<string | null>(null);

  const showToast = useCallback(
    (text: string, tone: 'gold' | 'emerald' | 'rose' | 'sky' = 'gold') => {
      setToastBanner({ text, tone });
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        setToastBanner(null);
      }, 3200);
    },
    []
  );

  const derivedStats = useMemo(() => {
    if (!activeChar) {
      return {
        combatPower: 0,
        maxHp: 500,
        maxMp: 200,
        atkMin: 10,
        atkMax: 15,
        defense: 10,
        critRate: 5,
        critDmg: 150,
        atkSpeed: 100,
        evasion: 10,
        moveSpeed: 100,
        setBonusLabel: '',
      };
    }
    return computeDerivedStats(activeChar, buffRemainingSec > 0);
  }, [activeChar, buffRemainingSec]);

  useEffect(() => {
    activeCharRef.current = activeChar;
  }, [activeChar]);

  // Turn off autoBattle automatically whenever entering Safe Zone Citadel (Map 1)
  useEffect(() => {
    if (activeChar?.mapId === CITADEL_MAP_ID && autoBattle) {
      setAutoBattle(false);
    }
  }, [activeChar?.mapId, autoBattle]);

  // 0. Fetch Server-Synchronized Custom Assets Manifest on Boot
  useEffect(() => {
    fetch('/api/assets/manifest')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (data && Array.isArray(data.overrides)) {
          await assetRegistry.mergeServerManifest(data.overrides);
          setAssetOverrides((prev) => {
            const bySlot = new Map<string, AssetOverrideDoc>();
            prev.forEach((o) => bySlot.set(o.slotKey, o));
            data.overrides.forEach((o: AssetOverrideDoc) => bySlot.set(o.slotKey, o));
            return Array.from(bySlot.values());
          });
        }
      })
      .catch(() => {});
  }, []);

  // 1. Firebase Auth & Account Bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setGateError(null);
      if (!user) {
        if (!serverOwnerRef.current) {
          setAccount(null);
          setCharacters([]);
          setActiveChar(null);
          setStage('gate');
        }
        setAuthReady(true);
        return;
      }

      serverOwnerRef.current = null;
      setServerOwnerId(null);
      setBusyLoading(true);
      try {
        const [acc, chars, userOverrides, srvManifestResp] = await Promise.all([
          fetchUserAccount(user.uid),
          fetchUserCharacters(user.uid),
          fetchUserAssetOverrides(user.uid),
          fetch('/api/assets/manifest')
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);
        setAccount(acc);
        setCharacters(chars);

        const mergedMap = new Map<string, AssetOverrideDoc>();
        userOverrides.forEach((o) => mergedMap.set(o.slotKey, o));
        if (srvManifestResp && Array.isArray(srvManifestResp.overrides)) {
          srvManifestResp.overrides.forEach((o: AssetOverrideDoc) =>
            mergedMap.set(o.slotKey, o)
          );
        }
        const mergedList = Array.from(mergedMap.values());
        setAssetOverrides(mergedList);
        await assetRegistry.syncOverrides(mergedList);
      } catch {
        setGateError('Không thể tải dữ liệu tài khoản đám mây. Bạn có thể thử lại hoặc Vào Trực Tiếp Máy Chủ.');
      } finally {
        setBusyLoading(false);
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  // 2. Smooth 10Hz UI Cooldown & Buff Countdown Interpolation (Server resets/authorizes on self:sync)
  useEffect(() => {
    if (stage !== 'world') return;
    const timer = window.setInterval(() => {
      setSkillCooldowns((prev) => {
        let changed = false;
        const next = prev.map((v) => {
          if (v <= 0) return 0;
          changed = true;
          return Math.max(0, Number((v - 0.1).toFixed(1)));
        });
        return changed ? next : prev;
      });
      setDodgeCooldown((prev) =>
        prev <= 0 ? 0 : Math.max(0, Number((prev - 0.1).toFixed(1)))
      );
    }, 100);

    const secTimer = window.setInterval(() => {
      setBuffRemainingSec((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);

    return () => {
      window.clearInterval(timer);
      window.clearInterval(secTimer);
    };
  }, [stage]);

  // 3. Debounced Firestore Persistence of Server-Authoritative Character State
  useEffect(() => {
    if (!activeChar || stage !== 'world') return;
    setCharacters((prev) =>
      prev.map((c) => (c.id === activeChar.id ? activeChar : c))
    );
    if (!firebaseUser) return;
    const nextSig = getCharacterSaveSignature(activeChar);
    if (nextSig === lastSavedSigRef.current) return;

    const saveTimer = window.setTimeout(() => {
      saveCharacterProgress(activeChar)
        .then(() => {
          lastSavedSigRef.current = nextSig;
        })
        .catch(() => {});
    }, 1500);
    return () => window.clearTimeout(saveTimer);
  }, [activeChar, stage, firebaseUser]);

  // 4. Thin-Client Command Sender & Authoritative WebSocket + HTTP Fallback Stream
  const sendCmd = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return;
    }
    const queue = pendingHttpCmdsRef.current;
    if (
      payload.type === 'cmd:input' &&
      queue.length > 0 &&
      queue[queue.length - 1].type === 'cmd:input'
    ) {
      queue[queue.length - 1] = payload;
    } else {
      queue.push(payload);
      if (queue.length > 48) {
        queue.shift();
      }
    }
  }, []);

  const applyServerMessage = useCallback(
    (msg: Record<string, unknown>) => {
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'init:welcome') {
        if (Array.isArray(msg.chatHistory)) {
          setChatMessages(msg.chatHistory as ChatMessage[]);
        }
        if (typeof msg.onlineCount === 'number') {
          setOnlineCount(msg.onlineCount);
        }
        if (msg.bossState) {
          setWorldBossState(msg.bossState as ServerWorldBossState);
        }
        if (Array.isArray(msg.assetOverrides) && msg.assetOverrides.length > 0) {
          const incoming = msg.assetOverrides as AssetOverrideDoc[];
          assetRegistry.mergeServerManifest(incoming).catch(() => {});
          setAssetOverrides((prev) => {
            const map = new Map<string, AssetOverrideDoc>();
            prev.forEach((o) => map.set(o.slotKey, o));
            incoming.forEach((o) => map.set(o.slotKey, o));
            return Array.from(map.values());
          });
        }
      } else if (msg.type === 'world:boss_event' && msg.bossState) {
        setWorldBossState(msg.bossState as ServerWorldBossState);
      } else if (msg.type === 'assets:manifest' && Array.isArray(msg.overrides)) {
        const incoming = msg.overrides as AssetOverrideDoc[];
        assetRegistry.mergeServerManifest(incoming).catch(() => {});
        setAssetOverrides(incoming);
      } else if (msg.type === 'presence:count') {
        setOnlineCount(Number(msg.onlineCount) || 1);
      } else if (msg.type === 'self:sync' && msg.char) {
        const rawChar = msg.char as CharacterDoc;
        const srvChar: CharacterDoc = {
          ...rawChar,
          dailyQuests: generateDailyQuestsForToday(rawChar.dailyQuests),
        };
        const prevLv = activeCharRef.current?.level ?? srvChar.level;
        const prevInvLen =
          activeCharRef.current?.inventoryIds.length ?? srvChar.inventoryIds.length;
        if (srvChar.level > prevLv) {
          soundFX.playLevelUp();
        } else if (srvChar.inventoryIds.length > prevInvLen) {
          soundFX.playLoot();
        }

        activeCharRef.current = srvChar;
        setActiveChar(srvChar);

        if (typeof msg.hp === 'number') setHp(msg.hp);
        if (typeof msg.mp === 'number') setMp(msg.mp);
        if (typeof msg.x === 'number' && typeof msg.z === 'number') {
          const cur = serverSelfRef.current;
          const incomingSeq = typeof msg.stateSeq === 'number' ? msg.stateSeq : 0;
          const isNewerOrMapChange =
            !cur.synced ||
            cur.mapId !== srvChar.mapId ||
            incomingSeq === 0 ||
            incomingSeq >= (cur.stateSeq || 0);

          if (isNewerOrMapChange) {
            const nextStatuses = Array.isArray(msg.statuses)
              ? (msg.statuses as ActiveStatusEffect[])
              : srvChar.mapId === CITADEL_MAP_ID
              ? []
              : cur.statuses || [];
            serverSelfRef.current = {
              mapId: srvChar.mapId,
              x: msg.x,
              z: msg.z,
              vx: typeof msg.vx === 'number' ? msg.vx : cur.vx ?? 0,
              vz: typeof msg.vz === 'number' ? msg.vz : cur.vz ?? 0,
              rotY: typeof msg.rotY === 'number' ? msg.rotY : cur.rotY,
              action:
                typeof msg.action === 'string'
                  ? (msg.action as AuthoritativeSelfPose['action'])
                  : cur.action || 'idle',
              actionSeq:
                typeof msg.actionSeq === 'number' ? msg.actionSeq : cur.actionSeq || 0,
              skillIndex:
                typeof msg.skillIndex === 'number' ? msg.skillIndex : cur.skillIndex,
              ackTime:
                typeof msg.ackTime === 'number'
                  ? Math.max(cur.ackTime || 0, msg.ackTime)
                  : cur.ackTime || 0,
              teleportSeq:
                typeof msg.teleportSeq === 'number'
                  ? msg.teleportSeq
                  : cur.teleportSeq || 0,
              stateSeq: incomingSeq || cur.stateSeq || 0,
              synced: true,
              statuses: nextStatuses,
              lastSyncAt: performance.now(),
            };
          }
        }
        if (srvChar.mapId === CITADEL_MAP_ID) {
          serverSelfRef.current.statuses = [];
          setPlayerStatuses([]);
        }
        if (msg.comboStage === 1 || msg.comboStage === 2 || msg.comboStage === 3) {
          setComboStage(msg.comboStage);
        }
        if (Array.isArray(msg.skillCooldowns)) {
          setSkillCooldowns(msg.skillCooldowns as number[]);
        }
        if (typeof msg.dodgeCooldown === 'number') {
          setDodgeCooldown(msg.dodgeCooldown);
        }
        if (typeof msg.buffRemainingSec === 'number') {
          setBuffRemainingSec(msg.buffRemainingSec);
        }
        if (
          msg.vault &&
          typeof msg.vault === 'object' &&
          Array.isArray((msg.vault as AuthoritativeVaultState).vaultIds)
        ) {
          setVaultState(msg.vault as AuthoritativeVaultState);
        }

        // If we just teleported back to Citadel to visit a specific NPC, auto-walk to them
        if (srvChar.mapId === CITADEL_MAP_ID && pendingNpcWalkRef.current) {
          const targetNpcId = pendingNpcWalkRef.current;
          pendingNpcWalkRef.current = null;
          window.setTimeout(() => {
            worldControlRef.current?.navigateToNpc(targetNpcId);
          }, 120);
        }
      } else if (msg.type === 'world:snapshot') {
        const snapMapId = Number(msg.mapId) || CITADEL_MAP_ID;
        if (activeCharRef.current && snapMapId !== activeCharRef.current.mapId) {
          return;
        }

        // Sync players on this map (including authoritative self velocity, action, ackTime & status effects)
        if (Array.isArray(msg.players)) {
          const seenPeerIds = new Set<string>();
          for (const p of msg.players as RemotePlayer[]) {
            if (p.id === activeCharRef.current?.id) {
              const cur = serverSelfRef.current;
              const pSeq = typeof p.stateSeq === 'number' ? p.stateSeq : 0;
              const isNewerOrMapChange =
                !cur.synced ||
                cur.mapId !== snapMapId ||
                pSeq === 0 ||
                pSeq >= (cur.stateSeq || 0);

              const nextStatuses = p.statuses || [];
              if (isNewerOrMapChange) {
                serverSelfRef.current = {
                  mapId: snapMapId,
                  x: p.x,
                  z: p.z,
                  vx: p.vx ?? 0,
                  vz: p.vz ?? 0,
                  rotY: p.rotY,
                  action: p.action || 'idle',
                  actionSeq: p.actionSeq || 0,
                  skillIndex: p.skillIndex,
                  ackTime: Math.max(cur.ackTime || 0, p.ackTime || 0),
                  teleportSeq: p.teleportSeq ?? cur.teleportSeq ?? 0,
                  stateSeq: pSeq || cur.stateSeq || 0,
                  synced: true,
                  statuses: nextStatuses,
                  lastSyncAt: performance.now(),
                };
              }
              setHp(p.hp);
              if (typeof p.mp === 'number') {
                setMp(p.mp);
              }
              setPlayerStatuses((prev) => {
                if (prev.length === 0 && nextStatuses.length === 0) return prev;
                return nextStatuses;
              });
            } else {
              seenPeerIds.add(p.id);
              const existingPeer = remotePlayersRef.current.get(p.id);
              if (
                !existingPeer ||
                existingPeer.mapId !== p.mapId ||
                (p.stateSeq || 0) >= (existingPeer.stateSeq || 0)
              ) {
                remotePlayersRef.current.set(p.id, p);
              }
            }
          }
          for (const existingId of remotePlayersRef.current.keys()) {
            if (!seenPeerIds.has(existingId)) {
              remotePlayersRef.current.delete(existingId);
            }
          }
        }

        // Sync authoritative monsters (0 on Map 1 Citadel!)
        if (Array.isArray(msg.monsters)) {
          serverMonstersRef.current.clear();
          for (const m of msg.monsters as ServerMonsterSnapshot[]) {
            serverMonstersRef.current.set(m.id, m);
          }
        }

        // Sync authoritative ground loot
        if (Array.isArray(msg.loots)) {
          serverLootsRef.current.clear();
          for (const l of msg.loots as ServerLootSnapshot[]) {
            serverLootsRef.current.set(l.id, l);
          }
        }

        if (typeof msg.onlineCount === 'number') {
          setOnlineCount(msg.onlineCount);
        }
      } else if (msg.type === 'world:vfx' && msg.event) {
        worldControlRef.current?.playServerVfxEvent(msg.event as ServerCombatVfxEvent);
      } else if (msg.type === 'world:float' && msg.event) {
        worldControlRef.current?.playServerFloatingEvent(msg.event as ServerFloatingEvent);
      } else if (msg.type === 'forge:result') {
        const ok = Boolean(msg.ok);
        const message = String(msg.message || '');
        soundFX.playEnhance(ok);
        setForgeNotice(message);
      } else if (msg.type === 'server:toast' && msg.text) {
        showToast(
          String(msg.text),
          (msg.tone as 'gold' | 'emerald' | 'rose' | 'sky') || 'gold'
        );
      } else if (msg.type === 'player:left' && msg.playerId) {
        remotePlayersRef.current.delete(String(msg.playerId));
      } else if (msg.type === 'chat:message' && msg.message) {
        setChatMessages((prev) => [...prev.slice(-60), msg.message as ChatMessage]);
      }
    },
    [showToast]
  );

  useEffect(() => {
    if (stage !== 'world' || !activeCharRef.current) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      pendingHttpCmdsRef.current = [];
      httpSyncInFlightRef.current = false;
      remotePlayersRef.current.clear();
      serverMonstersRef.current.clear();
      serverLootsRef.current.clear();
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (activeCharRef.current) {
          ws.send(
            JSON.stringify({
              type: 'cmd:join',
              character: activeCharRef.current,
            })
          );
          if (pendingHttpCmdsRef.current.length > 0) {
            const buffered = pendingHttpCmdsRef.current.splice(0);
            for (const cmd of buffered) {
              ws.send(JSON.stringify(cmd));
            }
          }
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data));
          applyServerMessage(msg);
        } catch {
          // Ignore malformed WS payloads
        }
      };

      ws.onclose = () => {
        if (!cancelled) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
    };

    connect();

    // Seamless Authoritative HTTP Fallback Sync whenever WebSocket is connecting/blocked on mobile networks
    const fallbackTimer = window.setInterval(async () => {
      if (cancelled) return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) return;
      if (httpSyncInFlightRef.current || !activeCharRef.current) return;

      httpSyncInFlightRef.current = true;
      const commands = pendingHttpCmdsRef.current.splice(0);
      try {
        const resp = await fetch('/api/world/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: activeCharRef.current.id,
            character: activeCharRef.current,
            commands,
          }),
        });
        if (!resp.ok || cancelled) return;
        const data = await resp.json();
        if (cancelled || wsRef.current?.readyState === WebSocket.OPEN) return;
        if (data?.bossState) {
          setWorldBossState(data.bossState as ServerWorldBossState);
        }
        if (Array.isArray(data?.events)) {
          for (const ev of data.events) {
            applyServerMessage(ev as Record<string, unknown>);
          }
        }
      } catch {
        // Transient network hiccup; next tick retries
      } finally {
        httpSyncInFlightRef.current = false;
      }
    }, 110);

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearInterval(fallbackTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      pendingHttpCmdsRef.current = [];
      httpSyncInFlightRef.current = false;
      remotePlayersRef.current.clear();
      serverMonstersRef.current.clear();
      serverLootsRef.current.clear();
    };
  }, [stage, applyServerMessage]);

  // 5. Auth & Character Selection Handlers
  const handleGoogleSignIn = async () => {
    setGateError(null);
    setBusyLoading(true);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      const formatted = formatFirebaseAuthError(err);
      setGateError(formatted.message);
    } finally {
      setBusyLoading(false);
    }
  };

  const handleServerDirectLogin = async (gameUsername: string, serverId: string) => {
    setGateError(null);
    setBusyLoading(true);
    try {
      try {
        localStorage.setItem('ttkn_direct_username', gameUsername);
      } catch {
        // Ignore storage quota errors
      }
      const resp = await fetch('/api/server-auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameUsername, serverId }),
      });
      if (!resp.ok) {
        throw new Error('Máy chủ không phản hồi.');
      }
      const data = await resp.json();
      const resolvedOwner = String(data.ownerId || `srv_${gameUsername.toLowerCase()}`);
      serverOwnerRef.current = resolvedOwner;
      setServerOwnerId(resolvedOwner);
      setAccount(data.account as AccountDoc);
      setCharacters(Array.isArray(data.characters) ? (data.characters as CharacterDoc[]) : []);
      setStage('char_select');
    } catch {
      setGateError('Không thể kết nối Máy Chủ Hoàng Thành. Vui lòng thử lại.');
    } finally {
      setBusyLoading(false);
    }
  };

  const handleSubmitGameAccount = async (gameUsername: string, serverId: string) => {
    if (!firebaseUser) {
      await handleServerDirectLogin(gameUsername, serverId);
      return;
    }
    setGateError(null);
    setBusyLoading(true);
    try {
      const saved = await registerOrUpdateAccount(
        firebaseUser.uid,
        gameUsername,
        serverId,
        !account
      );
      fetch('/api/server-auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId: firebaseUser.uid,
          gameUsername: saved.gameUsername,
          serverId: saved.serverId,
        }),
      }).catch(() => {});
      setAccount(saved);
      setStage('char_select');
    } catch {
      setGateError('Không thể khởi tạo tài khoản máy chủ. Vui lòng thử lại.');
    } finally {
      setBusyLoading(false);
    }
  };

  const handleSignOut = async () => {
    serverOwnerRef.current = null;
    setServerOwnerId(null);
    if (firebaseUser) {
      await signOutAccount().catch(() => {});
    }
    setAccount(null);
    setCharacters([]);
    setActiveChar(null);
    setStage('gate');
  };

  const handleCreateCharacter = async (params: {
    name: string;
    classId: ClassId;
    hairColor: string;
    accentColor: string;
  }) => {
    setBusyLoading(true);
    try {
      if (firebaseUser) {
        const cls = CLASSES_DATA[params.classId];
        const created = await createNewCharacterDoc({
          uid: firebaseUser.uid,
          name: params.name,
          classId: params.classId,
          hairColor: params.hairColor,
          accentColor: params.accentColor,
          baseStats: cls.baseStats,
          starterWeapon: 'none',
        });
        setCharacters((prev) => [...prev, created]);
        soundFX.playLevelUp();
        return;
      }

      const activeOwner = serverOwnerRef.current || serverOwnerId || account?.ownerId;
      if (!activeOwner) return;
      const resp = await fetch('/api/server-auth/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId: activeOwner,
          name: params.name,
          classId: params.classId,
          hairColor: params.hairColor,
          accentColor: params.accentColor,
        }),
      });
      if (!resp.ok) {
        throw new Error('Server create character failed');
      }
      const data = await resp.json();
      if (data?.character) {
        setCharacters((prev) => [...prev, data.character as CharacterDoc]);
        soundFX.playLevelUp();
      }
    } finally {
      setBusyLoading(false);
    }
  };

  const handleDeleteCharacter = async (charId: string) => {
    setBusyLoading(true);
    try {
      if (firebaseUser) {
        await removeCharacterDoc(charId);
      } else {
        const activeOwner = serverOwnerRef.current || serverOwnerId || account?.ownerId || '';
        await fetch(
          `/api/server-auth/characters/${encodeURIComponent(charId)}?ownerId=${encodeURIComponent(
            activeOwner
          )}`,
          { method: 'DELETE' }
        );
      }
      setCharacters((prev) => prev.filter((c) => c.id !== charId));
    } finally {
      setBusyLoading(false);
    }
  };

  const handleEnterWorld = (char: CharacterDoc) => {
    const stats = computeDerivedStats(char, false);
    lastSavedSigRef.current = getCharacterSaveSignature(char);
    serverSelfRef.current = {
      mapId: char.mapId || CITADEL_MAP_ID,
      x: 0,
      z: (char.mapId || CITADEL_MAP_ID) === CITADEL_MAP_ID ? 9 : 4,
      vx: 0,
      vz: 0,
      rotY: Math.PI,
      action: 'idle',
      actionSeq: 0,
      ackTime: 0,
      teleportSeq: 0,
      stateSeq: 0,
      synced: false,
      statuses: [],
      lastSyncAt: performance.now(),
    };
    activeCharRef.current = char;
    setActiveChar(char);
    setHp(stats.maxHp);
    setMp(stats.maxMp);
    setPlayerStatuses([]);
    setCamPresetIdx(0);
    setAutoBattle(false);
    setActiveTarget(null);
    setForgeNotice(null);
    setActiveModal('none');
    setStage('world');
  };

  // 6. Thin-Client Intent Dispatchers (100% Server-Authoritative)
  const handleSendInput = useCallback(
    (dirX: number, dirZ: number, rotY: number, clientTime: number) => {
      sendCmd({ type: 'cmd:input', dirX, dirZ, rotY, clientTime });
    },
    [sendCmd]
  );

  const handleSendMoveTo = useCallback(
    (x: number, z: number) => {
      sendCmd({ type: 'cmd:move_to', x, z });
    },
    [sendCmd]
  );

  const handleSendAttack = useCallback(
    (targetId?: string) => {
      sendCmd({ type: 'cmd:attack', targetId });
    },
    [sendCmd]
  );

  const handleSendDodge = useCallback(
    (dirX: number, dirZ: number) => {
      sendCmd({ type: 'cmd:dodge', dirX, dirZ });
    },
    [sendCmd]
  );

  const handleSendSkill = useCallback(
    (skillIndex: number, targetId?: string, targetX?: number, targetZ?: number) => {
      sendCmd({ type: 'cmd:skill', skillIndex, targetId, targetX, targetZ });
    },
    [sendCmd]
  );

  const handleSendPickupLoot = useCallback(
    (lootId?: string) => {
      sendCmd({ type: 'cmd:pickup_loot', lootId });
    },
    [sendCmd]
  );

  const handleUseHpPotion = useCallback(() => {
    sendCmd({ type: 'cmd:use_potion', kind: 'hp' });
  }, [sendCmd]);

  const handleUseMpPotion = useCallback(() => {
    sendCmd({ type: 'cmd:use_potion', kind: 'mp' });
  }, [sendCmd]);

  const handleToggleMount = useCallback(() => {
    sendCmd({ type: 'cmd:toggle_mount' });
  }, [sendCmd]);

  const handleEquipItem = useCallback(
    (_item: ItemDef, invIndex: number) => {
      sendCmd({ type: 'cmd:equip_item', invIndex });
    },
    [sendCmd]
  );

  const handleUnequipSlot = useCallback(
    (slot: EquipSlot) => {
      sendCmd({ type: 'cmd:unequip_item', slot });
    },
    [sendCmd]
  );

  const handleSellItem = useCallback(
    (invIndex: number) => {
      sendCmd({ type: 'cmd:sell_item', invIndex });
    },
    [sendCmd]
  );

  const handleEquipCustomWeapon = useCallback(
    (slotKey: string) => {
      sendCmd({ type: 'cmd:equip_custom_weapon', slotKey });
    },
    [sendCmd]
  );

  const handleSortBag = useCallback(() => {
    sendCmd({ type: 'cmd:sort_bag' });
  }, [sendCmd]);

  const handleAllocateStat = useCallback(
    (stat: 'str' | 'agi' | 'vit' | 'ene', amount: number) => {
      sendCmd({ type: 'cmd:allocate_stat', stat, amount });
    },
    [sendCmd]
  );

  const handleAutoAllocateStats = useCallback(() => {
    sendCmd({ type: 'cmd:auto_stats' });
  }, [sendCmd]);

  const handleResetStats = useCallback(() => {
    sendCmd({ type: 'cmd:reset_stats' });
  }, [sendCmd]);

  const handleEnhanceEquipment = useCallback(() => {
    setForgeNotice('Đang gửi lệnh cường hoá tới Lò Rèn Máy Chủ...');
    sendCmd({ type: 'cmd:enhance' });
  }, [sendCmd]);

  const handleUpgradeSkill = useCallback(
    (skillIndex: number) => {
      sendCmd({ type: 'cmd:upgrade_skill', skillIndex });
    },
    [sendCmd]
  );

  const handleTeleportMap = useCallback(
    (mapId: number) => {
      setAutoBattle(false);
      setActiveTarget(null);
      setActiveModal('none');
      remotePlayersRef.current.clear();
      serverMonstersRef.current.clear();
      serverLootsRef.current.clear();
      sendCmd({ type: 'cmd:teleport', mapId });
    },
    [sendCmd]
  );

  const handleClaimQuest = useCallback(() => {
    sendCmd({ type: 'cmd:claim_quest' });
  }, [sendCmd]);

  const handleBuyShopItem = useCallback(
    (item: ItemDef) => {
      sendCmd({ type: 'cmd:buy_item', itemId: item.id });
    },
    [sendCmd]
  );

  const handleBuyPotions = useCallback(
    (kind: 'hp' | 'mp', count: number) => {
      sendCmd({ type: 'cmd:buy_potions', kind, count });
    },
    [sendCmd]
  );

  const handleClaimDailyReward = useCallback(
    (questId: string) => {
      sendCmd({ type: 'cmd:claim_daily_reward', questId });
    },
    [sendCmd]
  );

  const handleHealerRestore = useCallback(() => {
    sendCmd({ type: 'cmd:healer_restore' });
  }, [sendCmd]);

  const handleHealerBuff = useCallback(() => {
    sendCmd({ type: 'cmd:healer_buff' });
  }, [sendCmd]);

  const handleVaultDeposit = useCallback(
    (invIndex: number) => {
      sendCmd({ type: 'cmd:vault_deposit_item', invIndex });
    },
    [sendCmd]
  );

  const handleVaultWithdraw = useCallback(
    (vaultIndex: number) => {
      sendCmd({ type: 'cmd:vault_withdraw_item', vaultIndex });
    },
    [sendCmd]
  );

  const handleVaultGold = useCallback(
    (delta: number) => {
      if (delta === 0) return;
      sendCmd({
        type: 'cmd:vault_gold',
        mode: delta > 0 ? 'deposit' : 'withdraw',
        amount: Math.abs(delta),
      });
    },
    [sendCmd]
  );

  const handleQuestTrackerClick = useCallback(() => {
    if (!activeChar) return;
    const q = QUESTS_DATA[Math.min(activeChar.questIndex, QUESTS_DATA.length - 1)];
    if (!q) return;
    if (activeChar.questProgress >= q.requiredKills) {
      if (activeChar.mapId !== CITADEL_MAP_ID) {
        pendingNpcWalkRef.current = 'npc_vance';
        handleTeleportMap(CITADEL_MAP_ID);
      } else {
        handleClaimQuest();
      }
      return;
    }
    if (activeChar.mapId !== q.targetMapId) {
      sendCmd({ type: 'cmd:teleport', mapId: q.targetMapId });
      window.setTimeout(() => setAutoBattle(true), 250);
    } else {
      setAutoBattle(true);
      worldControlRef.current?.navigateToQuestTarget();
      showToast(`Đang tự động chiến đấu săn ${q.targetMobName}...`, 'emerald');
    }
  }, [activeChar, handleClaimQuest, handleTeleportMap, sendCmd, showToast]);

  const handleNpcInteract = useCallback(
    (npc: NpcDef) => {
      setAutoBattle(false);
      if (npc.action === 'forge') {
        setForgeNotice(null);
        setActiveModal('paperdoll_forge');
        return;
      }
      if (npc.action === 'teleport') {
        setActiveModal('world_map');
        return;
      }
      if (npc.action === 'assets') {
        if (isAdmin) {
          setActiveModal('asset_studio');
        } else {
          showToast('Chỉ Quản Trị Viên mới có quyền truy cập Studio Tài Nguyên.', 'rose');
        }
        return;
      }
      setInteractingNpc(npc);
      setActiveModal('npc');
    },
    [isAdmin, showToast]
  );

  // 7. 3D Asset Studio Plug-and-Play Replacement Handlers (Server + Firestore)
  const handleSaveAssetOverride = async (params: {
    slotKey: string;
    label: string;
    modelUrl: string;
    scale: number;
    offsetY: number;
    rotationY: number;
    actions?: Record<string, string>;
    existingId?: string;
  }) => {
    if (!isAdmin) {
      showToast('Chỉ Quản Trị Viên mới có quyền thay thế tài nguyên.', 'rose');
      return;
    }
    const nowDoc: AssetOverrideDoc = {
      id: params.existingId || `srv_asset_${params.slotKey}`,
      ownerId: firebaseUser?.uid || 'server',
      slotKey: params.slotKey,
      label: params.label,
      modelUrl: params.modelUrl,
      scale: params.scale,
      offsetY: params.offsetY,
      rotationY: params.rotationY,
      actions: params.actions || {},
      status: 'active',
      updatedAt: Date.now(),
    };

    if (firebaseUser) {
      await upsertAssetOverrideDoc({
        uid: firebaseUser.uid,
        ...params,
      }).catch(() => {});
    }

    await assetRegistry.setOverrideRuntime(nowDoc);
    setAssetOverrides((prev) => {
      const filtered = prev.filter((o) => o.slotKey !== nowDoc.slotKey);
      return [...filtered, nowDoc];
    });
    showToast(`Đã đồng bộ tài nguyên [${params.label}] trên toàn máy chủ!`, 'emerald');
  };

  const handleDeleteAssetOverride = async (slotKey: string, overrideId?: string) => {
    if (!isAdmin) return;
    await deleteAssetOverrideDoc(overrideId || `srv_asset_${slotKey}`, slotKey).catch(() => {});
    assetRegistry.removeOverrideRuntime(slotKey);
    setAssetOverrides((prev) => prev.filter((o) => o.slotKey !== slotKey));
    showToast('Đã khôi phục tài nguyên mặc định trên máy chủ.', 'sky');
  };

  // 8. Global Studio Keyboard Shortcuts (B, C, K, M, R, T, Q, E, Esc)
  useEffect(() => {
    if (stage !== 'world') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        setActiveModal('none');
      } else if (k === 'b') {
        setActiveModal((m) => (m === 'paperdoll_bag' ? 'none' : 'paperdoll_bag'));
      } else if (k === 'c') {
        setActiveModal((m) => (m === 'paperdoll_stats' ? 'none' : 'paperdoll_stats'));
      } else if (k === 'k') {
        setActiveModal((m) => (m === 'skills' ? 'none' : 'skills'));
      } else if (k === 'm') {
        setActiveModal((m) => (m === 'world_map' ? 'none' : 'world_map'));
      } else if (k === 'r' && isAdmin) {
        setActiveModal((m) => (m === 'asset_studio' ? 'none' : 'asset_studio'));
      } else if (k === 't') {
        handleToggleMount();
      } else if (k === 'q') {
        handleUseHpPotion();
      } else if (k === 'e') {
        handleUseMpPotion();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage, isAdmin, handleToggleMount, handleUseHpPotion, handleUseMpPotion]);

  const handleFpsUpdate = useCallback((fps: number, frameMs: number) => {
    setFpsStats({ fps, frameMs });
  }, []);

  const handleHudRealtimeSync = useCallback(
    (payload: {
      playerX: number;
      playerZ: number;
      dots: MinimapEntityDot[];
      labels: OverheadLabelItem[];
      floatingTexts: FloatingTextEvent[];
      lootCountNearby: number;
    }) => {
      setPlayerCoords({
        x: Math.round(payload.playerX),
        z: Math.round(payload.playerZ),
      });
      setMinimapDots(payload.dots);
      setOverheadLabels(payload.labels);
      setFloatingTexts(payload.floatingTexts);
      setLootCountNearby(payload.lootCountNearby);
    },
    []
  );

  const handleSendChat = useCallback(
    (channel: 'world' | 'map', text: string) => {
      const ch = activeCharRef.current;
      if (!ch) return;
      sendCmd({
        type: 'chat:send',
        channel,
        text,
        senderName: ch.name,
      });
    },
    [sendCmd]
  );

  if (!authReady) {
    return (
      <div
        className={`@container ${
          isRotatedPortrait ? 'landscape-shell-rotated' : 'landscape-shell-normal'
        } bg-[#07090e] flex flex-col items-center justify-center text-zinc-200`}
      >
        <div className="w-10 h-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
        <p className="mt-3 font-display text-sm tracking-wider text-amber-300">
          Đang kết nối Máy Chủ Hoàng Thành 3D...
        </p>
      </div>
    );
  }

  return (
    <div
      className={`@container ${
        isRotatedPortrait ? 'landscape-shell-rotated' : 'landscape-shell-normal'
      } bg-[#07090e] text-zinc-100`}
    >
      {/* LAYER 1: Native Full-Resolution 3D WebGL World + Projected 3D Nameplates */}
      {stage === 'world' && activeChar && (
        <>
          <WorldCanvas3D
            character={activeChar}
            derivedStats={derivedStats}
            hp={hp}
            mp={mp}
            autoBattle={autoBattle}
            isRotatedPortrait={isRotatedPortrait}
            joystickVecRef={joystickVecRef}
            serverSelfRef={serverSelfRef}
            remotePlayersRef={remotePlayersRef}
            serverMonstersRef={serverMonstersRef}
            serverLootsRef={serverLootsRef}
            worldControlRef={worldControlRef}
            onNpcInteract={handleNpcInteract}
            onTargetUpdate={setActiveTarget}
            onFpsUpdate={handleFpsUpdate}
            onHudRealtimeSync={handleHudRealtimeSync}
            onSendInput={handleSendInput}
            onSendMoveTo={handleSendMoveTo}
            onSendAttack={handleSendAttack}
            onSendDodge={handleSendDodge}
            onSendSkill={handleSendSkill}
            onSendPickupLoot={handleSendPickupLoot}
          />

          {/* Projected 3D Nameplates & Floating Damage */}
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden select-none">
            {overheadLabels.map((lbl) => (
              <div
                key={lbl.id}
                style={{
                  transform: `translate3d(${Math.round(lbl.x)}px, ${Math.round(lbl.y)}px, 0) translate(-50%, -100%) scale(${uiScale.toFixed(3)})`,
                  transformOrigin: 'bottom center',
                }}
                className="absolute left-0 top-0 flex flex-col items-center whitespace-nowrap"
              >
                {lbl.subtitle && (
                  <span className="text-[9px] font-semibold tracking-wide text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                    {lbl.subtitle}
                  </span>
                )}
                <span
                  style={{ color: lbl.color }}
                  className={`font-display font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.98)] ${
                    lbl.kind === 'boss'
                      ? 'text-[11px] uppercase tracking-wider'
                      : lbl.kind === 'loot'
                      ? 'text-[10px] bg-[#0b0d13]/92 px-1.5 py-0.5 rounded border border-zinc-700/80'
                      : 'text-[10px]'
                  }`}
                >
                  {lbl.title}
                </span>
                {typeof lbl.hpPct === 'number' && (
                  <div className="mt-0.5 w-12 h-1.5 bg-black/85 border border-zinc-700/80 rounded-sm overflow-hidden">
                    <div
                      style={{ width: `${Math.max(0, Math.min(100, lbl.hpPct))}%` }}
                      className={`h-full ${
                        lbl.kind === 'boss'
                          ? 'bg-rose-500'
                          : lbl.kind === 'peer'
                          ? 'bg-emerald-400'
                          : 'bg-red-500'
                      }`}
                    />
                  </div>
                )}
              </div>
            ))}

            {floatingTexts.map((ft) => (
              <div
                key={ft.id}
                style={{
                  transform: `translate3d(${Math.round(ft.screenX)}px, ${Math.round(ft.screenY)}px, 0) translate(-50%, -50%) scale(${uiScale.toFixed(3)})`,
                  color: ft.color,
                }}
                className={`absolute left-0 top-0 font-display font-extrabold font-mono-num drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] ${
                  ft.crit ? 'text-lg scale-110' : 'text-sm'
                }`}
              >
                {ft.text}
              </div>
            ))}
          </div>
        </>
      )}

      {/* LAYER 2: Proportional Universal Scaled UI Canvas (980x520 Reference) */}
      <div
        style={{
          width: `${virtualWidth}px`,
          height: `${virtualHeight}px`,
          transform: `scale(${uiScale})`,
          transformOrigin: 'top left',
        }}
        className="pointer-events-none absolute top-0 left-0 z-20 overflow-hidden"
      >
        {stage === 'gate' && (
          <div className="pointer-events-auto w-full h-full">
            <AuthGateScreen
              firebaseUser={firebaseUser}
              existingAccount={account}
              loading={busyLoading}
              errorMsg={gateError}
              isFullscreen={isFullscreen}
              onToggleFullscreen={handleToggleFullscreen}
              onGoogleSignIn={handleGoogleSignIn}
              onServerDirectLogin={handleServerDirectLogin}
              onSubmitGameAccount={handleSubmitGameAccount}
              onSignOut={handleSignOut}
            />
          </div>
        )}

        {stage === 'char_select' && account && (
          <div className="pointer-events-auto w-full h-full">
            <CharacterSelectCreate
              account={account}
              characters={characters}
              loading={busyLoading}
              isAdmin={isAdmin}
              isRotatedPortrait={isRotatedPortrait}
              onEnterWorld={handleEnterWorld}
              onCreateCharacter={handleCreateCharacter}
              onDeleteCharacter={handleDeleteCharacter}
              onOpenAssetStudio={() => {
                if (isAdmin) setActiveModal('asset_studio');
              }}
              onBackToGate={() => setStage('gate')}
            />
          </div>
        )}

        {stage === 'world' && activeChar && (
          <>
            <LandscapeHUD
              character={activeChar}
              derivedStats={derivedStats}
              hp={hp}
              mp={mp}
              fpsStats={fpsStats}
              playerStatuses={playerStatuses}
              cameraPresetLabel={CAMERA_PRESET_LABELS[camPresetIdx] || 'Chuẩn'}
              isAdmin={isAdmin}
              autoBattle={autoBattle}
              onlineCount={onlineCount}
              activeTarget={activeTarget}
              worldBossState={worldBossState}
              playerCoords={playerCoords}
              minimapDots={minimapDots}
              lootCountNearby={lootCountNearby}
              skillCooldowns={skillCooldowns}
              dodgeCooldown={dodgeCooldown}
              comboStage={comboStage}
              buffRemainingSec={buffRemainingSec}
              isRotatedPortrait={isRotatedPortrait}
              isPortraitDevice={isPortraitDevice}
              autoRotatePortrait={autoRotatePortrait}
              isFullscreen={isFullscreen}
              chatMessages={chatMessages}
              soundMuted={soundMuted}
              toastBanner={toastBanner}
              joystickVecRef={joystickVecRef}
              onBasicAttack={() => worldControlRef.current?.triggerBasicAttack()}
              onDodgeDash={() => worldControlRef.current?.triggerDodgeDash()}
              onCastSkill={(idx) => worldControlRef.current?.triggerSkill(idx)}
              onPickupLoot={() => worldControlRef.current?.pickupNearestLoot()}
              onUseHpPotion={handleUseHpPotion}
              onUseMpPotion={handleUseMpPotion}
              onToggleMount={handleToggleMount}
              onToggleAutoBattle={() => {
                const curMap = MAPS_DATA.find((m) => m.id === activeChar.mapId);
                if (curMap?.safeZone) {
                  const q =
                    QUESTS_DATA[Math.min(activeChar.questIndex, QUESTS_DATA.length - 1)];
                  const huntMapId = q ? q.targetMapId : FIRST_HUNTING_MAP_ID;
                  sendCmd({ type: 'cmd:teleport', mapId: huntMapId });
                  window.setTimeout(() => setAutoBattle(true), 250);
                  return;
                }
                setAutoBattle((prev) => {
                  const next = !prev;
                  showToast(
                    next ? 'Đã BẬT chế độ Treo Máy Tự Động Chiến Đấu' : 'Đã TẮT Treo Máy',
                    next ? 'emerald' : 'sky'
                  );
                  return next;
                });
              }}
              onToggleFullscreen={handleToggleFullscreen}
              onToggleAutoRotate={() => setAutoRotatePortrait((p) => !p)}
              onOpenPaperdoll={(tab) => {
                if (tab === 'forge') setForgeNotice(null);
                setActiveModal(
                  tab === 'stats'
                    ? 'paperdoll_stats'
                    : tab === 'forge'
                    ? 'paperdoll_forge'
                    : 'paperdoll_bag'
                );
              }}
              onOpenSkills={() => setActiveModal('skills')}
              onOpenWorldMap={() => setActiveModal('world_map')}
              onOpenAssetStudio={() => {
                if (isAdmin) setActiveModal('asset_studio');
              }}
              onOpenDailyQuests={() => setActiveModal('daily_quests')}
              onInteractNpcQuick={(npc) => {
                if (activeChar.mapId === CITADEL_MAP_ID) {
                  worldControlRef.current?.navigateToNpc(npc.id);
                } else {
                  pendingNpcWalkRef.current = npc.id;
                  handleTeleportMap(CITADEL_MAP_ID);
                }
              }}
              onReturnCitadel={() => handleTeleportMap(CITADEL_MAP_ID)}
              onQuestAction={handleQuestTrackerClick}
              onCycleCamera={() => {
                const idx = worldControlRef.current?.cycleCameraPreset();
                if (typeof idx === 'number') {
                  setCamPresetIdx(idx);
                }
              }}
              onZoomCamera={(deltaScale) => {
                worldControlRef.current?.zoomCamera(deltaScale);
              }}
              onResetCamera={() => {
                worldControlRef.current?.resetCamera();
                setCamPresetIdx(0);
              }}
              onToggleSound={() => {
                soundFX.muted = !soundMuted;
                setSoundMuted(!soundMuted);
              }}
              onSwitchCharacter={() => {
                if (firebaseUser) {
                  const curSig = getCharacterSaveSignature(activeChar);
                  if (curSig !== lastSavedSigRef.current) {
                    saveCharacterProgress(activeChar)
                      .then(() => {
                        lastSavedSigRef.current = curSig;
                      })
                      .catch(() => {});
                  }
                }
                setActiveModal('none');
                setStage('char_select');
              }}
              onSendChat={handleSendChat}
            />

            {(activeModal === 'paperdoll_bag' ||
              activeModal === 'paperdoll_stats' ||
              activeModal === 'paperdoll_forge') && (
              <div className="pointer-events-auto absolute inset-0 z-40">
                <InventoryPaperdollModal
                  character={activeChar}
                  derivedStats={derivedStats}
                  hp={hp}
                  mp={mp}
                  isRotatedPortrait={isRotatedPortrait}
                  initialTab={
                    activeModal === 'paperdoll_stats'
                      ? 'stats'
                      : activeModal === 'paperdoll_forge'
                      ? 'forge'
                      : 'bag'
                  }
                  forgeNotice={forgeNotice}
                  onClose={() => setActiveModal('none')}
                  onEquipItem={handleEquipItem}
                  onUnequipSlot={handleUnequipSlot}
                  onUseHpPotion={handleUseHpPotion}
                  onUseMpPotion={handleUseMpPotion}
                  onSellItem={handleSellItem}
                  onSortBag={handleSortBag}
                  onAllocateStat={handleAllocateStat}
                  onAutoAllocateStats={handleAutoAllocateStats}
                  onEnhanceEquipment={handleEnhanceEquipment}
                  onToggleMount={handleToggleMount}
                />
              </div>
            )}

            {activeModal === 'skills' && (
              <div className="pointer-events-auto absolute inset-0 z-40">
                <SkillsModal
                  character={activeChar}
                  onClose={() => setActiveModal('none')}
                  onUpgradeSkill={handleUpgradeSkill}
                />
              </div>
            )}

            {activeModal === 'world_map' && (
              <div className="pointer-events-auto absolute inset-0 z-40">
                <WorldMapModal
                  currentMapId={activeChar.mapId}
                  playerLevel={activeChar.level}
                  onClose={() => setActiveModal('none')}
                  onTeleport={handleTeleportMap}
                />
              </div>
            )}

            {activeModal === 'npc' && interactingNpc && (
              <div className="pointer-events-auto absolute inset-0 z-40">
                <NpcShopQuestModal
                  npc={interactingNpc}
                  character={activeChar}
                  derivedStats={derivedStats}
                  hp={hp}
                  mp={mp}
                  buffRemainingSec={buffRemainingSec}
                  vault={vaultState}
                  onClose={() => setActiveModal('none')}
                  onClaimQuest={handleClaimQuest}
                  onGoToQuestMap={(mapId) => {
                    sendCmd({ type: 'cmd:teleport', mapId });
                    window.setTimeout(() => setAutoBattle(true), 250);
                  }}
                  onBuyItem={handleBuyShopItem}
                  onBuyPotions={handleBuyPotions}
                  onHealerRestore={handleHealerRestore}
                  onHealerBuff={handleHealerBuff}
                  onVaultDeposit={handleVaultDeposit}
                  onVaultWithdraw={handleVaultWithdraw}
                  onVaultGold={handleVaultGold}
                  onUpgradeSkill={handleUpgradeSkill}
                  onResetStats={handleResetStats}
                />
              </div>
            )}

            {activeModal === 'daily_quests' && activeChar && (
              <div className="pointer-events-auto absolute inset-0 z-50">
                <DailyQuestModal
                  char={activeChar}
                  onClose={() => setActiveModal('none')}
                  onClaimReward={handleClaimDailyReward}
                />
              </div>
            )}
          </>
        )}

        {activeModal === 'asset_studio' && isAdmin && (
          <div className="pointer-events-auto absolute inset-0 z-50">
            <AssetStudioModal
              uid={firebaseUser?.uid || null}
              email={firebaseUser?.email || null}
              isRotatedPortrait={isRotatedPortrait}
              overrides={assetOverrides}
              onClose={() => setActiveModal('none')}
              onSaveOverride={handleSaveAssetOverride}
              onDeleteOverride={handleDeleteAssetOverride}
              onEquipCustomWeapon={handleEquipCustomWeapon}
            />
          </div>
        )}
      </div>
    </div>
  );
}
