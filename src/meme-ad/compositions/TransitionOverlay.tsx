import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

type TransitionType = 'fade' | 'zoom' | 'glitch' | 'flash';

type Props = {
  type: TransitionType;
  durationInFrames: number;
};

export default function TransitionOverlay({ type, durationInFrames }: Props) {
  const frame = useCurrentFrame();
  const progress = frame / durationInFrames; // 0→1

  if (type === 'fade') {
    // Black fade: in then out
    const opacity = progress < 0.5
      ? interpolate(progress, [0, 0.5], [0, 1])
      : interpolate(progress, [0.5, 1], [1, 0]);
    return (
      <AbsoluteFill style={{ backgroundColor: `rgba(0,0,0,${opacity})`, zIndex: 50 }} />
    );
  }

  if (type === 'flash') {
    // White flash
    const opacity = progress < 0.3
      ? interpolate(progress, [0, 0.3], [0, 1])
      : interpolate(progress, [0.3, 1], [1, 0]);
    return (
      <AbsoluteFill style={{ backgroundColor: `rgba(255,255,255,${opacity})`, zIndex: 50 }} />
    );
  }

  if (type === 'zoom') {
    // Zoom out from hook + fade
    const scale = interpolate(progress, [0, 1], [1.5, 1]);
    const opacity = progress < 0.5
      ? interpolate(progress, [0, 0.5], [0.8, 0])
      : 0;
    return (
      <AbsoluteFill style={{
        backgroundColor: `rgba(0,0,0,${opacity})`,
        transform: `scale(${scale})`,
        zIndex: 50,
      }} />
    );
  }

  if (type === 'glitch') {
    // RGB split + flash
    const intensity = progress < 0.5
      ? interpolate(progress, [0, 0.5], [0, 1])
      : interpolate(progress, [0.5, 1], [1, 0]);
    const offset = Math.round(intensity * 20);
    return (
      <AbsoluteFill style={{ zIndex: 50, pointerEvents: 'none' }}>
        {/* Red channel offset */}
        <AbsoluteFill style={{
          backgroundColor: `rgba(255,0,0,${intensity * 0.3})`,
          transform: `translateX(${offset}px)`,
          mixBlendMode: 'screen',
        }} />
        {/* Cyan channel offset */}
        <AbsoluteFill style={{
          backgroundColor: `rgba(0,255,255,${intensity * 0.3})`,
          transform: `translateX(${-offset}px)`,
          mixBlendMode: 'screen',
        }} />
        {/* Scanlines */}
        <AbsoluteFill style={{
          background: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,${intensity * 0.15}) 2px, rgba(0,0,0,${intensity * 0.15}) 4px)`,
        }} />
      </AbsoluteFill>
    );
  }

  return null;
}

export type { TransitionType };
