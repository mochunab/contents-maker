import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

export default function ZoomImpactMotion({ keywords, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mainKeyword = keywords[0] || '';
  const subKeywords = keywords.slice(1);

  // Dramatic zoom from very large to normal
  const zoomSpring = spring({ frame, fps, config: { damping: 8, mass: 1.5 } });
  const scale = interpolate(zoomSpring, [0, 1], [4, 1]);
  const opacity = interpolate(zoomSpring, [0, 0.3, 1], [0, 1, 1]);

  // Damped shake after landing (exponential decay)
  const shakePhase = frame - 15;
  const shake = shakePhase > 0 && shakePhase < 20
    ? Math.sin(shakePhase * 2.5) * Math.exp(-shakePhase * 0.18) * 16
    : 0;
  const shakeY = shakePhase > 0 && shakePhase < 20
    ? Math.cos(shakePhase * 3) * Math.exp(-shakePhase * 0.22) * 8
    : 0;

  // Subtle breath after settling
  const breath = frame > 30 ? 1 + Math.sin(frame * 0.06) * 0.015 : 1;

  // Camera flash on impact
  const flashOpacity = interpolate(frame, [8, 12, 16], [0, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Multiple shockwave rings with staggered timing
  const ringCount = 3;
  const rings = Array.from({ length: ringCount }, (_, i) => {
    const ringDelay = 5 + i * 5;
    const ringSpring = spring({ frame: Math.max(0, frame - ringDelay), fps, config: { damping: 20, mass: 0.3 } });
    const ringScale = interpolate(ringSpring, [0, 1], [0, 3 + i * 0.8]);
    const ringOpacity = interpolate(ringSpring, [0, 0.4, 1], [0, 0.6 - i * 0.15, 0]);
    return { scale: ringScale, opacity: ringOpacity };
  });

  // Afterimage / ghost copies
  const ghostCount = 3;
  const ghosts = Array.from({ length: ghostCount }, (_, i) => {
    const ghostDelay = 2 + i * 3;
    const ghostFrame = Math.max(0, frame - ghostDelay);
    const ghostZoom = spring({ frame: ghostFrame, fps, config: { damping: 8, mass: 1.5 } });
    const ghostScale = interpolate(ghostZoom, [0, 1], [4, 1]) * breath;
    const ghostOpacity = interpolate(frame, [10, 25], [0.3 - i * 0.08, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return { scale: ghostScale, opacity: ghostOpacity };
  });

  return (
    <div style={{
      position: 'absolute', left: '50%', top: '48%',
      transform: 'translate(-50%, -50%)',
      width: '90%', textAlign: 'center',
    }}>
      {/* Camera flash overlay */}
      <div style={{
        position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
        backgroundColor: 'white',
        opacity: flashOpacity,
        pointerEvents: 'none',
        zIndex: 100,
      }} />

      {/* Multiple impact rings */}
      {rings.map((ring, i) => (
        <div key={`ring-${i}`} style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: `translate(-50%, -50%) scale(${ring.scale})`,
          width: 200, height: 200, borderRadius: '50%',
          border: `${3 - i}px solid ${accent}`,
          opacity: ring.opacity,
          boxShadow: `0 0 15px ${accent}60, 0 0 30px ${accent}30`,
        }} />
      ))}

      {/* Ghost afterimages */}
      {ghosts.map((ghost, i) => (
        <div key={`ghost-${i}`} style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: `translate(-50%, -50%) scale(${ghost.scale})`,
          opacity: ghost.opacity,
          filter: `blur(${2 + i * 2}px)`,
          width: '100%', textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 120, fontWeight: 900, color: accent,
            letterSpacing: '-3px', lineHeight: 1, wordBreak: 'keep-all',
          }}>
            {mainKeyword}
          </span>
        </div>
      ))}

      {/* Main keyword */}
      <div style={{
        transform: `scale(${scale * breath}) translate(${shake}px, ${shakeY}px)`,
        opacity,
      }}>
        <span style={{
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
          fontSize: 120, fontWeight: 900, color: 'white',
          textShadow: `0 0 40px ${accent}70, 0 0 80px ${accent}40, 0 6px 24px rgba(0,0,0,0.6)`,
          letterSpacing: '-3px', lineHeight: 1, wordBreak: 'keep-all',
        }}>
          {mainKeyword}
        </span>
      </div>

      {/* Sub keywords */}
      {subKeywords.map((kw, i) => {
        const subSpring = spring({ frame: Math.max(0, frame - 20 - i * 6), fps, config: { damping: 12 } });
        return (
          <div key={i} style={{
            marginTop: 20,
            opacity: interpolate(subSpring, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(subSpring, [0, 1], [30, 0])}px)`,
          }}>
            <span style={{
              fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
              fontSize: 64, fontWeight: 700, color: accent,
              textShadow: `0 0 20px ${accent}50, 0 2px 12px rgba(0,0,0,0.3)`,
            }}>
              {kw}
            </span>
          </div>
        );
      })}
    </div>
  );
}
