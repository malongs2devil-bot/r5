import React, { useMemo, useState } from 'react';
import { X, Compass, Navigation, Skull, ShieldCheck } from 'lucide-react';
import { MAPS_DATA, NPCS_DATA } from '../data/gameData';
import { MapDef } from '../types/game';

interface WorldMapModalProps {
  currentMapId: number;
  playerLevel: number;
  onClose: () => void;
  onTeleport: (mapId: number) => void;
}

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  currentMapId,
  playerLevel,
  onClose,
  onTeleport,
}) => {
  const regions = useMemo(() => {
    const set = new Set<string>(['Tất Cả']);
    MAPS_DATA.forEach((m) => set.add(m.region));
    return Array.from(set);
  }, []);

  const [selectedRegion, setSelectedRegion] = useState('Tất Cả');
  const [selectedMap, setSelectedMap] = useState<MapDef>(
    MAPS_DATA.find((m) => m.id === currentMapId) || MAPS_DATA[0]
  );

  const filteredMaps = useMemo(() => {
    if (selectedRegion === 'Tất Cả') return MAPS_DATA;
    return MAPS_DATA.filter((m) => m.region === selectedRegion);
  }, [selectedRegion]);

  return (
    <div className="absolute inset-0 z-40 bg-black/84 flex items-center justify-center p-2.5">
      <div className="w-full max-w-[1000px] h-[94%] max-h-[520px] bg-[#0d1017] border border-zinc-700 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-[#111520] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Compass className="w-5 h-5 text-amber-400 shrink-0" />
            <h2 className="font-display text-base font-bold text-white truncate">
              Tinh Đồ Truyền Tống · Hoàng Thành NPC & 31 Vùng Săn Quái
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Region Filter Strip */}
        <div className="px-3 py-1.5 border-b border-zinc-800 bg-[#0f131d] flex items-center gap-1.5 touch-scroll-x shrink-0">
          {regions.map((reg) => (
            <button
              key={reg}
              type="button"
              onClick={() => setSelectedRegion(reg)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedRegion === reg
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'bg-zinc-900 text-zinc-300 hover:text-white'
              }`}
            >
              {reg}
            </button>
          ))}
        </div>

        {/* Main Grid + Inspector */}
        <div className="flex-1 grid grid-cols-12 gap-3 p-3 overflow-hidden min-h-0">
          <div className="col-span-8 touch-scroll-y grid grid-cols-3 gap-2 content-start min-h-0">
            {filteredMaps.map((m) => {
              const isCurrent = m.id === currentMapId;
              const isSelected = m.id === selectedMap.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMap(m)}
                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-400'
                      : m.safeZone
                      ? 'bg-emerald-950/25 border-emerald-500/40 hover:border-emerald-400'
                      : 'bg-[#111520] border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono-num">
                    <span
                      className={`font-semibold ${
                        m.safeZone ? 'text-emerald-300' : 'text-amber-400'
                      }`}
                    >
                      {m.code}
                    </span>
                    {m.safeZone ? (
                      <span className="text-emerald-400 font-semibold">0 Quái · NPC</span>
                    ) : (
                      <span
                        className={
                          playerLevel >= m.minLevel ? 'text-emerald-400' : 'text-rose-400'
                        }
                      >
                        Lv.{m.minLevel}–{m.maxLevel}
                      </span>
                    )}
                  </div>
                  <div className="font-display font-bold text-xs text-white truncate mt-1">
                    {m.name}
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                    {isCurrent
                      ? 'Đang đứng tại đây'
                      : m.safeZone
                      ? 'Khu An Toàn Tuyệt Đối'
                      : m.region}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Map Details & Teleport */}
          <div className="col-span-4 bg-[#111520] border border-zinc-800 rounded-xl p-3 flex flex-col justify-between overflow-hidden min-h-0">
            <div className="space-y-2.5">
              <div
                className="h-22 rounded-xl border border-zinc-700 p-3 flex flex-col justify-end"
                style={{
                  background: `linear-gradient(135deg, ${selectedMap.skyColor}, ${selectedMap.groundColor})`,
                }}
              >
                <div className="text-xs font-mono-num text-amber-300">
                  {selectedMap.code} · {selectedMap.region}
                </div>
                <div className="font-display text-base font-bold text-white truncate">
                  {selectedMap.name}
                </div>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">
                {selectedMap.description}
              </p>

              {selectedMap.safeZone ? (
                <div className="space-y-1.5 pt-2 border-t border-zinc-800 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>An Toàn Tuyệt Đối · Cấm Quái Vật Xâm Nhập</span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Quy tụ đầy đủ {NPCS_DATA.length} Đại Sư NPC trung tâm:
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-zinc-200 pt-0.5">
                    {NPCS_DATA.map((n) => (
                      <div key={n.id} className="truncate text-zinc-300">
                        · {n.role}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pt-2 border-t border-zinc-800 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Cấp độ khuyến nghị:</span>
                    <span className="font-mono-num text-white font-semibold">
                      Lv.{selectedMap.minLevel} – Lv.{selectedMap.maxLevel}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Quái đặc trưng:</span>
                    <span className="text-zinc-200 truncate ml-2">{selectedMap.mobName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400 flex items-center gap-1 shrink-0">
                      <Skull className="w-3.5 h-3.5 text-rose-400" />
                      Thủ Lĩnh Bản Đồ:
                    </span>
                    <span className="text-rose-300 font-semibold truncate ml-2">
                      {selectedMap.bossName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Trang bị rơi ra:</span>
                    <span className="text-amber-300 font-mono-num">
                      Bậc {selectedMap.dropTier} – Bậc {Math.min(5, selectedMap.dropTier + 1)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                onTeleport(selectedMap.id);
                onClose();
              }}
              className={`w-full py-2.5 px-4 rounded-xl font-display font-bold text-xs flex items-center justify-center gap-2 transition-colors mt-3 whitespace-nowrap ${
                selectedMap.safeZone
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                  : 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
              }`}
            >
              <Navigation className="w-4 h-4" />
              <span>
                {selectedMap.id === currentMapId
                  ? selectedMap.safeZone
                    ? 'Về Quảng Trường Đài Phun Nước'
                    : 'Về Cổng Truyền Tống Bản Đồ Này'
                  : selectedMap.safeZone
                  ? 'Về Hoàng Thành Thánh Tích (Đô Thành NPC)'
                  : `Truyền Tống Tới ${selectedMap.code}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
