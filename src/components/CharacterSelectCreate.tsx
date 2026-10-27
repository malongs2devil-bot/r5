import React, { useEffect, useState } from 'react';
import { Plus, Play, Trash2, ArrowLeft, Sparkles, Box, Eye } from 'lucide-react';
import { AccountDoc, CharacterDoc, ClassId } from '../types/game';
import { CLASSES_DATA, computeDerivedStats, ITEMS_CATALOG } from '../data/gameData';
import { CharacterPreview3D } from '../engine/CharacterPreview3D';
import { assetRegistry } from '../engine/AssetRegistry';
import { ItemIconSVG, PotionIconSVG, SkillIconSVG } from './GameIconRenderer';

interface CharacterSelectCreateProps {
  account: AccountDoc;
  characters: CharacterDoc[];
  loading: boolean;
  isAdmin?: boolean;
  isRotatedPortrait?: boolean;
  onEnterWorld: (char: CharacterDoc) => void;
  onCreateCharacter: (params: {
    name: string;
    classId: ClassId;
    hairColor: string;
    accentColor: string;
  }) => Promise<void>;
  onDeleteCharacter: (charId: string) => Promise<void>;
  onOpenAssetStudio: () => void;
  onBackToGate: () => void;
}

const HAIR_SWATCHES = ['#f59e0b', '#e4e4e7', '#ef4444', '#38bdf8', '#10b981', '#a855f7'];
const ACCENT_SWATCHES = ['#f59e0b', '#ef4444', '#10b981', '#38bdf8', '#fb7185', '#eab308'];

const PREVIEW_WEAPONS: Record<ClassId, string> = {
  esper: 'wpn_esp_t3',
  vanguard: 'wpn_van_t3',
  evolver: 'wpn_evo_t3',
};

export const CharacterSelectCreate: React.FC<CharacterSelectCreateProps> = ({
  account,
  characters,
  loading,
  isAdmin = false,
  isRotatedPortrait = false,
  onEnterWorld,
  onCreateCharacter,
  onDeleteCharacter,
  onOpenAssetStudio,
  onBackToGate,
}) => {
  const [viewMode, setViewMode] = useState<'select' | 'create'>(
    characters.length === 0 ? 'create' : 'select'
  );
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Creation form state
  const [newClassId, setNewClassId] = useState<ClassId>('vanguard');
  const [newName, setNewName] = useState('');
  const [hairColor, setHairColor] = useState('#f59e0b');
  const [accentColor, setAccentColor] = useState('#ef4444');
  const [previewEndgameGear, setPreviewEndgameGear] = useState(false);
  const [portraitErr, setPortraitErr] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [, setAssetTick] = useState(0);

  useEffect(() => {
    return assetRegistry.subscribe(() => setAssetTick((t) => t + 1));
  }, []);

  const activeChar = characters[selectedIdx] || characters[0] || null;
  const createClassDef = CLASSES_DATA[newClassId];

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim().length < 2) return;
    setCreateError(null);
    try {
      await onCreateCharacter({
        name: newName.trim(),
        classId: newClassId,
        hairColor,
        accentColor,
      });
      setSelectedIdx(characters.length);
      setNewName('');
      setViewMode('select');
    } catch {
      setCreateError('Không thể khởi tạo nhân vật. Vui lòng thử lại trong giây lát.');
    }
  };

  return (
    <div className="w-full h-full overflow-hidden bg-[#090b10] flex flex-col">
      {/* Top Bar */}
      <header className="flex items-center justify-between gap-6 px-5 py-2.5 border-b border-zinc-800 bg-[#0d1017] shrink-0">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onBackToGate}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-medium text-zinc-300 hover:text-white whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Máy Chủ
          </button>
          <span className="font-display text-base font-bold text-amber-400 whitespace-nowrap">
            {viewMode === 'select' ? 'Sảnh Chọn Nhân Vật' : 'Khởi Tạo Chiến Binh Mới'}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span>Tài khoản: {account.gameUsername}</span>
          <span aria-hidden="true">·</span>
          <span>Cụm: {account.serverId.toUpperCase()}</span>
          <span aria-hidden="true">·</span>
          <span>Nhân vật: {characters.length}/4</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAssetStudio}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-amber-500/40 text-xs font-medium text-amber-300 hover:bg-zinc-800 whitespace-nowrap shrink-0"
            >
              <Box className="w-3.5 h-3.5" />
              <span>Xưởng 3D</span>
            </button>
          )}
          {viewMode === 'create' && characters.length > 0 && (
            <button
              type="button"
              onClick={() => setViewMode('select')}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-medium text-white hover:bg-zinc-700 whitespace-nowrap shrink-0"
            >
              Danh Sách NV
            </button>
          )}
        </div>
      </header>

      {/* Main Landscape Body — 100% Fit Without Scrollbars */}
      {viewMode === 'select' && activeChar ? (
        <div className="flex-1 grid grid-cols-12 gap-3 p-3 overflow-hidden min-h-0">
          {/* Left: 4 Equal-Height Character Slots */}
          <div className="col-span-3 grid grid-rows-4 gap-2 min-h-0 overflow-hidden">
            {[0, 1, 2, 3].map((slotIdx) => {
              const ch = characters[slotIdx];
              if (!ch) {
                return (
                  <button
                    key={slotIdx}
                    type="button"
                    onClick={() => setViewMode('create')}
                    className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 hover:border-amber-400/70 hover:bg-zinc-900 flex items-center justify-center gap-1.5 px-3 text-xs font-medium text-zinc-400 hover:text-amber-300 transition-colors"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span className="truncate">Ô Trống #{slotIdx + 1} · Tạo Mới</span>
                  </button>
                );
              }
              const cls = CLASSES_DATA[ch.classId];
              const cp = computeDerivedStats(ch).combatPower;
              const isSelected = activeChar.id === ch.id;
              const wpn = ITEMS_CATALOG[ch.equippedWeapon];

              return (
                <div
                  key={ch.id}
                  onClick={() => setSelectedIdx(slotIdx)}
                  className={`px-3 py-2 rounded-xl border cursor-pointer transition-colors flex items-center gap-2.5 overflow-hidden ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-400'
                      : 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  {wpn && (
                    <div className="w-10 h-10 rounded-lg bg-zinc-950/90 border border-zinc-800 flex items-center justify-center shrink-0">
                      <ItemIconSVG item={wpn} className="w-8 h-8" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-display font-bold text-xs text-white truncate">
                        {ch.name}
                      </span>
                      <span className="text-[11px] font-mono-num text-amber-400 shrink-0">
                        Lv.{ch.level}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      {cls.name} · +{ch.enhanceLevel}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono-num text-zinc-300 mt-0.5">
                      <span>LC: {cp.toLocaleString()}</span>
                      <span>M{String(ch.mapId).padStart(2, '0')}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Center: 3D Rotating Character Stage */}
          <div className="col-span-6 relative rounded-xl bg-gradient-to-b from-[#151926] to-[#0a0c12] border border-zinc-800 overflow-hidden flex flex-col min-h-0">
            <div className="flex-1 relative min-h-0">
              <CharacterPreview3D
                isRotatedPortrait={isRotatedPortrait}
                config={{
                  classId: activeChar.classId,
                  hairColor: activeChar.hairColor,
                  accentColor: activeChar.accentColor,
                  equippedWeapon: activeChar.equippedWeapon,
                  equippedArmor: activeChar.equippedArmor,
                  equippedHelm: activeChar.equippedHelm,
                  equippedWings: activeChar.equippedWings,
                  equippedMount: activeChar.equippedMount,
                  enhanceLevel: activeChar.enhanceLevel,
                  mounted: activeChar.mounted,
                }}
              />
            </div>
            <div className="px-3.5 py-1.5 border-t border-zinc-800/80 bg-[#0d1017]/90 flex items-center justify-between text-[11px] text-zinc-400 shrink-0">
              <span className="truncate">Chạm vuốt trái/phải để xoay nhân vật 360°</span>
              <span className="font-mono-num text-amber-400 shrink-0 ml-2 font-semibold">
                Lực Chiến: {computeDerivedStats(activeChar).combatPower.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Right: Selected Character Summary & Enter Game (Zero Scrollbars, Unclipped CTA) */}
          <div className="col-span-3 bg-[#10131c] border border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between overflow-hidden min-h-0">
            <div className="space-y-2.5">
              <div>
                <div className="text-[11px] text-amber-400 font-medium truncate">
                  {CLASSES_DATA[activeChar.classId].name}
                </div>
                <h2 className="font-display text-xl font-bold text-white truncate">
                  {activeChar.name}
                </h2>
                <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                  Cấp {activeChar.level} · Tinh Thạch: {activeChar.gold.toLocaleString()}
                </div>
              </div>

              {/* Equipped Gear Visual Strip */}
              <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-zinc-800">
                {[
                  ITEMS_CATALOG[activeChar.equippedWeapon],
                  ITEMS_CATALOG[activeChar.equippedHelm],
                  ITEMS_CATALOG[activeChar.equippedArmor],
                  ITEMS_CATALOG[activeChar.equippedWings] || ITEMS_CATALOG[activeChar.equippedMount],
                ].map((eq, i) => (
                  <div
                    key={i}
                    title={eq?.name || 'Ô trang bị trống'}
                    className="aspect-square rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center p-1"
                  >
                    {eq ? (
                      <ItemIconSVG item={eq} className="w-full h-full" />
                    ) : (
                      <span className="text-[10px] text-zinc-700">·</span>
                    )}
                  </div>
                ))}
              </div>

              {/* 2x2 Primary Attributes */}
              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px] font-mono-num">
                <div className="bg-zinc-900/90 px-2.5 py-1.5 rounded-lg">
                  <div className="text-zinc-400 text-[10px]">Sức Mạnh (STR)</div>
                  <div className="text-white font-semibold">{activeChar.str}</div>
                </div>
                <div className="bg-zinc-900/90 px-2.5 py-1.5 rounded-lg">
                  <div className="text-zinc-400 text-[10px]">Nhanh Nhẹn (AGI)</div>
                  <div className="text-white font-semibold">{activeChar.agi}</div>
                </div>
                <div className="bg-zinc-900/90 px-2.5 py-1.5 rounded-lg">
                  <div className="text-zinc-400 text-[10px]">Thể Lực (VIT)</div>
                  <div className="text-white font-semibold">{activeChar.vit}</div>
                </div>
                <div className="bg-zinc-900/90 px-2.5 py-1.5 rounded-lg">
                  <div className="text-zinc-400 text-[10px]">Năng Lượng (ENE)</div>
                  <div className="text-white font-semibold">{activeChar.ene}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2.5 border-t border-zinc-800">
              {confirmDeleteId === activeChar.id ? (
                <div className="p-2 rounded-lg bg-rose-950/80 border border-rose-500/50 space-y-1.5">
                  <div className="text-[11px] text-rose-200 truncate">
                    Xác nhận xoá {activeChar.name}?
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        await onDeleteCharacter(activeChar.id);
                        setConfirmDeleteId(null);
                        setSelectedIdx(0);
                      }}
                      className="flex-1 py-1 rounded bg-rose-600 text-[11px] font-semibold text-white whitespace-nowrap"
                    >
                      Xoá Vĩnh Viễn
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 py-1 rounded bg-zinc-800 text-[11px] text-zinc-300 whitespace-nowrap"
                    >
                      Huỷ
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(activeChar.id)}
                  className="w-full py-1.5 px-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-rose-500/50 text-xs text-zinc-400 hover:text-rose-300 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xoá Nhân Vật</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onEnterWorld(activeChar)}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-display font-bold text-sm flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current shrink-0" />
                <span>Bắt Đầu Vào Game</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* CHARACTER CREATION SCREEN — Zero Scrollbars + Illustrated Skill & Weapon Icons */
        <form
          onSubmit={handleCreateSubmit}
          className="flex-1 grid grid-cols-12 gap-3 p-3 overflow-hidden min-h-0"
        >
          {/* Left: 3 Class Cards + 6 Illustrated Skill Badges */}
          <div className="col-span-4 flex flex-col justify-between gap-2 overflow-hidden min-h-0">
            <div className="grid grid-rows-3 gap-1.5 flex-1 min-h-0">
              {(['vanguard', 'esper', 'evolver'] as ClassId[]).map((cid) => {
                const cls = CLASSES_DATA[cid];
                const active = newClassId === cid;
                return (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => {
                      setNewClassId(cid);
                      setAccentColor(cls.primaryColor);
                    }}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl border text-left transition-colors overflow-hidden ${
                      active
                        ? 'bg-amber-500/15 border-amber-400'
                        : 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <div className="w-12 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative">
                      {!portraitErr[cid] ? (
                        <img
                          src={assetRegistry.getCharacterPortraitUrl(cid) || cls.portraitUrl}
                          alt={cls.name}
                          referrerPolicy="no-referrer"
                          onError={() => setPortraitErr((p) => ({ ...p, [cid]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-amber-400 font-display font-bold text-base">
                          {cls.name[0]}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display font-bold text-xs text-white truncate">
                        {cls.name}
                      </div>
                      <div className="text-[10px] text-amber-400 truncate">{cls.title}</div>
                      <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                        {cls.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 6 Class Skills Preview with Custom Skill Icons */}
            <div className="bg-[#10131c] border border-zinc-800 rounded-xl p-2 space-y-1.5 shrink-0">
              <div className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between">
                <span>Bộ 6 Kỹ Năng · {createClassDef.name}</span>
                <span className="text-[10px] text-amber-400">{createClassDef.weaponType}</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {createClassDef.skills.map((sk) => (
                  <div
                    key={sk.id}
                    className="px-1.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center gap-1.5 overflow-hidden"
                  >
                    <SkillIconSVG vfx={sk.vfx} color={sk.color} skillId={sk.id} className="w-5 h-5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-medium text-white truncate">{sk.name}</div>
                      <div className="text-[9px] text-zinc-400 font-mono-num">
                        {Math.round(sk.damageMult * 100)}% · {sk.cooldown}s
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Center: Live 3D Stage (Defaults to Unarmed Starter State!) */}
          <div className="col-span-5 relative rounded-xl bg-gradient-to-b from-[#151926] to-[#0a0c12] border border-zinc-800 overflow-hidden flex flex-col min-h-0">
            <div className="flex-1 relative min-h-0">
              <CharacterPreview3D
                isRotatedPortrait={isRotatedPortrait}
                config={{
                  classId: newClassId,
                  hairColor,
                  accentColor,
                  equippedWeapon: previewEndgameGear ? PREVIEW_WEAPONS[newClassId] : 'none',
                  equippedArmor: previewEndgameGear ? 'arm_t3' : 'none',
                  equippedHelm: previewEndgameGear ? 'hlm_t2' : 'none',
                  equippedWings: previewEndgameGear ? 'wng_t2_cyber' : 'none',
                  equippedMount: previewEndgameGear ? 'mnt_bike' : 'none',
                  enhanceLevel: previewEndgameGear ? 9 : 0,
                  mounted: false,
                }}
              />
              <button
                type="button"
                onClick={() => setPreviewEndgameGear((p) => !p)}
                className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/70 border border-zinc-700 hover:border-amber-400 text-[10px] font-semibold text-amber-300 flex items-center gap-1"
              >
                <Eye className="w-3 h-3" />
                <span>{previewEndgameGear ? 'Xem Khởi Đầu (Trống)' : 'Xem Thử Set Hoàng Kim'}</span>
              </button>
            </div>
            <div className="px-3 py-1.5 bg-[#0d1017]/90 border-t border-zinc-800 text-[10px] text-zinc-300 flex items-center justify-between shrink-0 gap-2">
              <span className="text-zinc-400 truncate">
                Khởi đầu: Không vũ khí/trang bị · Túi có sẵn:
              </span>
              <span className="flex items-center gap-2 font-mono-num font-bold shrink-0">
                <span className="flex items-center gap-1 text-rose-300">
                  <PotionIconSVG kind="hp" className="w-3.5 h-3.5" /> 10 Máu
                </span>
                <span className="flex items-center gap-1 text-sky-300">
                  <PotionIconSVG kind="mp" className="w-3.5 h-3.5" /> 10 Mana
                </span>
              </span>
            </div>
          </div>

          {/* Right: Customization & Name Input */}
          <div className="col-span-3 bg-[#10131c] border border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between overflow-hidden min-h-0">
            <div className="space-y-3">
              <div>
                <div className="text-[11px] text-amber-400 font-medium truncate">
                  {createClassDef.role}
                </div>
                <h2 className="font-display text-lg font-bold text-white truncate">
                  {createClassDef.name}
                </h2>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-zinc-300">
                  Màu Tóc / Kính Ngắm
                </label>
                <div className="flex items-center gap-1.5">
                  {HAIR_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setHairColor(hex)}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        hairColor === hex ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: hex }}
                      aria-label={`Màu tóc ${hex}`}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-zinc-300">
                  Màu Hào Quang Lõi Giáp
                </label>
                <div className="flex items-center gap-1.5">
                  {ACCENT_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setAccentColor(hex)}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        accentColor === hex ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: hex }}
                      aria-label={`Màu lõi giáp ${hex}`}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono-num">
                <div className="bg-zinc-900 px-2 py-1.5 rounded-lg">
                  <span className="text-zinc-400">STR:</span>{' '}
                  <span className="text-white font-semibold">{createClassDef.baseStats.str}</span>
                </div>
                <div className="bg-zinc-900 px-2 py-1.5 rounded-lg">
                  <span className="text-zinc-400">AGI:</span>{' '}
                  <span className="text-white font-semibold">{createClassDef.baseStats.agi}</span>
                </div>
                <div className="bg-zinc-900 px-2 py-1.5 rounded-lg">
                  <span className="text-zinc-400">VIT:</span>{' '}
                  <span className="text-white font-semibold">{createClassDef.baseStats.vit}</span>
                </div>
                <div className="bg-zinc-900 px-2 py-1.5 rounded-lg">
                  <span className="text-zinc-400">ENE:</span>{' '}
                  <span className="text-white font-semibold">{createClassDef.baseStats.ene}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-zinc-300">
                  Đặt Tên Nhân Vật (2–20 ký tự)
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={20}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nhập tên nhân vật..."
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-xs text-white focus:outline-none focus:border-amber-400"
                />
                {createError && (
                  <p className="text-[10px] text-rose-400 leading-tight">{createError}</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || newName.trim().length < 2}
              className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-display font-bold text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{loading ? 'Đang khởi tạo...' : 'Tạo Nhân Vật & Vào Game'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
