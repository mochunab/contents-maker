import type { LottieOverlayType } from './types';

export type { LottieOverlayType, LottieOverlayPosition, LottieOverlayConfig } from './types';
export { resolveLottieType, SCENE_LOTTIE_MAP, MOTION_LOTTIE_MAP } from './overlayMapping';

/**
 * Lottie JSON 에셋 경로 레지스트리
 * public/lottie/ 폴더의 JSON 파일을 참조
 */
const LOTTIE_PATHS: Record<LottieOverlayType, string> = {
  confetti:     '/lottie/confetti.json',
  sparkles:     '/lottie/sparkles.json',
  fire:         '/lottie/fire.json',
  checkmark:    '/lottie/checkmark.json',
  heart_pulse:  '/lottie/heart_pulse.json',
  star_burst:   '/lottie/star_burst.json',
  alert:        '/lottie/alert.json',
  lightbulb:    '/lottie/lightbulb.json',
  trophy:       '/lottie/trophy.json',
  megaphone:    '/lottie/megaphone.json',
};

// 캐시: 한 번 fetch한 JSON은 메모리에 보관
const cache = new Map<LottieOverlayType, object>();

/**
 * Lottie JSON 데이터를 fetch + 캐시
 * Remotion Player & Canvas 렌더러 공용
 */
export async function loadLottieData(type: LottieOverlayType): Promise<object> {
  const cached = cache.get(type);
  if (cached) return cached;

  const path = LOTTIE_PATHS[type];
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Lottie load failed: ${path} (${res.status})`);
  const data = await res.json();
  cache.set(type, data);
  return data;
}

/**
 * 여러 Lottie 에셋을 병렬 프리로드
 * 영상 제작 시작 전 호출하여 캐시 워밍
 */
export async function preloadLottieAssets(types: LottieOverlayType[]): Promise<Map<LottieOverlayType, object>> {
  const unique = [...new Set(types)];
  const results = await Promise.allSettled(unique.map(t => loadLottieData(t)));
  const map = new Map<LottieOverlayType, object>();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') map.set(unique[i], r.value);
  });
  return map;
}
