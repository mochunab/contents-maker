import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';
import { SPRING_PRESETS } from '../../constants';

/**
 * 컨페티 폭발 모션 — 중앙에서 컬러풀한 파티클이 폭발 후 중력으로 떨어짐
 * 축하/CTA/결과 씬에 최적
 */

type Particle = {
  angle: number;
  speed: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  color: string;
  shape: 'rect' | 'circle' | 'triangle';
  delay: number;
};

function generateParticles(accent: string, count: number): Particle[] {
  const colors = [
    accent,
    '#FFD93D', '#FF6B6B', '#4ECDC4', '#A8E6CF',
    '#FF8A65', '#CE93D8', '#81D4FA', '#FFF176',
  ];
  const shapes: Particle['shape'][] = ['rect', 'circle', 'triangle'];
  return Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * 360 + (Math.sin(i * 7.3) * 30),
    speed: 200 + Math.abs(Math.sin(i * 3.7)) * 300,
    size: 8 + Math.abs(Math.sin(i * 5.1)) * 16,
    rotation: Math.sin(i * 2.3) * 180,
    rotSpeed: 180 + Math.sin(i * 4.1) * 360,
    color: colors[i % colors.length],
    shape: shapes[i % shapes.length],
    delay: Math.floor(Math.abs(Math.sin(i * 1.7)) * 4),
  }));
}

export default function ConfettiBurstMotion({ scene, keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const particles = generateParticles(accent, 35);
  const GRAVITY = 600; // pixels/sec^2
  const AIR_RESISTANCE = 0.97;

  // Entry spring for keywords
  const entrySpring = spring({ frame, fps, config: SPRING_PRESETS.entry });

  // Burst trigger (starts at frame 8)
  const burstFrame = Math.max(0, frame - 8);
  const burstT = burstFrame / fps;

  // Central flash on burst
  const flashOpacity = interpolate(frame, [6, 10, 18], [0, 0.8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const mainKeyword = keywords[0] || '';

  return (
    <>
      {/* Central flash */}
      <div style={{
        position: 'absolute', left: '50%', top: '45%',
        transform: 'translate(-50%, -50%)',
        width: 600, height: 600, borderRadius: '50%',
        background: `radial-gradient(circle, white 0%, ${accent}80 30%, transparent 70%)`,
        opacity: flashOpacity,
        filter: 'blur(20px)',
      }} />

      {/* Confetti particles */}
      {particles.map((p, i) => {
        const pFrame = Math.max(0, burstFrame - p.delay);
        const t = pFrame / fps;
        if (t <= 0) return null;

        const rad = (p.angle * Math.PI) / 180;
        const vx = Math.cos(rad) * p.speed * AIR_RESISTANCE;
        const vy = Math.sin(rad) * p.speed * AIR_RESISTANCE;

        const x = vx * t * Math.pow(AIR_RESISTANCE, pFrame);
        const y = vy * t + 0.5 * GRAVITY * t * t;
        const rot = p.rotation + p.rotSpeed * t;

        // Fade out as particles fall off screen
        const fadeOut = interpolate(y, [0, 800, 1200], [1, 0.8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const entryFade = interpolate(t, [0, 0.08], [0, 1], { extrapolateRight: 'clamp' });
        const opacity = fadeOut * entryFade;

        if (opacity <= 0.01) return null;

        const style: React.CSSProperties = {
          position: 'absolute',
          left: '50%', top: '45%',
          transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rot}deg)`,
          opacity,
          filter: `drop-shadow(0 0 4px ${p.color}80)`,
        };

        if (p.shape === 'rect') {
          return (
            <div key={i} style={{
              ...style, width: p.size, height: p.size * 0.6,
              borderRadius: 2, background: p.color,
            }} />
          );
        }
        if (p.shape === 'circle') {
          return (
            <div key={i} style={{
              ...style, width: p.size, height: p.size,
              borderRadius: '50%', background: p.color,
            }} />
          );
        }
        // triangle
        return (
          <div key={i} style={{
            ...style, width: 0, height: 0,
            borderLeft: `${p.size / 2}px solid transparent`,
            borderRight: `${p.size / 2}px solid transparent`,
            borderBottom: `${p.size}px solid ${p.color}`,
            background: 'transparent', filter: 'none',
          }} />
        );
      })}

      {/* Keywords */}
      {keywords.map((kw, index) => {
        const delay = index * 5;
        const kwSpring = spring({ frame: Math.max(0, frame - delay), fps, config: SPRING_PRESETS.bouncy });
        const scale = interpolate(kwSpring, [0, 1], [0.2, 1]);
        const kwOpacity = interpolate(kwSpring, [0, 1], [0, 1]);
        const total = keywords.length;
        const positions = total === 1 ? [48] : total === 2 ? [42, 56] : [36, 48, 60];
        const topPercent = positions[index] || 48;
        const pulse = frame > delay + 15 ? 1 + Math.sin((frame - delay) * 0.06) * 0.02 : 1;

        return (
          <div key={`kw-${index}`} style={{
            position: 'absolute', left: '50%', top: `${topPercent}%`,
            transform: `translate(-50%, -50%) scale(${scale * pulse})`,
            opacity: kwOpacity, textAlign: 'center', width: '85%',
          }}>
            {/* Glow behind text */}
            <div style={{
              position: 'absolute', left: '50%', top: '50%',
              width: '130%', height: '200%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(ellipse, ${accent}30 0%, ${accent}10 40%, transparent 70%)`,
              borderRadius: '50%', filter: 'blur(25px)',
            }} />
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
