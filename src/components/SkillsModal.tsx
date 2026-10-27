import React from 'react';
import { X, Zap, ArrowUpCircle, Coins } from 'lucide-react';
import { CharacterDoc } from '../types/game';
import { CLASSES_DATA } from '../data/gameData';
import { SkillIconSVG } from './GameIconRenderer';

interface SkillsModalProps {
  character: CharacterDoc;
  onClose: () => void;
  onUpgradeSkill: (skillIdx: number) => void;
}

export const SkillsModal: React.FC<SkillsModalProps> = ({
  character,
  onClose,
  onUpgradeSkill,
}) => {
  const cls = CLASSES_DATA[character.classId];

  return (
    <div className="absolute inset-0 z-40 bg-black/84 flex items-center justify-center p-2.5">
      <div className="w-full max-w-[980px] h-[92%] max-h-[500px] bg-[#0d1017] border border-zinc-700 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-[#111520] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Zap className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="font-display text-base font-bold text-white truncate">
              Bảng 6 Kỹ Năng Hệ Phái · {cls.name}
            </h2>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-mono-num text-amber-300 flex items-center gap-1 whitespace-nowrap">
              <Coins className="w-3.5 h-3.5" />
              {character.gold.toLocaleString()} Tinh Thạch
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3x2 Landscape Grid — All 6 Skills Visible Without Scrolling */}
        <div className="flex-1 p-3 grid grid-cols-3 grid-rows-2 gap-2.5 overflow-hidden min-h-0">
          {cls.skills.map((sk, idx) => {
            const curLvl = character.skillLevels[idx] || 1;
            const curMult = Math.round(sk.damageMult * (1 + (curLvl - 1) * 0.12) * 100);
            const nextMult = Math.round(sk.damageMult * (1 + curLvl * 0.12) * 100);
            const cost = 450 * curLvl;
            const maxed = curLvl >= 20;

            return (
              <div
                key={sk.id}
                className="p-3 rounded-xl bg-[#111520] border border-zinc-800 flex flex-col justify-between gap-2 overflow-hidden"
              >
                <div className="flex items-start gap-2.5">
                  <div
                    style={{ borderColor: sk.color }}
                    className="w-12 h-12 rounded-xl bg-[#090b10] border-2 flex items-center justify-center shrink-0"
                  >
                    <SkillIconSVG vfx={sk.vfx} color={sk.color} skillId={sk.id} className="w-8 h-8" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-display font-bold text-xs text-white truncate">
                        {sk.name}
                      </span>
                      <span className="text-[11px] font-mono-num text-amber-400 shrink-0">
                        Lv.{curLvl}/20
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-snug">
                      {sk.description}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-mono-num text-zinc-300 leading-tight">
                    <div>
                      ST: <span className="text-white font-semibold">{curMult}%</span>
                      {!maxed && <span className="text-emerald-400"> → {nextMult}%</span>}
                    </div>
                    <div className="text-zinc-500">
                      Hồi {sk.cooldown}s · MP {sk.mpCost}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={maxed || character.gold < cost}
                    onClick={() => onUpgradeSkill(idx)}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-semibold text-[11px] flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <ArrowUpCircle className="w-3.5 h-3.5" />
                    <span>{maxed ? 'Tối Đa' : `Nâng (${cost})`}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
