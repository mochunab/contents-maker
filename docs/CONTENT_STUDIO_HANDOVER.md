# Contents Studio Handover

> **Last Updated**: 2026-03-24
> **Status**: All 7 makers + trend tracker fully implemented

---

## 1. Overview

AI-powered content production hub. **Trend Tracker**, **Card News Maker**, **Short-form Video Maker**, **Meme Ad Video Maker**, **Ad Copy Maker**, **Ad Creative Maker**, **Thumbnail Maker** are fully implemented.

**Routes**: `/contents-maker` (hub) > `/trend-tracker` / `/thumbnail` / `/card-news` / `/short-form` / `/meme-ad` / `/ad-copy` / `/ad-creative`

---

## 2. File Structure

```
src/
├── pages/
│   ├── ContentStudioPage.tsx      # Content hub (1depth)
│   ├── TrendTrackerPage.tsx       # Trend tracker (2depth)
│   ├── CardNewsPage.tsx           # Card news maker (2depth)
│   ├── ShortFormPage.tsx          # Short-form video maker (2depth)
│   ├── MemeAdPage.tsx             # Meme ad video maker (2depth)
│   ├── AdCopyPage.tsx             # Ad copy maker (2depth)
│   ├── AdCreativePage.tsx         # Ad creative maker (2depth)
│   └── ThumbnailPage.tsx          # Thumbnail maker (2depth)
├── shortform/
│   ├── types.ts                   # Scene, ScriptResult, TtsAudio, MotionStyle types
│   ├── constants.ts               # VIDEO_WIDTH(1080), HEIGHT(1920), FPS(30)
│   ├── renderVideo.ts             # Canvas + WebCodecs + mp4-muxer browser MP4 rendering
│   ├── lottie/                    # Lottie overlay system
│   │   ├── index.ts               # Asset registry + fetch cache + preload
│   │   ├── types.ts               # LottieOverlayType, Position, Config types
│   │   └── overlayMapping.ts      # Scene type/motion style → Lottie overlay mapping
│   └── compositions/
│       ├── ShortFormVideo.tsx      # Remotion root (TransitionSeries + Light Leaks)
│       ├── SceneRenderer.tsx       # Per-scene background + motion dispatch + Lottie overlay
│       ├── AudioReactiveOverlay.tsx # Frame-based simulation (glow pulse + beat flash + waveform)
│       ├── LottieOverlay.tsx       # @remotion/lottie wrapper (fetch + cache + fade)
│       ├── SubtitleOverlay.tsx     # Word-level spring subtitles (**bold** → yellow highlight)
│       └── motions/               # 18 motion graphic components
│           ├── index.ts           # MOTION_REGISTRY (MotionStyle → component mapping)
│           ├── types.ts           # MotionComponentProps interface
│           ├── KeywordPopMotion.tsx    # Keyword spring pop-in (default)
│           ├── TypewriterMotion.tsx    # Typing effect
│           ├── SlideStackMotion.tsx    # Left/right slide stack
│           ├── CounterMotion.tsx       # Number count-up
│           ├── SplitCompareMotion.tsx  # Side-by-side comparison + VS
│           ├── RadialBurstMotion.tsx   # Radial burst
│           ├── ListRevealMotion.tsx    # Sequential list reveal
│           ├── ZoomImpactMotion.tsx    # Zoom-in + shockwave
│           ├── GlitchMotion.tsx       # RGB split glitch
│           ├── WaveMotion.tsx         # Wave text
│           ├── SpotlightMotion.tsx    # Circular spotlight reveal
│           ├── CardFlipMotion.tsx     # 3D card flip
│           ├── ProgressBarMotion.tsx  # Horizontal progress bar
│           ├── EmojiRainMotion.tsx    # Emoji rain
│           └── ParallaxLayersMotion.tsx # Parallax layers
├── meme-ad/
│   ├── types.ts                   # HookVideoInfo, MemeAdScriptResult types
│   ├── constants.ts               # AD_DURATIONS(5/10/15), HOOK_SITES, limits
│   ├── renderMemeAdVideo.ts       # Hook frame extraction + ad scene rendering + audio mixing
│   └── compositions/
│       ├── MemeAdVideo.tsx         # Remotion composition (hook Video + ad SceneRenderer)
│       └── TransitionOverlay.tsx   # Transition effects (fade/flash/glitch/zoom)
├── capcut/
│   └── generateCapcutProject.ts   # CapCut project JSON + TTS mp3 → ZIP generation

supabase/functions/
├── search-trends/index.ts         # Apify X trending + Gemini topic analysis
├── generate-card-news/index.ts    # Gemini 2.5 Flash → slide plan JSON
├── generate-card-image/index.ts   # Gemini 2.5 Flash Image → background image
├── search-stock-image/index.ts    # Unsplash/Pexels image search proxy
├── generate-short-form/index.ts   # Gemini 2.5 Flash → short-form script JSON
├── generate-tts/index.ts          # ElevenLabs/OpenAI TTS → narration mp3
├── generate-bgm/index.ts          # Jamendo API → mood-based BGM search
├── generate-meme-ad/index.ts      # Gemini 2.5 Flash → meme ad script JSON
├── generate-ad-copy/index.ts      # Gemini 2.5 Flash → ad copy JSON
├── generate-ad-creative/index.ts  # Gemini 2.5 Flash → ad creative plan JSON
├── generate-ad-image/index.ts     # Gemini 2.5 Flash Image → ad poster image
├── generate-scene-video/index.ts  # Replicate Predictions API → Image-to-Video
└── generate-thumbnail-image/index.ts  # Gemini Flash Image → thumbnail (reference + reference_mode)
```

---

## 3. Trend Tracker

### 3.1 Flow (3 modes)

```
[Input]
├── X Real-time Trending (button click)
└── Topic Analysis (keyword input + analyze button)

[X Trending Result — Tab UI]
┌─ [Trends Tab] ──────────────────┐  ┌─ [AI Analysis Tab] ────────────┐
│ Korea real-time trending 50 list │  │ Today's X mood (one-line)      │
│ Keyword tap → "View on X" link   │  │ Category classification (3~6)  │
│ Keyword tap → Create content     │  │ Key insights (3~5)             │
│                                  │  │ Content creation tips (2~3)    │
└──────────────────────────────────┘  └────────────────────────────────┘

[Topic Analysis Result]
├── Summary (2~3 sentences)
├── Trending keywords 5~10 (HOT/WARM/RISING badges + platform badges)
│   └── Keyword tap → card news / short-form / ad copy maker
├── Key insights 3~5
├── Content ideas 3~5
└── Google Search grounding sources (accordion, collapsed by default)
```

### 3.2 Edge Function: search-trends

- **Role**: Trend search proxy (3 modes)
- **Input**: `{ mode, country?, topic? }`
- **Modes**:
  - `x-trending`: Apify `scrape.badger/twitter-trends-scraper` (WOEID 23424868=Korea) → normalized `TrendItem[]`
  - `trending-insights`: Gemini 2.5 Flash JSON mode → trending keyword analysis (categories, insights, tips)
  - `topic-analysis`: Gemini 2.5 Flash + `google_search` grounding → topic trend analysis JSON + `groundingChunks` sources
- **Fallback**: If Google Search grounding fails, retry with plain JSON mode
- **Env vars**: `APIFY_API_TOKEN`, `GOOGLE_API_KEY`

---

## 4. Card News Maker

### 4.1 Flow (3 steps)

```
[Step 1: Input]         [Step 2: Plan]          [Step 3: Production]
Topic text input    →   AI slide plan        →   Image generation + download
Slide count select      Chat-based revision      Cover first → full production
(5/7/10 slides)         Start over / Produce     ZIP download
```

### 4.2 Image Generation Modes

| Mode | Source | Features |
|------|--------|----------|
| **Stock** (default) | `search-stock-image` Edge Function | Fast, free photos, attribution |
| **AI Generated** | `generate-card-image` Edge Function | Gemini Image, slower, custom |

### 4.3 Aspect Ratios (7)

| ID | Platform | Ratio | Resolution |
|----|----------|-------|------------|
| `ig-portrait` | Instagram | 4:5 | 1080×1350 |
| `ig-square` | Instagram | 1:1 | 1080×1080 |
| `ig-story` | Instagram | 9:16 | 1080×1920 |
| `x-feed` | X (Twitter) | 16:9 | 1200×675 |
| `yt-thumb` | YouTube | 16:9 | 1280×720 |
| `naver-blog` | Naver | 3:4 | 900×1200 |
| `linkedin` | LinkedIn | 1:1 | 1080×1080 |

---

## 5. Short-form Video Maker

### 5.1 Flow (3 steps, 6 phases)

```
[Step 1: Input]           [Step 2: Script Review]    [Step 3: Video Production]
Topic text input      →   AI script review        →   Phase A: TTS narration
Video length select        Per-scene timeline          Phase A+: BGM search (optional)
(10/15/30s)               Chat-based revision          Phase A-2: AI background images
Purpose select             Start over / Produce        Phase A-3: Replicate I2V conversion (video type)
(viral/info/storytelling)                              Phase B: Remotion preview
Video type select                                      Phase C: MP4 rendering
(motion/image/video)                                   Phase D: Download (MP4/TXT/CapCut)
Image source (AI/stock)
I2V model (Wan/Hailuo/Kling)
Narration voice (6 options)
BGM mood (9 options)
```

### 5.2 Video Types (3)

| Type | Description | Flow |
|------|-------------|------|
| **Motion Graphics** (default) | AI-selected 18 motion styles + dynamic color palette | TTS → BGM → Preview |
| **Image-based** | Per-scene AI images + Ken Burns zoom/pan effect | TTS → BGM → Images → Confirm → Preview |
| **Video-based** | Per-scene AI images → Replicate I2V video backgrounds | TTS → BGM → Images → Confirm → I2V → Preview |

### 5.3 Video Specs

- **Resolution**: 1080×1920 (9:16 vertical)
- **FPS**: 30
- **Video codec**: H.264 (avc1.640028, High Profile Level 4.0), 4Mbps
- **Audio codec**: AAC (mp4a.40.2), 128kbps, mono 44100Hz
- **Browser**: Chrome/Edge required (WebCodecs API)

### 5.4 Video Components

| Element | Image-based | Video-based | Motion Graphics |
|---------|------------|-------------|-----------------|
| **Background** | AI image + Ken Burns + dark overlay | Replicate I2V (muted) + dark overlay / fallback: image | Dynamic color gradient + grid + bokeh |
| **Motion** | keyword_pop default | (same) | **AI auto-selected 18 styles** + per-scene dynamic colors |
| **Subtitle** | Bottom center, `**bold**` → yellow, spring | (same) | (same) |
| **Transition** | 7 types (cut/fade/zoom/slide/blur_in/wipe_left/scale_rotate) | (same) | (same) |
| **Audio** | TTS + BGM (Jamendo, **ducking**: 0.04 during TTS / 0.12 otherwise) | (same) | (same) |
| **Overlay** | Hidden (image is visual) | Hidden (video is visual) | X-mark/check/particle + floating shapes |

### 5.5 Script JSON Structure

```json
{
  "title": "Video title",
  "hook": "First 3-second hook",
  "total_duration": 30,
  "scenes": [
    {
      "scene_number": 1,
      "duration": 3,
      "type": "hook",
      "narration": "Narration text",
      "subtitle": "Subtitle (**emphasis**)",
      "visual": "Visual description",
      "transition": "cut",
      "motion_style": "zoom_impact",
      "layout": "center",
      "icon": "🔥",
      "accent_color": "#FF6B6B",
      "glow_color": "#FF4444"
    }
  ],
  "hashtags": ["hashtag1", "hashtag2"],
  "bgm_mood": "bright and cheerful",
  "thumbnail_text": "Thumbnail text"
}
```

### 5.6 18 Motion Styles

`keyword_pop` | `typewriter` | `slide_stack` | `counter` | `split_compare` | `radial_burst` | `list_reveal` | `zoom_impact` | `glitch` | `wave` | `spotlight` | `card_flip` | `progress_bar` | `emoji_rain` | `parallax_layers` | `confetti_burst` | `sparkle_trail` | `pulse_ring`

---

## 6. Meme Ad Video Maker

### 6.1 Overview

Synthesizes meme hook video (user upload) + AI ad script into viral ad video. IntrohHook.com concept — attention-grabbing meme clip followed by brand ad.

### 6.2 Flow (3 steps)

```
[Step 1: Input]                    [Step 2: Ad Script]              [Step 3: Video Production]
Hook video upload (1~10s MP4)  →   AI ad script generation       →   Phase A: TTS narration
External site link CTA              Per-scene narration/subtitle     Phase A+: BGM (optional)
Brand/product info                  Chat-based revision              Phase A-2: AI images (image/video type)
Ad length (5/10/15s)                Start over / Produce             Phase A-3: Image confirm + regen
Transition (fade/flash/glitch/zoom)                                  Phase A-4: I2V conversion (video type)
Aspect ratio (9:16/3:4/1:1)                                         Phase B: Remotion preview
Video type (motion/image/video)                                      Phase C: MP4 rendering
Visual style (5 types, motion only)                                  Phase D: Download (MP4/TXT)
I2V model (Wan/Hailuo/Kling)
Narration voice / BGM
```

### 6.3 Technical Implementation

- **Hook frame extraction**: `<video>` → `video.currentTime` seek → `createImageBitmap()` → cover-fit to target resolution
- **Hook audio extraction**: `fetch(objectURL)` → `AudioContext.decodeAudioData()` (skip if no audio)
- **Transition rendering**: Fade from hook last frame to black → fade in ad first frame
- **Ad scenes**: Reuses short-form `SceneRenderer`, `SubtitleOverlay`, motion components
- **Audio mixing**: Hook audio + TTS + BGM via `OfflineAudioContext`

---

## 7. Ad Copy Maker

### 7.1 Flow (2 steps)

```
[Step 1: Input]                    [Step 2: Result]
Product/service (required)     →   Copy card list
Target customer (optional)          Each: headline + subtext + CTA button
Goal action select                  Tone badge + strategy tags + explanation
CTA location select                 Individual/bulk copy
Copy count (3/5/8)                  Chat-based revision
```

### 7.2 Ad Strategy Framework (10 types)

| Category | Strategy | Example |
|----------|----------|---------|
| Behavioral Economics | 1. Loss aversion | "Don't miss out" |
| Behavioral Economics | 2. Specific numbers | "3 signals", "90% probability" |
| Behavioral Economics | 3. Target callout | "If you're a 30s office worker" |
| Behavioral Economics | 4. Simplicity/immediacy | "Just 3 seconds" |
| Copy Type | 5. Problem agitation | "Still working overtime?" |
| Copy Type | 6. Benefit promise | "Cut work time by 50%" |
| Copy Type | 7. Curiosity trigger | "Secret only 1% know" |
| Copy Type | 8. Solution offering | "Here's how to do it" |
| Copy Type | 9. Question prompt | "Have a question?" |
| Copy Type | 10. Action trigger | "Start now" |

---

## 8. Ad Creative Maker

### 8.1 Flow (3 steps)

```
[Step 1: Input]              [Step 2: Plan]             [Step 3: Image Generation]
Product/service (required) →  3 options (A/B/C)       →  Generate selected option images
Target customer (optional)    Strategy/copy/design/color  Individual/batch generation
Ad channel (7 channels)       Chat-based revision         Regenerate / download
Image ratio select            Select option → generate    Back to plan revision
Goal action select
```

### 8.2 Supported Ad Channels (7)

| Channel | Ratio Options |
|---------|---------------|
| **Instagram** | Feed vertical 4:5 · Feed square 1:1 · Story/Reels 9:16 |
| **Meta (Facebook)** | Feed landscape 1.91:1 · Feed square 1:1 · Story 9:16 |
| **GDN (Google)** | Responsive landscape 1.91:1 · Square 1:1 · Vertical 4:5 |
| **Kakao Moment** | Banner landscape 1.91:1 · Square 1:1 |
| **Naver GFA** | Banner landscape 1.91:1 · Square 1:1 |
| **YouTube** | Thumbnail 16:9 · Bumper ad 16:9 |
| **TikTok** | Feed vertical 9:16 |

### 8.3 Design System

| Element | Options |
|---------|---------|
| Background | Bold Solid Color / Soft Gradient / Minimal Texture |
| Main Visual | Hand+Phone / Hand+Product / Illustration / Product Arrangement / Photo Person / 3D Object |
| Decorative | Cute Minimal 3D / Subtle Sparkles / Graphic Shapes / Minimal Icons / None |
| Typography | Bold Direct / Label Box / Mixed Hierarchy / 3D Typography |

---

## 9. Thumbnail Maker

### 9.1 Flow (2 steps)

```
[Step 1: Input]                    [Step 2: Result]
Prompt text (required)         →   Image grid (progress bar)
Reference image (optional)         Individual regenerate / download
Reference mode (style/character)   ZIP bulk download
Aspect ratio (9:16/3:4/1:1/16:9)
Count (1~4 preset / custom up to 50)
File format (PNG/JPG/WebP)
```

### 9.2 Key Features

| Feature | Description |
|---------|-------------|
| **Reference image** | Upload ≤10MB, base64 → Gemini |
| **Reference mode** | `style_only` (color/composition/mood) / `style_and_character` (face/identity fixed, outfit/background free) |
| **List auto-detection** | Parse line-break list → per-item individual prompts |
| **Batch processing** | 4 images parallel (`Promise.allSettled`), sequential between groups |
| **Format conversion** | Canvas-based PNG/JPG/WebP conversion |
| **No-text rule** | "Do NOT include ANY text" built into prompt |
| **Safety filter retry** | On Gemini empty response (safety block), simplify prompt and retry once |

---

## 10. Edge Functions Detail

### 10.1 generate-card-news

- **Role**: Topic → slide plan JSON
- **AI**: Gemini 2.5 Flash (`responseMimeType: 'application/json'`)
- **Input**: `{ topic, slideCount, ratio }`
- **Output**: `{ title, slides: [{ slide_number, type, headline, subtext?, body?, image_prompt, search_keyword, color_scheme }] }`
- **Prompt features**: 8 behavioral economics copy strategies + anti-AI cliche guide
- **Env vars**: `GOOGLE_API_KEY`

### 10.2 generate-card-image

- **Role**: Image prompt → background image (base64 PNG)
- **AI**: Gemini Flash Image (`responseModalities: ['TEXT', 'IMAGE']`)
- **Input**: `{ image_prompt?, aspect_ratio?, reference_image?, slide_context? }`
- **Regeneration**: When `slide_context` provided, builds prompt from headline, body, type, topic
- **429 retry**: 3 times, 10s/20s/30s intervals
- **Env vars**: `GOOGLE_API_KEY`

### 10.3 search-stock-image

- **Role**: Unsplash → Pexels fallback image search proxy
- **Method**: GET request, query params (`query`, `page`, `orientation`)
- **Unsplash compliance**: hotlink `photo.urls.regular` ✅ / download trigger ✅ / attribution ✅
- **Env vars**: `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`

### 10.4 generate-short-form

- **Role**: Topic → short-form script JSON
- **AI**: Gemini 2.5 Flash (`responseMimeType: 'application/json'`)
- **Input**: `{ topic, duration, platform, videoType?, revision? }`
- **Output**: `{ title, hook, total_duration, scenes, hashtags, bgm_mood, thumbnail_text }`
- **videoType branching**: `motion` adds 18 motion styles + layout guide + color palette → per-scene `motion_style`, `layout`, `icon`, `accent_color`, `glow_color`
- **Env vars**: `GOOGLE_API_KEY`

### 10.5 generate-tts

- **Role**: Text → narration audio (mp3 base64)
- **Primary**: ElevenLabs (`eleven_turbo_v2_5`, 5 voices)
- **Fallback**: OpenAI TTS (`tts-1-hd`) — auto-switch on ElevenLabs failure
- **Input**: `{ text, voice?, speed? }`
- **Output**: `{ audio: "data:audio/mp3;base64,..." }`
- **Sentence pause processing**:
  1. Edge Function preprocessing: period/question/exclamation → `\n\n`, comma → `,... `
  2. Frontend: 0.5s silence padding at end of each TTS audio
- **ElevenLabs voices** (5):
  - `aria` (default) — calm female
  - `sarah` — warm female
  - `laura` — bright female
  - `roger` — trustworthy male
  - `charlie` — clear male
- **Env vars**: `ELEVENLABS_API_KEY`, `OPENAI_API_KEY` (fallback)

### 10.6 generate-bgm

- **Role**: Mood keyword → royalty-free BGM search + Jamendo streaming URL
- **API**: Jamendo API v3.0 (REST, Client ID only — no OAuth)
- **Input**: `{ mood, duration? }`
- **Output**: `{ audioUrl: "https://...", track: { id, name, artist, duration, license, url } }`
- **Architecture**: Edge Function returns URL only, frontend fetches directly (prevents Edge Function memory overflow)
- **Search logic**: mood → tag mapping → instrumental priority → popularity sort → random from top 5
- **Mood options** (9): none, bright, calm, tense, emotional, hip/trendy, exciting, motivational, mystery
- **Env vars**: `JAMENDO_CLIENT_ID`
- **Cost**: Free (35,000 req/month, non-commercial)

### 10.7 generate-meme-ad

- **Role**: Brand info → meme ad script JSON (ad portion only)
- **AI**: Gemini 2.5 Flash (`responseMimeType: 'application/json'`)
- **Input**: `{ brandInfo, adDuration, hookDuration, videoType? }`
- **Scene types**: intro, benefit, feature, testimonial, offer, cta
- **Env vars**: `GOOGLE_API_KEY`

### 10.8 generate-ad-copy

- **Role**: Product info → ad copy JSON
- **AI**: Gemini 2.5 Flash
- **Input**: `{ product, target?, goalAction?, ctaLocation?, copyCount?, revision? }`
- **Output**: `{ product_summary, copies: [{ id, headline, subtext, cta_button, strategies, explanation, tone }] }`
- **Env vars**: `GOOGLE_API_KEY`

### 10.9 generate-ad-creative

- **Role**: Product info → 3 ad creative option plans JSON
- **AI**: Gemini 2.5 Flash
- **Input**: `{ product, target?, goalAction?, revision? }`
- **Output**: `{ options: [{ id, strategy_name, headline, subtext, cta_text, design, image_prompt }] }`
- **Env vars**: `GOOGLE_API_KEY`

### 10.10 generate-ad-image

- **Role**: Narrative-style prompt → ad poster image (base64 PNG)
- **AI**: Gemini Flash Image
- **Fixed spec**: 4:5 (1080×1350px)
- **429 retry**: 3 times, 10s/20s/30s intervals
- **Env vars**: `GOOGLE_API_KEY`

### 10.11 generate-scene-video

- **Role**: Replicate Image-to-Video async proxy (submit/poll 2-step)
- **API**: Replicate Predictions API (REST)
- **Input (submit)**: `{ action: 'submit', model?, image_data_url, motion_style? }`
- **Input (poll)**: `{ action: 'poll', request_id }`
- **Prompt policy**: **Camera motion only** — does NOT pass `scene.visual`. Only zoom/pan/tilt instructions. Explicitly forbids new objects/people/text generation.
- **Models**: `wan` (default, cheapest) / `hailuo` (balanced) / `kling` (highest quality)
- **Cost**: Wan ~$0.10/scene, Hailuo ~$0.15/scene, Kling ~$0.35/scene
- **Env vars**: `REPLICATE_API_TOKEN`

### 10.12 generate-thumbnail-image

- **Role**: Prompt + reference → thumbnail image (base64 PNG)
- **AI**: Gemini Flash Image
- **Input**: `{ prompt, reference_image?, reference_mode?, aspect_ratio? }`
- **reference_mode**: `style_only` / `style_and_character`
- **No-text rule**: Auto-appended "CRITICAL RULE: Do NOT include ANY text..."
- **Safety filter retry**: On empty response, simplify prompt and retry once
- **Env vars**: `GOOGLE_API_KEY`

---

## 11. Dependencies

```json
// Card News
"jszip": "^3.x",           // ZIP download
"html-to-image": "^1.x",   // DOM → PNG conversion

// Short-form Video
"remotion": "4.0.379+",               // Remotion core
"@remotion/player": "4.0.379+",       // Browser preview Player
"@remotion/transitions": "4.0.379+",  // TransitionSeries
"@remotion/lottie": "4.0.379+",       // Lottie overlay
"mp4-muxer": "5.2.2"                  // Canvas + WebCodecs → MP4 encoding
```

---

## 12. CapCut Project Export

### Overview

Converts TTS narration + subtitles to CapCut project file (`draft_content.json`) as ZIP. Users open in CapCut Desktop to add effects/transitions/motion graphics — a **semi-automated** workflow.

**Key limitation**: CapCut has no official API. Reverse-engineered project file generation is the extent of automation.

### ZIP Structure

```
capcut_project/
├── draft_content.json     # CapCut project file (timeline, tracks, assets)
├── draft_meta_info.json   # Project meta info
└── tts/
    ├── scene_001.mp3      # Scene 1 TTS narration
    ├── scene_002.mp3      # Scene 2 TTS narration
    └── ...
```

### Usage

1. Generate script → TTS in Short-form Maker
2. Click "Export to CapCut" in Phase B (preview) or Phase D (complete)
3. Download ZIP
4. Extract to CapCut project folder
   - Windows: `C:\Users\<user>\AppData\Local\CapCut\User Data\Projects\com.lveditor.draft\`
5. Open project in CapCut Desktop
6. Manually add effects, transitions, backgrounds → export

---

## 13. Parallel Processing Optimization

| Page | Feature | Batch Size | Method |
|------|---------|-----------|--------|
| **Short-form** | AI image generation | 3 at a time | `Promise.allSettled` |
| **Short-form** | Stock image search | 3 at a time | `Promise.allSettled` |
| **Short-form** | I2V video submit | **1 sequential** | Sequential (Replicate rate limit) + Edge Function 429 retry ×3 |
| **Short-form** | I2V video polling | All concurrent | 5s interval, max 5min |
| **Card News** | AI image generation | 3 at a time | `Promise.allSettled` |
| **Card News** | Unsplash search | 3 at a time | `Promise.allSettled` |
| **Meme Ad** | TTS generation | 3 at a time | `Promise.allSettled` |
| **Meme Ad** | Image generation | 3 at a time | `Promise.allSettled` |
| **Ad Creative** | Image generation | All concurrent (3) | `Promise.allSettled` |

---

## 14. Known Limitations

| Item | Status | Note |
|------|--------|------|
| Unsplash production approval | ⚠️ | Currently 50req/hour limit. Apply for 5,000req/hour |
| Video rendering | ⚠️ Chrome/Edge only | WebCodecs API required. Safari/Firefox not supported |
| CapCut export | Project file only | No official API — no automated editing/rendering |
| BGM Jamendo API | ⚠️ Non-commercial | 35,000 req/month free. Commercial use requires Jamendo licensing |
| Meme ad hook frame extraction | ⚠️ Slow | 5s hook = 150 frames, 5~10s extraction time |
| Image generation time | ⚠️ | ~5-15s per scene, 20-60s for 6 scenes (3 parallel). Longer with 429 retries |

---

## 15. Cost Summary

| Service | Cost | Usage |
|---------|------|-------|
| Gemini 2.5 Flash | Pay-per-use | Script/copy/creative generation |
| Gemini Flash Image | Pay-per-use | Card news/ad/thumbnail images |
| ElevenLabs TTS | $5/mo Starter (30,000 chars) | Narration (primary) |
| OpenAI TTS | ~$0.005/30s | Narration (fallback) |
| Replicate I2V | $0.10~0.35/scene | Image-to-Video (Wan/Hailuo/Kling) |
| Unsplash | Free | Stock image search |
| Pexels | Free | Stock image search (fallback) |
| Jamendo | Free (non-commercial) | BGM search |
| Apify | ~$0.01/call ($5/mo free) | X trending scraper |

---

**Last Updated**: 2026-03-24
