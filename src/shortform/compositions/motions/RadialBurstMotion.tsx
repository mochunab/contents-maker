import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

export default function RadialBurstMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrySpring = spring({ frame, fps, config: { damping: 10, mass: 1.2 } });
  const scale = interpolate(entrySpring, [0, 1], [0, 1]);
  const opacity = interpolate(entrySpring, [0, 1], [0, 1]);

  // Radial lines
  const lineCount = 16;
  const lineProgress = spring({ frame: Math.max(0, frame - 6), fps, config: { damping: 16, mass: 0.4 } });

  // Pulse after entry
  const pulse = frame > 20 ? 1 + Math.sin(frame * 0.1) * 0.02 : 1;

  // Neon rings expanding from center
  const ringCount = 3;
  const rings = Array.from({ length: ringCount }, (_, i) => {
    const ringDelay = i * 8;
    const ringSpring = spring({ frame: Math.max(0, frame - ringDelay - 4), fps, config: { damping: 18, mass: 0.5 } });
    const ringScale = interpolate(ringSpring, [0, 1], [0, 2.5 + i * 0.8]);
    const ringOpacity = interpolate(ringSpring, [0, 0.3, 1], [0, 0.8, 0]);
    return { scale: ringScale, opacity: ringOpacity };
  });

  // Central orb pulse
  const orbSize = 120 + Math.sin(frame * 0.08) * 20;
  const orbGlow = 40 + Math.sin(frame * 0.12) * 15;

  const mainKeyword = keywords[0] || '';

  return (
    <div style={{
      position: 'absolute', left: '50%', top: '48%',
      transform: `translate(-50%, -50%) scale(${scale * pulse})`,
      opacity, width: 800, height: 800,
    }}>
      {/* Neon expanding rings */}
      {rings.map((ring, i) => (
        <div key={`ring-${i}`} style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: `translate(-50%, -50%) scale(${ring.scale})`,
          width: 160, height: 160, borderRadius: '50%',
          border: `2px solid ${accent}`,
          opacity: ring.opacity,
          boxShadow: `0 0 20px ${accent}80, 0 0 40px ${accent}40, inset 0 0 20px ${accent}30`,
          filter: 'blur(0.5px)',
        }} />
      ))}

      {/* Central glowing orb */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        width: orbSize, height: orbSize, borderRadius: '50%',
        background: `radial-gradient(circle, ${accent}90 0%, ${accent}50 30%, ${accent}20 60%, transparent 80%)`,
        boxShadow: `0 0 ${orbGlow}px ${accent}80, 0 0 ${orbGlow * 2}px ${accent}40, 0 0 ${orbGlow * 3}px ${accent}20`,
        filter: 'blur(2px)',
      }} />

      {/* Radial gradient lines with particle trails */}
      {Array.from({ length: lineCount }, (_, i) => {
        const angle = (i / lineCount) * 360;
        const len = interpolate(lineProgress, [0, 1], [0, 280 + (i % 3) * 50]);
        const lineOpacity = interpolate(lineProgress, [0, 0.5, 1], [0, 0.9, 0.6]);

        return (
          <div key={i} style={{ position: 'absolute', left: '50%', top: '50%' }}>
            {/* Gradient line (bright inside, transparent outside) */}
            <div style={{
              position: 'absolute',
              width: len, height: 3,
              background: `linear-gradient(90deg, ${accent}CC 0%, ${accent}60 40%, ${accent}15 80%, transparent 100%)`,
              transformOrigin: '0% 50%',
              transform: `rotate(${angle}deg)`,
              borderRadius: 2,
              opacity: lineOpacity,
              boxShadow: `0 0 8px ${accent}40`,
            }} />
            {/* Particle at the tip of each line */}
            <div style={{
              position: 'absolute',
              width: 8, height: 8,
              borderRadius: '50%',
              background: `radial-gradient(circle, white 0%, ${accent} 50%, transparent 100%)`,
              boxShadow: `0 0 10px ${accent}, 0 0 20px ${accent}80`,
              transformOrigin: `${-len + 4}px 50%`,
              transform: `rotate(${angle}deg) translateX(${len - 4}px) translateY(-2.5px)`,
              opacity: lineOpacity * lineProgress,
            }} />
          </div>
        );
      })}

      {/* Outer glow circle */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 300, height: 300, borderRadius: '50%',
        background: `radial-gradient(circle, ${accent}25 0%, ${accent}10 40%, transparent 70%)`,
        filter: `blur(${4 + Math.sin(frame * 0.06) * 2}px)`,
      }} />

      {/* Main keyword */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center', width: '90%',
      }}>
        <span style={{
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
          fontSize: keywords.length === 1 ? 110 : 80,
          fontWeight: 900, color: 'white',
          textShadow: `0 0 30px ${accent}AA, 0 0 60px ${accent}60, 0 0 100px ${accent}30, 0 4px 20px rgba(0,0,0,0.5)`,
          letterSpacing: '-2px', lineHeight: 1.2, wordBreak: 'keep-all',
        }}>
          {mainKeyword}
        </span>
        {keywords.length > 1 && (
          <div style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 56, fontWeight: 700, color: accent,
            textShadow: `0 0 20px ${accent}60, 0 2px 12px rgba(0,0,0,0.3)`,
            marginTop: 16,
          }}>
            {keywords.slice(1).join(' ')}
          </div>
        )}
      </div>
    </div>
  );
}
