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
const CUBE_R = 36; // cube half-extent in screen px

// 8 cube vertices at (±1, ±1, ±1).
const VERTS: [number, number, number][] = [
  [-1, -1, -1], [ 1, -1, -1], [ 1,  1, -1], [-1,  1, -1],
  [-1, -1,  1], [ 1, -1,  1], [ 1,  1,  1], [-1,  1,  1],
];

interface FaceDef {
  v: [number, number, number, number]; // vertex indices, CCW from outside
  normal: [number, number, number];
  label: string;
  /** target [rotAz, rotEl] when this face is clicked */
  target: [number, number];
}

// Convention: TOP=+Z, BOTTOM=-Z, RIGHT=+X, LEFT=-X, BACK=+Y, FRONT=-Y
const FACES: FaceDef[] = [
  { v: [4, 5, 6, 7], normal: [0, 0,  1], label: 'TOP',    target: [0,             0] },
  { v: [3, 2, 1, 0], normal: [0, 0, -1], label: 'BOTTOM', target: [0,             Math.PI] },
  { v: [5, 1, 2, 6], normal: [ 1, 0, 0], label: 'RIGHT',  target: [ Math.PI / 2,  Math.PI / 2] },
  { v: [0, 4, 7, 3], normal: [-1, 0, 0], label: 'LEFT',   target: [-Math.PI / 2,  Math.PI / 2] },
  { v: [7, 6, 2, 3], normal: [0,  1, 0], label: 'BACK',   target: [Math.PI,       Math.PI / 2] },
  { v: [4, 0, 1, 5], normal: [0, -1, 0], label: 'FRONT',  target: [0,             Math.PI / 2] },
];

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

  // Project all 8 cube vertices once.
  const projVerts = useMemo(
    () => VERTS.map(([x, y, z]) => project(x, y, z, rotAz, rotEl, CENTER, CENTER, CUBE_R)),
    [rotAz, rotEl],
  );

  // Per-face geometry + visibility from projected normal.
  const projFaces = useMemo(() => {
    return FACES.map(f => {
      const n = project(f.normal[0], f.normal[1], f.normal[2], rotAz, rotEl, 0, 0, 1);
      const verts = f.v.map(i => projVerts[i]);
      const cx = (verts[0].sx + verts[1].sx + verts[2].sx + verts[3].sx) / 4;
      const cy = (verts[0].sy + verts[1].sy + verts[2].sy + verts[3].sy) / 4;
      const cd = (verts[0].depth + verts[1].depth + verts[2].depth + verts[3].depth) / 4;
      return { ...f, verts, cx, cy, cd, visible: n.depth > 0.001 };
    }).sort((a, b) => a.cd - b.cd); // back-to-front
  }, [projVerts, rotAz, rotEl]);

  // Gnomon: tiny X/Y/Z axis indicator in the bottom-left of the widget.
  const GNX = 22, GNY = SIZE - 22, GNL = 16;
  const gnomon = useMemo(() => {
    return ([
      ['X', '#ff5566', [1, 0, 0]],
      ['Y', '#66cc66', [0, 1, 0]],
      ['Z', '#6688ff', [0, 0, 1]],
    ] as const).map(([label, color, [vx, vy, vz]]) => {
      const tip = project(vx, vy, vz, rotAz, rotEl, GNX, GNY, GNL);
      return { label, color, tip };
    });
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
        {/* Cube faces, back-to-front */}
        {projFaces.map(f => {
          const isHover = hover === f.label && f.visible;
          const fill = !f.visible
            ? 'rgba(40,60,110,0.18)'
            : isHover
              ? 'rgba(150,190,255,0.85)'
              : 'rgba(180,210,255,0.55)';
          const stroke = f.visible ? 'rgba(200,220,255,0.85)' : 'rgba(120,150,220,0.35)';
          const points = f.verts.map(v => `${v.sx.toFixed(1)},${v.sy.toFixed(1)}`).join(' ');
          return (
            <g
              key={f.label}
              onClick={() => f.visible && onSetViewAngle(f.target[0], f.target[1])}
              onMouseEnter={() => f.visible && setHover(f.label)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: f.visible ? 'pointer' : 'default' }}
            >
              <polygon
                points={points}
                fill={fill}
                stroke={stroke}
                strokeWidth={1.2}
                strokeLinejoin="round"
                pointerEvents={f.visible ? 'auto' : 'none'}
              />
              {f.visible && (
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
        {gnomon.map(a => (
          <g key={a.label}>
            <line
              x1={GNX} y1={GNY}
              x2={a.tip.sx} y2={a.tip.sy}
              stroke={a.color}
              strokeWidth={1.6}
              strokeLinecap="round"
              opacity={a.tip.depth >= 0 ? 1 : 0.45}
            />
            <text
              x={a.tip.sx} y={a.tip.sy + 3}
              textAnchor="middle"
              fontSize={8}
              fill={a.color}
              fontFamily="monospace"
              fontWeight="bold"
              opacity={a.tip.depth >= 0 ? 1 : 0.55}
            >
              {a.label}
            </text>
          </g>
        ))}
      </svg>

      {/* Home button — snaps back to default top-down view */}
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
