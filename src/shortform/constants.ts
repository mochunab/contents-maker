export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;

export const ASPECT_RATIOS = [
  { id: '9:16', label: '세로 9:16', width: 1080, height: 1920 },
  { id: '3:4', label: '세로 3:4', width: 1080, height: 1440 },
  { id: '1:1', label: '정사각 1:1', width: 1080, height: 1080 },
] as const;

export type AspectRatioId = typeof ASPECT_RATIOS[number]['id'];

/**
 * Spring 애니메이션 프리셋 — 모션 컴포넌트에서 일관된 물리 느낌 유지
 * 기존 모션의 주요 패턴을 분석하여 5종으로 표준화
 */
export const SPRING_PRESETS = {
  /** 메인 요소 진입 — 약간의 바운스, 빠른 정착 (damping 14, mass 0.8) */
  entry: { damping: 14, mass: 0.8 },
  /** 보조 요소 — 부드럽고 빠른 (damping 16, mass 0.5) */
  secondary: { damping: 16, mass: 0.5 },
  /** 임팩트/충격 — 바운스 강함 (damping 8, mass 1.0) */
  bouncy: { damping: 8, mass: 1.0 },
  /** 무거운 요소 — 느리고 묵직 (damping 20, mass 2.0) */
  heavy: { damping: 20, mass: 2.0 },
  /** 키워드 텍스트 — 적당한 바운스 (damping 12, mass: 0.6) */
  keyword: { damping: 12, mass: 0.6 },
} as const;
