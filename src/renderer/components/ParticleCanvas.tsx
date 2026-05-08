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
  layer: number;
}

interface TrailParticle {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
}

interface ClickRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
}

const COLORS = [
  { color: '#ffffff', weight: 60 },
  { color: '#6ea8fe', weight: 25 },
  { color: '#b4a0ff', weight: 10 },
  { color: '#fca5a5', weight: 5 },
];

const CONNECTION_DISTANCE = 150;
const PARTICLE_DENSITY = 0.00015;
const ATTRACT_RADIUS = 200;
const ATTRACT_STRENGTH = 0.03;
const WIND_RADIUS = 250;
const WIND_STRENGTH = 0.15;
const CLICK_BURST_COUNT = 18;
const CLICK_BURST_SPEED = 3;
const CLICK_REPEL_RADIUS = 180;
const CLICK_REPEL_STRENGTH = 8;
const TRAIL_SPAWN_RATE = 3; // trail particles per frame when moving
const TRAIL_LIFE = 0.8; // seconds

function pickColor(): string {
  const total = COLORS.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of COLORS) {
    r -= c.weight;
    if (r <= 0) return c.color;
  }
  return COLORS[0].color;
}

function createParticle(width: number, height: number, x?: number, y?: number, burstVx?: number, burstVy?: number): Particle {
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
    x: x ?? Math.random() * width,
    y: y ?? Math.random() * height,
    vx: burstVx ?? Math.cos(angle) * speed,
    vy: burstVy ?? Math.sin(angle) * speed,
    baseRadius,
    radius: baseRadius,
    color: pickColor(),
    alpha,
    breathOffset: Math.random() * Math.PI * 2,
    breathSpeed: 0.3 + Math.random() * 0.5,
    layer,
  };
}

function hexAlpha(alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  return Math.round(a * 255).toString(16).padStart(2, '0');
}

export default function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const trailsRef = useRef<TrailParticle[]>([]);
  const ringsRef = useRef<ClickRing[]>([]);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const mouseRef = useRef({ x: -1000, y: -1000, px: -1000, py: -1000, vx: 0, vy: 0, onCanvas: false, speed: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const mouse = mouseRef.current;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.floor(w * h * PARTICLE_DENSITY);
      const current = particlesRef.current.length;
      if (current < count) {
        for (let i = current; i < count; i++) {
          particlesRef.current.push(createParticle(w, h));
        }
      } else if (current > count) {
        particlesRef.current.length = count;
      }
    };

    // Mouse event handlers
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.px = mouse.x;
      mouse.py = mouse.y;
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.onCanvas = true;
    };

    const onMouseEnter = () => { mouse.onCanvas = true; };
    const onMouseLeave = () => {
      mouse.onCanvas = false;
      mouse.vx = 0;
      mouse.vy = 0;
      mouse.speed = 0;
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const parent = canvas.parentElement;
      if (!parent) return;

      // Spawn burst particles
      for (let i = 0; i < CLICK_BURST_COUNT; i++) {
        const angle = (Math.PI * 2 / CLICK_BURST_COUNT) * i + (Math.random() - 0.5) * 0.5;
        const speed = CLICK_BURST_SPEED * (0.5 + Math.random() * 0.8);
        particlesRef.current.push(createParticle(
          parent.clientWidth, parent.clientHeight,
          cx, cy,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
        ));
      }

      // Add expanding ring
      ringsRef.current.push({ x: cx, y: cy, radius: 0, maxRadius: CLICK_REPEL_RADIUS, life: 1 });

      // Repel nearby particles
      for (const p of particlesRef.current) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CLICK_REPEL_RADIUS && dist > 0) {
          const force = (1 - dist / CLICK_REPEL_RADIUS) * CLICK_REPEL_STRENGTH;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseenter', onMouseEnter);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('click', onClick);

    resize();
    window.addEventListener('resize', resize);

    const update = (dt: number) => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const particles = particlesRef.current;
      const t = timeRef.current;

      // Update mouse velocity
      mouse.vx = mouse.x - mouse.px;
      mouse.vy = mouse.y - mouse.py;
      mouse.speed = Math.sqrt(mouse.vx * mouse.vx + mouse.vy * mouse.vy);
      mouse.px = mouse.x;
      mouse.py = mouse.y;

      // Spawn trail particles if mouse is moving on canvas
      if (mouse.onCanvas && mouse.speed > 1.5) {
        const count = Math.min(Math.floor(mouse.speed / 5), TRAIL_SPAWN_RATE);
        for (let i = 0; i < count; i++) {
          trailsRef.current.push({
            x: mouse.x + (Math.random() - 0.5) * 6,
            y: mouse.y + (Math.random() - 0.5) * 6,
            life: TRAIL_LIFE,
            maxLife: TRAIL_LIFE,
            radius: 1 + Math.random() * 2,
            color: pickColor(),
          });
        }
      }

      // Update trail particles
      trailsRef.current = trailsRef.current.filter(tr => {
        tr.life -= dt;
        return tr.life > 0;
      });

      // Update click rings
      ringsRef.current = ringsRef.current.filter(ring => {
        ring.life -= dt * 2;
        ring.radius = ring.maxRadius * (1 - ring.life);
        return ring.life > 0;
      });

      for (const p of particles) {
        const wobbleX = Math.sin(t * p.breathSpeed + p.breathOffset) * 0.02;
        const wobbleY = Math.cos(t * p.breathSpeed * 0.7 + p.breathOffset) * 0.02;

        let fx = 0;
        let fy = 0;

        // Mouse attraction
        if (mouse.onCanvas) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < ATTRACT_RADIUS && dist > 5) {
            const force = ATTRACT_STRENGTH * (1 - dist / ATTRACT_RADIUS);
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          }

          // Wind from mouse movement
          if (mouse.speed > 1) {
            const dx = mouse.x - p.x;
            const dy = mouse.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < WIND_RADIUS && dist > 5) {
              const windForce = WIND_STRENGTH * (1 - dist / WIND_RADIUS) * Math.min(mouse.speed / 20, 1);
              fx += mouse.vx * windForce * 0.05;
              fy += mouse.vy * windForce * 0.05;
            }
          }
        }

        // Apply velocity damping for burst particles to settle back
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 1) {
          const damping = 0.98;
          p.vx *= damping;
          p.vy *= damping;
        }

        p.x += (p.vx + wobbleX + fx) * dt * 60;
        p.y += (p.vy + wobbleY + fy) * dt * 60;

        p.radius = p.baseRadius * (1 + 0.2 * Math.sin(t * p.breathSpeed + p.breathOffset));

        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        else if (p.y > h + 10) p.y = -10;
      }
    };

    const draw = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      const particles = particlesRef.current;

      ctx.fillStyle = '#0a0e27';
      ctx.fillRect(0, 0, w, h);

      // Connection lines (skip background layer)
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        if (particles[i].layer === 0) continue;
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

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
        gradient.addColorStop(0, p.color + hexAlpha(p.alpha * 0.6));
        gradient.addColorStop(0.4, p.color + hexAlpha(p.alpha * 0.2));
        gradient.addColorStop(1, p.color + hexAlpha(0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = p.color + hexAlpha(p.alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw trail particles
      for (const tr of trailsRef.current) {
        const progress = tr.life / tr.maxLife;
        const r = tr.radius * progress;
        if (r < 0.1) continue;

        const gradient = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, r * 4);
        gradient.addColorStop(0, tr.color + hexAlpha(0.8 * progress));
        gradient.addColorStop(0.5, tr.color + hexAlpha(0.3 * progress));
        gradient.addColorStop(1, tr.color + hexAlpha(0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, r * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw click rings
      for (const ring of ringsRef.current) {
        const alpha = ring.life * 0.4;
        ctx.strokeStyle = `rgba(110, 168, 254, ${alpha})`;
        ctx.lineWidth = 1.5 * ring.life;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      timeRef.current += dt;

      update(dt);
      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseenter', onMouseEnter);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      canvas.removeEventListener('click', onClick);
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
