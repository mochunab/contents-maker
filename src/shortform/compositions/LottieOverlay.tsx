import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Lottie } from '@remotion/lottie';
import { useEffect, useState } from 'react';
import type { LottieOverlayType, LottieOverlayPosition } from '../lottie';
import { loadLottieData } from '../lottie';

type Props = {
  type: LottieOverlayType;
  /** 투명도 (0~1, 기본 0.25) */
  opacity?: number;
  /** 위치 프리셋 */
  position?: LottieOverlayPosition;
  /** 스케일 배율 (기본 1) */
  scale?: number;
};

const POSITION_STYLES: Record<LottieOverlayPosition, React.CSSProperties> = {
  full: {},
  center: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  top: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    paddingTop: '10%',
  },
  bottom: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    paddingBottom: '25%',
  },
};

export default function LottieOverlay({
  type,
  opacity = 0.25,
  position = 'center',
  scale = 1,
}: Props) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    loadLottieData(type)
      .then(setAnimationData)
      .catch(() => { /* 로드 실패 시 오버레이 없이 계속 */ });
  }, [type]);

  if (!animationData) return null;

  // 페이드인 (10프레임) + 페이드아웃 (10프레임)
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const posStyle = POSITION_STYLES[position];

  return (
    <AbsoluteFill style={{
      ...posStyle,
      opacity: fadeIn * fadeOut * opacity,
      pointerEvents: 'none',
    }}>
      <div style={{
        width: position === 'full' ? '100%' : '60%',
        height: position === 'full' ? '100%' : '60%',
        transform: `scale(${scale})`,
      }}>
        <Lottie
          animationData={animationData}
          loop
          playbackRate={1}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </AbsoluteFill>
  );
}
