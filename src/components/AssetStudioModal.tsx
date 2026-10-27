import React, { useEffect, useState } from 'react';
import {
  X,
  Upload,
  RotateCcw,
  Download,
  Check,
  Box,
  User,
  Skull,
  Sparkles,
  Sword,
  Play,
  Zap,
  Flame,
  Layers,
  FileCode,
  Map as MapIcon,
  Image as ImageIcon,
} from 'lucide-react';
import { ActorActionType, AssetOverrideDoc, ClassId, SkillVfxType } from '../types/game';
import { CLASSES_DATA, MAPS_DATA, REPLACEABLE_3D_SLOTS } from '../data/gameData';
import {
  assetRegistry,
  deleteLocalGlbBuffer,
  saveLocalGlbBuffer,
} from '../engine/AssetRegistry';
import { Studio3DPreviewCanvas } from '../engine/Studio3DPreviewCanvas';
import { SkillIconSVG } from './GameIconRenderer';

interface AssetStudioModalProps {
  uid: string | null;
  email: string | null;
  isRotatedPortrait?: boolean;
  overrides: AssetOverrideDoc[];
  onClose: () => void;
  onSaveOverride: (params: {
    slotKey: string;
    label: string;
    modelUrl: string;
    scale: number;
    offsetY: number;
    rotationY: number;
    actions?: Record<string, string>;
    existingId?: string;
  }) => Promise<void>;
  onDeleteOverride: (slotKey: string, overrideId?: string) => Promise<void>;
  onEquipCustomWeapon?: (slotKey: string) => void;
}

type StudioTab =
  | 'character'
  | 'gear'
  | 'armor'
  | 'mounts'
  | 'vfx'
  | 'map_ground'
  | 'map_buildings'
  | 'map_props'
  | 'map_env'
  | 'town'
  | 'monster'
  | 'boss'
  | 'map_editor';

const CHARACTER_ACTIONS = [
  { key: 'idle', label: 'Đứng Yên' },
  { key: 'run', label: 'Chạy Bộ' },
  { key: 'attack_1', label: 'Đánh Thường' },
  { key: 'skill1', label: 'Kỹ Năng 1' },
  { key: 'skill2', label: 'Kỹ Năng 2' },
  { key: 'skill3', label: 'Kỹ Năng 3' },
  { key: 'skill4', label: 'Kỹ Năng 4' },
  { key: 'skill5', label: 'Kỹ Năng 5' },
  { key: 'skill6', label: 'Kỹ Năng 6' },
  { key: 'hit', label: 'Bị Đòn' },
  { key: 'mount', label: 'Cưỡi Thú' },
  { key: 'dead', label: 'Tử Trận' },
];

const MONSTER_ACTIONS = [
  { key: 'idle', label: 'Đứng Yên' },
  { key: 'chase', label: 'Đuổi Theo' },
  { key: 'attack', label: 'Tấn Công' },
  { key: 'hit', label: 'Bị Đòn' },
  { key: 'dead', label: 'Tử Trận' },
];

const CLASS_ORDER: ClassId[] = ['vanguard', 'esper', 'evolver'];

export const AssetStudioModal: React.FC<AssetStudioModalProps> = ({
  email,
  isRotatedPortrait = false,
  overrides,
  onClose,
  onSaveOverride,
  onDeleteOverride,
  onEquipCustomWeapon,
}) => {
  const [activeTab, setActiveTab] = useState<StudioTab>('character');
  const [selectedSlotKey, setSelectedSlotKey] = useState('class_vanguard');
  const [charPanelSection, setCharPanelSection] = useState<'skills' | 'anims'>('skills');
  const [gearClassFilter, setGearClassFilter] = useState<'all' | ClassId>('all');
  const [armorPartFilter, setArmorPartFilter] = useState<
    'all' | 'armor_' | 'helm_' | 'gloves_' | 'pants_' | 'boots_' | 'ring_'
  >('all');

  // Preview Motion & Action Testing States
  const [testAction, setTestAction] = useState<ActorActionType | 'chase' | 'patrol'>('idle');
  const [mounted, setMounted] = useState(false);
  const [selectedVfx, setSelectedVfx] = useState<SkillVfxType>('heavy_cleave');
  const [vfxTick, setVfxTick] = useState(0);
  const [accentColor, setAccentColor] = useState('#ef4444');

  // Transform calibrations
  const [modelUrl, setModelUrl] = useState('');
  const [scale, setScale] = useState(1.0);
  const [offsetY, setOffsetY] = useState(0);
  const [rotationY, setRotationY] = useState(0);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Map Editor (Unity / Godot Style)
  const [editorMapId, setEditorMapId] = useState(2);
  const [editorSlotKey, setEditorSlotKey] = useState('map_prop_tree_ancient');
  const [editorX, setEditorX] = useState(0);
  const [editorZ, setEditorZ] = useState(-5);
  const [editorScale, setEditorScale] = useState(1.0);
  const [editorRotationY, setEditorRotationY] = useState(0);
  const [, setEditorRev] = useState(0);

  const filteredSlots = REPLACEABLE_3D_SLOTS.filter((s) => {
    if (activeTab === 'character') return s.category === 'Nhân Vật (3 Class)';
    if (activeTab === 'monster') return s.category === 'Quái Vật';
    if (activeTab === 'boss') return s.category === 'Boss';
    if (activeTab === 'gear') {
      if (s.category !== 'Vũ Khí 3D') return false;
      if (gearClassFilter !== 'all') {
        return s.classOwner === gearClassFilter || s.slotKey.includes(gearClassFilter);
      }
      return true;
    }
    if (activeTab === 'armor') {
      if (s.category !== 'Giáp & Trang Bị 3D') return false;
      if (armorPartFilter !== 'all') {
        return s.slotKey.startsWith(armorPartFilter);
      }
      return true;
    }
    if (activeTab === 'mounts') return s.category === 'Cánh & Thú Cưỡi';
    if (activeTab === 'vfx') return s.category === 'Hiệu Ứng Skill 3D';
    if (activeTab === 'map_ground') return s.category === 'Bản Đồ (Mặt Đất & Cảnh Quan)';
    if (activeTab === 'map_buildings') return s.category === 'Bản Đồ (Kiến Trúc & Nhà Cửa)';
    if (activeTab === 'map_props') return s.category === 'Bản Đồ (Cây Cối, Đá & Tượng)';
    if (activeTab === 'map_env') return s.category === 'Bản Đồ (Full 3D Env)';
    if (activeTab === 'town') {
      return (
        s.category === 'NPC Hoàng Thành (8 Đại Sư)' ||
        s.category === 'Kiến Trúc Hoàng Thành'
      );
    }
    return true;
  });

  const selectedSlotMeta =
    REPLACEABLE_3D_SLOTS.find((s) => s.slotKey === selectedSlotKey) || REPLACEABLE_3D_SLOTS[0];
  const currentOverride = overrides.find((o) => o.slotKey === selectedSlotKey);

  useEffect(() => {
    setGearClassFilter('all');
    setArmorPartFilter('all');
    if (activeTab === 'character') setSelectedSlotKey('class_vanguard');
    else if (activeTab === 'monster') setSelectedSlotKey('mob_mutant_walker');
    else if (activeTab === 'boss') setSelectedSlotKey('boss_mutant_captain');
    else if (activeTab === 'gear') setSelectedSlotKey('weapon_vanguard_t1');
    else if (activeTab === 'armor') setSelectedSlotKey('armor_t1');
    else if (activeTab === 'mounts') setSelectedSlotKey('wings_t1');
    else if (activeTab === 'vfx') setSelectedSlotKey('vfx_heavy_cleave');
    else if (activeTab === 'map_ground') setSelectedSlotKey('map_ground_citadel');
    else if (activeTab === 'map_buildings') setSelectedSlotKey('map_building_palace');
    else if (activeTab === 'map_props') setSelectedSlotKey('map_prop_tree_ancient');
    else if (activeTab === 'map_env') setSelectedSlotKey('map_env_1');
    else if (activeTab === 'town') setSelectedSlotKey('npc_vance');
  }, [activeTab]);

  useEffect(() => {
    if (currentOverride) {
      setModelUrl(currentOverride.modelUrl);
      setScale(currentOverride.scale);
      setOffsetY(currentOverride.offsetY);
      setRotationY(currentOverride.rotationY);
    } else {
      setModelUrl('');
      setScale(1.0);
      setOffsetY(0);
      setRotationY(0);
    }
    if (selectedSlotKey.startsWith('vfx_')) {
      const vfxId = selectedSlotKey.replace('vfx_', '') as SkillVfxType;
      setSelectedVfx(vfxId);
    } else if (selectedSlotKey === 'class_esper') {
      setSelectedVfx('shard_bolt');
      setAccentColor(CLASSES_DATA.esper.primaryColor);
    } else if (selectedSlotKey === 'class_vanguard') {
      setSelectedVfx('heavy_cleave');
      setAccentColor(CLASSES_DATA.vanguard.primaryColor);
    } else if (selectedSlotKey === 'class_evolver') {
      setSelectedVfx('twin_fang');
      setAccentColor(CLASSES_DATA.evolver.primaryColor);
    }
    setStatusMsg(null);
  }, [selectedSlotKey, currentOverride]);

  const uploadToSpecificSlot = async (
    targetSlotKey: string,
    targetLabel: string,
    file: File,
    actionKey?: string
  ) => {
    setBusy(true);
    const targetDesc = actionKey ? `Hành động [${actionKey}]` : targetLabel;
    setStatusMsg(`Đang chuẩn bị [${file.name}]...`);
    try {
      // Platform hard limit is 32MB. We use 8MB chunks for safety and speed.
      const CHUNK_SIZE = 8 * 1024 * 1024;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const uploadId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      let lastUploadedOverride: AssetOverrideDoc | null = null;
      const isSelectedSlot = targetSlotKey === selectedSlotKey;
      const existingTarget = overrides.find((o) => o.slotKey === targetSlotKey);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunk = file.slice(start, end);
        const percent = Math.round(((i + 1) / totalChunks) * 100);

        setStatusMsg(`Đang tải: ${percent}% [${i + 1}/${totalChunks}] → ${targetDesc}...`);

        const qs = new URLSearchParams({
          uploadId,
          chunkIndex: String(i),
          totalChunks: String(totalChunks),
          slotKey: targetSlotKey,
          fileName: file.name,
          label: targetLabel,
          scale: String(isSelectedSlot ? scale : existingTarget?.scale ?? 1),
          offsetY: String(isSelectedSlot ? offsetY : existingTarget?.offsetY ?? 0),
          rotationY: String(isSelectedSlot ? rotationY : existingTarget?.rotationY ?? 0),
          ...(actionKey ? { actionKey } : {}),
        });

        const resp = await fetch(`/api/assets/upload/chunk?${qs.toString()}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-admin-email': email || '',
          },
          body: chunk,
        });

        if (!resp.ok) {
          const errJson = await resp.json().catch(() => ({}));
          throw new Error(errJson.error || `Lỗi tải mảnh ${i + 1}/${totalChunks}: HTTP ${resp.status}`);
        }

        const data = await resp.json();
        if (data.completed && data.override) {
          lastUploadedOverride = data.override;
        }
      }

      if (!lastUploadedOverride) {
        // If file was small (1 chunk) but we didn't get override, something is wrong
        throw new Error('Máy chủ không trả về cấu hình tài nguyên sau khi tải xong.');
      }

      if (!actionKey) {
        const lowerName = file.name.toLowerCase();
        if (
          lowerName.endsWith('.glb') ||
          lowerName.endsWith('.gltf') ||
          lowerName.endsWith('.fbx') ||
          lowerName.endsWith('.obj')
        ) {
          const fullBuf = await file.arrayBuffer();
          await saveLocalGlbBuffer(targetSlotKey, fullBuf).catch(() => {});
          if (lastUploadedOverride.modelUrl) {
            const urlKey = `url_${lastUploadedOverride.modelUrl.split('?')[0].split('#')[0]}`;
            await saveLocalGlbBuffer(urlKey, fullBuf).catch(() => {});
          }
        }
        if (isSelectedSlot) {
          setModelUrl(lastUploadedOverride.modelUrl);
        }
      }

      await onSaveOverride({
        slotKey: lastUploadedOverride.slotKey,
        label: lastUploadedOverride.label,
        modelUrl: lastUploadedOverride.modelUrl,
        scale: lastUploadedOverride.scale,
        offsetY: lastUploadedOverride.offsetY,
        rotationY: lastUploadedOverride.rotationY,
        actions: lastUploadedOverride.actions,
        existingId: existingTarget?.id || lastUploadedOverride.id,
      });

      // Special handling for VFX preview
      if (targetSlotKey.startsWith('vfx_')) {
        const vfxId = targetSlotKey.replace('vfx_', '') as SkillVfxType;
        setSelectedVfx(vfxId);
        setTestAction('skill');
        setVfxTick((t) => t + 1);
      }
    } catch (err) {
      setStatusMsg(`Lỗi tải: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    actionKey?: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadToSpecificSlot(selectedSlotKey, selectedSlotMeta.label, file, actionKey);
    e.target.value = '';
  };

  const handleResetSlot = async (targetSlotKey: string) => {
    setBusy(true);
    try {
      const targetOv = overrides.find((o) => o.slotKey === targetSlotKey);
      await fetch(`/api/assets/override/${encodeURIComponent(targetSlotKey)}`, {
        method: 'DELETE',
        headers: {
          'x-admin-email': email || '',
        },
      }).catch(() => {});
      await deleteLocalGlbBuffer(targetSlotKey).catch(() => {});
      assetRegistry.removeOverrideRuntime(targetSlotKey);
      await onDeleteOverride(targetSlotKey, targetOv?.id);
      if (targetSlotKey === selectedSlotKey) {
        setModelUrl('');
      }
      setStatusMsg(`Đã khôi phục mặc định cho [${targetSlotKey}].`);
    } finally {
      setBusy(false);
    }
  };

  const handleApplyUrlOrTransform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelUrl.trim()) return;
    setBusy(true);
    try {
      const cleanUrl = modelUrl.trim();
      const existingTarget = overrides.find((o) => o.slotKey === selectedSlotKey);

      await onSaveOverride({
        slotKey: selectedSlotKey,
        label: selectedSlotMeta.label,
        modelUrl: cleanUrl,
        scale,
        offsetY,
        rotationY,
        actions: existingTarget?.actions,
        existingId: existingTarget?.id,
      });
      setStatusMsg('Đã cập nhật tỷ lệ & vị trí tài nguyên trên máy chủ!');
    } catch (err) {
      setStatusMsg(`Lỗi lưu: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleExportManifest = () => {
    const data = JSON.stringify(overrides, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tan-the-3d-manifest.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const isMonsterSlot = selectedSlotKey.startsWith('mob_') || selectedSlotKey.startsWith('boss_');
  const isVfxSlot = selectedSlotKey.startsWith('vfx_');
  const isMapSlot = selectedSlotKey.startsWith('map_') || selectedSlotKey.startsWith('prop_');
  const previewMode = isVfxSlot
    ? 'vfx'
    : isMapSlot
    ? 'map'
    : isMonsterSlot
    ? 'monster'
    : 'character';

  const characterClass: ClassId =
    selectedSlotMeta.classOwner ||
    (selectedSlotKey.includes('esper')
      ? 'esper'
      : selectedSlotKey.includes('evolver')
      ? 'evolver'
      : 'vanguard');

  const activeClassDef = CLASSES_DATA[characterClass];

  const mobStyle = selectedSlotKey.includes('hound')
    ? 'hound'
    : selectedSlotKey.includes('bot')
    ? 'mecha'
    : selectedSlotKey.includes('golem')
    ? 'golem'
    : 'mutant';

  const isBossSlot = selectedSlotKey.startsWith('boss_');
  const activeActionList = previewMode === 'monster' ? MONSTER_ACTIONS : CHARACTER_ACTIONS;
  const portraitSlotKey = `portrait_${characterClass}`;
  const hasCustomPortrait = overrides.some((o) => o.slotKey === portraitSlotKey);

  const itemIconSlotKey = `icon_item_${selectedSlotKey}`;
  const hasCustomItemIcon = overrides.some((o) => o.slotKey === itemIconSlotKey);

  return (
    <div className="absolute inset-0 z-50 bg-black/92 flex items-center justify-center p-2">
      <div className="w-full max-w-[1240px] h-[97%] max-h-[750px] bg-[#0d1017] border border-zinc-700 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-[#111520] gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-black text-white truncate uppercase tracking-tight">
                Xưởng Tài Nguyên 3D · Nhân Vật · Hiệu Ứng Chiêu Thức
              </h2>
              <p className="text-[10px] text-zinc-400 truncate">
                Hỗ trợ .GLB, .FBX, .OBJ, Godot (.TSCN/.TRES), Video (.MP4/.WEBM), Ảnh (.PNG/.GIF/.WEBP), .JSON/.EFK
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportManifest}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-[11px] font-bold text-zinc-200 flex items-center gap-1.5 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Xuất JSON</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-rose-500/20 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Studio Category Tabs */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border-b border-zinc-800 shrink-0 overflow-x-auto touch-scroll-x">
          {[
            { id: 'character' as const, label: 'NHÂN VẬT & SKILL', icon: User },
            { id: 'gear' as const, label: 'VŨ KHÍ 3D (T1-T10)', icon: Sword },
            { id: 'armor' as const, label: 'GIÁP & TRANG BỊ 3D', icon: Layers },
            { id: 'mounts' as const, label: 'CÁNH & THÚ CƯỠI', icon: Flame },
            { id: 'vfx' as const, label: 'HIỆU ỨNG SKILL 3D', icon: Sparkles },
            { id: 'map_ground' as const, label: 'MẶT ĐẤT & THẢM CỎ', icon: MapIcon },
            { id: 'map_buildings' as const, label: 'KIẾN TRÚC & NHÀ CỬA', icon: Box },
            { id: 'map_props' as const, label: 'CÂY CỐI, ĐÁ & TƯỢNG', icon: Box },
            { id: 'map_env' as const, label: 'BẢN ĐỒ TOÀN CẢNH 3D', icon: MapIcon },
            { id: 'town' as const, label: 'NPC HOÀNG THÀNH', icon: User },
            { id: 'monster' as const, label: 'QUÁI VẬT', icon: Skull },
            { id: 'boss' as const, label: 'BOSS TRÙM', icon: Flame },
            { id: 'map_editor' as const, label: 'TRÌNH TẠO MAP (UNITY STYLE)', icon: MapIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/20'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main 3-Column Studio Grid — Explicit minmax(0,1fr) row prevents CSS Grid auto-row blowout on mobile! */}
        {activeTab === 'map_editor' ? (
          <div className="flex-1 p-4 overflow-y-auto bg-[#0d1017] flex flex-col gap-4 min-h-0 touch-scroll-y">
            <div className="bg-[#111520] border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 shrink-0">
              <h3 className="text-sm font-black text-amber-400 uppercase tracking-wide">
                Trình Tạo & Kéo Thả Tài Nguyên Bản Đồ (Unity / Godot Style)
              </h3>
              <p className="text-xs text-zinc-400">
                Chọn Bản Đồ (Map 2-32), chọn đối tượng 3D (Nhà, Cây, Đá, Tường, Trụ), điều chỉnh tọa độ X, Z, Tỷ lệ và Góc xoay rồi nhấn Thêm vào Map để tự xây dựng map theo ý thích!
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-300 mb-1">Chọn Bản Đồ</label>
                  <select
                    value={editorMapId}
                    onChange={(e) => setEditorMapId(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    {MAPS_DATA.map((m) => (
                      <option key={m.id} value={m.id}>
                        Map {m.id} - {m.name} ({m.biome})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-300 mb-1">Chọn Tài Nguyên 3D</label>
                  <select
                    value={editorSlotKey}
                    onChange={(e) => setEditorSlotKey(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    {REPLACEABLE_3D_SLOTS.filter((s) => s.category.includes('Bản Đồ') || s.category.includes('Quái Vật')).map((s) => (
                      <option key={s.slotKey} value={s.slotKey}>
                        {s.label} ({s.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">Tọa độ X</label>
                    <input
                      type="number"
                      step="1"
                      value={editorX}
                      onChange={(e) => setEditorX(parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">Tọa độ Z</label>
                    <input
                      type="number"
                      step="1"
                      value={editorZ}
                      onChange={(e) => setEditorZ(parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">Tỷ Lệ (Scale)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.2"
                      max="10"
                      value={editorScale}
                      onChange={(e) => setEditorScale(parseFloat(e.target.value) || 1)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-300 mb-1">Góc Xoay Y (Độ)</label>
                    <input
                      type="number"
                      step="15"
                      value={editorRotationY}
                      onChange={(e) => setEditorRotationY(parseFloat(e.target.value) || 0)}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const newPlc = {
                      id: 'plc_' + Math.random().toString(36).substring(2, 9),
                      mapId: editorMapId,
                      slotKey: editorSlotKey,
                      x: editorX,
                      z: editorZ,
                      scale: editorScale,
                      rotationY: editorRotationY,
                    };
                    assetRegistry.saveMapPlacement(newPlc);
                    setEditorRev((n) => n + 1);
                    setStatusMsg(`Đã đặt tài nguyên [${editorSlotKey}] vào Map S${editorMapId} thành công!`);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Thêm Đối Tượng Vào Map</span>
                </button>
              </div>
            </div>

            {/* Placements List */}
            <div className="bg-[#111520] border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 flex-1 min-h-0">
              <h4 className="text-xs font-black text-zinc-300 uppercase tracking-wider">
                Danh Sách Đối Tượng Đã Đặt Trên Map S{editorMapId} ({assetRegistry.getMapPlacements(editorMapId).length})
              </h4>
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
                {assetRegistry.getMapPlacements(editorMapId).length === 0 ? (
                  <div className="text-xs text-zinc-500 py-6 text-center italic">
                    Chưa có đối tượng nào được đặt trên bản đồ này. Hãy dùng form trên để thêm tài nguyên 3D!
                  </div>
                ) : (
                  assetRegistry.getMapPlacements(editorMapId).map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
                      <div className="text-xs text-white font-bold flex items-center gap-3">
                        <span className="text-amber-400 font-mono">[{p.slotKey}]</span>
                        <span className="text-zinc-400 font-mono">X: {p.x}, Z: {p.z}</span>
                        <span className="text-zinc-500 font-mono">Scale: {p.scale}x</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          assetRegistry.deleteMapPlacement(p.id);
                          setEditorRev((n) => n + 1);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[11px] font-bold hover:bg-rose-500/20"
                      >
                        Xóa
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 md:grid-rows-[minmax(0,1fr)] gap-3 p-3 overflow-y-auto md:overflow-hidden touch-scroll-y studio-scroll min-h-0">

          {/* Column 1: Slot Picker */}
          <div className="col-span-12 md:col-span-4 bg-[#111520] border border-zinc-800 rounded-xl p-2.5 flex flex-col max-h-[300px] md:max-h-none md:h-full min-h-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 mb-1.5 px-1 shrink-0">
              <div className="text-[10px] font-black text-amber-500 uppercase tracking-wider truncate">
                {activeTab === 'character' ? 'CHỌN HỆ NHÂN VẬT' : 'CHỌN MỤC TÀI NGUYÊN'}
              </div>
              <div className="text-[9px] font-bold text-zinc-400 shrink-0">
                {filteredSlots.length} mục · Vuốt lên/xuống
              </div>
            </div>

            {activeTab === 'gear' && (
              <div className="flex items-center gap-1 mb-2 shrink-0 overflow-x-auto touch-scroll-x pb-0.5">
                {[
                  { id: 'all' as const, label: 'Tất Cả (30)' },
                  { id: 'vanguard' as const, label: 'Chiến Binh' },
                  { id: 'esper' as const, label: 'Dị Năng' },
                  { id: 'evolver' as const, label: 'Đột Biến' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setGearClassFilter(f.id)}
                    className={`px-2 py-1 rounded-lg text-[9px] font-black whitespace-nowrap transition-all ${
                      gearClassFilter === f.id
                        ? 'bg-amber-500 text-zinc-950'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'armor' && (
              <div className="flex items-center gap-1 mb-2 shrink-0 overflow-x-auto touch-scroll-x pb-0.5">
                {[
                  { id: 'all' as const, label: 'Tất Cả' },
                  { id: 'armor_' as const, label: 'Giáp' },
                  { id: 'helm_' as const, label: 'Mũ' },
                  { id: 'gloves_' as const, label: 'Găng' },
                  { id: 'pants_' as const, label: 'Quần' },
                  { id: 'boots_' as const, label: 'Giày' },
                  { id: 'ring_' as const, label: 'Nhẫn' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setArmorPartFilter(f.id)}
                    className={`px-2 py-1 rounded-lg text-[9px] font-black whitespace-nowrap transition-all ${
                      armorPartFilter === f.id
                        ? 'bg-amber-500 text-zinc-950'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto touch-scroll-y studio-scroll pr-1.5 pb-2">
              {activeTab === 'vfx' ? (
                CLASS_ORDER.map((cid) => {
                  const clsSlots = filteredSlots.filter((s) => s.classOwner === cid);
                  return (
                    <div key={cid} className="space-y-1 mb-2.5">
                      <div
                        className="text-[10px] font-black uppercase px-1.5 py-1 rounded bg-zinc-900/90 border-l-2"
                        style={{
                          borderColor: CLASSES_DATA[cid].primaryColor,
                          color: CLASSES_DATA[cid].primaryColor,
                        }}
                      >
                        {CLASSES_DATA[cid].name} (6 Chiêu)
                      </div>
                      {clsSlots.map((slot) => {
                        const hasCustom = overrides.some((o) => o.slotKey === slot.slotKey);
                        const active = selectedSlotKey === slot.slotKey;
                        return (
                          <button
                            key={slot.slotKey}
                            type="button"
                            onClick={() => setSelectedSlotKey(slot.slotKey)}
                            className={`w-full p-2 rounded-lg border text-left transition-all ${
                              active
                                ? 'bg-amber-500/20 border-amber-500'
                                : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="text-[11px] font-bold text-white truncate">
                                {slot.label}
                              </div>
                              {hasCustom && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              ) : (
                filteredSlots.map((slot) => {
                  const hasCustom = overrides.some((o) => o.slotKey === slot.slotKey);
                  const active = selectedSlotKey === slot.slotKey;
                  const clsSkillsCount =
                    activeTab === 'character' && slot.classOwner
                      ? CLASSES_DATA[slot.classOwner].skills.filter((sk) =>
                          overrides.some((o) => o.slotKey === `vfx_${sk.vfx}`)
                        ).length
                      : 0;
                  return (
                    <button
                      key={slot.slotKey}
                      type="button"
                      onClick={() => setSelectedSlotKey(slot.slotKey)}
                      className={`w-full p-2.5 rounded-xl border text-left transition-all ${
                        active
                          ? 'bg-amber-500/20 border-amber-500 shadow-md'
                          : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="text-[9px] font-bold text-zinc-500 mb-0.5 uppercase">
                        {slot.category}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-black text-white truncate">{slot.label}</div>
                        {hasCustom && (
                          <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        )}
                      </div>
                      {activeTab === 'character' && slot.classOwner && (
                        <div className="mt-1 text-[10px] text-amber-300/90 font-semibold">
                          6 Chiêu riêng · Đã thay {clsSkillsCount}/6 VFX
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {activeTab === 'character' && (
              <div className="mt-2 pt-2 border-t border-zinc-800 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold text-zinc-300">
                  <span className="flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                    Ảnh Đại Diện 2D ({activeClassDef.name})
                  </span>
                  {hasCustomPortrait && (
                    <button
                      type="button"
                      onClick={() => handleResetSlot(portraitSlotKey)}
                      className="text-[9px] text-rose-400 hover:underline"
                    >
                      Xoá
                    </button>
                  )}
                </div>
                <label className="w-full py-1.5 px-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[10px] font-bold text-amber-300 flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{hasCustomPortrait ? 'Đổi Ảnh Nhân Vật' : 'Tải Ảnh Nhân Vật (.PNG/.WEBP)'}</span>
                  <input
                    type="file"
                    disabled={busy}
                    accept="image/*"
                    onChange={async (ev) => {
                      const f = ev.target.files?.[0];
                      if (f) {
                        await uploadToSpecificSlot(
                          portraitSlotKey,
                          `Avatar 2D: ${activeClassDef.name}`,
                          f
                        );
                      }
                      ev.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Column 2: 3D Preview + Primary Upload */}
          <div className="col-span-12 md:col-span-4 flex flex-col min-h-[280px] md:h-full md:min-h-0 gap-2 overflow-hidden">
            <div className="flex-1 relative rounded-xl overflow-hidden min-h-[160px] border border-zinc-800 bg-zinc-950 shadow-2xl">
              <Studio3DPreviewCanvas
                mode={previewMode}
                slotKey={selectedSlotKey}
                modelUrl={modelUrl}
                action={testAction}
                mounted={mounted}
                classId={characterClass}
                mobStyle={mobStyle}
                isBoss={isBossSlot}
                scale={scale}
                offsetY={offsetY}
                rotationY={rotationY}
                accentColor={accentColor}
                vfxType={selectedVfx}
                vfxTriggerTick={vfxTick}
                isRotatedPortrait={isRotatedPortrait}
              />

              <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-zinc-950/90 border border-white/10 text-[10px] text-amber-300 font-black flex items-center gap-1.5 pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="truncate max-w-[230px]">LIVE 3D: {selectedSlotMeta.label}</span>
              </div>
            </div>

            {/* Primary Model / VFX File Upload (Unrestricted file picker for Android/iOS .tscn/.glb/.fbx/.mp4 compatibility!) */}
            <div className="p-2 rounded-xl bg-zinc-950 border border-amber-500/35 flex flex-col gap-1.5 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-black text-amber-400 flex items-center gap-1.5 truncate">
                  <Box className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {isVfxSlot
                      ? 'FILE HIỆU ỨNG (.GLB / .FBX / .TSCN / .MP4 / .PNG / .JSON)'
                      : 'MÔ HÌNH 3D CHÍNH (.GLB / .GLTF / .FBX / .OBJ)'}
                  </span>
                </div>
                {currentOverride?.modelUrl && (
                  <span className="text-[9px] font-bold text-emerald-400 uppercase px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/30 shrink-0">
                    ĐÃ GÁN
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <label className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-[11px] cursor-pointer transition-all active:scale-[0.98] min-w-0">
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {busy ? 'ĐANG ĐỒNG BỘ...' : `TẢI 3D: ${selectedSlotMeta.label}`}
                  </span>
                  <input
                    type="file"
                    disabled={busy}
                    onChange={(e) => handleFileUpload(e)}
                    className="hidden"
                  />
                </label>

                {(activeTab === 'gear' || activeTab === 'armor' || activeTab === 'mounts') && (
                  <label
                    className={`py-2 px-2.5 rounded-lg border cursor-pointer text-[10px] font-black flex items-center gap-1 shrink-0 transition-all ${
                      hasCustomItemIcon
                        ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white'
                    }`}
                    title="Gán ảnh Icon 2D cho món trang bị này trong Túi Đồ"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{hasCustomItemIcon ? 'Đổi Icon' : 'Icon 2D'}</span>
                    <input
                      type="file"
                      disabled={busy}
                      accept="image/*"
                      onChange={async (ev) => {
                        const f = ev.target.files?.[0];
                        if (f) {
                          await uploadToSpecificSlot(
                            itemIconSlotKey,
                            `Icon 2D: ${selectedSlotMeta.label}`,
                            f
                          );
                        }
                        ev.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {(selectedSlotKey.startsWith('weapon_') || selectedSlotMeta.category === 'Vũ Khí 3D') && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onEquipCustomWeapon?.(selectedSlotKey)}
                  className="w-full py-1.5 px-3 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-zinc-950 font-black text-[11px] flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] transition-all"
                >
                  <Sword className="w-3.5 h-3.5 text-zinc-950" />
                  <span>MẶC VŨ KHÍ NÀY VÀO NHÂN VẬT NGAY</span>
                </button>
              )}
            </div>
          </div>

          {/* Column 3: Character Skills + Animation Mapping + Transform Calibration */}
          <div className="col-span-12 md:col-span-4 flex flex-col gap-2 md:h-full min-h-0 overflow-hidden">
            <div className="flex-1 bg-[#111520] border border-zinc-800 rounded-xl p-2.5 flex flex-col min-h-0 overflow-hidden">
              {activeTab === 'character' ? (
                <>
                  {/* Sub-switcher inside NHÂN VẬT: 6 Chiêu Thức Của Nhân Vật vs Hoạt Động Xương */}
                  <div className="flex items-center gap-1.5 mb-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCharPanelSection('skills')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-all ${
                        charPanelSection === 'skills'
                          ? 'bg-amber-500 text-zinc-950'
                          : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>6 Chiêu: {activeClassDef.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCharPanelSection('anims')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-all ${
                        charPanelSection === 'anims'
                          ? 'bg-amber-500 text-zinc-950'
                          : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>Hành Động (Anim)</span>
                    </button>
                  </div>

                  {charPanelSection === 'skills' ? (
                    <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto touch-scroll-y studio-scroll pr-1.5 pb-1">
                      {activeClassDef.skills.map((sk, idx) => {
                        const vfxSlotKey = `vfx_${sk.vfx}`;
                        const iconSlotKey = `icon_skill_${sk.id}`;
                        const hasVfxOv = overrides.some((o) => o.slotKey === vfxSlotKey);
                        const hasIconOv = overrides.some((o) => o.slotKey === iconSlotKey);
                        const isTestingThis = selectedVfx === sk.vfx && testAction === 'skill';

                        return (
                          <div
                            key={sk.id}
                            className={`p-2 rounded-xl border transition-all ${
                              isTestingThis
                                ? 'bg-amber-500/10 border-amber-500/60'
                                : 'bg-zinc-950 border-zinc-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0">
                                  <SkillIconSVG
                                    vfx={sk.vfx}
                                    color={sk.color}
                                    skillId={sk.id}
                                    className="w-5 h-5"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[11px] font-black text-white truncate">
                                    Chiêu {idx + 1}: {sk.name}
                                  </div>
                                  <div className="text-[9px] text-zinc-400 truncate">
                                    Lv.{sk.unlockLevel} · {sk.mpCost} MP ·{' '}
                                    {hasVfxOv ? (
                                      <span className="text-emerald-400 font-bold">VFX Mới</span>
                                    ) : (
                                      <span>VFX Mặc định</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedVfx(sk.vfx);
                                  setAccentColor(sk.color);
                                  setTestAction(`skill${idx + 1}` as any);
                                  setVfxTick((t) => t + 1);
                                }}
                                className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-zinc-950 border border-amber-500/40 text-[10px] font-black flex items-center gap-1 shrink-0 transition-all"
                                title="Xem nhân vật tung chiêu này"
                              >
                                <Play className="w-3 h-3" />
                                <span>Thử</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* Upload Custom 3D / .tscn / Video / Image VFX for this exact skill */}
                              <label
                                className={`flex-1 py-1 px-2 rounded-lg border cursor-pointer text-[9px] font-black uppercase flex items-center justify-center gap-1 transition-all ${
                                  hasVfxOv
                                    ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
                                    : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                                }`}
                              >
                                <Upload className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  {hasVfxOv ? 'Đổi VFX Chiêu' : 'Thay VFX (.GLB/.TSCN/.MP4)'}
                                </span>
                                <input
                                  type="file"
                                  disabled={busy}
                                  onChange={async (ev) => {
                                    const f = ev.target.files?.[0];
                                    if (f) {
                                      await uploadToSpecificSlot(
                                        vfxSlotKey,
                                        `[${activeClassDef.name}] Chiêu ${idx + 1}: ${sk.name}`,
                                        f
                                      );
                                    }
                                    ev.target.value = '';
                                  }}
                                  className="hidden"
                                />
                              </label>

                              {/* Upload Custom Skill Animation (__custom_skillN) */}
                              <label
                                className={`py-1 px-2 rounded-lg border cursor-pointer text-[9px] font-black uppercase flex items-center gap-1 shrink-0 transition-all ${
                                  currentOverride?.actions?.[`skill${idx + 1}`]
                                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'
                                }`}
                                title="Đổi hành động (Animation) khi tung chiêu này"
                              >
                                <FileCode className="w-3 h-3" />
                                <span>Anim</span>
                                <input
                                  type="file"
                                  disabled={busy}
                                  onChange={(e) => handleFileUpload(e, `skill${idx + 1}`)}
                                  className="hidden"
                                />
                              </label>

                              {/* Upload Custom 2D Skill Icon */}
                              <label
                                className={`py-1 px-2 rounded-lg border cursor-pointer text-[9px] font-black uppercase flex items-center gap-1 shrink-0 transition-all ${
                                  hasIconOv
                                    ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'
                                }`}
                                title="Đổi Icon 2D trên thanh kỹ năng"
                              >
                                <ImageIcon className="w-3 h-3" />
                                <span>Icon</span>
                                <input
                                  type="file"
                                  disabled={busy}
                                  accept="image/*"
                                  onChange={async (ev) => {
                                    const f = ev.target.files?.[0];
                                    if (f) {
                                      await uploadToSpecificSlot(
                                        iconSlotKey,
                                        `Icon Chiêu ${idx + 1}: ${sk.name}`,
                                        f
                                      );
                                    }
                                    ev.target.value = '';
                                  }}
                                  className="hidden"
                                />
                              </label>

                              {(hasVfxOv || hasIconOv) && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={async () => {
                                    if (hasVfxOv) await handleResetSlot(vfxSlotKey);
                                    if (hasIconOv) await handleResetSlot(iconSlotKey);
                                  }}
                                  className="p-1 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-rose-400"
                                  title="Khôi phục hiệu ứng gốc"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto touch-scroll-y studio-scroll pr-1.5 pb-1">
                      {CHARACTER_ACTIONS.map((action) => {
                        const hasAnim = currentOverride?.actions?.[action.key];
                        return (
                          <div
                            key={action.key}
                            className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="text-[10px] font-black text-white">{action.label}</div>
                              <div className="text-[9px] text-zinc-500 font-mono truncate">
                                {action.key}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setTestAction(action.key as ActorActionType);
                                  if (action.key === 'mount') setMounted(true);
                                  else if (action.key === 'idle') setMounted(false);
                                }}
                                className={`p-1.5 rounded-lg border transition-all ${
                                  testAction === action.key
                                    ? 'bg-amber-500 border-amber-400 text-zinc-950'
                                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'
                                }`}
                                title="Xem thử hành động"
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                              <label
                                className={`p-1.5 rounded-lg border cursor-pointer transition-all flex items-center gap-1 ${
                                  hasAnim
                                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                                }`}
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span className="text-[9px] font-black uppercase">
                                  {hasAnim ? 'ĐỔI' : 'GÁN'}
                                </span>
                                <input
                                  type="file"
                                  disabled={busy}
                                  onChange={(e) => handleFileUpload(e, action.key)}
                                  className="hidden"
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-[10px] font-black text-amber-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileCode className="w-3.5 h-3.5" />
                    <span>
                      {isVfxSlot ? 'THỬ NGHIỆM KÍCH NỔ HIỆU ỨNG' : 'GÁN FILE HOẠT ĐỘNG (ANIMATION)'}
                    </span>
                  </div>

                  {isVfxSlot ? (
                    <div className="flex-1 flex flex-col justify-between gap-2">
                      <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1.5 text-[11px] text-zinc-300">
                        <div className="font-bold text-white">{selectedSlotMeta.label}</div>
                        {selectedSlotMeta.classOwner && (
                          <div className="text-amber-300 font-semibold">
                            Nhân vật sở hữu: {CLASSES_DATA[selectedSlotMeta.classOwner].name}
                          </div>
                        )}
                        <div className="text-[10px] text-zinc-400 leading-relaxed">
                          Tải lên file 3D (.glb, .fbx, .obj), hiệu ứng Godot (.tscn, .tres), Particle JSON (.json, .efk), Video (.mp4, .webm) hoặc Ảnh (.gif, .png, .webp). Hệ thống tự động gắn vào chiêu thức tương ứng!
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTestAction('skill');
                          setVfxTick((t) => t + 1);
                        }}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-zinc-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg"
                      >
                        <Flame className="w-4 h-4" />
                        <span>PHÓNG THỬ HIỆU ỨNG TRÊN 3D</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto touch-scroll-y studio-scroll pr-1.5 pb-1">
                      {activeActionList.map((action) => {
                        const hasAnim = currentOverride?.actions?.[action.key];
                        return (
                          <div
                            key={action.key}
                            className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="text-[10px] font-black text-white">{action.label}</div>
                              <div className="text-[9px] text-zinc-500 font-mono truncate">
                                {action.key}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setTestAction(action.key as any)}
                                className={`p-1.5 rounded-lg border transition-all ${
                                  testAction === action.key
                                    ? 'bg-amber-500 border-amber-400 text-zinc-950'
                                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'
                                }`}
                              >
                                <Play className="w-3.5 h-3.5" />
                              </button>
                              <label
                                className={`p-1.5 rounded-lg border cursor-pointer transition-all flex items-center gap-1 ${
                                  hasAnim
                                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                                }`}
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span className="text-[9px] font-black uppercase">
                                  {hasAnim ? 'ĐỔI' : 'GÁN'}
                                </span>
                                <input
                                  type="file"
                                  disabled={busy}
                                  onChange={(e) => handleFileUpload(e, action.key)}
                                  className="hidden"
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Calibration & Global Config */}
            <div className="bg-[#111520] border border-zinc-800 rounded-xl p-2.5 space-y-2 shrink-0">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-black uppercase text-zinc-400">
                    <span>Tỷ lệ</span>
                    <span className="text-amber-400">{scale.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={3.5}
                    step={0.05}
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-black uppercase text-zinc-400">
                    <span>Độ cao</span>
                    <span className="text-amber-400">{offsetY.toFixed(2)}m</span>
                  </div>
                  <input
                    type="range"
                    min={-2.0}
                    max={2.0}
                    step={0.05}
                    value={offsetY}
                    onChange={(e) => setOffsetY(Number(e.target.value))}
                    className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-black uppercase text-zinc-400">
                    <span>Xoay</span>
                    <span className="text-amber-400">{rotationY.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min={-3.14}
                    max={3.14}
                    step={0.1}
                    value={rotationY}
                    onChange={(e) => setRotationY(Number(e.target.value))}
                    className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
              </div>

              {statusMsg && (
                <div className="px-2.5 py-1.5 rounded-lg bg-emerald-950/50 border border-emerald-500/30 text-[10px] text-emerald-300 font-bold truncate">
                  {statusMsg}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleResetSlot(selectedSlotKey)}
                  className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-black text-zinc-400 hover:text-rose-400 hover:border-rose-500/50 transition-all"
                  title="Khôi phục mặc định"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleApplyUrlOrTransform}
                  className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Lưu Tỷ Lệ & Đồng Bộ</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
