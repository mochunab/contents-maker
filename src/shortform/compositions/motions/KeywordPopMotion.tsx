import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

export default function KeywordPopMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background glow orbs
  const orbs = [
    { x: 25, y: 30, size: 280, color: accent, delay: 0 },
    { x: 70, y: 60, size: 220, color: accent, delay: 10 },
    { x: 50, y: 80, size: 200, color: '#ffffff', delay: 5 },
  ];

  return (
    <>
      {/* Ambient glow orbs */}
      {orbs.map((orb, i) => {
        const drift = Math.sin((frame + orb.delay) * 0.03) * 15;
        const pulse = 0.5 + Math.sin((frame + orb.delay * 3) * 0.05) * 0.2;
        return (
          <div key={`orb-${i}`} style={{
            position: 'absolute',
            left: `${orb.x}%`, top: `${orb.y}%`,
            width: orb.size, height: orb.size,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${orb.color}18 0%, transparent 70%)`,
            transform: `translate(-50%, -50%) translateY(${drift}px)`,
            opacity: pulse,
            filter: 'blur(40px)',
          }} />
        );
      })}

      {keywords.map((kw, index) => {
        const delay = index * 6;
        const entrySpring = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 12, mass: 0.8 } });
        const scale = interpolate(entrySpring, [0, 1], [0.3, 1]);
        const opacity = interpolate(entrySpring, [0, 1], [0, 1]);
        const translateY = interpolate(entrySpring, [0, 1], [60, 0]);
        const total = keywords.length;
        const positions = total === 1 ? [50] : total === 2 ? [42, 58] : [35, 50, 65];
        const topPercent = positions[index] || 50;
        const pulse = frame > delay + 15 ? 1 + Math.sin((frame - delay) * 0.08) * 0.03 : 1;
        const entered = entrySpring > 0.5;

        // Particle positions for burst effect
        const particles = [
          { angle: -40, dist: 80 },
          { angle: 30, dist: 100 },
          { angle: 160, dist: 90 },
          { angle: 220, dist: 75 },
        ];

        return (
          <div key={index} style={{
            position: 'absolute', left: '50%', top: `${topPercent}%`,
            transform: `translate(-50%, -50%) perspective(800px) rotateX(${interpolate(entrySpring, [0, 1], [15, 0])}deg) scale(${scale * pulse}) translateY(${translateY}px)`,
            opacity, textAlign: 'center', width: '85%',
          }}>
            {/* Gradient glow blob behind text */}
            <div style={{
              position: 'absolute', left: '50%', top: '50%',
              width: '120%', height: '180%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(ellipse, ${accent}25 0%, ${accent}10 40%, transparent 70%)`,
              borderRadius: '50%',
              filter: 'blur(20px)',
            }} />

            {/* Burst particles */}
            {entered && particles.map((p, pi) => {
              const particleFrame = Math.max(0, frame - delay - 12);
              const pProgress = Math.min(particleFrame / 20, 1);
              const rad = (p.angle * Math.PI) / 180;
              const px = Math.cos(rad) * p.dist * pProgress;
              const py = Math.sin(rad) * p.dist * pProgress;
              const pOpacity = interpolate(pProgress, [0, 0.3, 1], [0, 1, 0]);
              const pScale = interpolate(pProgress, [0, 0.5, 1], [0.5, 1, 0.3]);
              return (
                <div key={`p-${pi}`} style={{
                  position: 'absolute', left: '50%', top: '50%',
                  width: 10, height: 10,
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${accent} 0%, transparent 70%)`,
                  boxShadow: `0 0 12px ${accent}80`,
                  transform: `translate(-50%, -50%) translate(${px}px, ${py}px) scale(${pScale})`,
                  opacity: pOpacity,
                }} />
              );
            })}

            <span style={{
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              fontSize: total === 1 ? 120 : total === 2 ? 96 : 80,
              fontWeight: 900, color: 'white',
              textShadow: `0 0 60px ${accent}80, 0 0 120px ${accent}40, 0 4px 20px rgba(0,0,0,0.6), 0 0 8px rgba(255,255,255,0.3)`,
              letterSpacing: '-2px', lineHeight: 1.2, wordBreak: 'keep-all' as const,
              position: 'relative' as const,
            }}>
              {kw}
            </span>
          </div>
        );
      })}
    </>
  );
}
