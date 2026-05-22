'use client';

import {
  Button, ButtonGroup, Divider, Paper,
  Slider, Stack, Typography,
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { SimState } from './SolarSystem';

// ── Dark space theme ──────────────────────────────────────────────────────────
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#5577ff' },
    background: { paper: 'transparent' },
  },
  typography: {
    fontFamily: '"Geist Mono", "Courier New", monospace',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontFamily: '"Geist Mono", "Courier New", monospace',
          fontSize: 13,
          letterSpacing: '0.03em',
          borderRadius: 10,
          padding: '9px 18px',
          minWidth: 0,
          lineHeight: 1.4,
          transition: 'all 0.15s ease',
        },
      },
    },
    MuiButtonGroup: {
      styleOverrides: {
        root: { borderRadius: 10 },
        grouped: {
          '&:not(:last-of-type)': { borderColor: 'rgba(80,120,255,0.2)' },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: '#5577ff', height: 4, padding: '12px 0' },
        thumb: {
          width: 16, height: 16,
          boxShadow: '0 0 10px rgba(85,119,255,0.6)',
          '&:hover, &.Mui-focusVisible': { boxShadow: '0 0 0 8px rgba(85,119,255,0.15)' },
        },
        track: { border: 'none', borderRadius: 2 },
        rail: { opacity: 0.25, borderRadius: 2 },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: 'rgba(80,120,255,0.15)', marginBlock: 18 },
      },
    },
  },
});

// ── Speed formatting ──────────────────────────────────────────────────────────
function fmtSpeed(exp: number): string {
  const dps = Math.pow(10, exp);
  if (dps < 0.042) return `${(dps * 24).toFixed(1)} h/s`;
  if (dps < 1)     return `${(dps * 24).toFixed(0)} h/s`;
  if (dps < 500)   return `${dps.toFixed(dps < 10 ? 1 : 0)} d/s`;
  return `${(dps / 365.25).toFixed(1)} y/s`;
}

// ── Shared button styles ──────────────────────────────────────────────────────
function activeStyle(on: boolean) {
  return on
    ? {
        background: 'linear-gradient(135deg, rgba(85,119,255,0.65), rgba(55,90,220,0.55))',
        borderColor: 'rgba(120,160,255,0.65)',
        color: '#dde8ff',
        boxShadow: '0 0 14px rgba(85,119,255,0.3)',
        '&:hover': {
          background: 'linear-gradient(135deg, rgba(95,130,255,0.75), rgba(65,100,230,0.65))',
        },
      }
    : {
        background: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.1)',
        color: '#6677aa',
        '&:hover': { background: 'rgba(255,255,255,0.09)', borderColor: 'rgba(255,255,255,0.2)' },
      };
}

interface Props {
  state: SimState;
  dateStr: string;
  onUpdate: (patch: Partial<SimState>) => void;
  onResetView: () => void;
  onJumpToNow: () => void;
  onSetViewAngle: (az: number, el: number) => void;
}

export default function ControlPanel({
  state, dateStr, onUpdate, onResetView, onJumpToNow, onSetViewAngle,
}: Props) {
  return (
    <ThemeProvider theme={theme}>
      <Paper
        elevation={0}
        sx={{
          position: 'fixed', top: 16, left: 16, zIndex: 10,
          width: 300,
          background: 'rgba(3,6,22,0.93)',
          border: '1px solid rgba(70,110,220,0.25)',
          borderRadius: 4,
          boxShadow: '0 8px 48px rgba(0,0,20,0.8), inset 0 1px 0 rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px)',
          p: 3,
        }}
      >
        {/* Title */}
        <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
          <Typography sx={{ fontSize: 17, lineHeight: 1 }}>☀</Typography>
          <Typography
            sx={{
              fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
              color: 'rgba(120,160,255,0.65)', fontWeight: 600,
            }}
          >
            Solar System
          </Typography>
        </Stack>

        {/* Date */}
        <Typography
          sx={{
            fontSize: 16, color: '#ffd966', letterSpacing: '0.04em',
            mt: 1.5, mb: 3, fontVariantNumeric: 'tabular-nums',
          }}
        >
          {dateStr}
        </Typography>

        {/* Playback buttons */}
        <Stack direction="row" spacing={1.5} mb={3}>
          <Button
            fullWidth variant="outlined"
            onClick={() => onUpdate({ paused: !state.paused })}
            sx={activeStyle(!state.paused)}
          >
            {state.paused ? '▶  Play' : '⏸  Pause'}
          </Button>
          <Button
            fullWidth variant="outlined"
            onClick={onJumpToNow}
            sx={activeStyle(false)}
          >
            ⊙  Today
          </Button>
        </Stack>

        {/* Speed slider */}
        <Stack direction="row" alignItems="center" spacing={2} mb={0.5}>
          <Typography sx={{ fontSize: 11, color: '#445566', width: 44, flexShrink: 0, letterSpacing: '0.06em' }}>
            Speed
          </Typography>
          <Slider
            min={-1} max={5.5} step={0.05}
            value={state.speedExp}
            onChange={(_, v) => onUpdate({ speedExp: v as number })}
            sx={{ flex: 1 }}
          />
          <Typography
            sx={{
              fontSize: 12, color: '#ffd966', textAlign: 'right',
              width: 58, flexShrink: 0, fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmtSpeed(state.speedExp)}
          </Typography>
        </Stack>

        <Divider />

        {/* View presets */}
        <Stack direction="row" alignItems="center" spacing={2} mb={2.5}>
          <Typography sx={{ fontSize: 11, color: '#445566', width: 44, flexShrink: 0, letterSpacing: '0.06em' }}>
            View
          </Typography>
          <ButtonGroup fullWidth variant="outlined" size="small">
            {([
              ['Top',  () => onSetViewAngle(0, 0)],
              ['Edge', () => onSetViewAngle(0, Math.PI / 2)],
              ['3D',   () => onSetViewAngle(Math.PI / 5, Math.PI / 4)],
            ] as [string, () => void][]).map(([label, handler]) => (
              <Button
                key={label}
                onClick={handler}
                sx={{
                  ...activeStyle(false),
                  borderRadius: '10px !important',
                  fontSize: 12, py: 1.2,
                }}
              >
                {label}
              </Button>
            ))}
          </ButtonGroup>
        </Stack>

        {/* Scale toggle */}
        <Stack direction="row" alignItems="center" spacing={2} mb={2.5}>
          <Typography sx={{ fontSize: 11, color: '#445566', width: 44, flexShrink: 0, letterSpacing: '0.06em' }}>
            Scale
          </Typography>
          <Stack direction="row" spacing={1.5} flex={1}>
            <Button
              fullWidth variant="outlined" size="small"
              onClick={() => onUpdate({ logScale: false })}
              sx={{ ...activeStyle(!state.logScale), fontSize: 12, py: 1.2, borderRadius: '10px' }}
            >
              Linear
            </Button>
            <Button
              fullWidth variant="outlined" size="small"
              onClick={() => onUpdate({ logScale: true })}
              sx={{ ...activeStyle(state.logScale), fontSize: 12, py: 1.2, borderRadius: '10px' }}
            >
              Log
            </Button>
          </Stack>
        </Stack>

        {/* Show toggles */}
        <Stack direction="row" alignItems="center" spacing={2} mb={0.5}>
          <Typography sx={{ fontSize: 11, color: '#445566', width: 44, flexShrink: 0, letterSpacing: '0.06em' }}>
            Show
          </Typography>
          <Stack direction="row" spacing={1.5} flex={1}>
            <Button
              fullWidth variant="outlined" size="small"
              onClick={() => onUpdate({ showOrbits: !state.showOrbits })}
              sx={{ ...activeStyle(state.showOrbits), fontSize: 12, py: 1.2, borderRadius: '10px' }}
            >
              Orbits
            </Button>
            <Button
              fullWidth variant="outlined" size="small"
              onClick={() => onUpdate({ showLabels: !state.showLabels })}
              sx={{ ...activeStyle(state.showLabels), fontSize: 12, py: 1.2, borderRadius: '10px' }}
            >
              Labels
            </Button>
          </Stack>
        </Stack>

        <Divider />

        {/* Reset */}
        <Button
          fullWidth variant="outlined"
          onClick={onResetView}
          sx={{
            ...activeStyle(false),
            fontSize: 12, py: 1.4, borderRadius: '10px',
            color: '#445566',
            '&:hover': { color: '#8899bb', background: 'rgba(255,255,255,0.07)' },
          }}
        >
          ↺  Reset View
        </Button>
      </Paper>
    </ThemeProvider>
  );
}
