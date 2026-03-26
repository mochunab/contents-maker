import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { MotionComponentProps } from './types';

export default function TypewriterMotion({ scene, accent }: MotionComponentProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const text = scene.subtitle.replace(/\*\*/g, '');
  const charsPerFrame = 1.2;
  const visibleChars = Math.min(Math.floor(frame * charsPerFrame), text.length);
  const displayText = text.slice(0, visibleChars);
  const showCursor = frame % 16 < 10;
  const typing = visibleChars < text.length;

  const entryOpacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  const entryScale = interpolate(frame, [0, 8], [0.95, 1], { extrapolateRight: 'clamp' });

  // Scanline effect
  const scanlineY = (frame * 3) % 200;

  return (
    <div style={{
      position: 'absolute', left: '50%', top: '45%',
      transform: `translate(-50%, -50%) scale(${entryScale})`,
      width: '82%', opacity: entryOpacity,
    }}>
      {/* Terminal frame */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(20,20,35,0.92) 0%, rgba(30,30,50,0.88) 100%)',
        borderRadius: 20,
        border: '1.5px solid',
        borderImage: `linear-gradient(135deg, ${accent}50, ${accent}20, ${accent}50) 1`,
        boxShadow: `0 0 40px ${accent}15, 0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`,
        padding: '0',
        overflow: 'hidden',
        position: 'relative' as const,
      }}>
        {/* Title bar with colored dots */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{ width: 13, height: 13, borderRadius: '50%', background: '#FF5F57', boxShadow: '0 0 8px #FF5F5740' }} />
          <div style={{ width: 13, height: 13, borderRadius: '50%', background: '#FFBD2E', boxShadow: '0 0 8px #FFBD2E40' }} />
          <div style={{ width: 13, height: 13, borderRadius: '50%', background: '#28C840', boxShadow: '0 0 8px #28C84040' }} />
          <span style={{
            marginLeft: 12,
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.3)',
            letterSpacing: '0.5px',
          }}>nadaunse.sh</span>
        </div>

        {/* Content area */}
        <div style={{ padding: '28px 24px 32px', position: 'relative' as const }}>
          {/* Scanline overlay */}
          <div style={{
            position: 'absolute', left: 0, right: 0,
            top: scanlineY, height: 2,
            background: `linear-gradient(90deg, transparent 0%, ${accent}08 30%, ${accent}12 50%, ${accent}08 70%, transparent 100%)`,
            pointerEvents: 'none' as const,
          }} />

          {/* Prompt prefix */}
          <span style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 18, fontWeight: 600, color: accent,
            opacity: 0.6,
          }}>{'> '}</span>

          {/* Typed text */}
          <span style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 64, fontWeight: 800, color: 'white',
            textShadow: `0 0 30px ${accent}40, 0 0 60px ${accent}20, 0 4px 16px rgba(0,0,0,0.5)`,
            lineHeight: 1.3, wordBreak: 'keep-all' as const, letterSpacing: '-1px',
          }}>
            {displayText}
          </span>

          {/* Glowing cursor */}
          {typing && (
            <span style={{
              display: 'inline-block',
              width: 4, height: '1.1em',
              verticalAlign: 'text-bottom',
              marginLeft: 2,
              background: accent,
              borderRadius: 2,
              opacity: showCursor ? 1 : 0,
              boxShadow: `0 0 16px ${accent}90, 0 0 32px ${accent}50, 0 0 48px ${accent}30`,
              transition: 'opacity 0.05s',
            }} />
          )}
        </div>

        {/* Bottom status bar */}
        <div style={{
          padding: '8px 18px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          background: 'rgba(0,0,0,0.15)',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 12, color: 'rgba(255,255,255,0.2)',
          }}>
            {visibleChars}/{text.length} chars
          </span>
          <span style={{
            fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
            fontSize: 12, color: accent, opacity: 0.4,
          }}>
            {typing ? 'typing...' : 'done'}
          </span>
        </div>
      </div>
    </div>
  );
}
