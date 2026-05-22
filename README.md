# Solar System Simulation

Interactive Keplerian solar system simulation built with Next.js 16, React 19, and Tailwind CSS 4. All eight planets are propagated from J2000 orbital elements; the view supports zoom, pan, rotation, time control, and click-to-place black holes.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

This project is a standard Next.js app and deploys to Vercel with zero configuration.

**One-click:**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/solar-system-simulation)

**Manual:**

1. Push this repo to GitHub / GitLab / Bitbucket.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Accept the auto-detected settings — framework: **Next.js**, build: `next build`, output: `.next`. No environment variables are required.
4. Click **Deploy**.

Or, with the [Vercel CLI](https://vercel.com/docs/cli):

```bash
npm i -g vercel
vercel        # preview deploy
vercel --prod # production deploy
```

Node 20+ is required (declared in `package.json` `engines`); Vercel selects a compatible runtime automatically.

## Controls

- **Scroll** — zoom
- **Left-drag** — pan
- **Right-drag** — rotate (azimuth + elevation)
- **Hover** — planet info
- **Place** button — then click to drop a black hole; Esc to cancel
