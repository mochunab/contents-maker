/**
 * 밈광고영상 Canvas + WebCodecs + mp4-muxer 기반 브라우저 MP4 렌더링
 * 훅 영상 프레임 추출 → 전환 효과 → 광고 씬 렌더링 → 오디오 믹싱
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { Scene, TtsAudio, BgmAudio } from './types';
import { VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS } from './constants';

// ── Scene colors (same as renderVideo.ts) ──

const SCENE_COLORS: Record<string, [string, string]> = {
  hook: ['#FF6B6B', '#EE5A24'],
  problem_intro: ['#4834d4', '#686de0'],
  reason_1: ['#22a6b3', '#7ed6df'],
  reason_2: ['#6ab04c', '#badc58'],
  reason_3: ['#f9ca24', '#f0932b'],
  solution: ['#30336b', '#535c68'],
  cta: ['#e056fd', '#be2edd'],
  intro: ['#4834d4', '#686de0'],
  content: ['#2d3436', '#636e72'],
  outro: ['#e056fd', '#be2edd'],
  benefit: ['#22a6b3', '#7ed6df'],
  feature: ['#6ab04c', '#badc58'],
  testimonial: ['#f9ca24', '#f0932b'],
  offer: ['#e056fd', '#be2edd'],
};

function getColors(type: string): [string, string] {
  const key = type.toLowerCase().replace(/\s+/g, '_');
  return SCENE_COLORS[key] || SCENE_COLORS.content;
}

// ── Extract frames from hook video ──

async function extractHookFrames(
  file: File,
  fps: number,
  onProgress: (p: number) => void,
): Promise<{ bitmaps: ImageBitmap[]; audioBuffer: AudioBuffer | null }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('훅 영상 로드 실패'));
  });

  const duration = video.duration;
  const totalFrames = Math.round(duration * fps);
  const bitmaps: ImageBitmap[] = [];

  for (let i = 0; i < totalFrames; i++) {
    video.currentTime = i / fps;
    await new Promise<void>(r => { video.onseeked = () => r(); });
    const bitmap = await createImageBitmap(video);
    bitmaps.push(bitmap);

    if (i % 10 === 0) {
      onProgress(i / totalFrames);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // Extract audio from hook video
  let audioBuffer: AudioBuffer | null = null;
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = new AudioContext();
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();
  } catch {
    // No audio track or decode failed — that's fine
  }

  URL.revokeObjectURL(url);
  onProgress(1);
  return { bitmaps, audioBuffer };
}

// ── Draw a single ad scene frame on canvas ──

function drawAdFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  scene: Scene,
  frameInScene: number,
  sceneDurationFrames: number,
  imageBitmap?: ImageBitmap,
  w = VIDEO_WIDTH,
  h = VIDEO_HEIGHT,
) {
  const progress = frameInScene / sceneDurationFrames;

  ctx.clearRect(0, 0, w, h);

  if (imageBitmap) {
    const scale = 1.0 + progress * 0.15;
    const offsetX = progress * (-0.03 * w);
    const offsetY = progress * (-0.02 * h);
    const drawW = w * scale;
    const drawH = h * scale;
    const drawX = (w - drawW) / 2 + offsetX;
    const drawY = (h - drawH) / 2 + offsetY;
    ctx.drawImage(imageBitmap, drawX, drawY, drawW, drawH);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, w, h);

    const vigGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
    vigGrad.addColorStop(0, 'transparent');
    vigGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, w, h);
  } else {
    const [c1, c2] = getColors(scene.type);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const radGrad = ctx.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.3, h * 0.2, w * 0.6);
    radGrad.addColorStop(0, 'rgba(255,255,255,0.1)');
    radGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, w, h);
  }

  const entryAlpha = Math.min(frameInScene / 10, 1);
  const exitAlpha = Math.min((sceneDurationFrames - frameInScene) / 6, 1);
  const alpha = Math.max(0, Math.min(1, entryAlpha * exitAlpha));
  ctx.globalAlpha = alpha;

  // Bottom gradient overlay for subtitle
  const bottomGrad = ctx.createLinearGradient(0, h * 0.55, 0, h);
  bottomGrad.addColorStop(0, 'transparent');
  bottomGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);

  // Subtitle
  const subtitleScale = Math.min(frameInScene / 8, 1);
  ctx.save();
  const subtitleY = h - 280;
  ctx.translate(w / 2, subtitleY);
  ctx.scale(0.85 + 0.15 * subtitleScale, 0.85 + 0.15 * subtitleScale);

  const parts = parseSubtitle(scene.subtitle);
  drawSubtitleParts(ctx, parts, 0, 0, w - 120);

  ctx.restore();
  ctx.globalAlpha = 1;
}

function parseSubtitle(text: string): { text: string; bold: boolean }[] {
  const parts: { text: string; bold: boolean }[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    parts.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), bold: false });
  }
  if (parts.length === 0) parts.push({ text, bold: false });
  return parts;
}

function drawSubtitleParts(
  ctx: OffscreenCanvasRenderingContext2D,
  parts: { text: string; bold: boolean }[],
  x: number,
  y: number,
  maxWidth: number,
) {
  const fullText = parts.map(p => p.text).join('');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  const hasBold = parts.some(p => p.bold);

  if (!hasBold) {
    ctx.font = '700 56px "Pretendard Variable", Pretendard, sans-serif';
    ctx.fillStyle = 'white';
    wrapTextCentered(ctx, fullText, x, y, maxWidth, 80);
  } else {
    ctx.font = '700 56px "Pretendard Variable", Pretendard, sans-serif';
    ctx.fillStyle = 'white';
    wrapTextCentered(ctx, fullText, x, y, maxWidth, 80);

    ctx.font = '900 64px "Pretendard Variable", Pretendard, sans-serif';
    ctx.fillStyle = '#FFD93D';
    for (const part of parts) {
      if (part.bold) {
        wrapTextCentered(ctx, part.text, x, y, maxWidth, 80);
      }
    }
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function wrapTextCentered(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const chars = text.split('');
  let line = '';
  const lines: string[] = [];

  for (const char of chars) {
    const testLine = line + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      lines.push(line);
      line = char;
    } else {
      line = testLine;
    }
  }
  lines.push(line);

  const totalHeight = lines.length * lineHeight;
  const startY = y - totalHeight / 2 + lineHeight / 2;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + i * lineHeight);
  }
}

// ── Decode & mix audio ──

function decodeBase64ToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function mixAllAudio(
  hookAudioBuffer: AudioBuffer | null,
  hookDuration: number,
  ttsAudios: TtsAudio[],
  scenes: Scene[],
  bgmAudio?: BgmAudio | null,
): Promise<{ pcmData: Float32Array; sampleRate: number }> {
  const sampleRate = 44100;

  // Compute ad scene durations
  let adDuration = 0;
  for (const scene of scenes) {
    const tts = ttsAudios.find(a => a.sceneNumber === scene.scene_number);
    adDuration += tts ? tts.durationInSeconds : scene.duration;
  }

  const totalDuration = hookDuration + adDuration;
  const totalSamples = Math.ceil(totalDuration * sampleRate);

  const mixCtx = new OfflineAudioContext(1, totalSamples, sampleRate);

  // 1. Hook audio (starts at 0)
  if (hookAudioBuffer) {
    const src = mixCtx.createBufferSource();
    src.buffer = hookAudioBuffer;
    src.connect(mixCtx.destination);
    src.start(0);
  }

  // 2. TTS audio (starts after hook)
  const tempCtx = new OfflineAudioContext(1, 1, sampleRate);
  let ttsOffset = hookDuration;
  for (const scene of scenes) {
    const tts = ttsAudios.find(a => a.sceneNumber === scene.scene_number);
    if (tts) {
      const bytes = decodeBase64ToBytes(tts.dataUrl);
      const buffer = await tempCtx.decodeAudioData(bytes.buffer.slice(0));
      const src = mixCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(mixCtx.destination);
      src.start(ttsOffset);
      ttsOffset += tts.durationInSeconds;
    } else {
      ttsOffset += scene.duration;
    }
  }

  // 3. BGM (full duration, ducking when TTS plays)
  if (bgmAudio) {
    const bgmTempCtx = new OfflineAudioContext(1, 1, sampleRate);
    const bgmBytes = decodeBase64ToBytes(bgmAudio.dataUrl);
    const bgmBuffer = await bgmTempCtx.decodeAudioData(bgmBytes.buffer.slice(0));

    const BGM_FULL = 0.12;
    const BGM_DUCKED = 0.04; // TTS 나올 때 BGM 볼륨 낮춤
    const DUCK_FADE = 0.3; // 볼륨 전환 시간 (초)

    const bgmSrc = mixCtx.createBufferSource();
    bgmSrc.buffer = bgmBuffer;
    const gain = mixCtx.createGain();
    gain.gain.value = 0;
    // 페이드인 (훅 구간은 TTS 없으므로 풀 볼륨)
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(BGM_FULL, 1.0);
    // 훅→광고 전환 시점에서 ducking 시작
    let sceneOffset = hookDuration;
    for (const scene of scenes) {
      const hasTts = ttsAudios.some(a => a.sceneNumber === scene.scene_number);
      const targetVol = hasTts ? BGM_DUCKED : BGM_FULL;
      const t = Math.max(0.01, sceneOffset);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(targetVol, Math.min(t + DUCK_FADE, totalDuration));
      sceneOffset += ttsAudios.find(a => a.sceneNumber === scene.scene_number)?.durationInSeconds ?? scene.duration;
    }
    // 페이드아웃
    const fadeOutStart = Math.max(0, totalDuration - 2.0);
    gain.gain.setValueAtTime(gain.gain.value, fadeOutStart);
    gain.gain.linearRampToValueAtTime(0, totalDuration);

    bgmSrc.connect(gain);
    gain.connect(mixCtx.destination);
    bgmSrc.start(0);
  }

  const rendered = await mixCtx.startRendering();
  const pcmData = rendered.getChannelData(0);

  // Clamp
  for (let i = 0; i < pcmData.length; i++) {
    pcmData[i] = Math.max(-1, Math.min(1, pcmData[i]));
  }

  return { pcmData, sampleRate };
}

// ── Draw transition frame ──

function drawTransitionFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  lastHookBitmap: ImageBitmap | undefined,
  progress: number, // 0→1
  w = VIDEO_WIDTH,
  h = VIDEO_HEIGHT,
) {

  // Black fade-through
  if (lastHookBitmap && progress < 0.5) {
    ctx.drawImage(lastHookBitmap, 0, 0, w, h);
    ctx.fillStyle = `rgba(0,0,0,${progress * 2})`;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = `rgba(0,0,0,${(1 - progress) * 2})`;
    ctx.fillRect(0, 0, w, h);
  }
}

// ── Main render function ──

export async function renderMemeAdVideoToMp4(
  hookFile: File,
  hookDuration: number,
  scenes: Scene[],
  ttsAudios: TtsAudio[],
  onProgress: (progress: number) => void,
  bgmAudio?: BgmAudio | null,
  width?: number,
  height?: number,
): Promise<Blob> {
  const W = width || VIDEO_WIDTH;
  const H = height || VIDEO_HEIGHT;
  onProgress(0);

  // Phase 1: Extract hook frames (0~20%)
  const { bitmaps: hookBitmaps, audioBuffer: hookAudioBuffer } = await extractHookFrames(
    hookFile,
    VIDEO_FPS,
    (p) => onProgress(p * 0.2),
  );

  const hookFrames = hookBitmaps.length;
  const transitionFrames = Math.round(0.5 * VIDEO_FPS); // 15 frames

  // Compute ad scene durations
  const sceneDurations = scenes.map((scene) => {
    const tts = ttsAudios.find(a => a.sceneNumber === scene.scene_number);
    return tts ? tts.durationInSeconds : scene.duration;
  });
  const adTotalDuration = sceneDurations.reduce((a, b) => a + b, 0);
  const adTotalFrames = Math.round(adTotalDuration * VIDEO_FPS);
  const totalFrames = hookFrames + adTotalFrames;

  // Phase 2: Pre-load scene images (20~25%)
  const sceneImageBitmaps = new Map<number, ImageBitmap>();
  for (const scene of scenes) {
    if (scene.backgroundImageUrl) {
      try {
        const response = await fetch(scene.backgroundImageUrl);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        sceneImageBitmaps.set(scene.scene_number, bitmap);
      } catch {
        // fallback to gradient
      }
    }
  }
  onProgress(0.25);

  // Phase 3: Mix audio (25~30%)
  const { pcmData, sampleRate } = await mixAllAudio(
    hookAudioBuffer,
    hookDuration,
    ttsAudios,
    scenes,
    bgmAudio,
  );
  onProgress(0.3);

  // Phase 4: Setup encoders (30%)
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d')!;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: W, height: H },
    audio: { codec: 'aac', numberOfChannels: 1, sampleRate: 44100 },
    fastStart: 'in-memory',
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('VideoEncoder error:', e),
  });

  videoEncoder.configure({
    codec: 'avc1.640028',
    width: W,
    height: H,
    bitrate: 4_000_000,
    framerate: VIDEO_FPS,
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => console.error('AudioEncoder error:', e),
  });

  audioEncoder.configure({
    codec: 'mp4a.40.2',
    numberOfChannels: 1,
    sampleRate: 44100,
    bitrate: 128000,
  });

  // Phase 5: Encode hook frames (30~50%)
  let globalFrame = 0;
  for (let f = 0; f < hookFrames; f++) {
    ctx.clearRect(0, 0, W, H);
    // Cover-fit the hook bitmap
    const bmp = hookBitmaps[f];
    const srcAspect = bmp.width / bmp.height;
    const dstAspect = W / H;
    let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
    if (srcAspect > dstAspect) {
      sw = bmp.height * dstAspect;
      sx = (bmp.width - sw) / 2;
    } else {
      sh = bmp.width / dstAspect;
      sy = (bmp.height - sh) / 2;
    }
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, W, H);

    // Transition overlay at the end of hook
    const transitionStart = hookFrames - transitionFrames;
    if (f >= transitionStart) {
      const progress = (f - transitionStart) / transitionFrames;
      ctx.fillStyle = `rgba(0,0,0,${progress})`;
      ctx.fillRect(0, 0, W, H);
    }

    const frame = new VideoFrame(canvas, {
      timestamp: (globalFrame / VIDEO_FPS) * 1_000_000,
      duration: (1 / VIDEO_FPS) * 1_000_000,
    });
    videoEncoder.encode(frame, { keyFrame: f === 0 });
    frame.close();
    globalFrame++;

    if (f % 10 === 0) {
      onProgress(0.3 + (f / hookFrames) * 0.2);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // Release hook bitmaps
  for (const bmp of hookBitmaps) bmp.close();

  // Phase 6: Encode ad scene frames (50~80%)
  for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
    const scene = scenes[sceneIdx];
    const sceneDurFrames = Math.round(sceneDurations[sceneIdx] * VIDEO_FPS);
    const imageBitmap = sceneImageBitmaps.get(scene.scene_number);

    for (let f = 0; f < sceneDurFrames; f++) {
      // Fade-in from black for first scene's first few frames
      if (sceneIdx === 0 && f < transitionFrames) {
        const progress = f / transitionFrames;
        drawAdFrame(ctx, scene, f, sceneDurFrames, imageBitmap, W, H);
        ctx.fillStyle = `rgba(0,0,0,${1 - progress})`;
        ctx.fillRect(0, 0, W, H);
      } else {
        drawAdFrame(ctx, scene, f, sceneDurFrames, imageBitmap, W, H);
      }

      const frame = new VideoFrame(canvas, {
        timestamp: (globalFrame / VIDEO_FPS) * 1_000_000,
        duration: (1 / VIDEO_FPS) * 1_000_000,
      });
      videoEncoder.encode(frame, { keyFrame: f === 0 });
      frame.close();
      globalFrame++;

      if (globalFrame % 10 === 0) {
        onProgress(0.5 + (globalFrame - hookFrames) / adTotalFrames * 0.3);
      }
      if (globalFrame % 30 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  await videoEncoder.flush();
  onProgress(0.85);

  // Phase 7: Encode audio (85~95%)
  const chunkSize = 1024;
  for (let i = 0; i < pcmData.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, pcmData.length);
    const chunk = pcmData.slice(i, end);

    const audioDataObj = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: chunk.length,
      numberOfChannels: 1,
      timestamp: (i / sampleRate) * 1_000_000,
      data: chunk,
    });

    audioEncoder.encode(audioDataObj);
    audioDataObj.close();

    if (i % (chunkSize * 100) === 0) {
      onProgress(0.85 + (i / pcmData.length) * 0.1);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  await audioEncoder.flush();
  onProgress(0.95);

  // Finalize
  videoEncoder.close();
  audioEncoder.close();
  muxer.finalize();
  onProgress(1);

  return new Blob([target.buffer], { type: 'video/mp4' });
}
