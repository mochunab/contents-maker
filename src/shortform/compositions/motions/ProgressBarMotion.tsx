import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

export default function ProgressBarMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Bar fill progress
  const fillSpring = spring({ frame, fps, config: { damping: 20, mass: 2 } });
  const fillPercent = interpolate(fillSpring, [0, 1], [0, 100]);

  // Entry animation
  const entrySpring = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const entryOpacity = interpolate(entrySpring, [0, 1], [0, 1]);
  const entryY = interpolate(entrySpring, [0, 1], [40, 0]);

  // Completion pulse (when bar is nearly full)
  const isComplete = fillPercent > 95;
  const pulse = isComplete ? 1 + Math.sin(frame * 0.15) * 0.03 : 1;
  const completionGlow = isComplete ? 0.8 + Math.sin(frame * 0.12) * 0.2 : 0;

  // Counter display
  const displayPercent = Math.round(fillPercent);

  // Leading edge glow position
  const barWidth = 720;
  const filledWidth = (fillPercent / 100) * barWidth;

  const label = keywords[0] || '';

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: entryOpacity,
      transform: `translateY(${entryY}px) scale(${pulse})`,
    }}>
      {/* Percent counter */}
      <div style={{
        fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
        fontSize: 120, fontWeight: 900, color: 'white',
        textShadow: `0 0 50px ${accent}60, 0 4px 20px rgba(0,0,0,0.5)`,
        marginBottom: 40, lineHeight: 1,
      }}>
        {displayPercent}
        <span style={{ fontSize: 60, color: accent, fontWeight: 700 }}>%</span>
      </div>

      {/* Progress bar container */}
      <div style={{
        width: barWidth, height: 32, borderRadius: 16,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.1)',
        position: 'relative', overflow: 'hidden',
        boxShadow: `0 0 ${completionGlow * 30}px ${accent}${Math.round(completionGlow * 60).toString(16).padStart(2, '0')}`,
      }}>
        {/* Filled portion */}
        <div style={{
          width: filledWidth, height: '100%',
          borderRadius: 16,
          background: `linear-gradient(90deg, ${accent}90 0%, ${accent} 60%, ${accent}dd 100%)`,
          boxShadow: `0 0 20px ${accent}50`,
          position: 'relative',
          transition: 'none',
        }}>
          {/* Shine sweep */}
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: 16,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
            transform: `translateX(${interpolate(frame % 60, [0, 60], [-100, 100])}%)`,
          }} />
        </div>

        {/* Leading edge glow dot */}
        {fillPercent > 5 && fillPercent < 98 && (
          <div style={{
            position: 'absolute',
            left: filledWidth - 8, top: '50%',
            transform: 'translateY(-50%)',
            width: 16, height: 16, borderRadius: '50%',
            background: 'white',
            boxShadow: `0 0 20px ${accent}, 0 0 40px ${accent}80`,
          }} />
        )}
      </div>

      {/* Label text */}
      {label && (
        <div style={{
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
          fontSize: 42, fontWeight: 700, color: accent,
          marginTop: 32,
          textShadow: `0 0 20px ${accent}40, 0 2px 10px rgba(0,0,0,0.3)`,
          opacity: interpolate(entrySpring, [0, 1], [0, 1]),
        }}>
          {label}
        </div>
      )}

      {/* Secondary keywords */}
      {keywords.length > 1 && (
        <div style={{
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
          fontSize: 30, fontWeight: 500, color: 'rgba(255,255,255,0.6)',
          marginTop: 12,
        }}>
          {keywords.slice(1).join(' / ')}
        </div>
      )}
    </div>
  );
}
