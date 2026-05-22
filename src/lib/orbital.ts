// Keplerian orbital mechanics — Standish (1992) formulation

export interface PlanetData {
  name: string;
  color: string;
  displayRadius: number;
  /** semi-major axis AU */
  a: number;
  /** eccentricity */
  e: number;
  /** inclination to ecliptic, degrees */
  i: number;
  /** longitude of ascending node, degrees */
  Omega: number;
  /** longitude of perihelion (Ω + ω), degrees */
  omega_bar: number;
  /** mean longitude at J2000, degrees */
  L0: number;
  /** mean motion, degrees/day */
  n: number;
}

export interface PlanetPos {
  x: number;
  y: number;
  z: number;
  /** heliocentric distance AU */
  r: number;
}

const J2000 = 2451545.0;

export function dateToJD(date: Date): number {
  const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1;
  const d = date.getUTCDate() + date.getUTCHours() / 24 +
    date.getUTCMinutes() / 1440 + date.getUTCSeconds() / 86400;
  let Y = y, M = m;
  if (M <= 2) { Y--; M += 12; }
  const A = Math.floor(Y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5;
}

export function jdToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

function solveKepler(M_deg: number, e: number): number {
  let M = ((M_deg * Math.PI / 180) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  let E = M;
  for (let i = 0; i < 100; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-11) break;
  }
  return E;
}

/** Precompute the P/Q basis vectors for orbital-plane → ecliptic transform */
function orbitBasis(p: PlanetData) {
  const ir = p.i * Math.PI / 180;
  const Or = p.Omega * Math.PI / 180;
  const wr = (p.omega_bar - p.Omega) * Math.PI / 180;
  const ci = Math.cos(ir), si = Math.sin(ir);
  const cO = Math.cos(Or), sO = Math.sin(Or);
  const cw = Math.cos(wr), sw = Math.sin(wr);
  return {
    // perihelion direction
    Px: cO * cw - sO * sw * ci,
    Py: sO * cw + cO * sw * ci,
    Pz: sw * si,
    // 90° ahead direction
    Qx: -cO * sw - sO * cw * ci,
    Qy: -sO * sw + cO * cw * ci,
    Qz: cw * si,
  };
}

export function getPlanetPosition(p: PlanetData, jd: number): PlanetPos {
  const d = jd - J2000;
  const L = p.L0 + p.n * d;
  const M = L - p.omega_bar;
  const E = solveKepler(M, p.e);
  const nu = Math.atan2(Math.sqrt(1 - p.e * p.e) * Math.sin(E), Math.cos(E) - p.e);
  const r = p.a * (1 - p.e * Math.cos(E));
  const { Px, Py, Pz, Qx, Qy, Qz } = orbitBasis(p);
  const qx = r * Math.cos(nu);
  const qy = r * Math.sin(nu);
  return {
    x: Px * qx + Qx * qy,
    y: Py * qx + Qy * qy,
    z: Pz * qx + Qz * qy,
    r,
  };
}

/** Full 3D ecliptic orbit path for drawing */
export function getOrbitPath(p: PlanetData, steps = 300): [number, number, number][] {
  const { Px, Py, Pz, Qx, Qy, Qz } = orbitBasis(p);
  const b = p.a * Math.sqrt(1 - p.e * p.e);
  return Array.from({ length: steps + 1 }, (_, k) => {
    const E = (k / steps) * 2 * Math.PI;
    const qx = p.a * Math.cos(E) - p.a * p.e;
    const qy = b * Math.sin(E);
    return [Px * qx + Qx * qy, Py * qx + Qy * qy, Pz * qx + Qz * qy] as [number, number, number];
  });
}

export function fmtDate(jd: number): string {
  return jdToDate(jd).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** AU → compressed screen-AU (log mode squishes outer system) */
export function auMap(au: number, logScale: boolean): number {
  if (!logScale) return au;
  return Math.log10(au + 1) * 20.09;
}
