import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

export default function WaveMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const entrySpring = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const opacity = interpolate(entrySpring, [0, 1], [0, 1]);

  const mainText = keywords.join(' ');
  const chars = mainText.split('');

  // Background wave SVG paths
  const waveOffset = frame * 1.5;
  const wavePaths = [
    { yBase: 75, amplitude: 8, frequency: 0.008, speed: 1, opacity: 0.08 },
    { yBase: 65, amplitude: 6, frequency: 0.012, speed: 1.4, opacity: 0.05 },
    { yBase: 85, amplitude: 10, frequency: 0.006, speed: 0.8, opacity: 0.06 },
  ];

  // Bubble particles rising upward
  const bubbleCount = 12;
  const bubbles = Array.from({ length: bubbleCount }, (_, i) => {
    const seed = i * 137.5;
    const x = (Math.sin(seed) * 0.5 + 0.5) * 100;
    const speed = 0.5 + (i % 4) * 0.3;
    const rawY = 110 - ((frame * speed + seed * 3) % 140);
    const size = 4 + (i % 3) * 3;
    const bubbleOpacity = rawY > 0 && rawY < 100 ? 0.15 + Math.sin(frame * 0.1 + i) * 0.1 : 0;
    const wobbleX = Math.sin(frame * 0.05 + i * 2) * 8;
    return { x: x + wobbleX, y: rawY, size, opacity: bubbleOpacity };
  });

  return (
    <div style={{
      position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
      opacity,
    }}>
      {/* Background wave gradients */}
      <svg style={{
        position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 0,
      }} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {wavePaths.map((wave, wi) => {
          const yScale = height / 100;
          const points: string[] = [];
          for (let x = 0; x <= width; x += 20) {
            const y = wave.yBase * yScale +
              Math.sin((x * wave.frequency) + (waveOffset * wave.speed * 0.05)) * wave.amplitude * yScale +
              Math.sin((x * wave.frequency * 1.5) + (waveOffset * wave.speed * 0.03) + 1) * wave.amplitude * 8;
            points.push(`${x},${y}`);
          }
          const d = `M0,${height} L${points.map(p => `${p}`).join(' L')} L${width},${height} Z`;
          return (
            <path key={wi} d={d} fill={accent} opacity={wave.opacity} />
          );
        })}
      </svg>

      {/* Bubble particles */}
      {bubbles.map((bubble, i) => (
        <div key={`bubble-${i}`} style={{
          position: 'absolute',
          left: `${bubble.x}%`,
          top: `${bubble.y}%`,
          width: bubble.size,
          height: bubble.size,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accent}CC 0%, ${accent}40 60%, transparent 100%)`,
          boxShadow: `0 0 ${bubble.size * 2}px ${accent}40`,
          opacity: bubble.opacity,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Character wave text */}
      <div style={{
        position: 'absolute', left: '50%', top: '48%',
        transform: 'translate(-50%, -50%)',
        width: '85%', textAlign: 'center',
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
        gap: 0, zIndex: 1,
      }}>
        {chars.map((char, i) => {
          // Slower, smoother wave
          const waveY = Math.sin((frame * 0.07) + i * 0.5) * 18;
          const waveRotate = Math.sin((frame * 0.05) + i * 0.4) * 4;

          // Stagger entry
          const charDelay = i * 2;
          const charSpring = spring({ frame: Math.max(0, frame - charDelay), fps, config: { damping: 12, mass: 0.5 } });
          const charScale = interpolate(charSpring, [0, 1], [0, 1]);
          const charOpacity = interpolate(charSpring, [0, 1], [0, 1]);

          // Slower hue shift
          const hueShift = ((i * 15) + frame * 0.8) % 360;
          const isSpace = char === ' ';

          // Glow trail (ghost of previous wave position)
          const ghostY = Math.sin((frame * 0.07 - 0.3) + i * 0.5) * 18;

          return (
            <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
              {/* Glow trail / ghost */}
              <span style={{
                position: 'absolute', left: 0, top: 0,
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                fontSize: keywords.length === 1 ? 100 : 72,
                fontWeight: 900,
                color: accent,
                transform: `translateY(${ghostY}px) rotate(${waveRotate * 0.7}deg) scale(${charScale})`,
                opacity: charOpacity * 0.2,
                filter: 'blur(6px)',
                letterSpacing: '-1px',
                lineHeight: 1.3,
                minWidth: isSpace ? 20 : undefined,
                pointerEvents: 'none',
              }}>
                {isSpace ? '\u00A0' : char}
              </span>
              {/* Main character */}
              <span style={{
                display: 'inline-block',
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                fontSize: keywords.length === 1 ? 100 : 72,
                fontWeight: 900,
                color: 'white',
                textShadow: `0 0 30px ${accent}50, 0 0 60px ${accent}25, 0 4px 16px rgba(0,0,0,0.4)`,
                transform: `translateY(${waveY}px) rotate(${waveRotate}deg) scale(${charScale})`,
                opacity: charOpacity,
                letterSpacing: '-1px',
                lineHeight: 1.3,
                minWidth: isSpace ? 20 : undefined,
                filter: `hue-rotate(${hueShift * 0.08}deg)`,
              }}>
                {isSpace ? '\u00A0' : char}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
