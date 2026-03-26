export { VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS } from '../shortform/constants';

export const AD_DURATIONS = [5, 10, 15] as const;

export const MAX_HOOK_DURATION = 10; // seconds
export const MIN_HOOK_DURATION = 1;
export const MAX_HOOK_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const HOOK_SITES = [
  { name: 'Transitional Hooks', url: 'https://transitionalhooks.com/social-media-video-hook-library/', desc: '소셜미디어 훅 라이브러리' },
  { name: 'VideoHooks.app', url: 'https://videohooks.app/', desc: '500+ 무료 훅 영상' },
  { name: 'AISEO Hooks', url: 'https://aiseo.ai/tools/transitional-hooks', desc: '상업용 무료, 카테고리별' },
  { name: 'VideoHooks.art', url: 'https://videohooks.art/', desc: '테마별 MP4 다운로드' },
  { name: 'ViralHooks.org', url: 'https://viralhooks.org/', desc: '매일 업데이트 프리미엄' },
] as const;
