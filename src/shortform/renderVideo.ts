/**
 * Canvas + WebCodecs + mp4-muxer 기반 브라우저 MP4 렌더링
 * Chrome/Edge 전용 (WebCodecs API 필요)
 * SceneRenderer.tsx와 동기화된 시각 효과
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
// lottie-web canvas 전용 빌드 (SVG 미포함, 번들 크기 절약)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — lottie_canvas.js에 .d.ts 파일 없음 (lottie-web 패키지 한계)
import lottie from 'lottie-web/build/player/lottie_light_canvas';
import type { Scene, TtsAudio, BgmAudio, MotionTheme } from './types';
import { VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS, } from './constants';
import { THEME_CONFIGS } from './types';
import type { LottieOverlayType } from './lottie';
import { resolveLottieType, loadLottieData } from './lottie';

// ── Enhanced Scene Themes (synced with SceneRenderer.tsx) ──

const SCENE_THEMES: Record<string, { bg: [string, string, string]; accent: string; glow: string }> = {
  hook:          { bg: ['#1a0a2e', '#2d1b69', '#16213e'], accent: '#FF6B6B', glow: '#ff6b6b' },
  problem_intro: { bg: ['#1a0a1e', '#2d0a3e', '#0f1a40'], accent: '#e74c3c', glow: '#ff4757' },
  problem:       { bg: ['#1a0a1e', '#2d0a3e', '#0f1a40'], accent: '#e74c3c', glow: '#ff4757' },
  reason_1:      { bg: ['#0d0a17', '#1a1125', '#0d1a2d'], accent: '#FF6B6B', glow: '#ff6b6b' },
  reason_2:      { bg: ['#0d0a17', '#1a1525', '#1a1020'], accent: '#f39c12', glow: '#feca57' },
  reason_3:      { bg: ['#0d0a17', '#1a1030', '#1a0d2d'], accent: '#e056fd', glow: '#e056fd' },
  reason:        { bg: ['#0d0a17', '#1a1125', '#0d1a2d'], accent: '#FF6B6B', glow: '#ff6b6b' },
  solution:      { bg: ['#0a1a15', '#0d2820', '#0a2030'], accent: '#2ecc71', glow: '#00d2d3' },
  tip:           { bg: ['#0a1a15', '#0d2820', '#0a2030'], accent: '#2ecc71', glow: '#00d2d3' },
  cta:           { bg: ['#1a0a30', '#2d1b69', '#4a1a6a'], accent: '#e056fd', glow: '#ff6b9d' },
  intro:         { bg: ['#0a1a2e', '#162a4e', '#0d2040'], accent: '#4ecdc4', glow: '#4ecdc4' },
  content:       { bg: ['#0d0d17', '#151525', '#0d1a2d'], accent: '#58a6ff', glow: '#58a6ff' },
  outro:         { bg: ['#1a0a30', '#2d1b69', '#4a1a6a'], accent: '#e056fd', glow: '#ff6b9d' },
};

type Theme = { bg: [string, string, string]; accent: string; glow: string };

function getBaseTheme(type: string): Theme {
  const key = type.toLowerCase().replace(/\s+/g, '_');
  return SCENE_THEMES[key] || SCENE_THEMES.content;
}

function deriveBackground(accent: string, brightness = 0.08): [string, string, string] {
  const r = parseInt(accent.slice(1, 3), 16), g = parseInt(accent.slice(3, 5), 16), b = parseInt(accent.slice(5, 7), 16);
  if (brightness > 0.5) {
    const light = (rr: number, gg: number, bb: number, f: number) => {
      const lr = Math.round(255 - (255 - rr) * (1 - f));
      const lg = Math.round(255 - (255 - gg) * (1 - f));
      const lb = Math.round(255 - (255 - bb) * (1 - f));
      return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
    };
    return [light(r, g, b, brightness), light(r, g, b, brightness * 0.97), light(r, g, b, brightness * 1.02)];
  }
  const dk = (rr: number, gg: number, bb: number, f: number) =>
    `#${Math.floor(rr * f).toString(16).padStart(2, '0')}${Math.floor(gg * f).toString(16).padStart(2, '0')}${Math.floor(bb * f).toString(16).padStart(2, '0')}`;
  return [dk(r, g, b, brightness * 0.75), dk(r, g, b, brightness * 1.5), dk(r, g, b, brightness)];
}

function getTheme(type: string, scene?: Scene, brightness = 0.08): Theme {
  const base = getBaseTheme(type);
  if (scene?.accent_color && scene?.glow_color) return { ...base, accent: scene.accent_color, glow: scene.glow_color, bg: deriveBackground(scene.accent_color, brightness) };
  return base;
}

function lerpColor(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg2 = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg2 - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

// ── Helpers ──

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function easeSpring(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.exp(-6 * t) * Math.cos(4 * t);
}

function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function extractKeywords(subtitle: string): string[] {
  const boldRegex = /\*\*(.+?)\*\*/g;
  const bolds: string[] = [];
  let m;
  while ((m = boldRegex.exec(subtitle)) !== null) bolds.push(m[1]);
  if (bolds.length > 0) return bolds.slice(0, 3);
  const cleaned = subtitle.replace(/\*\*/g, '');
  const stop = ['은','는','이','가','을','를','의','에','에서','도','만','와','과','로','으로','하고','라고','때문에'];
  return cleaned.split(/\s+/).filter(w => w.length >= 2 && !stop.includes(w)).slice(0, 3);
}

const FONT = '"Pretendard Variable", Pretendard, sans-serif';

// ── Background Drawing ──

function drawBackground(
  ctx: OffscreenCanvasRenderingContext2D, scene: Scene, frame: number, duration: number,
  imageBitmap: ImageBitmap | undefined, theme: Theme, w: number, h: number, motionTheme?: MotionTheme,
) {
  const tc = THEME_CONFIGS[motionTheme || 'black_neon'] || THEME_CONFIGS['black_neon'];
  const progress = frame / duration;

  if (imageBitmap) {
    const scale = 1.0 + progress * 0.15;
    const offX = progress * (-0.03 * w), offY = progress * (-0.02 * h);
    const dw = w * scale, dh = h * scale;
    ctx.drawImage(imageBitmap, (w - dw) / 2 + offX, (h - dh) / 2 + offY, dw, dh);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, w, h);
    const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
    vig.addColorStop(0, 'transparent'); vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
  } else {
    const [c1, c2, c3] = theme.bg;

    // Background fill
    if (tc.bgMode === 'solid') {
      ctx.fillStyle = c2; ctx.fillRect(0, 0, w, h);
    } else {
      const angle = (160 + Math.sin(frame * 0.008) * 20) * Math.PI / 180;
      const cx = w / 2, cy = h / 2, len = Math.sqrt(w * w + h * h) / 2;
      const grad = ctx.createLinearGradient(cx - Math.cos(angle) * len, cy - Math.sin(angle) * len, cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      grad.addColorStop(0, c1); grad.addColorStop(0.5, c2); grad.addColorStop(1, c3);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    }

    // Ambient glows
    const glowAlpha1 = tc.bgMode === 'light' ? 0.04 : 0.08;
    const glowAlpha2 = tc.bgMode === 'light' ? 0.03 : 0.05;
    const g1x = (0.45 + Math.sin(frame * 0.01) * 0.15) * w, g1y = (0.3 + Math.cos(frame * 0.008) * 0.12) * h;
    const glow1 = ctx.createRadialGradient(g1x, g1y, 0, g1x, g1y, w * 0.45);
    glow1.addColorStop(0, hexToRgba(theme.glow, glowAlpha1)); glow1.addColorStop(1, 'transparent');
    ctx.fillStyle = glow1; ctx.fillRect(0, 0, w, h);
    const g2x = (0.55 + Math.cos(frame * 0.012) * 0.18) * w, g2y = (0.65 + Math.sin(frame * 0.009) * 0.1) * h;
    const glow2 = ctx.createRadialGradient(g2x, g2y, 0, g2x, g2y, w * 0.4);
    glow2.addColorStop(0, hexToRgba(theme.accent, glowAlpha2)); glow2.addColorStop(1, 'transparent');
    ctx.fillStyle = glow2; ctx.fillRect(0, 0, w, h);

    // Grid (dark_neon only)
    if (tc.grid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.02)'; ctx.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 80) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (let gy = 0; gy < h; gy += 80) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
    }

    // Dot pattern (bold_impact)
    if (tc.dotPattern) {
      ctx.save(); ctx.globalAlpha = 0.3;
      ctx.fillStyle = hexToRgba(theme.accent, 0.07);
      for (let dx = 0; dx < w; dx += 24) for (let dy = 0; dy < h; dy += 24) {
        ctx.beginPath(); ctx.arc(dx, dy, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // Bokeh orbs
    for (let i = 0; i < tc.bokehCount; i++) {
      const bx = seededRandom(scene.scene_number * 100 + i * 17) * w;
      const by = seededRandom(scene.scene_number * 100 + i * 31) * h;
      const bs = 30 + seededRandom(scene.scene_number * 100 + i * 47) * 50;
      const bsp = 0.6 + seededRandom(scene.scene_number * 100 + i * 61) * 0.8;
      const bd = 0.1 + i * 0.12;
      const be = easeOut((frame / VIDEO_FPS - bd) * 2);
      const bfY = Math.sin((frame + bd * 50) * bsp * 0.02) * 25;
      const bfX = Math.cos((frame + bd * 30) * bsp * 0.015) * 15;
      const bp = 1 + Math.sin((frame + bd * 20) * 0.04) * 0.2;
      const br = bs * be * bp;
      if (br <= 0) continue;
      const px = bx + bfX, py = by + bfY;
      const bg = ctx.createRadialGradient(px, py, 0, px, py, br);
      bg.addColorStop(0, hexToRgba(theme.glow, 0.12)); bg.addColorStop(0.5, hexToRgba(theme.glow, 0.04)); bg.addColorStop(1, 'transparent');
      ctx.fillStyle = bg; ctx.fillRect(px - br, py - br, br * 2, br * 2);
    }

    // Sparkles
    for (let i = 0; i < tc.sparkleCount; i++) {
      const sx = (0.08 + seededRandom(scene.scene_number * 200 + i * 23) * 0.84) * w;
      const sy = (0.08 + seededRandom(scene.scene_number * 200 + i * 37) * 0.84) * h;
      const ss = 2 + seededRandom(scene.scene_number * 200 + i * 43) * 3;
      const sd = 0.3 + i * 0.18;
      const se = easeOut((frame / VIDEO_FPS - sd) * 3);
      const st = 0.2 + Math.abs(Math.sin((frame + sd * 40) * 0.15)) * 0.8;
      const sa = se * st * 0.6;
      if (sa <= 0) continue;
      ctx.save(); ctx.globalAlpha = sa; ctx.shadowColor = theme.accent; ctx.shadowBlur = ss * 4;
      ctx.fillStyle = theme.accent; ctx.beginPath(); ctx.arc(sx, sy, ss, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    // Floating shapes
    for (let i = 0; i < tc.shapeCount; i++) {
      const fx = (0.05 + seededRandom(scene.scene_number * 300 + i * 19) * 0.9) * w;
      const fy = (0.08 + seededRandom(scene.scene_number * 300 + i * 29) * 0.84) * h;
      const fs = 8 + seededRandom(scene.scene_number * 300 + i * 41) * 16;
      const fd = 0.15 + i * 0.1;
      const fe = easeOut((frame / VIDEO_FPS - fd) * 2.5);
      const ff = Math.sin((frame + fd * 30) * 0.03) * 15;
      const fa = fe * 0.2;
      if (fa <= 0) continue;
      ctx.save(); ctx.globalAlpha = fa; ctx.strokeStyle = hexToRgba(theme.accent, 0.5); ctx.lineWidth = 2;
      const st2 = Math.floor(seededRandom(scene.scene_number * 300 + i * 53) * 3);
      if (st2 === 0) { ctx.beginPath(); ctx.arc(fx, fy + ff, fs, 0, Math.PI * 2); ctx.stroke(); }
      else if (st2 === 1) { ctx.save(); ctx.translate(fx, fy + ff); ctx.rotate(frame * 0.01); ctx.beginPath(); ctx.moveTo(0, -fs); ctx.lineTo(fs, 0); ctx.lineTo(0, fs); ctx.lineTo(-fs, 0); ctx.closePath(); ctx.stroke(); ctx.restore(); }
      else { ctx.fillStyle = hexToRgba(theme.accent, 0.3); ctx.beginPath(); ctx.arc(fx, fy + ff, fs * 0.3, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }
}

// ── Motion Drawing Functions ──

type MotionDrawFn = (ctx: OffscreenCanvasRenderingContext2D, scene: Scene, frame: number, duration: number, theme: Theme, keywords: string[], w: number, h: number) => void;

const drawMotionKeywordPop: MotionDrawFn = (ctx, _s, frame, _d, theme, keywords, w, h) => {
  const pos = keywords.length === 1 ? [0.5] : keywords.length === 2 ? [0.42, 0.58] : [0.35, 0.5, 0.65];
  keywords.forEach((kw, i) => {
    const t = easeSpring((frame - i * 6) / 15); if (t <= 0) return;
    const y = h * pos[i], p = 1 + Math.sin((frame - i * 6) * 0.08) * 0.03;
    const bg = ctx.createRadialGradient(w / 2, y, 0, w / 2, y, 200);
    bg.addColorStop(0, hexToRgba(theme.accent, 0.15 * t)); bg.addColorStop(1, 'transparent');
    ctx.fillStyle = bg; ctx.fillRect(w / 2 - 200, y - 200, 400, 400);
    ctx.save(); ctx.translate(w / 2, y); ctx.scale(t * p, t * p);
    ctx.shadowColor = theme.accent; ctx.shadowBlur = 40;
    ctx.font = `800 ${keywords.length > 2 ? 72 : 100}px ${FONT}`; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(kw, 0, 0); ctx.restore();
  });
};

const drawMotionTypewriter: MotionDrawFn = (ctx, scene, frame, duration, theme, _kw, w, h) => {
  const text = scene.subtitle.replace(/\*\*/g, '');
  const vis = Math.min(Math.floor(frame * (text.length / (duration * 0.7))), text.length);
  const fx = 80, fy = h * 0.3, fw = w - 160, fh = h * 0.35;
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.strokeStyle = hexToRgba(theme.accent, 0.3); ctx.lineWidth = 2;
  roundRect(ctx, fx, fy, fw, fh, 16); ctx.fill(); ctx.stroke();
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(fx + 24 + i * 22, fy + 20, 6, 0, Math.PI * 2); ctx.fill(); });
  ctx.font = `500 48px ${FONT}`; ctx.fillStyle = 'white'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  wrapText(ctx, '> ' + text.slice(0, vis), fx + 24, fy + 50, fw - 48, 64);
  if (vis < text.length && frame % 16 < 10) { ctx.shadowColor = theme.accent; ctx.shadowBlur = 12; ctx.fillStyle = theme.accent; ctx.fillRect(fx + 28 + ctx.measureText('> ' + text.slice(0, vis)).width, fy + 52, 3, 44); ctx.shadowBlur = 0; }
  ctx.restore();
};

const drawMotionSlideStack: MotionDrawFn = (ctx, _s, frame, _d, theme, keywords, w, h) => {
  keywords.forEach((kw, i) => {
    const t = easeSpring((frame - i * 8) / 15); if (t <= 0) return;
    const tx = (1 - t) * (i % 2 === 0 ? -200 : 200), y = h * 0.35 + i * 120;
    ctx.save(); ctx.globalAlpha = t; ctx.translate(tx, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.strokeStyle = hexToRgba(theme.accent, 0.15); ctx.lineWidth = 1;
    roundRect(ctx, 80, y, w - 160, 96, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = theme.accent; roundRect(ctx, 80, y, 6, 96, 3); ctx.fill();
    ctx.font = `600 48px ${FONT}`; ctx.fillStyle = 'white'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(kw, 120, y + 48);
    ctx.restore();
  });
};

const drawMotionCounter: MotionDrawFn = (ctx, scene, frame, duration, theme, keywords, w, h) => {
  const text = scene.subtitle.replace(/\*\*/g, '');
  const num = parseInt((text.match(/[\d,]+/) || ['100'])[0].replace(/,/g, ''), 10);
  const cp = Math.min(frame / (duration * 0.6), 1), cur = Math.floor(num * easeOut(cp));
  const cx = w / 2, cy = h * 0.45, r = 140;
  ctx.save();
  ctx.strokeStyle = hexToRgba(theme.accent, 0.15); ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = theme.accent; ctx.shadowColor = theme.accent; ctx.shadowBlur = 20; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * easeOut(cp)); ctx.stroke(); ctx.shadowBlur = 0;
  const p = cp >= 1 ? 1 + Math.sin(frame * 0.15) * 0.04 : 1;
  ctx.translate(cx, cy); ctx.scale(p, p);
  ctx.font = `800 120px ${FONT}`; ctx.fillStyle = theme.accent; ctx.shadowColor = theme.accent; ctx.shadowBlur = 30;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cur.toLocaleString(), 0, 0);
  ctx.shadowBlur = 0; ctx.font = `600 44px ${FONT}`; ctx.fillStyle = 'white'; ctx.fillText(keywords[0] || '', 0, 80);
  ctx.restore();
};

const drawMotionSplitCompare: MotionDrawFn = (ctx, _s, frame, _d, theme, keywords, w, h) => {
  const lt = easeSpring(frame / 15), rt = easeSpring((frame - 8) / 15), dt = easeSpring((frame - 4) / 15);
  ctx.save(); ctx.globalAlpha = lt;
  let lg = ctx.createLinearGradient(0, 0, w / 2, 0); lg.addColorStop(0, hexToRgba('#FF6B6B', 0.12)); lg.addColorStop(1, 'transparent');
  ctx.fillStyle = lg; ctx.fillRect(0, h * 0.3, w / 2, h * 0.35);
  ctx.font = `700 64px ${FONT}`; ctx.fillStyle = '#FF6B6B'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(keywords[0] || 'Before', w * 0.25, h * 0.48); ctx.restore();
  ctx.save(); ctx.globalAlpha = rt;
  lg = ctx.createLinearGradient(w / 2, 0, w, 0); lg.addColorStop(0, 'transparent'); lg.addColorStop(1, hexToRgba('#4ecdc4', 0.12));
  ctx.fillStyle = lg; ctx.fillRect(w / 2, h * 0.3, w / 2, h * 0.35);
  ctx.font = `700 64px ${FONT}`; ctx.fillStyle = '#4ecdc4'; ctx.textAlign = 'center';
  ctx.fillText(keywords[1] || keywords[0] || 'After', w * 0.75, h * 0.48); ctx.restore();
  ctx.save(); ctx.globalAlpha = dt; ctx.shadowColor = theme.accent; ctx.shadowBlur = 15; ctx.fillStyle = theme.accent;
  const dh2 = h * 0.35 * dt * 0.6; ctx.fillRect(w / 2 - 3, h * 0.48 - dh2 / 2, 6, dh2);
  ctx.beginPath(); ctx.arc(w / 2, h * 0.48, 36, 0, Math.PI * 2); ctx.fill();
  ctx.font = `900 28px ${FONT}`; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VS', w / 2, h * 0.48); ctx.restore();
};

const drawMotionRadialBurst: MotionDrawFn = (ctx, _s, frame, _d, theme, keywords, w, h) => {
  const cx = w / 2, cy = h * 0.45, t = easeSpring(frame / 18);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, ll = (150 + (i % 4) * 40) * t;
    ctx.save(); ctx.globalAlpha = (i % 2 === 0 ? 0.25 : 0.15) * t; ctx.strokeStyle = theme.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40); ctx.lineTo(cx + Math.cos(a) * ll, cy + Math.sin(a) * ll); ctx.stroke();
    ctx.fillStyle = theme.glow; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * ll, cy + Math.sin(a) * ll, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  for (let r = 0; r < 2; r++) { const rt2 = easeOut((frame - r * 6) / 20); if (rt2 <= 0) continue; ctx.save(); ctx.globalAlpha = (1 - rt2) * 0.4; ctx.strokeStyle = theme.accent; ctx.shadowColor = theme.accent; ctx.shadowBlur = 10; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, rt2 * 180, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  ctx.save(); ctx.shadowColor = theme.accent; ctx.shadowBlur = 30; ctx.font = `800 80px ${FONT}`; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = t; ctx.fillText(keywords[0] || '', cx, cy); ctx.restore();
};

const drawMotionListReveal: MotionDrawFn = (ctx, _s, frame, _d, theme, keywords, w, h) => {
  keywords.forEach((kw, i) => {
    const t = easeSpring((frame - i * 12) / 15); if (t <= 0) return;
    const y = h * 0.33 + i * 130, tx = (1 - t) * -60;
    ctx.save(); ctx.globalAlpha = t; ctx.translate(tx, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; roundRect(ctx, 80, y, w - 160, 100, 14); ctx.fill();
    ctx.beginPath(); ctx.arc(140, y + 50, 28, 0, Math.PI * 2); ctx.fillStyle = theme.accent; ctx.shadowColor = theme.accent; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
    ctx.font = `800 28px ${FONT}`; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), 140, y + 50);
    ctx.font = `600 44px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(kw, 190, y + 52); ctx.restore();
    if (i > 0) { const pt = easeSpring((frame - (i - 1) * 12 - 6) / 10); if (pt > 0) { ctx.save(); ctx.globalAlpha = pt * 0.3; ctx.strokeStyle = theme.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(140, y - 30); ctx.lineTo(140, y + 22); ctx.stroke(); ctx.restore(); } }
  });
};

const drawMotionZoomImpact: MotionDrawFn = (ctx, _s, frame, _d, theme, keywords, w, h) => {
  const cx = w / 2, cy = h * 0.45;
  const zt = easeSpring(frame / 12), scale = 4 - 3 * zt;
  if (frame >= 3 && frame <= 6) { ctx.save(); ctx.globalAlpha = (1 - (frame - 3) / 3) * 0.6; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, w, h); ctx.restore(); }
  let sx = 0, sy = 0; if (frame > 8 && frame < 25) { const d = Math.exp(-(frame - 8) * 0.2); sx = Math.sin(frame * 2.5) * 15 * d; sy = Math.cos(frame * 3) * 10 * d; }
  for (let r = 0; r < 3; r++) { const rt = easeOut((frame - 5 - r * 4) / 15); if (rt <= 0) continue; ctx.save(); ctx.globalAlpha = (1 - rt) * 0.3; ctx.strokeStyle = theme.accent; ctx.shadowColor = theme.accent; ctx.shadowBlur = 8; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx + sx, cy + sy, rt * 250, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  ctx.save(); ctx.translate(cx + sx, cy + sy); ctx.scale(scale, scale); ctx.globalAlpha = zt; ctx.shadowColor = theme.accent; ctx.shadowBlur = 40;
  ctx.font = `900 100px ${FONT}`; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(keywords[0] || '', 0, 0);
  if (keywords[1]) { ctx.shadowBlur = 15; ctx.font = `600 52px ${FONT}`; ctx.fillStyle = theme.accent; ctx.fillText(keywords[1], 0, 70); } ctx.restore();
};

const drawMotionGlitch: MotionDrawFn = (ctx, _s, frame, _d, theme, keywords, w, h) => {
  const gl = (frame % 30 < 4) || (frame % 45 < 3), t = easeSpring(frame / 12);
  keywords.forEach((kw, i) => {
    const y = h * (keywords.length === 1 ? 0.45 : 0.38 + i * 0.14);
    const gx = gl ? Math.sin(frame * 7 + i) * 8 : 0, gy = gl ? Math.cos(frame * 5 + i) * 4 : 0;
    const fs = keywords.length > 2 ? 60 : 80;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${fs}px ${FONT}`;
    if (gl) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#ff0000'; ctx.fillText(kw, w / 2 - 5 + gx, y + gy); ctx.fillStyle = '#00ffff'; ctx.fillText(kw, w / 2 + 5 + gx, y - gy); }
    ctx.globalAlpha = t; ctx.fillStyle = 'white'; ctx.shadowColor = theme.accent; ctx.shadowBlur = gl ? 20 : 10; ctx.fillText(kw, w / 2 + gx, y + gy); ctx.restore();
  });
  if (gl) { ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = 'white'; ctx.fillRect(0, (frame * 8) % h, w, 3); ctx.fillRect(0, ((frame * 8) + h / 3) % h, w, 2);
    for (let n = 0; n < 3; n++) { ctx.globalAlpha = 0.08; ctx.fillRect(0, seededRandom(frame * 7 + n * 31) * h, w, 4 + seededRandom(frame * 11 + n * 17) * 20); } ctx.restore(); }
};

const drawMotionWave: MotionDrawFn = (ctx, _s, frame, _d, theme, keywords, w, h) => {
  const text = keywords[0] || '', chars = text.split('');
  const fs = chars.length > 8 ? 60 : 80, tw = chars.length * fs * 0.6, sx = (w - tw) / 2;
  ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = theme.accent; ctx.beginPath(); ctx.moveTo(0, h * 0.6);
  for (let x = 0; x <= w; x += 10) ctx.lineTo(x, Math.sin(x * 0.008 + frame * 0.04) * 40 + h * 0.5);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill(); ctx.restore();
  chars.forEach((c, i) => {
    const t = easeSpring((frame - i * 2) / 12); if (t <= 0) return;
    const wy = Math.sin(frame * 0.12 + i * 0.5) * 18, x = sx + i * fs * 0.6, y = h * 0.45 + wy;
    const hue = ((i * 20) + frame * 0.8) % 360;
    ctx.save(); ctx.globalAlpha = t; ctx.font = `700 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = `hsl(${hue}, 70%, 75%)`; ctx.shadowColor = `hsl(${hue}, 70%, 60%)`; ctx.shadowBlur = 15;
    ctx.fillText(c === ' ' ? '' : c, x, y); ctx.restore();
  });
};

const drawMotionSpotlight: MotionDrawFn = (ctx, _s, frame, _d, theme, keywords, w, h) => {
  const cx = w / 2, cy = h * 0.45;
  const t = easeOut(frame / 20), r = t * 350;
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-out';
  const jx = Math.sin(frame * 0.07) * 5, jy = Math.cos(frame * 0.09) * 3;
  const sg = ctx.createRadialGradient(cx + jx, cy + jy, r * 0.7, cx + jx, cy + jy, r);
  sg.addColorStop(0, 'rgba(0,0,0,1)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h); ctx.restore();
  if (t > 0.3) { const tt = easeSpring((t - 0.3) / 0.7); ctx.save(); ctx.globalAlpha = tt; ctx.shadowColor = theme.accent; ctx.shadowBlur = 25;
    ctx.font = `800 80px ${FONT}`; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(keywords[0] || '', cx, cy); ctx.restore(); }
};

const drawMotionCardFlip: MotionDrawFn = (ctx, _s, frame, duration, theme, keywords, w, h) => {
  const cx = w / 2, cy = h * 0.45;
  const fp = Math.min(frame / (duration * 0.4), 1), fa = fp * Math.PI, isFront = fa < Math.PI / 2, scaleX = Math.abs(Math.cos(fa)) || 0.01;
  const cw2 = 350, ch2 = 175;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(scaleX, 1);
  const cg = ctx.createLinearGradient(-cw2, 0, cw2, 0); cg.addColorStop(0, hexToRgba(theme.accent, 0.15)); cg.addColorStop(1, hexToRgba(theme.glow, 0.1));
  ctx.fillStyle = cg; ctx.strokeStyle = hexToRgba(theme.accent, 0.3); ctx.lineWidth = 2;
  roundRect(ctx, -cw2, -ch2, cw2 * 2, ch2 * 2, 24); ctx.fill(); ctx.stroke();
  ctx.font = `800 72px ${FONT}`; ctx.fillStyle = isFront ? 'rgba(255,255,255,0.8)' : 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = theme.accent; ctx.shadowBlur = isFront ? 0 : 20;
  ctx.fillText(isFront ? (keywords[0] || '?') : (keywords[1] || keywords[0] || '!'), 0, 0); ctx.restore();
  if (fp > 0.45 && fp < 0.55) { ctx.save(); ctx.globalAlpha = 0.3 * (1 - Math.abs(fp - 0.5) / 0.05);
    const fl = ctx.createRadialGradient(cx, cy, 0, cx, cy, 300); fl.addColorStop(0, 'white'); fl.addColorStop(1, 'transparent');
    ctx.fillStyle = fl; ctx.fillRect(0, 0, w, h); ctx.restore(); }
};

const drawMotionProgressBar: MotionDrawFn = (ctx, _s, frame, duration, theme, keywords, w, h) => {
  const bw = w - 200, bh = 36, bx = 100, by = h * 0.48;
  const fp = easeOut(Math.min(frame / (duration * 0.65), 1)), pct = Math.floor(fp * 100);
  ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.1)'; roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
  const fw2 = bw * fp;
  if (fw2 > 0) { const fg = ctx.createLinearGradient(bx, 0, bx + fw2, 0); fg.addColorStop(0, theme.accent); fg.addColorStop(1, theme.glow);
    ctx.fillStyle = fg; ctx.shadowColor = theme.accent; ctx.shadowBlur = 15; roundRect(ctx, bx, by, fw2, bh, bh / 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx + fw2 - 2, by + bh / 2, 8, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill(); } ctx.shadowBlur = 0;
  ctx.font = `800 96px ${FONT}`; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = theme.accent; ctx.shadowBlur = 20;
  ctx.fillText(`${pct}%`, w / 2, by - 80); ctx.shadowBlur = 0;
  ctx.font = `600 40px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(keywords[0] || '', w / 2, by + bh + 50); ctx.restore();
};

const drawMotionEmojiRain: MotionDrawFn = (ctx, scene, frame, _d, theme, keywords, w, h) => {
  const emoji = scene.icon || '✨';
  ctx.save();
  for (let i = 0; i < 20; i++) {
    const ex = seededRandom(i * 47 + 13) * w, sp = 0.5 + seededRandom(i * 31 + 7) * 1.5, es = 20 + seededRandom(i * 23 + 3) * 30;
    const sd = seededRandom(i * 19 + 11) * 30, wb = Math.sin((frame + i * 17) * 0.06) * 20;
    const ey = ((frame - sd) * sp * 3) % (h + 100) - 50;
    if (frame < sd || ey < -50) continue;
    ctx.globalAlpha = 0.5 + seededRandom(i * 37) * 0.3; ctx.font = `${es}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(emoji, ex + wb, ey);
  }
  ctx.restore();
  const t = easeSpring(frame / 15);
  ctx.save(); ctx.globalAlpha = t; ctx.shadowColor = theme.accent; ctx.shadowBlur = 30;
  ctx.font = `900 88px ${FONT}`; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(keywords[0] || '', w / 2, h * 0.45); ctx.restore();
};

const drawMotionParallaxLayers: MotionDrawFn = (ctx, scene, frame, _d, theme, keywords, w, h) => {
  ctx.save(); ctx.globalAlpha = 0.1;
  for (let i = 0; i < 3; i++) {
    const bx2 = seededRandom(scene.scene_number * 50 + i * 11) * w - frame * 0.3;
    const by2 = (0.2 + seededRandom(scene.scene_number * 50 + i * 23) * 0.6) * h;
    const bs2 = 80 + seededRandom(scene.scene_number * 50 + i * 37) * 80;
    const px = ((bx2 % (w + 200)) + w + 200) % (w + 200) - 100;
    const bg2 = ctx.createRadialGradient(px, by2, 0, px, by2, bs2);
    bg2.addColorStop(0, hexToRgba(theme.glow, 0.3)); bg2.addColorStop(1, 'transparent');
    ctx.fillStyle = bg2; ctx.fillRect(px - bs2, by2 - bs2, bs2 * 2, bs2 * 2);
  } ctx.restore();
  const t = easeSpring(frame / 15);
  ctx.save(); ctx.globalAlpha = t; ctx.font = `800 80px ${FONT}`; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = theme.accent; ctx.shadowBlur = 20; ctx.fillText(keywords[0] || '', w / 2 - frame * 0.2, h * 0.45);
  if (keywords[1]) { ctx.font = `600 48px ${FONT}`; ctx.fillStyle = theme.accent; ctx.fillText(keywords[1], w / 2 - frame * 0.15, h * 0.53); } ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.25;
  for (let i = 0; i < 12; i++) {
    const px2 = ((seededRandom(i * 29 + 7) * w * 2 - frame * (1.5 + seededRandom(i * 13) * 1.5)) % (w + 100) + w + 100) % (w + 100) - 50;
    const py2 = seededRandom(i * 41 + 3) * h, ps = 2 + seededRandom(i * 53) * 4;
    ctx.fillStyle = theme.accent; ctx.beginPath(); ctx.arc(px2, py2, ps, 0, Math.PI * 2); ctx.fill();
  } ctx.restore();
};

// ── Confetti Burst ──
const drawMotionConfettiBurst: MotionDrawFn = (ctx, _s, frame, _d, theme, keywords, w, h) => {
  const GRAVITY = 600;
  const AIR_RESISTANCE = 0.97;
  const burstFrame = Math.max(0, frame - 8);
  const burstT = burstFrame / VIDEO_FPS;
  const colors = [theme.accent, '#FFD93D', '#FF6B6B', '#4ECDC4', '#A8E6CF', '#FF8A65', '#CE93D8', '#81D4FA'];

  // Central flash
  if (frame >= 6 && frame <= 18) {
    const flashAlpha = frame <= 10 ? (frame - 6) / 4 * 0.6 : (18 - frame) / 8 * 0.6;
    const fg = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, 300);
    fg.addColorStop(0, hexToRgba('#ffffff', flashAlpha)); fg.addColorStop(0.3, hexToRgba(theme.accent, flashAlpha * 0.5)); fg.addColorStop(1, 'transparent');
    ctx.fillStyle = fg; ctx.fillRect(w / 2 - 300, h * 0.45 - 300, 600, 600);
  }

  // Confetti particles (35)
  for (let i = 0; i < 35; i++) {
    const delay = Math.floor(Math.abs(Math.sin(i * 1.7)) * 4);
    const pFrame = Math.max(0, burstFrame - delay);
    const t = pFrame / VIDEO_FPS;
    if (t <= 0) continue;

    const angle = (i / 35) * 360 + Math.sin(i * 7.3) * 30;
    const speed = 200 + Math.abs(Math.sin(i * 3.7)) * 300;
    const rad = (angle * Math.PI) / 180;
    const vx = Math.cos(rad) * speed * AIR_RESISTANCE;
    const vy = Math.sin(rad) * speed * AIR_RESISTANCE;
    const x = w / 2 + vx * t * Math.pow(AIR_RESISTANCE, pFrame);
    const y = h * 0.45 + vy * t + 0.5 * GRAVITY * t * t;
    const rot = (Math.sin(i * 2.3) * 180 + (180 + Math.sin(i * 4.1) * 360) * t) * Math.PI / 180;
    const pSize = 8 + Math.abs(Math.sin(i * 5.1)) * 16;

    // Fade out
    const yDist = y - h * 0.45;
    let fadeOut = 1;
    if (yDist > 800) fadeOut = Math.max(0, 1 - (yDist - 800) / 400);
    const entryFade = Math.min(t / 0.08, 1);
    const opacity = fadeOut * entryFade;
    if (opacity <= 0.01) continue;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = colors[i % colors.length];
    const shape = i % 3;
    if (shape === 0) ctx.fillRect(-pSize / 2, -pSize * 0.3, pSize, pSize * 0.6);
    else if (shape === 1) { ctx.beginPath(); ctx.arc(0, 0, pSize / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(0, -pSize / 2); ctx.lineTo(pSize / 2, pSize / 2); ctx.lineTo(-pSize / 2, pSize / 2); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }

  // Keywords
  const pos = keywords.length === 1 ? [0.48] : keywords.length === 2 ? [0.42, 0.56] : [0.36, 0.48, 0.6];
  keywords.forEach((kw, i) => {
    const t = easeSpring((frame - i * 5) / 15); if (t <= 0) return;
    const y = h * pos[i], p = 1 + Math.sin((frame - i * 5) * 0.06) * 0.02;
    // Glow
    const kg = ctx.createRadialGradient(w / 2, y, 0, w / 2, y, 250);
    kg.addColorStop(0, hexToRgba(theme.accent, 0.15 * t)); kg.addColorStop(1, 'transparent');
    ctx.fillStyle = kg; ctx.fillRect(w / 2 - 250, y - 250, 500, 500);
    ctx.save(); ctx.translate(w / 2, y); ctx.scale(t * p, t * p);
    ctx.font = `900 ${keywords.length === 1 ? 110 : keywords.length === 2 ? 90 : 76}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = hexToRgba(theme.accent, 0.7); ctx.shadowBlur = 40;
    ctx.fillStyle = 'white'; ctx.fillText(kw, 0, 0);
    ctx.shadowBlur = 0; ctx.restore();
  });
};

// ── Sparkle Trail ──
const drawMotionSparkleTrail: MotionDrawFn = (ctx, _s, frame, _d, theme, keywords, w, h) => {
  function cubicBez(t: number, p0: number, p1: number, p2: number, p3: number) {
    const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  const trails = [
    { p: [{ x: -0.1, y: 0.7 }, { x: 0.2, y: 0.3 }, { x: 0.6, y: 0.2 }, { x: 0.5, y: 0.5 }], color: theme.accent, delay: 0 },
    { p: [{ x: 1.1, y: 0.65 }, { x: 0.8, y: 0.25 }, { x: 0.4, y: 0.35 }, { x: 0.5, y: 0.5 }], color: '#FFD93D', delay: 4 },
    { p: [{ x: 0.5, y: 0.95 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.4 }, { x: 0.5, y: 0.5 }], color: '#81D4FA', delay: 8 },
  ];

  trails.forEach(trail => {
    const tFrame = Math.max(0, frame - trail.delay);
    const progress = Math.min(tFrame / (VIDEO_FPS * 1.2), 1);
    if (progress <= 0) return;

    // Trail dots
    for (let si = 0; si < 20; si++) {
      const segT = si / 20;
      if (segT > progress) continue;
      const x = cubicBez(segT, trail.p[0].x, trail.p[1].x, trail.p[2].x, trail.p[3].x) * w;
      const y = cubicBez(segT, trail.p[0].y, trail.p[1].y, trail.p[2].y, trail.p[3].y) * h;
      const age = (progress - segT) * 3;
      const segA = age < 0.5 ? 0.7 : Math.max(0, 0.7 - (age - 0.5) * 0.47);
      if (segA <= 0) continue;
      ctx.save(); ctx.globalAlpha = segA;
      ctx.fillStyle = trail.color; ctx.shadowColor = trail.color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    // Sparkles
    for (let si = 0; si < 10; si++) {
      const sT = si / 10;
      const sDelay = sT * 1.2 * VIDEO_FPS;
      const sFrame = Math.max(0, tFrame - sDelay);
      const sP = Math.min(sFrame / (VIDEO_FPS * 0.5), 1);
      if (sP <= 0) continue;
      const x = cubicBez(Math.min(sT, progress), trail.p[0].x, trail.p[1].x, trail.p[2].x, trail.p[3].x) * w;
      const y = cubicBez(Math.min(sT, progress), trail.p[0].y, trail.p[1].y, trail.p[2].y, trail.p[3].y) * h;
      const sA = sP < 0.3 ? sP / 0.3 : sP < 0.7 ? 0.6 + 0.4 * (1 - (sP - 0.3) / 0.4) : Math.max(0, (1 - sP) / 0.3);
      const sz = (6 + Math.abs(Math.sin(si * 1.3)) * 6) * (sP < 0.3 ? 0.3 + sP * 2.3 : sP < 0.7 ? 1.2 : 0.5 + (1 - sP) * 1.7);
      ctx.save(); ctx.globalAlpha = sA; ctx.fillStyle = si % 2 === 0 ? trail.color : '#FFFFFF';
      ctx.shadowColor = trail.color; ctx.shadowBlur = 10;
      // 4-point star
      ctx.translate(x + Math.sin(si * 2.7) * w * 0.03, y + Math.cos(si * 3.1) * h * 0.03);
      ctx.rotate(sP * Math.PI / 2);
      ctx.beginPath();
      for (let j = 0; j < 8; j++) { const r = j % 2 === 0 ? sz : sz * 0.4; const a = (j * Math.PI) / 4 - Math.PI / 2; ctx.lineTo(r * Math.cos(a), r * Math.sin(a)); }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }

    // Lead sparkle
    if (progress < 0.98) {
      const hx = cubicBez(progress, trail.p[0].x, trail.p[1].x, trail.p[2].x, trail.p[3].x) * w;
      const hy = cubicBez(progress, trail.p[0].y, trail.p[1].y, trail.p[2].y, trail.p[3].y) * h;
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 20);
      hg.addColorStop(0, '#FFFFFF'); hg.addColorStop(0.4, trail.color); hg.addColorStop(1, 'transparent');
      ctx.save(); ctx.shadowColor = trail.color; ctx.shadowBlur = 20;
      ctx.fillStyle = hg; ctx.fillRect(hx - 20, hy - 20, 40, 40); ctx.restore();
    }
  });

  // Keywords (appear after trails converge)
  const pos = keywords.length === 1 ? [0.48] : keywords.length === 2 ? [0.43, 0.55] : [0.37, 0.48, 0.59];
  keywords.forEach((kw, i) => {
    const delay = i * 6 + 15;
    const t = easeSpring((frame - delay) / 12); if (t <= 0) return;
    const y = h * pos[i], p = 1 + Math.sin((frame - delay) * 0.08) * 0.03;
    ctx.save(); ctx.translate(w / 2, y); ctx.scale(t * p, t * p);
    ctx.font = `900 ${keywords.length === 1 ? 110 : keywords.length === 2 ? 90 : 76}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = hexToRgba(theme.accent, 0.6); ctx.shadowBlur = 30;
    ctx.fillStyle = 'white'; ctx.fillText(kw, 0, 0);
    ctx.shadowBlur = 0; ctx.restore();
  });
};

// ── Pulse Ring ──
const drawMotionPulseRing: MotionDrawFn = (ctx, _s, frame, _d, theme, keywords, w, h) => {
  const cx = w / 2, cy = h * 0.46;
  const ringCount = 6;
  const PULSE_INTERVAL = 8;

  // Background radial glow
  const bgEntry = easeOut(frame / 15);
  const bgg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 400);
  bgg.addColorStop(0, hexToRgba(theme.accent, 0.12 * bgEntry)); bgg.addColorStop(0.3, hexToRgba(theme.accent, 0.06 * bgEntry)); bgg.addColorStop(1, 'transparent');
  ctx.fillStyle = bgg; ctx.fillRect(cx - 400, cy - 400, 800, 800);

  // Pulsing rings
  for (let i = 0; i < ringCount; i++) {
    const ringFrame = frame - i * PULSE_INTERVAL;
    const cycleDuration = ringCount * PULSE_INTERVAL;
    const normalizedFrame = ((ringFrame % cycleDuration) + cycleDuration) % cycleDuration;
    const ringT = normalizedFrame / cycleDuration;
    if (frame < i * PULSE_INTERVAL) continue;
    const ringScale = 0.3 + ringT * 4.2;
    const ringR = 80 * ringScale;
    let ringOpacity = 0;
    if (ringT < 0.15) ringOpacity = ringT / 0.15 * 0.7;
    else if (ringT < 0.6) ringOpacity = 0.7 - (ringT - 0.15) / 0.45 * 0.4;
    else ringOpacity = Math.max(0, 0.3 * (1 - (ringT - 0.6) / 0.4));
    const thickness = 3 - ringT * 2;
    ctx.save(); ctx.globalAlpha = ringOpacity;
    ctx.strokeStyle = theme.accent; ctx.lineWidth = Math.max(0.5, thickness);
    ctx.shadowColor = hexToRgba(theme.accent, 0.4); ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }

  // Rotating energy arcs
  for (let i = 0; i < 3; i++) {
    const arcDelay = i * 5;
    const arcEntry = easeOut((frame - arcDelay - 6) / 15);
    if (arcEntry <= 0) continue;
    const arcAngle = ((i / 3) * 360 + frame * (1.5 + i * 0.3)) * Math.PI / 180;
    const arcR = 120 + i * 30;
    const arcLen = 0.8; // radians
    ctx.save(); ctx.globalAlpha = arcEntry * (0.5 + Math.sin((frame + i * 20) * 0.06) * 0.2);
    ctx.strokeStyle = theme.accent; ctx.lineWidth = 2;
    ctx.shadowColor = hexToRgba(theme.accent, 0.5); ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(cx, cy, arcR, arcAngle, arcAngle + arcLen); ctx.stroke(); ctx.restore();
  }

  // Central core
  const corePulse = 1 + Math.sin(frame * 0.1) * 0.08;
  const coreSize = easeOut(frame / 12) * 50 * corePulse;
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize);
  cg.addColorStop(0, hexToRgba(theme.accent, 0.5)); cg.addColorStop(0.4, hexToRgba(theme.accent, 0.25)); cg.addColorStop(1, 'transparent');
  ctx.fillStyle = cg; ctx.fillRect(cx - coreSize, cy - coreSize, coreSize * 2, coreSize * 2);

  // Orbiting dots
  for (let i = 0; i < 8; i++) {
    const dotEntry = easeOut((frame - i * 3 - 4) / 12);
    if (dotEntry <= 0) continue;
    const orbitAngle = ((i / 8) * 360 + frame * 2) * Math.PI / 180;
    const orbitR = 70 + (i % 3) * 20;
    const dx = cx + Math.cos(orbitAngle) * orbitR;
    const dy = cy + Math.sin(orbitAngle) * orbitR;
    const dotSize = 2 + (i % 3);
    const dotPulse = 0.6 + Math.sin((frame + i * 10) * 0.15) * 0.4;
    ctx.save(); ctx.globalAlpha = dotEntry * dotPulse;
    ctx.fillStyle = i % 2 === 0 ? theme.accent : '#FFFFFF';
    ctx.shadowColor = hexToRgba(theme.accent, 0.5); ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(dx, dy, dotSize, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  // Keywords
  const pos = keywords.length === 1 ? [0.46] : keywords.length === 2 ? [0.4, 0.54] : [0.35, 0.46, 0.57];
  keywords.forEach((kw, i) => {
    const delay = i * 6 + 4;
    const t = easeSpring((frame - delay) / 15); if (t <= 0) return;
    const y = h * pos[i], p = 1 + Math.sin((frame - delay) * 0.07) * 0.02;
    ctx.save(); ctx.translate(w / 2, y); ctx.scale(t * p, t * p);
    ctx.font = `900 ${keywords.length === 1 ? 110 : keywords.length === 2 ? 90 : 76}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = hexToRgba(theme.accent, 0.7); ctx.shadowBlur = 40;
    ctx.fillStyle = 'white'; ctx.fillText(kw, 0, 0);
    ctx.shadowBlur = 0; ctx.restore();
  });
};

const MOTION_DRAWERS: Record<string, MotionDrawFn> = {
  keyword_pop: drawMotionKeywordPop, typewriter: drawMotionTypewriter, slide_stack: drawMotionSlideStack,
  counter: drawMotionCounter, split_compare: drawMotionSplitCompare, radial_burst: drawMotionRadialBurst,
  list_reveal: drawMotionListReveal, zoom_impact: drawMotionZoomImpact, glitch: drawMotionGlitch,
  wave: drawMotionWave, spotlight: drawMotionSpotlight, card_flip: drawMotionCardFlip,
  progress_bar: drawMotionProgressBar, emoji_rain: drawMotionEmojiRain, parallax_layers: drawMotionParallaxLayers,
  confetti_burst: drawMotionConfettiBurst, sparkle_trail: drawMotionSparkleTrail, pulse_ring: drawMotionPulseRing,
};

// ── Subtitle Drawing ──

function parseSubtitle(text: string): { text: string; bold: boolean }[] {
  const parts: { text: string; bold: boolean }[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ text: text.slice(lastIndex, match.index), bold: false });
    parts.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), bold: false });
  if (parts.length === 0) parts.push({ text, bold: false });
  return parts;
}

function drawSubtitle(ctx: OffscreenCanvasRenderingContext2D, scene: Scene, frame: number, w: number, h: number) {
  const bottomGrad = ctx.createLinearGradient(0, h * 0.55, 0, h);
  bottomGrad.addColorStop(0, 'transparent'); bottomGrad.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = bottomGrad; ctx.fillRect(0, h * 0.55, w, h * 0.45);
  const st = easeSpring(frame / 10); if (st <= 0) return;
  const sy = h - 280, parts = parseSubtitle(scene.subtitle);
  const words: { word: string; bold: boolean; idx: number }[] = [];
  let idx = 0;
  for (const part of parts) for (const wd of part.text.split(/\s+/).filter(Boolean)) words.push({ word: wd, bold: part.bold, idx: idx++ });
  const wws = words.map(wd => { ctx.font = wd.bold ? `900 56px ${FONT}` : `700 48px ${FONT}`; return ctx.measureText(wd.word).width; });
  const maxW = w - 120, gap = 12;
  const lines: { words: typeof words; widths: number[] }[] = [];
  let cl: typeof words = [], cw: number[] = [], lw = 0;
  words.forEach((wd, i) => {
    if (lw + wws[i] + (cl.length > 0 ? gap : 0) > maxW && cl.length > 0) { lines.push({ words: cl, widths: cw }); cl = [wd]; cw = [wws[i]]; lw = wws[i]; }
    else { cl.push(wd); cw.push(wws[i]); lw += wws[i] + (cl.length > 1 ? gap : 0); }
  });
  if (cl.length > 0) lines.push({ words: cl, widths: cw });
  const lh = 76, totalH = lines.length * lh, startY = sy - totalH / 2;
  ctx.save(); ctx.globalAlpha = st * 0.3; ctx.fillStyle = 'rgba(0,0,0,1)';
  roundRect(ctx, (w - Math.min(maxW, 900)) / 2, startY - 18, Math.min(maxW, 900), totalH + 36, 20); ctx.fill(); ctx.restore();
  lines.forEach((line, li) => {
    const tlw = line.widths.reduce((a, b) => a + b, 0) + (line.words.length - 1) * gap;
    let dx = (w - tlw) / 2;
    const dy = startY + li * lh + lh / 2;
    line.words.forEach((wd, wi) => {
      const wt = easeSpring((frame - wd.idx * 2) / 10); if (wt <= 0) { dx += line.widths[wi] + gap; return; }
      const wy = dy + (1 - wt) * 14, bp = wd.bold ? 1 + Math.sin((frame - wd.idx * 2) * 0.08) * 0.03 : 1;
      ctx.save(); ctx.globalAlpha = wt; ctx.font = wd.bold ? `900 56px ${FONT}` : `700 48px ${FONT}`;
      ctx.fillStyle = wd.bold ? '#FFD93D' : 'white'; ctx.shadowColor = wd.bold ? 'rgba(255,217,61,0.5)' : 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = wd.bold ? 20 : 10; ctx.shadowOffsetY = wd.bold ? 0 : 3; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.translate(dx + line.widths[wi] / 2, wy); ctx.scale(bp, bp); ctx.translate(-(dx + line.widths[wi] / 2), -wy);
      ctx.fillText(wd.word, dx, wy); ctx.restore(); dx += line.widths[wi] + gap;
    });
  });
}

// ── Transition + Helpers ──

function applyTransition(ctx: OffscreenCanvasRenderingContext2D, transition: string, frame: number, entryT: number, w: number, h: number): { pre?: () => void } {
  if (transition === 'zoom') return { pre: () => { ctx.translate(w / 2, h / 2); ctx.scale(1.2 - 0.2 * entryT, 1.2 - 0.2 * entryT); ctx.translate(-w / 2, -h / 2); } };
  if (transition === 'slide') return { pre: () => { ctx.translate((1 - entryT) * w, 0); } };
  if (transition === 'scale_rotate') { const s = 0.5 + 0.5 * entryT, r = (-15 + 15 * entryT) * Math.PI / 180; return { pre: () => { ctx.translate(w / 2, h / 2); ctx.scale(s, s); ctx.rotate(r); ctx.translate(-w / 2, -h / 2); } }; }
  if (transition === 'wipe_left') { const cw2 = Math.min(frame / 12, 1) * w; return { pre: () => { ctx.beginPath(); ctx.rect(0, 0, cw2, h); ctx.clip(); } }; }
  return {};
}

function roundRect(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function wrapText(ctx: OffscreenCanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  let line = '', curY = y;
  for (const c of text.split('')) { const t = line + c; if (ctx.measureText(t).width > maxWidth && line) { ctx.fillText(line, x, curY); line = c; curY += lineHeight; } else line = t; }
  ctx.fillText(line, x, curY);
}

// ── Lottie pre-rendering ──

async function preRenderLottieFrames(
  type: LottieOverlayType,
  fw: number,
  fh: number,
): Promise<ImageBitmap[]> {
  const animData = await loadLottieData(type);
  // lottie-web canvas renderer로 프레임별 렌더링
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = fw;
  tempCanvas.height = fh;
  const tempCtx = tempCanvas.getContext('2d')!;

  const anim = lottie.loadAnimation({
    container: tempCanvas as unknown as HTMLElement,
    renderer: 'canvas',
    rendererSettings: { context: tempCtx, clearCanvas: true },
    animationData: animData,
    loop: false,
    autoplay: false,
  });

  const totalLottieFrames = anim.totalFrames;
  // Lottie 자체 프레임 수만큼만 렌더 (보통 60~90프레임 = 메모리 절약)
  const frameCount = Math.min(Math.ceil(totalLottieFrames), 120);
  const frames: ImageBitmap[] = [];

  for (let i = 0; i < frameCount; i++) {
    const lf = (i / frameCount) * totalLottieFrames;
    anim.goToAndStop(lf, true);
    frames.push(await createImageBitmap(tempCanvas));
  }

  anim.destroy();
  tempCanvas.remove();
  return frames;
}

// ── Main drawFrame ──

function drawFrame(ctx: OffscreenCanvasRenderingContext2D, scene: Scene, frameInScene: number, sceneDurationFrames: number, w: number, h: number, imageBitmap?: ImageBitmap, prevScene?: Scene, motionTheme?: MotionTheme, lottieFrames?: ImageBitmap[], audioEnergy?: AudioEnergy) {
  const tc = THEME_CONFIGS[motionTheme || 'black_neon'] || THEME_CONFIGS['black_neon'];
  const theme = getTheme(scene.type, scene, tc.bgBrightness);
  const prevTheme = prevScene ? getTheme(prevScene.type, prevScene, tc.bgBrightness) : null;
  const BLEND_FRAMES = 15;
  const blendT = prevTheme ? Math.min(frameInScene / BLEND_FRAMES, 1) : 1;
  const renderTheme: Theme = prevTheme ? {
    accent: lerpColor(prevTheme.accent, theme.accent, blendT),
    glow: lerpColor(prevTheme.glow, theme.glow, blendT),
    bg: [lerpColor(prevTheme.bg[0], theme.bg[0], blendT), lerpColor(prevTheme.bg[1], theme.bg[1], blendT), lerpColor(prevTheme.bg[2], theme.bg[2], blendT)],
  } : theme;
  const keywords = extractKeywords(scene.subtitle);
  ctx.clearRect(0, 0, w, h);
  const entryAlpha = Math.min(frameInScene / 10, 1), exitAlpha = Math.min((sceneDurationFrames - frameInScene) / 8, 1);
  const alpha = Math.max(0, Math.min(1, entryAlpha * exitAlpha));
  const transition = scene.transition?.toLowerCase() || 'cut';
  const entryT = easeOut(Math.min(frameInScene / 12, 1));
  if (transition === 'fade') ctx.globalAlpha = Math.min(frameInScene / 10, 1) * exitAlpha;
  else if (transition === 'blur_in') ctx.globalAlpha = Math.min(frameInScene / 6, 1) * exitAlpha;
  else ctx.globalAlpha = alpha;
  const { pre } = applyTransition(ctx, transition, frameInScene, entryT, w, h);
  ctx.save(); if (pre) pre();
  drawBackground(ctx, scene, frameInScene, sceneDurationFrames, imageBitmap, renderTheme, w, h, motionTheme);
  // Particle burst for hook/cta
  const st = scene.type.toLowerCase().replace(/\s+/g, '_');
  if (['hook', 'cta', 'outro'].includes(st) && !imageBitmap) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, pd = i * 1.5, pt = easeOut((frameInScene - pd) / 15); if (pt <= 0) continue;
      const dist = pt * (130 + (i % 4) * 35);
      ctx.save(); ctx.globalAlpha = (1 - pt) * 0.5; ctx.fillStyle = i % 3 === 0 ? renderTheme.glow : renderTheme.accent;
      ctx.shadowColor = renderTheme.accent; ctx.shadowBlur = 6; ctx.beginPath();
      ctx.arc(w / 2 + Math.cos(a) * dist, h * 0.45 + Math.sin(a) * dist, 3 + (i % 3) * 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  // Motion
  const drawer = MOTION_DRAWERS[scene.motion_style || 'keyword_pop'] || MOTION_DRAWERS.keyword_pop;
  drawer(ctx, scene, frameInScene, sceneDurationFrames, renderTheme, keywords, w, h);
  // Lottie overlay
  if (lottieFrames && lottieFrames.length > 0) {
    const lf = frameInScene % lottieFrames.length;
    const fadeIn = Math.min(frameInScene / 10, 1);
    const fadeOut = Math.min((sceneDurationFrames - frameInScene) / 10, 1);
    const lottieOp = fadeIn * fadeOut * (imageBitmap ? 0.12 : 0.2);
    ctx.save();
    ctx.globalAlpha = lottieOp;
    // 중앙 60% 영역에 그리기
    const lw = w * 0.6, lh = h * 0.6;
    const lx = (w - lw) / 2, ly = (h - lh) / 2;
    ctx.drawImage(lottieFrames[lf], lx, ly, lw, lh);
    ctx.restore();
  }
  // Audio-reactive overlay
  if (audioEnergy && audioEnergy.rms > 0.01) {
    drawAudioReactive(ctx, audioEnergy, renderTheme.accent, renderTheme.glow, w, h);
  }
  // Accent line
  const lt = easeOut((frameInScene - 5) / 12);
  if (lt > 0) { const lg2 = ctx.createLinearGradient(w * 0.3, 0, w * 0.7, 0); lg2.addColorStop(0, 'transparent'); lg2.addColorStop(0.5, hexToRgba(renderTheme.accent, 0.5)); lg2.addColorStop(1, 'transparent');
    ctx.fillStyle = lg2; ctx.fillRect(w * (0.5 - lt * 0.2), h * 0.75, w * lt * 0.4, 3); }
  drawSubtitle(ctx, scene, frameInScene, w, h);
  ctx.restore(); ctx.globalAlpha = 1;
}

// ── Audio ──

function decodeBase64ToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]; const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function decodeTtsAudio(ttsAudios: TtsAudio[], scenes: Scene[], bgmAudio?: BgmAudio | null): Promise<{ pcmData: Float32Array; sampleRate: number }> {
  const audioCtx = new OfflineAudioContext(1, 1, 44100);
  const buffers: { buffer: AudioBuffer; offsetSeconds: number }[] = [];
  let offset = 0;
  for (const scene of scenes) {
    const tts = ttsAudios.find(a => a.sceneNumber === scene.scene_number);
    if (tts) { const bytes = decodeBase64ToBytes(tts.dataUrl); const buffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0)); buffers.push({ buffer, offsetSeconds: offset }); offset += tts.durationInSeconds; }
    else offset += scene.duration;
  }
  const totalDuration = offset, sampleRate = 44100, totalSamples = Math.ceil(totalDuration * sampleRate);
  const mixedCtx = new OfflineAudioContext(1, totalSamples, sampleRate);
  for (const { buffer, offsetSeconds } of buffers) { const source = mixedCtx.createBufferSource(); source.buffer = buffer; source.connect(mixedCtx.destination); source.start(offsetSeconds); }
  const ttsRendered = await mixedCtx.startRendering();
  const ttsPcm = ttsRendered.getChannelData(0);
  if (!bgmAudio) return { pcmData: ttsPcm, sampleRate };
  const bgmCtx = new OfflineAudioContext(1, 1, sampleRate);
  const bgmBytes = decodeBase64ToBytes(bgmAudio.dataUrl);
  const bgmBuffer = await bgmCtx.decodeAudioData(bgmBytes.buffer.slice(0));
  const bgmMixCtx = new OfflineAudioContext(1, totalSamples, sampleRate);
  const bgmSource = bgmMixCtx.createBufferSource(); bgmSource.buffer = bgmBuffer;
  const BGM_FULL = 0.12;
  const BGM_DUCKED = 0.04; // TTS 나올 때 BGM 볼륨 낮춤
  const DUCK_FADE = 0.3; // 볼륨 전환 시간 (초)
  const bgmGain = bgmMixCtx.createGain(); bgmGain.gain.value = 0;
  // 페이드인
  bgmGain.gain.setValueAtTime(0, 0);
  bgmGain.gain.linearRampToValueAtTime(buffers.length > 0 ? BGM_DUCKED : BGM_FULL, 1.0);
  // TTS 구간 ducking: TTS 있는 씬은 낮게, 없는 씬은 높게
  let sceneOffset = 0;
  for (const scene of scenes) {
    const hasTts = ttsAudios.some(a => a.sceneNumber === scene.scene_number);
    const targetVol = hasTts ? BGM_DUCKED : BGM_FULL;
    const t = Math.max(0.01, sceneOffset);
    bgmGain.gain.setValueAtTime(bgmGain.gain.value, t);
    bgmGain.gain.linearRampToValueAtTime(targetVol, Math.min(t + DUCK_FADE, totalDuration));
    sceneOffset += ttsAudios.find(a => a.sceneNumber === scene.scene_number)?.durationInSeconds ?? scene.duration;
  }
  // 페이드아웃
  const fadeOutStart = Math.max(0, totalDuration - 2.0);
  bgmGain.gain.setValueAtTime(bgmGain.gain.value, fadeOutStart);
  bgmGain.gain.linearRampToValueAtTime(0, totalDuration);
  bgmSource.connect(bgmGain); bgmGain.connect(bgmMixCtx.destination); bgmSource.start(0);
  const bgmRendered = await bgmMixCtx.startRendering();
  const bgmPcm = bgmRendered.getChannelData(0);
  const mixed = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) mixed[i] = Math.max(-1, Math.min(1, (i < ttsPcm.length ? ttsPcm[i] : 0) + (i < bgmPcm.length ? bgmPcm[i] : 0)));
  return { pcmData: mixed, sampleRate };
}

// ── Audio-reactive energy per frame ──

type AudioEnergy = { rms: number; peak: number };

function computeFrameEnergies(pcmData: Float32Array, sampleRate: number, totalFrames: number): AudioEnergy[] {
  const energies: AudioEnergy[] = [];
  const samplesPerFrame = Math.floor(sampleRate / VIDEO_FPS);
  for (let f = 0; f < totalFrames; f++) {
    const start = f * samplesPerFrame;
    const end = Math.min(start + samplesPerFrame, pcmData.length);
    let sumSq = 0, peak = 0;
    for (let i = start; i < end; i++) {
      const v = pcmData[i] || 0;
      sumSq += v * v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    energies.push({ rms: Math.min(rms * 3, 1), peak: Math.min(peak * 2, 1) }); // normalize & amplify
  }
  return energies;
}

function drawAudioReactive(ctx: OffscreenCanvasRenderingContext2D, energy: AudioEnergy, accent: string, glow: string, w: number, h: number) {
  // Bass-reactive center glow
  const glowScale = 1 + energy.rms * 0.6;
  const glowR = 300 * glowScale;
  const glowGrad = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, glowR);
  glowGrad.addColorStop(0, hexToRgba(glow, 0.08 + energy.rms * 0.15));
  glowGrad.addColorStop(1, 'transparent');
  ctx.save();
  ctx.fillStyle = glowGrad;
  ctx.fillRect(w / 2 - glowR, h * 0.45 - glowR, glowR * 2, glowR * 2);
  ctx.restore();

  // Beat flash (on strong peaks)
  if (energy.peak > 0.6) {
    ctx.save();
    ctx.globalAlpha = (energy.peak - 0.6) * 0.2;
    ctx.fillStyle = accent;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  // Edge glow pulse
  const edgeGlow = energy.rms * 0.05;
  if (edgeGlow > 0.01) {
    ctx.save();
    ctx.globalAlpha = edgeGlow;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 60 + energy.rms * 40;
    ctx.strokeStyle = hexToRgba(glow, edgeGlow);
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.restore();
  }
}

// ── Main render ──

export async function renderVideoToMp4(
  scenes: Scene[], ttsAudios: TtsAudio[], onProgress: (progress: number) => void,
  bgmAudio?: BgmAudio | null,
  width: number = VIDEO_WIDTH, height: number = VIDEO_HEIGHT,
  motionTheme?: MotionTheme,
): Promise<Blob> {
  const w = width, h = height;
  const sceneDurations = scenes.map(s => { const tts = ttsAudios.find(a => a.sceneNumber === s.scene_number); return tts ? tts.durationInSeconds : s.duration; });
  const totalDuration = sceneDurations.reduce((a, b) => a + b, 0);
  const totalFrames = Math.round(totalDuration * VIDEO_FPS);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'avc', width: w, height: h }, audio: { codec: 'aac', numberOfChannels: 1, sampleRate: 44100 }, fastStart: 'in-memory' });
  const videoEncoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => console.error('VideoEncoder error:', e) });
  videoEncoder.configure({ codec: 'avc1.640028', width: w, height: h, bitrate: 4_000_000, framerate: VIDEO_FPS });
  const audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => console.error('AudioEncoder error:', e) });
  audioEncoder.configure({ codec: 'mp4a.40.2', numberOfChannels: 1, sampleRate: 44100, bitrate: 128000 });
  const sceneImageBitmaps = new Map<number, ImageBitmap>();
  for (const scene of scenes) {
    if (scene.backgroundImageUrl) {
      try { const r = await fetch(scene.backgroundImageUrl); const b = await r.blob(); sceneImageBitmaps.set(scene.scene_number, await createImageBitmap(b)); }
      catch (err) { console.warn(`Failed to decode image for scene ${scene.scene_number}`, err); }
    }
  }
  // Pre-render Lottie overlays per unique type
  const sceneLottieFrames = new Map<number, ImageBitmap[]>();
  const lottieFrameCache = new Map<string, ImageBitmap[]>();
  for (const scene of scenes) {
    const lt = resolveLottieType(scene.type, scene.motion_style);
    if (!lt) continue;
    if (lottieFrameCache.has(lt)) { sceneLottieFrames.set(scene.scene_number, lottieFrameCache.get(lt)!); continue; }
    try {
      const frames = await preRenderLottieFrames(lt, 540, 540);
      lottieFrameCache.set(lt, frames);
      sceneLottieFrames.set(scene.scene_number, frames);
    } catch (err) { console.warn(`Lottie pre-render failed for ${lt}`, err); }
  }
  let audioData: Float32Array | null = null;
  let audioEnergies: AudioEnergy[] | null = null;
  if (ttsAudios.length > 0) {
    const decoded = await decodeTtsAudio(ttsAudios, scenes, bgmAudio);
    audioData = decoded.pcmData;
    audioEnergies = computeFrameEnergies(decoded.pcmData, decoded.sampleRate, totalFrames);
  }
  let globalFrame = 0;
  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si], sdf = Math.round(sceneDurations[si] * VIDEO_FPS), bitmap = sceneImageBitmaps.get(scene.scene_number);
    const prevSc = si > 0 ? scenes[si - 1] : undefined;
    const lottieFr = sceneLottieFrames.get(scene.scene_number);
    for (let f = 0; f < sdf; f++) {
      const energy = audioEnergies ? audioEnergies[globalFrame] : undefined;
      drawFrame(ctx, scene, f, sdf, w, h, bitmap, prevSc, motionTheme, lottieFr, energy);
      const frame = new VideoFrame(canvas, { timestamp: (globalFrame / VIDEO_FPS) * 1_000_000, duration: (1 / VIDEO_FPS) * 1_000_000 });
      videoEncoder.encode(frame, { keyFrame: f === 0 }); frame.close(); globalFrame++;
      if (globalFrame % 10 === 0) onProgress((globalFrame / totalFrames) * 0.7);
      if (globalFrame % 30 === 0) await new Promise(r => setTimeout(r, 0));
    }
  }
  await videoEncoder.flush(); onProgress(0.75);
  if (audioData) {
    const cs = 1024;
    for (let i = 0; i < audioData.length; i += cs) {
      const chunk = audioData.slice(i, Math.min(i + cs, audioData.length));
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 44100, numberOfFrames: chunk.length, numberOfChannels: 1, timestamp: (i / 44100) * 1_000_000, data: chunk });
      audioEncoder.encode(ad); ad.close();
      if (i % (cs * 100) === 0) { onProgress(0.75 + (i / audioData.length) * 0.2); await new Promise(r => setTimeout(r, 0)); }
    }
  }
  await audioEncoder.flush(); onProgress(0.95);
  videoEncoder.close(); audioEncoder.close(); muxer.finalize(); onProgress(1);
  return new Blob([target.buffer], { type: 'video/mp4' });
}

export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';
}
