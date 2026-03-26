<div align="center">

# Contents Maker

### AI-Powered Content Production Studio

**7 AI content generators + Browser-based video rendering engine**

Trend Tracker | Card News | Short-form Video | Meme Ad Video | Ad Copy | Ad Creative | Thumbnail

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React_18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Remotion](https://img.shields.io/badge/Remotion_4-0B84F3?logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiPjwvc3ZnPg==&logoColor=white)](https://www.remotion.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Gemini](https://img.shields.io/badge/Gemini_AI-8E75B2?logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[한국어](#한국어) | [English](#english)

</div>

---

## English

### What is this?

**Contents Maker** is an AI-powered content production studio that generates marketing content entirely in the browser. From trend analysis to video rendering — no server-side video processing required.

Built as the internal content engine for [nadaunse.com](https://nadaunse.com), a Korean fortune-telling service.

### Key Features

| Tool | Description | AI Model |
|------|-------------|----------|
| **Trend Tracker** | Real-time X (Twitter) trending + AI topic analysis | Gemini + Google Search Grounding |
| **Card News Maker** | AI-generated slide decks with stock/AI images | Gemini Image Generation |
| **Short-form Video Maker** | 10/15/30s vertical videos with 18 motion graphics | Gemini + ElevenLabs TTS + Remotion |
| **Meme Ad Video Maker** | Meme hook + AI ad script video synthesis | Gemini + WebCodecs |
| **Ad Copy Maker** | Behavioral economics-based ad copy generation | Gemini |
| **Ad Creative Maker** | Full ad poster design with AI image generation | Gemini Image Generation |
| **Thumbnail Maker** | Reference-based AI thumbnail with batch generation | Gemini Image Generation |

### Architecture

```
Browser (React + TypeScript + Tailwind CSS)
├── Remotion Player ── Real-time video preview
├── Canvas + WebCodecs + mp4-muxer ── Browser-side MP4 encoding
├── 18 Motion Graphics ── Spring animations, glitch, parallax, etc.
├── Lottie Overlays ── 10 animated overlay effects
└── Audio Reactive Visuals ── Frame-based beat simulation

Supabase Edge Functions (Deno)
├── Gemini 2.5 Flash ── Script/copy/creative generation (JSON mode)
├── Gemini Flash Image ── AI image generation (card news, ads, thumbnails)
├── ElevenLabs / OpenAI TTS ── Narration voice synthesis
├── Replicate (Wan 2.5 / Hailuo / Kling) ── Image-to-Video conversion
├── Jamendo API ── Royalty-free BGM search
├── Unsplash + Pexels ── Stock image search
└── Apify ── X trending data scraping
```

### Video Engine Highlights

- **100% browser-side rendering** — No FFmpeg server. Uses `Canvas` + `WebCodecs` + `mp4-muxer`
- **18 motion graphic styles** — keyword pop, typewriter, glitch, parallax layers, emoji rain, and more
- **3 video types** — Motion graphics / AI image (Ken Burns) / AI video (Replicate I2V)
- **Audio pipeline** — TTS narration + BGM with automatic ducking (volume reduction during speech)
- **Remotion 4 integration** — `TransitionSeries` with 7 transition types + Light Leak effects
- **Audio reactive visuals** — Glow pulse, beat flash, waveform (frame-based simulation, no `@remotion/media-utils`)
- **Meme ad synthesis** — Frame extraction from uploaded hook video + AI ad scene rendering + audio mixing via `OfflineAudioContext`
- **CapCut export** — Generate CapCut-compatible project JSON + TTS mp3 as ZIP

### 18 Motion Styles

| Style | Effect |
|-------|--------|
| `keyword_pop` | Spring pop-in with keyword emphasis |
| `typewriter` | Typing effect with cursor |
| `slide_stack` | Left/right slide stacking |
| `counter` | Animated number count-up |
| `split_compare` | Side-by-side comparison with VS |
| `radial_burst` | Radial burst animation |
| `list_reveal` | Sequential list item reveal |
| `zoom_impact` | Zoom-in with shockwave |
| `glitch` | RGB split glitch effect |
| `wave` | Wave text animation |
| `spotlight` | Circular spotlight reveal |
| `card_flip` | 3D card flip |
| `progress_bar` | Horizontal progress bar |
| `emoji_rain` | Falling emoji particles |
| `parallax_layers` | Multi-layer parallax |
| `confetti_burst` | Confetti explosion |
| `sparkle_trail` | Sparkle trail effect |
| `pulse_ring` | Expanding pulse rings |

### Project Structure

```
src/
├── pages/                    # 8 page components (React)
│   ├── ContentStudioPage     # Hub — all tools in one place
│   ├── TrendTrackerPage      # X trending + AI topic analysis
│   ├── CardNewsPage          # AI slide deck generator
│   ├── ShortFormPage         # Short-form video maker
│   ├── MemeAdPage            # Meme hook + ad video
│   ├── AdCopyPage            # AI ad copy generator
│   ├── AdCreativePage        # AI ad poster generator
│   └── ThumbnailPage         # AI thumbnail generator
├── shortform/                # Video rendering engine
│   ├── types.ts              # Scene, TtsAudio, MotionStyle types
│   ├── constants.ts          # 1080×1920, 30fps
│   ├── renderVideo.ts        # Canvas + WebCodecs MP4 encoder
│   ├── lottie/               # Lottie overlay system
│   └── compositions/         # Remotion components
│       ├── ShortFormVideo     # Root composition (TransitionSeries)
│       ├── SceneRenderer      # Per-scene background + motion dispatch
│       ├── SubtitleOverlay    # Word-level spring subtitles
│       ├── AudioReactiveOverlay # Beat-synced visuals
│       ├── LottieOverlay      # Animated overlay wrapper
│       └── motions/           # 18 motion graphic components
├── meme-ad/                  # Meme ad video engine
│   ├── types.ts              # HookVideoInfo, MemeAdScriptResult
│   ├── constants.ts          # Ad durations, hook sites
│   ├── renderMemeAdVideo.ts  # Hook frame extraction + rendering
│   └── compositions/         # Remotion meme ad components
└── capcut/                   # CapCut project export

supabase/functions/           # 13 Edge Functions (Deno)
├── search-trends/            # Apify X trending + Gemini analysis
├── generate-card-news/       # Gemini → slide plan JSON
├── generate-card-image/      # Gemini Image → background image
├── search-stock-image/       # Unsplash/Pexels proxy
├── generate-short-form/      # Gemini → short-form script JSON
├── generate-tts/             # ElevenLabs/OpenAI → narration mp3
├── generate-bgm/             # Jamendo → royalty-free BGM
├── generate-meme-ad/         # Gemini → meme ad script JSON
├── generate-ad-copy/         # Gemini → ad copy JSON
├── generate-ad-creative/     # Gemini → ad creative plan JSON
├── generate-ad-image/        # Gemini Image → ad poster
├── generate-scene-video/     # Replicate → Image-to-Video
└── generate-thumbnail-image/ # Gemini Image → thumbnail

public/lottie/                # 10 Lottie animation assets
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Tailwind CSS v4 + Vite |
| Video Preview | Remotion 4 (`@remotion/player`, `TransitionSeries`) |
| Video Encoding | Canvas + WebCodecs API + `mp4-muxer` (H.264 + AAC) |
| Backend | Supabase Edge Functions (Deno runtime) |
| AI Script | Google Gemini 2.5 Flash (JSON mode) |
| AI Image | Gemini Flash Image Generation |
| AI Video | Replicate (Wan 2.5 / Hailuo Fast / Kling v2.1) |
| TTS | ElevenLabs `eleven_turbo_v2_5` / OpenAI `tts-1-hd` fallback |
| BGM | Jamendo API v3.0 (royalty-free, CC license) |
| Stock Images | Unsplash + Pexels |
| Trend Data | Apify (X/Twitter scraper) |
| Animation | Lottie (`@remotion/lottie`) |
| Export | JSZip (card news ZIP, CapCut project ZIP) |

### Quick Start

```bash
# 1. Clone
git clone https://github.com/mochunab/contents-maker.git
cd contents-maker

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env — fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 4. Deploy Edge Functions to your Supabase project
npx supabase link --project-ref your-project-ref
npx supabase functions deploy

# 5. Set Edge Function secrets in Supabase Dashboard
#    (Project Settings > Edge Functions > Secrets)

# 6. Run dev server
npm run dev
```

### API Keys Setup

Copy `.env.example` and fill in your API keys:

```bash
cp .env.example .env
```

| Service | Key | Get it from | Free Tier |
|---------|-----|-------------|-----------|
| **Google Gemini** | `GOOGLE_API_KEY` | [ai.google.dev/gemini-api](https://ai.google.dev/gemini-api/docs/api-key) | 15 RPM free |
| **ElevenLabs** | `ELEVENLABS_API_KEY` | [elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys) | 10,000 chars/month free |
| **OpenAI** (TTS fallback) | `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Pay-per-use |
| **Replicate** (I2V) | `REPLICATE_API_TOKEN` | [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) | Pay-per-use |
| **Unsplash** | `UNSPLASH_ACCESS_KEY` | [unsplash.com/developers](https://unsplash.com/developers) | 50 req/hour (dev) |
| **Pexels** | `PEXELS_API_KEY` | [pexels.com/api/new](https://www.pexels.com/api/new/) | 200 req/hour free |
| **Apify** | `APIFY_API_TOKEN` | [console.apify.com/settings/integrations](https://console.apify.com/account/integrations) | $5/month free credit |
| **Jamendo** | `JAMENDO_CLIENT_ID` | [devportal.jamendo.com](https://devportal.jamendo.com/) | 35,000 req/month free |
| **Supabase** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | [supabase.com/dashboard](https://supabase.com/dashboard) | Free tier available |

> Edge Function environment variables are set in Supabase Dashboard > Project Settings > Edge Functions > Secrets

### Documentation

- **[Handover Document](./docs/CONTENT_STUDIO_HANDOVER.md)** — Complete technical specification for all 7 makers + 13 Edge Functions

### Browser Requirements

- **Chrome / Edge** (WebCodecs API required for video rendering)
- Desktop only (internal production tool)

---

## 한국어

### 빠른 시작

```bash
# 1. 클론
git clone https://github.com/mochunab/contents-maker.git
cd contents-maker

# 2. 패키지 설치
npm install

# 3. 환경변수 설정
cp .env.example .env
# .env 파일에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 입력

# 4. Supabase Edge Functions 배포
npx supabase link --project-ref your-project-ref
npx supabase functions deploy

# 5. Edge Function 시크릿 설정
#    Supabase Dashboard > Project Settings > Edge Functions > Secrets에서 API 키 입력

# 6. 개발 서버 실행
npm run dev
```

### 이게 뭔가요?

**Contents Maker**는 AI 기반 콘텐츠 제작 스튜디오입니다. 트렌드 분석부터 영상 렌더링까지 — 서버 없이 브라우저에서 모든 것을 처리합니다.

[nadaunse.com](https://nadaunse.com) (나다운세) 서비스의 내부 콘텐츠 엔진으로 개발되었습니다.

### 주요 기능

| 도구 | 설명 | AI |
|------|------|----|
| **트렌드 추적기** | X(트위터) 실시간 트렌딩 + AI 주제 분석 | Gemini + Google Search |
| **카드뉴스 메이커** | AI 슬라이드 기획 + 스톡/AI 이미지 | Gemini Image |
| **숏폼 메이커** | 10/15/30초 세로 영상 + 모션 그래픽 18종 | Gemini + ElevenLabs TTS + Remotion |
| **밈광고 메이커** | 밈 훅 영상 + AI 광고 대본 합성 | Gemini + WebCodecs |
| **광고 카피 메이커** | 행동경제학 기반 광고 카피 생성 | Gemini |
| **광고 소재 메이커** | AI 광고 포스터 디자인 + 이미지 생성 | Gemini Image |
| **썸네일 메이커** | 레퍼런스 기반 AI 썸네일 + 배치 생성 | Gemini Image |

### 영상 엔진 특징

- **100% 브라우저 렌더링** — FFmpeg 서버 불필요. `Canvas` + `WebCodecs` + `mp4-muxer` 사용
- **모션 그래픽 18종** — 키워드 팝, 타이핑, 글리치, 패럴랙스, 이모지 비 등
- **영상 타입 3종** — 모션 그래픽 / AI 이미지 (Ken Burns) / AI 영상 (Replicate I2V)
- **오디오 파이프라인** — TTS 나레이션 + BGM 자동 더킹 (음성 구간 볼륨 자동 조절)
- **밈광고 합성** — 훅 영상 프레임 추출 + AI 광고 씬 + `OfflineAudioContext` 오디오 믹싱
- **CapCut 내보내기** — CapCut 프로젝트 JSON + TTS mp3 ZIP 생성

### 광고 전략 체계

행동경제학 기반 10가지 광고 전략이 AI 프롬프트에 내장되어 있습니다:

| 분류 | 전략 |
|------|------|
| 행동경제학 | 손실 회피, 구체적 숫자, 타겟 지목, 간편성/즉각성 |
| 카피 유형 | 문제점 자극형, 이익 약속형, 호기심 유발형, 해결책 제시형, 질문 유도형, 행동 촉구형 |

---

<div align="center">

### Built with

**Gemini** | **Remotion** | **WebCodecs** | **Supabase** | **ElevenLabs** | **Replicate**

MIT License

</div>
