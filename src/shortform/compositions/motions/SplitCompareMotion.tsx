import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

export default function SplitCompareMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftSpring = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const rightSpring = spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 14, mass: 0.8 } });
  const dividerSpring = spring({ frame: Math.max(0, frame - 4), fps, config: { damping: 12 } });

  const left = keywords[0] || '';
  const right = keywords[1] || keywords[0] || '';

  // Divider pulse
  const dividerPulse = 0.7 + Math.sin(frame * 0.08) * 0.3;

  // VS badge rotation
  const vsRotate = interpolate(dividerSpring, [0, 1], [-180, 0]);
  const vsGlow = 0.6 + Math.sin(frame * 0.1) * 0.4;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center',
    }}>
      {/* Left gradient background */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%',
        background: 'linear-gradient(135deg, rgba(255,107,107,0.12) 0%, transparent 70%)',
        opacity: interpolate(leftSpring, [0, 1], [0, 1]),
      }} />

      {/* Right gradient background */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%',
        background: 'linear-gradient(225deg, rgba(78,205,196,0.12) 0%, transparent 70%)',
        opacity: interpolate(rightSpring, [0, 1], [0, 1]),
      }} />

      {/* Left side */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column' as const,
        alignItems: 'center', justifyContent: 'center',
        transform: `translateX(${interpolate(leftSpring, [0, 1], [-80, 0])}px)`,
        opacity: interpolate(leftSpring, [0, 1], [0, 1]),
        gap: 16,
      }}>
        <span style={{
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
          fontSize: 42, lineHeight: 1,
          filter: `drop-shadow(0 0 12px rgba(255,107,107,0.4))`,
        }}>
          {'\u274C'}
        </span>
        <span style={{
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
          fontSize: 72, fontWeight: 900, color: '#FF6B6B',
          textShadow: '0 0 40px rgba(255,107,107,0.4), 0 0 80px rgba(255,107,107,0.15), 0 4px 16px rgba(0,0,0,0.4)',
          textAlign: 'center', wordBreak: 'keep-all' as const,
        }}>
          {left}
        </span>
      </div>

      {/* Center divider with glow */}
      <div style={{
        width: 6,
        backgroundColor: `${accent}`,
        height: `${interpolate(dividerSpring, [0, 1], [0, 60])}%`,
        borderRadius: 3,
        boxShadow: `0 0 20px ${accent}60, 0 0 40px ${accent}30, 0 0 60px ${accent}15`,
        flexShrink: 0,
        opacity: dividerPulse,
      }} />

      {/* VS badge with rotation and glow */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: `translate(-50%, -50%) scale(${interpolate(dividerSpring, [0, 1], [0, 1])}) rotate(${vsRotate}deg)`,
        width: 72, height: 72, borderRadius: '50%',
        background: `linear-gradient(135deg, ${accent}, ${accent}CC)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 ${24 + vsGlow * 20}px ${accent}80, 0 0 ${48 + vsGlow * 30}px ${accent}40, inset 0 -2px 4px rgba(0,0,0,0.2)`,
        zIndex: 1,
        border: '2px solid rgba(255,255,255,0.15)',
      }}>
        <span style={{
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
          fontSize: 26, fontWeight: 900, color: 'white',
          textShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}>VS</span>
      </div>

      {/* Right side */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column' as const,
        alignItems: 'center', justifyContent: 'center',
        transform: `translateX(${interpolate(rightSpring, [0, 1], [80, 0])}px)`,
        opacity: interpolate(rightSpring, [0, 1], [0, 1]),
        gap: 16,
      }}>
        <span style={{
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
          fontSize: 42, lineHeight: 1,
          filter: `drop-shadow(0 0 12px rgba(78,205,196,0.4))`,
        }}>
          {'\u2705'}
        </span>
        <span style={{
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
          fontSize: 72, fontWeight: 900, color: '#4ecdc4',
          textShadow: '0 0 40px rgba(78,205,196,0.4), 0 0 80px rgba(78,205,196,0.15), 0 4px 16px rgba(0,0,0,0.4)',
          textAlign: 'center', wordBreak: 'keep-all' as const,
        }}>
          {right}
        </span>
      </div>
    </div>
  );
}
