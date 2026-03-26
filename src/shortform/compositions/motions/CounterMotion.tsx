import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

/** Extract numbers from keywords, or show keywords as-is */
export default function CounterMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const entrySpring = spring({ frame, fps, config: { damping: 15, mass: 1 } });

  // Find a number in the keywords
  const numberKw = keywords.find(kw => /\d/.test(kw));
  const targetNum = numberKw ? parseInt(numberKw.replace(/[^\d]/g, ''), 10) : 0;

  // Count up to target number over first 60% of scene
  const countEnd = Math.floor(durationInFrames * 0.6);
  const currentNum = targetNum > 0
    ? Math.min(Math.round(interpolate(frame, [0, countEnd], [0, targetNum], { extrapolateRight: 'clamp' })), targetNum)
    : 0;

  const suffix = numberKw ? numberKw.replace(/[\d,]/g, '') : '';
  const labelKw = keywords.find(kw => kw !== numberKw) || '';

  const scale = interpolate(entrySpring, [0, 1], [0.5, 1]);
  const opacity = interpolate(entrySpring, [0, 1], [0, 1]);

  // Pulse when reaching target
  const atTarget = currentNum === targetNum && targetNum > 0;
  const pulse = atTarget ? 1 + Math.sin(frame * 0.15) * 0.04 : 1;

  // Progress ring animation
  const progress = targetNum > 0
    ? interpolate(frame, [0, countEnd], [0, 1], { extrapolateRight: 'clamp' })
    : 0;

  const ringRadius = 130;
  const ringStroke = 6;
  const circumference = 2 * Math.PI * ringRadius;
  const dashOffset = circumference * (1 - progress);

  // Ring glow intensity
  const ringGlow = atTarget ? 0.8 + Math.sin(frame * 0.12) * 0.2 : 0.4;

  // Completion pulse ring
  const completionPulse = atTarget ? Math.sin(frame * 0.1) * 0.15 + 0.85 : 0;

  return (
    <div style={{
      position: 'absolute', left: '50%', top: '48%',
      transform: `translate(-50%, -50%) scale(${scale * pulse})`,
      opacity, textAlign: 'center', width: '85%',
    }}>
      {/* Background radial gradient */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        width: 500, height: 500,
        transform: 'translate(-50%, -50%)',
        background: `radial-gradient(circle, ${accent}12 0%, ${accent}06 40%, transparent 70%)`,
        borderRadius: '50%',
        filter: 'blur(30px)',
      }} />

      {targetNum > 0 ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {/* SVG Progress Ring */}
          <svg
            width={ringRadius * 2 + ringStroke * 2 + 40}
            height={ringRadius * 2 + ringStroke * 2 + 40}
            style={{
              position: 'absolute',
              left: '50%', top: '50%',
              transform: `translate(-50%, -50%) rotate(-90deg)`,
            }}
          >
            {/* Background ring */}
            <circle
              cx={ringRadius + ringStroke + 20}
              cy={ringRadius + ringStroke + 20}
              r={ringRadius}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={ringStroke}
            />
            {/* Glow filter */}
            <defs>
              <filter id="ring-glow">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* Progress ring */}
            <circle
              cx={ringRadius + ringStroke + 20}
              cy={ringRadius + ringStroke + 20}
              r={ringRadius}
              fill="none"
              stroke={accent}
              strokeWidth={ringStroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              filter="url(#ring-glow)"
              opacity={ringGlow}
            />
            {/* Completion pulse outer ring */}
            {atTarget && (
              <circle
                cx={ringRadius + ringStroke + 20}
                cy={ringRadius + ringStroke + 20}
                r={ringRadius + 10}
                fill="none"
                stroke={accent}
                strokeWidth={2}
                opacity={completionPulse * 0.3}
              />
            )}
          </svg>

          {/* Number */}
          <div style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 140, fontWeight: 900, color: accent,
            textShadow: `0 0 60px ${accent}50, 0 0 120px ${accent}25, 0 4px 20px rgba(0,0,0,0.4)`,
            lineHeight: 1, letterSpacing: '-4px',
            position: 'relative',
          }}>
            {currentNum.toLocaleString()}{suffix}
          </div>

          {labelKw && (
            <div style={{
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              fontSize: 56, fontWeight: 700, color: 'white',
              textShadow: '0 2px 16px rgba(0,0,0,0.5), 0 0 40px rgba(255,255,255,0.1)',
              marginTop: 24, letterSpacing: '-1px',
              position: 'relative',
            }}>
              {labelKw}
            </div>
          )}
        </div>
      ) : (
        // Fallback: show keywords like keyword_pop
        keywords.map((kw, i) => (
          <div key={i} style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 100, fontWeight: 900, color: 'white',
            textShadow: `0 0 40px ${accent}60, 0 4px 20px rgba(0,0,0,0.5)`,
            lineHeight: 1.3,
            position: 'relative',
          }}>
            {kw}
          </div>
        ))
      )}
    </div>
  );
}
