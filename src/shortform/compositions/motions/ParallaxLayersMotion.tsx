import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

// Deterministic pseudo-random
const seeded = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export default function ParallaxLayersMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrySpring = spring({ frame, fps, config: { damping: 14, mass: 1.2 } });
  const entryOpacity = interpolate(entrySpring, [0, 1], [0, 1]);

  // Layer movement speeds (right to left)
  const bgSpeed = frame * 0.4;
  const midSpeed = frame * 0.8;
  const fgSpeed = frame * 1.6;

  const mainKeyword = keywords[0] || '';

  // Background shapes data
  const bgShapes = [
    { x: 300, y: 250, size: 220, opacity: 0.08 },
    { x: 750, y: 650, size: 180, opacity: 0.06 },
    { x: 200, y: 800, size: 140, opacity: 0.05 },
  ];

  // Foreground particles
  const particles = Array.from({ length: 18 }, (_, i) => ({
    startX: seeded(i) * 1200 + 200,
    y: seeded(i + 50) * 900 + 100,
    size: 3 + seeded(i + 100) * 6,
    opacity: 0.2 + seeded(i + 150) * 0.4,
  }));

  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      opacity: entryOpacity,
    }}>
      {/* Background layer: large shapes, slow movement */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translateX(${-bgSpeed}px)`,
        filter: 'blur(3px)',
      }}>
        {bgShapes.map((shape, i) => (
          <div key={`bg-${i}`} style={{
            position: 'absolute',
            left: shape.x + (i * 100),
            top: shape.y,
            width: shape.size, height: shape.size,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${accent}${Math.round(shape.opacity * 255).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
            transform: `scale(${1 + Math.sin(frame * 0.03 + i) * 0.1})`,
          }} />
        ))}
        {/* Gradient stripe */}
        <div style={{
          position: 'absolute',
          left: 900 - bgSpeed * 0.3, top: 400,
          width: 600, height: 4, borderRadius: 2,
          background: `linear-gradient(90deg, transparent, ${accent}20, transparent)`,
          transform: `rotate(-5deg)`,
        }} />
      </div>

      {/* Middle layer: keyword text, medium speed */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          transform: `translateX(${-midSpeed * 0.15}px)`,
          textAlign: 'center', width: '85%',
        }}>
          <span style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: keywords.length === 1 ? 105 : 80,
            fontWeight: 900, color: 'white',
            textShadow: `0 0 50px ${accent}60, 0 4px 24px rgba(0,0,0,0.6)`,
            letterSpacing: '-2px', lineHeight: 1.2, wordBreak: 'keep-all',
          }}>
            {mainKeyword}
          </span>
          {keywords.length > 1 && (
            <div style={{
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              fontSize: 52, fontWeight: 700, color: accent,
              textShadow: `0 0 20px ${accent}40, 0 2px 12px rgba(0,0,0,0.3)`,
              marginTop: 18,
              opacity: interpolate(
                spring({ frame: Math.max(0, frame - 12), fps, config: { damping: 14, mass: 0.8 } }),
                [0, 1], [0, 1],
              ),
            }}>
              {keywords.slice(1).join(' ')}
            </div>
          )}
        </div>
      </div>

      {/* Foreground layer: small particles, fast movement */}
      <div style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none',
      }}>
        {particles.map((p, i) => {
          const x = ((p.startX - fgSpeed + 1600) % 1400) - 100;
          const wobble = Math.sin(frame * 0.05 + i * 2) * 8;
          return (
            <div key={`fg-${i}`} style={{
              position: 'absolute',
              left: x, top: p.y + wobble,
              width: p.size, height: p.size,
              borderRadius: '50%',
              background: `rgba(255,255,255,${p.opacity})`,
              boxShadow: p.size > 6 ? `0 0 ${p.size * 2}px rgba(255,255,255,${p.opacity * 0.5})` : 'none',
            }} />
          );
        })}
      </div>

      {/* Depth vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}
