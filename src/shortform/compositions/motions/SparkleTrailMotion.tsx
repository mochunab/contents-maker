import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';
import { SPRING_PRESETS } from '../../constants';

/**
 * 스파클 트레일 모션 — 빛나는 궤적이 곡선을 따라 이동하며 키워드를 밝힘
 * 솔루션/팁/긍정 씬에 최적
 */

type Trail = {
  points: { x: number; y: number }[];
  color: string;
  delay: number;
  sparkleCount: number;
};

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function generateTrails(accent: string): Trail[] {
  return [
    {
      points: [
        { x: -10, y: 70 }, { x: 20, y: 30 },
        { x: 60, y: 20 }, { x: 50, y: 50 },
      ],
      color: accent,
      delay: 0,
      sparkleCount: 12,
    },
    {
      points: [
        { x: 110, y: 65 }, { x: 80, y: 25 },
        { x: 40, y: 35 }, { x: 50, y: 50 },
      ],
      color: '#FFD93D',
      delay: 4,
      sparkleCount: 10,
    },
    {
      points: [
        { x: 50, y: 95 }, { x: 30, y: 70 },
        { x: 70, y: 40 }, { x: 50, y: 50 },
      ],
      color: '#81D4FA',
      delay: 8,
      sparkleCount: 8,
    },
  ];
}

function StarShape({ size, color, opacity, glow }: { size: number; color: string; opacity: number; glow: number }) {
  const points = 4;
  const outerR = size;
  const innerR = size * 0.4;
  const path = Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    return `${r * Math.cos(angle) + outerR},${r * Math.sin(angle) + outerR}`;
  }).join(' ');

  return (
    <svg width={outerR * 2} height={outerR * 2} style={{ opacity, filter: `drop-shadow(0 0 ${glow}px ${color})` }}>
      <polygon points={path} fill={color} />
    </svg>
  );
}

export default function SparkleTrailMotion({ scene, keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const trails = generateTrails(accent);

  return (
    <>
      {/* Trail paths and sparkles */}
      {trails.map((trail, ti) => {
        const tFrame = Math.max(0, frame - trail.delay);
        const trailProgress = interpolate(tFrame, [0, fps * 1.2], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });

        if (trailProgress <= 0) return null;

        // Draw trail as fading line segments
        const segments = 20;
        const trailElements = Array.from({ length: segments }, (_, si) => {
          const segT = si / segments;
          if (segT > trailProgress) return null;

          const x = cubicBezier(segT, trail.points[0].x, trail.points[1].x, trail.points[2].x, trail.points[3].x);
          const y = cubicBezier(segT, trail.points[0].y, trail.points[1].y, trail.points[2].y, trail.points[3].y);

          const age = (trailProgress - segT) * 3;
          const segOpacity = interpolate(age, [0, 0.5, 2], [0.8, 0.4, 0], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });

          return (
            <div key={`seg-${si}`} style={{
              position: 'absolute',
              left: `${x}%`, top: `${y}%`,
              width: 6, height: 6, borderRadius: '50%',
              background: trail.color,
              boxShadow: `0 0 8px ${trail.color}, 0 0 16px ${trail.color}80`,
              opacity: segOpacity,
              transform: 'translate(-50%, -50%)',
            }} />
          );
        });

        // Sparkles along the trail
        const sparkleElements = Array.from({ length: trail.sparkleCount }, (_, si) => {
          const sparkleT = si / trail.sparkleCount;
          const sparkleDelay = sparkleT * 1.2; // seconds
          const sparkleFrame = Math.max(0, tFrame - sparkleDelay * fps);
          const sparkleProgress = Math.min(sparkleFrame / (fps * 0.5), 1);

          if (sparkleProgress <= 0) return null;

          const x = cubicBezier(Math.min(sparkleT, trailProgress), trail.points[0].x, trail.points[1].x, trail.points[2].x, trail.points[3].x);
          const y = cubicBezier(Math.min(sparkleT, trailProgress), trail.points[0].y, trail.points[1].y, trail.points[2].y, trail.points[3].y);

          const sparkleOpacity = interpolate(sparkleProgress, [0, 0.3, 0.7, 1], [0, 1, 0.6, 0], {
            extrapolateRight: 'clamp',
          });
          const sparkleScale = interpolate(sparkleProgress, [0, 0.3, 1], [0.3, 1.2, 0.5], {
            extrapolateRight: 'clamp',
          });
          const sparkleRot = sparkleProgress * 90;

          // Offset from trail
          const offsetX = Math.sin(si * 2.7) * 3;
          const offsetY = Math.cos(si * 3.1) * 3;

          return (
            <div key={`sparkle-${si}`} style={{
              position: 'absolute',
              left: `${x + offsetX}%`, top: `${y + offsetY}%`,
              transform: `translate(-50%, -50%) scale(${sparkleScale}) rotate(${sparkleRot}deg)`,
            }}>
              <StarShape
                size={6 + Math.abs(Math.sin(si * 1.3)) * 6}
                color={si % 2 === 0 ? trail.color : '#FFFFFF'}
                opacity={sparkleOpacity}
                glow={8 + sparkleOpacity * 12}
              />
            </div>
          );
        });

        // Lead sparkle (bright head of trail)
        const headX = cubicBezier(trailProgress, trail.points[0].x, trail.points[1].x, trail.points[2].x, trail.points[3].x);
        const headY = cubicBezier(trailProgress, trail.points[0].y, trail.points[1].y, trail.points[2].y, trail.points[3].y);
        const headPulse = 1 + Math.sin(frame * 0.15) * 0.3;

        return (
          <div key={`trail-${ti}`}>
            {trailElements}
            {sparkleElements}
            {/* Lead sparkle */}
            {trailProgress < 0.98 && (
              <div style={{
                position: 'absolute',
                left: `${headX}%`, top: `${headY}%`,
                transform: `translate(-50%, -50%) scale(${headPulse})`,
                width: 20, height: 20, borderRadius: '50%',
                background: `radial-gradient(circle, white 0%, ${trail.color} 40%, transparent 70%)`,
                boxShadow: `0 0 20px ${trail.color}, 0 0 40px ${trail.color}80, 0 0 60px ${trail.color}40`,
              }} />
            )}
          </div>
        );
      })}

      {/* Ambient sparkle dust */}
      {Array.from({ length: 8 }, (_, i) => {
        const x = 10 + (Math.sin(i * 4.3) * 0.5 + 0.5) * 80;
        const y = 15 + (Math.cos(i * 3.7) * 0.5 + 0.5) * 70;
        const twinkle = Math.sin((frame + i * 20) * 0.12) * 0.5 + 0.5;
        const drift = Math.sin((frame + i * 15) * 0.02) * 8;

        return (
          <div key={`dust-${i}`} style={{
            position: 'absolute',
            left: `${x}%`, top: `${y}%`,
            transform: `translate(-50%, -50%) translateY(${drift}px)`,
            width: 4, height: 4, borderRadius: '50%',
            background: i % 3 === 0 ? accent : '#FFFFFF',
            opacity: twinkle * 0.4,
            boxShadow: `0 0 6px ${accent}60`,
          }} />
        );
      })}

      {/* Keywords */}
      {keywords.map((kw, index) => {
        const delay = index * 6 + 15; // after trails converge
        const kwSpring = spring({ frame: Math.max(0, frame - delay), fps, config: SPRING_PRESETS.keyword });
        const scale = interpolate(kwSpring, [0, 1], [0.5, 1]);
        const kwOpacity = interpolate(kwSpring, [0, 1], [0, 1]);
        const total = keywords.length;
        const positions = total === 1 ? [48] : total === 2 ? [43, 55] : [37, 48, 59];
        const topPercent = positions[index] || 48;
        const shimmer = Math.sin((frame - delay) * 0.08) * 0.03;

        return (
          <div key={`kw-${index}`} style={{
            position: 'absolute', left: '50%', top: `${topPercent}%`,
            transform: `translate(-50%, -50%) scale(${scale + shimmer})`,
            opacity: kwOpacity, textAlign: 'center', width: '85%',
          }}>
            <div style={{
              position: 'absolute', left: '50%', top: '50%',
              width: '120%', height: '200%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(ellipse, ${accent}20 0%, transparent 60%)`,
              borderRadius: '50%', filter: 'blur(30px)',
            }} />
            <span style={{
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              fontSize: total === 1 ? 110 : total === 2 ? 90 : 76,
              fontWeight: 900, color: 'white', position: 'relative',
              textShadow: `0 0 30px ${accent}90, 0 0 60px ${accent}40, 0 3px 16px rgba(0,0,0,0.5)`,
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
