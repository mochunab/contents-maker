import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';
import { SPRING_PRESETS } from '../../constants';

/**
 * 펄스 링 모션 — 중심에서 동심원이 리드미컬하게 확장, 소나/파동 느낌
 * 문제제기/이유/강조 씬에 최적
 */

export default function PulseRingMotion({ scene, keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const ringCount = 6;
  const PULSE_INTERVAL = 8; // frames between each ring launch

  // Central core glow
  const coreEntry = spring({ frame, fps, config: SPRING_PRESETS.secondary });
  const corePulse = 1 + Math.sin(frame * 0.1) * 0.08;
  const coreSize = interpolate(coreEntry, [0, 1], [0, 100]);

  // Rotating energy arcs around center
  const arcCount = 3;

  return (
    <>
      {/* Background radial glow */}
      <div style={{
        position: 'absolute', left: '50%', top: '46%',
        transform: 'translate(-50%, -50%)',
        width: 800, height: 800, borderRadius: '50%',
        background: `radial-gradient(circle, ${accent}15 0%, ${accent}08 30%, transparent 60%)`,
        opacity: interpolate(coreEntry, [0, 1], [0, 0.8]),
        filter: 'blur(30px)',
      }} />

      {/* Pulsing rings */}
      {Array.from({ length: ringCount }, (_, i) => {
        // Each ring launches at interval, loops continuously
        const ringFrame = frame - i * PULSE_INTERVAL;
        const cycleDuration = ringCount * PULSE_INTERVAL;
        // Normalize to cycle
        const normalizedFrame = ((ringFrame % cycleDuration) + cycleDuration) % cycleDuration;
        const ringT = normalizedFrame / cycleDuration;

        // Don't show before first launch
        if (frame < i * PULSE_INTERVAL) return null;

        const ringScale = interpolate(ringT, [0, 1], [0.3, 4.5]);
        const ringOpacity = interpolate(ringT, [0, 0.15, 0.6, 1], [0, 0.7, 0.3, 0], {
          extrapolateRight: 'clamp',
        });
        const thickness = interpolate(ringT, [0, 1], [3, 1]);

        return (
          <div key={`ring-${i}`} style={{
            position: 'absolute', left: '50%', top: '46%',
            transform: `translate(-50%, -50%) scale(${ringScale})`,
            width: 160, height: 160, borderRadius: '50%',
            border: `${thickness}px solid ${accent}`,
            opacity: ringOpacity,
            boxShadow: `0 0 12px ${accent}60, 0 0 24px ${accent}30, inset 0 0 8px ${accent}20`,
          }} />
        );
      })}

      {/* Rotating energy arcs */}
      {Array.from({ length: arcCount }, (_, i) => {
        const arcDelay = i * 5;
        const arcEntry = spring({ frame: Math.max(0, frame - arcDelay - 6), fps, config: SPRING_PRESETS.secondary });
        const arcAngle = (i / arcCount) * 360 + frame * (1.5 + i * 0.3);
        const arcRadius = 120 + i * 30;
        const arcOpacity = interpolate(arcEntry, [0, 1], [0, 0.5 + Math.sin((frame + i * 20) * 0.06) * 0.2]);

        return (
          <div key={`arc-${i}`} style={{
            position: 'absolute', left: '50%', top: '46%',
            transform: `translate(-50%, -50%) rotate(${arcAngle}deg)`,
            width: arcRadius * 2, height: arcRadius * 2,
          }}>
            <svg width={arcRadius * 2} height={arcRadius * 2} style={{ opacity: arcOpacity }}>
              <defs>
                <linearGradient id={`arc-grad-${scene.scene_number}-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={accent} stopOpacity="0" />
                  <stop offset="30%" stopColor={accent} stopOpacity="0.8" />
                  <stop offset="70%" stopColor={accent} stopOpacity="0.8" />
                  <stop offset="100%" stopColor={accent} stopOpacity="0" />
                </linearGradient>
              </defs>
              <circle
                cx={arcRadius} cy={arcRadius} r={arcRadius - 4}
                fill="none"
                stroke={`url(#arc-grad-${scene.scene_number}-${i})`}
                strokeWidth={2}
                strokeDasharray={`${arcRadius * 0.8} ${arcRadius * 5.5}`}
                style={{ filter: `drop-shadow(0 0 6px ${accent}80)` }}
              />
            </svg>
          </div>
        );
      })}

      {/* Central core */}
      <div style={{
        position: 'absolute', left: '50%', top: '46%',
        transform: `translate(-50%, -50%) scale(${corePulse})`,
        width: coreSize, height: coreSize, borderRadius: '50%',
        background: `radial-gradient(circle, ${accent}60 0%, ${accent}30 40%, ${accent}10 70%, transparent 100%)`,
        boxShadow: `0 0 30px ${accent}50, 0 0 60px ${accent}30`,
        opacity: interpolate(coreEntry, [0, 1], [0, 0.8]),
      }} />

      {/* Orbiting dots */}
      {Array.from({ length: 8 }, (_, i) => {
        const orbitDelay = i * 3;
        const orbitEntry = spring({ frame: Math.max(0, frame - orbitDelay - 4), fps, config: SPRING_PRESETS.secondary });
        const orbitAngle = (i / 8) * 360 + frame * 2;
        const orbitRadius = 70 + (i % 3) * 20;
        const rad = (orbitAngle * Math.PI) / 180;
        const ox = Math.cos(rad) * orbitRadius;
        const oy = Math.sin(rad) * orbitRadius;
        const dotSize = 4 + (i % 3) * 2;
        const dotPulse = 0.6 + Math.sin((frame + i * 10) * 0.15) * 0.4;

        return (
          <div key={`dot-${i}`} style={{
            position: 'absolute', left: '50%', top: '46%',
            transform: `translate(-50%, -50%) translate(${ox}px, ${oy}px)`,
            width: dotSize, height: dotSize, borderRadius: '50%',
            background: i % 2 === 0 ? accent : 'white',
            boxShadow: `0 0 8px ${accent}80`,
            opacity: interpolate(orbitEntry, [0, 1], [0, dotPulse]),
          }} />
        );
      })}

      {/* Keywords */}
      {keywords.map((kw, index) => {
        const delay = index * 6 + 4;
        const kwSpring = spring({ frame: Math.max(0, frame - delay), fps, config: SPRING_PRESETS.entry });
        const scale = interpolate(kwSpring, [0, 1], [0.4, 1]);
        const kwOpacity = interpolate(kwSpring, [0, 1], [0, 1]);
        const total = keywords.length;
        const positions = total === 1 ? [46] : total === 2 ? [40, 54] : [35, 46, 57];
        const topPercent = positions[index] || 46;
        const pulse = frame > delay + 12 ? 1 + Math.sin((frame - delay) * 0.07) * 0.02 : 1;

        return (
          <div key={`kw-${index}`} style={{
            position: 'absolute', left: '50%', top: `${topPercent}%`,
            transform: `translate(-50%, -50%) scale(${scale * pulse})`,
            opacity: kwOpacity, textAlign: 'center', width: '85%',
          }}>
            <span style={{
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              fontSize: total === 1 ? 110 : total === 2 ? 90 : 76,
              fontWeight: 900, color: 'white', position: 'relative',
              textShadow: `0 0 40px ${accent}AA, 0 0 80px ${accent}50, 0 4px 20px rgba(0,0,0,0.6)`,
              letterSpacing: '-2px', lineHeight: 1.2, wordBreak: 'keep-all' as const,
            }}>
              {kw}
            </span>
          </div>
        );
      })}
    </>
  );
}
