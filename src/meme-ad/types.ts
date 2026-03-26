import type { Scene, ScriptResult, TtsAudio, BgmAudio } from '../shortform/types';

// Re-export for convenience
export type { Scene, ScriptResult, TtsAudio, BgmAudio };

export type HookVideoInfo = {
  file: File;
  objectUrl: string;
  durationInSeconds: number;
};

export type MemeAdScriptResult = ScriptResult & {
  /** 광고 부분만의 길이 (훅 제외) */
  ad_duration: number;
};
