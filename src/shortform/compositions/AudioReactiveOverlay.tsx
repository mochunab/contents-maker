import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

type AudioReactiveOverlayProps = {
  ttsSrc?: string;
  bgmSrc?: string;
  accentColor?: string;
  glowColor?: string;
};

/**
 * 프레임 기반 시뮬레이션 오디오 리액티브 오버레이.
 * Remotion useWindowedAudioData는 data URL / Content-Length 이슈가 있어서
 * 순수 수학 기반 펄스 애니메이션으로 대체.
 * 시각적으로 동일한 효과 (글로우 펄스 + 비트 플래시 + 웨이브폼 + 엣지 글로우).
 */
export default function AudioReactiveOverlay({
  ttsSrc,
  bgmSrc,
  accentColor = '#FF6B6B',
  glowColor = '#ff6b6b',
}: AudioReactiveOverlayProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 오디오 소스 없으면 렌더링 안 함
  if (!ttsSrc && !bgmSrc) return null;

  const t = frame / fps; // 초 단위 시간

  // 시뮬레이션 주파수 데이터 (수학 기반, 자연스러운 펄스)
  const bass = 0.3 + 0.25 * Math.sin(t * 2.1) + 0.15 * Math.sin(t * 3.7 + 1.2);
  const mid = 0.25 + 0.2 * Math.sin(t * 3.3 + 0.8) + 0.1 * Math.cos(t * 5.1);
  const high = 0.2 + 0.15 * Math.sin(t * 5.7 + 2.1) + 0.1 * Math.cos(t * 7.3);
  const overall = (bass + mid + high) / 3;

  // Glow scale: 1.0 → 1.5 based on bass
  const glowScale = 1 + Math.max(0, bass) * 0.5;
  const glowOpacity = 0.08 + Math.max(0, bass) * 0.12;

  // Beat flash: pulse on strong bass peaks
  const flashOpacity = bass > 0.55 ? (bass - 0.55) * 0.25 : 0;

  // Waveform bars (16개, 2의 거듭제곱)
  const barCount = 16;
  const barData = Array.from({ length: barCount }, (_, i) => {
    const phase = (i / barCount) * Math.PI * 2;
    return Math.max(0.05, 0.3 + 0.25 * Math.sin(t * 3.5 + phase) + 0.15 * Math.cos(t * 2.3 + phase * 1.5));
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Bass-reactive center glow */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '45%',
        width: 600,
        height: 600,
        transform: `translate(-50%, -50%) scale(${glowScale})`,
        background: `radial-gradient(circle, ${glowColor}${Math.round(glowOpacity * 255).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
      }} />

      {/* Beat flash overlay */}
      {flashOpacity > 0 && (
        <AbsoluteFill style={{
          backgroundColor: `${accentColor}${Math.round(flashOpacity * 255).toString(16).padStart(2, '0')}`,
          mixBlendMode: 'overlay',
        }} />
      )}

      {/* Bottom waveform bars */}
      <div style={{
        position: 'absolute',
        bottom: 260,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 5,
        alignItems: 'flex-end',
        height: 60,
        opacity: 0.2 + overall * 0.3,
      }}>
        {barData.map((val, i) => (
          <div
            key={i}
            style={{
              width: 4,
              height: Math.max(3, val * 55),
              backgroundColor: i < barCount / 3 ? glowColor : i < (barCount * 2) / 3 ? accentColor : `${accentColor}99`,
              borderRadius: 2,
              boxShadow: `0 0 ${Math.round(val * 8)}px ${glowColor}40`,
            }}
          />
        ))}
      </div>

      {/* Edge glow pulse */}
      <AbsoluteFill style={{
        boxShadow: `inset 0 0 ${80 + mid * 60}px ${20 + mid * 20}px ${glowColor}${Math.round((0.03 + mid * 0.05) * 255).toString(16).padStart(2, '0')}`,
      }} />

      {/* High-frequency sparkle */}
      {high > 0.3 && (
        <>
          <div style={{
            position: 'absolute',
            top: 120 + Math.sin(frame * 0.3) * 20,
            right: 100 + Math.cos(frame * 0.2) * 15,
            width: 4 + high * 6,
            height: 4 + high * 6,
            borderRadius: '50%',
            backgroundColor: accentColor,
            opacity: (high - 0.3) * 1.2,
            boxShadow: `0 0 ${high * 20}px ${high * 8}px ${accentColor}40`,
          }} />
          <div style={{
            position: 'absolute',
            top: 200 + Math.cos(frame * 0.25) * 25,
            left: 80 + Math.sin(frame * 0.18) * 20,
            width: 3 + high * 5,
            height: 3 + high * 5,
            borderRadius: '50%',
            backgroundColor: glowColor,
            opacity: (high - 0.3) * 0.8,
            boxShadow: `0 0 ${high * 15}px ${high * 6}px ${glowColor}30`,
          }} />
        </>
      )}
    </AbsoluteFill>
  );
}
