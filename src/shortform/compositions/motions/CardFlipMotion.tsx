import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

export default function CardFlipMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Card enters with scale
  const entrySpring = spring({ frame, fps, config: { damping: 14, mass: 1 } });
  const cardScale = interpolate(entrySpring, [0, 1], [0.6, 1]);
  const cardOpacity = interpolate(entrySpring, [0, 1], [0, 1]);

  // Flip starts after entry (around frame 25)
  const flipSpring = spring({ frame: Math.max(0, frame - 25), fps, config: { damping: 18, mass: 1.2 } });
  const rotateY = interpolate(flipSpring, [0, 1], [0, 180]);

  // Determine which side is visible
  const showFront = rotateY < 90;

  // Flash/glow at the flip moment
  const flipMoment = Math.abs(rotateY - 90);
  const flashIntensity = flipMoment < 30 ? interpolate(flipMoment, [0, 30], [1, 0]) : 0;

  // Subtle floating after flip
  const floatY = frame > 40 ? Math.sin(frame * 0.06) * 4 : 0;

  const frontText = keywords[0] || '?';
  const backText = keywords[1] || keywords[0] || '!';

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      perspective: 1200,
    }}>
      {/* Flash overlay at flip moment */}
      {flashIntensity > 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(circle, ${accent}${Math.round(flashIntensity * 60).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
          pointerEvents: 'none', zIndex: 10,
        }} />
      )}

      {/* Card container */}
      <div style={{
        width: 580, height: 380,
        opacity: cardOpacity,
        transform: `scale(${cardScale}) translateY(${floatY}px) rotateY(${rotateY}deg)`,
        transformStyle: 'preserve-3d',
        position: 'relative',
      }}>
        {/* Front face */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          borderRadius: 28,
          background: `linear-gradient(135deg, ${accent}25 0%, ${accent}08 50%, ${accent}18 100%)`,
          border: `2px solid ${accent}40`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.4), 0 0 40px ${accent}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 40,
        }}>
          <span style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 72, fontWeight: 800, color: 'white',
            textShadow: `0 0 30px ${accent}50, 0 4px 16px rgba(0,0,0,0.4)`,
            textAlign: 'center', wordBreak: 'keep-all', lineHeight: 1.3,
          }}>
            {frontText}
          </span>
        </div>

        {/* Back face */}
        <div style={{
          position: 'absolute', inset: 0,
          backfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)',
          borderRadius: 28,
          background: `linear-gradient(135deg, ${accent}40 0%, ${accent}15 50%, ${accent}30 100%)`,
          border: `2px solid ${accent}60`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 50px ${accent}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 40,
        }}>
          <span style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 80, fontWeight: 900, color: 'white',
            textShadow: `0 0 40px ${accent}70, 0 4px 20px rgba(0,0,0,0.5)`,
            textAlign: 'center', wordBreak: 'keep-all', lineHeight: 1.3,
          }}>
            {backText}
          </span>
        </div>
      </div>

      {/* Side label */}
      <div style={{
        position: 'absolute', bottom: 200,
        fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
        fontSize: 32, fontWeight: 600,
        color: `${accent}90`,
        opacity: interpolate(entrySpring, [0, 1], [0, 0.7]),
        letterSpacing: '4px', textTransform: 'uppercase',
      }}>
        {showFront ? 'BEFORE' : 'AFTER'}
      </div>
    </div>
  );
}
