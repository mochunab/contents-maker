import JSZip from 'jszip';
import type { Scene, ScriptResult, TtsAudio } from '../shortform/types';

// ── UUID generation (32-char hex, no dashes) ──

function generateHexId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function generateDashedUuid(): string {
  const hex = generateHexId();
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-').toUpperCase();
}

// ── Time helpers ──

const MICROSECONDS = 1_000_000;

function secondsToMicro(seconds: number): number {
  return Math.round(seconds * MICROSECONDS);
}

// ── Text content builder ──

function buildTextContent(text: string): string {
  // Strip **bold** markers for clean text
  const cleanText = text.replace(/\*\*/g, '');
  return JSON.stringify({
    text: cleanText,
    styles: [{
      fill: {
        alpha: 1.0,
        content: {
          render_type: 'solid',
          solid: { alpha: 1.0, color: [1.0, 1.0, 1.0] },
        },
      },
      range: [0, cleanText.length],
      size: 5.0,
      bold: false,
      italic: false,
      underline: false,
      strokes: [{
        color: [0.0, 0.0, 0.0],
        alpha: 1.0,
        width: 0.08,
      }],
    }],
  });
}

// ── Segment base template ──

function createSegmentBase() {
  return {
    enable_adjust: true,
    enable_color_correct_adjust: false,
    enable_color_curves: true,
    enable_color_match_adjust: false,
    enable_color_wheels: true,
    enable_lut: true,
    enable_smart_color_adjust: false,
    last_nonzero_volume: 1.0,
    reverse: false,
    track_attribute: 0,
    track_render_index: 0,
    visible: true,
    common_keyframes: [],
    keyframe_refs: [],
  };
}

// ── Main export function ──

export async function generateCapcutZip(
  result: ScriptResult,
  scenes: Scene[],
  ttsAudios: TtsAudio[],
  canvasWidth: number = 1080,
  canvasHeight: number = 1920,
): Promise<Blob> {
  const zip = new JSZip();
  const draftFolder = zip.folder('capcut_project')!;
  const ttsFolder = draftFolder.folder('tts')!;

  // ── Convert TTS data URLs to mp3 blobs and save to ZIP ──
  const audioFiles: { filename: string; durationMicro: number }[] = [];

  for (const audio of ttsAudios) {
    const filename = `scene_${String(audio.sceneNumber).padStart(3, '0')}.mp3`;
    const base64 = audio.dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    ttsFolder.file(filename, bytes);
    audioFiles.push({
      filename,
      durationMicro: secondsToMicro(audio.durationInSeconds),
    });
  }

  // ── Build materials and tracks ──
  const audioMaterials: Record<string, unknown>[] = [];
  const textMaterials: Record<string, unknown>[] = [];
  const speedMaterials: Record<string, unknown>[] = [];
  const audioSegments: Record<string, unknown>[] = [];
  const textSegments: Record<string, unknown>[] = [];

  let timelinePosition = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const audioFile = audioFiles[i];
    if (!audioFile) continue;

    const audioMatId = generateHexId();
    const textMatId = generateHexId();
    const audioSpeedId = generateHexId();
    const textSpeedId = generateHexId();
    const audioSegId = generateHexId();
    const textSegId = generateHexId();

    const durationMicro = audioFile.durationMicro;

    // Audio material
    audioMaterials.push({
      app_id: 0,
      category_id: '',
      category_name: 'local',
      check_flag: 3,
      copyright_limit_type: 'none',
      duration: durationMicro,
      effect_id: '',
      formula_id: '',
      id: audioMatId,
      local_material_id: audioMatId,
      music_id: audioMatId,
      name: audioFile.filename,
      path: `tts/${audioFile.filename}`,
      source_platform: 0,
      type: 'extract_music',
      wave_points: [],
    });

    // Text material
    textMaterials.push({
      id: textMatId,
      type: 'subtitle',
      alignment: 1,
      check_flag: 7,
      content: buildTextContent(scene.subtitle),
      global_alpha: 1.0,
      letter_spacing: 0.0,
      line_spacing: 0.02,
      line_feed: 1,
      line_max_width: 0.82,
      force_apply_line_max_width: false,
      typesetting: 0,
    });

    // Speed materials
    speedMaterials.push(
      { curve_speed: null, id: audioSpeedId, mode: 0, speed: 1.0, type: 'speed' },
      { curve_speed: null, id: textSpeedId, mode: 0, speed: 1.0, type: 'speed' },
    );

    // Audio segment
    audioSegments.push({
      ...createSegmentBase(),
      id: audioSegId,
      material_id: audioMatId,
      target_timerange: { start: timelinePosition, duration: durationMicro },
      source_timerange: { start: 0, duration: durationMicro },
      speed: 1.0,
      volume: 1.0,
      extra_material_refs: [audioSpeedId],
      render_index: 0,
      clip: null,
      hdr_settings: null,
    });

    // Text segment
    textSegments.push({
      ...createSegmentBase(),
      id: textSegId,
      material_id: textMatId,
      target_timerange: { start: timelinePosition, duration: durationMicro },
      source_timerange: null,
      speed: 1.0,
      volume: 1.0,
      extra_material_refs: [textSpeedId],
      render_index: 15000,
      clip: {
        alpha: 1.0,
        flip: { horizontal: false, vertical: false },
        rotation: 0.0,
        scale: { x: 1.0, y: 1.0 },
        transform: { x: 0.0, y: -0.8 },
      },
      uniform_scale: { on: true, value: 1.0 },
    });

    timelinePosition += durationMicro;
  }

  const totalDuration = timelinePosition;
  const draftId = generateHexId();

  // ── Build empty materials arrays ──
  const emptyArrays = {
    ai_translates: [],
    audio_balances: [],
    audio_effects: [],
    audio_fades: [],
    audio_track_indexes: [],
    beats: [],
    canvases: [],
    chromas: [],
    color_curves: [],
    digital_humans: [],
    drafts: [],
    effects: [],
    flowers: [],
    green_screens: [],
    handwrites: [],
    hsl: [],
    images: [],
    log_color_wheels: [],
    loudnesses: [],
    manual_deformations: [],
    masks: [],
    material_animations: [],
    material_colors: [],
    multi_language_refs: [],
    placeholders: [],
    plugin_effects: [],
    primary_color_wheels: [],
    realtime_denoises: [],
    shapes: [],
    smart_crops: [],
    smart_relights: [],
    sound_channel_mappings: [],
    stickers: [],
    tail_leaders: [],
    text_templates: [],
    time_marks: [],
    transitions: [],
    video_effects: [],
    video_trackings: [],
    videos: [],
    vocal_beautifys: [],
    vocal_separations: [],
  };

  // ── draft_content.json ──
  const draftContent = {
    canvas_config: { height: canvasHeight, ratio: 'original', width: canvasWidth },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: '',
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      multi_language_current: 'none',
      multi_language_list: [],
      multi_language_main: 'none',
      multi_language_mode: 'none',
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_keywords_config: null,
      subtitle_recognition_id: '',
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      use_float_render: false,
      video_mute: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: 0,
    duration: totalDuration,
    extra_info: null,
    fps: 30.0,
    free_render_index_mode_on: false,
    group_container: null,
    id: draftId,
    is_drop_frame_timecode: false,
    keyframe_graph_list: [],
    keyframes: {
      adjusts: [], audios: [], effects: [], filters: [],
      handwrites: [], stickers: [], texts: [], videos: [],
    },
    last_modified_platform: {
      app_id: 359289, app_source: 'cc', app_version: '6.7.0', os: 'windows',
    },
    lyrics_effects: [],
    materials: {
      ...emptyArrays,
      audios: audioMaterials,
      texts: textMaterials,
      speeds: speedMaterials,
    },
    mutable_config: null,
    name: '',
    new_version: '140.0.0',
    path: '',
    platform: {
      app_id: 359289, app_source: 'cc', app_version: '6.7.0', os: 'windows',
    },
    relationships: [],
    render_index_track_mode_on: false,
    retouch_cover: null,
    source: 'default',
    static_cover_image_path: '',
    time_marks: null,
    tracks: [
      {
        attribute: 0, flag: 0, id: generateHexId(),
        is_default_name: true, name: '', type: 'audio',
        segments: audioSegments,
      },
      {
        attribute: 0, flag: 0, id: generateHexId(),
        is_default_name: true, name: '', type: 'text',
        segments: textSegments,
      },
    ],
    update_time: 0,
    version: 360000,
  };

  // ── draft_meta_info.json ──
  const draftMetaInfo = {
    cloud_draft_cover: false,
    cloud_draft_sync: false,
    cloud_package_completed_time: '',
    draft_cloud_capcut_purchase_info: '',
    draft_cloud_last_action_download: false,
    draft_cloud_package_type: '',
    draft_cloud_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cover: '',
    draft_deeplink_url: '',
    draft_enterprise_info: {
      draft_enterprise_extra: '',
      draft_enterprise_id: '',
      draft_enterprise_name: '',
      enterprise_material: [],
    },
    draft_fold_path: '',
    draft_id: generateDashedUuid(),
    draft_is_ae_produce: false,
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_ai_translate: false,
    draft_is_article_video_draft: false,
    draft_is_cloud_temp_draft: false,
    draft_is_from_deeplink: 'false',
    draft_is_invisible: false,
    draft_materials: [
      { type: 0, value: [] },
      { type: 1, value: [] },
      { type: 2, value: [] },
      { type: 3, value: [] },
      { type: 6, value: [] },
      { type: 7, value: [] },
      { type: 8, value: [] },
    ],
    draft_materials_copied_info: [],
    draft_name: result.title,
    draft_new_version: '',
    draft_removable_storage_device: '',
    draft_root_path: '',
    draft_segment_extra_info: [],
    draft_timeline_materials_size_: 0,
    draft_type: '',
    tm_draft_cloud_completed: '',
    tm_draft_cloud_entry_id: 0,
    tm_draft_cloud_modified: 0,
    tm_draft_removed: 0,
    tm_duration: totalDuration,
  };

  // ── Write files to ZIP ──
  draftFolder.file('draft_content.json', JSON.stringify(draftContent, null, 2));
  draftFolder.file('draft_meta_info.json', JSON.stringify(draftMetaInfo, null, 2));

  // ── Generate ZIP blob ──
  return zip.generateAsync({ type: 'blob' });
}
