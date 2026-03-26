export type MotionStyle =
  | 'keyword_pop'      // 키워드 스프링 팝인 (기본)
  | 'typewriter'       // 타이핑 효과
  | 'slide_stack'      // 좌우 슬라이드 스택
  | 'counter'          // 숫자 카운트업
  | 'split_compare'    // 좌우 비교 분할
  | 'radial_burst'     // 중앙 방사형 버스트
  | 'list_reveal'      // 리스트 순차 등장
  | 'zoom_impact'      // 줌인 임팩트
  | 'glitch'           // 글리치/디스토션
  | 'wave'             // 웨이브 텍스트
  | 'spotlight'        // 스포트라이트 원형 reveal
  | 'card_flip'        // 3D 카드 뒤집기
  | 'progress_bar'     // 가로 프로그레스 바
  | 'emoji_rain'       // 이모지 비
  | 'parallax_layers'  // 패럴랙스 레이어
  | 'confetti_burst'   // 컨페티 폭발
  | 'sparkle_trail'    // 스파클 트레일
  | 'pulse_ring'       // 펄스 링
  ;

export type SceneLayout = 'center' | 'top_heavy' | 'bottom_heavy' | 'split_left' | 'split_right';

export type Scene = {
  scene_number: number;
  duration: number;
  type: string;
  narration: string;
  subtitle: string;
  visual: string;
  transition: string;
  // AI-driven motion style (Level 1-B)
  motion_style?: MotionStyle;
  layout?: SceneLayout;
  icon?: string;
  // Dynamic color palette (Gemini-generated)
  accent_color?: string;
  glow_color?: string;
  // Scene background image (Level 2)
  backgroundImageUrl?: string;
  // Scene background video (Level 3 — fal.ai Image-to-Video)
  backgroundVideoUrl?: string;
};

export type ScriptResult = {
  title: string;
  hook: string;
  total_duration: number;
  scenes: Scene[];
  hashtags: string[];
  bgm_mood: string;
  thumbnail_text: string;
};

export type TtsAudio = {
  sceneNumber: number;
  dataUrl: string;
  durationInSeconds: number;
};

export type BgmAudio = {
  dataUrl: string;
  durationInSeconds: number;
  track: {
    id: string;
    name: string;
    artist: string;
    duration: number;
    license: string;
    url: string;
  };
};

// ── Motion Theme (visual style for motion graphics) ──

export type MotionTheme = 'colorful_pop' | 'pastel_soft' | 'gradient_vivid' | 'dark_impact' | 'black_neon';

export const MOTION_THEMES = [
  { id: 'colorful_pop' as const, label: '컬러풀 팝', desc: '밝고 선명한 플랫 컬러', preview: ['#4ECDC4', '#FF6B6B'] },
  { id: 'pastel_soft' as const, label: '파스텔 소프트', desc: '부드러운 파스텔 톤', preview: ['#E8D5F5', '#FFD1DC'] },
  { id: 'gradient_vivid' as const, label: '그라디언트 비비드', desc: '화려한 컬러 그라디언트', preview: ['#667eea', '#f093fb'] },
  { id: 'dark_impact' as const, label: '다크 임팩트', desc: '어두운 배경 + 강렬 타이포', preview: ['#1a2744', '#FF4D6A'] },
  { id: 'black_neon' as const, label: '블랙 네온', desc: '블랙 + 네온 컬러', preview: ['#0a0a0a', '#00FF88'] },
] as const;

// Theme rendering config (used by SceneRenderer + renderVideo)
export type ThemeConfig = {
  bgMode: 'gradient' | 'solid' | 'light';
  baseBg: [string, string, string]; // fallback bg when no accent_color
  bgBrightness: number; // 0~1, multiplier for deriveBackground
  grid: boolean;
  grain: boolean;
  bokehCount: number;
  sparkleCount: number;
  shapeCount: number;
  dotPattern: boolean;
  textColor: string; // for light themes
};

export const THEME_CONFIGS: Record<MotionTheme, ThemeConfig> = {
  colorful_pop: {
    bgMode: 'light', baseBg: ['#f0f8ff', '#e8f4f8', '#f5f0ff'],
    bgBrightness: 0.88, grid: false, grain: false,
    bokehCount: 0, sparkleCount: 4, shapeCount: 0,
    dotPattern: false, textColor: '#1a1a2e',
  },
  pastel_soft: {
    bgMode: 'light', baseBg: ['#f5eef8', '#eef5f8', '#fdf0f4'],
    bgBrightness: 0.92, grid: false, grain: false,
    bokehCount: 3, sparkleCount: 3, shapeCount: 0,
    dotPattern: false, textColor: '#2d2d3f',
  },
  gradient_vivid: {
    bgMode: 'gradient', baseBg: ['#667eea', '#764ba2', '#f093fb'],
    bgBrightness: 0.45, grid: false, grain: false,
    bokehCount: 4, sparkleCount: 5, shapeCount: 0,
    dotPattern: false, textColor: '#ffffff',
  },
  dark_impact: {
    bgMode: 'solid', baseBg: ['#1a2744', '#1e2d4f', '#162040'],
    bgBrightness: 0.12, grid: false, grain: false,
    bokehCount: 0, sparkleCount: 3, shapeCount: 0,
    dotPattern: true, textColor: '#ffffff',
  },
  black_neon: {
    bgMode: 'solid', baseBg: ['#080808', '#0d0d0d', '#050505'],
    bgBrightness: 0.04, grid: false, grain: false,
    bokehCount: 3, sparkleCount: 5, shapeCount: 0,
    dotPattern: false, textColor: '#ffffff',
  },
};

export type BgmMood = typeof BGM_MOODS[number]['id'];

export const BGM_MOODS = [
  { id: 'none', label: 'BGM 없음' },
  { id: '밝고 경쾌한', label: '밝고 경쾌한' },
  { id: '차분하고 편안한', label: '차분하고 편안한' },
  { id: '긴장감 있는', label: '긴장감 있는' },
  { id: '감성적인', label: '감성적인' },
  { id: '힙한/트렌디', label: '힙한/트렌디' },
  { id: '신나는', label: '신나는' },
  { id: '동기부여', label: '동기부여' },
  { id: '미스터리', label: '미스터리' },
] as const;
