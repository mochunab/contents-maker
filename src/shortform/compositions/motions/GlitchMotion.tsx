import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

// Seeded pseudo-random for deterministic glitch patterns
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export default function GlitchMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  const entrySpring = spring({ frame, fps, config: { damping: 8, mass: 0.6 } });
  const mainKeyword = keywords[0] || '';
  const total = keywords.length;

  // More irregular glitch timing using seeded random
  const glitchSeed1 = seededRandom(Math.floor(frame / 7));
  const glitchSeed2 = seededRandom(Math.floor(frame / 11) + 50);
  const glitchActive = glitchSeed1 > 0.7 || (glitchSeed2 > 0.85 && frame % 3 === 0);
  const glitchIntensity = glitchActive ? seededRandom(frame * 3) : 0;
  const glitchX = glitchActive ? (seededRandom(frame * 7) - 0.5) * 28 * glitchIntensity : 0;
  const glitchY = glitchActive ? (seededRandom(frame * 11) - 0.5) * 14 * glitchIntensity : 0;

  // RGB split offset
  const rgbOffset = glitchActive ? (4 + seededRandom(frame * 5) * 6) * glitchIntensity : 0;

  const scale = interpolate(entrySpring, [0, 1], [0.8, 1]);
  const opacity = interpolate(entrySpring, [0, 1], [0, 1]);

  // Scan line effect
  const scanY = (frame * 8) % height;

  // Color flash (full screen color flash on strong glitches)
  const colorFlashActive = glitchSeed1 > 0.88;
  const flashHue = seededRandom(frame * 17) * 360;
  const flashOpacity = colorFlashActive ? 0.15 * glitchIntensity : 0;

  // VHS noise bars
  const noiseBars = Array.from({ length: 5 }, (_, i) => {
    const barSeed = seededRandom(frame * 3 + i * 100);
    const barActive = barSeed > 0.5;
    const barY = seededRandom(frame * 7 + i * 200) * 100;
    const barHeight = 1 + seededRandom(frame * 2 + i * 50) * 4;
    const barOpacity = barActive ? seededRandom(frame * 5 + i * 300) * 0.3 : 0;
    return { y: barY, height: barHeight, opacity: barOpacity, active: barActive };
  });

  // Horizontal distortion bands for text
  const distortionBands = Array.from({ length: 3 }, (_, i) => {
    const bandSeed = seededRandom(Math.floor(frame / 5) + i * 77);
    const bandActive = bandSeed > 0.6 && glitchActive;
    const offsetX = bandActive ? (seededRandom(frame * 13 + i * 41) - 0.5) * 30 : 0;
    const bandTop = 20 + i * 30; // percentage
    return { active: bandActive, offsetX, top: bandTop };
  });

  return (
    <div style={{
      position: 'absolute', left: '50%', top: '48%',
      transform: `translate(-50%, -50%) scale(${scale})`,
      opacity, width: '85%', textAlign: 'center',
    }}>
      {/* Color flash overlay */}
      {colorFlashActive && (
        <div style={{
          position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
          backgroundColor: `hsl(${flashHue}, 100%, 50%)`,
          opacity: flashOpacity,
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
          zIndex: 90,
        }} />
      )}

      {/* VHS noise bars */}
      {noiseBars.map((bar, i) => bar.active && (
        <div key={`noise-${i}`} style={{
          position: 'absolute', left: '-10%', width: '120%',
          top: `${bar.y}%`, height: bar.height,
          background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,${bar.opacity}) 20%, rgba(255,255,255,${bar.opacity * 0.5}) 50%, rgba(255,255,255,${bar.opacity}) 80%, transparent 100%)`,
          pointerEvents: 'none',
          zIndex: 10,
        }} />
      ))}

      {/* Scan line */}
      <div style={{
        position: 'absolute', left: '-10%', width: '120%',
        top: scanY - 960, height: 3,
        backgroundColor: `${accent}20`,
        boxShadow: `0 0 20px ${accent}15, 0 0 40px ${accent}08`,
      }} />

      {/* Secondary scan lines (CRT effect) */}
      {Array.from({ length: 4 }, (_, i) => (
        <div key={`scan-${i}`} style={{
          position: 'absolute', left: '-10%', width: '120%',
          top: ((frame * (3 + i * 2) + i * 400) % height) - 960,
          height: 1,
          backgroundColor: `rgba(255,255,255,0.03)`,
        }} />
      ))}

      {keywords.map((kw, index) => {
        const positions = total === 1 ? [0] : total === 2 ? [-40, 40] : [-60, 0, 60];
        const yOffset = positions[index] || 0;

        // Per-keyword distortion
        const kwDistort = distortionBands[index % distortionBands.length];
        const extraX = kwDistort?.active ? kwDistort.offsetX : 0;

        return (
          <div key={index} style={{
            position: 'relative', marginTop: index > 0 ? 16 : 0,
            transform: `translate(${glitchX + extraX}px, ${glitchY + yOffset}px)`,
          }}>
            {/* Red channel (offset) */}
            <span style={{
              position: 'absolute', left: 0, top: 0, width: '100%',
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              fontSize: total === 1 ? 110 : total === 2 ? 88 : 72,
              fontWeight: 900, color: 'rgba(255,0,0,0.5)',
              transform: `translate(${rgbOffset}px, -${rgbOffset / 2}px)`,
              letterSpacing: '-2px', lineHeight: 1.2,
              mixBlendMode: 'screen',
            }}>
              {kw}
            </span>
            {/* Cyan channel (offset) */}
            <span style={{
              position: 'absolute', left: 0, top: 0, width: '100%',
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              fontSize: total === 1 ? 110 : total === 2 ? 88 : 72,
              fontWeight: 900, color: 'rgba(0,255,255,0.5)',
              transform: `translate(-${rgbOffset}px, ${rgbOffset / 2}px)`,
              letterSpacing: '-2px', lineHeight: 1.2,
              mixBlendMode: 'screen',
            }}>
              {kw}
            </span>
            {/* Green channel (subtle, new) */}
            {glitchActive && (
              <span style={{
                position: 'absolute', left: 0, top: 0, width: '100%',
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                fontSize: total === 1 ? 110 : total === 2 ? 88 : 72,
                fontWeight: 900, color: 'rgba(0,255,0,0.2)',
                transform: `translate(${rgbOffset * 0.5}px, ${rgbOffset * 0.3}px)`,
                letterSpacing: '-2px', lineHeight: 1.2,
                mixBlendMode: 'screen',
              }}>
                {kw}
              </span>
            )}
            {/* Main text */}
            <span style={{
              position: 'relative',
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              fontSize: total === 1 ? 110 : total === 2 ? 88 : 72,
              fontWeight: 900, color: 'white',
              textShadow: `0 0 20px ${accent}50, 0 0 40px ${accent}20`,
              letterSpacing: '-2px', lineHeight: 1.2, wordBreak: 'keep-all',
            }}>
              {kw}
            </span>
          </div>
        );
      })}
    </div>
  );
}
