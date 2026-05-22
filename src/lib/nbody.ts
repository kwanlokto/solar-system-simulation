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
  blackHoles: MassivePoint[],
  out: [number, number, number],
): void {
  const r2 = x * x + y * y + z * z + SOFT2;
  const inv_r3 = 1 / (Math.sqrt(r2) * r2);
  let ax = -GM_SUN * x * inv_r3;
  let ay = -GM_SUN * y * inv_r3;
  let az = -GM_SUN * z * inv_r3;
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

/** Velocity-Verlet step. Mutates `s`. */
export function stepVerlet(s: BodyState, blackHoles: MassivePoint[], dt: number): void {
  accel(s.x, s.y, s.z, blackHoles, A1);
  const nx = s.x + s.vx * dt + 0.5 * A1[0] * dt * dt;
  const ny = s.y + s.vy * dt + 0.5 * A1[1] * dt * dt;
  const nz = s.z + s.vz * dt + 0.5 * A1[2] * dt * dt;
  accel(nx, ny, nz, blackHoles, A2);
  s.vx += 0.5 * (A1[0] + A2[0]) * dt;
  s.vy += 0.5 * (A1[1] + A2[1]) * dt;
  s.vz += 0.5 * (A1[2] + A2[2]) * dt;
  s.x = nx; s.y = ny; s.z = nz;
}

export const MAX_SUBSTEP_DAYS = 0.25;
export const MAX_SUBSTEPS = 250;
