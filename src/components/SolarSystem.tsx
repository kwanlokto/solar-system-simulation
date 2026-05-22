'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { PLANETS, MOON, BELT } from '@/lib/planets';
import { getPlanetPosition, getOrbitPath, dateToJD, fmtDate, auMap } from '@/lib/orbital';
import type { PlanetData } from '@/lib/orbital';
import ControlPanel from './ControlPanel';

export interface SimState {
  paused: boolean;
  speedExp: number;
  logScale: boolean;
  showOrbits: boolean;
  showLabels: boolean;
}

interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  /** spin around ecliptic north pole, radians */
  rotAz: number;
  /** tilt from top-down: 0 = top, π/2 = edge-on, radians */
  rotEl: number;
}

// Deterministic star field
function buildStars(count: number) {
  function mur(seed: number) {
    let s = seed | 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return Array.from({ length: count }, (_, i) => ({
    x: mur(i * 3 + 1), y: mur(i * 3 + 2),
    b: 0.15 + mur(i * 3 + 3) * 0.75,
    s: mur(i * 3) < 0.15 ? 1.2 : 0.6,
  }));
}
const STARS = buildStars(500);

export default function SolarSystem() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<SimState>({
    paused: false, speedExp: 2.0, logScale: false,
    showOrbits: true, showLabels: true,
  });
  const viewRef = useRef<ViewState>({ zoom: 1, panX: 0, panY: 0, rotAz: 0, rotEl: 0 });
  const simJDRef = useRef(dateToJD(new Date()));
  const rafRef = useRef<number>(0);
  const lastTRef = useRef<number | null>(null);

  // Pan drag (left button)
  const panDragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  // Rotate drag (right button)
  const rotDragRef = useRef<{ x: number; y: number; az: number; el: number } | null>(null);

  const [dateStr, setDateStr] = useState('');
  const [, forceUpdate] = useState(0);
  const [tooltip, setTooltip] = useState<{
    visible: boolean; x: number; y: number;
    planet: PlanetData | null; dist: number;
  }>({ visible: false, x: 0, y: 0, planet: null, dist: 0 });

  const updateState = useCallback((patch: Partial<SimState>) => {
    Object.assign(stateRef.current, patch);
    forceUpdate(n => n + 1);
  }, []);

  const resetView = useCallback(() => {
    viewRef.current = { zoom: 1, panX: 0, panY: 0, rotAz: 0, rotEl: 0 };
  }, []);

  const jumpToNow = useCallback(() => {
    simJDRef.current = dateToJD(new Date());
  }, []);

  const setViewAngle = useCallback((az: number, el: number) => {
    viewRef.current.rotAz = az;
    viewRef.current.rotEl = el;
    viewRef.current.panX = 0;
    viewRef.current.panY = 0;
  }, []);

  // ── 3D projection helpers (recreated each frame inside draw) ──────────────
  //
  // Rotation: first spin around ecliptic Z (azimuth), then tilt around
  // the resulting X axis (elevation). With rotEl=0 you see top-down;
  // rotEl=π/2 is edge-on looking along +Y.
  //
  // toScreen maps a 3D ecliptic AU position to canvas pixels via an
  // orthographic projection scaled by the actual 3D heliocentric distance
  // so log-scale compression stays physically meaningful.

  // ── Main render loop ──────────────────────────────────────────────────────
  const draw = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { paused, speedExp, logScale, showOrbits, showLabels } = stateRef.current;
    const { zoom, panX, panY, rotAz, rotEl } = viewRef.current;

    if (!lastTRef.current) lastTRef.current = ts;
    const dt = Math.min((ts - lastTRef.current) / 1000, 0.1);
    lastTRef.current = ts;
    if (!paused) simJDRef.current += Math.pow(10, speedExp) * dt;

    const W = canvas.width, H = canvas.height;
    const cx = W / 2 + panX, cy = H / 2 + panY;
    const scale = Math.min(W, H) * 0.44 / auMap(32, logScale) * zoom;

    const cosAz = Math.cos(rotAz), sinAz = Math.sin(rotAz);
    const cosEl = Math.cos(rotEl), sinEl = Math.sin(rotEl);

    function project(ax: number, ay: number, az: number): [number, number] {
      // azimuth: spin in XY
      const x1 = ax * cosAz + ay * sinAz;
      const y1 = -ax * sinAz + ay * cosAz;
      // elevation: tilt Z into screen-Y
      const px = x1;
      const py = y1 * cosEl + az * sinEl;
      return [px, py];
    }

    function toScreen(ax: number, ay: number, az: number = 0): [number, number] {
      const [px, py] = project(ax, ay, az);
      const r3d = Math.sqrt(ax * ax + ay * ay + az * az);
      if (r3d < 1e-9) return [cx, cy];
      const sf = auMap(r3d, logScale) * scale / r3d;
      return [cx + px * sf, cy - py * sf];
    }

    // Camera-space depth: negative = closer to viewer
    function camZ(ax: number, ay: number, az: number): number {
      const y1 = -ax * sinAz + ay * cosAz;
      return -y1 * sinEl + az * cosEl;
    }

    // ── Draw ─────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#00001c';
    ctx.fillRect(0, 0, W, H);

    // Stars
    for (const { x, y, b, s } of STARS) {
      ctx.beginPath();
      ctx.arc(x * W, y * H, s, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${b * 0.65})`;
      ctx.fill();
    }

    // Asteroid belt (ecliptic plane, z=0)
    for (const { t, r } of BELT) {
      const [sx, sy] = toScreen(r * Math.cos(t), r * Math.sin(t), 0);
      ctx.beginPath();
      ctx.arc(sx, sy, 0.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(160,140,100,0.35)';
      ctx.fill();
    }

    // Orbit paths (drawn before planets so they appear behind)
    if (showOrbits) {
      for (const p of PLANETS) {
        const path = getOrbitPath(p);
        ctx.beginPath();
        path.forEach(([ax, ay, az], i) => {
          const [sx, sy] = toScreen(ax, ay, az);
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.strokeStyle = p.color + '30';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Sun
    let g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 60);
    g.addColorStop(0, 'rgba(255,200,30,0.5)');
    g.addColorStop(0.3, 'rgba(255,130,0,0.2)');
    g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
    g.addColorStop(0, 'rgba(255,255,180,1)');
    g.addColorStop(0.4, 'rgba(255,200,30,0.9)');
    g.addColorStop(1, 'rgba(255,110,0,0.7)');
    ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();

    if (showLabels) {
      ctx.fillStyle = 'rgba(255,221,68,0.6)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Sun', cx + 22, cy - 18);
    }

    // Planets — depth-sorted so closer ones render on top
    const jd = simJDRef.current;
    const planetList = PLANETS.map(p => {
      const pos = getPlanetPosition(p, jd);
      return { p, pos, depth: camZ(pos.x, pos.y, pos.z) };
    });
    // Draw farthest first
    planetList.sort((a, b) => b.depth - a.depth);

    let earthSX = 0, earthSY = 0;
    for (const { p, pos } of planetList) {
      const [sx, sy] = toScreen(pos.x, pos.y, pos.z);
      const r = Math.max(p.displayRadius, 2.5);

      // glow
      const pg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.5);
      pg.addColorStop(0, p.color + 'aa');
      pg.addColorStop(1, p.color + '00');
      ctx.beginPath(); ctx.arc(sx, sy, r * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = pg; ctx.fill();

      // body
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();

      // Saturn rings
      if (p.name === 'Saturn') {
        ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.28);
        for (const [rm, al, lw] of [[2.5, 'cc', 3], [2.0, '88', 2], [1.6, '55', 1.5]] as [number, string, number][]) {
          ctx.beginPath(); ctx.arc(0, 0, r * rm, 0, Math.PI * 2);
          ctx.strokeStyle = '#c8b560' + al; ctx.lineWidth = lw; ctx.stroke();
        }
        ctx.restore();
      }

      // Uranus ring
      if (p.name === 'Uranus') {
        ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.4);
        ctx.beginPath(); ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
        ctx.strokeStyle = '#7de8e833'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }

      if (showLabels) {
        ctx.fillStyle = p.color + 'dd';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(p.name, sx + r + 5, sy - r + 1);
      }

      if (p.name === 'Earth') { earthSX = sx; earthSY = sy; }
    }

    // Moon (screen-space orbit — not to scale, for visual character)
    const moonAngle = (jd / MOON.period) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(earthSX, earthSY, MOON.orbitPx, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200,200,180,0.1)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.beginPath();
    ctx.arc(earthSX + Math.cos(moonAngle) * MOON.orbitPx,
            earthSY - Math.sin(moonAngle) * MOON.orbitPx,
            MOON.radius, 0, Math.PI * 2);
    ctx.fillStyle = MOON.color; ctx.fill();

    setDateStr(fmtDate(jd));
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  // ── Resize + start loop ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, [draw]);

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      viewRef.current.zoom = Math.max(0.15, Math.min(80, viewRef.current.zoom * f));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // ── Mouse: pan (left) + rotate (right) ───────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      const { rotAz, rotEl } = viewRef.current;
      rotDragRef.current = { x: e.clientX, y: e.clientY, az: rotAz, el: rotEl };
    } else {
      const { panX, panY } = viewRef.current;
      panDragRef.current = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (panDragRef.current) {
      const d = panDragRef.current;
      viewRef.current.panX = d.px + (e.clientX - d.x);
      viewRef.current.panY = d.py + (e.clientY - d.y);
    }
    if (rotDragRef.current) {
      const d = rotDragRef.current;
      const SENS = 0.005;
      viewRef.current.rotAz = d.az + (e.clientX - d.x) * SENS;
      viewRef.current.rotEl = Math.max(-Math.PI / 2, Math.min(Math.PI / 2,
        d.el - (e.clientY - d.y) * SENS));
    }

    // Hover detection
    const canvas = canvasRef.current!;
    const { zoom, panX, panY, rotAz, rotEl, logScale } = {
      ...viewRef.current, logScale: stateRef.current.logScale,
    };
    const W = canvas.width, H = canvas.height;
    const cx = W / 2 + panX, cy = H / 2 + panY;
    const scale = Math.min(W, H) * 0.44 / auMap(32, logScale) * zoom;
    const cosAz = Math.cos(rotAz), sinAz = Math.sin(rotAz);
    const cosEl = Math.cos(rotEl), sinEl = Math.sin(rotEl);

    let found: PlanetData | null = null;
    let foundDist = 0;
    for (const p of PLANETS) {
      const pos = getPlanetPosition(p, simJDRef.current);
      const x1 = pos.x * cosAz + pos.y * sinAz;
      const y1 = -pos.x * sinAz + pos.y * cosAz;
      const px = x1, py = y1 * cosEl + pos.z * sinEl;
      const sf = auMap(pos.r, logScale) * scale / pos.r;
      const sx = cx + px * sf, sy = cy - py * sf;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < p.displayRadius + 10) {
        found = p; foundDist = pos.r; break;
      }
    }
    setTooltip({ visible: !!found, x: e.clientX, y: e.clientY, planet: found, dist: foundDist });
  }, []);

  const handleMouseUp = useCallback(() => {
    panDragRef.current = null;
    rotDragRef.current = null;
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: rotDragRef.current ? 'grabbing' : panDragRef.current ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={e => e.preventDefault()}
      />

      <ControlPanel
        state={stateRef.current}
        dateStr={dateStr}
        onUpdate={updateState}
        onResetView={resetView}
        onJumpToNow={jumpToNow}
        onSetViewAngle={setViewAngle}
      />

      {/* Tooltip */}
      {tooltip.visible && tooltip.planet && (
        <div
          className="fixed pointer-events-none z-20 rounded-xl"
          style={{
            left: tooltip.x + 18, top: tooltip.y - 12,
            background: 'rgba(3,6,22,0.96)',
            border: '1px solid rgba(80,120,255,0.35)',
            boxShadow: '0 8px 32px rgba(0,0,20,0.6)',
            backdropFilter: 'blur(16px)',
            fontFamily: 'monospace',
            padding: '13px 16px',
          }}
        >
          <div
            className="font-bold mb-2.5 pb-2"
            style={{
              fontSize: 14,
              color: tooltip.planet.color,
              borderBottom: `1px solid ${tooltip.planet.color}33`,
              textShadow: `0 0 12px ${tooltip.planet.color}88`,
            }}
          >
            {tooltip.planet.name}
          </div>
          {[
            ['Distance',   `${tooltip.dist.toFixed(3)} AU`],
            ['Semi-major', `${tooltip.planet.a.toFixed(3)} AU`],
            ['Inclination',`${tooltip.planet.i.toFixed(2)}°`],
            ['Eccentricity',tooltip.planet.e.toFixed(5)],
            ['Period',     `${Math.pow(tooltip.planet.a, 1.5).toFixed(2)} yr`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-5 mb-1 last:mb-0">
              <span style={{ color: '#445566', fontSize: 11 }}>{label}</span>
              <span style={{ color: '#c8d8ee', fontSize: 11 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div
        className="fixed bottom-4 left-4 rounded-2xl grid gap-x-5 gap-y-2"
        style={{
          gridTemplateColumns: '1fr 1fr',
          background: 'rgba(3,6,22,0.94)',
          border: '1px solid rgba(70,110,220,0.22)',
          boxShadow: '0 4px 24px rgba(0,0,20,0.5)',
          backdropFilter: 'blur(16px)',
          fontFamily: 'monospace',
          padding: '14px 18px',
        }}
      >
        {PLANETS.map(p => (
          <div key={p.name} className="flex items-center gap-2" style={{ color: '#6677aa', fontSize: 12 }}>
            <span
              className="rounded-full flex-shrink-0"
              style={{ width: 8, height: 8, background: p.color, boxShadow: `0 0 6px ${p.color}88` }}
            />
            {p.name}
          </div>
        ))}
      </div>

      {/* Hints */}
      <div
        className="fixed bottom-4 right-4 rounded-2xl"
        style={{
          background: 'rgba(3,6,22,0.94)',
          border: '1px solid rgba(70,110,220,0.22)',
          boxShadow: '0 4px 24px rgba(0,0,20,0.5)',
          backdropFilter: 'blur(16px)',
          fontFamily: 'monospace',
          padding: '14px 18px',
        }}
      >
        {[
          ['Scroll', 'zoom'],
          ['Left-drag', 'pan'],
          ['Right-drag', 'rotate'],
          ['Hover', 'planet info'],
        ].map(([key, val]) => (
          <div key={key} className="flex items-center gap-3 mb-1 last:mb-0">
            <span
              className="text-[11px] rounded text-right"
              style={{
                color: '#e8efff',
                background: 'rgba(80,120,255,0.15)',
                border: '1px solid rgba(80,120,255,0.25)',
                padding: '2px 7px',
                minWidth: 74,
              }}
            >
              {key}
            </span>
            <span style={{ color: '#445566', fontSize: 11 }}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
