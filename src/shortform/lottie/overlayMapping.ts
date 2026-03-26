import type { MotionStyle } from '../types';
import type { LottieOverlayType } from './types';

/**
 * 씬 타입 → Lottie 오버레이 매핑
 * null = 오버레이 없음 (모션 컴포넌트만으로 충분)
 */
export const SCENE_LOTTIE_MAP: Record<string, LottieOverlayType | null> = {
  hook:          'fire',
  problem_intro: 'alert',
  problem:       'alert',
  reason_1:      null,
  reason_2:      null,
  reason_3:      null,
  reason:        null,
  solution:      'checkmark',
  tip:           'lightbulb',
  cta:           'megaphone',
  intro:         'sparkles',
  content:       null,
  outro:         'confetti',
};

/**
 * 모션 스타일 → Lottie 오버레이 매핑 (씬 타입보다 우선)
 */
export const MOTION_LOTTIE_MAP: Partial<Record<MotionStyle, LottieOverlayType>> = {
  confetti_burst: 'confetti',
  sparkle_trail:  'sparkles',
  pulse_ring:     'star_burst',
  emoji_rain:     'heart_pulse',
};

/**
 * 씬에 적합한 Lottie 오버레이 타입을 결정
 * 우선순위: motion_style 매핑 > scene type 매핑 > null
 */
export function resolveLottieType(
  sceneType: string,
  motionStyle?: MotionStyle,
): LottieOverlayType | null {
  // 1. 모션 스타일 기반 매핑 (더 구체적)
  if (motionStyle && MOTION_LOTTIE_MAP[motionStyle]) {
    return MOTION_LOTTIE_MAP[motionStyle]!;
  }
  // 2. 씬 타입 기반 매핑
  const key = sceneType.toLowerCase().replace(/\s+/g, '_');
  return SCENE_LOTTIE_MAP[key] ?? null;
}
