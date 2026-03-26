import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

export default function ListRevealMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{
      position: 'absolute', left: '50%', top: '46%',
      transform: 'translate(-50%, -50%)',
      width: '80%',
    }}>
      {keywords.map((kw, index) => {
        const delay = index * 12;
        const entrySpring = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 14, mass: 0.6 } });
        const translateX = interpolate(entrySpring, [0, 1], [-60, 0]);
        const opacity = interpolate(entrySpring, [0, 1], [0, 1]);

        // Check mark animation (appears after text)
        const checkSpring = spring({ frame: Math.max(0, frame - delay - 8), fps, config: { damping: 10, mass: 0.4 } });
        const checkScale = interpolate(checkSpring, [0, 1], [0, 1]);
        const checkOpacity = interpolate(checkSpring, [0, 1], [0, 1]);

        // Connector line to next item
        const connectorSpring = spring({ frame: Math.max(0, frame - delay - 6), fps, config: { damping: 16, mass: 0.5 } });
        const connectorHeight = interpolate(connectorSpring, [0, 1], [0, 28]);
        const connectorOpacity = interpolate(connectorSpring, [0, 1], [0, 0.5]);

        // Card glow pulse
        const glowPulse = frame > delay + 15 ? 0.15 + Math.sin((frame - delay) * 0.08) * 0.05 : 0.15;

        return (
          <div key={index} style={{ position: 'relative' }}>
            {/* Card background with glass effect */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 24,
              marginBottom: 8, opacity,
              transform: `translateX(${translateX}px)`,
              background: `linear-gradient(135deg, rgba(255,255,255,${glowPulse}) 0%, rgba(255,255,255,0.05) 100%)`,
              backdropFilter: 'blur(12px)',
              borderRadius: 20,
              padding: '16px 24px',
              border: `1px solid rgba(255,255,255,0.12)`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 20px ${accent}15`,
            }}>
              {/* Number circle with gradient fill + glow */}
              <div style={{
                width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                background: `linear-gradient(135deg, ${accent}90 0%, ${accent}40 100%)`,
                border: `2px solid ${accent}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: `scale(${interpolate(checkSpring, [0, 1], [0.5, 1])})`,
                boxShadow: `0 0 20px ${accent}50, 0 0 40px ${accent}25, inset 0 -2px 4px rgba(0,0,0,0.2)`,
                position: 'relative',
              }}>
                <span style={{
                  fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                  fontSize: 28, fontWeight: 900, color: 'white',
                  textShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }}>
                  {index + 1}
                </span>
                {/* Check mark SVG - appears next to number */}
                <svg
                  viewBox="0 0 24 24"
                  style={{
                    position: 'absolute', right: -8, top: -6,
                    width: 24, height: 24,
                    opacity: checkOpacity,
                    transform: `scale(${checkScale})`,
                    filter: `drop-shadow(0 0 6px ${accent})`,
                  }}
                >
                  <circle cx="12" cy="12" r="11" fill={accent} stroke="white" strokeWidth="1.5" />
                  <path
                    d="M7 12.5l3 3 7-7"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={20}
                    strokeDashoffset={interpolate(checkSpring, [0, 1], [20, 0])}
                  />
                </svg>
              </div>

              {/* Text */}
              <span style={{
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                fontSize: keywords.length <= 2 ? 72 : 56,
                fontWeight: 800, color: 'white',
                textShadow: `0 0 20px ${accent}30, 0 2px 16px rgba(0,0,0,0.4)`,
                lineHeight: 1.2, wordBreak: 'keep-all', letterSpacing: '-1px',
              }}>
                {kw}
              </span>
            </div>

            {/* Vertical connector line to next item */}
            {index < keywords.length - 1 && (
              <div style={{
                position: 'relative',
                left: 56,
                width: 2,
                height: connectorHeight,
                opacity: connectorOpacity,
                background: `linear-gradient(180deg, ${accent}80 0%, ${accent}20 100%)`,
                borderRadius: 1,
                boxShadow: `0 0 8px ${accent}40`,
                marginBottom: 0,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
