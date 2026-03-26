import { AbsoluteFill, Sequence, Audio } from 'remotion';
import { TransitionSeries, springTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { flip } from '@remotion/transitions/flip';
import { none } from '@remotion/transitions/none';
import type { TransitionPresentation } from '@remotion/transitions';
import { LightLeak } from '@remotion/light-leaks';
import type { Scene, TtsAudio, BgmAudio, MotionTheme } from '../types';
import { VIDEO_FPS } from '../constants';
import SceneRenderer from './SceneRenderer';
import SubtitleOverlay from './SubtitleOverlay';
import AudioReactiveOverlay from './AudioReactiveOverlay';

// ── Transition duration (frames) ──
const TRANSITION_FRAMES = 10; // 0.33s overlap
const LIGHT_LEAK_FRAMES = 20; // 0.67s light leak effect

// ── Convert hex accent color to hue shift (0-360) ──
function hexToHueShift(hex?: string): number {
  if (!hex) return 30; // default warm orange
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 30;
  let h = 0;
  const d = max - min;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return Math.round(h * 360);
}

// ── Map scene transition string to @remotion/transitions presentation ──

function getPresentation(transition: string): TransitionPresentation<Record<string, unknown>> {
  switch (transition?.toLowerCase()) {
    case 'fade':
      return fade();
    case 'slide':
      return slide({ direction: 'from-right' });
    case 'wipe_left':
      return wipe({ direction: 'from-left' });
    case 'zoom':
      // zoom → slide from bottom (closest built-in equivalent)
      return slide({ direction: 'from-bottom' });
    case 'blur_in':
      return fade();
    case 'scale_rotate':
      return flip({ direction: 'from-right' });
    case 'cut':
    default:
      return none();
  }
}

function getTransitionDuration(transition: string): number {
  const t = transition?.toLowerCase() || 'cut';
  if (t === 'cut') return 0;
  return TRANSITION_FRAMES;
}

// ── Duration calculations ──

export type ShortFormVideoProps = {
  scenes: Scene[];
  ttsAudios: TtsAudio[];
  bgmAudio?: BgmAudio | null;
  motionTheme?: MotionTheme;
};

export function computeSceneFrames(scenes: Scene[], ttsAudios: TtsAudio[]): number[] {
  return scenes.map((scene) => {
    const tts = ttsAudios.find(a => a.sceneNumber === scene.scene_number);
    const durationSec = tts ? tts.durationInSeconds : scene.duration;
    return Math.round(durationSec * VIDEO_FPS);
  });
}

/** Total frames for canvas renderer (no transition overlap) */
export function computeTotalFrames(scenes: Scene[], ttsAudios: TtsAudio[]): number {
  return computeSceneFrames(scenes, ttsAudios).reduce((a, b) => a + b, 0);
}

/** Total frames for Remotion Player (accounts for TransitionSeries overlap) */
export function computeTotalFramesWithTransitions(scenes: Scene[], ttsAudios: TtsAudio[]): number {
  const sceneFrames = computeSceneFrames(scenes, ttsAudios);
  const total = sceneFrames.reduce((a, b) => a + b, 0);
  // Subtract overlap for each transition between scenes
  let overlapTotal = 0;
  for (let i = 1; i < scenes.length; i++) {
    overlapTotal += getTransitionDuration(scenes[i].transition);
  }
  return Math.max(1, total - overlapTotal);
}

export default function ShortFormVideo({ scenes, ttsAudios, bgmAudio, motionTheme }: ShortFormVideoProps) {
  const sceneFrames = computeSceneFrames(scenes, ttsAudios);
  const totalFrames = computeTotalFramesWithTransitions(scenes, ttsAudios);

  // Compute audio offsets accounting for transition overlaps
  const audioOffsets: number[] = [];
  let offset = 0;
  for (let i = 0; i < scenes.length; i++) {
    audioOffsets.push(offset);
    offset += sceneFrames[i];
    // Subtract next scene's transition overlap
    if (i + 1 < scenes.length) {
      offset -= getTransitionDuration(scenes[i + 1].transition);
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* BGM track (full duration, ducking when TTS plays) */}
      {bgmAudio && (
        <Sequence from={0} durationInFrames={totalFrames}>
          <Audio src={bgmAudio.dataUrl} volume={(f) => {
            const BGM_FULL = 0.12;
            const BGM_DUCKED = 0.04;
            // 현재 프레임이 TTS 구간인지 확인
            for (let i = 0; i < scenes.length; i++) {
              const hasTts = ttsAudios.some(a => a.sceneNumber === scenes[i].scene_number);
              if (f >= audioOffsets[i] && f < audioOffsets[i] + sceneFrames[i]) {
                return hasTts ? BGM_DUCKED : BGM_FULL;
              }
            }
            return BGM_FULL;
          }} />
        </Sequence>
      )}

      {/* TTS audio tracks (positioned at correct offsets) */}
      {scenes.map((scene, idx) => {
        const tts = ttsAudios.find(a => a.sceneNumber === scene.scene_number);
        if (!tts) return null;
        return (
          <Sequence key={`tts-${scene.scene_number}`} from={audioOffsets[idx]} durationInFrames={sceneFrames[idx]}>
            <Audio src={tts.dataUrl} />
          </Sequence>
        );
      })}

      {/* Scene visuals with TransitionSeries */}
      <TransitionSeries>
        {scenes.flatMap((scene, idx) => {
          const dur = sceneFrames[idx];
          const elements = [];

          // Transition before this scene (except first)
          if (idx > 0) {
            const transitionDur = getTransitionDuration(scene.transition);
            if (transitionDur > 0) {
              elements.push(
                <TransitionSeries.Transition
                  key={`t-${scene.scene_number}`}
                  presentation={getPresentation(scene.transition)}
                  timing={springTiming({
                    config: { damping: 200 },
                    durationInFrames: transitionDur,
                    durationRestThreshold: 0.001,
                  })}
                />
              );
            }
          }

          // Scene sequence
          const tts = ttsAudios.find(a => a.sceneNumber === scene.scene_number);
          elements.push(
            <TransitionSeries.Sequence key={`s-${scene.scene_number}`} durationInFrames={dur}>
              <SceneRenderer
                scene={scene}
                prevScene={idx > 0 ? scenes[idx - 1] : undefined}
                motionTheme={motionTheme}
              />
              <AudioReactiveOverlay
                ttsSrc={tts?.dataUrl}
                bgmSrc={bgmAudio?.dataUrl}
                accentColor={scene.accent_color}
                glowColor={scene.glow_color}
              />
              <SubtitleOverlay subtitle={scene.subtitle} />
            </TransitionSeries.Sequence>
          );

          return elements;
        })}
      </TransitionSeries>

      {/* Light Leak overlays at transition points (cinematic flash) */}
      {scenes.map((scene, idx) => {
        if (idx === 0) return null;
        const transitionDur = getTransitionDuration(scene.transition);
        if (transitionDur === 0) return null;
        // Center light leak on the transition midpoint
        const leakStart = Math.max(0, audioOffsets[idx] - Math.floor(LIGHT_LEAK_FRAMES / 2));
        return (
          <Sequence key={`ll-${scene.scene_number}`} from={leakStart} durationInFrames={LIGHT_LEAK_FRAMES}>
            <AbsoluteFill style={{ opacity: 0.35, mixBlendMode: 'screen', pointerEvents: 'none' }}>
              <LightLeak
                durationInFrames={LIGHT_LEAK_FRAMES}
                seed={scene.scene_number}
                hueShift={hexToHueShift(scene.accent_color)}
              />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
