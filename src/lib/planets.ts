import { PlanetData } from './orbital';

// Full orbital elements: Standish (1992), J2000 epoch, valid 1800–2050
// i = inclination to ecliptic, Omega = longitude of ascending node
export const PLANETS: PlanetData[] = [
  { name: 'Mercury', color: '#b0b0b8', displayRadius: 3,
    a: 0.38709927, e: 0.20563593, i:  7.00497902, Omega:  48.33076593,
    omega_bar:  77.45779628, L0: 252.25032350, n: 4.09233445 },
  { name: 'Venus',   color: '#e8cfa0', displayRadius: 5,
    a: 0.72333566, e: 0.00677672, i:  3.39467605, Omega:  76.67984255,
    omega_bar: 131.60246718, L0: 181.97909950, n: 1.60213034 },
  { name: 'Earth',   color: '#4a9fe0', displayRadius: 5,
    a: 1.00000261, e: 0.01671123, i: -0.00001531, Omega:   0.0,
    omega_bar: 102.93768193, L0: 100.46457166, n: 0.98560028 },
  { name: 'Mars',    color: '#c1440e', displayRadius: 4,
    a: 1.52371034, e: 0.09339410, i:  1.84969142, Omega:  49.55953891,
    omega_bar: -23.94362959, L0:  -4.55343205, n: 0.52402068 },
  { name: 'Jupiter', color: '#c9a06a', displayRadius: 11,
    a: 5.20288700, e: 0.04838624, i:  1.30439695, Omega: 100.47390909,
    omega_bar:  14.72847983, L0:  34.39644051, n: 0.08308529 },
  { name: 'Saturn',  color: '#e4d191', displayRadius: 9,
    a: 9.53667594, e: 0.05386179, i:  2.48599187, Omega: 113.66242448,
    omega_bar:  92.59887831, L0:  49.95424423, n: 0.03344414 },
  { name: 'Uranus',  color: '#7de8e8', displayRadius: 7,
    a: 19.18916464, e: 0.04725744, i:  0.77263783, Omega:  74.01692503,
    omega_bar: 170.95427630, L0: 313.23810451, n: 0.01172834 },
  { name: 'Neptune', color: '#3f55c8', displayRadius: 7,
    a: 30.06992276, e: 0.00859048, i:  1.77004347, Omega: 131.78422574,
    omega_bar:  44.96476227, L0: -55.12002969, n: 0.00598108 },
];

export const MOON = { color: '#c8c8b8', radius: 2, orbitPx: 22, period: 27.321582 };

// Deterministic asteroid belt particles (ecliptic plane, z≈0).
// Each particle is a circular orbit (a=r) with Keplerian angular velocity.
function lcg(s: number): number {
  return (((s * 1664525 + 1013904223) | 0) >>> 0);
}
export interface BeltParticle {
  /** angle at J2000, radians */
  t0: number;
  /** orbital radius AU */
  r: number;
  /** angular velocity, rad/day */
  omega: number;
}
const _GM_SUN_DAY = 0.01720209895 * 0.01720209895;
export const BELT: BeltParticle[] = [];
{
  let s = 0x12345678;
  for (let i = 0; i < 1800; i++) {
    s = lcg(s); const t0 = (s & 0xffff) / 65535 * Math.PI * 2;
    s = lcg(s); const r = 2.2 + (s & 0xffff) / 65535 * 1.0;
    BELT.push({ t0, r, omega: Math.sqrt(_GM_SUN_DAY / (r * r * r)) });
  }
}

const _J2000 = 2451545.0;
/** Current angle of a belt particle at the given Julian date (Kepler-circular). */
export function beltAngle(p: BeltParticle, jd: number): number {
  return p.t0 + p.omega * (jd - _J2000);
}
