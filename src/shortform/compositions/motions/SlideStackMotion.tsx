import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

export default function SlideStackMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <>
      {keywords.map((kw, index) => {
        const delay = index * 10;
        const entrySpring = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 14, mass: 0.7 } });
        const fromLeft = index % 2 === 0;
        const translateX = interpolate(entrySpring, [0, 1], [fromLeft ? -120 : 120, 0]);
        const opacity = interpolate(entrySpring, [0, 1], [0, 1]);
        const total = keywords.length;
        const positions = total === 1 ? [50] : total === 2 ? [42, 58] : [35, 50, 65];
        const topPercent = positions[index] || 50;

        // 3D entry rotation
        const rotateY = interpolate(entrySpring, [0, 1], [fromLeft ? -8 : 8, 0]);

        // Float effect after entry
        const floatOffset = entrySpring > 0.9
          ? Math.sin((frame - delay) * 0.06 + index * 1.5) * 4
          : 0;

        // Lift shadow after entry
        const settled = entrySpring > 0.9;
        const liftAmount = settled ? 2 + Math.sin((frame - delay) * 0.06 + index * 1.5) * 2 : 0;

        return (
          <div key={index} style={{
            position: 'absolute', left: '50%', top: `${topPercent}%`,
            transform: `translate(-50%, -50%) translateX(${translateX}%) perspective(1000px) rotateY(${rotateY}deg) translateY(${floatOffset}px)`,
            opacity, textAlign: 'center', width: '85%',
          }}>
            <div style={{
              display: 'inline-block',
              padding: '18px 36px',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
              borderRadius: 20,
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: `
                0 ${8 + liftAmount * 3}px ${24 + liftAmount * 6}px rgba(0,0,0,0.4),
                0 0 ${settled ? 30 : 0}px ${accent}12,
                inset 0 1px 0 rgba(255,255,255,0.1)
              `,
              position: 'relative' as const,
              overflow: 'hidden',
            }}>
              {/* Gradient accent bar on left */}
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: 5,
                background: `linear-gradient(180deg, ${accent} 0%, ${accent}60 50%, ${accent}CC 100%)`,
                borderRadius: '20px 0 0 20px',
                boxShadow: `0 0 16px ${accent}50, 0 0 32px ${accent}20`,
              }} />

              {/* Subtle shimmer overlay */}
              <div style={{
                position: 'absolute', inset: 0,
                background: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.04) 45%, transparent 50%)`,
                backgroundSize: '200% 100%',
                backgroundPosition: `${interpolate(frame % 120, [0, 120], [-100, 200])}% 0`,
              }} />

              <span style={{
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                fontSize: total === 1 ? 100 : total === 2 ? 80 : 64,
                fontWeight: 800, color: 'white',
                textShadow: `0 2px 16px rgba(0,0,0,0.5), 0 0 40px ${accent}20`,
                letterSpacing: '-1px', lineHeight: 1.2, wordBreak: 'keep-all' as const,
                position: 'relative' as const,
              }}>
                {kw}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
