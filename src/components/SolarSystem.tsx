'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { PLANETS, MOON, BELT, beltAngle } from '@/lib/planets';
import { getPlanetPosition, getOrbitPath, dateToJD, fmtDate, auMap } from '@/lib/orbital';
import type { PlanetData, PlanetPos } from '@/lib/orbital';
import { keplerStateAt, stepVerlet, segmentCapturesAny, MAX_SUBSTEP_DAYS, MAX_SUBSTEPS, type BodyState, type MassivePoint } from '@/lib/nbody';
import ControlPanel from './ControlPanel';
import OrientationGizmo from './OrientationGizmo';

const DEFAULT_BH_MASS_EXP = 4; // 10^4 = 10,000 M☉
const TRAIL_LEN = 90;

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
  rotAz: number;
  rotEl: number;
}

interface BlackHole {
  id: number;
  x: number;
  y: number;
  z: number;
  mass: number;
}

const J2000 = 2451545.0;
const SUN_AGE_J2000_YEARS = 4.603e9;
const SUN_LIFESPAN_YEARS = 10e9;

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

  const panDragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const rotDragRef = useRef<{ x: number; y: number; az: number; el: number } | null>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const [blackHoles, setBlackHoles] = useState<BlackHole[]>([]);
  const blackHolesRef = useRef<BlackHole[]>([]);
  useEffect(() => { blackHolesRef.current = blackHoles; }, [blackHoles]);

  // Log-mass exponent: actual mass = 10^bhMassExp solar masses.
  const [bhMassExp, setBhMassExp] = useState(DEFAULT_BH_MASS_EXP);
  // Retroactively resize existing BHs when the slider moves.
  useEffect(() => {
    const mass = Math.pow(10, bhMassExp);
    setBlackHoles(prev => prev.length === 0 ? prev : prev.map(bh => ({ ...bh, mass })));
  }, [bhMassExp]);

  const [placingBH, setPlacingBH] = useState(false);
  const placingBHRef = useRef(false);
  useEffect(() => { placingBHRef.current = placingBH; }, [placingBH]);

  // Mirror of viewRef rotation, exposed to React so the orientation gizmo can re-render.
  const [viewAngle, setViewAngleState] = useState<{ az: number; el: number }>({ az: 0, el: 0 });

  // When any BH is placed, planets are integrated numerically from this state.
  // Null = pure-Kepler analytical propagation.
  const nbodyRef = useRef<BodyState[] | null>(null);
  // Cached current planet positions for hover detection + rendering (one entry per PLANETS).
  const positionsRef = useRef<PlanetPos[]>(
    PLANETS.map(p => getPlanetPosition(p, dateToJD(new Date())))
  );
  // Position history for trail rendering when in N-body mode.
  const trailsRef = useRef<Array<Array<[number, number, number]>>>(
    PLANETS.map(() => [])
  );
  // Per-planet alive flag. A planet whose distance to any BH drops below
  // CAPTURE_RADIUS is marked dead and skipped by the integrator and renderer.
  const aliveRef = useRef<boolean[]>(PLANETS.map(() => true));
  // Sun is itself a body in N-body mode — it feels BH gravity and can be consumed.
  const sunStateRef = useRef<BodyState>({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
  const sunAliveRef = useRef(true);
  // Reusable MassivePoint view onto sunStateRef so we don't allocate every substep.
  const sunMassiveRef = useRef<MassivePoint>({ x: 0, y: 0, z: 0, mass: 1.0 });
  // Trail of Sun positions in N-body mode (only meaningful once it starts moving).
  const sunTrailRef = useRef<Array<[number, number, number]>>([]);
  // Asteroid belt: in N-body mode we integrate each particle and let BHs capture them.
  // Null = Kepler-analytic (particles orbit Sun on circular orbits).
  const beltNbodyRef = useRef<BodyState[] | null>(null);
  const beltAliveRef = useRef<boolean[]>(BELT.map(() => true));

  const [dateStr, setDateStr] = useState('');
  const [sunAgeGyr, setSunAgeGyr] = useState(SUN_AGE_J2000_YEARS / 1e9);
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
    setViewAngleState({ az: 0, el: 0 });
  }, []);

  const jumpToNow = useCallback(() => {
    simJDRef.current = dateToJD(new Date());
  }, []);

  const setViewAngle = useCallback((az: number, el: number) => {
    viewRef.current.rotAz = az;
    viewRef.current.rotEl = el;
    viewRef.current.panX = 0;
    viewRef.current.panY = 0;
    setViewAngleState({ az, el });
  }, []);

  const togglePlaceBH = useCallback(() => setPlacingBH(v => !v), []);
  const clearBlackHoles = useCallback(() => {
    nbodyRef.current = null;
    trailsRef.current = PLANETS.map(() => []);
    aliveRef.current = PLANETS.map(() => true);
    sunStateRef.current = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    sunAliveRef.current = true;
    sunTrailRef.current = [];
    beltNbodyRef.current = null;
    beltAliveRef.current = BELT.map(() => true);
    setBlackHoles([]);
  }, []);

  // Inverse-project a screen click onto the ecliptic z=0 plane.
  // Derivation: screen radial r_screen = scale * auMap(r_3d). Inverting auMap gives r_3d,
  // and the angular pair (px, py/cosEl) recovers the rotated XY which we un-rotate by -rotAz.
  const screenToEcliptic = useCallback((sx: number, sy: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const { zoom, panX, panY, rotAz, rotEl } = viewRef.current;
    const { logScale } = stateRef.current;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2 + panX, cy = H / 2 + panY;
    const scale = Math.min(W, H) * 0.44 / auMap(32, logScale) * zoom;

    const u = sx - cx;
    const v = cy - sy;
    const cosEl = Math.cos(rotEl);
    if (Math.abs(cosEl) < 1e-3) return null;

    const screen_au = Math.sqrt(u * u + (v / cosEl) * (v / cosEl)) / scale;
    const r = logScale ? Math.pow(10, screen_au / 20.09) - 1 : screen_au;
    if (r <= 1e-6 || !isFinite(r)) return null;

    const sf = auMap(r, logScale) * scale / r;
    const pp = u / sf;
    const pq = (v / sf) / cosEl;

    const cosAz = Math.cos(rotAz), sinAz = Math.sin(rotAz);
    return { x: pp * cosAz - pq * sinAz, y: pp * sinAz + pq * cosAz };
  }, []);

  const draw = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { paused, speedExp, logScale, showOrbits, showLabels } = stateRef.current;
    const { zoom, panX, panY, rotAz, rotEl } = viewRef.current;

    if (!lastTRef.current) lastTRef.current = ts;
    const dt = Math.min((ts - lastTRef.current) / 1000, 0.1);
    lastTRef.current = ts;

    if (!paused) {
      const requested = Math.pow(10, speedExp) * dt;
      if (nbodyRef.current) {
        // N-body: integrate with bounded substeps so high speedExp can't blow up Verlet
        const maxAdvance = MAX_SUBSTEPS * MAX_SUBSTEP_DAYS;
        const advance = Math.min(requested, maxAdvance);
        const nSub = Math.max(1, Math.ceil(advance / MAX_SUBSTEP_DAYS));
        const dtSub = advance / nSub;
        const bhs = blackHolesRef.current;
        const states = nbodyRef.current;
        const alive = aliveRef.current;
        const sunState = sunStateRef.current;
        const sunMass = sunMassiveRef.current;
        for (let i = 0; i < nSub; i++) {
          // 1. Advance the Sun first (only BHs pull on it).
          if (sunAliveRef.current) {
            const px = sunState.x, py = sunState.y, pz = sunState.z;
            stepVerlet(sunState, null, bhs, dtSub);
            if (segmentCapturesAny(px, py, pz, sunState.x, sunState.y, sunState.z, bhs)) {
              sunAliveRef.current = false;
            }
            sunMass.x = sunState.x; sunMass.y = sunState.y; sunMass.z = sunState.z;
          }
          // 2. Advance each surviving planet using current Sun position.
          const sunArg = sunAliveRef.current ? sunMass : null;
          for (let j = 0; j < states.length; j++) {
            if (!alive[j]) continue;
            const s = states[j];
            const px = s.x, py = s.y, pz = s.z;
            stepVerlet(s, sunArg, bhs, dtSub);
            if (segmentCapturesAny(px, py, pz, s.x, s.y, s.z, bhs)) {
              alive[j] = false;
            }
          }
          // 3. Advance asteroid belt (test particles, same forces as planets).
          const belt = beltNbodyRef.current;
          if (belt) {
            const beltAlive = beltAliveRef.current;
            for (let j = 0; j < belt.length; j++) {
              if (!beltAlive[j]) continue;
              const s = belt[j];
              const px = s.x, py = s.y, pz = s.z;
              stepVerlet(s, sunArg, bhs, dtSub);
              if (segmentCapturesAny(px, py, pz, s.x, s.y, s.z, bhs)) {
                beltAlive[j] = false;
              }
            }
          }
        }
        simJDRef.current += advance;
      } else {
        simJDRef.current += requested;
      }
    }

    // Refresh cached positions used by render + hover detection.
    if (nbodyRef.current) {
      const alive = aliveRef.current;
      for (let i = 0; i < PLANETS.length; i++) {
        if (!alive[i]) continue;
        const s = nbodyRef.current[i];
        const r = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
        positionsRef.current[i] = { x: s.x, y: s.y, z: s.z, r };
        const tr = trailsRef.current[i];
        tr.push([s.x, s.y, s.z]);
        if (tr.length > TRAIL_LEN) tr.shift();
      }
    } else {
      for (let i = 0; i < PLANETS.length; i++) {
        positionsRef.current[i] = getPlanetPosition(PLANETS[i], simJDRef.current);
      }
    }

    const W = canvas.width, H = canvas.height;
    const cx = W / 2 + panX, cy = H / 2 + panY;
    const scale = Math.min(W, H) * 0.44 / auMap(32, logScale) * zoom;

    const cosAz = Math.cos(rotAz), sinAz = Math.sin(rotAz);
    const cosEl = Math.cos(rotEl), sinEl = Math.sin(rotEl);

    function project(ax: number, ay: number, az: number): [number, number] {
      const x1 = ax * cosAz + ay * sinAz;
      const y1 = -ax * sinAz + ay * cosAz;
      return [x1, y1 * cosEl + az * sinEl];
    }

    function toScreen(ax: number, ay: number, az: number = 0): [number, number] {
      const [px, py] = project(ax, ay, az);
      const r3d = Math.sqrt(ax * ax + ay * ay + az * az);
      if (r3d < 1e-9) return [cx, cy];
      const sf = auMap(r3d, logScale) * scale / r3d;
      return [cx + px * sf, cy - py * sf];
    }

    function camZ(ax: number, ay: number, az: number): number {
      const y1 = -ax * sinAz + ay * cosAz;
      return -y1 * sinEl + az * cosEl;
    }

    ctx.fillStyle = '#00001c';
    ctx.fillRect(0, 0, W, H);

    for (const { x, y, b, s } of STARS) {
      ctx.beginPath();
      ctx.arc(x * W, y * H, s, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${b * 0.65})`;
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(160,140,100,0.35)';
    if (beltNbodyRef.current) {
      const belt = beltNbodyRef.current;
      const beltAlive = beltAliveRef.current;
      for (let i = 0; i < belt.length; i++) {
        if (!beltAlive[i]) continue;
        const b = belt[i];
        const [sx, sy] = toScreen(b.x, b.y, b.z);
        ctx.beginPath();
        ctx.arc(sx, sy, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const jd = simJDRef.current;
      for (const p of BELT) {
        const t = beltAngle(p, jd);
        const [sx, sy] = toScreen(p.r * Math.cos(t), p.r * Math.sin(t), 0);
        ctx.beginPath();
        ctx.arc(sx, sy, 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const nbodyOn = nbodyRef.current !== null;

    if (showOrbits) {
      const orbitAlphaHex = nbodyOn ? '15' : '30';
      const alive = aliveRef.current;
      for (let i = 0; i < PLANETS.length; i++) {
        if (!alive[i]) continue;
        const p = PLANETS[i];
        const path = getOrbitPath(p);
        ctx.beginPath();
        path.forEach(([ax, ay, az], i) => {
          const [sx, sy] = toScreen(ax, ay, az);
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.strokeStyle = p.color + orbitAlphaHex;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Perturbation trails (under planets, above orbit rings)
    if (nbodyOn) {
      ctx.lineWidth = 1.4;
      const alive = aliveRef.current;
      for (let i = 0; i < PLANETS.length; i++) {
        if (!alive[i]) continue;
        const trail = trailsRef.current[i];
        if (trail.length < 2) continue;
        const color = PLANETS[i].color;
        for (let k = 1; k < trail.length; k++) {
          const t0 = trail[k - 1], t1 = trail[k];
          const [sx0, sy0] = toScreen(t0[0], t0[1], t0[2]);
          const [sx1, sy1] = toScreen(t1[0], t1[1], t1[2]);
          const a = k / trail.length;
          const ah = Math.floor(a * 220).toString(16).padStart(2, '0');
          ctx.beginPath();
          ctx.moveTo(sx0, sy0);
          ctx.lineTo(sx1, sy1);
          ctx.strokeStyle = color + ah;
          ctx.stroke();
        }
      }
    }

    // Sun (projected through toScreen so it can drift in N-body mode)
    let sunSX = cx, sunSY = cy;
    if (nbodyOn) {
      const ss = sunStateRef.current;
      [sunSX, sunSY] = toScreen(ss.x, ss.y, ss.z);
      // Record trail
      const tr = sunTrailRef.current;
      tr.push([ss.x, ss.y, ss.z]);
      if (tr.length > TRAIL_LEN) tr.shift();
      if (tr.length >= 2) {
        ctx.lineWidth = 1.4;
        for (let k = 1; k < tr.length; k++) {
          const t0 = tr[k - 1], t1 = tr[k];
          const [sx0, sy0] = toScreen(t0[0], t0[1], t0[2]);
          const [sx1, sy1] = toScreen(t1[0], t1[1], t1[2]);
          const a = k / tr.length;
          const ah = Math.floor(a * 220).toString(16).padStart(2, '0');
          ctx.beginPath();
          ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1);
          ctx.strokeStyle = '#ffcc44' + ah;
          ctx.stroke();
        }
      }
    }

    if (sunAliveRef.current) {
      let g = ctx.createRadialGradient(sunSX, sunSY, 4, sunSX, sunSY, 60);
      g.addColorStop(0, 'rgba(255,200,30,0.5)');
      g.addColorStop(0.3, 'rgba(255,130,0,0.2)');
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.beginPath(); ctx.arc(sunSX, sunSY, 60, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
      g = ctx.createRadialGradient(sunSX, sunSY, 0, sunSX, sunSY, 20);
      g.addColorStop(0, 'rgba(255,255,180,1)');
      g.addColorStop(0.4, 'rgba(255,200,30,0.9)');
      g.addColorStop(1, 'rgba(255,110,0,0.7)');
      ctx.beginPath(); ctx.arc(sunSX, sunSY, 20, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();

      if (showLabels) {
        ctx.fillStyle = 'rgba(255,221,68,0.6)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Sun', sunSX + 22, sunSY - 18);
      }
    }

    const jd = simJDRef.current;
    const alivePlanets = aliveRef.current;
    const planetList = PLANETS
      .map((p, i) => ({ p, i, pos: positionsRef.current[i] }))
      .filter(({ i }) => alivePlanets[i])
      .map(({ p, i, pos }) => ({ p, i, pos, depth: camZ(pos.x, pos.y, pos.z) }));
    planetList.sort((a, b) => b.depth - a.depth);

    let earthSX = 0, earthSY = 0;
    let earthVisible = false;
    for (const { p, pos } of planetList) {
      const [sx, sy] = toScreen(pos.x, pos.y, pos.z);
      const r = Math.max(p.displayRadius, 2.5);

      const pg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.5);
      pg.addColorStop(0, p.color + 'aa');
      pg.addColorStop(1, p.color + '00');
      ctx.beginPath(); ctx.arc(sx, sy, r * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = pg; ctx.fill();

      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.fill();

      if (p.name === 'Saturn') {
        ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.28);
        for (const [rm, al, lw] of [[2.5, 'cc', 3], [2.0, '88', 2], [1.6, '55', 1.5]] as [number, string, number][]) {
          ctx.beginPath(); ctx.arc(0, 0, r * rm, 0, Math.PI * 2);
          ctx.strokeStyle = '#c8b560' + al; ctx.lineWidth = lw; ctx.stroke();
        }
        ctx.restore();
      }

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

      if (p.name === 'Earth') { earthSX = sx; earthSY = sy; earthVisible = true; }
    }

    if (earthVisible) {
      const moonAngle = (jd / MOON.period) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(earthSX, earthSY, MOON.orbitPx, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(200,200,180,0.1)'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.beginPath();
      ctx.arc(earthSX + Math.cos(moonAngle) * MOON.orbitPx,
              earthSY - Math.sin(moonAngle) * MOON.orbitPx,
              MOON.radius, 0, Math.PI * 2);
      ctx.fillStyle = MOON.color; ctx.fill();
    }

    // Black holes (with depth sort against planets would be ideal; for clarity render on top)
    const bhList = blackHolesRef.current.map(bh => ({
      bh, depth: camZ(bh.x, bh.y, bh.z),
    })).sort((a, b) => b.depth - a.depth);

    const tspin = (ts / 1000) * 0.6;
    for (const { bh } of bhList) {
      const [sx, sy] = toScreen(bh.x, bh.y, bh.z);
      const eh = 7;

      // Outer halo
      const halo = ctx.createRadialGradient(sx, sy, eh, sx, sy, eh * 7);
      halo.addColorStop(0, 'rgba(255,140,40,0.55)');
      halo.addColorStop(0.4, 'rgba(180,50,20,0.25)');
      halo.addColorStop(1, 'rgba(80,10,10,0)');
      ctx.beginPath(); ctx.arc(sx, sy, eh * 7, 0, Math.PI * 2);
      ctx.fillStyle = halo; ctx.fill();

      // Accretion disk: tilted ring with rotating brightness
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rotAz);
      ctx.scale(1, Math.max(0.18, Math.abs(cosEl)));
      for (let k = 0; k < 60; k++) {
        const a0 = (k / 60) * Math.PI * 2 + tspin;
        const a1 = ((k + 1) / 60) * Math.PI * 2 + tspin;
        const bright = 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.cos(a0 - tspin * 3), 2);
        ctx.beginPath();
        ctx.arc(0, 0, eh * 2.4, a0, a1);
        ctx.strokeStyle = `rgba(255,${150 + Math.floor(80 * bright)},${60 * bright},${0.55 * bright + 0.2})`;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.restore();

      // Photon ring
      ctx.beginPath(); ctx.arc(sx, sy, eh * 1.35, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,230,190,0.75)';
      ctx.lineWidth = 1.2; ctx.stroke();

      // Event horizon
      ctx.beginPath(); ctx.arc(sx, sy, eh, 0, Math.PI * 2);
      ctx.fillStyle = '#000'; ctx.fill();

      if (showLabels) {
        ctx.fillStyle = 'rgba(255,140,60,0.85)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Black Hole', sx + eh + 6, sy - eh + 1);
      }
    }

    setDateStr(fmtDate(jd));
    setSunAgeGyr((SUN_AGE_J2000_YEARS + (jd - J2000) / 365.25) / 1e9);
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);
    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, [draw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && placingBHRef.current) setPlacingBH(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    if (placingBHRef.current && e.button === 0) return;
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
      const newAz = d.az + (e.clientX - d.x) * SENS;
      const newEl = Math.max(-Math.PI, Math.min(Math.PI,
        d.el - (e.clientY - d.y) * SENS));
      viewRef.current.rotAz = newAz;
      viewRef.current.rotEl = newEl;
      setViewAngleState({ az: newAz, el: newEl });
    }

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
    const alive = aliveRef.current;
    for (let i = 0; i < PLANETS.length; i++) {
      if (!alive[i]) continue;
      const p = PLANETS[i];
      const pos = positionsRef.current[i];
      const x1 = pos.x * cosAz + pos.y * sinAz;
      const y1 = -pos.x * sinAz + pos.y * cosAz;
      const px = x1, py = y1 * cosEl + pos.z * sinEl;
      if (pos.r < 1e-9) continue;
      const sf = auMap(pos.r, logScale) * scale / pos.r;
      const sx = cx + px * sf, sy = cy - py * sf;
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < p.displayRadius + 10) {
        found = p; foundDist = pos.r; break;
      }
    }
    setTooltip({ visible: !!found, x: e.clientX, y: e.clientY, planet: found, dist: foundDist });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const down = mouseDownPosRef.current;
    mouseDownPosRef.current = null;
    panDragRef.current = null;
    rotDragRef.current = null;

    if (!placingBHRef.current || !down) return;
    if (e.button !== 0) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 4) return; // dragged, not clicked

    const pos = screenToEcliptic(e.clientX, e.clientY);
    if (!pos) return;
    setBlackHoles(prev => {
      if (prev.length === 0) {
        // Transitioning Kepler → N-body: seed integrator state from current Kepler positions.
        nbodyRef.current = PLANETS.map(p => keplerStateAt(p, simJDRef.current));
        trailsRef.current = PLANETS.map(() => []);
        aliveRef.current = PLANETS.map(() => true);
        sunStateRef.current = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
        sunAliveRef.current = true;
        sunTrailRef.current = [];
        // Seed belt: circular-orbit position + tangential velocity ω·r.
        const jd = simJDRef.current;
        beltNbodyRef.current = BELT.map(p => {
          const t = beltAngle(p, jd);
          const cos = Math.cos(t), sin = Math.sin(t);
          const v = p.omega * p.r;
          return { x: p.r * cos, y: p.r * sin, z: 0, vx: -v * sin, vy: v * cos, vz: 0 };
        });
        beltAliveRef.current = BELT.map(() => true);
      }
      return [...prev, { id: Date.now() + Math.random(), x: pos.x, y: pos.y, z: 0, mass: Math.pow(10, bhMassExp) }];
    });
    setPlacingBH(false);
  }, [screenToEcliptic, bhMassExp]);

  const cursor = placingBH
    ? 'crosshair'
    : rotDragRef.current || panDragRef.current
      ? 'grabbing'
      : 'grab';

  const sunProgress = Math.min(1, Math.max(0, (sunAgeGyr * 1e9) / SUN_LIFESPAN_YEARS));

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          mouseDownPosRef.current = null;
          panDragRef.current = null;
          rotDragRef.current = null;
        }}
        onContextMenu={e => e.preventDefault()}
      />

      <ControlPanel
        state={stateRef.current}
        dateStr={dateStr}
        sunAgeGyr={sunAgeGyr}
        sunProgress={sunProgress}
        blackHoleCount={blackHoles.length}
        placingBH={placingBH}
        bhMassExp={bhMassExp}
        onBhMassExpChange={setBhMassExp}
        onUpdate={updateState}
        onResetView={resetView}
        onJumpToNow={jumpToNow}
        onTogglePlaceBH={togglePlaceBH}
        onClearBlackHoles={clearBlackHoles}
      />

      <OrientationGizmo
        rotAz={viewAngle.az}
        rotEl={viewAngle.el}
        onSetViewAngle={setViewAngle}
        onResetView={resetView}
      />

      {placingBH && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-20 px-5 py-3 rounded-xl font-mono text-sm
                        bg-[rgba(3,6,22,0.94)] border border-[rgba(255,140,60,0.5)]
                        text-[#ffb070] shadow-[0_0_24px_rgba(255,140,40,0.25)] backdrop-blur-md">
          Click on the simulation to place a black hole · Esc to cancel
        </div>
      )}

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
            ['Distance',    `${tooltip.dist.toFixed(3)} AU`],
            ['Semi-major',  `${tooltip.planet.a.toFixed(3)} AU`],
            ['Inclination', `${tooltip.planet.i.toFixed(2)}°`],
            ['Eccentricity', tooltip.planet.e.toFixed(5)],
            ['Period',      `${Math.pow(tooltip.planet.a, 1.5).toFixed(2)} yr`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-5 mb-1 last:mb-0">
              <span style={{ color: '#445566', fontSize: 11 }}>{label}</span>
              <span style={{ color: '#c8d8ee', fontSize: 11 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

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
              className="rounded-full shrink-0"
              style={{ width: 8, height: 8, background: p.color, boxShadow: `0 0 6px ${p.color}88` }}
            />
            {p.name}
          </div>
        ))}
      </div>

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
