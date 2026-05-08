# Welcome Page Particle Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a mesmerizing starfield particle animation on the welcome page using Canvas API — particles drift, breathe, and connect with lines when nearby.

**Architecture:** A new `ParticleCanvas` component renders a full-screen `<canvas>` behind the existing welcome content. Pure Canvas API with requestAnimationFrame loop. No new dependencies.

**Tech Stack:** React hooks, HTML5 Canvas API, Tailwind CSS (for content overlay styling)

---

### Task 1: Create the ParticleCanvas component

**Files:**
- Create: `src/renderer/components/ParticleCanvas.tsx`

**Step 1: Create the ParticleCanvas component with full animation logic**

```tsx
import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  radius: number;
  color: string;
  alpha: number;
  breathOffset: number;
  breathSpeed: number;
  layer: number; // 0=background, 1=mid, 2=foreground
}

const COLORS = [
  { color: '#ffffff', weight: 60 },
  { color: '#6ea8fe', weight: 25 },
  { color: '#b4a0ff', weight: 10 },
  { color: '#fca5a5', weight: 5 },
];

const CONNECTION_DISTANCE = 150;
const PARTICLE_DENSITY = 0.00015; // particles per px²

function pickColor(): string {
  const total = COLORS.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of COLORS) {
    r -= c.weight;
    if (r <= 0) return c.color;
  }
  return COLORS[0].color;
}

function createParticle(width: number, height: number): Particle {
  const layerRoll = Math.random();
  const layer = layerRoll < 0.2 ? 0 : layerRoll < 0.7 ? 1 : 2;

  const layerConfig = [
    { radiusRange: [2.5, 4], speedRange: [0.08, 0.2], alphaRange: [0.15, 0.35] },
    { radiusRange: [1.5, 2.5], speedRange: [0.15, 0.4], alphaRange: [0.3, 0.7] },
    { radiusRange: [0.8, 1.5], speedRange: [0.25, 0.6], alphaRange: [0.5, 1.0] },
  ][layer];

  const baseRadius = layerConfig.radiusRange[0] + Math.random() * (layerConfig.radiusRange[1] - layerConfig.radiusRange[0]);
  const speed = layerConfig.speedRange[0] + Math.random() * (layerConfig.speedRange[1] - layerConfig.speedRange[0]);
  const alpha = layerConfig.alphaRange[0] + Math.random() * (layerConfig.alphaRange[1] - layerConfig.alphaRange[0]);
  const angle = Math.random() * Math.PI * 2;

  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    baseRadius,
    radius: baseRadius,
    color: pickColor(),
    alpha,
    breathOffset: Math.random() * Math.PI * 2,
    breathSpeed: 0.3 + Math.random() * 0.5,
    layer,
  };
}

export default function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;

      const count = Math.floor(canvas.width * canvas.height * PARTICLE_DENSITY);
      const current = particlesRef.current.length;
      if (current < count) {
        for (let i = current; i < count; i++) {
          particlesRef.current.push(createParticle(canvas.width, canvas.height));
        }
      } else if (current > count) {
        particlesRef.current.length = count;
      }
    };

    resize();
    window.addEventListener('resize', resize);

    const update = (dt: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const particles = particlesRef.current;
      const t = timeRef.current;

      for (const p of particles) {
        // Gentle wobble
        const wobbleX = Math.sin(t * p.breathSpeed + p.breathOffset) * 0.02;
        const wobbleY = Math.cos(t * p.breathSpeed * 0.7 + p.breathOffset) * 0.02;

        p.x += (p.vx + wobbleX) * dt * 60;
        p.y += (p.vy + wobbleY) * dt * 60;

        // Breathing
        p.radius = p.baseRadius * (1 + 0.2 * Math.sin(t * p.breathSpeed + p.breathOffset));

        // Edge wrapping
        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        else if (p.y > h + 10) p.y = -10;
      }
    };

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const particles = particlesRef.current;

      // Clear with background
      ctx.fillStyle = '#0a0e27';
      ctx.fillRect(0, 0, w, h);

      // Draw connection lines (only mid + foreground layers)
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        if (particles[i].layer === 0) continue; // skip background layer for connections
        for (let j = i + 1; j < particles.length; j++) {
          if (particles[j].layer === 0) continue;
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DISTANCE) {
            const alpha = (1 - dist / CONNECTION_DISTANCE) * 0.15;
            ctx.strokeStyle = `rgba(110, 168, 254, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        const r = Math.max(0.5, p.radius);

        // Glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
        gradient.addColorStop(0, p.color + hexAlpha(p.alpha * 0.6));
        gradient.addColorStop(0.4, p.color + hexAlpha(p.alpha * 0.2));
        gradient.addColorStop(1, p.color + hexAlpha(0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.fillStyle = p.color + hexAlpha(p.alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1); // cap dt to avoid jumps
      lastTime = now;
      timeRef.current += dt;

      update(dt);
      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ background: '#0a0e27' }}
    />
  );
}

function hexAlpha(alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = Math.round(a * 255).toString(16).padStart(2, '0');
  return hex;
}
```

**Step 2: Verify the file was created correctly**

Read the file back and check for syntax errors visually.

**Step 3: Commit**

```bash
git add src/renderer/components/ParticleCanvas.tsx
git commit -m "feat: add ParticleCanvas component with starfield animation"
```

---

### Task 2: Update Welcome.tsx to integrate ParticleCanvas

**Files:**
- Modify: `src/renderer/components/Welcome.tsx`

**Step 1: Wrap Welcome content with particle canvas**

Replace the entire content of `Welcome.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { User, Mail, Folder, Calendar } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { format } from 'date-fns';
import ParticleCanvas from './ParticleCanvas';

export default function Welcome() {
  const [gitUser, setGitUser] = useState({ name: '', email: '' });
  const [repoCount, setRepoCount] = useState(0);

  useEffect(() => {
    window.electronAPI.git.getUser().then(setGitUser).catch(() => {});
    window.electronAPI.git.scanRepos().then(repos => setRepoCount(repos?.length || 0)).catch(() => {});
  }, []);

  return (
    <div className="relative h-full overflow-hidden">
      <ParticleCanvas />

      {/* Content overlay */}
      <div className="relative z-10 h-full overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto">
          {/* Greeting */}
          <div className="mb-10">
            <h1 className="text-4xl font-bold mb-2 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
              Welcome to 銘
            </h1>
            <p className="text-blue-200/70 text-lg drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
              {format(new Date(), 'yyyy年MM月dd日 EEEE')}
            </p>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Git User */}
            {gitUser.name && (
              <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardContent className="pt-6">
                  <div className="p-3 rounded-lg bg-violet-500/20 w-fit mb-4">
                    <User size={24} className="text-violet-400" />
                  </div>
                  <div className="text-lg font-semibold text-white">{gitUser.name}</div>
                  {gitUser.email && (
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-blue-200/60">
                      <Mail size={12} />
                      {gitUser.email}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Repos */}
            <Card className="bg-white/5 border-white/10 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="p-3 rounded-lg bg-emerald-500/20 w-fit mb-4">
                  <Folder size={24} className="text-emerald-400" />
                </div>
                <div className="text-lg font-semibold text-white">{repoCount}</div>
                <div className="text-sm text-blue-200/60">Git Repositories</div>
              </CardContent>
            </Card>

            {/* Date */}
            <Card className="bg-white/5 border-white/10 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="p-3 rounded-lg bg-blue-500/20 w-fit mb-4">
                  <Calendar size={24} className="text-blue-400" />
                </div>
                <div className="text-lg font-semibold text-white">
                  {format(new Date(), 'HH:mm')}
                </div>
                <div className="text-sm text-blue-200/60">
                  {format(new Date(), 'yyyy/MM/dd')}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Key changes:
- Outer div is now `relative h-full overflow-hidden` (was `h-full overflow-y-auto p-8`)
- `<ParticleCanvas />` added as first child
- Content wrapped in `relative z-10` to sit above canvas
- Card styling changed to glass-morphism: `bg-white/5 border-white/10 backdrop-blur-md`
- Text colors adjusted for dark navy background: white text, `blue-200/70` for muted
- Added `drop-shadow` to heading text for readability over particles

**Step 2: Verify the app runs**

Run: `npm run dev` or the project's dev command and check the welcome page shows particles behind the cards.

**Step 3: Commit**

```bash
git add src/renderer/components/Welcome.tsx
git commit -m "feat: integrate ParticleCanvas into Welcome page with glass-morphism overlay"
```

---

### Task 3: Polish and verify

**Files:**
- Possibly modify: `src/renderer/components/ParticleCanvas.tsx` if tuning needed

**Step 1: Visual verification checklist**

Check these aspects in the running app:
1. Particles drift smoothly at ~60fps
2. Connection lines appear between nearby particles and fade with distance
3. Particles wrap around edges seamlessly
4. Particle glow looks soft (not hard-edged)
5. Cards have readable text over the particle background
6. Dark navy background fills the entire welcome area (no gaps)
7. Scrolling content still works (if page is scrollable)

**Step 2: Adjust parameters if needed**

Common tweaks in `ParticleCanvas.tsx`:
- `PARTICLE_DENSITY`: increase for more particles, decrease for fewer
- `CONNECTION_DISTANCE`: increase for more lines, decrease for fewer
- Color weights in `COLORS` array
- Layer radius/speed/alpha ranges in `createParticle`

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: polish particle animation parameters"
```
