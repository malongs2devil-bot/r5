import React, { useState } from 'react';
import {
  X,
  ShoppingBag,
  ScrollText,
  Coins,
  CheckCircle2,
  Navigation,
  HeartPulse,
  Sparkles,
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpCircle,
  RotateCcw,
  Zap,
} from 'lucide-react';
import {
  AuthoritativeVaultState,
  CharacterDoc,
  DerivedStats,
  ItemDef,
  NpcDef,
} from '../types/game';
import {
  ALL_ITEMS_LIST,
  CLASSES_DATA,
  ITEMS_CATALOG,
  QUESTS_DATA,
  RARITY_META,
  SLOT_LABELS,
} from '../data/gameData';
import { ItemIconSVG, PotionIconSVG, SkillIconSVG } from './GameIconRenderer';

type CitadelServiceTab = 'quest' | 'shop' | 'healer' | 'vault' | 'trainer';

interface NpcShopQuestModalProps {
  npc: NpcDef;
  character: CharacterDoc;
  derivedStats: DerivedStats;
  hp: number;
  mp: number;
  buffRemainingSec: number;
  vault: AuthoritativeVaultState;
  onClose: () => void;
  onClaimQuest: () => void;
  onGoToQuestMap: (mapId: number) => void;
  onBuyItem: (item: ItemDef) => void;
  onBuyPotions: (kind: 'hp' | 'mp', count: number) => void;
  onHealerRestore: () => void;
  onHealerBuff: () => void;
  onVaultDeposit: (bagIndex: number) => void;
  onVaultWithdraw: (vaultIndex: number) => void;
  onVaultGold: (delta: number) => void;
  onUpgradeSkill: (skillIdx: number) => void;
  onResetStats: () => void;
}

export const NpcShopQuestModal: React.FC<NpcShopQuestModalProps> = ({
  npc,
  character,
  derivedStats,
  hp,
  mp,
  buffRemainingSec,
  vault,
  onClose,
  onClaimQuest,
  onGoToQuestMap,
  onBuyItem,
  onBuyPotions,
  onHealerRestore,
  onHealerBuff,
  onVaultDeposit,
  onVaultWithdraw,
  onVaultGold,
  onUpgradeSkill,
  onResetStats,
}) => {
  const resolveInitialTab = (): CitadelServiceTab => {
    if (npc.action === 'shop') return 'shop';
    if (npc.action === 'healer') return 'healer';
    if (npc.action === 'vault') return 'vault';
    if (npc.action === 'trainer') return 'trainer';
    return 'quest';
  };

  const [activeTab, setActiveTab] = useState<CitadelServiceTab>(resolveInitialTab);
  const [shopFilter, setShopFilter] = useState<'all' | 'weapon' | 'armor' | 'wings_mount'>('all');

  const cls = CLASSES_DATA[character.classId];
  const currentQuest =
    QUESTS_DATA[Math.min(character.questIndex, QUESTS_DATA.length - 1)];
  const questDone = character.questProgress >= currentQuest.requiredKills;
  const rewardItem = currentQuest.rewardItemId
    ? ITEMS_CATALOG[currentQuest.rewardItemId]
    : undefined;

  const shopItems = ALL_ITEMS_LIST.filter((it) => {
    if (it.classReq !== 'all' && it.classReq !== character.classId) return false;
    if (shopFilter === 'weapon') return it.slot === 'weapon';
    if (shopFilter === 'armor') {
      return ['helm', 'armor', 'gloves', 'pants', 'boots', 'ring'].includes(it.slot);
    }
    if (shopFilter === 'wings_mount') return it.slot === 'wings' || it.slot === 'mount';
    return true;
  });

  const buffCost = 0;
  const buffMin = Math.floor(buffRemainingSec / 60);
  const buffSec = buffRemainingSec % 60;

  return (
    <div className="absolute inset-0 z-40 bg-black/84 flex items-center justify-center p-2.5">
      <div className="w-full max-w-[1000px] h-[94%] max-h-[520px] bg-[#0d1017] border border-zinc-700 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* NPC Citadel Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-[#111520] gap-2 shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-amber-400 truncate">
              Hoàng Thành Thánh Tích · {npc.role}
            </div>
            <h2 className="font-display text-base font-bold text-white truncate">
              {npc.name}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800">
              {(
                [
                  { id: 'quest', label: 'Nhiệm Vụ' },
                  { id: 'shop', label: 'Thương Hội' },
                  { id: 'healer', label: 'Đại Tư Tế' },
                  { id: 'vault', label: 'Thủ Khố 60 Ô' },
                  { id: 'trainer', label: 'Đấu Sư' },
                ] as { id: CitadelServiceTab; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`px-2 py-1 rounded text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    activeTab === t.id
                      ? 'bg-amber-500 text-zinc-950'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <span className="text-xs font-mono-num text-amber-300 flex items-center gap-1 whitespace-nowrap">
              <Coins className="w-3.5 h-3.5" />
              {character.gold.toLocaleString()}
            </span>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* NPC Dialogue Strip */}
        <div className="px-4 py-1.5 bg-[#131826] border-b border-zinc-800 text-xs text-zinc-300 italic truncate shrink-0">
          “{npc.greeting}”
        </div>

        {/* 1. QUEST HALL (Đại Thống Chế Vance) */}
        {activeTab === 'quest' && (
          <div className="flex-1 p-3.5 flex items-center overflow-hidden min-h-0">
            <div className="w-full p-4 rounded-xl bg-[#111520] border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ScrollText className="w-4 h-4 text-amber-400 shrink-0" />
                  <h3 className="font-display font-bold text-base text-white truncate">
                    {currentQuest.title}
                  </h3>
                </div>
                <span className="text-xs font-mono-num text-amber-300 shrink-0">
                  Tiến độ máy chủ: {character.questProgress}/{currentQuest.requiredKills}
                </span>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">
                {currentQuest.description}
              </p>

              <div className="w-full h-2.5 rounded-full bg-zinc-900 overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-transform origin-left"
                  style={{
                    transform: `scaleX(${Math.min(
                      1,
                      character.questProgress / Math.max(1, currentQuest.requiredKills)
                    )})`,
                  }}
                />
              </div>

              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs font-mono-num text-zinc-300 flex-wrap">
                  <span>EXP: +{currentQuest.rewardExp.toLocaleString()}</span>
                  <span>· Tinh Thạch: +{currentQuest.rewardGold.toLocaleString()}</span>
                  <span>· Ngọc: +{currentQuest.rewardGems}</span>
                  {rewardItem && (
                    <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                      · <ItemIconSVG item={rewardItem} className="w-6 h-6" />
                      <span>{rewardItem.name}</span>
                    </span>
                  )}
                </div>

                {questDone ? (
                  <button
                    type="button"
                    onClick={onClaimQuest}
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Trả Nhiệm Vụ & Nhận Thưởng</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onGoToQuestMap(currentQuest.targetMapId);
                      onClose();
                    }}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Navigation className="w-4 h-4" />
                    <span>Truyền Tống Tới Bãi Săn Nhiệm Vụ</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. MERCHANT GUILD SHOP (Thương Hội Trưởng Mira) */}
        {activeTab === 'shop' && (
          <div className="flex-1 flex flex-col overflow-hidden p-3 gap-2.5 min-h-0">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'all' as const, label: 'Tất Cả' },
                  { id: 'weapon' as const, label: 'Vũ Khí Hệ Phái' },
                  { id: 'armor' as const, label: 'Giáp Phục' },
                  { id: 'wings_mount' as const, label: 'Cánh & Thú Cưỡi' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setShopFilter(f.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                      shopFilter === f.id
                        ? 'bg-amber-500 text-zinc-950 font-semibold'
                        : 'bg-zinc-900 text-zinc-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={character.gold < 100}
                  onClick={() => onBuyPotions('hp', 5)}
                  className="px-2.5 py-1 rounded-lg bg-rose-950/80 border border-rose-500/50 hover:bg-rose-900 disabled:opacity-40 text-xs text-rose-200 font-mono-num flex items-center gap-1 whitespace-nowrap"
                >
                  <PotionIconSVG kind="hp" className="w-4 h-4" />
                  <span>+5 HP (100)</span>
                </button>
                <button
                  type="button"
                  disabled={character.gold < 100}
                  onClick={() => onBuyPotions('mp', 5)}
                  className="px-2.5 py-1 rounded-lg bg-sky-950/80 border border-sky-500/50 hover:bg-sky-900 disabled:opacity-40 text-xs text-sky-200 font-mono-num flex items-center gap-1 whitespace-nowrap"
                >
                  <PotionIconSVG kind="mp" className="w-4 h-4" />
                  <span>+5 MP (100)</span>
                </button>
              </div>
            </div>

            <div className="flex-1 touch-scroll-y grid grid-cols-2 gap-2 content-start min-h-0">
              {shopItems.map((it) => {
                const rMeta = RARITY_META[it.rarity];
                return (
                  <div
                    key={it.id}
                    className={`p-2.5 rounded-xl border ${rMeta.bgClass} ${rMeta.borderClass} flex items-center justify-between gap-2.5`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-zinc-950/90 border border-zinc-800 flex items-center justify-center shrink-0">
                        <ItemIconSVG item={it} className="w-8 h-8" />
                      </div>
                      <div className="min-w-0">
                        <div className={`font-display font-bold text-xs truncate ${rMeta.textClass}`}>
                          {it.name}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono-num mt-0.5 truncate">
                          {SLOT_LABELS[it.slot]} · Bậc {it.tier} · TC +{it.atk} · Thủ +{it.def}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={
                        character.gold < it.price || character.inventoryIds.length >= 40
                      }
                      onClick={() => onBuyItem(it)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-semibold text-xs flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>{it.price.toLocaleString()}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. HIGH PRIESTESS SANCTUARY (Đại Tư Tế Seraphina) */}
        {activeTab === 'healer' && (
          <div className="flex-1 grid grid-cols-2 gap-3 p-3.5 overflow-hidden min-h-0">
            {/* Free 100% HP/MP Sanctuary Restore */}
            <div className="bg-[#111520] border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-emerald-400">
                  <HeartPulse className="w-5 h-5 shrink-0" />
                  <h3 className="font-display text-sm font-bold text-white">
                    Suối Thánh Hồi Phục Sinh Lực & Năng Lượng
                  </h3>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Thanh tẩy toàn bộ thương tích chiến trường, hồi đầy 100% Sinh Lực (HP) và Năng Lượng (MP) trực tiếp trên máy chủ hoàn toàn miễn phí.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1 font-mono-num text-xs">
                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                    <div className="text-[10px] text-zinc-400">Sinh Lực Hiện Tại</div>
                    <div className="text-rose-300 font-bold mt-0.5">
                      {Math.round(hp).toLocaleString()} / {derivedStats.maxHp.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
                    <div className="text-[10px] text-zinc-400">Năng Lượng Hiện Tại</div>
                    <div className="text-sky-300 font-bold mt-0.5">
                      {Math.round(mp).toLocaleString()} / {derivedStats.maxMp.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={character.gold < 200}
                    onClick={() => onBuyPotions('hp', 10)}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-rose-950/80 border border-rose-500/40 hover:bg-rose-900 disabled:opacity-40 text-xs text-rose-200 font-mono-num flex items-center justify-center gap-1.5"
                  >
                    <PotionIconSVG kind="hp" className="w-4 h-4" />
                    <span>+10 Bình HP (200)</span>
                  </button>
                  <button
                    type="button"
                    disabled={character.gold < 200}
                    onClick={() => onBuyPotions('mp', 10)}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-sky-950/80 border border-sky-500/40 hover:bg-sky-900 disabled:opacity-40 text-xs text-sky-200 font-mono-num flex items-center justify-center gap-1.5"
                  >
                    <PotionIconSVG kind="mp" className="w-4 h-4" />
                    <span>+10 Bình MP (200)</span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={onHealerRestore}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-display font-bold text-xs flex items-center justify-center gap-2"
              >
                <HeartPulse className="w-4 h-4" />
                <span>Trị Liệu Đầy 100% HP & MP (Miễn Phí)</span>
              </button>
            </div>

            {/* 30-Minute Sanctuary Combat Blessing Buff */}
            <div className="bg-[#111520] border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-amber-400">
                    <Sparkles className="w-5 h-5 shrink-0" />
                    <h3 className="font-display text-sm font-bold text-white">
                      Chúc Phúc Đại Tư Tế (30 Phút)
                    </h3>
                  </div>
                  {buffRemainingSec > 0 && (
                    <span className="text-xs font-mono-num text-emerald-400 font-semibold">
                      Còn {buffMin}p{String(buffSec).padStart(2, '0')}s
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed">
                  Ban hào quang Thánh Tích đồng bộ trên máy chủ trong 30 phút đi săn Boss & dã ngoại:
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono-num">
                  <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-amber-300">
                    +20% Tấn Công & Phòng Thủ
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-emerald-300">
                    +15% Sinh Lực Tối Đa
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sky-300">
                    +8% Tốc Độ Di Chuyển
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300">
                    Chi phí: {buffCost === 0 ? 'Miễn Phí (<Lv.15)' : `${buffCost} Tinh Thạch`}
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={character.gold < buffCost}
                onClick={onHealerBuff}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-display font-bold text-xs flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {buffRemainingSec > 0
                    ? 'Làm Mới Chúc Phúc Đủ 30 Phút'
                    : 'Nhận Chúc Phúc Thánh Tích 30 Phút'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* 4. ROYAL SERVER WAREHOUSE (Thủ Khố Hoàng Gia Darius) */}
        {activeTab === 'vault' && (
          <div className="flex-1 grid grid-cols-12 gap-3 p-3 overflow-hidden min-h-0">
            {/* Left 7 Cols: 60-Slot Server Vault + Gold Bank */}
            <div className="col-span-7 bg-[#111520] border border-zinc-800 rounded-xl p-2.5 flex flex-col justify-between overflow-hidden min-h-0">
              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-1.5">
                  <Archive className="w-4 h-4 text-amber-400" />
                  <span className="font-display font-bold text-xs text-white">
                    Kho Hoàng Gia Máy Chủ ({vault.vaultIds.length}/60 ô)
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400">Chạm vật phẩm để Rút về Túi</span>
              </div>

              <div className="flex-1 touch-scroll-y grid grid-cols-10 gap-1 py-2 content-start min-h-0">
                {Array.from({ length: 60 }).map((_, idx) => {
                  const id = vault.vaultIds[idx];
                  const item = id ? ITEMS_CATALOG[id] : undefined;
                  const rMeta = item ? RARITY_META[item.rarity] : undefined;
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={!item}
                      onClick={() => item && onVaultWithdraw(idx)}
                      title={item ? `Rút ${item.name} về Túi Đồ` : `Ô kho #${idx + 1}`}
                      className={`aspect-square rounded-lg border p-0.5 flex items-center justify-center relative overflow-hidden ${
                        item && rMeta
                          ? `${rMeta.bgClass} ${rMeta.borderClass} hover:brightness-110`
                          : 'bg-zinc-950/70 border-zinc-800/80'
                      }`}
                    >
                      {item ? (
                        <ItemIconSVG item={item} className="w-4/5 h-4/5" />
                      ) : (
                        <span className="text-[8px] text-zinc-800">·</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Vault Gold Deposit / Withdraw Controls */}
              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2 shrink-0">
                <div className="text-xs font-mono-num">
                  <span className="text-zinc-400">Quỹ Tinh Thạch Kho: </span>
                  <span className="text-amber-300 font-bold">
                    {vault.vaultGold.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={character.gold < 1000}
                    onClick={() => onVaultGold(1000)}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-35 text-[11px] font-mono-num text-emerald-300 flex items-center gap-1"
                  >
                    <ArrowDownToLine className="w-3 h-3" />
                    <span>Gửi 1K</span>
                  </button>
                  <button
                    type="button"
                    disabled={character.gold < 10000}
                    onClick={() => onVaultGold(10000)}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-35 text-[11px] font-mono-num text-emerald-300"
                  >
                    Gửi 10K
                  </button>
                  <button
                    type="button"
                    disabled={vault.vaultGold < 1000}
                    onClick={() => onVaultGold(-1000)}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-35 text-[11px] font-mono-num text-amber-300 flex items-center gap-1"
                  >
                    <ArrowUpFromLine className="w-3 h-3" />
                    <span>Rút 1K</span>
                  </button>
                  <button
                    type="button"
                    disabled={vault.vaultGold <= 0}
                    onClick={() => onVaultGold(-vault.vaultGold)}
                    className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-35 text-[11px] font-semibold text-zinc-950"
                  >
                    Rút Hết
                  </button>
                </div>
              </div>
            </div>

            {/* Right 5 Cols: Character Bag (Tap to Deposit) */}
            <div className="col-span-5 bg-[#111520] border border-zinc-800 rounded-xl p-2.5 flex flex-col justify-between overflow-hidden min-h-0">
              <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800 shrink-0">
                <span className="font-display font-bold text-xs text-white">
                  Túi Đồ ({character.inventoryIds.length}/40 ô)
                </span>
                <span className="text-[11px] text-zinc-400">Chạm để Cất vào Kho</span>
              </div>

              <div className="flex-1 touch-scroll-y grid grid-cols-8 gap-1 py-2 content-start min-h-0">
                {Array.from({ length: 40 }).map((_, idx) => {
                  const id = character.inventoryIds[idx];
                  const item = id ? ITEMS_CATALOG[id] : undefined;
                  const rMeta = item ? RARITY_META[item.rarity] : undefined;
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={!item || vault.vaultIds.length >= 60}
                      onClick={() => item && onVaultDeposit(idx)}
                      title={item ? `Gửi ${item.name} vào Kho Hoàng Gia` : `Ô túi #${idx + 1}`}
                      className={`aspect-square rounded-lg border p-0.5 flex items-center justify-center relative overflow-hidden ${
                        item && rMeta
                          ? `${rMeta.bgClass} ${rMeta.borderClass} hover:brightness-110`
                          : 'bg-zinc-950/70 border-zinc-800/80'
                      }`}
                    >
                      {item ? (
                        <ItemIconSVG item={item} className="w-4/5 h-4/5" />
                      ) : (
                        <span className="text-[8px] text-zinc-800">·</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-zinc-800 text-[11px] text-zinc-400 truncate shrink-0">
                Dữ liệu Kho Hoàng Gia lưu trữ trực tiếp trên máy chủ trung tâm.
              </div>
            </div>
          </div>
        )}

        {/* 5. GRANDMASTER SKILL TRAINER & STAT RESET (Đấu Sư Marcus) */}
        {activeTab === 'trainer' && (
          <div className="flex-1 flex flex-col p-3 gap-2.5 overflow-hidden min-h-0">
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#111520] border border-zinc-800 shrink-0">
              <div className="min-w-0">
                <div className="font-display font-bold text-xs text-white">
                  Tẩy Tuỷ Kinh Mạch · Đặt Lại Toàn Bộ Điểm Tiềm Năng
                </div>
                <div className="text-[11px] text-zinc-400 truncate">
                  Hoàn trả toàn bộ STR / AGI / VIT / ENE đã cộng về điểm tiềm năng tự do (Phí: 2,000 Tinh Thạch).
                </div>
              </div>
              <button
                type="button"
                disabled={character.gold < 2000 || character.level <= 1}
                onClick={onResetStats}
                className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-amber-500 hover:text-zinc-950 border border-amber-500/50 disabled:opacity-40 text-xs font-semibold text-amber-300 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tẩy Tuỷ (2,000)</span>
              </button>
            </div>

            <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-2 overflow-hidden min-h-0">
              {cls.skills.map((sk, idx) => {
                const curLvl = character.skillLevels[idx] || 1;
                const cost = 450 * curLvl;
                const maxed = curLvl >= 20;
                const multPct = Math.round(sk.damageMult * (1 + (curLvl - 1) * 0.12) * 100);
                return (
                  <div
                    key={sk.id}
                    className="p-2.5 rounded-xl bg-[#111520] border border-zinc-800 flex flex-col justify-between overflow-hidden"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        style={{ borderColor: sk.color }}
                        className="w-9 h-9 rounded-lg bg-zinc-950 border flex items-center justify-center shrink-0"
                      >
                        <SkillIconSVG vfx={sk.vfx} color={sk.color} className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-display font-bold text-xs text-white truncate">
                            {sk.name}
                          </span>
                          <span className="text-[10px] font-mono-num text-amber-400 shrink-0">
                            Lv.{curLvl}/20
                          </span>
                        </div>
                        <div className="text-[10px] font-mono-num text-zinc-400">
                          Uy lực {multPct}% · Hồi {sk.cooldown}s
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={maxed || character.gold < cost}
                      onClick={() => onUpgradeSkill(idx)}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-semibold text-[11px] flex items-center justify-center gap-1 whitespace-nowrap"
                    >
                      {maxed ? (
                        <>
                          <Zap className="w-3.5 h-3.5" />
                          <span>Đạt Cực Cảnh Lv.20</span>
                        </>
                      ) : (
                        <>
                          <ArrowUpCircle className="w-3.5 h-3.5" />
                          <span>Truyền Công ({cost.toLocaleString()})</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
