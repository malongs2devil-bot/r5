import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Backpack,
  Box,
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  Coins,
  Compass,
  Eye,
  EyeOff,
  Flame,
  Gem,
  Hand,
  Maximize2,
  Menu,
  MessageSquare,
  Minimize2,
  Navigation,
  RotateCw,
  Send,
  Shield,
  Skull,
  Sparkles,
  Sword,
  Users,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import {
  ActiveStatusEffect,
  CharacterDoc,
  ChatMessage,
  DerivedStats,
  NpcDef,
  ServerWorldBossState,
} from '../types/game';

import {
  CLASSES_DATA,
  expRequiredForLevel,
  ITEMS_CATALOG,
  MAPS_DATA,
  NPCS_DATA,
  QUESTS_DATA,
} from '../data/gameData';
import { assetRegistry } from '../engine/AssetRegistry';
import {
  ActiveMonsterInfo,
  MinimapEntityDot,
} from '../engine/WorldCanvas3D';
import {
  ItemIconSVG,
  PotionIconSVG,
  SkillIconSVG,
  StatusEffectIconSVG,
} from './GameIconRenderer';

interface LandscapeHUDProps {
  character: CharacterDoc;
  derivedStats: DerivedStats;
  hp: number;
  mp: number;
  fpsStats: { fps: number; frameMs: number };
  playerStatuses: ActiveStatusEffect[];
  cameraPresetLabel: string;
  isAdmin: boolean;
  autoBattle: boolean;
  onlineCount: number;
  activeTarget: ActiveMonsterInfo | null;
  playerCoords: { x: number; z: number };
  minimapDots: MinimapEntityDot[];
  lootCountNearby: number;
  skillCooldowns: number[];
  dodgeCooldown: number;
  comboStage: 1 | 2 | 3;
  buffRemainingSec: number;
  isRotatedPortrait: boolean;
  isPortraitDevice: boolean;
  autoRotatePortrait: boolean;
  isFullscreen: boolean;
  chatMessages: ChatMessage[];
  soundMuted: boolean;
  toastBanner: { text: string; tone: 'gold' | 'emerald' | 'rose' | 'sky' } | null;
  worldBossState?: ServerWorldBossState;
  joystickVecRef: React.MutableRefObject<{ x: number; y: number }>;
  onBasicAttack: () => void;
  onDodgeDash: () => void;
  onCastSkill: (skillIdx: number) => void;
  onPickupLoot: () => void;
  onUseHpPotion: () => void;
  onUseMpPotion: () => void;
  onToggleMount: () => void;
  onToggleAutoBattle: () => void;
  onToggleFullscreen: () => void;
  onToggleAutoRotate: () => void;
  onOpenPaperdoll: (tab: 'bag' | 'stats' | 'forge') => void;
  onOpenSkills: () => void;
  onOpenWorldMap: () => void;
  onOpenAssetStudio: () => void;
  onOpenDailyQuests: () => void;
  onInteractNpcQuick: (npc: NpcDef) => void;
  onReturnCitadel: () => void;
  onQuestAction: () => void;
  onCycleCamera: () => void;
  onZoomCamera: (deltaScale: number) => void;
  onResetCamera: () => void;
  onToggleSound: () => void;
  onSwitchCharacter: () => void;
  onSendChat: (channel: 'world' | 'map', text: string) => void;
}

// Mathematically calibrated non-overlapping dual-arc skill cluster for the 980x520 virtual canvas
const SKILL_ARC_VIRTUAL = [
  { right: '154px', bottom: '8px' },   // S1
  { right: '144px', bottom: '66px' },  // S2
  { right: '108px', bottom: '118px' }, // S3
  { right: '58px', bottom: '150px' },  // S4
  { right: '4px', bottom: '156px' },   // S5
  { right: '64px', bottom: '76px' },   // S6 Ultimate (Inner Core)
];

const STATUS_META = {
  burn: {
    label: 'Cháy',
    cls: 'bg-[#2a0e0e]/95 border-orange-500/75 text-orange-200',
  },
  freeze: {
    label: 'Đóng Băng',
    cls: 'bg-[#091c2b]/95 border-sky-400/75 text-sky-200',
  },
  shock: {
    label: 'Tê Liệt',
    cls: 'bg-[#241d08]/95 border-yellow-400/75 text-yellow-200',
  },
} as const;

export const LandscapeHUD: React.FC<LandscapeHUDProps> = ({
  character,
  derivedStats,
  hp,
  mp,
  fpsStats,
  playerStatuses,
  cameraPresetLabel,
  isAdmin,
  autoBattle,
  onlineCount,
  activeTarget,
  worldBossState,
  playerCoords,
  minimapDots,
  lootCountNearby,
  skillCooldowns,
  dodgeCooldown,
  comboStage,
  buffRemainingSec,
  isRotatedPortrait,
  isPortraitDevice,
  autoRotatePortrait,
  isFullscreen,
  chatMessages,
  soundMuted,
  toastBanner,
  joystickVecRef,
  onBasicAttack,
  onDodgeDash,
  onCastSkill,
  onPickupLoot,
  onUseHpPotion,
  onUseMpPotion,
  onToggleMount,
  onToggleAutoBattle,
  onToggleFullscreen,
  onToggleAutoRotate,
  onOpenPaperdoll,
  onOpenSkills,
  onOpenWorldMap,
  onOpenAssetStudio,
  onOpenDailyQuests,
  onInteractNpcQuick,
  onReturnCitadel,
  onQuestAction,
  onCycleCamera,
  onZoomCamera,
  onResetCamera,
  onToggleSound,
  onSwitchCharacter,
  onSendChat,
}) => {
  const [hudHidden, setHudHidden] = useState(false);
  const [avatarErr, setAvatarErr] = useState(false);
  const [, setAssetRev] = useState(0);
  const [leftPanelTab, setLeftPanelTab] = useState<'quest' | 'npc'>('quest');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [chatChannel, setChatChannel] = useState<'all' | 'world' | 'map'>('all');
  const [sendChannel, setSendChannel] = useState<'world' | 'map'>('world');
  const [chatDraft, setChatDraft] = useState('');

  // Fixed-center virtual joystick with global auto-return guarantee
  const joyRingRef = useRef<HTMLDivElement | null>(null);
  const joyActiveRef = useRef<boolean>(false);
  const joyPointerIdRef = useRef<number | null>(null);
  const [joyActive, setJoyActive] = useState(false);
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [joySprinting, setJoySprinting] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const cls = CLASSES_DATA[character.classId];
  const portraitUrl = assetRegistry.getCharacterPortraitUrl(character.classId) || cls.portraitUrl;
  const currentMap = MAPS_DATA.find((m) => m.id === character.mapId) || MAPS_DATA[0];
  const currentQuest =
    QUESTS_DATA[Math.min(character.questIndex, QUESTS_DATA.length - 1)];
  const questCompleted = character.questProgress >= currentQuest.requiredKills;
  const questTargetMap =
    MAPS_DATA.find((m) => m.id === currentQuest.targetMapId) || MAPS_DATA[0];

  const expNeeded = expRequiredForLevel(character.level);
  const expPct = Math.min(100, Math.round((character.exp / Math.max(1, expNeeded)) * 100));
  const hpPct = Math.max(0, Math.min(100, (hp / Math.max(1, derivedStats.maxHp)) * 100));
  const mpPct = Math.max(0, Math.min(100, (mp / Math.max(1, derivedStats.maxMp)) * 100));

  const edgePad = {
    top: '8px',
    bottom: '8px',
    left: '10px',
    right: '10px',
  };

  useEffect(() => {
    return assetRegistry.subscribe(() => setAssetRev((n) => n + 1));
  }, []);

  useEffect(() => {
    setAvatarErr(false);
  }, [portraitUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      if (e.key.toLowerCase() === 'h') {
        setHudHidden((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatDrawerOpen]);

  // Reset joystick unconditionally back to (0, 0) center
  const resetJoystick = useCallback(() => {
    joyActiveRef.current = false;
    joyPointerIdRef.current = null;
    setJoyActive(false);
    setJoyKnob({ x: 0, y: 0 });
    setJoySprinting(false);
    joystickVecRef.current = { x: 0, y: 0 };
  }, [joystickVecRef]);

  // Scale-invariant & rotation-invariant joystick displacement from ring center
  const computeJoystickFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const ring = joyRingRef.current;
      if (!ring) return;
      const rect = ring.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const screenDx = clientX - cx;
      const screenDy = clientY - cy;

      const localDx = isRotatedPortrait ? screenDy : screenDx;
      const localDy = isRotatedPortrait ? -screenDx : screenDy;

      const ringSpan = isRotatedPortrait ? rect.height : rect.width;
      const maxScreenRadius = Math.max(18, ringSpan * 0.42);
      const dist = Math.hypot(localDx, localDy);
      const clampedDist = Math.min(dist, maxScreenRadius);
      const angle = Math.atan2(localDy, localDx);

      const nx = dist > 1.5 ? (Math.cos(angle) * clampedDist) / maxScreenRadius : 0;
      const ny = dist > 1.5 ? (Math.sin(angle) * clampedDist) / maxScreenRadius : 0;
      const mag = Math.hypot(nx, ny);

      // Virtual-canvas knob radius (40px inside 118px ring)
      const maxKnobPx = 40;
      setJoyKnob({
        x: Math.round(nx * maxKnobPx),
        y: Math.round(ny * maxKnobPx),
      });
      setJoySprinting(mag > 0.78);
      joystickVecRef.current = {
        x: Number(nx.toFixed(3)),
        y: Number(ny.toFixed(3)),
      };
    },
    [isRotatedPortrait, joystickVecRef]
  );

  // Global window-level pointer/touch/mouse/blur safety listeners so knob NEVER gets stuck
  useEffect(() => {
    const onWinPointerMove = (e: PointerEvent) => {
      if (!joyActiveRef.current) return;
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        resetJoystick();
        return;
      }
      if (joyPointerIdRef.current !== null && e.pointerId !== joyPointerIdRef.current) {
        return;
      }
      computeJoystickFromClient(e.clientX, e.clientY);
    };

    const onWinPointerUp = (e: PointerEvent) => {
      if (!joyActiveRef.current) return;
      if (joyPointerIdRef.current !== null && e.pointerId !== joyPointerIdRef.current) {
        return;
      }
      resetJoystick();
    };

    const onWinForceRelease = () => {
      if (joyActiveRef.current) {
        resetJoystick();
      }
    };

    const onWinTouchEnd = (e: TouchEvent) => {
      if (joyActiveRef.current && e.touches.length === 0) {
        resetJoystick();
      }
    };

    const onVisibility = () => {
      if (document.hidden) resetJoystick();
    };

    window.addEventListener('pointermove', onWinPointerMove, { passive: true });
    window.addEventListener('pointerup', onWinPointerUp);
    window.addEventListener('pointercancel', onWinPointerUp);
    window.addEventListener('mouseup', onWinForceRelease);
    window.addEventListener('touchend', onWinTouchEnd);
    window.addEventListener('touchcancel', onWinForceRelease);
    window.addEventListener('blur', onWinForceRelease);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('pointermove', onWinPointerMove);
      window.removeEventListener('pointerup', onWinPointerUp);
      window.removeEventListener('pointercancel', onWinPointerUp);
      window.removeEventListener('mouseup', onWinForceRelease);
      window.removeEventListener('touchend', onWinTouchEnd);
      window.removeEventListener('touchcancel', onWinForceRelease);
      window.removeEventListener('blur', onWinForceRelease);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [computeJoystickFromClient, resetJoystick]);

  const handleJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    joyActiveRef.current = true;
    joyPointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if synthetic touch event does not support capture
    }
    setJoyActive(true);
    computeJoystickFromClient(e.clientX, e.clientY);
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joyActiveRef.current) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      resetJoystick();
      return;
    }
    if (joyPointerIdRef.current !== null && e.pointerId !== joyPointerIdRef.current) return;
    computeJoystickFromClient(e.clientX, e.clientY);
  };

  const handleJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== null && e.pointerId !== joyPointerIdRef.current) return;
    resetJoystick();
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatDraft.trim();
    if (!trimmed) return;
    onSendChat(sendChannel, trimmed);
    setChatDraft('');
  };

  const filteredChats = chatMessages.filter((m) => {
    if (chatChannel === 'all') return true;
    if (chatChannel === 'map') return m.channel === 'map' && m.mapId === character.mapId;
    return m.channel === 'world' || m.channel === 'system';
  });

  const latestChat = filteredChats[filteredChats.length - 1];
  const equippedMountDef = ITEMS_CATALOG[character.equippedMount];

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      {/* Zen Mode Restore Button */}
      {hudHidden && (
        <button
          type="button"
          onClick={() => setHudHidden(false)}
          style={{ top: edgePad.top, right: edgePad.right }}
          className="pointer-events-auto absolute min-h-[40px] bg-[#0b0e16]/94 border border-zinc-700 hover:border-amber-400 text-zinc-100 px-3 py-1.5 rounded-xl text-xs font-display font-bold flex items-center gap-1.5 shadow-xl whitespace-nowrap"
        >
          <Eye className="w-4 h-4 text-amber-400" />
          Hiện Giao Diện
        </button>
      )}

      {/* Toast Notification Banner */}
      {toastBanner && !hudHidden && (
        <div
          style={{ top: '56px' }}
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-40 max-w-[72%]"
        >
          <div
            className={`px-3.5 py-1 rounded-lg border text-[11px] font-display font-bold tracking-wide shadow-xl truncate ${
              toastBanner.tone === 'gold'
                ? 'bg-[#1a1408]/95 border-amber-500/70 text-amber-300'
                : toastBanner.tone === 'emerald'
                ? 'bg-[#091914]/95 border-emerald-500/70 text-emerald-300'
                : toastBanner.tone === 'rose'
                ? 'bg-[#1f0b10]/95 border-rose-500/70 text-rose-300'
                : 'bg-[#0b1522]/95 border-sky-500/70 text-sky-300'
            }`}
          >
            {toastBanner.text}
          </div>
        </div>
      )}

      {!hudHidden && (
        <>
          {/* 1. TOP-LEFT: Studio Character Unit Frame + Currencies */}
          <div
            style={{ top: edgePad.top, left: edgePad.left }}
            className="pointer-events-auto absolute flex flex-col gap-1 w-[262px]"
          >
            <div className="bg-[#0b0e16]/94 border border-zinc-700/90 rounded-xl p-2 gap-2.5 flex items-center shadow-xl">
              {/* Clickable Class Avatar -> Opens Paperdoll */}
              <button
                type="button"
                onClick={() => onOpenPaperdoll('bag')}
                title="Mở Trang Bị Nhân Vật & Túi Đồ [B]"
                className="relative w-12 h-12 rounded-lg overflow-hidden border-2 border-amber-500/85 bg-zinc-900 shrink-0 group"
              >
                {!avatarErr ? (
                  <img
                    src={portraitUrl}
                    alt={cls.name}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarErr(true)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-display font-bold text-amber-400 text-sm">
                    {cls.name.slice(0, 2)}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 bg-black/90 text-amber-300 font-mono-num text-[9px] font-bold px-1 rounded-tl border-t border-l border-amber-500/50">
                  Lv.{character.level}
                </span>
              </button>

              {/* Name, CP, HP/MP/EXP */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenPaperdoll('stats')}
                    className="font-display font-bold text-xs text-white truncate hover:text-amber-300 text-left"
                  >
                    {character.name}
                    {character.enhanceLevel > 0 && (
                      <span className="ml-1 text-amber-400 font-mono-num">
                        +{character.enhanceLevel}
                      </span>
                    )}
                  </button>
                  <span className="text-[10px] font-mono-num font-bold text-amber-400 shrink-0 flex items-center gap-0.5">
                    <Sword className="w-2.5 h-2.5" />
                    {derivedStats.combatPower.toLocaleString()}
                  </span>
                </div>

                {/* HP Bar */}
                <div className="mt-0.5 relative h-3 bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
                  <div
                    style={{ width: `${hpPct}%` }}
                    className="h-full bg-gradient-to-r from-red-700 to-rose-500 transition-[width] duration-150"
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono-num font-bold text-white drop-shadow">
                    {Math.round(hp)}/{derivedStats.maxHp}
                  </span>
                </div>

                {/* MP Bar */}
                <div className="mt-0.5 relative h-2.5 bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
                  <div
                    style={{ width: `${mpPct}%` }}
                    className="h-full bg-gradient-to-r from-blue-700 to-sky-400 transition-[width] duration-150"
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[7px] font-mono-num font-semibold text-sky-100 drop-shadow">
                    {Math.round(mp)}/{derivedStats.maxMp}
                  </span>
                </div>

                {/* EXP Micro Bar */}
                <div className="mt-0.5 relative h-1 bg-zinc-950 rounded overflow-hidden">
                  <div
                    style={{ width: `${expPct}%` }}
                    className="h-full bg-amber-400 transition-[width] duration-200"
                  />
                </div>
              </div>
            </div>

            {/* Compact Currency & Stat Alert Row */}
            <div className="flex items-center gap-1 flex-wrap">
              <div className="bg-[#0b0e16]/92 border border-zinc-800 rounded-lg px-2 py-0.5 flex items-center gap-2 text-[10px] font-mono-num">
                <span className="text-amber-300 flex items-center gap-1 whitespace-nowrap">
                  <Coins className="w-2.5 h-2.5 text-amber-400" />
                  {character.gold.toLocaleString()}
                </span>
                <span className="text-sky-300 flex items-center gap-1 whitespace-nowrap">
                  <Gem className="w-2.5 h-2.5 text-sky-400" />
                  {character.gems.toLocaleString()}
                </span>
              </div>

              {character.statPoints > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenPaperdoll('stats')}
                  className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/70 text-amber-200 rounded-lg px-2 py-0.5 text-[10px] font-display font-bold flex items-center gap-1 whitespace-nowrap"
                >
                  <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                  +{character.statPoints} Điểm
                </button>
              )}

              {currentMap.safeZone && (
                <span className="text-[10px] font-semibold text-emerald-300 drop-shadow px-1 whitespace-nowrap">
                  An Toàn · Đô Thành NPC
                </span>
              )}

              {buffRemainingSec > 0 && (
                <span className="text-[10px] font-mono-num font-semibold text-amber-300 drop-shadow px-1 whitespace-nowrap">
                  Chúc Phúc {Math.ceil(buffRemainingSec / 60)}p
                </span>
              )}
            </div>

            {/* Active Player Status Effects (Burn / Freeze / Shock) */}
            {playerStatuses.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {playerStatuses.map((st) => {
                  const meta = STATUS_META[st.type];
                  return (
                    <div
                      key={st.type}
                      className={`px-1.5 py-0.5 rounded-md border flex items-center gap-1 text-[9px] font-mono-num font-bold shadow ${meta.cls}`}
                    >
                      <StatusEffectIconSVG type={st.type} className="w-3 h-3" />
                      <span className="font-sans">{meta.label}</span>
                      <span>{Math.max(0, st.remainingSec).toFixed(1)}s</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. TOP-CENTER: Active Monster / Boss Target Frame */}
          {activeTarget && (
            <div
              style={{ top: edgePad.top }}
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 w-56 bg-[#0b0e16]/94 border border-zinc-700 rounded-xl px-2.5 py-1.5 shadow-xl"
            >
              <div className="flex items-center justify-between gap-1.5 text-[11px]">
                <div className="flex items-center gap-1 min-w-0">
                  {activeTarget.isBoss ? (
                    <Skull className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  ) : (
                    <Shield className="w-3 h-3 text-amber-400 shrink-0" />
                  )}
                  <span
                    className={`font-display font-bold truncate ${
                      activeTarget.isBoss ? 'text-rose-300' : 'text-zinc-100'
                    }`}
                  >
                    {activeTarget.name}
                  </span>
                </div>
                <span className="font-mono-num text-[10px] text-zinc-400 shrink-0">
                  Lv.{activeTarget.level}
                </span>
              </div>
              <div className="mt-1 relative h-2.5 bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
                <div
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(100, (activeTarget.hp / Math.max(1, activeTarget.maxHp)) * 100)
                    )}%`,
                  }}
                  className={`h-full transition-[width] duration-100 ${
                    activeTarget.isBoss
                      ? 'bg-gradient-to-r from-rose-700 via-red-500 to-amber-500'
                      : 'bg-gradient-to-r from-red-700 to-orange-500'
                  }`}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono-num font-bold text-white">
                  {Math.max(0, Math.round(activeTarget.hp)).toLocaleString()} /{' '}
                  {activeTarget.maxHp.toLocaleString()}
                </span>
              </div>

              {activeTarget.statuses && activeTarget.statuses.length > 0 && (
                <div className="mt-1 flex items-center justify-center gap-1 flex-wrap">
                  {activeTarget.statuses.map((st) => {
                    const meta = STATUS_META[st.type];
                    return (
                      <div
                        key={st.type}
                        className={`px-1.5 py-0.5 rounded border flex items-center gap-1 text-[8px] font-mono-num font-bold ${meta.cls}`}
                      >
                        <StatusEffectIconSVG type={st.type} className="w-2.5 h-2.5" />
                        <span>{meta.label}</span>
                        <span>{Math.max(0, st.remainingSec).toFixed(1)}s</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 2B. TOP-CENTER: World Boss Global Spawn & Countdown HUD Banner */}
          {worldBossState && (
            <div
              style={{
                top: activeTarget
                  ? activeTarget.statuses && activeTarget.statuses.length > 0
                    ? '72px'
                    : '52px'
                  : edgePad.top,
              }}
              className="pointer-events-auto absolute left-1/2 -translate-x-1/2 w-64 sm:w-72 bg-[#0d0914]/95 border border-amber-500/50 rounded-xl px-2.5 py-1.5 shadow-2xl shadow-amber-900/30 flex items-center justify-between gap-2 z-40 transition-all duration-300"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[10px] font-display font-bold text-amber-400 uppercase tracking-wide">
                  <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="truncate">World Boss: {worldBossState.bossName}</span>
                </div>
                <div className="text-[9px] text-zinc-300 font-mono-num flex items-center gap-1.5 mt-0.5">
                  <span className="text-zinc-400 truncate">[{worldBossState.mapCode}] {worldBossState.mapName}</span>
                  {worldBossState.active ? (
                    <span className="text-rose-400 font-bold shrink-0">🔥 XUẤT HIỆN!</span>
                  ) : (
                    <span className="text-amber-300 font-bold shrink-0">
                      ⏱ {Math.floor(worldBossState.spawnCountdownSec / 60)}:
                      {String(worldBossState.spawnCountdownSec % 60).padStart(2, '0')}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenWorldMap}
                className="px-2 py-1 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white rounded-lg text-[10px] font-display font-bold shadow-md hover:scale-105 active:scale-95 transition-all whitespace-nowrap shrink-0 flex items-center gap-1"
              >
                <Compass className="w-3 h-3 text-white shrink-0" />
                Dịch Chuyển
              </button>
            </div>
          )}


          {/* 3. MID-LEFT: Collapsible Quest & NPC Tracker */}
          <div
            style={{
              left: edgePad.left,
              top: playerStatuses.length > 0 ? '128px' : '104px',
            }}
            className="pointer-events-auto absolute w-[228px] bg-[#0b0e16]/92 border border-zinc-800 rounded-xl overflow-hidden shadow-lg transition-[top] duration-150"
          >
            <div className="flex items-center justify-between px-2 py-1 bg-[#111622] border-b border-zinc-800">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setLeftPanelTab('quest');
                    setLeftPanelCollapsed(false);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-display font-bold whitespace-nowrap ${
                    leftPanelTab === 'quest'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Nhiệm Vụ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLeftPanelTab('npc');
                    setLeftPanelCollapsed(false);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-display font-bold whitespace-nowrap ${
                    leftPanelTab === 'npc'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  NPC ({NPCS_DATA.length})
                </button>
              </div>
              <button
                type="button"
                onClick={() => setLeftPanelCollapsed((p) => !p)}
                className="text-zinc-400 hover:text-white p-1"
                aria-label="Thu gọn bảng nhiệm vụ"
              >
                {leftPanelCollapsed ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {!leftPanelCollapsed &&
              (leftPanelTab === 'quest' ? (
                <button
                  type="button"
                  onClick={onQuestAction}
                  className="w-full p-2 text-left hover:bg-zinc-900/70 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-display font-bold text-amber-400 truncate">
                      Ch.{currentQuest.index + 1} · {currentQuest.title}
                    </span>
                    <Navigation className="w-3 h-3 text-amber-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-300 truncate">
                    Diệt <span className="text-white font-semibold">{currentQuest.targetMobName}</span>{' '}
                    ({questTargetMap.code})
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[10px] font-mono-num">
                    <span className={questCompleted ? 'text-emerald-400 font-bold' : 'text-zinc-400'}>
                      {Math.min(character.questProgress, currentQuest.requiredKills)}/
                      {currentQuest.requiredKills}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-sans font-bold whitespace-nowrap ${
                        questCompleted
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                          : 'bg-zinc-800 text-zinc-200'
                      }`}
                    >
                      {questCompleted ? 'Nhận Thưởng' : 'Tự Đi'}
                    </span>
                  </div>
                </button>
              ) : (
                <div className="p-1 max-h-32 touch-scroll-y space-y-1">
                  {NPCS_DATA.map((npc) => (
                    <button
                      key={npc.id}
                      type="button"
                      onClick={() => onInteractNpcQuick(npc)}
                      className="w-full flex items-center justify-between px-2 py-1 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] font-display font-bold text-zinc-100 truncate">
                          {npc.name}
                        </div>
                        <div className="text-[9px] text-zinc-400 truncate">{npc.role}</div>
                      </div>
                      <span className="text-[9px] text-amber-400 font-semibold shrink-0 ml-1.5">
                        {currentMap.safeZone ? 'Đến' : 'Về Gặp'}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
          </div>

          {/* 4. TOP-RIGHT: Quick Menu + Radar Minimap */}
          <div
            style={{ top: edgePad.top, right: edgePad.right }}
            className="pointer-events-auto absolute flex items-start gap-1.5 z-30"
          >
            <div className="relative flex items-center gap-1 bg-[#0b0e16]/94 border border-zinc-800 rounded-xl p-1 shadow-xl">
              <button
                type="button"
                onClick={() => onOpenPaperdoll('bag')}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 text-[11px] font-display font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Backpack className="w-3.5 h-3.5 text-amber-400" />
                <span>Túi Đồ</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenPaperdoll('forge')}
                className="min-h-[36px] px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-[11px] font-display font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span>Cường Hoá</span>
              </button>

              <button
                type="button"
                onClick={onOpenSkills}
                className="min-h-[36px] px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-[11px] font-display font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Zap className="w-3.5 h-3.5 text-sky-400" />
                <span>Kỹ Năng</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={onOpenAssetStudio}
                  className="min-h-[36px] px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 text-[11px] font-display font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                  title="Thay thế mô hình 3D & hiệu ứng chiêu thức"
                >
                  <Box className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Xưởng 3D</span>
                </button>
              )}

              <button
                type="button"
                onClick={onOpenDailyQuests}
                className="min-h-[36px] px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 text-[11px] font-display font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                title="Nhiệm vụ hàng ngày nhận Vàng & Ngọc"
              >
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Nhiệm Vụ Ngày</span>
              </button>

              <button
                type="button"
                onClick={onToggleFullscreen}
                title={isFullscreen ? 'Thoát Toàn Màn Hình' : 'Toàn Màn Hình Ngang'}
                className="min-w-[36px] min-h-[36px] px-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-amber-300 hover:text-white flex items-center justify-center gap-1 text-[10px] font-display font-bold whitespace-nowrap shrink-0"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setMoreMenuOpen((p) => !p)}
                title="Tiện Ích & Cài Đặt"
                className={`min-w-[36px] min-h-[36px] rounded-lg border flex items-center justify-center shrink-0 ${
                  moreMenuOpen
                    ? 'bg-amber-500 text-zinc-950 border-amber-300'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700/80 text-zinc-200'
                }`}
              >
                {moreMenuOpen ? <X className="w-3.5 h-3.5" /> : <Menu className="w-3.5 h-3.5" />}
              </button>

              {moreMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] w-56 bg-[#0d111b] border border-zinc-700 rounded-xl p-1.5 shadow-2xl grid grid-cols-1 gap-1 z-50">
                  <button
                    type="button"
                    onClick={() => {
                      onCycleCamera();
                      setMoreMenuOpen(false);
                    }}
                    className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-200 font-medium flex items-center gap-2 text-left"
                  >
                    <Camera className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Góc Camera: {cameraPresetLabel}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onResetCamera();
                      setMoreMenuOpen(false);
                    }}
                    className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-200 font-medium flex items-center gap-2 text-left"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Khôi Phục Camera Chuẩn</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleSound}
                    className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-200 font-medium flex items-center gap-2 text-left"
                  >
                    {soundMuted ? (
                      <VolumeX className="w-4 h-4 text-rose-400 shrink-0" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <span>{soundMuted ? 'Bật Âm Thanh Chiến Đấu' : 'Tắt Âm Thanh'}</span>
                  </button>

                  {isPortraitDevice && (
                    <button
                      type="button"
                      onClick={() => {
                        onToggleAutoRotate();
                        setMoreMenuOpen(false);
                      }}
                      className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs text-amber-300 font-medium flex items-center gap-2 text-left"
                    >
                      <RotateCw className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        {autoRotatePortrait ? 'Tắt Tự Xoay Ngang' : 'Bật Tự Xoay Ngang'}
                      </span>
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-1 pt-0.5 border-t border-zinc-800">
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setHudHidden(true);
                      }}
                      className="min-h-[34px] px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-[11px] text-zinc-300 flex items-center justify-center gap-1"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Ẩn HUD</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        onSwitchCharacter();
                      }}
                      className="min-h-[34px] px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-[11px] text-amber-300 font-semibold flex items-center justify-center"
                    >
                      Đổi Nhân Vật
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Compact Radar Minimap */}
            <div className="bg-[#0b0e16]/94 border border-zinc-700/90 rounded-xl p-1.5 w-[114px] shadow-xl shrink-0">
              <button
                type="button"
                onClick={onOpenWorldMap}
                className="w-full flex items-center justify-between gap-1 text-left group"
              >
                <span className="text-[10px] font-display font-bold text-amber-300 truncate group-hover:text-white">
                  {currentMap.code} · {currentMap.name}
                </span>
                <Compass className="w-3 h-3 text-amber-400 shrink-0" />
              </button>

              <div
                onClick={onOpenWorldMap}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onOpenWorldMap();
                }}
                className="mt-1 relative w-full aspect-square bg-[#07090e] border border-zinc-800 rounded-lg overflow-hidden cursor-pointer"
              >
                <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-800/70" />
                <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-800/70" />

                {minimapDots.map((dot, idx) => {
                  const rx = 50 + ((dot.x - playerCoords.x) / 95) * 50;
                  const rz = 50 + ((dot.z - playerCoords.z) / 95) * 50;
                  if (rx < 4 || rx > 96 || rz < 4 || rz > 96) return null;
                  const dotStyle =
                    dot.kind === 'boss'
                      ? 'w-2 h-2 bg-rose-500 ring-1 ring-rose-300'
                      : dot.kind === 'npc'
                      ? 'w-1.5 h-1.5 bg-sky-400'
                      : dot.kind === 'portal'
                      ? 'w-1.5 h-1.5 bg-purple-400'
                      : dot.kind === 'loot'
                      ? 'w-1.5 h-1.5 bg-amber-300'
                      : dot.kind === 'peer'
                      ? 'w-1.5 h-1.5 bg-emerald-400'
                      : 'w-1 h-1 bg-red-500/85';
                  return (
                    <span
                      key={idx}
                      style={{ left: `${rx}%`, top: `${rz}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${dotStyle}`}
                    />
                  );
                })}

                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white ring-2 ring-amber-400" />
              </div>

              <div className="mt-1 flex items-center justify-between text-[9px] font-mono-num text-zinc-400">
                <span>
                  {playerCoords.x}:{playerCoords.z}
                </span>
                <span className="text-emerald-400 flex items-center gap-0.5">
                  <Users className="w-2.5 h-2.5" />
                  {Math.max(1, onlineCount)}
                </span>
              </div>

              {/* Quick 3D Camera Angle & Zoom Controls (Also supports 2-finger pinch & drag) */}
              <div className="mt-1 pt-1 border-t border-zinc-800/90 flex items-center gap-1">
                <button
                  type="button"
                  onClick={onCycleCamera}
                  title="Đổi góc nhìn Camera 3D (hoặc vuốt màn hình để xoay)"
                  className="flex-1 min-h-[24px] px-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-[8.5px] font-display font-bold text-sky-300 flex items-center justify-center gap-0.5 truncate"
                >
                  <Camera className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{cameraPresetLabel}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onZoomCamera(0.18)}
                  title="Thu nhỏ Camera (Xa hơn)"
                  className="w-6 h-6 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 flex items-center justify-center shrink-0 active:scale-90"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onZoomCamera(-0.18)}
                  title="Phóng to Camera (Gần hơn)"
                  className="w-6 h-6 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 flex items-center justify-center shrink-0 active:scale-90"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* 5. BOTTOM-LEFT: Dynamic Touch-Activated Joystick (Hidden until touched) */}
          <div
            onPointerDown={handleJoyDown}
            onPointerMove={handleJoyMove}
            onPointerUp={handleJoyUp}
            onPointerCancel={handleJoyUp}
            onLostPointerCapture={resetJoystick}
            style={{ bottom: edgePad.bottom, left: edgePad.left }}
            className="pointer-events-auto absolute w-[172px] h-[172px] touch-none flex items-center justify-center"
          >
            <div
              ref={joyRingRef}
              className={`relative w-[118px] h-[118px] rounded-full border-2 flex items-center justify-center transition-all duration-200 pointer-events-none shadow-2xl ${
                joyActive ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
              } ${
                joySprinting
                  ? 'bg-[#0d1320]/92 border-amber-400/95'
                  : 'bg-[#0b0e16]/88 border-amber-500/75'
              }`}
            >
              {/* Directional compass ticks */}
              <span className="absolute top-2 w-1.5 h-1.5 rounded-full bg-zinc-600/80" />
              <span className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-zinc-600/80" />
              <span className="absolute left-2 w-1.5 h-1.5 rounded-full bg-zinc-600/80" />
              <span className="absolute right-2 w-1.5 h-1.5 rounded-full bg-zinc-600/80" />

              {/* Inner guide ring */}
              <div
                className={`w-14 h-14 rounded-full border ${
                  joySprinting ? 'border-amber-400/45' : 'border-zinc-800/90'
                }`}
              />

              {/* Tactile thumb knob — smoothly snaps back to (0,0) center on release */}
              <div
                style={{
                  transform: `translate3d(${joyKnob.x}px, ${joyKnob.y}px, 0)`,
                }}
                className={`absolute w-11 h-11 rounded-full bg-gradient-to-b from-amber-300 via-amber-500 to-orange-600 border-2 border-amber-100 shadow-lg ${
                  joyActive ? '' : 'transition-transform duration-150 ease-out'
                }`}
              />
            </div>
          </div>

          {/* 6. BOTTOM-CENTER: Quick Tactical Belt (Illustrated Potions & Mount) + Live Chat */}
          <div
            style={{ bottom: edgePad.bottom }}
            className="pointer-events-auto absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-25"
          >
            {chatDrawerOpen && (
              <div className="w-80 h-48 bg-[#0b0e16]/96 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl flex flex-col">
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#121724] border-b border-zinc-800 text-[10px]">
                  <div className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3 text-amber-400 mr-0.5" />
                    {(['all', 'world', 'map'] as const).map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setChatChannel(ch)}
                        className={`px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${
                          chatChannel === ch
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {ch === 'all' ? 'Tất Cả' : ch === 'world' ? 'Thế Giới' : 'Bản Đồ'}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setChatDrawerOpen(false)}
                    className="p-0.5 text-zinc-400 hover:text-white"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                <div
                  ref={chatScrollRef}
                  className="flex-1 px-2.5 py-1.5 touch-scroll-y space-y-1 text-[11px]"
                >
                  {filteredChats.slice(-30).map((msg) => (
                    <div key={msg.id} className="leading-snug break-words">
                      <span
                        className={`font-bold mr-1 ${
                          msg.channel === 'system'
                            ? 'text-amber-400'
                            : msg.channel === 'map'
                            ? 'text-sky-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        [{msg.channel === 'system' ? 'HT' : msg.channel === 'map' ? 'Map' : 'TG'}]
                      </span>
                      {msg.senderId !== 'system' && (
                        <span className="text-zinc-200 font-semibold mr-1">
                          {msg.senderName}:
                        </span>
                      )}
                      <span className="text-zinc-300">{msg.text}</span>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={handleChatSubmit}
                  className="flex items-center border-t border-zinc-800 bg-zinc-950 px-1.5 py-1 gap-1"
                >
                  <button
                    type="button"
                    onClick={() => setSendChannel((c) => (c === 'world' ? 'map' : 'world'))}
                    className="px-2 py-1 rounded bg-zinc-800 text-[10px] font-bold text-amber-300 shrink-0"
                  >
                    {sendChannel === 'world' ? 'TG' : 'Map'}
                  </button>
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder="Nhập tin nhắn..."
                    maxLength={140}
                    className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none min-w-0"
                  />
                  <button
                    type="submit"
                    className="p-1.5 rounded bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}

            {!chatDrawerOpen && (
              <button
                type="button"
                onClick={() => setChatDrawerOpen(true)}
                className="max-w-[310px] px-2.5 py-1 rounded-lg bg-[#0b0e16]/88 border border-zinc-800/90 hover:border-zinc-600 flex items-center gap-1.5 text-[10px] text-zinc-300 shadow"
              >
                <MessageSquare className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="truncate">
                  {latestChat
                    ? `${latestChat.senderId !== 'system' ? `${latestChat.senderName}: ` : ''}${latestChat.text}`
                    : 'Kênh Thế Giới trực tuyến · Chạm để trò chuyện'}
                </span>
              </button>
            )}

            {/* Quick Tactical Belt: Illustrated Potions, Mount, Auto-Battle, Loot Pickup */}
            <div className="flex items-center gap-1.5 bg-[#0b0e16]/94 border border-zinc-800 rounded-xl p-1 shadow-xl">
              <button
                type="button"
                onClick={onUseHpPotion}
                title="Dùng Bình Máu [Q]"
                className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[#190c10] border border-rose-500/50 hover:border-rose-400 text-rose-200 text-[11px] font-mono-num font-bold flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 transition-transform"
              >
                <PotionIconSVG kind="hp" className="w-4 h-4" />
                <span>{character.hpPotions}</span>
              </button>

              <button
                type="button"
                onClick={onUseMpPotion}
                title="Dùng Bình Năng Lượng [E]"
                className="min-h-[38px] px-2.5 py-1 rounded-lg bg-[#0b1322] border border-sky-500/50 hover:border-sky-400 text-sky-200 text-[11px] font-mono-num font-bold flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 transition-transform"
              >
                <PotionIconSVG kind="mp" className="w-4 h-4" />
                <span>{character.mpPotions}</span>
              </button>

              <button
                type="button"
                onClick={onToggleMount}
                title={`Triệu hồi / Thu hồi ${equippedMountDef?.name || 'Thú Cưỡi'} [T]`}
                className={`min-h-[38px] px-2.5 py-1 rounded-lg border text-[11px] font-display font-bold flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 transition-transform ${
                  character.mounted
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:border-amber-500/60'
                }`}
              >
                {character.equippedMount !== 'none' && equippedMountDef && (
                  <ItemIconSVG item={equippedMountDef} className="w-5 h-5" />
                )}
                <span>{character.mounted ? 'Đang Cưỡi' : 'Cưỡi'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleAutoBattle}
                className={`min-h-[38px] px-2.5 py-1 rounded-lg border text-[11px] font-display font-bold whitespace-nowrap shrink-0 active:scale-95 transition-transform ${
                  autoBattle
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:border-emerald-500/60'
                }`}
              >
                {currentMap.safeZone ? 'Đi Săn' : autoBattle ? 'Auto: BẬT' : 'Treo Máy'}
              </button>

              {!currentMap.safeZone && (
                <button
                  type="button"
                  onClick={onReturnCitadel}
                  title="Dịch chuyển tức thời về Hoàng Thành Thánh Tích (Đô Thành NPC)"
                  className="min-h-[38px] px-2.5 py-1 rounded-lg bg-emerald-950/90 border border-emerald-500/60 hover:border-emerald-300 text-emerald-200 text-[11px] font-display font-bold whitespace-nowrap shrink-0 active:scale-95 transition-transform"
                >
                  Về Thành
                </button>
              )}

              {lootCountNearby > 0 && (
                <button
                  type="button"
                  onClick={onPickupLoot}
                  title="Nhặt Vật Phẩm Rơi [F]"
                  className="min-h-[38px] px-2.5 py-1 rounded-lg bg-amber-500 text-zinc-950 font-display font-extrabold text-[11px] flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-95 transition-transform"
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span>Nhặt ({lootCountNearby})</span>
                </button>
              )}
            </div>
          </div>

          {/* 7. BOTTOM-RIGHT: AAA Right-Thumb Combat Cluster with Illustrated Skill Icons */}
          <div
            style={{ bottom: edgePad.bottom, right: edgePad.right }}
            className="pointer-events-auto absolute w-[208px] h-[206px]"
          >
            {cls.skills.map((sk, idx) => {
              const pos = SKILL_ARC_VIRTUAL[idx] || SKILL_ARC_VIRTUAL[0];
              const cdLeft = skillCooldowns[idx] || 0;
              const unlocked = character.level >= sk.unlockLevel;
              const skillLv = character.skillLevels[idx] || 1;
              const isUlt = idx === 5;
              const sizeClass = isUlt ? 'w-[52px] h-[52px]' : 'w-[48px] h-[48px]';

              return (
                <button
                  key={sk.id}
                  type="button"
                  disabled={!unlocked || cdLeft > 0}
                  onClick={() => onCastSkill(idx)}
                  style={{
                    right: pos.right,
                    bottom: pos.bottom,
                    borderColor: unlocked ? sk.color : '#3f3f46',
                  }}
                  title={`${sk.name} (Cấp ${skillLv}) · Phím ${idx + 1}`}
                  className={`absolute ${sizeClass} rounded-full bg-[#0b0e16]/95 border-2 flex flex-col items-center justify-center overflow-hidden shadow-xl active:scale-92 transition-transform ${
                    !unlocked ? 'opacity-45 cursor-not-allowed' : 'hover:brightness-125'
                  }`}
                >
                  <SkillIconSVG
                    vfx={sk.vfx}
                    color={sk.color}
                    skillId={sk.id}
                    className={isUlt ? 'w-7 h-7' : 'w-6 h-6'}
                  />
                  <span className="text-[8px] font-mono-num font-bold text-zinc-300 leading-none mt-0.5">
                    {isUlt ? 'ULT' : `S${idx + 1}`}
                  </span>

                  {!unlocked && (
                    <div className="absolute inset-0 bg-black/84 flex items-center justify-center text-[9px] font-mono-num font-bold text-zinc-300">
                      Lv.{sk.unlockLevel}
                    </div>
                  )}

                  {unlocked && cdLeft > 0 && (
                    <div className="absolute inset-0 bg-black/84 flex items-center justify-center text-[11px] font-mono-num font-extrabold text-amber-300">
                      {cdLeft.toFixed(1)}
                    </div>
                  )}
                </button>
              );
            })}

            {/* Active Kinetic Dodge / Dash Evade Button [Shift] */}
            <button
              type="button"
              disabled={dodgeCooldown > 0}
              onClick={onDodgeDash}
              title="Lướt Né Đòn Tốc Độ Cao [Shift]"
              style={{
                right: '96px',
                bottom: '4px',
              }}
              className={`absolute w-[50px] h-[50px] rounded-full bg-[#091824]/95 border-2 border-sky-400 flex flex-col items-center justify-center overflow-hidden shadow-xl active:scale-92 transition-transform ${
                dodgeCooldown > 0 ? 'opacity-65' : 'hover:brightness-125'
              }`}
            >
              <Wind className="w-4 h-4 text-sky-300" />
              <span className="text-[8px] font-display font-bold text-sky-200 leading-none mt-0.5">
                Lướt Né
              </span>
              {dodgeCooldown > 0 && (
                <div className="absolute inset-0 bg-black/82 flex items-center justify-center text-[11px] font-mono-num font-extrabold text-sky-300">
                  {dodgeCooldown.toFixed(1)}
                </div>
              )}
            </button>

            {/* Primary 3-Stage Combo Attack Button [Space] */}
            <button
              type="button"
              onClick={onBasicAttack}
              title="Liên Kích 3 Đòn [Space]"
              className="absolute right-1 bottom-1 w-[82px] h-[82px] rounded-full bg-gradient-to-br from-amber-400 via-orange-600 to-rose-700 border-2 border-amber-100 shadow-2xl flex flex-col items-center justify-center active:scale-92 transition-transform"
            >
              <Sword className="w-7 h-7 text-white" />
              <span className="text-[9px] font-display font-extrabold text-amber-50 tracking-wide mt-0.5">
                ĐÒN {comboStage}/3
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                {[1, 2, 3].map((step) => (
                  <span
                    key={step}
                    className={`h-1 rounded-full transition-colors ${
                      step <= comboStage ? 'w-2.5 bg-white' : 'w-1.5 bg-black/45'
                    }`}
                  />
                ))}
              </div>
            </button>
          </div>
        </>
      )}

      {/* 8. BOTTOM-LEFT CORNER: Real Hardware WebGL FPS & Frame-Time Badge (Works across all 30/60/90/120Hz phones) */}
      <div
        style={{
          bottom: edgePad.bottom,
          left: hudHidden ? edgePad.left : '166px',
        }}
        className="pointer-events-none absolute z-30 bg-[#07090f]/90 border border-zinc-800/90 rounded-lg px-2 py-0.5 flex items-center gap-1.5 shadow-lg"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            fpsStats.fps >= 50
              ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
              : fpsStats.fps >= 30
              ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
              : 'bg-rose-500 shadow-[0_0_6px_#f43f5e]'
          }`}
        />
        <span
          className={`text-[9.5px] font-mono-num font-extrabold tracking-tight whitespace-nowrap ${
            fpsStats.fps >= 50
              ? 'text-emerald-300'
              : fpsStats.fps >= 30
              ? 'text-amber-300'
              : 'text-rose-400'
          }`}
        >
          {fpsStats.fps} FPS
        </span>
        <span className="text-[8.5px] font-mono-num text-zinc-400 whitespace-nowrap">
          {fpsStats.frameMs.toFixed(1)}ms
        </span>
      </div>
    </div>
  );
};
