import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

export default function SpotlightMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrySpring = spring({ frame, fps, config: { damping: 12, mass: 1.5 } });

  // Spotlight circle radius grows from 0 to full
  const radius = interpolate(entrySpring, [0, 1], [0, 420]);

  // Subtle position jitter using sine waves
  const jitterX = Math.sin(frame * 0.08) * 6 + Math.cos(frame * 0.13) * 4;
  const jitterY = Math.cos(frame * 0.06) * 5 + Math.sin(frame * 0.11) * 3;

  // Text fade in (slightly delayed)
  const textSpring = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 14, mass: 0.8 } });
  const textOpacity = interpolate(textSpring, [0, 1], [0, 1]);
  const textScale = interpolate(textSpring, [0, 1], [0.7, 1]);

  // Glow pulse after entry
  const glowPulse = frame > 20 ? 1 + Math.sin(frame * 0.12) * 0.15 : 1;

  // Secondary keywords delayed entrance
  const secondarySpring = spring({ frame: Math.max(0, frame - 18), fps, config: { damping: 16, mass: 0.6 } });

  const mainKeyword = keywords[0] || '';
  const centerX = 540 + jitterX;
  const centerY = 520 + jitterY;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* Dark overlay with circular mask cutout */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle ${radius}px at ${centerX}px ${centerY}px, transparent 0%, transparent 85%, rgba(0,0,0,0.92) 100%)`,
      }} />

      {/* Soft glow ring at spotlight edge */}
      <div style={{
        position: 'absolute',
        left: centerX, top: centerY,
        transform: 'translate(-50%, -50%)',
        width: radius * 2.2, height: radius * 2.2,
        borderRadius: '50%',
        background: `radial-gradient(circle, transparent 60%, ${accent}${Math.round(25 * glowPulse).toString(16).padStart(2, '0')} 80%, transparent 100%)`,
        filter: `blur(${8 * glowPulse}px)`,
        pointerEvents: 'none',
      }} />

      {/* Inner glow */}
      <div style={{
        position: 'absolute',
        left: centerX, top: centerY,
        transform: 'translate(-50%, -50%)',
        width: radius * 1.4, height: radius * 1.4,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accent}15 0%, transparent 70%)`,
      }} />

      {/* Main keyword text */}
      <div style={{
        position: 'absolute',
        left: centerX, top: centerY - 20,
        transform: `translate(-50%, -50%) scale(${textScale})`,
        opacity: textOpacity,
        textAlign: 'center', width: 700,
      }}>
        <span style={{
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
          fontSize: keywords.length === 1 ? 110 : 85,
          fontWeight: 900, color: 'white',
          textShadow: `0 0 60px ${accent}80, 0 0 30px ${accent}40, 0 4px 20px rgba(0,0,0,0.6)`,
          letterSpacing: '-2px', lineHeight: 1.2, wordBreak: 'keep-all',
        }}>
          {mainKeyword}
        </span>
        {keywords.length > 1 && (
          <div style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 52, fontWeight: 700, color: accent,
            opacity: interpolate(secondarySpring, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(secondarySpring, [0, 1], [20, 0])}px)`,
            textShadow: '0 2px 16px rgba(0,0,0,0.4)',
            marginTop: 20,
          }}>
            {keywords.slice(1).join(' ')}
          </div>
        )}
      </div>
    </div>
  );
}
