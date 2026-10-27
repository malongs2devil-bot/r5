import React from 'react';
import { EquipSlot, ItemDef, SkillVfxType, StatusEffectType } from '../types/game';
import { RARITY_META } from '../data/gameData';
import { assetRegistry } from '../engine/AssetRegistry';

interface ItemIconProps {
  item: ItemDef;
  className?: string;
}

export const ItemIconSVG: React.FC<ItemIconProps> = ({
  item,
  className = 'w-9 h-9',
}) => {
  const uid = `it_${item.id}`;
  const rHex = RARITY_META[item.rarity]?.hex || '#d4d4d8';
  const pCol = item.primaryColor || '#3f3f46';
  const gCol = item.glowColor || rHex;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0 select-none`}
    >
      <defs>
        <radialGradient id={`${uid}_bg`} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor={gCol} stopOpacity="0.34" />
          <stop offset="70%" stopColor={pCol} stopOpacity="0.22" />
          <stop offset="100%" stopColor="#090b10" stopOpacity="0.05" />
        </radialGradient>
        <linearGradient id={`${uid}_metal`} x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f4f4f5" />
          <stop offset="45%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor={pCol} />
        </linearGradient>
        <linearGradient id={`${uid}_glow`} x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor={gCol} />
          <stop offset="100%" stopColor={rHex} />
        </linearGradient>
      </defs>

      {/* Subtle rarity backlight */}
      <circle cx="32" cy="32" r="27" fill={`url(#${uid}_bg)`} />

      {/* === WEAPONS === */}
      {item.slot === 'weapon' && item.meshStyle === 'hammer' && (
        <g>
          {/* Heavy War Hammer */}
          <line x1="16" y1="50" x2="38" y2="28" stroke={`url(#${uid}_metal)`} strokeWidth="5" strokeLinecap="round" />
          <rect x="30" y="14" width="22" height="18" rx="3" fill={`url(#${uid}_metal)`} stroke="#ffffff" strokeWidth="1.2" transform="rotate(-45 41 23)" />
          <polygon points="41,12 47,18 41,24 35,18" fill={`url(#${uid}_glow)`} />
        </g>
      )}

      {item.slot === 'weapon' && item.meshStyle === 'axe' && (
        <g>
          {/* Battle Axe */}
          <line x1="16" y1="50" x2="40" y2="26" stroke={`url(#${uid}_metal)`} strokeWidth="4.5" strokeLinecap="round" />
          <path d="M30 14 C44 12 52 24 46 36 L34 24 Z" fill={`url(#${uid}_glow)`} stroke="#ffffff" strokeWidth="1.2" />
          <path d="M26 18 C18 10 30 6 36 18 Z" fill={`url(#${uid}_metal)`} />
        </g>
      )}

      {item.slot === 'weapon' && item.meshStyle === 'grimoire' && (
        <g>
          {/* Magic Grimoire */}
          <rect x="14" y="16" width="36" height="34" rx="4" fill={`url(#${uid}_metal)`} stroke={gCol} strokeWidth="1.5" />
          <rect x="18" y="19" width="28" height="28" rx="2" fill={`url(#${uid}_glow)`} fillOpacity="0.4" />
          <polygon points="32,24 38,33 32,42 26,33" fill={`url(#${uid}_glow)`} stroke="#ffffff" strokeWidth="1" />
        </g>
      )}

      {item.slot === 'weapon' && item.meshStyle === 'energy_bow' && (
        <g>
          {/* Energy Bow */}
          <path d="M16 12 Q44 14 44 32 Q44 50 16 52" fill="none" stroke={`url(#${uid}_metal)`} strokeWidth="4" strokeLinecap="round" />
          <line x1="16" y1="12" x2="16" y2="52" stroke={gCol} strokeWidth="2" strokeDasharray="4 2" />
          <polygon points="12,32 36,32 28,28 28,36" fill={`url(#${uid}_glow)`} stroke="#ffffff" strokeWidth="1" />
        </g>
      )}

      {item.slot === 'weapon' && (item.meshStyle === 'power_fist' || item.meshStyle === 'gauntlet') && (
        <g>
          {/* Power Gauntlet / Fist */}
          <rect x="16" y="20" width="32" height="28" rx="5" fill={`url(#${uid}_metal)`} stroke="#ffffff" strokeWidth="1.3" />
          <circle cx="23" cy="27" r="3" fill={gCol} />
          <circle cx="32" cy="27" r="3.5" fill={gCol} />
          <circle cx="41" cy="27" r="3" fill={gCol} />
          <rect x="20" y="34" width="24" height="8" rx="2" fill={`url(#${uid}_glow)`} />
        </g>
      )}

      {item.slot === 'weapon' && (item.meshStyle.startsWith('staff') || item.meshStyle === 'staff_crystal') && (
        <g>
          {/* Diagonal Psionic Staff */}
          <line x1="14" y1="52" x2="44" y2="22" stroke={`url(#${uid}_metal)`} strokeWidth="4.5" strokeLinecap="round" />
          <line x1="18" y1="48" x2="27" y2="39" stroke={gCol} strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="45" cy="19" r="11" stroke={rHex} strokeWidth="2" strokeDasharray={item.tier >= 4 ? 'none' : '5 3'} />
          <path d="M33 17 L41 11 L39 21 Z" fill={`url(#${uid}_metal)`} stroke={gCol} strokeWidth="1" />
          <path d="M47 31 L53 23 L43 25 Z" fill={`url(#${uid}_metal)`} stroke={gCol} strokeWidth="1" />
          <polygon points="45,10 52,19 45,28 38,19" fill={`url(#${uid}_glow)`} stroke="#ffffff" strokeWidth="1.2" />
        </g>
      )}

      {item.slot === 'weapon' && item.meshStyle.startsWith('greatsword') && (
        <g>
          {/* Colossal Greatsword */}
          <line x1="13" y1="51" x2="22" y2="42" stroke="#27272a" strokeWidth="5" strokeLinecap="round" />
          <circle cx="12" cy="52" r="3.5" fill={rHex} stroke="#ffffff" strokeWidth="1" />
          <polygon points="21,37 49,9 55,9 55,15 27,43" fill={`url(#${uid}_metal)`} stroke="#e4e4e7" strokeWidth="1.2" />
          <line x1="25" y1="39" x2="51" y2="13" stroke={`url(#${uid}_glow)`} strokeWidth="3.2" strokeLinecap="round" />
          <path d="M15 33 L24 40 L31 49 L22 42 Z" fill={rHex} stroke="#ffffff" strokeWidth="1" />
        </g>
      )}

      {item.slot === 'weapon' && (item.meshStyle.startsWith('dual') || item.meshStyle === 'dual_claws') && (
        <g>
          {/* Twin Crossed Cyber Blades / Claws */}
          <path d="M14 48 Q28 30 50 12 Q44 26 22 50 Z" fill={`url(#${uid}_glow)`} stroke="#ffffff" strokeWidth="1.1" />
          <path d="M50 48 Q36 30 14 12 Q20 26 42 50 Z" fill={`url(#${uid}_metal)`} stroke={gCol} strokeWidth="1.4" />
          <line x1="12" y1="51" x2="19" y2="44" stroke="#f4f4f5" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="52" y1="51" x2="45" y2="44" stroke="#f4f4f5" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="32" cy="31" r="4" fill={rHex} stroke="#ffffff" strokeWidth="1" />
        </g>
      )}

      {/* === HELM === */}
      {item.slot === 'helm' && (
        <g>
          {item.tier >= 3 && (
            <path
              d="M18 22 L11 10 L24 17 M46 22 L53 10 L40 17"
              fill={rHex}
              stroke="#ffffff"
              strokeWidth="1"
            />
          )}
          <path
            d="M17 34 C17 19 23 13 32 13 C41 13 47 19 47 34 L44 49 L36 52 L32 47 L28 52 L20 49 Z"
            fill={`url(#${uid}_metal)`}
            stroke="#e4e4e7"
            strokeWidth="1.4"
          />
          {/* Glowing Optic Visor */}
          <path
            d="M21 29 L32 33 L43 29 L41 35 L32 38 L23 35 Z"
            fill={`url(#${uid}_glow)`}
            stroke="#ffffff"
            strokeWidth="0.9"
          />
          <line x1="32" y1="14" x2="32" y2="27" stroke={gCol} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {/* === CHEST ARMOR === */}
      {item.slot === 'armor' && (
        <g>
          {/* Shoulder Pauldrons */}
          <path
            d="M9 22 L21 15 L23 28 L12 31 Z"
            fill={`url(#${uid}_metal)`}
            stroke={gCol}
            strokeWidth="1.3"
          />
          <path
            d="M55 22 L43 15 L41 28 L52 31 Z"
            fill={`url(#${uid}_metal)`}
            stroke={gCol}
            strokeWidth="1.3"
          />
          {/* Main Cuirass */}
          <path
            d="M20 16 L27 20 L37 20 L44 16 L46 34 L39 51 L32 54 L25 51 L18 34 Z"
            fill={`url(#${uid}_metal)`}
            stroke="#f4f4f5"
            strokeWidth="1.4"
          />
          {/* Reactor Core */}
          <polygon
            points="32,24 38,30 32,37 26,30"
            fill={`url(#${uid}_glow)`}
            stroke="#ffffff"
            strokeWidth="1.1"
          />
          <path d="M24 42 L32 46 L40 42" stroke={gCol} strokeWidth="2" strokeLinecap="round" />
        </g>
      )}

      {/* === GLOVES === */}
      {item.slot === 'gloves' && (
        <g>
          <path
            d="M20 49 L23 26 L28 16 L33 15 L38 16 L43 23 L45 35 L39 51 Z"
            fill={`url(#${uid}_metal)`}
            stroke="#e4e4e7"
            strokeWidth="1.4"
          />
          {/* Energy Knuckles */}
          <circle cx="27" cy="24" r="2.3" fill={gCol} />
          <circle cx="33" cy="23" r="2.5" fill={gCol} />
          <circle cx="39" cy="25" r="2.3" fill={gCol} />
          <path
            d="M22 38 L41 40"
            stroke={`url(#${uid}_glow)`}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* === PANTS (GREAVES) === */}
      {item.slot === 'pants' && (
        <g>
          <path
            d="M19 14 L45 14 L48 50 L37 51 L34 28 L30 28 L27 51 L16 50 Z"
            fill={`url(#${uid}_metal)`}
            stroke="#e4e4e7"
            strokeWidth="1.4"
          />
          <rect x="20" y="14" width="24" height="6" rx="2" fill={rHex} />
          <polygon points="23,31 27,35 23,40 19,35" fill={`url(#${uid}_glow)`} />
          <polygon points="41,31 45,35 41,40 37,35" fill={`url(#${uid}_glow)`} />
        </g>
      )}

      {/* === BOOTS === */}
      {item.slot === 'boots' && (
        <g>
          <path
            d="M22 14 L36 14 L35 36 L49 43 L48 51 L17 51 L18 38 Z"
            fill={`url(#${uid}_metal)`}
            stroke="#e4e4e7"
            strokeWidth="1.4"
          />
          {/* Thruster Wing */}
          <path
            d="M18 28 L10 22 L14 34 L22 35 Z"
            fill={`url(#${uid}_glow)`}
            stroke="#ffffff"
            strokeWidth="1"
          />
          <line x1="18" y1="48" x2="47" y2="48" stroke={gCol} strokeWidth="3" strokeLinecap="round" />
        </g>
      )}

      {/* === RING === */}
      {item.slot === 'ring' && (
        <g>
          <ellipse
            cx="32"
            cy="37"
            rx="15"
            ry="12"
            stroke={`url(#${uid}_metal)`}
            strokeWidth="5"
          />
          <ellipse
            cx="32"
            cy="37"
            rx="15"
            ry="12"
            stroke={rHex}
            strokeWidth="1.5"
          />
          {/* Radiant Core Gem */}
          <polygon
            points="32,12 41,21 32,29 23,21"
            fill={`url(#${uid}_glow)`}
            stroke="#ffffff"
            strokeWidth="1.3"
          />
          <circle cx="32" cy="21" r="3" fill="#ffffff" />
        </g>
      )}

      {/* === WINGS === */}
      {item.slot === 'wings' && (
        <g>
          {/* Left Wing */}
          <path
            d="M30 33 L9 14 L13 26 L7 25 L15 36 L11 40 L26 42 Z"
            fill={`url(#${uid}_glow)`}
            stroke="#ffffff"
            strokeWidth="1.1"
          />
          {/* Right Wing */}
          <path
            d="M34 33 L55 14 L51 26 L57 25 L49 36 L53 40 L38 42 Z"
            fill={`url(#${uid}_glow)`}
            stroke="#ffffff"
            strokeWidth="1.1"
          />
          {/* Central Jetpack Core */}
          <polygon
            points="32,20 37,32 32,48 27,32"
            fill={`url(#${uid}_metal)`}
            stroke={rHex}
            strokeWidth="1.3"
          />
          <circle cx="32" cy="33" r="3.5" fill="#ffffff" />
        </g>
      )}

      {/* === MOUNTS === */}
      {item.slot === 'mount' && item.meshStyle === 'mount_bike' && (
        <g>
          <circle cx="17" cy="43" r="8" stroke={`url(#${uid}_glow)`} strokeWidth="3.2" />
          <circle cx="47" cy="43" r="8" stroke={`url(#${uid}_glow)`} strokeWidth="3.2" />
          <path
            d="M17 43 L27 28 L41 28 L48 21 L52 26 L47 43 L31 39 Z"
            fill={`url(#${uid}_metal)`}
            stroke="#ffffff"
            strokeWidth="1.2"
          />
          <circle cx="51" cy="24" r="2.8" fill="#fde047" />
        </g>
      )}

      {item.slot === 'mount' && item.meshStyle !== 'mount_bike' && (
        <g>
          {/* Cyber Fenrir / Beast Crest */}
          <path
            d="M15 15 L25 24 L32 18 L39 24 L49 15 L47 34 L39 48 L32 53 L25 48 L17 34 Z"
            fill={`url(#${uid}_metal)`}
            stroke={rHex}
            strokeWidth="1.5"
          />
          {/* Glowing Beast Eyes */}
          <polygon points="22,31 29,34 24,37" fill={`url(#${uid}_glow)`} />
          <polygon points="42,31 35,34 40,37" fill={`url(#${uid}_glow)`} />
          <polygon points="32,40 36,45 32,50 28,45" fill={gCol} />
        </g>
      )}
    </svg>
  );
};

export const SlotPlaceholderSVG: React.FC<{ slot: EquipSlot; className?: string }> = ({
  slot,
  className = 'w-6 h-6',
}) => {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`${className} text-zinc-600 shrink-0`}
    >
      {slot === 'weapon' && <path d="M12 36 L36 12 M28 12 H36 V20 M10 30 L18 38" />}
      {slot === 'helm' && <path d="M14 28 C14 17 18 12 24 12 C30 12 34 17 34 28 L32 37 H16 Z" />}
      {slot === 'armor' && <path d="M15 14 L24 18 L33 14 L36 26 L31 38 H17 L12 26 Z" />}
      {slot === 'gloves' && <path d="M17 36 L19 19 L24 13 L31 18 L32 29 L28 37 Z" />}
      {slot === 'pants' && <path d="M16 12 H32 L34 38 H26 L24 23 L22 38 H14 Z" />}
      {slot === 'boots' && <path d="M18 13 H28 L27 29 L36 33 V38 H15 V30 Z" />}
      {slot === 'ring' && (
        <>
          <circle cx="24" cy="27" r="9" />
          <polygon points="24,11 29,16 24,20 19,16" />
        </>
      )}
      {slot === 'wings' && <path d="M24 26 L9 14 L13 28 L24 32 L35 28 L39 14 Z" />}
      {slot === 'mount' && <path d="M13 15 L20 21 L24 17 L28 21 L35 15 L33 30 L24 38 L15 30 Z" />}
    </svg>
  );
};

export const PotionIconSVG: React.FC<{ kind: 'hp' | 'mp'; className?: string }> = ({
  kind,
  className = 'w-5 h-5',
}) => {
  const customIcon = assetRegistry.getIconUrl(kind === 'hp' ? 'icon_potion_hp' : 'icon_potion_mp');
  if (customIcon) {
    return (
      <img
        src={customIcon}
        alt={kind === 'hp' ? 'HP Potion' : 'MP Potion'}
        className={`${className} object-contain shrink-0 select-none rounded`}
      />
    );
  }
  const main = kind === 'hp' ? '#f43f5e' : '#38bdf8';
  const hi = kind === 'hp' ? '#fda4af' : '#bae6fd';
  return (
    <svg viewBox="0 0 36 36" fill="none" className={`${className} shrink-0`}>
      <rect x="13" y="4" width="10" height="4" rx="1.5" fill="#cbd5e1" />
      <path
        d="M14 8 H22 L28 17 V28 C28 30.2 26.2 32 24 32 H12 C9.8 32 8 30.2 8 28 V17 Z"
        fill="#0f172a"
        stroke="#e2e8f0"
        strokeWidth="1.6"
      />
      <path
        d="M10 19 H26 V27.5 C26 28.9 24.9 30 23.5 30 H12.5 C11.1 30 10 28.9 10 27.5 Z"
        fill={main}
      />
      <path d="M18 19 V27 M14 23 H22" stroke={hi} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
};

export const StatusEffectIconSVG: React.FC<{
  type: StatusEffectType;
  className?: string;
}> = ({ type, className = 'w-3.5 h-3.5' }) => {
  if (type === 'burn') {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={`${className} shrink-0`}>
        <path
          d="M16 3 C18 9 25 11 25 19 C25 24.5 21 29 16 29 C11 29 7 24.5 7 19 C7 14 10.5 11.5 12 8 C11.5 11.5 13.5 13 13.5 13 C13 9 14.5 5.5 16 3 Z"
          fill="#ef4444"
          stroke="#fde047"
          strokeWidth="1.5"
        />
        <path
          d="M16 14 C17.5 16.5 20 18 20 21.5 C20 24 18.2 26 16 26 C13.8 26 12 24 12 21.5 C12 19 14 17 16 14 Z"
          fill="#fde047"
        />
      </svg>
    );
  }
  if (type === 'freeze') {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={`${className} shrink-0`}>
        <g stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round">
          <line x1="16" y1="4" x2="16" y2="28" />
          <line x1="5.6" y1="10" x2="26.4" y2="22" />
          <line x1="26.4" y1="10" x2="5.6" y2="22" />
        </g>
        <polygon
          points="16,10 21,16 16,22 11,16"
          fill="#bae6fd"
          stroke="#ffffff"
          strokeWidth="1.2"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" fill="none" className={`${className} shrink-0`}>
      <polygon
        points="18,3 8,17 15,17 13,29 24,14 17,14"
        fill="#fde047"
        stroke="#38bdf8"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const SkillIconSVG: React.FC<{
  vfx: SkillVfxType;
  color: string;
  skillId?: string;
  className?: string;
}> = ({ vfx, color, skillId, className = 'w-6 h-6' }) => {
  const customIcon =
    (skillId ? assetRegistry.getIconUrl(`icon_skill_${skillId}`) : null) ||
    assetRegistry.getIconUrl(`icon_vfx_${vfx}`);
  if (customIcon) {
    return (
      <img
        src={customIcon}
        alt={vfx}
        className={`${className} object-cover rounded-md shrink-0 select-none`}
      />
    );
  }
  return (
    <svg viewBox="0 0 48 48" fill="none" className={`${className} shrink-0`}>
      {/* Esper 1: Shard Bolt */}
      {vfx === 'shard_bolt' && (
        <g>
          <polygon points="36,10 28,24 22,18" fill={color} stroke="#fff" strokeWidth="1.2" />
          <polygon points="28,20 18,36 12,30" fill={color} stroke="#fff" strokeWidth="1.2" />
          <polygon points="40,22 28,34 25,28" fill="#ffffff" />
        </g>
      )}
      {/* Esper 2: Gravity Well */}
      {vfx === 'gravity_well' && (
        <g stroke={color} strokeWidth="2.4" strokeLinecap="round">
          <circle cx="24" cy="24" r="6" fill={color} />
          <path d="M24 9 A15 15 0 0 1 39 24" />
          <path d="M24 39 A15 15 0 0 1 9 24" />
          <circle cx="24" cy="24" r="11" stroke="#ffffff" strokeWidth="1.3" strokeDasharray="4 3" />
        </g>
      )}
      {/* Esper 3: Crystal Shield */}
      {vfx === 'crystal_shield' && (
        <g>
          <polygon
            points="24,7 38,14 36,31 24,41 12,31 10,14"
            fill={color}
            fillOpacity="0.35"
            stroke={color}
            strokeWidth="2.5"
          />
          <polygon points="24,14 31,24 24,34 17,24" fill="#ffffff" />
        </g>
      )}
      {/* Esper 4: Solar Beam */}
      {vfx === 'solar_beam' && (
        <g>
          <line x1="9" y1="39" x2="39" y2="9" stroke={color} strokeWidth="8" strokeLinecap="round" strokeOpacity="0.45" />
          <line x1="10" y1="38" x2="38" y2="10" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="13" cy="35" r="5" fill={color} />
        </g>
      )}
      {/* Esper 5: Psionic Blink */}
      {vfx === 'psionic_blink' && (
        <g>
          <polygon points="27,7 13,26 23,26 19,41 35,21 25,21" fill={color} stroke="#ffffff" strokeWidth="1.3" />
        </g>
      )}
      {/* Esper 6: Meteor Storm */}
      {vfx === 'meteor_storm' && (
        <g>
          <path d="M18 32 L38 10 L30 28 Z" fill={color} />
          <circle cx="17" cy="31" r="7" fill={color} stroke="#ffffff" strokeWidth="1.5" />
          <circle cx="31" cy="34" r="4" fill="#fde047" />
          <line x1="33" y1="32" x2="41" y2="23" stroke="#fde047" strokeWidth="2.2" />
        </g>
      )}

      {/* Vanguard 1: Heavy Cleave */}
      {vfx === 'heavy_cleave' && (
        <g>
          <path
            d="M10 34 Q22 10 40 14 Q28 24 22 39 Z"
            fill={color}
            stroke="#ffffff"
            strokeWidth="1.4"
          />
          <line x1="12" y1="38" x2="34" y2="16" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
      {/* Vanguard 2: Whirlwind */}
      {vfx === 'whirlwind' && (
        <g stroke={color} strokeWidth="3" strokeLinecap="round">
          <path d="M24 8 A16 16 0 1 1 10 31" />
          <path d="M24 40 A16 16 0 1 1 38 17" stroke="#ffffff" strokeWidth="1.8" />
          <circle cx="24" cy="24" r="4" fill={color} />
        </g>
      )}
      {/* Vanguard 3: Titan Aegis */}
      {vfx === 'titan_aegis' && (
        <g>
          <path
            d="M24 8 L38 14 V25 C38 33 31 39 24 42 C17 39 10 33 10 25 V14 Z"
            fill={color}
            fillOpacity="0.35"
            stroke={color}
            strokeWidth="2.5"
          />
          <path d="M24 16 V32 M16 24 H32" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {/* Vanguard 4: Seismic Leap */}
      {vfx === 'seismic_leap' && (
        <g>
          <path d="M24 9 L31 25 H17 Z" fill="#ffffff" />
          <ellipse cx="24" cy="35" rx="15" ry="5" stroke={color} strokeWidth="2.8" />
          <path d="M12 31 L8 25 M36 31 L40 25" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}
      {/* Vanguard 5: Molten Eruption */}
      {vfx === 'molten_eruption' && (
        <g>
          <polygon points="24,8 31,38 17,38" fill={color} stroke="#ffffff" strokeWidth="1.2" />
          <polygon points="13,18 20,38 9,38" fill={color} fillOpacity="0.8" />
          <polygon points="35,18 39,38 28,38" fill={color} fillOpacity="0.8" />
        </g>
      )}
      {/* Vanguard 6: Judgement Blade */}
      {vfx === 'judgement_blade' && (
        <g>
          <polygon points="24,42 18,16 24,7 30,16" fill={color} stroke="#ffffff" strokeWidth="1.5" />
          <rect x="13" y="13" width="22" height="4" rx="1.5" fill="#ffffff" />
          <ellipse cx="24" cy="40" rx="13" ry="3.5" stroke={color} strokeWidth="2" />
        </g>
      )}

      {/* Special Vanguard VFX: Heavy Smash & Van Jian Gui Zong */}
      {vfx === 'heavy_smash' && (
        <g>
          <rect x="20" y="8" width="8" height="24" rx="2" fill={color} stroke="#ffffff" strokeWidth="1" transform="rotate(30 24 20)" />
          <path d="M12 36 L36 36 M16 42 L32 42" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {vfx === 'van_jian_gui_zong' && (
        <g stroke={color} strokeWidth="1.6">
          <polygon points="24,6 27,18 24,15 21,18" fill={color} />
          <polygon points="12,18 18,27 15,25 14,28" fill={color} />
          <polygon points="36,18 34,28 33,25 30,27" fill={color} />
          <circle cx="24" cy="24" r="16" stroke="#ffffff" strokeWidth="1.2" strokeDasharray="4 2" />
        </g>
      )}
      {vfx === 'toxic_mist' && (
        <g fill={color} fillOpacity="0.7">
          <circle cx="16" cy="24" r="7" />
          <circle cx="28" cy="18" r="9" />
          <circle cx="34" cy="30" r="6" />
          <circle cx="22" cy="32" r="8" fill="#ffffff" />
        </g>
      )}

      {/* Evolver 1: Twin Fang */}
      {vfx === 'twin_fang' && (
        <g>
          <path d="M11 37 Q24 20 39 11 Q30 27 17 40 Z" fill={color} stroke="#fff" strokeWidth="1.1" />
          <path d="M37 37 Q24 20 9 11 Q18 27 31 40 Z" fill="#ffffff" stroke={color} strokeWidth="1.2" />
        </g>
      )}
      {/* Evolver 2: Phantom Dash */}
      {vfx === 'phantom_dash' && (
        <g strokeLinecap="round">
          <path d="M9 18 H31 L25 12 M15 26 H39 L33 20 M9 34 H29" stroke={color} strokeWidth="3" />
          <circle cx="38" cy="26" r="3" fill="#ffffff" />
        </g>
      )}
      {/* Evolver 3: Bio Overdrive */}
      {vfx === 'bio_overdrive' && (
        <g>
          <circle cx="24" cy="24" r="14" stroke={color} strokeWidth="2.4" strokeDasharray="6 3" />
          <path d="M24 12 L28 22 L38 24 L28 26 L24 36 L20 26 L10 24 L20 22 Z" fill={color} stroke="#fff" strokeWidth="1" />
        </g>
      )}
      {/* Evolver 4: Acid Vortex */}
      {vfx === 'acid_vortex' && (
        <g stroke={color} strokeWidth="2.6" strokeLinecap="round">
          <path d="M24 24 m-13 0 a13 13 0 1 0 26 0 a10 10 0 1 0 -20 0 a6 6 0 1 0 12 0" />
          <circle cx="24" cy="24" r="3" fill="#ffffff" />
        </g>
      )}
      {/* Evolver 5: Razor Tempest */}
      {vfx === 'razor_tempest' && (
        <g>
          <polygon points="24,6 29,19 42,24 29,29 24,42 19,29 6,24 19,19" fill={color} stroke="#ffffff" strokeWidth="1.2" />
          <circle cx="24" cy="24" r="4" fill="#090b10" stroke="#ffffff" strokeWidth="1.5" />
        </g>
      )}
      {/* Evolver 6: Apex Predator */}
      {vfx === 'apex_predator' && (
        <g stroke={color} strokeWidth="3.4" strokeLinecap="round">
          <path d="M11 12 L23 38" />
          <path d="M20 9 L32 39" stroke="#ffffff" strokeWidth="3" />
          <path d="M29 12 L39 36" />
        </g>
      )}
    </svg>
  );
};
