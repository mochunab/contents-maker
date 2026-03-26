import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

const DEFAULT_EMOJIS = ['✨', '🔥', '💫', '⭐', '🎯'];
const EMOJI_COUNT = 24;

// Deterministic pseudo-random based on index
const seeded = (i: number, offset = 0) => {
  const x = Math.sin((i + 1) * 9301 + offset * 4967) * 49297;
  return x - Math.floor(x);
};

// Pre-compute emoji positions for consistent rendering
const emojiData = Array.from({ length: EMOJI_COUNT }, (_, i) => ({
  x: seeded(i, 0) * 100,          // % position
  speed: 0.6 + seeded(i, 1) * 0.8, // fall speed multiplier
  size: 28 + seeded(i, 2) * 32,    // font size
  delay: seeded(i, 3) * 30,        // frame delay
  wobblePhase: seeded(i, 4) * Math.PI * 2,
  rotation: seeded(i, 5) * 360,
  emojiIdx: Math.floor(seeded(i, 6) * 100),
}));

export default function EmojiRainMotion({ scene, keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const emojis = scene.icon ? [scene.icon] : DEFAULT_EMOJIS;

  // Center text animation
  const textSpring = spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 12, mass: 1 } });
  const textOpacity = interpolate(textSpring, [0, 1], [0, 1]);
  const textScale = interpolate(textSpring, [0, 1], [0.5, 1]);

  const mainKeyword = keywords[0] || '';

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* Emoji rain particles */}
      {emojiData.map((data, i) => {
        const emoji = emojis[data.emojiIdx % emojis.length];
        const adjustedFrame = Math.max(0, frame - data.delay);
        const fallDistance = adjustedFrame * data.speed * 3.5;
        const yPos = -60 + fallDistance;

        // Sine wave wobble
        const wobbleX = Math.sin(adjustedFrame * 0.07 + data.wobblePhase) * 25;
        const rot = data.rotation + adjustedFrame * (data.speed > 1 ? 2 : -1.5);

        // Fade out at bottom
        const opacity = yPos > 1000 ? interpolate(yPos, [1000, 1150], [1, 0], { extrapolateRight: 'clamp' }) :
                        yPos < 0 ? 0 : 1;

        return (
          <div key={i} style={{
            position: 'absolute',
            left: `${data.x}%`,
            top: yPos,
            transform: `translateX(${wobbleX}px) rotate(${rot}deg)`,
            fontSize: data.size,
            opacity: opacity * 0.85,
            pointerEvents: 'none',
            willChange: 'transform',
          }}>
            {emoji}
          </div>
        );
      })}

      {/* Center keyword text */}
      <div style={{
        position: 'absolute', left: '50%', top: '48%',
        transform: `translate(-50%, -50%) scale(${textScale})`,
        opacity: textOpacity,
        textAlign: 'center', width: '85%', zIndex: 10,
      }}>
        <span style={{
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
          fontSize: keywords.length === 1 ? 110 : 85,
          fontWeight: 900, color: 'white',
          textShadow: `0 0 60px ${accent}80, 0 0 30px ${accent}50, 0 6px 24px rgba(0,0,0,0.7)`,
          letterSpacing: '-2px', lineHeight: 1.2, wordBreak: 'keep-all',
        }}>
          {mainKeyword}
        </span>
        {keywords.length > 1 && (
          <div style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 52, fontWeight: 700, color: accent,
            textShadow: `0 0 20px ${accent}40, 0 2px 12px rgba(0,0,0,0.4)`,
            marginTop: 16,
          }}>
            {keywords.slice(1).join(' ')}
          </div>
        )}
      </div>

      {/* Bottom gradient fade for emoji disappearing */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 120,
        background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}
