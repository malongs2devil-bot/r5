import React, { useEffect, useState } from 'react';
import {
  X,
  Sword,
  Shield,
  Flame,
  Plus,
  Coins,
  Gem,
  ArrowUpCircle,
  CheckCircle2,
  Trash2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  CharacterDoc,
  DerivedStats,
  EquipSlot,
  ItemDef,
} from '../types/game';
import {
  CLASSES_DATA,
  ITEMS_CATALOG,
  RARITY_META,
  SLOT_LABELS,
} from '../data/gameData';
import { CharacterPreview3D } from '../engine/CharacterPreview3D';
import { assetRegistry } from '../engine/AssetRegistry';
import { ItemIconSVG, PotionIconSVG, SlotPlaceholderSVG } from './GameIconRenderer';

interface InventoryPaperdollModalProps {
  character: CharacterDoc;
  derivedStats: DerivedStats;
  hp: number;
  mp: number;
  initialTab?: 'bag' | 'stats' | 'forge';
  isRotatedPortrait?: boolean;
  onClose: () => void;
  onEquipItem: (item: ItemDef, invIndex: number) => void;
  onUnequipSlot: (slot: EquipSlot) => void;
  onUseHpPotion: () => void;
  onUseMpPotion: () => void;
  onSellItem: (invIndex: number) => void;
  onSortBag: () => void;
  onAllocateStat: (stat: 'str' | 'agi' | 'vit' | 'ene', amount: number) => void;
  onAutoAllocateStats: () => void;
  onEnhanceEquipment: () => void;
  forgeNotice?: string | null;
  onToggleMount: () => void;
}

const LEFT_PAPERDOLL_SLOTS: { slot: EquipSlot; key: keyof CharacterDoc }[] = [
  { slot: 'helm', key: 'equippedHelm' },
  { slot: 'armor', key: 'equippedArmor' },
  { slot: 'pants', key: 'equippedPants' },
  { slot: 'boots', key: 'equippedBoots' },
];

const RIGHT_PAPERDOLL_SLOTS: { slot: EquipSlot; key: keyof CharacterDoc }[] = [
  { slot: 'weapon', key: 'equippedWeapon' },
  { slot: 'wings', key: 'equippedWings' },
  { slot: 'gloves', key: 'equippedGloves' },
  { slot: 'ring', key: 'equippedRing' },
  { slot: 'mount', key: 'equippedMount' },
];

type BagSlotEntry =
  | { kind: 'potion_hp'; count: number }
  | { kind: 'potion_mp'; count: number }
  | { kind: 'item'; invIndex: number; item: ItemDef };

export const InventoryPaperdollModal: React.FC<InventoryPaperdollModalProps> = ({
  character,
  derivedStats,
  hp,
  mp,
  initialTab = 'bag',
  isRotatedPortrait = false,
  onClose,
  onEquipItem,
  onUnequipSlot,
  onUseHpPotion,
  onUseMpPotion,
  onSellItem,
  onSortBag,
  onAllocateStat,
  onAutoAllocateStats,
  onEnhanceEquipment,
  forgeNotice = null,
  onToggleMount,
}) => {
  const [tab, setTab] = useState<'bag' | 'stats' | 'forge'>(initialTab);
  const [selectedBagSlotIdx, setSelectedBagSlotIdx] = useState<number | null>(0);
  const [inspectedEquippedSlot, setInspectedEquippedSlot] = useState<EquipSlot | null>(null);
  const [portraitTick, setPortraitTick] = useState(0);

  useEffect(() => {
    return assetRegistry.subscribe(() => setPortraitTick((t) => t + 1));
  }, []);

  // Build unified 40-slot Bag list: Potions (when > 0) + Dropped/Bought Equipment Items!
  const bagEntries: BagSlotEntry[] = [];
  if (character.hpPotions > 0) {
    bagEntries.push({ kind: 'potion_hp', count: character.hpPotions });
  }
  if (character.mpPotions > 0) {
    bagEntries.push({ kind: 'potion_mp', count: character.mpPotions });
  }
  character.inventoryIds.forEach((id, invIndex) => {
    const it = ITEMS_CATALOG[id];
    if (it) {
      bagEntries.push({ kind: 'item', invIndex, item: it });
    }
  });

  const selectedEntry =
    selectedBagSlotIdx !== null ? bagEntries[selectedBagSlotIdx] : undefined;

  const getEquippedItemForSlot = (slot: EquipSlot): ItemDef | undefined => {
    const map: Record<EquipSlot, string> = {
      weapon: character.equippedWeapon,
      helm: character.equippedHelm,
      armor: character.equippedArmor,
      gloves: character.equippedGloves,
      pants: character.equippedPants,
      boots: character.equippedBoots,
      ring: character.equippedRing,
      wings: character.equippedWings,
      mount: character.equippedMount,
    };
    const id = map[slot];
    if (!id || id === 'none') return undefined;
    return ITEMS_CATALOG[id];
  };

  const inspectedEquippedItem = inspectedEquippedSlot
    ? getEquippedItemForSlot(inspectedEquippedSlot)
    : undefined;

  const customPortraitUrl =
    (portraitTick >= 0 ? assetRegistry.getCharacterPortraitUrl(character.classId) : null) ||
    CLASSES_DATA[character.classId].portraitUrl;

  const hpPct = Math.max(0, Math.min(100, (hp / Math.max(1, derivedStats.maxHp)) * 100));
  const mpPct = Math.max(0, Math.min(100, (mp / Math.max(1, derivedStats.maxMp)) * 100));

  const renderPaperdollSlot = (slot: EquipSlot, itemId: string) => {
    const item = itemId && itemId !== 'none' ? ITEMS_CATALOG[itemId] : undefined;
    const rMeta = item ? RARITY_META[item.rarity] : RARITY_META.common;
    const isInspected = inspectedEquippedSlot === slot && selectedBagSlotIdx === null;

    return (
      <button
        key={slot}
        type="button"
        onClick={() => {
          setSelectedBagSlotIdx(null);
          setInspectedEquippedSlot(slot);
        }}
        className={`w-full px-2 py-1.5 rounded-lg border text-left transition-colors flex items-center gap-2 overflow-hidden ${
          item ? `${rMeta.bgClass} ${rMeta.borderClass}` : 'bg-zinc-900/90 border-zinc-800'
        } ${isInspected ? 'ring-2 ring-amber-400' : ''}`}
      >
        <div className="w-8 h-8 rounded-md bg-zinc-950/90 border border-zinc-800 flex items-center justify-center shrink-0">
          {item ? (
            <ItemIconSVG item={item} className="w-7 h-7" />
          ) : (
            <SlotPlaceholderSVG slot={slot} className="w-5 h-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-[9px] text-zinc-400 leading-none">
            <span className="truncate">{SLOT_LABELS[slot]}</span>
            {item && character.enhanceLevel > 0 && (
              <span className="font-mono-num text-amber-400 font-bold ml-1 shrink-0">
                +{character.enhanceLevel}
              </span>
            )}
          </div>
          <div
            className={`text-[10px] font-semibold truncate mt-0.5 ${
              item ? rMeta.textClass : 'text-zinc-500'
            }`}
          >
            {item ? item.name : 'Chưa mặc'}
          </div>
        </div>
      </button>
    );
  };

  const nextEnh = Math.min(15, character.enhanceLevel + 1);
  const goldCost = nextEnh * 650;
  const gemCost = nextEnh >= 7 ? 2 : 1;
  const successRate = nextEnh <= 6 ? 100 : nextEnh <= 9 ? 82 : nextEnh <= 12 ? 65 : 48;

  return (
    <div className="absolute inset-0 z-40 bg-black/84 flex items-center justify-center p-2.5">
      <div className="w-full max-w-[1040px] h-[95%] max-h-[545px] bg-[#0d1017] border border-zinc-700 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-zinc-800 bg-[#111520] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="font-display text-sm font-bold text-amber-400 whitespace-nowrap">
              Nhân Vật · Trang Bị & Túi Đồ
            </h2>
            <div className="flex items-center gap-2.5 text-xs font-mono-num text-zinc-300">
              <span className="flex items-center gap-1 text-amber-300 whitespace-nowrap">
                <Coins className="w-3.5 h-3.5" />
                {character.gold.toLocaleString()}
              </span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1 text-sky-300 whitespace-nowrap">
                <Gem className="w-3.5 h-3.5" />
                {character.gems.toLocaleString()} Ngọc
              </span>
            </div>
          </div>

          {/* Interactive Tab Switcher */}
          <div className="flex items-center gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800 shrink-0">
            <button
              type="button"
              onClick={() => setTab('bag')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                tab === 'bag' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300 hover:text-white'
              }`}
            >
              Túi Đồ ({bagEntries.length}/40)
            </button>
            <button
              type="button"
              onClick={() => setTab('stats')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                tab === 'stats' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300 hover:text-white'
              }`}
            >
              Chỉ Số {character.statPoints > 0 ? `(+${character.statPoints})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setTab('forge')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                tab === 'forge' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300 hover:text-white'
              }`}
            >
              Cường Hoá +{character.enhanceLevel}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white shrink-0"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main 12-Column Studio RPG Layout */}
        <div className="flex-1 grid grid-cols-12 gap-2.5 p-2.5 overflow-hidden min-h-0">
          {/* LEFT 6 COLUMNS: CHARACTER PAPERDOLL WORN ON BODY + 3D LIVE TURNTABLE + SYNCED HP/MP */}
          <div className="col-span-6 bg-[#111520] border border-zinc-800 rounded-xl p-2.5 flex flex-col justify-between overflow-hidden min-h-0">
            <div className="flex items-center justify-between gap-2 px-1 pb-1.5 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={customPortraitUrl}
                  alt={character.name}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-md object-cover border border-amber-500/60 shrink-0 bg-zinc-900"
                />
                <div className="truncate">
                  <span className="font-display font-bold text-xs text-white">
                    {character.name}
                  </span>
                  <span className="text-[11px] text-zinc-400 ml-1.5">
                    Lv.{character.level} · {CLASSES_DATA[character.classId].name}
                  </span>
                </div>
              </div>
              <div className="text-xs font-mono-num font-bold text-amber-400 shrink-0">
                LC: {derivedStats.combatPower.toLocaleString()}
              </div>
            </div>

            {/* Live Synchronized HP & MP Bars (Matches HUD Outside 100%) */}
            <div className="grid grid-cols-2 gap-2 pt-1.5 shrink-0">
              <div className="relative h-3.5 bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
                <div
                  style={{ width: `${hpPct}%` }}
                  className="h-full bg-gradient-to-r from-red-700 to-rose-500 transition-[width] duration-150"
                />
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono-num font-bold text-white drop-shadow">
                  HP: {Math.round(hp)} / {derivedStats.maxHp}
                </span>
              </div>
              <div className="relative h-3.5 bg-zinc-950 border border-zinc-800 rounded overflow-hidden">
                <div
                  style={{ width: `${mpPct}%` }}
                  className="h-full bg-gradient-to-r from-blue-700 to-sky-400 transition-[width] duration-150"
                />
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono-num font-bold text-sky-100 drop-shadow">
                  MP: {Math.round(mp)} / {derivedStats.maxMp}
                </span>
              </div>
            </div>

            {/* 3-Subcolumn Paperdoll: Left 4 Slots | 3D Live Character | Right 5 Slots */}
            <div className="flex-1 grid grid-cols-12 gap-1.5 py-1.5 items-stretch overflow-hidden min-h-0">
              <div className="col-span-4 grid grid-rows-4 gap-1.5 min-h-0">
                {LEFT_PAPERDOLL_SLOTS.map((s) =>
                  renderPaperdollSlot(s.slot, String(character[s.key]))
                )}
              </div>

              <div className="col-span-4 rounded-xl bg-gradient-to-b from-[#181e2e] to-[#0b0e15] border border-zinc-800 relative overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 relative min-h-0">
                  <CharacterPreview3D
                    isRotatedPortrait={isRotatedPortrait}
                    config={{
                      classId: character.classId,
                      hairColor: character.hairColor,
                      accentColor: character.accentColor,
                      equippedWeapon: character.equippedWeapon,
                      equippedArmor: character.equippedArmor,
                      equippedHelm: character.equippedHelm,
                      equippedWings: character.equippedWings,
                      equippedMount: character.equippedMount,
                      enhanceLevel: character.enhanceLevel,
                      mounted: character.mounted,
                    }}
                  />
                </div>
                {character.equippedMount && character.equippedMount !== 'none' && (
                  <button
                    type="button"
                    onClick={onToggleMount}
                    className="m-1 py-1 px-1.5 rounded bg-zinc-900/95 border border-zinc-700 text-[10px] font-medium text-amber-300 hover:bg-zinc-800 truncate shrink-0"
                  >
                    {character.mounted ? 'Xuống Thú' : 'Cưỡi Xem Thử'}
                  </button>
                )}
              </div>

              <div className="col-span-4 grid grid-rows-5 gap-1.5 min-h-0">
                {RIGHT_PAPERDOLL_SLOTS.map((s) =>
                  renderPaperdollSlot(s.slot, String(character[s.key]))
                )}
              </div>
            </div>

            <div className="pt-1 border-t border-zinc-800 flex items-center justify-between text-[10px] text-zinc-400 shrink-0">
              <span className="truncate">{derivedStats.setBonusLabel}</span>
              <span className="font-mono-num text-emerald-400 shrink-0 ml-2">
                TC {derivedStats.atkMin}–{derivedStats.atkMax} · Thủ {derivedStats.defense}
              </span>
            </div>
          </div>

          {/* RIGHT 6 COLUMNS: SWITCHABLE TABS (8x5 ILLUSTRATED BAG / STATS / FORGE +15) */}
          <div className="col-span-6 flex flex-col gap-2 overflow-hidden min-h-0">
            {tab === 'bag' && (
              <>
                <div className="flex-1 bg-[#111520] border border-zinc-800 rounded-xl p-2 flex flex-col overflow-hidden min-h-0">
                  <div className="flex items-center justify-between mb-1.5 shrink-0">
                    <span className="text-xs font-semibold text-zinc-300">
                      Hành Trang ({bagEntries.length}/40 ô · Máu {character.hpPotions} · Mana {character.mpPotions})
                    </span>
                    <button
                      type="button"
                      onClick={onSortBag}
                      className="px-2.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] font-medium text-zinc-200 whitespace-nowrap"
                    >
                      Xếp Gọn Túi Đồ
                    </button>
                  </div>

                  <div className="flex-1 grid grid-cols-8 grid-rows-5 gap-1 min-h-0">
                    {Array.from({ length: 40 }).map((_, idx) => {
                      const entry = bagEntries[idx];
                      const isSel = selectedBagSlotIdx === idx;

                      if (entry?.kind === 'potion_hp') {
                        return (
                          <button
                            key={`pot_hp_${idx}`}
                            type="button"
                            onClick={() => {
                              setSelectedBagSlotIdx(idx);
                              setInspectedEquippedSlot(null);
                            }}
                            title={`Bình Sinh Lực (Còn ${entry.count} bình)`}
                            className={`relative rounded-lg border p-0.5 flex items-center justify-center overflow-hidden bg-rose-950/50 border-rose-500/60 hover:brightness-110 ${
                              isSel ? 'ring-2 ring-amber-400' : ''
                            }`}
                          >
                            <PotionIconSVG kind="hp" className="w-3/4 h-3/4" />
                            <span className="absolute bottom-0.5 right-1 text-[8px] font-mono-num font-bold text-rose-200 bg-black/80 px-1 rounded">
                              x{entry.count}
                            </span>
                          </button>
                        );
                      }

                      if (entry?.kind === 'potion_mp') {
                        return (
                          <button
                            key={`pot_mp_${idx}`}
                            type="button"
                            onClick={() => {
                              setSelectedBagSlotIdx(idx);
                              setInspectedEquippedSlot(null);
                            }}
                            title={`Bình Năng Lượng (Còn ${entry.count} bình)`}
                            className={`relative rounded-lg border p-0.5 flex items-center justify-center overflow-hidden bg-sky-950/50 border-sky-500/60 hover:brightness-110 ${
                              isSel ? 'ring-2 ring-amber-400' : ''
                            }`}
                          >
                            <PotionIconSVG kind="mp" className="w-3/4 h-3/4" />
                            <span className="absolute bottom-0.5 right-1 text-[8px] font-mono-num font-bold text-sky-200 bg-black/80 px-1 rounded">
                              x{entry.count}
                            </span>
                          </button>
                        );
                      }

                      const item = entry?.kind === 'item' ? entry.item : undefined;
                      const rMeta = item ? RARITY_META[item.rarity] : undefined;

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (entry) {
                              setSelectedBagSlotIdx(idx);
                              setInspectedEquippedSlot(null);
                            }
                          }}
                          title={item ? `${item.name} (Bậc ${item.tier})` : `Ô trống #${idx + 1}`}
                          className={`relative rounded-lg border p-0.5 flex items-center justify-center overflow-hidden transition-colors ${
                            item && rMeta
                              ? `${rMeta.bgClass} ${rMeta.borderClass} hover:brightness-110`
                              : 'bg-zinc-950/75 border-zinc-800/80'
                          } ${isSel && entry ? 'ring-2 ring-amber-400' : ''}`}
                        >
                          {item ? (
                            <>
                              <ItemIconSVG item={item} className="w-4/5 h-4/5" />
                              <span className="absolute top-0.5 right-1 text-[8px] font-mono-num font-bold text-zinc-200 bg-black/75 px-0.5 rounded">
                                T{item.tier}
                              </span>
                            </>
                          ) : (
                            <span className="text-[9px] text-zinc-800">·</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Action & Inspection Panel */}
                {selectedEntry?.kind === 'potion_hp' || selectedEntry?.kind === 'potion_mp' ? (
                  <div className="bg-[#111520] border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${
                          selectedEntry.kind === 'potion_hp'
                            ? 'bg-rose-950/50 border-rose-500/60'
                            : 'bg-sky-950/50 border-sky-500/60'
                        }`}
                      >
                        <PotionIconSVG
                          kind={selectedEntry.kind === 'potion_hp' ? 'hp' : 'mp'}
                          className="w-7 h-7"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display font-bold text-xs text-white truncate">
                          {selectedEntry.kind === 'potion_hp'
                            ? `Bình Sinh Lực Cấp Tốc (Còn ${selectedEntry.count})`
                            : `Bình Năng Lượng Tinh Khiết (Còn ${selectedEntry.count})`}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {selectedEntry.kind === 'potion_hp'
                            ? 'Hồi ngay 42% Sinh lực tối đa · Khi hết mua thêm tại Thương Nhân Mira'
                            : 'Hồi ngay 48% Năng lượng tối đa · Khi hết mua thêm tại Thương Nhân Mira'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (selectedEntry.kind === 'potion_hp') onUseHpPotion();
                        else onUseMpPotion();
                      }}
                      className={`px-3 py-1.5 rounded-lg font-display font-bold text-xs flex items-center gap-1 shrink-0 ${
                        selectedEntry.kind === 'potion_hp'
                          ? 'bg-rose-500 hover:bg-rose-400 text-white'
                          : 'bg-sky-500 hover:bg-sky-400 text-zinc-950'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Dùng Ngay</span>
                    </button>
                  </div>
                ) : selectedEntry?.kind === 'item' ? (
                  <div className="bg-[#111520] border border-zinc-800 rounded-xl p-2.5 flex items-center gap-3 shrink-0">
                    <div
                      className={`w-12 h-12 rounded-xl border ${
                        RARITY_META[selectedEntry.item.rarity].bgClass
                      } ${
                        RARITY_META[selectedEntry.item.rarity].borderClass
                      } flex items-center justify-center shrink-0 p-1`}
                    >
                      <ItemIconSVG item={selectedEntry.item} className="w-10 h-10" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-display font-bold text-xs truncate ${
                            RARITY_META[selectedEntry.item.rarity].textClass
                          }`}
                        >
                          {selectedEntry.item.name}
                        </span>
                        <span className="text-[10px] font-mono-num text-zinc-400 shrink-0">
                          {SLOT_LABELS[selectedEntry.item.slot]} · Bậc {selectedEntry.item.tier}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono-num text-zinc-200">
                        {selectedEntry.item.atk > 0 && <span>TC +{selectedEntry.item.atk}</span>}
                        {selectedEntry.item.def > 0 && <span>Thủ +{selectedEntry.item.def}</span>}
                        {selectedEntry.item.hp > 0 && <span>HP +{selectedEntry.item.hp}</span>}
                        {selectedEntry.item.mp > 0 && <span>MP +{selectedEntry.item.mp}</span>}
                        {selectedEntry.item.critPct > 0 && (
                          <span className="text-amber-300">Chí mạng +{selectedEntry.item.critPct}%</span>
                        )}
                        {selectedEntry.item.moveSpdPct > 0 && (
                          <span className="text-emerald-300">
                            Tốc chạy +{selectedEntry.item.moveSpdPct}%
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-[10px] text-zinc-400 truncate">
                          {(() => {
                            const curEq = getEquippedItemForSlot(selectedEntry.item.slot);
                            if (!curEq) return 'Mặc vào sẽ thay trang phục/vũ khí trên người';
                            const diff =
                              selectedEntry.item.atk +
                              selectedEntry.item.def -
                              (curEq.atk + curEq.def);
                            return diff >= 0
                              ? `Thay thế đồ cũ: +${diff} chỉ số`
                              : `Thay thế đồ cũ: ${diff} chỉ số`;
                          })()}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onSellItem(selectedEntry.invIndex);
                              setSelectedBagSlotIdx(null);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-rose-950 border border-zinc-700 text-[11px] font-medium text-zinc-300 hover:text-rose-200 flex items-center gap-1 whitespace-nowrap"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>
                              Bán (+{Math.max(50, Math.round(selectedEntry.item.price * 0.35))})
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={
                              selectedEntry.item.classReq !== 'all' &&
                              selectedEntry.item.classReq !== character.classId
                            }
                            onClick={() => {
                              onEquipItem(selectedEntry.item, selectedEntry.invIndex);
                              setSelectedBagSlotIdx(null);
                            }}
                            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-semibold text-[11px] flex items-center gap-1 whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {selectedEntry.item.classReq !== 'all' &&
                              selectedEntry.item.classReq !== character.classId
                                ? 'Khác hệ phái'
                                : 'Mặc Lên Người'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : inspectedEquippedItem && inspectedEquippedSlot ? (
                  <div className="bg-[#111520] border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-xl border ${
                          RARITY_META[inspectedEquippedItem.rarity].bgClass
                        } ${
                          RARITY_META[inspectedEquippedItem.rarity].borderClass
                        } flex items-center justify-center shrink-0 p-1`}
                      >
                        <ItemIconSVG item={inspectedEquippedItem} className="w-9 h-9" />
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`font-display font-bold text-xs truncate ${
                            RARITY_META[inspectedEquippedItem.rarity].textClass
                          }`}
                        >
                          {inspectedEquippedItem.name} (Đang mặc)
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          TC +{inspectedEquippedItem.atk} · Thủ +{inspectedEquippedItem.def} · HP +{inspectedEquippedItem.hp}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onUnequipSlot(inspectedEquippedSlot);
                        setInspectedEquippedSlot(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-xs font-semibold text-amber-300 flex items-center gap-1 shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Tháo Về Túi</span>
                    </button>
                  </div>
                ) : (
                  <div className="bg-[#111520] border border-zinc-800 rounded-xl p-2.5 text-[11px] text-zinc-400 flex items-center justify-between shrink-0">
                    <span>
                      Đánh quái nhặt trang bị rơi ra để mặc lên người · Mua thêm Bình Máu/Mana tại NPC Mira ở Hoàng Thành.
                    </span>
                  </div>
                )}
              </>
            )}

            {tab === 'stats' && (
              <div className="flex-1 bg-[#111520] border border-zinc-800 rounded-xl p-3 flex flex-col justify-between overflow-hidden min-h-0">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-bold text-xs text-white">
                        Phân Phối Điểm Tiềm Năng Nhân Vật
                      </h3>
                      <p className="text-[11px] text-zinc-400">
                        Điểm chưa cộng:{' '}
                        <span className="text-amber-400 font-mono-num font-bold">
                          {character.statPoints}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={character.statPoints <= 0}
                      onClick={onAutoAllocateStats}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 text-xs font-semibold whitespace-nowrap"
                    >
                      Tự Cộng Chuẩn Hệ Phái
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { key: 'str' as const, label: 'Sức Mạnh (STR)', desc: 'Sát thương Chiến Binh', val: character.str },
                      { key: 'agi' as const, label: 'Nhanh Nhẹn (AGI)', desc: 'Tốc đánh, Chí mạng & Né', val: character.agi },
                      { key: 'vit' as const, label: 'Thể Lực (VIT)', desc: 'Tăng Sinh lực (HP) tối đa', val: character.vit },
                      { key: 'ene' as const, label: 'Năng Lượng (ENE)', desc: 'Sát thương Dị Năng & MP', val: character.ene },
                    ].map((row) => (
                      <div
                        key={row.key}
                        className="p-2 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-1.5"
                      >
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-white truncate">{row.label}</div>
                          <div className="text-[10px] text-zinc-400 truncate">{row.desc}</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-mono-num font-bold text-xs text-amber-300 mr-0.5">
                            {row.val}
                          </span>
                          <button
                            type="button"
                            disabled={character.statPoints < 1}
                            onClick={() => onAllocateStat(row.key, 1)}
                            className="p-1 rounded bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 disabled:opacity-30 text-zinc-200"
                            title="Cộng 1 điểm"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={character.statPoints < 5}
                            onClick={() => onAllocateStat(row.key, 5)}
                            className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 disabled:opacity-30 text-[10px] font-mono-num font-semibold text-zinc-200"
                          >
                            +5
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Detailed Derived Combat Attributes Sheet */}
                <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                  <h3 className="font-display font-bold text-xs text-white">
                    Bảng Tổng Hợp Chỉ Số Chiến Đấu Thực Tế
                  </h3>
                  <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono-num">
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      <div className="text-zinc-400 text-[10px]">Tấn Công</div>
                      <div className="text-white font-semibold mt-0.5 flex items-center gap-1">
                        <Sword className="w-3 h-3 text-amber-400" />
                        {derivedStats.atkMin}–{derivedStats.atkMax}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      <div className="text-zinc-400 text-[10px]">Phòng Thủ</div>
                      <div className="text-white font-semibold mt-0.5 flex items-center gap-1">
                        <Shield className="w-3 h-3 text-sky-400" />
                        {derivedStats.defense.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      <div className="text-zinc-400 text-[10px]">Sinh Lực (HP)</div>
                      <div className="text-emerald-400 font-semibold mt-0.5">
                        {Math.round(hp).toLocaleString()} / {derivedStats.maxHp.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      <div className="text-zinc-400 text-[10px]">Năng Lượng (MP)</div>
                      <div className="text-sky-400 font-semibold mt-0.5">
                        {Math.round(mp).toLocaleString()} / {derivedStats.maxMp.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      <div className="text-zinc-400 text-[10px]">Tỷ Lệ Chí Mạng</div>
                      <div className="text-amber-300 font-semibold mt-0.5">
                        {derivedStats.critRate}%
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      <div className="text-zinc-400 text-[10px]">ST Chí Mạng</div>
                      <div className="text-rose-400 font-semibold mt-0.5">
                        {derivedStats.critDmg}%
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      <div className="text-zinc-400 text-[10px]">Tốc Độ Đánh</div>
                      <div className="text-white font-semibold mt-0.5">{derivedStats.atkSpeed}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      <div className="text-zinc-400 text-[10px]">Né Tránh</div>
                      <div className="text-white font-semibold mt-0.5">{derivedStats.evasion}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      <div className="text-zinc-400 text-[10px]">Tốc Chạy</div>
                      <div className="text-emerald-300 font-semibold mt-0.5">
                        {derivedStats.moveSpeed}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'forge' && (
              <div className="flex-1 bg-[#111520] border border-zinc-800 rounded-xl p-3.5 flex flex-col justify-between overflow-hidden min-h-0">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-amber-400">
                    <Flame className="w-5 h-5 shrink-0" />
                    <h3 className="font-display text-base font-bold text-white truncate">
                      Lò Rèn Cường Hoá Toàn Thân (+0 → +15)
                    </h3>
                  </div>

                  {/* Visual Equipped Gear Altar */}
                  <div className="grid grid-cols-4 gap-2 pt-0.5">
                    {[
                      getEquippedItemForSlot('weapon'),
                      getEquippedItemForSlot('armor'),
                      getEquippedItemForSlot('helm'),
                      getEquippedItemForSlot('wings'),
                    ].map((eq, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col items-center justify-center gap-1"
                      >
                        {eq ? (
                          <>
                            <ItemIconSVG item={eq} className="w-9 h-9" />
                            <span className="text-[9px] text-zinc-300 truncate max-w-full">
                              {eq.name}
                            </span>
                          </>
                        ) : (
                          <span className="text-[10px] text-zinc-600 py-3">Chưa mặc</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 font-mono-num">
                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                      <div className="text-[11px] text-zinc-400">Cấp Hiện Tại</div>
                      <div className="text-xl font-bold text-white mt-0.5">
                        +{character.enhanceLevel}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/40">
                      <div className="text-[11px] text-amber-300">Cấp Kế Tiếp</div>
                      <div className="text-xl font-bold text-amber-400 mt-0.5">+{nextEnh}</div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1 text-xs font-mono-num">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Tinh Thạch cần:</span>
                      <span className={character.gold >= goldCost ? 'text-amber-300' : 'text-rose-400'}>
                        {goldCost.toLocaleString()} / {character.gold.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Ngọc Hỗn Nguyên:</span>
                      <span className={character.gems >= gemCost ? 'text-sky-300' : 'text-rose-400'}>
                        {gemCost} / {character.gems}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Tỷ lệ thành công (Không rớt cấp):</span>
                      <span className="text-emerald-400 font-bold">{successRate}%</span>
                    </div>
                  </div>

                  {forgeNotice && (
                    <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-amber-400/50 text-[11px] font-medium text-amber-300 truncate">
                      {forgeNotice}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={
                    character.enhanceLevel >= 15 ||
                    character.gold < goldCost ||
                    character.gems < gemCost
                  }
                  onClick={() => {
                    onEnhanceEquipment();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-display font-bold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  <span>
                    {character.enhanceLevel >= 15
                      ? 'Đã Đạt Cấp Cường Hoá Tối Thượng +15'
                      : `Đập Đồ Toàn Thân Lên +${nextEnh}`}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
