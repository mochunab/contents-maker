import { AbsoluteFill, interpolate, useCurrentFrame, spring, useVideoConfig, Img, Video } from 'remotion';
import type { Scene, MotionTheme } from '../types';
import { THEME_CONFIGS } from '../types';
import { MOTION_REGISTRY } from './motions';
import LottieOverlay from './LottieOverlay';
import { resolveLottieType } from '../lottie';

// ── Enhanced Color Schemes (3-stop gradient + glow) ──

const SCENE_THEMES: Record<string, { bg: [string, string, string]; accent: string; glow: string; icon: string }> = {
  hook:          { bg: ['#1a0a2e', '#2d1b69', '#16213e'], accent: '#FF6B6B', glow: '#ff6b6b', icon: '🔥' },
  problem_intro: { bg: ['#1a0a1e', '#2d0a3e', '#0f1a40'], accent: '#e74c3c', glow: '#ff4757', icon: '⚠️' },
  problem:       { bg: ['#1a0a1e', '#2d0a3e', '#0f1a40'], accent: '#e74c3c', glow: '#ff4757', icon: '❌' },
  reason_1:      { bg: ['#0d0a17', '#1a1125', '#0d1a2d'], accent: '#FF6B6B', glow: '#ff6b6b', icon: '1️⃣' },
  reason_2:      { bg: ['#0d0a17', '#1a1525', '#1a1020'], accent: '#f39c12', glow: '#feca57', icon: '2️⃣' },
  reason_3:      { bg: ['#0d0a17', '#1a1030', '#1a0d2d'], accent: '#e056fd', glow: '#e056fd', icon: '3️⃣' },
  reason:        { bg: ['#0d0a17', '#1a1125', '#0d1a2d'], accent: '#FF6B6B', glow: '#ff6b6b', icon: '💡' },
  solution:      { bg: ['#0a1a15', '#0d2820', '#0a2030'], accent: '#2ecc71', glow: '#00d2d3', icon: '✅' },
  tip:           { bg: ['#0a1a15', '#0d2820', '#0a2030'], accent: '#2ecc71', glow: '#00d2d3', icon: '💡' },
  cta:           { bg: ['#1a0a30', '#2d1b69', '#4a1a6a'], accent: '#e056fd', glow: '#ff6b9d', icon: '👉' },
  intro:         { bg: ['#0a1a2e', '#162a4e', '#0d2040'], accent: '#4ecdc4', glow: '#4ecdc4', icon: '✨' },
  content:       { bg: ['#0d0d17', '#151525', '#0d1a2d'], accent: '#58a6ff', glow: '#58a6ff', icon: '📌' },
  outro:         { bg: ['#1a0a30', '#2d1b69', '#4a1a6a'], accent: '#e056fd', glow: '#ff6b9d', icon: '🎯' },
};

function getBaseTheme(type: string) {
  const key = type.toLowerCase().replace(/\s+/g, '_');
  return SCENE_THEMES[key] || SCENE_THEMES.content;
}

// Derive background colors from accent color with brightness control
function deriveBackground(accent: string, brightness = 0.08): [string, string, string] {
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  if (brightness > 0.5) {
    // Light mode: blend accent into white
    const light = (rr: number, gg: number, bb: number, f: number) => {
      const lr = Math.round(255 - (255 - rr) * (1 - f));
      const lg = Math.round(255 - (255 - gg) * (1 - f));
      const lb = Math.round(255 - (255 - bb) * (1 - f));
      return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
    };
    return [light(r, g, b, brightness), light(r, g, b, brightness * 0.97), light(r, g, b, brightness * 1.02)];
  }
  const dark = (rr: number, gg: number, bb: number, f: number) =>
    `#${Math.floor(rr * f).toString(16).padStart(2, '0')}${Math.floor(gg * f).toString(16).padStart(2, '0')}${Math.floor(bb * f).toString(16).padStart(2, '0')}`;
  return [dark(r, g, b, brightness * 0.75), dark(r, g, b, brightness * 1.5), dark(r, g, b, brightness)];
}

// Get theme with dynamic scene colors
function getTheme(type: string, scene?: Scene, brightness = 0.08) {
  const base = getBaseTheme(type);
  if (scene?.accent_color && scene?.glow_color) {
    return {
      ...base,
      accent: scene.accent_color,
      glow: scene.glow_color,
      bg: deriveBackground(scene.accent_color, brightness),
    };
  }
  return base;
}

// Interpolate hex colors
function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

// ── Extract keywords ──

function extractKeywords(subtitle: string): string[] {
  const boldRegex = /\*\*(.+?)\*\*/g;
  const bolds: string[] = [];
  let m;
  while ((m = boldRegex.exec(subtitle)) !== null) bolds.push(m[1]);
  if (bolds.length > 0) return bolds.slice(0, 3);
  const cleaned = subtitle.replace(/\*\*/g, '');
  const stop = ['은','는','이','가','을','를','의','에','에서','도','만','와','과','로','으로','하고','라고','때문에'];
  return cleaned.split(/\s+/).filter(w => w.length >= 2 && !stop.includes(w)).slice(0, 3);
}

// ── Deterministic pseudo-random ──

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// ── Bokeh Orb (soft glowing circle) ──

function BokehOrb({ x, y, size, color, delay, speed }: {
  x: number; y: number; size: number; color: string; delay: number; speed: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entry = spring({ frame: Math.max(0, frame - delay * fps), fps, config: { damping: 30, mass: 2 } });
  const floatY = Math.sin((frame + delay * 50) * speed * 0.02) * 25;
  const floatX = Math.cos((frame + delay * 30) * speed * 0.015) * 15;
  const pulse = 1 + Math.sin((frame + delay * 20) * 0.04) * 0.2;

  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle, ${color}30 0%, ${color}10 50%, transparent 70%)`,
      transform: `translate(${floatX}px, ${floatY}px) scale(${entry * pulse})`,
      filter: `blur(${Math.max(size * 0.1, 6)}px)`,
      opacity: entry * 0.6, pointerEvents: 'none',
    }} />
  );
}

// ── Sparkle (twinkling point with glow) ──

function Sparkle({ x, y, color, delay, size }: {
  x: number; y: number; color: string; delay: number; size: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entry = spring({ frame: Math.max(0, frame - delay * fps), fps, config: { damping: 12, mass: 0.3 } });
  const twinkle = 0.2 + Math.abs(Math.sin((frame + delay * 40) * 0.15)) * 0.8;

  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      width: size, height: size, borderRadius: '50%',
      backgroundColor: color,
      transform: `scale(${entry * twinkle})`,
      boxShadow: `0 0 ${size * 3}px ${size}px ${color}40, 0 0 ${size * 6}px ${size * 2}px ${color}15`,
      pointerEvents: 'none',
    }} />
  );
}

// ── Enhanced Floating Shape ──

function FloatingShape({ x, y, size, color, delay, shape }: {
  x: number; y: number; size: number; color: string; delay: number;
  shape: 'circle' | 'diamond' | 'ring' | 'dot' | 'line';
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entry = spring({ frame: Math.max(0, frame - delay * fps), fps, config: { damping: 12, mass: 0.6 } });
  const float = Math.sin((frame + delay * 30) * 0.03) * 15;
  const rot = interpolate(frame, [0, 300], [0, 360]);
  const opacity = interpolate(entry, [0, 1], [0, 0.3]);

  const base: React.CSSProperties = {
    position: 'absolute', left: `${x}%`, top: `${y}%`, opacity, pointerEvents: 'none',
    transform: `translateY(${float}px) scale(${entry})`,
  };

  if (shape === 'circle') return <div style={{ ...base, width: size, height: size, borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 ${size}px ${color}15` }} />;
  if (shape === 'ring') return <div style={{ ...base, width: size * 1.3, height: size * 1.3, borderRadius: '50%', border: `3px solid ${color}40`, boxShadow: `inset 0 0 ${size * 0.5}px ${color}10, 0 0 ${size}px ${color}10` }} />;
  if (shape === 'diamond') return <div style={{ ...base, width: size, height: size, border: `2px solid ${color}`, transform: `translateY(${float}px) scale(${entry}) rotate(${rot}deg)`, borderRadius: 4, boxShadow: `0 0 ${size * 0.5}px ${color}15` }} />;
  if (shape === 'dot') return <div style={{ ...base, width: size * 0.3, height: size * 0.3, borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 ${size * 0.5}px ${color}30` }} />;
  // line
  return <div style={{ ...base, width: size * 1.5, height: 2, backgroundColor: `${color}50`, borderRadius: 1, transform: `translateY(${float}px) scale(${entry}) rotate(${15 + delay * 20}deg)`, boxShadow: `0 0 ${size * 0.3}px ${color}20` }} />;
}

// ── Type icon badge ──

function TypeIcon({ icon, accent }: { icon: string; accent: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entry = spring({ frame, fps, config: { damping: 10, mass: 1.2 } });
  const bounce = frame > 15 ? 1 + Math.sin(frame * 0.1) * 0.05 : 1;

  return (
    <div style={{
      position: 'absolute', top: 80, right: 80,
      width: 100, height: 100, borderRadius: 28,
      backgroundColor: `${accent}25`,
      border: `2px solid ${accent}40`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 52,
      transform: `scale(${interpolate(entry, [0, 1], [0, 1]) * bounce})`,
      boxShadow: `0 0 30px ${accent}20`,
    }}>
      {icon}
    </div>
  );
}

// ── X-Mark overlay ──

function XMarkOverlay({ accent }: { accent: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const l1 = spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 10, mass: 0.5 } });
  const l2 = spring({ frame: Math.max(0, frame - 14), fps, config: { damping: 10, mass: 0.5 } });

  return (
    <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 300, height: 300, opacity: 0.12 }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: `${l1 * 100}%`, height: 8, backgroundColor: accent, transform: 'translate(-50%, -50%) rotate(45deg)', borderRadius: 4, boxShadow: `0 0 20px ${accent}40` }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: `${l2 * 100}%`, height: 8, backgroundColor: accent, transform: 'translate(-50%, -50%) rotate(-45deg)', borderRadius: 4, boxShadow: `0 0 20px ${accent}40` }} />
    </div>
  );
}

// ── Check overlay ──

function CheckOverlay({ accent }: { accent: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 12, mass: 0.6 } });

  return (
    <div style={{
      position: 'absolute', left: '50%', top: '50%',
      transform: `translate(-50%, -50%) scale(${interpolate(p, [0, 1], [0, 1])})`,
      width: 250, height: 250, borderRadius: '50%',
      border: `6px solid ${accent}20`, opacity: 0.18,
      boxShadow: `inset 0 0 40px ${accent}10, 0 0 40px ${accent}10`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}

// ── Accent line (gradient) ──

function AccentLine({ accent }: { accent: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const w = spring({ frame: Math.max(0, frame - 5), fps, config: { damping: 14 } });

  return (
    <div style={{
      position: 'absolute', left: '50%', top: '75%', transform: 'translateX(-50%)',
      width: `${w * 40}%`, height: 3, borderRadius: 2,
      background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
      opacity: 0.5,
    }} />
  );
}

// ── Enhanced Particle Burst ──

function ParticleBurst({ accent, glow }: { accent: string; glow: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return <>
    {Array.from({ length: 14 }, (_, i) => {
      const angle = (i / 14) * Math.PI * 2;
      const delay = i * 1.5;
      const p = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 20, mass: 0.3 } });
      const dist = interpolate(p, [0, 1], [0, 130 + (i % 4) * 35]);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      const size = 4 + (i % 3) * 3;
      const op = interpolate(p, [0, 0.3, 1], [0, 0.7, 0.1]);
      const color = i % 3 === 0 ? glow : accent;

      return (
        <div key={i} style={{
          position: 'absolute', left: '50%', top: '45%',
          width: size, height: size,
          borderRadius: i % 2 === 0 ? '50%' : 2,
          backgroundColor: color,
          transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${i * 26}deg)`,
          opacity: op, boxShadow: `0 0 ${size * 2}px ${color}50`,
        }} />
      );
    })}
  </>;
}

// ── Seeded element generators ──

function getBokehOrbs(sceneNumber: number, glow: string) {
  return Array.from({ length: 8 }, (_, i) => ({
    x: 5 + seededRandom(sceneNumber * 100 + i * 17) * 90,
    y: 5 + seededRandom(sceneNumber * 100 + i * 31) * 90,
    size: 60 + seededRandom(sceneNumber * 100 + i * 47) * 100,
    color: glow,
    delay: 0.1 + i * 0.12,
    speed: 0.6 + seededRandom(sceneNumber * 100 + i * 61) * 0.8,
  }));
}

function getSparkles(sceneNumber: number, accent: string) {
  return Array.from({ length: 7 }, (_, i) => ({
    x: 8 + seededRandom(sceneNumber * 200 + i * 23) * 84,
    y: 8 + seededRandom(sceneNumber * 200 + i * 37) * 84,
    color: accent,
    delay: 0.3 + i * 0.18,
    size: 3 + seededRandom(sceneNumber * 200 + i * 43) * 5,
  }));
}

function getShapes(sceneNumber: number, accent: string) {
  const types: Array<'circle' | 'diamond' | 'ring' | 'dot' | 'line'> = ['circle', 'diamond', 'ring', 'dot', 'line'];
  return Array.from({ length: 10 }, (_, i) => ({
    x: 3 + seededRandom(sceneNumber * 300 + i * 19) * 94,
    y: 8 + seededRandom(sceneNumber * 300 + i * 29) * 84,
    size: 16 + seededRandom(sceneNumber * 300 + i * 41) * 28,
    color: accent,
    delay: 0.15 + i * 0.1,
    shape: types[Math.floor(seededRandom(sceneNumber * 300 + i * 53) * types.length)],
  }));
}

// ── Main SceneRenderer ──

export default function SceneRenderer({ scene, prevScene, motionTheme }: { scene: Scene; prevScene?: Scene; motionTheme?: MotionTheme }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const tc = THEME_CONFIGS[motionTheme || 'black_neon'] || THEME_CONFIGS['black_neon'];
  const theme = getTheme(scene.type, scene, tc.bgBrightness);
  const prevTheme = prevScene ? getTheme(prevScene.type, prevScene, tc.bgBrightness) : null;

  // Blend colors from previous scene during first 15 frames
  const BLEND_FRAMES = 15;
  const blendT = prevTheme ? Math.min(frame / BLEND_FRAMES, 1) : 1;
  const blendedAccent = prevTheme ? lerpColor(prevTheme.accent, theme.accent, blendT) : theme.accent;
  const blendedGlow = prevTheme ? lerpColor(prevTheme.glow, theme.glow, blendT) : theme.glow;
  const [c1, c2, c3] = prevTheme
    ? [lerpColor(prevTheme.bg[0], theme.bg[0], blendT), lerpColor(prevTheme.bg[1], theme.bg[1], blendT), lerpColor(prevTheme.bg[2], theme.bg[2], blendT)]
    : theme.bg;

  const entryProgress = spring({ frame, fps, config: { damping: 20 } });

  // ── Transitions (6 types) ──
  const transition = scene.transition?.toLowerCase() || 'cut';
  let transform = '';
  let opacity = 1;
  let filter: string | undefined;
  let clipPath: string | undefined;

  if (transition === 'fade') {
    opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  } else if (transition === 'zoom') {
    transform = `scale(${interpolate(entryProgress, [0, 1], [1.2, 1])})`;
  } else if (transition === 'slide') {
    const tx = interpolate(entryProgress, [0, 1], [100, 0]);
    transform = `translateX(${tx}%)`;
  } else if (transition === 'blur_in') {
    filter = `blur(${interpolate(frame, [0, 12], [15, 0], { extrapolateRight: 'clamp' })}px)`;
    transform = `scale(${interpolate(frame, [0, 12], [1.05, 1], { extrapolateRight: 'clamp' })})`;
    opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  } else if (transition === 'wipe_left') {
    const p = interpolate(frame, [0, 12], [0, 100], { extrapolateRight: 'clamp' });
    clipPath = `inset(0 ${100 - p}% 0 0)`;
  } else if (transition === 'scale_rotate') {
    transform = `scale(${interpolate(entryProgress, [0, 1], [0.5, 1])}) rotate(${interpolate(entryProgress, [0, 1], [-15, 0])}deg)`;
    opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  }

  const keywords = extractKeywords(scene.subtitle);
  const sceneType = scene.type.toLowerCase().replace(/\s+/g, '_');
  const isProblem = ['problem', 'problem_intro', 'reason_1', 'reason_2', 'reason_3', 'reason'].includes(sceneType);
  const isSolution = ['solution', 'tip'].includes(sceneType);
  const isHookOrCta = ['hook', 'cta', 'outro'].includes(sceneType);
  const hasVideo = !!scene.backgroundVideoUrl;
  const hasImage = !hasVideo && !!scene.backgroundImageUrl;

  // Ken Burns for image backgrounds (skip for video — video already has motion)
  const kbScale = hasImage ? interpolate(frame, [0, durationInFrames], [1.0, 1.15], { extrapolateRight: 'clamp' }) : 1;
  const kbX = hasImage ? interpolate(frame, [0, durationInFrames], [0, -3], { extrapolateRight: 'clamp' }) : 0;
  const kbY = hasImage ? interpolate(frame, [0, durationInFrames], [0, -2], { extrapolateRight: 'clamp' }) : 0;

  // Motion component
  const motionStyle = scene.motion_style || 'keyword_pop';
  const MotionComponent = MOTION_REGISTRY[motionStyle] || MOTION_REGISTRY.keyword_pop;
  // Animated gradient angle + ambient glow positions
  const gradAngle = 160 + Math.sin(frame * 0.008) * 20;
  const glow1X = 45 + Math.sin(frame * 0.01) * 15;
  const glow1Y = 30 + Math.cos(frame * 0.008) * 12;
  const glow2X = 55 + Math.cos(frame * 0.012) * 18;
  const glow2Y = 65 + Math.sin(frame * 0.009) * 10;

  // Use blended colors for all visual elements
  const ac = blendedAccent;
  const gl = blendedGlow;

  const bokehOrbs = getBokehOrbs(scene.scene_number, gl).slice(0, tc.bokehCount);
  const sparkles = getSparkles(scene.scene_number, ac).slice(0, tc.sparkleCount);
  const shapes = getShapes(scene.scene_number, ac).slice(0, tc.shapeCount);

  return (
    <AbsoluteFill style={{ opacity, transform, filter, clipPath }}>

      {/* ── Background Layer ── */}
      {hasVideo ? (
        <>
          <AbsoluteFill style={{ overflow: 'hidden' }}>
            <Video src={scene.backgroundVideoUrl!} muted style={{
              width: '100%', height: '100%', objectFit: 'cover',
            }} />
          </AbsoluteFill>
          <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.35)' }} />
          <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.5) 100%)' }} />
        </>
      ) : hasImage ? (
        <>
          <AbsoluteFill style={{ overflow: 'hidden' }}>
            <Img src={scene.backgroundImageUrl!} style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transform: `scale(${kbScale}) translate(${kbX}%, ${kbY}%)`,
            }} />
          </AbsoluteFill>
          <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.5) 100%)' }} />
          {/* Subtle grain on images */}
          <AbsoluteFill style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '3px 3px', pointerEvents: 'none',
          }} />
        </>
      ) : (
        <>
          {/* Background fill */}
          {tc.bgMode === 'solid' ? (
            <AbsoluteFill style={{ backgroundColor: c2 }} />
          ) : tc.bgMode === 'light' ? (
            <AbsoluteFill style={{
              background: `linear-gradient(${gradAngle}deg, ${c1} 0%, ${c2} 50%, ${c3} 100%)`,
            }} />
          ) : (
            <AbsoluteFill style={{
              background: `linear-gradient(${gradAngle}deg, ${c1} 0%, ${c2} 50%, ${c3} 100%)`,
            }} />
          )}

          {/* Ambient glow 1 */}
          <AbsoluteFill style={{
            background: `radial-gradient(ellipse at ${glow1X}% ${glow1Y}%, ${gl}${tc.bgMode === 'light' ? '0a' : '15'} 0%, transparent 55%)`,
          }} />

          {/* Ambient glow 2 */}
          <AbsoluteFill style={{
            background: `radial-gradient(ellipse at ${glow2X}% ${glow2Y}%, ${ac}${tc.bgMode === 'light' ? '08' : '0c'} 0%, transparent 50%)`,
          }} />

          {/* Grid pattern */}
          {tc.grid && (
            <AbsoluteFill style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
              backgroundSize: '80px 80px',
              opacity: interpolate(entryProgress, [0, 1], [0, 1]),
            }} />
          )}

          {/* Dot pattern (bold_impact style) */}
          {tc.dotPattern && (
            <AbsoluteFill style={{
              backgroundImage: `radial-gradient(circle, ${ac}12 1.5px, transparent 1.5px)`,
              backgroundSize: '24px 24px',
              opacity: interpolate(entryProgress, [0, 1], [0, 0.5]),
            }} />
          )}

          {/* Grain texture */}
          {tc.grain && (
            <AbsoluteFill style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px), radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
              backgroundSize: '4px 4px, 7px 7px',
              backgroundPosition: '0 0, 3px 3px',
              pointerEvents: 'none',
            }} />
          )}

          {/* Bokeh orbs */}
          {bokehOrbs.map((orb, i) => <BokehOrb key={`b${i}`} {...orb} />)}
        </>
      )}

      {/* Sparkles (both modes, subtle for images/video) */}
      <div style={{ opacity: (hasImage || hasVideo) ? 0.3 : 1 }}>
        {sparkles.map((s, i) => <Sparkle key={`s${i}`} {...s} />)}
      </div>

      {/* Floating shapes */}
      <div style={{ opacity: (hasImage || hasVideo) ? 0.15 : 0.7 }}>
        {shapes.map((s, i) => <FloatingShape key={`f${i}`} {...s} />)}
      </div>

      {/* Type-specific overlays */}
      {!hasImage && !hasVideo && isProblem && <XMarkOverlay accent={ac} />}
      {!hasImage && !hasVideo && isSolution && <CheckOverlay accent={ac} />}
      {isHookOrCta && <ParticleBurst accent={ac} glow={gl} />}

      {/* ── Motion Graphics ── */}
      <MotionComponent scene={scene} accent={ac} keywords={keywords} />

      {/* ── Lottie Overlay ── */}
      {(() => {
        const lottieType = resolveLottieType(sceneType, scene.motion_style);
        if (!lottieType) return null;
        return (
          <LottieOverlay
            type={lottieType}
            opacity={(hasImage || hasVideo) ? 0.12 : 0.2}
            position="center"
          />
        );
      })()}

      {/* Accent line */}
      <AccentLine accent={ac} />
    </AbsoluteFill>
  );
}
