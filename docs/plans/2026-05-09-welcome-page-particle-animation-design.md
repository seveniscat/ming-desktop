# Welcome Page Particle Animation Design

## Overview

Replace the static welcome page with an ambient starfield particle animation — a full-screen canvas of drifting particles that connect when nearby, creating a living constellation effect. Hypnotic enough to watch all day.

## Visual Design

### Background
- Dark navy `#0a0e27` fills the entire welcome area
- Three depth layers of particles for parallax:
  - Background: large, slow, low opacity (depth illusion)
  - Mid: medium, normal speed, main visual density
  - Foreground: small, bright, slightly faster (front depth)

### Particles
- Drawn as soft radial-gradient circles (not hard dots) for glow effect
- Color distribution:
  - 60% soft white `#ffffff`
  - 25% pale blue `#6ea8fe`
  - 10% lavender `#b4a0ff`
  - 5% rose gold `#fca5a5`
- Size gently pulses (±20%) on individual sine cycles ("breathing")

### Connection Lines
- Appear when two particles are < 150px apart
- Opacity inversely proportional to distance
- Colored to match the connected particles

### Content Overlay
- Existing welcome content sits on top with `backdrop-blur-sm` + semi-transparent dark background
- Subtle text shadow for readability
- Particles visible around and behind content

## Animation Behavior

- **Movement**: Slow random velocity vectors with gentle direction wobble via sine functions
- **Breathing**: Particle sizes pulse individually on sine cycles
- **Edge wrapping**: Particles exit one side and reappear on the opposite side
- **Performance target**: ~200 particles at 60fps
- **Purely ambient**: No mouse/interaction, just mesmerizing drift

## Component Architecture

```
Welcome.tsx
├── <ParticleCanvas />     — full-screen canvas, absolute positioned
└── <WelcomeContent />     — existing content with backdrop blur
```

### ParticleCanvas
- `<canvas>` filling the viewport, `position: absolute`
- `useEffect` + `useRef` for animation loop
- Particle state as plain JS array (no React re-renders per frame)
- Auto-resizes on window changes
- Cleans up animation frame on unmount

### WelcomeContent
- Existing welcome content (greeting, date, info cards)
- Added `backdrop-blur-sm` and semi-transparent dark background
- Centered layout preserved

## Technical Details

- **No new dependencies** — pure Canvas API + React hooks
- **Frame-rate independent**: Delta-time based movement
- **Connection optimization**: Spatial grid partitioning to avoid O(n²) checks
- **Responsive**: Canvas resizes with window, particle count scales with viewport area

## Approach

Canvas API (no extra libraries) — the standard tool for particle systems. Zero dependencies, GPU-accelerated, full rendering control.
