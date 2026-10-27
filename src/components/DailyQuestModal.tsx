import React from 'react';
import { X, Calendar, Gift, CheckCircle2, Award, Sparkles, Coins, Gem, ArrowRight } from 'lucide-react';
import { CharacterDoc, DailyQuestObj } from '../types/game';
import { ITEMS_CATALOG } from '../data/gameData';
import { generateDailyQuestsForToday } from '../shared/universeData';

interface DailyQuestModalProps {
  char: CharacterDoc;
  onClose: () => void;
  onClaimReward: (questId: string) => void;
}

export const DailyQuestModal: React.FC<DailyQuestModalProps> = ({
  char,
  onClose,
  onClaimReward,
}) => {
  const dailyData = generateDailyQuestsForToday(char.dailyQuests);
  const quests = dailyData.quests;

  const completedCount = quests.filter((q) => q.claimed || q.current >= q.target).length;
  const allClaimed = quests.every((q) => q.claimed);

  return (
    <div className="absolute inset-0 z-50 bg-black/85 flex items-center justify-center p-2.5 backdrop-blur-xs">
      <div className="w-full max-w-[620px] max-h-[90%] bg-[#0d1017] border border-amber-500/40 rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-[#111520] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-white">
                  Nhiệm Vụ Hàng Ngày
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold border border-amber-500/30">
                  {dailyData.dateStr}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Hoàn thành 3 mục tiêu ngẫu nhiên mỗi ngày để nhận Vàng, Ngọc & Đá Cường Hóa!
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Overview Bar */}
        <div className="px-4 py-2.5 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-zinc-300 font-medium">
              Tiến độ hôm nay: <strong className="text-amber-400">{completedCount}/3</strong>
            </span>
          </div>

          <div className="flex items-center gap-1">
            {quests.map((q, idx) => (
              <div
                key={q.id}
                className={`w-6 h-2 rounded-full border ${
                  q.claimed
                    ? 'bg-emerald-500 border-emerald-400'
                    : q.current >= q.target
                    ? 'bg-amber-400 border-amber-300 animate-pulse'
                    : 'bg-zinc-800 border-zinc-700'
                }`}
                title={`Nhiệm vụ ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Quest List */}
        <div className="p-4 space-y-3 overflow-y-auto touch-scroll-y flex-1 min-h-0">
          {quests.map((q) => {
            const isReady = q.current >= q.target && !q.claimed;
            const rewardItem = q.rewardItemId ? ITEMS_CATALOG[q.rewardItemId] : null;
            const pct = Math.min(100, Math.round((q.current / q.target) * 100));

            return (
              <div
                key={q.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  q.claimed
                    ? 'bg-zinc-900/40 border-zinc-800/80 opacity-75'
                    : isReady
                    ? 'bg-amber-500/10 border-amber-400 shadow-lg shadow-amber-500/5'
                    : 'bg-[#111520] border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white truncate">{q.title}</h3>
                      {q.claimed && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-950 border border-emerald-500/40 text-emerald-400 text-[10px] font-semibold flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          Đã Nhận
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">{q.desc}</p>
                  </div>

                  {/* Rewards preview */}
                  <div className="flex items-center gap-2 shrink-0 bg-zinc-950/80 px-2.5 py-1.5 rounded-lg border border-zinc-800">
                    <span className="text-xs text-amber-300 font-semibold flex items-center gap-1">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      +{q.rewardGold.toLocaleString()}
                    </span>
                    <span className="text-xs text-emerald-300 font-semibold flex items-center gap-1">
                      <Gem className="w-3.5 h-3.5 text-emerald-400" />
                      +{q.rewardGems}
                    </span>
                    {rewardItem && (
                      <span className="text-xs text-sky-300 font-semibold flex items-center gap-1 border-l border-zinc-800 pl-2">
                        <Gift className="w-3.5 h-3.5 text-sky-400" />
                        {rewardItem.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar & Claim button */}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-400 font-medium">Tiến độ</span>
                      <span className="font-mono-num text-amber-300 font-semibold">
                        {q.current.toLocaleString()} / {q.target.toLocaleString()} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-zinc-900 border border-zinc-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          q.claimed
                            ? 'bg-emerald-500'
                            : isReady
                            ? 'bg-gradient-to-r from-amber-500 to-yellow-300'
                            : 'bg-amber-500/80'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!isReady || q.claimed}
                    onClick={() => onClaimReward(q.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      q.claimed
                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                        : isReady
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-zinc-950 shadow-md shadow-amber-500/20 active:scale-95'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    {q.claimed ? (
                      <span>Đã Hoàn Thành</span>
                    ) : isReady ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Nhận Thưởng</span>
                      </>
                    ) : (
                      <>
                        <span>Chưa Đạt</span>
                        <ArrowRight className="w-3 h-3" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-[#111520] border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400 shrink-0">
          <span>Tự động làm mới 3 nhiệm vụ mới lúc 00:00 mỗi ngày.</span>
          {allClaimed && (
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Đã nhận tất cả phần thưởng hôm nay!
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
