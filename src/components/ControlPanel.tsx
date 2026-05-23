'use client';

import { SimState } from './SolarSystem';

function fmtSpeed(exp: number): string {
  const dps = Math.pow(10, exp);
  if (dps < 0.042) return `${(dps * 24).toFixed(1)} h/s`;
  if (dps < 1)     return `${(dps * 24).toFixed(0)} h/s`;
  if (dps < 500)   return `${dps.toFixed(dps < 10 ? 1 : 0)} d/s`;
  return `${(dps / 365.25).toFixed(1)} y/s`;
}

function fmtBHMass(exp: number): string {
  const m = Math.pow(10, exp);
  if (m < 1e3) return `${m < 10 ? m.toFixed(1) : m.toFixed(0)} M☉`;
  if (m < 1e6) return `${(m / 1e3).toFixed(m < 1e4 ? 1 : 0)}k M☉`;
  return `${(m / 1e6).toFixed(m < 1e7 ? 1 : 0)}M M☉`;
}

const BTN_BASE =
  'rounded-xl text-[13px] leading-tight tracking-[0.03em] font-mono select-none ' +
  'border transition-all duration-150 cursor-pointer';

const BTN_OFF =
  'bg-white/[0.04] border-white/10 text-[#8a9bc4] ' +
  'hover:bg-white/[0.09] hover:border-white/20 hover:text-[#c2d0eb]';

const BTN_ON =
  'text-[#eaf1ff] border-[rgba(120,160,255,0.65)] ' +
  'bg-[linear-gradient(135deg,rgba(85,119,255,0.65),rgba(55,90,220,0.55))] ' +
  'shadow-[0_0_14px_rgba(85,119,255,0.3)] ' +
  'hover:bg-[linear-gradient(135deg,rgba(95,130,255,0.75),rgba(65,100,230,0.65))]';

const BTN_DANGER_ON =
  'text-[#fff2e0] border-[rgba(255,140,60,0.7)] ' +
  'bg-[linear-gradient(135deg,rgba(255,120,40,0.65),rgba(200,60,20,0.55))] ' +
  'shadow-[0_0_18px_rgba(255,120,40,0.35)] ' +
  'hover:bg-[linear-gradient(135deg,rgba(255,140,60,0.75),rgba(220,80,30,0.65))]';

function btn(on: boolean, extra = '') {
  return `${BTN_BASE} ${on ? BTN_ON : BTN_OFF} ${extra}`;
}

function dangerBtn(on: boolean, extra = '') {
  return `${BTN_BASE} ${on ? BTN_DANGER_ON : BTN_OFF} ${extra}`;
}

const SECTION_LABEL =
  'text-[10px] uppercase tracking-[0.18em] text-[#5d6f97] mb-3 font-semibold';

interface Props {
  state: SimState;
  dateStr: string;
  sunAgeGyr: number;
  sunProgress: number;
  blackHoleCount: number;
  placingBH: boolean;
  bhMassExp: number;
  onBhMassExpChange: (exp: number) => void;
  onUpdate: (patch: Partial<SimState>) => void;
  onResetView: () => void;
  onJumpToNow: () => void;
  onSetViewAngle: (az: number, el: number) => void;
  onTogglePlaceBH: () => void;
  onClearBlackHoles: () => void;
}

export default function ControlPanel({
  state, dateStr, sunAgeGyr, sunProgress, blackHoleCount, placingBH,
  bhMassExp, onBhMassExpChange,
  onUpdate, onResetView, onJumpToNow, onSetViewAngle,
  onTogglePlaceBH, onClearBlackHoles,
}: Props) {
  return (
    <div
      className="fixed top-5 left-5 z-10 w-[360px] rounded-2xl p-7 font-mono
                 bg-[rgba(3,6,22,0.93)] border border-[rgba(70,110,220,0.25)]
                 shadow-[0_8px_48px_rgba(0,0,20,0.8),inset_0_1px_0_rgba(255,255,255,0.04)]
                 backdrop-blur-[20px]"
    >
      {/* Title */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[18px] leading-none">☀</span>
        <span className="text-[10px] tracking-[0.22em] uppercase font-semibold text-[rgba(120,160,255,0.7)]">
          Solar System
        </span>
      </div>

      <div className="text-[18px] tracking-[0.04em] mt-4 mb-1 text-[#ffd966] tabular-nums">
        {dateStr}
      </div>

      {/* Sun age */}
      <div className="mt-4 mb-6">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-[#5d6f97] font-semibold">
            Sun Age
          </span>
          <span className="text-[13px] text-[#ffa66b] tabular-nums">
            {sunAgeGyr.toFixed(4)} <span className="text-[11px] text-[#7a6045]">Gyr</span>
          </span>
        </div>
        <div className="h-[6px] rounded-full bg-white/[0.06] overflow-hidden border border-white/[0.05]">
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{
              width: `${sunProgress * 100}%`,
              background: 'linear-gradient(90deg,#ffd966,#ff7a3a 70%,#c63030)',
              boxShadow: '0 0 10px rgba(255,140,60,0.55)',
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] mt-1.5 text-[#445566] tabular-nums">
          <span>0</span>
          <span>main-sequence · 10 Gyr</span>
        </div>
      </div>

      <div className="border-t border-[rgba(80,120,255,0.15)] mb-6" />

      {/* Playback */}
      <div className={SECTION_LABEL}>Playback</div>
      <div className="flex gap-3 mb-5">
        <button
          className={btn(!state.paused, 'flex-1 py-3 text-[14px]')}
          onClick={() => onUpdate({ paused: !state.paused })}
        >
          {state.paused ? '▶  Play' : '⏸  Pause'}
        </button>
        <button
          className={btn(false, 'flex-1 py-3 text-[14px]')}
          onClick={onJumpToNow}
        >
          ⊙  Today
        </button>
      </div>

      {/* Speed */}
      <div className="flex items-center gap-3 mb-7">
        <span className="text-[11px] tracking-[0.08em] text-[#5d6f97] w-12 shrink-0 uppercase">
          Speed
        </span>
        <input
          type="range"
          min={-1} max={5.5} step={0.05}
          value={state.speedExp}
          onChange={(e) => onUpdate({ speedExp: parseFloat(e.target.value) })}
          className="flex-1"
        />
        <span className="text-[12px] text-[#ffd966] text-right w-[60px] shrink-0 tabular-nums">
          {fmtSpeed(state.speedExp)}
        </span>
      </div>

      <div className="border-t border-[rgba(80,120,255,0.15)] mb-6" />

      {/* View */}
      <div className={SECTION_LABEL}>View</div>
      <div className="flex gap-2.5 mb-5">
        {([
          ['Top',  () => onSetViewAngle(0, 0)],
          ['Edge', () => onSetViewAngle(0, Math.PI / 2)],
          ['3D',   () => onSetViewAngle(Math.PI / 5, Math.PI / 4)],
        ] as [string, () => void][]).map(([label, handler]) => (
          <button
            key={label}
            onClick={handler}
            className={btn(false, 'flex-1 py-3 text-[13px]')}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={SECTION_LABEL}>Scale</div>
      <div className="flex gap-2.5 mb-5">
        <button
          className={btn(!state.logScale, 'flex-1 py-3 text-[13px]')}
          onClick={() => onUpdate({ logScale: false })}
        >
          Linear
        </button>
        <button
          className={btn(state.logScale, 'flex-1 py-3 text-[13px]')}
          onClick={() => onUpdate({ logScale: true })}
        >
          Log
        </button>
      </div>

      <div className={SECTION_LABEL}>Show</div>
      <div className="flex gap-2.5 mb-6">
        <button
          className={btn(state.showOrbits, 'flex-1 py-3 text-[13px]')}
          onClick={() => onUpdate({ showOrbits: !state.showOrbits })}
        >
          Orbits
        </button>
        <button
          className={btn(state.showLabels, 'flex-1 py-3 text-[13px]')}
          onClick={() => onUpdate({ showLabels: !state.showLabels })}
        >
          Labels
        </button>
      </div>

      <div className="border-t border-[rgba(80,120,255,0.15)] mb-6" />

      {/* Black holes */}
      <div className={SECTION_LABEL}>
        Black Holes <span className="text-[#ffa66b] ml-1">{blackHoleCount > 0 ? `(${blackHoleCount})` : ''}</span>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <span className="text-[11px] tracking-[0.08em] text-[#5d6f97] w-12 shrink-0 uppercase">
          Mass
        </span>
        <input
          type="range"
          min={0} max={7} step={0.1}
          value={bhMassExp}
          onChange={(e) => onBhMassExpChange(parseFloat(e.target.value))}
          className="flex-1"
        />
        <span className="text-[12px] text-[#ffa66b] text-right w-18 shrink-0 tabular-nums">
          {fmtBHMass(bhMassExp)}
        </span>
      </div>

      <div className="flex gap-2.5 mb-6">
        <button
          className={dangerBtn(placingBH, 'flex-[2] py-3 text-[13px]')}
          onClick={onTogglePlaceBH}
        >
          {placingBH ? '✕  Cancel' : '⬤  Place'}
        </button>
        <button
          className={btn(false, 'flex-1 py-3 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed')}
          onClick={onClearBlackHoles}
          disabled={blackHoleCount === 0}
        >
          Clear
        </button>
      </div>

      <button
        onClick={onResetView}
        className={`${BTN_BASE} w-full py-3 text-[13px] bg-white/[0.04] border-white/10
                    text-[#5d6f97] hover:text-[#9aabd0] hover:bg-white/[0.08]`}
      >
        ↺  Reset View
      </button>
    </div>
  );
}
