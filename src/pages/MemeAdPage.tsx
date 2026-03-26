import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Player } from '@remotion/player';
import { supabaseUrl } from '../lib/supabase';
import ArrowLeft from '../components/ArrowLeft';
import MemeAdVideo, { computeTotalMemeAdFrames } from '../meme-ad/compositions/MemeAdVideo';
import { VIDEO_FPS, AD_DURATIONS, MAX_HOOK_DURATION, MIN_HOOK_DURATION, MAX_HOOK_FILE_SIZE, HOOK_SITES } from '../meme-ad/constants';
import { ASPECT_RATIOS } from '../shortform/constants';
import { renderMemeAdVideoToMp4 } from '../meme-ad/renderMemeAdVideo';
import { isWebCodecsSupported } from '../shortform/renderVideo';
import type { Scene, ScriptResult, TtsAudio, BgmAudio } from '../meme-ad/types';
import { BGM_MOODS, MOTION_THEMES } from '../shortform/types';
import type { MotionTheme, MotionStyle } from '../shortform/types';
import type { TransitionType } from '../meme-ad/compositions/TransitionOverlay';

// ── AudioBuffer → WAV Blob 변환 ──

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// ── **bold** 마크다운 → <strong> 렌더링 ──

function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  );
}

// ── Sanitize: 연속 중복 모션/전환 보정 ──

const ALL_MOTIONS: MotionStyle[] = [
  'keyword_pop', 'typewriter', 'slide_stack', 'counter', 'split_compare',
  'radial_burst', 'list_reveal', 'zoom_impact', 'glitch', 'wave',
  'spotlight', 'card_flip', 'progress_bar', 'emoji_rain', 'parallax_layers',
  'confetti_burst', 'sparkle_trail', 'pulse_ring',
];
const ALL_TRANSITIONS = ['cut', 'fade', 'zoom', 'slide', 'blur_in', 'wipe_left', 'scale_rotate'];

function sanitizeScriptResult(data: ScriptResult): ScriptResult {
  if (!data?.scenes?.length) return data;
  const scenes = data.scenes.map((scene, i, arr) => {
    const s = { ...scene };
    if (i > 0 && s.motion_style && s.motion_style === arr[i - 1].motion_style) {
      const others = ALL_MOTIONS.filter(m => m !== s.motion_style);
      s.motion_style = others[Math.floor(Math.random() * others.length)];
    }
    if (i > 0 && s.transition && s.transition === arr[i - 1].transition) {
      const others = ALL_TRANSITIONS.filter(t => t !== s.transition);
      s.transition = others[Math.floor(Math.random() * others.length)];
    }
    return s;
  });
  return { ...data, scenes };
}

// ── Constants ──

const VIDEO_TYPES = [
  { id: 'motion', label: '모션 그래픽', desc: '텍스트 + 애니메이션' },
  { id: 'image', label: '이미지 기반', desc: 'AI 이미지 + 줌/패닝 효과' },
  { id: 'video', label: '영상 기반', desc: 'AI 이미지 → AI 영상' },
] as const;

const I2V_MODELS = [
  { id: 'wan', label: 'Wan 2.5', desc: '최저가 · ~$0.60/영상' },
  { id: 'hailuo', label: 'Hailuo Fast', desc: '가성비 · ~$0.90/영상' },
  { id: 'kling', label: 'Kling v2.1', desc: '고품질 · ~$2.10/영상' },
] as const;

type VideoType = 'image' | 'motion' | 'video';
type I2vModel = typeof I2V_MODELS[number]['id'];
type ImageSource = 'ai' | 'stock';

const IMAGE_SOURCES = [
  { id: 'ai' as const, label: 'AI 생성', desc: 'Gemini 이미지' },
  { id: 'stock' as const, label: '스톡 이미지', desc: 'Unsplash·Pexels' },
] as const;

const REFERENCE_MODES = [
  { id: 'style_only' as const, label: '스타일만 참고', desc: '색감·구도·분위기' },
  { id: 'style_and_character' as const, label: '캐릭터+스타일', desc: '캐릭터·인물 유지' },
] as const;

// ── Types ──

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Step = 'input' | 'review' | 'result';
type VideoPhase = 'tts' | 'bgm' | 'images' | 'image_review' | 'videos' | 'preview' | 'rendering' | 'done';

const NARRATION_VOICES = [
  { id: 'none', label: '나레이션 없음', desc: '' },
  { id: 'aria', label: 'Aria', desc: '차분한 여성' },
  { id: 'sarah', label: 'Sarah', desc: '따뜻한 여성' },
  { id: 'laura', label: 'Laura', desc: '명랑한 여성' },
  { id: 'roger', label: 'Roger', desc: '신뢰감 남성' },
  { id: 'charlie', label: 'Charlie', desc: '또렷한 남성' },
] as const;

type NarrationVoice = typeof NARRATION_VOICES[number]['id'];

// ── Design Tokens ──

const C = {
  primary: '#48b2af',
  primaryDark: '#41a09e',
  primaryPressed: '#389998',
  primaryLight: '#f0f8f8',
  primaryTint: '#E4F7F7',
  surface: '#ffffff',
  surfaceDisabled: '#f8f8f8',
  surfaceSecondary: '#f9f9f9',
  surfaceTertiary: '#f3f3f3',
  surfaceInput: '#f3f3f5',
  borderDefault: '#e7e7e7',
  borderDivider: '#f3f3f3',
  textPrimary: '#151515',
  textBlack: '#000000',
  textSecondary: '#525252',
  textTertiary: '#6d6d6d',
  textCaption: '#848484',
  textDisabled: '#b7b7b7',
  textWhite: '#ffffff',
  destructive: '#d4183d',
};

const font = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif";


const TRANSITIONS: { id: TransitionType; label: string; desc: string }[] = [
  { id: 'fade', label: '부드럽게', desc: '자연스러운 전환' },
  { id: 'flash', label: '번쩍', desc: '강렬한 전환' },
  { id: 'glitch', label: '찢어짐', desc: '파격적 전환' },
  { id: 'zoom', label: '확대', desc: '빨려드는 전환' },
];

// ── Main Page ──

export default function MemeAdPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('input');

  // Step 1 inputs
  const [hookFile, setHookFile] = useState<File | null>(null);
  const [hookUrl, setHookUrl] = useState<string | null>(null);
  const [hookDuration, setHookDuration] = useState<number>(0);
  const [brandInfo, setBrandInfo] = useState('');
  const [adDuration, setAdDuration] = useState<number>(10);
  const [transitionType, setTransitionType] = useState<TransitionType>('fade');
  const [aspectRatio, setAspectRatio] = useState<string>('9:16');
  const [videoType, setVideoType] = useState<VideoType>('motion');
  const [imageSource, setImageSource] = useState<ImageSource>('ai');
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [refBase64, setRefBase64] = useState<string | null>(null);
  const [refMode, setRefMode] = useState<'style_only' | 'style_and_character'>('style_only');
  const [refDragging, setRefDragging] = useState(false);
  const [motionTheme, setMotionTheme] = useState<MotionTheme>('colorful_pop');
  const [i2vModel, setI2vModel] = useState<I2vModel>('wan');
  const [narrationVoice, setNarrationVoice] = useState<NarrationVoice>('none');
  const [bgmMood, setBgmMood] = useState<string>('none');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reference image helpers
  const processRefFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) { setError('10MB 이하만 업로드 가능'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setRefPreview(dataUrl);
      setRefBase64(dataUrl.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Video state
  const [videoPhase, setVideoPhase] = useState<VideoPhase>('tts');
  const [ttsAudios, setTtsAudios] = useState<TtsAudio[]>([]);
  const [ttsProgress, setTtsProgress] = useState(0);
  const [imageProgress, setImageProgress] = useState(0);
  const [renderProgress, setRenderProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [bgmAudio, setBgmAudio] = useState<BgmAudio | null>(null);
  const [regenScenes, setRegenScenes] = useState<Set<number>>(new Set());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [videoGenProgress, setVideoGenProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const ttsAbortRef = useRef(false);

  // ── Computed dimensions from aspect ratio ──
  const selectedRatio = ASPECT_RATIOS.find(r => r.id === aspectRatio) || ASPECT_RATIOS[0];
  const videoWidth = selectedRatio.width;
  const videoHeight = selectedRatio.height;

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Hook video upload handler ──

  const handleFileSelect = async (file: File) => {
    setError(null);

    if (!file.type.startsWith('video/')) {
      setError('MP4 영상 파일만 업로드할 수 있습니다');
      return;
    }
    if (file.size > MAX_HOOK_FILE_SIZE) {
      setError(`파일 크기가 ${MAX_HOOK_FILE_SIZE / 1024 / 1024}MB를 초과합니다`);
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const dur = video.duration;
      if (dur < MIN_HOOK_DURATION) {
        setError(`영상이 너무 짧습니다 (최소 ${MIN_HOOK_DURATION}초)`);
        URL.revokeObjectURL(url);
        return;
      }
      if (dur > MAX_HOOK_DURATION) {
        setError(`영상이 너무 깁니다 (최대 ${MAX_HOOK_DURATION}초)`);
        URL.revokeObjectURL(url);
        return;
      }

      if (hookUrl) URL.revokeObjectURL(hookUrl);
      setHookFile(file);
      setHookUrl(url);
      setHookDuration(dur);
    };

    video.onerror = () => {
      setError('영상을 읽을 수 없습니다');
      URL.revokeObjectURL(url);
    };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  // ── Edge function helper ──

  const callEdgeFunction = async (name: string, body: Record<string, unknown>) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `${name} 호출 실패`);
    return data;
  };

  // ── Step 1: Generate ad script ──

  const handleGenerate = async () => {
    if (!brandInfo.trim() || !hookFile) return;
    setIsGenerating(true);
    setError(null);
    setResult(null);
    setChatMessages([]);

    try {
      const data = await callEdgeFunction('generate-meme-ad', {
        brandInfo: brandInfo.trim(),
        adDuration,
        hookDuration: Math.round(hookDuration),
        videoType: videoType === 'video' ? 'image' : videoType,
      });
      setResult(sanitizeScriptResult(data));
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Step 2: Revise ──

  const handleRevise = async () => {
    if (!chatInput.trim() || !result) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsRevising(true);
    setError(null);

    try {
      const currentScript = JSON.stringify(result, null, 2);
      const data = await callEdgeFunction('generate-meme-ad', {
        brandInfo: brandInfo.trim(),
        adDuration: result.total_duration,
        hookDuration: Math.round(hookDuration),
        videoType: videoType === 'video' ? 'image' : videoType,
        revision: {
          currentScript,
          request: userMsg,
        },
      });
      setResult(sanitizeScriptResult(data));
      setChatMessages(prev => [...prev, { role: 'assistant', content: '대본을 수정했습니다!' }]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '오류';
      setChatMessages(prev => [...prev, { role: 'assistant', content: `수정 실패: ${errMsg}` }]);
    } finally {
      setIsRevising(false);
    }
  };

  // ── Step 3: TTS ──

  const generateAllTts = useCallback(async (scenes: Scene[]) => {
    setVideoPhase('tts');
    setTtsAudios([]);
    setTtsProgress(0);
    setError(null);
    ttsAbortRef.current = false;

    // 나레이션 없음이면 TTS 건너뛰기
    if (narrationVoice === 'none') {
      if (bgmMood !== 'none') {
        setVideoPhase('bgm');
      } else if (videoType === 'image') {
        setVideoPhase('images');
      } else {
        setVideoPhase('preview');
      }
      return;
    }

    const audios: TtsAudio[] = [];
    const TTS_BATCH = 3;

    for (let i = 0; i < scenes.length; i += TTS_BATCH) {
      if (ttsAbortRef.current) return;
      const batch = scenes.slice(i, Math.min(i + TTS_BATCH, scenes.length));

      const results = await Promise.allSettled(
        batch.map(async (scene) => {
          const data = await callEdgeFunction('generate-tts', {
            text: scene.narration,
            voice: narrationVoice,
            speed: 1.0,
          });

          const base64 = data.audio.split(',')[1];
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);

          const audioCtx = new AudioContext();
          const buffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0));

          // 0.5초 무음 패딩 — 씬 간 호흡 공간
          const SILENCE_PADDING = 0.5;
          const paddedLength = buffer.length + Math.round(SILENCE_PADDING * buffer.sampleRate);
          const paddedBuffer = audioCtx.createBuffer(buffer.numberOfChannels, paddedLength, buffer.sampleRate);
          for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            paddedBuffer.getChannelData(ch).set(buffer.getChannelData(ch));
          }

          const wavBlob = audioBufferToWav(paddedBuffer);
          const paddedDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(wavBlob);
          });

          await audioCtx.close();

          return {
            sceneNumber: scene.scene_number,
            dataUrl: paddedDataUrl,
            durationInSeconds: paddedBuffer.duration,
          };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          audios.push(r.value);
        } else {
          setError(`TTS 생성 실패: ${r.reason instanceof Error ? r.reason.message : '오류'}`);
          return;
        }
      }

      setTtsAudios([...audios]);
      setTtsProgress(Math.min(i + batch.length, scenes.length) / scenes.length);
    }

    // BGM 생성 또는 이미지 또는 프리뷰로
    if (bgmMood !== 'none') {
      setVideoPhase('bgm');
    } else if (videoType === 'image' || videoType === 'video') {
      setVideoPhase('images');
    } else {
      setVideoPhase('preview');
    }
  }, [narrationVoice, bgmMood, videoType]);

  useEffect(() => {
    if (step === 'result' && result && videoPhase === 'tts' && ttsAudios.length === 0) {
      generateAllTts(result.scenes);
    }
  }, [step, result, videoPhase, ttsAudios.length, generateAllTts]);

  // ── Step 3-A+: BGM Generation ──

  const generateBgm = useCallback(async (mood: string, targetDuration: number) => {
    setBgmAudio(null);
    setError(null);

    try {
      const data = await callEdgeFunction('generate-bgm', {
        mood,
        duration: targetDuration,
      });

      if (data.audioUrl && data.track) {
        const audioRes = await fetch(data.audioUrl);
        const audioBlob = await audioRes.blob();
        const arrayBuf = await audioBlob.arrayBuffer();

        const audioCtx = new AudioContext();
        const buffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
        await audioCtx.close();

        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(audioBlob);
        });

        setBgmAudio({
          dataUrl,
          durationInSeconds: buffer.duration,
          track: data.track,
        });
      }
    } catch (err) {
      console.warn('BGM 생성 실패 (계속 진행):', err);
    }

    if (videoType === 'image' || videoType === 'video') {
      setVideoPhase('images');
    } else {
      setVideoPhase('preview');
    }
  }, [videoType]);

  useEffect(() => {
    if (step === 'result' && result && videoPhase === 'bgm') {
      generateBgm(bgmMood, result.total_duration + hookDuration);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, result, videoPhase, generateBgm]);

  // ── Step 3-A2: Generate scene images ──

  const generateSceneImages = useCallback(async (scenes: Scene[]) => {
    setImageProgress(0);
    setError(null);

    const updatedScenes = [...scenes];
    const BATCH_SIZE = 3;
    const orientationMap: Record<string, string> = { '9:16': 'portrait', '3:4': 'portrait', '1:1': 'squarish' };

    if (imageSource === 'stock') {
      // 스톡 이미지 모드: Unsplash/Pexels 검색
      for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
        if (ttsAbortRef.current) return;
        const batch = scenes.slice(i, Math.min(i + BATCH_SIZE, scenes.length));

        const results = await Promise.allSettled(
          batch.map(async (scene) => {
            const query = scene.visual || scene.subtitle.replace(/\*\*/g, '');
            const res = await fetch(`${supabaseUrl}/functions/v1/search-stock-image?query=${encodeURIComponent(query)}&orientation=${orientationMap[aspectRatio] || 'portrait'}`);
            const data = await res.json();
            return { sceneNumber: scene.scene_number, url: data.url as string | undefined };
          })
        );

        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.url) {
            const idx = updatedScenes.findIndex(s => s.scene_number === r.value.sceneNumber);
            if (idx >= 0) updatedScenes[idx] = { ...updatedScenes[idx], backgroundImageUrl: r.value.url };
          }
        }

        setImageProgress(Math.min(i + batch.length, scenes.length) / scenes.length);
      }
    } else {
      // AI 이미지 모드: Gemini 생성
      for (let i = 0; i < scenes.length; i += BATCH_SIZE) {
        if (ttsAbortRef.current) return;
        const batch = scenes.slice(i, Math.min(i + BATCH_SIZE, scenes.length));

        const results = await Promise.allSettled(
          batch.map(async (scene) => {
            const payload: Record<string, unknown> = {
              slide_context: {
                headline: scene.subtitle.replace(/\*\*/g, ''),
                body: scene.narration,
                type: scene.type === 'cta' ? 'cta' : 'content',
                topic: brandInfo,
              },
              aspect_ratio: aspectRatio,
            };
            if (refBase64) {
              payload.reference_image = refBase64;
              payload.reference_mode = refMode;
            }
            const data = await callEdgeFunction('generate-card-image', payload);
            return { sceneNumber: scene.scene_number, image: data.image, mimeType: data.mimeType };
          })
        );

        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.image) {
            const { sceneNumber, image, mimeType } = r.value;
            const dataUrl = `data:${mimeType || 'image/png'};base64,${image}`;
            const idx = updatedScenes.findIndex(s => s.scene_number === sceneNumber);
            if (idx >= 0) updatedScenes[idx] = { ...updatedScenes[idx], backgroundImageUrl: dataUrl };
          }
        }

        setImageProgress(Math.min(i + batch.length, scenes.length) / scenes.length);
      }
    }

    setResult(prev => prev ? { ...prev, scenes: updatedScenes } : prev);
    setVideoPhase('image_review');
  }, [brandInfo, imageSource, aspectRatio, refBase64, refMode]);

  useEffect(() => {
    if (step === 'result' && result && videoPhase === 'images') {
      generateSceneImages(result.scenes);
    }
  }, [step, result, videoPhase, generateSceneImages]);

  // ── Regenerate single scene image ──

  const regenerateSceneImage = useCallback(async (scene: Scene) => {
    if (regenScenes.has(scene.scene_number)) return;
    setRegenScenes(prev => new Set(prev).add(scene.scene_number));
    setError(null);

    try {
      const regenPayload: Record<string, unknown> = {
        slide_context: {
          headline: scene.subtitle.replace(/\*\*/g, ''),
          body: scene.narration,
          type: scene.type === 'cta' ? 'cta' : 'content',
          topic: brandInfo,
        },
        aspect_ratio: aspectRatio,
      };
      if (refBase64) {
        regenPayload.reference_image = refBase64;
        regenPayload.reference_mode = refMode;
      }
      const data = await callEdgeFunction('generate-card-image', regenPayload);

      if (data.image) {
        const dataUrl = `data:${data.mimeType || 'image/png'};base64,${data.image}`;
        setResult(prev => {
          if (!prev) return prev;
          const scenes = prev.scenes.map(s =>
            s.scene_number === scene.scene_number
              ? { ...s, backgroundImageUrl: dataUrl }
              : s
          );
          return { ...prev, scenes };
        });
      }
    } catch (err) {
      setError(`씬 ${scene.scene_number} 재생성 실패: ${err instanceof Error ? err.message : '오류'}`);
    } finally {
      setRegenScenes(prev => {
        const next = new Set(prev);
        next.delete(scene.scene_number);
        return next;
      });
    }
  }, [regenScenes, brandInfo, aspectRatio, refBase64, refMode]);

  // ── Step 3-A3: Generate scene background videos (Replicate I2V) ──

  const generateSceneVideos = useCallback(async (scenes: Scene[]) => {
    setVideoGenProgress(0);
    setError(null);

    const scenesWithImages = scenes.filter(s => s.backgroundImageUrl);
    if (scenesWithImages.length === 0) {
      setVideoPhase('preview');
      return;
    }

    // 1. Submit scenes to Replicate queue (순차 요청)
    const submissions: { sceneNumber: number; requestId: string }[] = [];
    let submitFailCount = 0;

    for (let i = 0; i < scenesWithImages.length; i++) {
      if (ttsAbortRef.current) return;
      const scene = scenesWithImages[i];

      try {
        const data = await callEdgeFunction('generate-scene-video', {
          action: 'submit',
          model: i2vModel,
          image_data_url: scene.backgroundImageUrl,
          motion_style: scene.motion_style,
        });
        if (data.request_id) {
          submissions.push({ sceneNumber: scene.scene_number, requestId: data.request_id as string });
        } else {
          submitFailCount++;
        }
      } catch {
        submitFailCount++;
      }

      if (i === 0 && submissions.length === 0 && submitFailCount > 0) {
        console.warn('[MemeAd] I2V API 연결 실패, 이미지 배경으로 폴백');
        setError('AI 영상 배경 생성을 건너뛰었습니다 (API 연결 오류). 이미지 배경으로 영상이 생성됩니다.');
        setVideoPhase('preview');
        return;
      }

      if (i + 3 < scenesWithImages.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (submissions.length === 0) {
      setError('AI 영상 배경 생성을 건너뛰었습니다. 이미지 배경으로 영상이 생성됩니다.');
      setVideoPhase('preview');
      return;
    }

    // 2. Poll all in parallel (최대 5분)
    const completed = new Set<number>();
    const updatedScenes = [...scenes];
    let videoSuccessCount = 0;

    for (let attempt = 0; attempt < 60; attempt++) {
      if (ttsAbortRef.current) return;
      if (completed.size >= submissions.length) break;

      await new Promise(r => setTimeout(r, 5000));

      for (const sub of submissions) {
        if (completed.has(sub.sceneNumber)) continue;

        try {
          const data = await callEdgeFunction('generate-scene-video', {
            action: 'poll',
            model: i2vModel,
            request_id: sub.requestId,
          });

          if (data.status === 'COMPLETED' && data.video_url) {
            completed.add(sub.sceneNumber);
            videoSuccessCount++;
            const idx = updatedScenes.findIndex(s => s.scene_number === sub.sceneNumber);
            if (idx >= 0) {
              updatedScenes[idx] = { ...updatedScenes[idx], backgroundVideoUrl: data.video_url as string };
            }
            setVideoGenProgress(completed.size / submissions.length);
          }

          if (data.status === 'FAILED') {
            completed.add(sub.sceneNumber);
            setVideoGenProgress(completed.size / submissions.length);
          }
        } catch (err) {
          console.warn(`Poll failed for scene ${sub.sceneNumber}:`, err);
        }
      }
    }

    if (completed.size < submissions.length) {
      console.warn(`[MemeAd] ${submissions.length - completed.size}개 씬 I2V 타임아웃, 이미지 폴백`);
    }

    if (videoSuccessCount < submissions.length) {
      const failCount = submissions.length - videoSuccessCount;
      setError(`${failCount}개 씬의 AI 영상이 생성되지 않아 이미지 배경으로 대체됩니다.`);
    }

    setResult(prev => prev ? { ...prev, scenes: updatedScenes } : prev);
    setVideoPhase('preview');
  }, [i2vModel]);

  // Auto-start video generation
  useEffect(() => {
    if (step === 'result' && result && videoPhase === 'videos') {
      generateSceneVideos(result.scenes);
    }
  }, [step, result, videoPhase, generateSceneVideos]);

  // ── Step 3: Render ──

  const handleRenderVideo = async () => {
    if (!result || !hookFile) return;
    setVideoPhase('rendering');
    setRenderProgress(0);
    setError(null);

    try {
      const blob = await renderMemeAdVideoToMp4(
        hookFile,
        hookDuration,
        result.scenes,
        ttsAudios,
        (p) => setRenderProgress(p),
        bgmAudio,
        videoWidth,
        videoHeight,
      );
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setVideoPhase('done');
    } catch (err) {
      setError(`렌더링 실패: ${err instanceof Error ? err.message : '오류'}`);
      setVideoPhase('preview');
    }
  };

  const handleDownloadVideo = () => {
    if (!videoUrl || !result) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `${result.title.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim().slice(0, 30) || 'meme-ad'}.mp4`;
    a.click();
  };

  const buildScriptText = (): string => {
    if (!result) return '';
    const lines: string[] = [];
    lines.push(`제목: ${result.title}`);
    lines.push(`훅 영상: ${hookDuration.toFixed(1)}초`);
    lines.push(`광고: ${result.total_duration}초`);
    lines.push('');
    for (const scene of result.scenes) {
      lines.push(`[씬 ${scene.scene_number}] ${scene.type} (${scene.duration}초)`);
      lines.push(`나레이션: ${scene.narration}`);
      lines.push(`자막: ${scene.subtitle}`);
      lines.push('');
    }
    lines.push(`해시태그: ${result.hashtags.map(h => `#${h}`).join(' ')}`);
    return lines.join('\n');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildScriptText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('클립보드 복사 실패');
    }
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([buildScriptText()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${result?.title?.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim().slice(0, 30) || 'meme-ad'}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const resetAll = () => {
    ttsAbortRef.current = true;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setStep('input');
    setBrandInfo('');
    setAdDuration(15);

    setResult(null);
    setError(null);
    setChatMessages([]);
    setChatInput('');
    setCopied(false);
    setVideoPhase('tts');
    setTtsAudios([]);
    setTtsProgress(0);
    setImageProgress(0);
    setRenderProgress(0);
    setVideoUrl(null);
    // Keep hook file for reuse
  };

  const goToResult = () => {
    setVideoPhase('tts');
    setTtsAudios([]);
    setTtsProgress(0);
    setImageProgress(0);
    setRenderProgress(0);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setStep('result');
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
  };

  const getCumulativeTime = (scenes: Scene[], index: number) => {
    let t = 0;
    for (let i = 0; i < index; i++) t += scenes[i].duration;
    return t;
  };

  // ── CTA Button ──
  const ctaButton = (label: string, onClick: () => void, disabled: boolean) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center"
      style={{
        height: '56px', borderRadius: '16px',
        backgroundColor: disabled ? C.surfaceDisabled : C.primary,
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
      }}
      onPointerDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(0.99)'; }}
      onPointerUp={e => { e.currentTarget.style.transform = ''; }}
      onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
    >
      <span style={{
        fontFamily: font, fontSize: '16px', fontWeight: 500,
        lineHeight: '25px', letterSpacing: '-0.32px',
        color: disabled ? C.textDisabled : C.textWhite,
      }}>{label}</span>
    </button>
  );

  // ── Render ──

  return (
    <div className="bg-white relative min-h-screen w-full flex justify-center">
      <div className="w-full max-w-[440px] relative pb-[140px]" style={{ fontFamily: font }}>

        {/* NavigationHeader */}
        <div className="bg-white h-[52px] shrink-0 w-full z-20 fixed top-0 left-1/2 -translate-x-1/2 max-w-[440px]">
          <div className="flex flex-col justify-center size-full">
            <div className="content-stretch flex items-center justify-between px-[12px] py-[4px] relative size-full">
              <ArrowLeft onClick={() => navigate(-1)} />
              <p style={{
                fontFamily: font, fontSize: '18px', fontWeight: 600,
                lineHeight: '25.5px', letterSpacing: '-0.36px',
                color: C.textBlack, textAlign: 'center',
              }}>
                {step === 'input' ? '밈광고 메이커' : step === 'review' ? '광고 대본 검토' : '영상 제작'}
              </p>
              <div className="w-[44px]" />
            </div>
          </div>
        </div>

        <div className="h-[60px]" />

        <div style={{ padding: '0 20px' }}>

          {/* ════ STEP 1: Input ════ */}
          {step === 'input' && (
            <>
              <div style={{ marginBottom: '28px', marginTop: '8px' }}>
                <h1 style={{
                  fontFamily: font, fontSize: '22px', fontWeight: 600,
                  lineHeight: '32.5px', letterSpacing: '-0.22px',
                  color: C.textPrimary, margin: 0,
                }}>
                  밈광고 메이커
                </h1>
                <p style={{
                  fontFamily: font, fontSize: '15px', fontWeight: 400,
                  lineHeight: '20px', letterSpacing: '-0.45px',
                  color: C.textTertiary, marginTop: '8px',
                }}>
                  밈 후크 영상 + AI 광고를 합쳐 바이럴 영상을 만들어요
                </p>
              </div>

              {/* Hook Video Upload */}
              <section style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '8px',
                }}>
                  후크 밈 영상 (1~{MAX_HOOK_DURATION}초, MP4)
                </label>

                {hookUrl ? (
                  <div style={{ borderRadius: '16px', overflow: 'hidden', border: `1px solid ${C.borderDefault}`, marginBottom: '8px' }} className="transform-gpu">
                    <video
                      src={hookUrl}
                      controls
                      style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', backgroundColor: '#000' }}
                    />
                    <div className="flex items-center justify-between" style={{ padding: '10px 14px', backgroundColor: C.surfaceSecondary }}>
                      <span style={{ fontFamily: font, fontSize: '13px', fontWeight: 500, color: C.textSecondary }}>
                        {hookFile?.name} ({hookDuration.toFixed(1)}초)
                      </span>
                      <button
                        onClick={() => {
                          if (hookUrl) URL.revokeObjectURL(hookUrl);
                          setHookFile(null);
                          setHookUrl(null);
                          setHookDuration(0);
                        }}
                        style={{
                          fontFamily: font, fontSize: '12px', fontWeight: 500,
                          color: C.destructive, background: 'none', border: 'none', cursor: 'pointer',
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center"
                    style={{
                      height: '160px', borderRadius: '16px',
                      border: `2px dashed ${C.borderDefault}`,
                      backgroundColor: C.surfaceSecondary,
                      cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎬</div>
                    <span style={{
                      fontFamily: font, fontSize: '14px', fontWeight: 500,
                      color: C.textTertiary, marginBottom: '4px',
                    }}>
                      클릭 또는 드래그하여 업로드
                    </span>
                    <span style={{
                      fontFamily: font, fontSize: '12px', fontWeight: 400,
                      color: C.textCaption,
                    }}>
                      MP4, 최대 {MAX_HOOK_FILE_SIZE / 1024 / 1024}MB
                    </span>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={handleFileInput}
                  style={{ display: 'none' }}
                />

                {/* External hook site links */}
                <div style={{ marginTop: '12px' }}>
                  <span style={{
                    fontFamily: font, fontSize: '11px', fontWeight: 500,
                    color: C.textCaption,
                  }}>
                    후크 영상 다운로드 사이트
                  </span>
                  <div className="flex flex-wrap" style={{ gap: '6px', marginTop: '6px' }}>
                    {HOOK_SITES.map(site => (
                      <a
                        key={site.name}
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center',
                          padding: '4px 10px', borderRadius: '8px',
                          backgroundColor: C.primaryLight,
                          fontFamily: font, fontSize: '11px', fontWeight: 500,
                          color: C.primaryDark, textDecoration: 'none',
                          gap: '4px',
                        }}
                      >
                        {site.name}
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              </section>

              {/* Brand Info */}
              <section style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '8px',
                }}>
                  브랜드 / 제품 정보
                </label>
                <div style={{
                  backgroundColor: C.surface, border: `1px solid ${C.borderDefault}`,
                  borderRadius: '16px', padding: '12px',
                }}>
                  <textarea
                    value={brandInfo}
                    onChange={e => setBrandInfo(e.target.value)}
                    placeholder="예: MyApp - AI 콘텐츠 자동 생성 서비스. 숏폼·카드뉴스·광고 소재 원클릭 제작"
                    rows={3}
                    className="w-full outline-none bg-transparent resize-none"
                    style={{
                      fontFamily: font, fontSize: '15px', fontWeight: 400,
                      lineHeight: '20px', letterSpacing: '-0.45px',
                      color: C.textPrimary, border: 'none',
                    }}
                  />
                </div>
              </section>

              {/* Ad Duration */}
              <section style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  광고 길이
                </label>
                <div className="flex" style={{ gap: '10px' }}>
                  {AD_DURATIONS.map(d => {
                    const isSelected = adDuration === d;
                    return (
                      <button
                        key={d}
                        onClick={() => setAdDuration(d)}
                        className="flex-1 flex items-center justify-center"
                        style={{
                          height: '48px', borderRadius: '16px',
                          fontFamily: font, fontSize: '15px', fontWeight: isSelected ? 600 : 400,
                          letterSpacing: '-0.3px',
                          color: isSelected ? C.textWhite : C.textTertiary,
                          backgroundColor: isSelected ? C.primary : C.surface,
                          border: isSelected ? 'none' : `1px solid ${C.borderDefault}`,
                          cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                        onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                        onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                        onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                      >
                        {d}초
                      </button>
                    );
                  })}
                </div>
                {hookDuration > 0 && (
                  <p style={{
                    fontFamily: font, fontSize: '12px', fontWeight: 400,
                    color: C.textCaption, marginTop: '6px', paddingLeft: '4px',
                  }}>
                    총 영상: {formatTime(Math.round(hookDuration + adDuration))} (밈 {hookDuration.toFixed(1)}초 + 광고 {adDuration}초)
                  </p>
                )}
              </section>

              {/* Transition Type */}
              <section style={{ marginBottom: '32px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  밈 → 광고 전환 효과
                </label>
                <div className="flex" style={{ gap: '10px' }}>
                  {TRANSITIONS.map(t => {
                    const isSelected = transitionType === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTransitionType(t.id)}
                        className="flex-1 flex flex-col items-center justify-center"
                        style={{
                          height: '56px', borderRadius: '16px',
                          fontFamily: font,
                          backgroundColor: isSelected ? C.primary : C.surface,
                          border: isSelected ? 'none' : `1px solid ${C.borderDefault}`,
                          cursor: 'pointer', transition: 'all 0.15s ease',
                          gap: '2px',
                        }}
                        onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                        onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                        onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                      >
                        <span style={{
                          fontSize: '14px', fontWeight: isSelected ? 600 : 400,
                          letterSpacing: '-0.3px',
                          color: isSelected ? C.textWhite : C.textTertiary,
                        }}>
                          {t.label}
                        </span>
                        <span style={{
                          fontSize: '10px', fontWeight: 400,
                          color: isSelected ? 'rgba(255,255,255,0.6)' : C.textCaption,
                        }}>
                          {t.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Aspect Ratio */}
              <section style={{ marginBottom: '32px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  화면 비율
                </label>
                <div className="flex" style={{ gap: '10px' }}>
                  {ASPECT_RATIOS.map(r => {
                    const isSelected = aspectRatio === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setAspectRatio(r.id)}
                        className="flex-1 flex items-center justify-center"
                        style={{
                          height: '48px', borderRadius: '16px',
                          fontFamily: font, fontSize: '15px', fontWeight: isSelected ? 600 : 400,
                          letterSpacing: '-0.3px',
                          color: isSelected ? C.textWhite : C.textTertiary,
                          backgroundColor: isSelected ? C.primary : C.surface,
                          border: isSelected ? 'none' : `1px solid ${C.borderDefault}`,
                          cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                        onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                        onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                        onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Video Type */}
              <section style={{ marginBottom: '32px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  영상 타입
                </label>
                <div className="flex" style={{ gap: '10px' }}>
                  {VIDEO_TYPES.map(vt => {
                    const isSelected = videoType === vt.id;
                    return (
                      <button
                        key={vt.id}
                        onClick={() => setVideoType(vt.id)}
                        className="flex-1 flex flex-col items-center justify-center"
                        style={{
                          height: '64px', borderRadius: '16px',
                          fontFamily: font,
                          backgroundColor: isSelected ? C.primary : C.surface,
                          border: isSelected ? 'none' : `1px solid ${C.borderDefault}`,
                          cursor: 'pointer', transition: 'all 0.15s ease',
                          gap: '2px',
                        }}
                        onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                        onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                        onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                      >
                        <span style={{
                          fontSize: '15px', fontWeight: isSelected ? 600 : 400,
                          letterSpacing: '-0.3px',
                          color: isSelected ? C.textWhite : C.textTertiary,
                        }}>
                          {vt.label}
                        </span>
                        <span style={{
                          fontSize: '11px', fontWeight: 400,
                          color: isSelected ? 'rgba(255,255,255,0.7)' : C.textCaption,
                        }}>
                          {vt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Motion Theme (모션 그래픽일 때만) */}
              {videoType === 'motion' && (
                <section style={{ marginBottom: '32px' }}>
                  <label style={{
                    display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                    lineHeight: '16px', letterSpacing: '-0.24px',
                    color: C.textCaption, marginBottom: '10px',
                  }}>
                    비주얼 스타일
                  </label>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                  }}>
                    {MOTION_THEMES.map(mt => {
                      const isSelected = motionTheme === mt.id;
                      return (
                        <button
                          key={mt.id}
                          onClick={() => setMotionTheme(mt.id)}
                          className="flex flex-col items-center justify-center"
                          style={{
                            height: '72px', borderRadius: '14px', padding: '8px 4px',
                            fontFamily: font,
                            backgroundColor: isSelected ? C.primary : C.surface,
                            border: isSelected ? 'none' : `1px solid ${C.borderDefault}`,
                            cursor: 'pointer', transition: 'all 0.15s ease',
                            gap: '6px',
                          }}
                          onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                          onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                          onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                        >
                          <div style={{
                            width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                            background: `linear-gradient(135deg, ${mt.preview[0]} 50%, ${mt.preview[1]} 50%)`,
                            border: isSelected ? '2px solid rgba(255,255,255,0.4)' : '1px solid rgba(0,0,0,0.08)',
                          }} />
                          <div className="flex flex-col items-center" style={{ gap: '1px' }}>
                            <span style={{
                              fontSize: '12px', fontWeight: isSelected ? 600 : 500,
                              letterSpacing: '-0.3px',
                              color: isSelected ? C.textWhite : C.textPrimary,
                            }}>
                              {mt.label}
                            </span>
                            <span style={{
                              fontSize: '10px', fontWeight: 400,
                              color: isSelected ? 'rgba(255,255,255,0.6)' : C.textCaption,
                              whiteSpace: 'nowrap',
                            }}>
                              {mt.desc}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* I2V Model (영상 기반일 때만) */}
              {videoType === 'video' && (
                <section style={{ marginBottom: '32px' }}>
                  <label style={{
                    display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                    lineHeight: '16px', letterSpacing: '-0.24px',
                    color: C.textCaption, marginBottom: '10px',
                  }}>
                    영상 배경 AI 모델
                  </label>
                  <div className="flex" style={{ gap: '10px' }}>
                    {I2V_MODELS.map(m => {
                      const isSelected = i2vModel === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setI2vModel(m.id)}
                          className="flex-1 flex flex-col items-center justify-center"
                          style={{
                            height: '72px', borderRadius: '16px',
                            fontFamily: font,
                            backgroundColor: isSelected ? C.primary : C.surface,
                            border: isSelected ? 'none' : `1px solid ${C.borderDefault}`,
                            cursor: 'pointer', transition: 'all 0.15s ease',
                            gap: '2px',
                          }}
                          onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                          onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                          onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                        >
                          <span style={{
                            fontSize: '14px', fontWeight: isSelected ? 600 : 400,
                            letterSpacing: '-0.3px',
                            color: isSelected ? C.textWhite : C.textPrimary,
                          }}>
                            {m.label}
                          </span>
                          <span style={{
                            fontSize: '11px', fontWeight: 400,
                            color: isSelected ? 'rgba(255,255,255,0.7)' : C.textCaption,
                          }}>
                            {m.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Image Source (이미지/영상 기반일 때만) */}
              {(videoType === 'image' || videoType === 'video') && (
                <section style={{ marginBottom: '32px' }}>
                  <label style={{
                    display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                    lineHeight: '16px', letterSpacing: '-0.24px',
                    color: C.textCaption, marginBottom: '10px',
                  }}>
                    이미지 소스
                  </label>
                  <div className="flex" style={{ gap: '10px' }}>
                    {IMAGE_SOURCES.map(is => {
                      const isSelected = imageSource === is.id;
                      return (
                        <button
                          key={is.id}
                          onClick={() => setImageSource(is.id)}
                          className="flex-1 flex flex-col items-center justify-center"
                          style={{
                            height: '64px', borderRadius: '16px',
                            fontFamily: font,
                            backgroundColor: isSelected ? C.primary : C.surface,
                            border: isSelected ? 'none' : `1px solid ${C.borderDefault}`,
                            cursor: 'pointer', transition: 'all 0.15s ease',
                            gap: '2px',
                          }}
                          onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                          onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                          onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                        >
                          <span style={{
                            fontSize: '15px', fontWeight: isSelected ? 600 : 400,
                            letterSpacing: '-0.3px',
                            color: isSelected ? C.textWhite : C.textPrimary,
                          }}>
                            {is.label}
                          </span>
                          <span style={{
                            fontSize: '11px', fontWeight: 400,
                            color: isSelected ? 'rgba(255,255,255,0.7)' : C.textCaption,
                          }}>
                            {is.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Reference Image (이미지/영상 + AI 생성일 때만) */}
              {(videoType === 'image' || videoType === 'video') && imageSource === 'ai' && (
                <section style={{ marginBottom: '32px' }}>
                  <label style={{
                    display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                    lineHeight: '16px', letterSpacing: '-0.24px',
                    color: C.textCaption, marginBottom: '10px',
                  }}>
                    레퍼런스 이미지
                  </label>

                  {refPreview ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img
                        src={refPreview}
                        alt="레퍼런스"
                        style={{
                          width: '100px', height: '100px', objectFit: 'cover',
                          borderRadius: '12px', border: `1px solid ${C.borderDefault}`,
                        }}
                      />
                      <button
                        onClick={() => { setRefPreview(null); setRefBase64(null); }}
                        style={{
                          position: 'absolute', top: '-8px', right: '-8px',
                          width: '24px', height: '24px', borderRadius: '50%',
                          backgroundColor: '#ff4d4f', border: 'none',
                          color: '#fff', fontSize: '14px', fontWeight: 700,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <label
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setRefDragging(true); }}
                      onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setRefDragging(false); }}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); setRefDragging(false); const f = e.dataTransfer.files?.[0]; if (f) processRefFile(f); }}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        width: '100%', height: '80px', borderRadius: '16px',
                        border: `2px dashed ${refDragging ? C.primary : C.borderDefault}`,
                        backgroundColor: refDragging ? 'rgba(72, 178, 175, 0.06)' : C.surfaceSecondary,
                        cursor: 'pointer', gap: '4px', transition: 'all 0.15s ease',
                      }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={refDragging ? C.primary : C.textDisabled} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span style={{
                        fontFamily: font, fontSize: '12px', fontWeight: 400,
                        color: refDragging ? C.primary : C.textCaption,
                      }}>
                        {refDragging ? '여기에 놓으세요' : '드래그하거나 클릭 · 스타일/캐릭터 참고용'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => { const f = e.target.files?.[0]; if (f) processRefFile(f); }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}

                  {/* 참고 방식 (레퍼런스 있을 때만) */}
                  {refPreview && (
                    <div className="flex" style={{ gap: '8px', marginTop: '12px' }}>
                      {REFERENCE_MODES.map(mode => {
                        const sel = refMode === mode.id;
                        return (
                          <button
                            key={mode.id}
                            onClick={() => setRefMode(mode.id)}
                            className="flex-1 flex flex-col items-center justify-center"
                            style={{
                              height: '56px', borderRadius: '12px',
                              backgroundColor: sel ? C.primaryLight : C.surface,
                              border: `1.5px solid ${sel ? C.primary : C.borderDefault}`,
                              cursor: 'pointer', transition: 'all 0.15s ease',
                              gap: '2px',
                            }}
                          >
                            <span style={{
                              fontFamily: font, fontSize: '13px', fontWeight: sel ? 600 : 400,
                              letterSpacing: '-0.3px', color: sel ? C.primary : C.textPrimary,
                            }}>
                              {mode.label}
                            </span>
                            <span style={{
                              fontFamily: font, fontSize: '10px', fontWeight: 400,
                              color: sel ? C.primary : C.textCaption,
                            }}>
                              {mode.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* Narration Voice */}
              <section style={{ marginBottom: '32px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  나레이션 음성
                </label>
                <div style={{
                  position: 'relative',
                  backgroundColor: C.surface,
                  border: `1px solid ${C.borderDefault}`,
                  borderRadius: '16px',
                }}>
                  <select
                    value={narrationVoice}
                    onChange={e => setNarrationVoice(e.target.value as NarrationVoice)}
                    className="w-full"
                    style={{
                      height: '48px', padding: '0 16px',
                      borderRadius: '16px', border: 'none', outline: 'none',
                      backgroundColor: 'transparent',
                      fontFamily: font, fontSize: '15px', fontWeight: 400,
                      letterSpacing: '-0.3px', color: C.textPrimary,
                      cursor: 'pointer',
                      WebkitAppearance: 'none',
                      appearance: 'none',
                    }}
                  >
                    {NARRATION_VOICES.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.desc ? `${v.label} — ${v.desc}` : v.label}
                      </option>
                    ))}
                  </select>
                  <svg style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textCaption} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
              </section>

              {/* BGM */}
              <section style={{ marginBottom: '32px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  배경음악 (BGM)
                </label>
                <div style={{
                  position: 'relative',
                  backgroundColor: C.surface,
                  border: `1px solid ${C.borderDefault}`,
                  borderRadius: '16px',
                }}>
                  <select
                    value={bgmMood}
                    onChange={e => setBgmMood(e.target.value)}
                    className="w-full"
                    style={{
                      height: '48px', padding: '0 16px',
                      borderRadius: '16px', border: 'none', outline: 'none',
                      backgroundColor: 'transparent',
                      fontFamily: font, fontSize: '15px', fontWeight: 400,
                      letterSpacing: '-0.3px', color: C.textPrimary,
                      cursor: 'pointer',
                      WebkitAppearance: 'none',
                      appearance: 'none',
                    }}
                  >
                    {BGM_MOODS.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <svg style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textCaption} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
                {bgmMood !== 'none' && (
                  <p style={{
                    fontFamily: font, fontSize: '12px', fontWeight: 400,
                    color: C.textCaption, marginTop: '6px', paddingLeft: '4px',
                  }}>
                    Jamendo 로열티 프리 음원 (CC 라이선스)
                  </p>
                )}
              </section>

              {/* Generate CTA */}
              {ctaButton(
                isGenerating ? '대본 생성 중...' : '광고 대본 생성하기',
                handleGenerate,
                !brandInfo.trim() || !hookFile || isGenerating,
              )}
            </>
          )}

          {/* ════ STEP 2: Review ════ */}
          {step === 'review' && result && (
            <>
              {/* Title Card */}
              <div style={{
                padding: '16px 20px', backgroundColor: C.primaryLight, borderRadius: '16px',
                marginBottom: '20px', marginTop: '8px',
              }}>
                <div style={{
                  fontFamily: font, fontSize: '16px', fontWeight: 600,
                  lineHeight: '25px', letterSpacing: '-0.32px', color: C.primaryDark,
                }}>
                  {renderBold(result.title)}
                </div>
                <div style={{
                  fontFamily: font, fontSize: '13px', fontWeight: 400,
                  lineHeight: '20px', color: C.textTertiary, marginTop: '6px',
                }}>
                  {renderBold(result.hook)}
                </div>
                <div style={{
                  fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', color: C.textCaption, marginTop: '8px',
                }}>
                  밈 {hookDuration.toFixed(1)}초 + 광고 {result.total_duration}초 · {result.scenes.length}씬
                </div>
              </div>

              {/* Hook preview */}
              {hookUrl && (
                <div style={{
                  padding: '12px', backgroundColor: C.surfaceTertiary, borderRadius: '12px',
                  marginBottom: '12px',
                }}>
                  <div style={{
                    fontFamily: font, fontSize: '11px', fontWeight: 600,
                    color: C.textCaption, marginBottom: '8px', textTransform: 'uppercase' as const,
                  }}>
                    밈 후크 클립
                  </div>
                  <video
                    src={hookUrl}
                    controls
                    style={{
                      width: '100%', maxHeight: '150px', borderRadius: '8px',
                      objectFit: 'contain', backgroundColor: '#000',
                    }}
                    className="transform-gpu"
                  />
                </div>
              )}

              {/* Scene Timeline */}
              <div className="flex flex-col" style={{ gap: '8px', marginBottom: '16px' }}>
                {result.scenes.map((scene, idx) => {
                  const startTime = getCumulativeTime(result.scenes, idx);
                  return (
                    <div
                      key={scene.scene_number}
                      className="flex items-start"
                      style={{
                        padding: '14px 16px', backgroundColor: C.surfaceSecondary,
                        borderRadius: '16px', border: `1px solid ${C.borderDivider}`,
                        gap: '12px',
                      }}
                    >
                      <div className="flex flex-col items-center shrink-0" style={{ gap: '4px' }}>
                        <div className="flex items-center justify-center" style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          backgroundColor: scene.type === 'intro' ? C.primary : scene.type === 'cta' ? C.primaryDark : C.surfaceTertiary,
                          color: scene.type === 'intro' || scene.type === 'cta' ? C.textWhite : C.textTertiary,
                          fontFamily: font, fontSize: '12px', fontWeight: 700,
                        }}>
                          {scene.scene_number}
                        </div>
                        <span style={{
                          fontFamily: font, fontSize: '10px', fontWeight: 500,
                          color: C.textCaption,
                        }}>
                          {formatTime(startTime)}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center" style={{ gap: '6px', marginBottom: '4px' }}>
                          <span style={{
                            fontFamily: font, fontSize: '10px', fontWeight: 600,
                            textTransform: 'uppercase' as const, padding: '1px 4px', borderRadius: '4px',
                            backgroundColor: scene.type === 'intro' ? C.primaryTint : scene.type === 'cta' ? C.primaryLight : C.surfaceTertiary,
                            color: scene.type === 'intro' ? C.primary : scene.type === 'cta' ? C.primaryDark : C.textCaption,
                          }}>
                            {scene.type}
                          </span>
                          <span style={{
                            fontFamily: font, fontSize: '10px', fontWeight: 400,
                            color: C.textCaption,
                          }}>
                            {scene.duration}초 · {scene.transition}
                          </span>
                        </div>
                        <div style={{
                          fontFamily: font, fontSize: '14px', fontWeight: 500,
                          lineHeight: '20px', letterSpacing: '-0.45px', color: C.textPrimary,
                          marginBottom: '6px',
                        }}>
                          {renderBold(scene.narration)}
                        </div>
                        <div style={{
                          fontFamily: font, fontSize: '12px', fontWeight: 600,
                          lineHeight: '18px', color: C.primaryDark,
                        }}>
                          자막: {renderBold(scene.subtitle)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Meta */}
              <div style={{
                padding: '14px 16px', backgroundColor: C.surfaceTertiary,
                borderRadius: '16px', marginBottom: '20px',
              }}>
                <div style={{ marginBottom: '10px' }}>
                  <span style={{
                    fontFamily: font, fontSize: '11px', fontWeight: 600,
                    color: C.textCaption, textTransform: 'uppercase' as const,
                  }}>해시태그</span>
                  <div style={{
                    fontFamily: font, fontSize: '13px', fontWeight: 400,
                    lineHeight: '20px', color: C.primary, marginTop: '4px',
                    wordBreak: 'break-all',
                  }}>
                    {result.hashtags.map(h => `#${h}`).join(' ')}
                  </div>
                </div>
                <div>
                  <span style={{
                    fontFamily: font, fontSize: '11px', fontWeight: 600,
                    color: C.textCaption, textTransform: 'uppercase' as const,
                  }}>썸네일 텍스트</span>
                  <div style={{
                    fontFamily: font, fontSize: '13px', fontWeight: 600,
                    lineHeight: '20px', color: C.textPrimary, marginTop: '4px',
                  }}>
                    {renderBold(result.thumbnail_text)}
                  </div>
                </div>
              </div>

              {/* Chat */}
              {chatMessages.length > 0 && (
                <div style={{
                  backgroundColor: C.surfaceTertiary, borderRadius: '16px',
                  padding: '16px', marginBottom: '16px', maxHeight: '200px', overflow: 'auto',
                }}>
                  {chatMessages.map((msg, i) => (
                    <div key={i} className="flex flex-col" style={{
                      marginBottom: i < chatMessages.length - 1 ? '12px' : 0,
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}>
                      <div style={{
                        padding: '8px 12px', borderRadius: '12px',
                        fontFamily: font, fontSize: '13px', fontWeight: 400,
                        lineHeight: '20px', maxWidth: '85%',
                        backgroundColor: msg.role === 'user' ? C.primary : C.surface,
                        color: msg.role === 'user' ? C.textWhite : C.textPrimary,
                        border: msg.role === 'assistant' ? `1px solid ${C.borderDefault}` : 'none',
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Revision input */}
              <div className="flex" style={{ gap: '8px', marginBottom: '20px' }}>
                <div className="flex-1 flex items-center" style={{
                  height: '48px', backgroundColor: C.surface,
                  border: `1px solid ${C.borderDefault}`, borderRadius: '16px', padding: '0 12px',
                }}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRevise(); } }}
                    placeholder="수정 요청을 입력하세요"
                    disabled={isRevising}
                    className="w-full outline-none bg-transparent"
                    style={{
                      fontFamily: font, fontSize: '15px', fontWeight: 400,
                      lineHeight: '20px', letterSpacing: '-0.45px', color: C.textPrimary,
                    }}
                  />
                </div>
                <button
                  onClick={handleRevise}
                  disabled={!chatInput.trim() || isRevising}
                  className="flex items-center justify-center shrink-0"
                  style={{
                    height: '48px', padding: '0 16px', borderRadius: '16px',
                    fontFamily: font, fontSize: '15px', fontWeight: 500,
                    backgroundColor: !chatInput.trim() || isRevising ? C.surfaceDisabled : C.primary,
                    color: !chatInput.trim() || isRevising ? C.textDisabled : C.textWhite,
                    border: 'none', cursor: !chatInput.trim() || isRevising ? 'not-allowed' : 'pointer',
                  }}
                  onPointerDown={e => { if (chatInput.trim() && !isRevising) e.currentTarget.style.transform = 'scale(0.99)'; }}
                  onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                  onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                >
                  {isRevising ? '수정 중...' : '수정'}
                </button>
              </div>

              {/* CTAs */}
              <div className="flex" style={{ gap: '10px' }}>
                <button
                  onClick={() => { setStep('input'); setResult(null); }}
                  className="shrink-0 flex items-center justify-center"
                  style={{
                    height: '56px', width: '80px', borderRadius: '16px',
                    backgroundColor: C.primaryLight, border: 'none', cursor: 'pointer',
                  }}
                  onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                  onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                  onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                >
                  <span style={{ fontFamily: font, fontSize: '13px', fontWeight: 500, color: C.primary }}>처음으로</span>
                </button>
                <button
                  onClick={goToResult}
                  className="flex-1 flex items-center justify-center"
                  style={{
                    height: '56px', borderRadius: '16px',
                    backgroundColor: C.primary, border: 'none', cursor: 'pointer',
                  }}
                  onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                  onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                  onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                >
                  <span style={{
                    fontFamily: font, fontSize: '16px', fontWeight: 500,
                    lineHeight: '25px', letterSpacing: '-0.32px', color: C.textWhite,
                  }}>영상 만들기</span>
                </button>
              </div>
            </>
          )}

          {/* ════ STEP 3: Video Production ════ */}
          {step === 'result' && result && (
            <>
              <div style={{ marginTop: '8px', marginBottom: '20px' }}>
                <h2 style={{
                  fontFamily: font, fontSize: '18px', fontWeight: 600,
                  lineHeight: '26px', letterSpacing: '-0.36px',
                  color: C.textPrimary, margin: 0, marginBottom: '4px',
                }}>
                  {renderBold(result.title)}
                </h2>
                <p style={{
                  fontFamily: font, fontSize: '14px', fontWeight: 400,
                  lineHeight: '20px', color: C.textTertiary,
                }}>
                  밈 {hookDuration.toFixed(1)}초 + 광고 {result.total_duration}초 · {result.scenes.length}씬
                </p>
              </div>

              {/* Phase A: TTS */}
              {videoPhase === 'tts' && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    padding: '24px 20px', backgroundColor: C.surfaceSecondary,
                    borderRadius: '16px', textAlign: 'center',
                  }}>
                    <div style={{
                      width: 48, height: 48, margin: '0 auto 16px',
                      border: `3px solid ${C.borderDefault}`,
                      borderTop: `3px solid ${C.primary}`,
                      borderRadius: '50%', animation: 'spin 1s linear infinite',
                    }} />
                    <div style={{
                      fontFamily: font, fontSize: '16px', fontWeight: 600,
                      color: C.textPrimary, marginBottom: '8px',
                    }}>
                      나레이션 음성 생성 중...
                    </div>
                    <div style={{
                      fontFamily: font, fontSize: '14px', fontWeight: 400,
                      color: C.textCaption, marginBottom: '16px',
                    }}>
                      {ttsAudios.length} / {result.scenes.length} 씬
                    </div>
                    <div style={{
                      height: '6px', backgroundColor: C.surfaceTertiary,
                      borderRadius: '3px', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', backgroundColor: C.primary,
                        width: `${ttsProgress * 100}%`, transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Phase A+: BGM */}
              {videoPhase === 'bgm' && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    padding: '24px 20px', backgroundColor: C.surfaceSecondary,
                    borderRadius: '16px', textAlign: 'center',
                  }}>
                    <div style={{
                      width: 48, height: 48, margin: '0 auto 16px',
                      border: `3px solid ${C.borderDefault}`,
                      borderTop: `3px solid ${C.primary}`,
                      borderRadius: '50%', animation: 'spin 1s linear infinite',
                    }} />
                    <div style={{
                      fontFamily: font, fontSize: '16px', fontWeight: 600,
                      color: C.textPrimary, marginBottom: '8px',
                    }}>
                      BGM 검색 중...
                    </div>
                    <div style={{
                      fontFamily: font, fontSize: '14px', fontWeight: 400,
                      color: C.textCaption,
                    }}>
                      {bgmMood}
                    </div>
                  </div>
                </div>
              )}

              {/* Phase A-2: Images */}
              {videoPhase === 'images' && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    padding: '24px 20px', backgroundColor: C.surfaceSecondary,
                    borderRadius: '16px', textAlign: 'center',
                  }}>
                    <div style={{
                      width: 48, height: 48, margin: '0 auto 16px',
                      border: `3px solid ${C.borderDefault}`,
                      borderTop: `3px solid ${C.primary}`,
                      borderRadius: '50%', animation: 'spin 1s linear infinite',
                    }} />
                    <div style={{
                      fontFamily: font, fontSize: '16px', fontWeight: 600,
                      color: C.textPrimary, marginBottom: '8px',
                    }}>
                      AI 배경 이미지 생성 중...
                    </div>
                    <div style={{
                      fontFamily: font, fontSize: '14px', fontWeight: 400,
                      color: C.textCaption, marginBottom: '16px',
                    }}>
                      {Math.round(imageProgress * result.scenes.length)} / {result.scenes.length} 씬
                    </div>
                    <div style={{
                      height: '6px', backgroundColor: C.surfaceTertiary,
                      borderRadius: '3px', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', backgroundColor: C.primary,
                        width: `${imageProgress * 100}%`, transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Phase A-2.5: Image Review */}
              {videoPhase === 'image_review' && result && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    fontFamily: font, fontSize: '14px', fontWeight: 600,
                    color: C.textPrimary, marginBottom: '12px',
                  }}>
                    배경 이미지 확인
                    <span style={{ fontWeight: 400, color: C.textCaption, marginLeft: '8px', fontSize: '12px' }}>
                      탭하여 크게 보기
                    </span>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                    gap: '8px', marginBottom: '16px',
                  }}>
                    {result.scenes.map(scene => {
                      const isRegen = regenScenes.has(scene.scene_number);
                      return (
                        <div
                          key={scene.scene_number}
                          onClick={() => scene.backgroundImageUrl && !isRegen && setLightboxUrl(scene.backgroundImageUrl)}
                          style={{
                            position: 'relative', aspectRatio: '9/16',
                            borderRadius: '10px', overflow: 'hidden',
                            border: `1px solid ${C.borderDivider}`,
                            cursor: isRegen ? 'not-allowed' : scene.backgroundImageUrl ? 'pointer' : 'default',
                            background: scene.backgroundImageUrl ? undefined : `linear-gradient(135deg, ${scene.accent_color || C.primary}40, ${scene.glow_color || C.primaryDark}30)`,
                          }}
                          className="transform-gpu"
                        >
                          {scene.backgroundImageUrl && (
                            <img src={scene.backgroundImageUrl} alt={`씬 ${scene.scene_number}`}
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                          )}
                          {isRegen && (
                            <div className="flex items-center justify-center"
                              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }}>
                              <div style={{
                                width: 24, height: 24,
                                border: '2px solid rgba(255,255,255,0.3)',
                                borderTop: '2px solid white',
                                borderRadius: '50%', animation: 'spin 1s linear infinite',
                              }} />
                            </div>
                          )}
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            padding: '4px 6px',
                            background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
                          }}>
                            <div style={{
                              fontFamily: font, fontSize: '9px', fontWeight: 600,
                              color: 'white', textTransform: 'uppercase',
                            }}>
                              {scene.scene_number}. {scene.type}
                            </div>
                          </div>
                          {!isRegen && scene.backgroundImageUrl && (
                            <div
                              onClick={(e) => { e.stopPropagation(); regenerateSceneImage(scene); }}
                              className="flex items-center justify-center"
                              style={{
                                position: 'absolute', top: '4px', right: '4px',
                                width: 26, height: 26, borderRadius: '50%',
                                backgroundColor: 'rgba(0,0,0,0.5)',
                                cursor: 'pointer',
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 105.64-11.36L3 10" />
                              </svg>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setVideoPhase(videoType === 'video' ? 'videos' : 'preview')}
                    disabled={regenScenes.size > 0}
                    className="w-full flex items-center justify-center"
                    style={{
                      height: '48px', borderRadius: '16px', border: 'none',
                      backgroundColor: regenScenes.size > 0 ? C.surfaceDisabled : C.primary,
                      cursor: regenScenes.size > 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <span style={{
                      fontFamily: font, fontSize: '15px', fontWeight: 600,
                      color: regenScenes.size > 0 ? C.textDisabled : C.textWhite,
                    }}>
                      {videoType === 'video' ? 'AI 영상 생성' : '미리보기'}
                    </span>
                  </button>
                </div>
              )}

              {/* Phase A-3: Video Generation (Replicate I2V) */}
              {videoPhase === 'videos' && result && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    padding: '24px 20px', backgroundColor: C.surfaceSecondary,
                    borderRadius: '16px', textAlign: 'center',
                  }}>
                    <div style={{
                      width: 48, height: 48, margin: '0 auto 16px',
                      border: `3px solid ${C.borderDefault}`,
                      borderTop: `3px solid ${C.primary}`,
                      borderRadius: '50%', animation: 'spin 1s linear infinite',
                    }} />
                    <div style={{
                      fontFamily: font, fontSize: '16px', fontWeight: 600,
                      color: C.textPrimary, marginBottom: '8px',
                    }}>
                      AI 영상 배경 생성 중...
                    </div>
                    <div style={{
                      fontFamily: font, fontSize: '14px', fontWeight: 400,
                      color: C.textCaption, marginBottom: '8px',
                    }}>
                      {Math.round(videoGenProgress * result.scenes.length)} / {result.scenes.length} 씬
                    </div>
                    <div style={{
                      fontFamily: font, fontSize: '12px', fontWeight: 400,
                      color: C.textCaption,
                    }}>
                      씬당 1~3분 소요 · 이미지 배경으로 자동 폴백
                    </div>
                    {/* Progress bar */}
                    <div style={{
                      height: '4px', backgroundColor: C.borderDefault,
                      borderRadius: '2px', overflow: 'hidden', marginTop: '16px',
                    }}>
                      <div style={{
                        height: '100%', backgroundColor: C.primary,
                        width: `${videoGenProgress * 100}%`, transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Phase B: Preview */}
              {videoPhase === 'preview' && (narrationVoice === 'none' || ttsAudios.length > 0) && hookUrl && (
                <>
                  <div className="flex justify-center" style={{ marginBottom: '20px' }}>
                    <div style={{ width: '100%', maxWidth: '280px', borderRadius: '16px', overflow: 'hidden', border: `1px solid ${C.borderDefault}` }} className="transform-gpu">
                      <Player
                        component={MemeAdVideo}
                        inputProps={{
                          hookVideoUrl: hookUrl,
                          hookDurationInSeconds: hookDuration,
                          scenes: result.scenes,
                          ttsAudios,
                          bgmAudio,
                          transitionType,
                          motionTheme: videoType === 'motion' ? motionTheme : undefined,
                        }}
                        durationInFrames={Math.max(1, computeTotalMemeAdFrames(hookDuration, result.scenes, ttsAudios))}
                        fps={VIDEO_FPS}
                        compositionWidth={videoWidth}
                        compositionHeight={videoHeight}
                        style={{ width: '100%' }}
                        controls
                        autoPlay={false}
                      />
                    </div>
                  </div>

                  {/* BGM Track Info */}
                  {bgmAudio && (
                    <div style={{
                      padding: '10px 14px', backgroundColor: C.surfaceTertiary,
                      borderRadius: '12px', marginBottom: '12px',
                    }}>
                      <div style={{
                        fontFamily: font, fontSize: '11px', fontWeight: 600,
                        color: C.textCaption, marginBottom: '4px', textTransform: 'uppercase' as const,
                      }}>BGM</div>
                      <div style={{
                        fontFamily: font, fontSize: '13px', fontWeight: 400,
                        color: C.textSecondary, lineHeight: '18px',
                      }}>
                        {bgmAudio.track.name} — {bgmAudio.track.artist}
                        <span style={{ color: C.textCaption, fontSize: '11px', marginLeft: '6px' }}>
                          ({bgmAudio.track.license})
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col" style={{ gap: '10px' }}>
                    {isWebCodecsSupported() ? (
                      ctaButton('MP4 영상 다운로드', handleRenderVideo, false)
                    ) : (
                      <div style={{
                        padding: '14px 18px', backgroundColor: '#FEF2F2',
                        border: '1px solid #FECACA', borderRadius: '16px',
                        fontFamily: font, fontSize: '14px', color: C.destructive,
                      }}>
                        Chrome 또는 Edge를 사용해주세요.
                      </div>
                    )}

                    <button
                      onClick={handleDownloadTxt}
                      className="w-full flex items-center justify-center"
                      style={{
                        height: '48px', borderRadius: '16px',
                        backgroundColor: C.primaryLight, border: 'none', cursor: 'pointer',
                      }}
                      onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                      onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                      onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                    >
                      <span style={{
                        fontFamily: font, fontSize: '13px', fontWeight: 500, color: C.primary,
                      }}>대본 (.txt)</span>
                    </button>
                  </div>
                </>
              )}

              {/* Phase C: Rendering */}
              {videoPhase === 'rendering' && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{
                    padding: '24px 20px', backgroundColor: C.surfaceSecondary,
                    borderRadius: '16px', textAlign: 'center',
                  }}>
                    <div style={{
                      width: 48, height: 48, margin: '0 auto 16px',
                      border: `3px solid ${C.borderDefault}`,
                      borderTop: `3px solid ${C.primary}`,
                      borderRadius: '50%', animation: 'spin 1s linear infinite',
                    }} />
                    <div style={{
                      fontFamily: font, fontSize: '16px', fontWeight: 600,
                      color: C.textPrimary, marginBottom: '8px',
                    }}>
                      영상 렌더링 중...
                    </div>
                    <div style={{
                      fontFamily: font, fontSize: '14px', fontWeight: 400,
                      color: C.textCaption, marginBottom: '16px',
                    }}>
                      {Math.round(renderProgress * 100)}%
                    </div>
                    <div style={{
                      height: '6px', backgroundColor: C.surfaceTertiary,
                      borderRadius: '3px', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', backgroundColor: C.primary,
                        width: `${renderProgress * 100}%`, transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Phase D: Done */}
              {videoPhase === 'done' && videoUrl && (
                <>
                  <div className="flex justify-center" style={{ marginBottom: '20px' }}>
                    <video
                      src={videoUrl}
                      controls
                      style={{
                        width: '100%', maxWidth: '280px',
                        borderRadius: '16px', border: `1px solid ${C.borderDefault}`,
                      }}
                      className="transform-gpu"
                    />
                  </div>

                  <div className="flex flex-col" style={{ gap: '10px' }}>
                    {ctaButton('MP4 다운로드', handleDownloadVideo, false)}

                    <div className="flex" style={{ gap: '8px' }}>
                      <button
                        onClick={handleDownloadTxt}
                        className="flex-1 flex items-center justify-center"
                        style={{
                          height: '48px', borderRadius: '16px',
                          backgroundColor: C.primaryLight, border: 'none', cursor: 'pointer',
                        }}
                        onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                        onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                        onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                      >
                        <span style={{
                          fontFamily: font, fontSize: '13px', fontWeight: 500, color: C.primary,
                        }}>대본 (.txt)</span>
                      </button>
                      <button
                        onClick={handleCopy}
                        className="flex-1 flex items-center justify-center"
                        style={{
                          height: '48px', borderRadius: '16px',
                          backgroundColor: C.primaryLight, border: 'none', cursor: 'pointer',
                        }}
                        onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                        onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                        onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                      >
                        <span style={{
                          fontFamily: font, fontSize: '13px', fontWeight: 500, color: C.primary,
                        }}>{copied ? '복사 완료!' : '클립보드 복사'}</span>
                      </button>
                    </div>

                    <button
                      onClick={resetAll}
                      className="w-full flex items-center justify-center"
                      style={{
                        height: '48px', background: 'none', border: 'none',
                        fontFamily: font, fontSize: '14px', fontWeight: 400,
                        color: C.textCaption, cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      새 영상 만들기
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop: '16px', padding: '14px 18px',
              backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: '16px',
              fontFamily: font, fontSize: '14px', fontWeight: 400,
              color: C.destructive,
            }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {/* ── Image Lightbox ── */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <img
            src={lightboxUrl}
            alt="확대 보기"
            style={{
              maxWidth: '90vw', maxHeight: '90vh',
              objectFit: 'contain', borderRadius: '12px',
            }}
          />
          <div style={{
            position: 'absolute', top: '16px', right: '16px',
            width: 36, height: 36, borderRadius: '50%',
            backgroundColor: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18" /><path d="M6 6l12 12" />
            </svg>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
