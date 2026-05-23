import { PlanetData, getPlanetPosition } from './orbital';

// Gaussian gravitational constant squared = GM_sun in AU^3 / day^2.
// k = 0.01720209895  →  k^2 ≈ 2.9591220828e-4
export const GM_SUN = 0.01720209895 * 0.01720209895;

export interface BodyState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
}

export interface MassivePoint {
  x: number; y: number; z: number;
  /** solar masses */
  mass: number;
}

const SOFT = 0.01;
const SOFT2 = SOFT * SOFT;

/** Central-difference Kepler velocity (AU/day). */
export function keplerStateAt(p: PlanetData, jd: number): BodyState {
  const eps = 0.5;
  const a = getPlanetPosition(p, jd - eps);
  const b = getPlanetPosition(p, jd);
  const c = getPlanetPosition(p, jd + eps);
  return {
    x: b.x, y: b.y, z: b.z,
    vx: (c.x - a.x) / (2 * eps),
    vy: (c.y - a.y) / (2 * eps),
    vz: (c.z - a.z) / (2 * eps),
  };
}

function accel(
  x: number, y: number, z: number,
  sun: MassivePoint | null,
  blackHoles: MassivePoint[],
  out: [number, number, number],
): void {
  let ax = 0, ay = 0, az = 0;
  if (sun) {
    const dx = sun.x - x, dy = sun.y - y, dz = sun.z - z;
    const r2 = dx * dx + dy * dy + dz * dz + SOFT2;
    const inv_r3 = 1 / (Math.sqrt(r2) * r2);
    const gm = GM_SUN * sun.mass;
    ax += gm * dx * inv_r3;
    ay += gm * dy * inv_r3;
    az += gm * dz * inv_r3;
  }
  for (const bh of blackHoles) {
    const dx = bh.x - x, dy = bh.y - y, dz = bh.z - z;
    const d2 = dx * dx + dy * dy + dz * dz + SOFT2;
    const inv_d3 = 1 / (Math.sqrt(d2) * d2);
    const gm = GM_SUN * bh.mass;
    ax += gm * dx * inv_d3;
    ay += gm * dy * inv_d3;
    az += gm * dz * inv_d3;
  }
  out[0] = ax; out[1] = ay; out[2] = az;
}

const A1: [number, number, number] = [0, 0, 0];
const A2: [number, number, number] = [0, 0, 0];

/**
 * Velocity-Verlet step. Mutates `s`. Pass `sun=null` to step a body that only
 * feels black-hole gravity (e.g. the Sun itself, or a planet after Sun is consumed).
 */
export function stepVerlet(
  s: BodyState,
  sun: MassivePoint | null,
  blackHoles: MassivePoint[],
  dt: number,
): void {
  accel(s.x, s.y, s.z, sun, blackHoles, A1);
  const nx = s.x + s.vx * dt + 0.5 * A1[0] * dt * dt;
  const ny = s.y + s.vy * dt + 0.5 * A1[1] * dt * dt;
  const nz = s.z + s.vz * dt + 0.5 * A1[2] * dt * dt;
  accel(nx, ny, nz, sun, blackHoles, A2);
  s.vx += 0.5 * (A1[0] + A2[0]) * dt;
  s.vy += 0.5 * (A1[1] + A2[1]) * dt;
  s.vz += 0.5 * (A1[2] + A2[2]) * dt;
  s.x = nx; s.y = ny; s.z = nz;
}

export const MAX_SUBSTEP_DAYS = 0.25;
export const MAX_SUBSTEPS = 250;

/** Capture distance in AU. A planet within this radius of any BH is absorbed. */
export const CAPTURE_RADIUS = 0.5;
export const CAPTURE_RADIUS2 = CAPTURE_RADIUS * CAPTURE_RADIUS;

/**
 * Returns true if the line segment from (px,py,pz) to (nx,ny,nz) passes within
 * CAPTURE_RADIUS of any BH. Catches tunneling cases where a planet enters and
 * exits the capture sphere within a single Verlet substep.
 */
export function segmentCapturesAny(
  px: number, py: number, pz: number,
  nx: number, ny: number, nz: number,
  blackHoles: MassivePoint[],
): boolean {
  const ex = nx - px, ey = ny - py, ez = nz - pz;
  const segLen2 = ex * ex + ey * ey + ez * ez;
  for (let k = 0; k < blackHoles.length; k++) {
    const bh = blackHoles[k];
    const bx = bh.x - px, by = bh.y - py, bz = bh.z - pz;
    let t = segLen2 > 0 ? (ex * bx + ey * by + ez * bz) / segLen2 : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = px + t * ex - bh.x;
    const cy = py + t * ey - bh.y;
    const cz = pz + t * ez - bh.z;
    if (cx * cx + cy * cy + cz * cz < CAPTURE_RADIUS2) return true;
  }
  return false;
}
