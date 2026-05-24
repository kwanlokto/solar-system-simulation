'use client';

import { useMemo, useState } from 'react';

interface Props {
  rotAz: number;
  rotEl: number;
  onSetViewAngle: (az: number, el: number) => void;
  onResetView: () => void;
}

const SIZE = 140;
const CENTER = SIZE / 2;
const RADIUS = 36;
const XI = Math.sqrt(2) - 1; // truncation factor: ≈ 0.414

interface V3 { x: number; y: number; z: number; }
interface FaceDef {
  vIdx: number[];
  center: V3;
  label: string;
  target: [number, number];
  kind: 'oct' | 'tri';
}

// (az, el) such that the camera looks at origin from direction (cx, cy, cz).
function dirToView(cx: number, cy: number, cz: number): [number, number] {
  const r = Math.hypot(cx, cy, cz);
  const el = Math.acos(cz / r);
  const az = Math.atan2(cx, -cy);
  return [az, el];
}

// Build truncated-cube geometry once (24 verts, 6 octagonal + 8 triangular faces).
const SHAPE: { verts: V3[]; faces: FaceDef[] } = (() => {
  const verts: V3[] = [];
  const pushUnique = (v: V3): number => {
    for (let i = 0; i < verts.length; i++) {
      const w = verts[i];
      if (Math.abs(w.x - v.x) < 1e-6 && Math.abs(w.y - v.y) < 1e-6 && Math.abs(w.z - v.z) < 1e-6) {
        return i;
      }
    }
    verts.push(v);
    return verts.length - 1;
  };
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pushUnique({ x: sx * XI, y: sy,      z: sz      });
    pushUnique({ x: sx,      y: sy * XI, z: sz      });
    pushUnique({ x: sx,      y: sy,      z: sz * XI });
  }

  const faces: FaceDef[] = [];

  // 6 octagons (cardinal directions)
  type Axis = 'x' | 'y' | 'z';
  const octDefs: Array<[Axis, number, string]> = [
    ['x',  1, 'RIGHT'],  ['x', -1, 'LEFT'],
    ['y',  1, 'BACK'],   ['y', -1, 'FRONT'],
    ['z',  1, 'TOP'],    ['z', -1, 'BOTTOM'],
  ];
  for (const [axis, val, label] of octDefs) {
    const matched: { idx: number; angle: number }[] = [];
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      if (Math.abs(v[axis] - val) < 1e-6) {
        let angle: number;
        if (axis === 'x')      angle = Math.atan2(v.z, v.y);
        else if (axis === 'y') angle = Math.atan2(v.x, v.z);
        else                   angle = Math.atan2(v.y, v.x);
        // Flip for negative face so CCW orientation is from outside the shape.
        matched.push({ idx: i, angle: angle * val });
      }
    }
    matched.sort((a, b) => a.angle - b.angle);
    const center: V3 = {
      x: axis === 'x' ? val : 0,
      y: axis === 'y' ? val : 0,
      z: axis === 'z' ? val : 0,
    };
    faces.push({
      vIdx: matched.map(m => m.idx),
      center,
      label,
      target: dirToView(center.x, center.y, center.z),
      kind: 'oct',
    });
  }

  // 8 triangles (corner directions)
  for (const sx of [-1, 1] as const)
    for (const sy of [-1, 1] as const)
      for (const sz of [-1, 1] as const) {
        const center: V3 = { x: sx, y: sy, z: sz };
        const matched: number[] = [];
        for (let i = 0; i < verts.length; i++) {
          const v = verts[i];
          if (Math.sign(v.x) !== sx || Math.sign(v.y) !== sy || Math.sign(v.z) !== sz) continue;
          // Corner verts: exactly one coordinate has magnitude XI (the others are 1).
          const small =
            (Math.abs(Math.abs(v.x) - XI) < 1e-6 ? 1 : 0) +
            (Math.abs(Math.abs(v.y) - XI) < 1e-6 ? 1 : 0) +
            (Math.abs(Math.abs(v.z) - XI) < 1e-6 ? 1 : 0);
          if (small === 1) matched.push(i);
        }
        faces.push({
          vIdx: matched,
          center,
          label: '',
          target: dirToView(center.x, center.y, center.z),
          kind: 'tri',
        });
      }

  return { verts, faces };
})();

function project(
  x: number, y: number, z: number,
  rotAz: number, rotEl: number,
  cx: number, cy: number, scale: number,
) {
  const cosAz = Math.cos(rotAz), sinAz = Math.sin(rotAz);
  const cosEl = Math.cos(rotEl), sinEl = Math.sin(rotEl);
  const x1 = x * cosAz + y * sinAz;
  const y1 = -x * sinAz + y * cosAz;
  return {
    sx: cx + x1 * scale,
    sy: cy - (y1 * cosEl + z * sinEl) * scale,
    depth: -y1 * sinEl + z * cosEl,
  };
}

export default function OrientationGizmo({ rotAz, rotEl, onSetViewAngle, onResetView }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const projVerts = useMemo(
    () => SHAPE.verts.map(v => project(v.x, v.y, v.z, rotAz, rotEl, CENTER, CENTER, RADIUS)),
    [rotAz, rotEl],
  );

  const projFaces = useMemo(() => {
    return SHAPE.faces.map((f, idx) => {
      const n = project(f.center.x, f.center.y, f.center.z, rotAz, rotEl, 0, 0, 1);
      const verts = f.vIdx.map(i => projVerts[i]);
      let sumX = 0, sumY = 0, sumD = 0;
      for (const v of verts) { sumX += v.sx; sumY += v.sy; sumD += v.depth; }
      const k = verts.length;
      return {
        ...f,
        key: `${f.kind}-${idx}`,
        verts,
        cx: sumX / k,
        cy: sumY / k,
        cd: sumD / k,
        visible: n.depth > 0.02,
      };
    }).sort((a, b) => a.cd - b.cd);
  }, [projVerts, rotAz, rotEl]);

  // Gnomon at bottom-left of the widget.
  const GNX = 22, GNY = SIZE - 22, GNL = 15;
  const gnomon = useMemo(() => {
    return ([
      ['X', '#ff5566', [1, 0, 0]],
      ['Y', '#66cc66', [0, 1, 0]],
      ['Z', '#6688ff', [0, 0, 1]],
    ] as const).map(([label, color, [vx, vy, vz]]) => ({
      label, color,
      tip: project(vx, vy, vz, rotAz, rotEl, GNX, GNY, GNL),
    }));
  }, [rotAz, rotEl, GNX, GNY]);

  return (
    <div
      className="fixed top-5 right-5 z-10 rounded-2xl select-none"
      style={{
        width: SIZE, height: SIZE,
        background: 'rgba(3,6,22,0.78)',
        border: '1px solid rgba(70,110,220,0.25)',
        boxShadow: '0 4px 24px rgba(0,0,20,0.5)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <svg width={SIZE} height={SIZE} style={{ display: 'block' }}>
        {projFaces.map(f => {
          const isHover = hover === f.key && f.visible;
          const fill = !f.visible
            ? 'rgba(40,60,110,0.12)'
            : isHover
              ? 'rgba(155,195,255,0.9)'
              : f.kind === 'tri'
                ? 'rgba(130,165,235,0.55)'
                : 'rgba(180,210,255,0.55)';
          const stroke = f.visible ? 'rgba(200,220,255,0.85)' : 'rgba(120,150,220,0.28)';
          const points = f.verts.map(v => `${v.sx.toFixed(1)},${v.sy.toFixed(1)}`).join(' ');
          return (
            <g
              key={f.key}
              onClick={() => f.visible && onSetViewAngle(f.target[0], f.target[1])}
              onMouseEnter={() => f.visible && setHover(f.key)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: f.visible ? 'pointer' : 'default' }}
            >
              <polygon
                points={points}
                fill={fill}
                stroke={stroke}
                strokeWidth={1.1}
                strokeLinejoin="round"
                pointerEvents={f.visible ? 'auto' : 'none'}
              />
              {f.visible && f.label && (
                <text
                  x={f.cx} y={f.cy + 3}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#1a2540"
                  fontFamily="monospace"
                  fontWeight="bold"
                  style={{ pointerEvents: 'none' }}
                >
                  {f.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Gnomon hub */}
        <circle cx={GNX} cy={GNY} r={2.5} fill="#aab8d6" />
        {gnomon.map(a => {
          const fade = a.tip.depth < 0 ? 0.45 : 1;
          return (
            <g key={a.label}>
              <line
                x1={GNX} y1={GNY}
                x2={a.tip.sx} y2={a.tip.sy}
                stroke={a.color}
                strokeWidth={1.6}
                strokeLinecap="round"
                opacity={fade}
              />
              <text
                x={a.tip.sx} y={a.tip.sy + 3}
                textAnchor="middle"
                fontSize={8}
                fill={a.color}
                fontFamily="monospace"
                fontWeight="bold"
                opacity={fade}
              >
                {a.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Home button — snaps back to default top-down zoom-1 view */}
      <button
        onClick={onResetView}
        title="Reset view"
        className="absolute rounded"
        style={{
          top: 6, left: 6,
          width: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(80,120,255,0.15)',
          border: '1px solid rgba(80,120,255,0.3)',
          color: '#aabbe0',
          cursor: 'pointer',
          fontSize: 14, lineHeight: 1,
          padding: 0,
        }}
      >
        ⌂
      </button>
    </div>
  );
}
