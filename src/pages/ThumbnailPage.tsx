import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { supabaseUrl } from '../lib/supabase';
import ArrowLeft from '../components/ArrowLeft';

// ── Types ──

type Step = 'input' | 'result';

type GeneratedImage = {
  id: number;
  src: string; // data:image/...;base64,...
  label?: string; // 항목별 생성 시 라벨
  itemPrompt?: string; // 항목별 개별 프롬프트
};

// ── Constants ──

const font = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif";

const C = {
  primary: '#48b2af',
  primaryDark: '#41a09e',
  primaryLight: '#f0f8f8',
  surface: '#ffffff',
  surfaceDisabled: '#f8f8f8',
  surfaceSecondary: '#f9f9f9',
  borderDefault: '#e7e7e7',
  borderDivider: '#f3f3f3',
  textPrimary: '#151515',
  textBlack: '#000000',
  textSecondary: '#525252',
  textTertiary: '#6d6d6d',
  textCaption: '#848484',
  textDisabled: '#b7b7b7',
  textWhite: '#ffffff',
};

const ASPECT_RATIOS = [
  { id: '9:16', label: '9:16', desc: '릴스·쇼츠·틱톡', width: 1080, height: 1920 },
  { id: '3:4', label: '3:4', desc: '네이버 블로그', width: 900, height: 1200 },
  { id: '1:1', label: '1:1', desc: '인스타 정사각', width: 1080, height: 1080 },
  { id: '16:9', label: '16:9', desc: '유튜브 썸네일', width: 1280, height: 720 },
] as const;

const REFERENCE_MODES = [
  { id: 'style_only', label: '스타일만 참고', desc: '색감·구도·분위기만 따라감' },
  { id: 'style_and_character', label: '캐릭터+스타일', desc: '캐릭터·인물까지 유지' },
] as const;

const IMAGE_COUNTS = [1, 2, 3, 4] as const;

const FILE_FORMATS = [
  { id: 'png', label: 'PNG', desc: '고화질·투명 배경' },
  { id: 'jpg', label: 'JPG', desc: '작은 용량' },
  { id: 'webp', label: 'WebP', desc: '웹 최적화' },
] as const;

// ── Prompt Parsing ──

/** 프롬프트에서 리스트 항목을 감지하여 분리 */
function parsePromptItems(text: string): { baseInstruction: string; items: string[] } | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return null; // 최소 지시문 1줄 + 항목 2개

  // 지시문과 항목 리스트 분리: 짧은 줄(30자 이하)이 연속 2개 이상이면 리스트로 판단
  let listStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    // 연속 2줄이 30자 이하 + 숫자/글머리 패턴이 아닌 짧은 텍스트면 리스트 시작
    if (lines[i].length <= 30 && i + 1 < lines.length && lines[i + 1].length <= 30) {
      listStartIdx = i;
      break;
    }
  }

  if (listStartIdx < 1) return null; // 지시문이 최소 1줄은 있어야 함

  const baseInstruction = lines.slice(0, listStartIdx).join('\n');
  const items = lines.slice(listStartIdx).filter(l => l.length > 0 && l.length <= 30);

  if (items.length < 2) return null;
  return { baseInstruction, items };
}

// ── Component ──

export default function ThumbnailPage() {
  const navigate = useNavigate();

  // Step
  const [step, setStep] = useState<Step>('input');

  // Input
  const [prompt, setPrompt] = useState('');
  const [ratioId, setRatioId] = useState<string>('9:16');
  const [referenceMode, setReferenceMode] = useState<string>('style_only');
  const [imageCount, setImageCount] = useState<number>(2);
  const [customCountActive, setCustomCountActive] = useState(false);
  const [fileFormat, setFileFormat] = useState<string>('png');
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceBase64, setReferenceBase64] = useState<string | null>(null);

  // Result
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Handlers ──

  const processReferenceFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('이미지는 10MB 이하만 업로드 가능해요');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setReferencePreview(dataUrl);
      const base64 = dataUrl.split(',')[1];
      setReferenceBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processReferenceFile(file);
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processReferenceFile(file);
  };

  const removeReference = () => {
    setReferencePreview(null);
    setReferenceBase64(null);
  };

  const callGenerateApi = async (promptOverride?: string): Promise<{ image: string; mimeType: string }> => {
    const body: Record<string, unknown> = {
      prompt: promptOverride || prompt,
      aspect_ratio: ratioId,
    };
    if (referenceBase64) {
      body.reference_image = referenceBase64;
      body.reference_mode = referenceMode;
    }
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-thumbnail-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '이미지 생성 실패');
    return data as { image: string; mimeType: string };
  };

  // 프롬프트에서 항목 리스트 감지
  const parsedItems = parsePromptItems(prompt);
  const isListMode = parsedItems !== null && parsedItems.items.length >= 2;
  const effectiveCount = isListMode ? parsedItems!.items.length : imageCount;

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setImages([]);
    setGeneratedCount(0);
    setStep('result');

    const BATCH_SIZE = 4;
    const results: GeneratedImage[] = [];
    const totalCount = isListMode ? parsedItems!.items.length : imageCount;

    // 항목별 생성 작업 목록 구성
    const tasks: { id: number; label?: string; itemPrompt?: string }[] = [];
    if (isListMode) {
      parsedItems!.items.forEach((item, i) => {
        tasks.push({
          id: i + 1,
          label: item,
          itemPrompt: `${parsedItems!.baseInstruction}\n\n이번 이미지의 주제: ${item}`,
        });
      });
    } else {
      for (let i = 0; i < totalCount; i++) {
        tasks.push({ id: i + 1 });
      }
    }

    for (let batchStart = 0; batchStart < tasks.length; batchStart += BATCH_SIZE) {
      const batch = tasks.slice(batchStart, batchStart + BATCH_SIZE);

      const settled = await Promise.allSettled(
        batch.map(async (task) => {
          const data = await callGenerateApi(task.itemPrompt);
          return {
            id: task.id,
            src: `data:${data.mimeType};base64,${data.image}`,
            label: task.label,
            itemPrompt: task.itemPrompt,
          } as GeneratedImage;
        })
      );

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error('Image generation failed:', result.reason);
        }
      }

      results.sort((a, b) => a.id - b.id);
      setImages([...results]);
      setGeneratedCount(results.length);
    }

    if (results.length === 0) {
      setError('이미지 생성에 실패했어요');
    }

    setGenerating(false);
  }, [prompt, ratioId, referenceBase64, referenceMode, imageCount, isListMode, parsedItems]);

  const handleRegenerate = useCallback(async (targetId: number) => {
    setError(null);
    // 해당 이미지의 개별 프롬프트 찾기
    const targetImg = images.find(img => img.id === targetId);
    const regenPrompt = targetImg?.itemPrompt;
    setImages(prev => prev.map(img =>
      img.id === targetId ? { ...img, src: '' } : img
    ));
    try {
      const data = await callGenerateApi(regenPrompt);
      setImages(prev => prev.map(img =>
        img.id === targetId ? { ...img, src: `data:${data.mimeType};base64,${data.image}` } : img
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : '재생성 실패');
    }
  }, [prompt, ratioId, referenceBase64, referenceMode, images]);

  const convertAndDownload = useCallback(async (src: string, filename: string) => {
    if (!src) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
    const mime = mimeMap[fileFormat] || 'image/png';
    const quality = fileFormat === 'png' ? undefined : 0.92;

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality));
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${fileFormat}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fileFormat]);

  const toFileName = (img: GeneratedImage) =>
    img.label ? img.label.replace(/[\\?%*:|"<>]/g, '_') : `${img.id}`;

  const handleDownload = useCallback((img: GeneratedImage) => {
    convertAndDownload(img.src, toFileName(img));
  }, [convertAndDownload]);

  const [zipping, setZipping] = useState(false);

  const handleDownloadAll = useCallback(async () => {
    const validImages = images.filter(img => img.src);
    if (validImages.length === 0) return;

    setZipping(true);
    try {
      const zip = new JSZip();
      const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
      const mime = mimeMap[fileFormat] || 'image/png';
      const quality = fileFormat === 'png' ? undefined : 0.92;

      for (const img of validImages) {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = reject;
          image.src = img.src;
        });
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d')!.drawImage(image, 0, 0);

        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality));
        if (blob) {
          zip.file(`${toFileName(img)}.${fileFormat}`, blob);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'thumbnails.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('ZIP 생성 실패:', err);
      setError('ZIP 다운로드에 실패했어요');
    } finally {
      setZipping(false);
    }
  }, [images, fileFormat]);

  const selectedRatio = ASPECT_RATIOS.find(r => r.id === ratioId)!;
  const headerTitle = step === 'input' ? 'AI 썸네일 메이커' : '생성 결과';
  const canGenerate = prompt.trim().length > 0;

  // Shift+1 단축키 → 썸네일 생성하기
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === '!' && step === 'input' && canGenerate && !generating) {
        e.preventDefault();
        handleGenerate();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, canGenerate, generating, handleGenerate]);

  // ── Render ──

  return (
    <div className="bg-white relative min-h-screen w-full flex justify-center">
      <div className="w-full max-w-[440px] relative" style={{ fontFamily: font }}>

        {/* NavigationHeader */}
        <div className="bg-white h-[52px] shrink-0 w-full z-20 fixed top-0 left-1/2 -translate-x-1/2 max-w-[440px]">
          <div className="flex flex-col justify-center size-full">
            <div className="content-stretch flex items-center justify-between px-[12px] py-[4px] relative size-full">
              <ArrowLeft onClick={() => {
                if (step === 'result') { setStep('input'); return; }
                navigate(-1);
              }} />
              <p style={{
                fontFamily: font, fontSize: '18px', fontWeight: 600,
                lineHeight: '25.5px', letterSpacing: '-0.36px',
                color: C.textBlack, textAlign: 'center',
              }}>
                {headerTitle}
              </p>
              <div className="w-[44px]" />
            </div>
          </div>
        </div>

        {/* 헤더 여백 */}
        <div className="h-[60px]" />

        {/* ════════ STEP: INPUT ════════ */}
        {step === 'input' && (
          <div style={{ padding: '0 20px', paddingBottom: '140px' }}>

            {/* Title */}
            <div style={{ marginTop: '8px', marginBottom: '24px' }}>
              <h1 style={{
                fontFamily: font, fontSize: '22px', fontWeight: 600,
                lineHeight: '32.5px', letterSpacing: '-0.22px',
                color: C.textPrimary, margin: 0,
              }}>
                AI 썸네일 메이커
              </h1>
              <p style={{
                fontFamily: font, fontSize: '15px', fontWeight: 400,
                lineHeight: '20px', letterSpacing: '-0.45px',
                color: C.textTertiary, marginTop: '8px',
              }}>
                레퍼런스를 넣고 명령하면 AI가 썸네일을 만들어요
              </p>
            </div>

            {/* ── 명령어 입력 ── */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                fontFamily: font, fontSize: '15px', fontWeight: 600,
                lineHeight: '20px', letterSpacing: '-0.3px',
                color: C.textPrimary, display: 'block', marginBottom: '10px',
              }}>
                명령어 <span style={{ color: C.primary }}>*</span>
              </label>
              <div style={{
                borderRadius: '16px', border: `1px solid ${C.borderDefault}`,
                padding: '14px 16px', backgroundColor: C.surface,
              }}>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="예: 유튜브 먹방 썸네일, 맛있는 치킨 앞에서 놀란 표정의 남자, 큰 글씨로 '역대급 치킨 먹방' 텍스트"
                  rows={4}
                  className="w-full outline-none bg-transparent resize-none"
                  style={{
                    fontFamily: font, fontSize: '15px', fontWeight: 400,
                    lineHeight: '22px', letterSpacing: '-0.45px',
                    color: C.textPrimary, border: 'none',
                  }}
                />
              </div>
            </div>

            {/* ── 레퍼런스 이미지 ── */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                fontFamily: font, fontSize: '15px', fontWeight: 600,
                lineHeight: '20px', letterSpacing: '-0.3px',
                color: C.textPrimary, display: 'block', marginBottom: '10px',
              }}>
                레퍼런스 이미지
              </label>

              {referencePreview ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    src={referencePreview}
                    alt="레퍼런스"
                    style={{
                      width: '120px', height: '120px', objectFit: 'cover',
                      borderRadius: '12px', border: `1px solid ${C.borderDefault}`,
                    }}
                  />
                  <button
                    onClick={removeReference}
                    style={{
                      position: 'absolute', top: '-8px', right: '-8px',
                      width: '24px', height: '24px', borderRadius: '50%',
                      backgroundColor: '#ff4d4f', border: 'none',
                      color: C.textWhite, fontSize: '14px', fontWeight: 700,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    width: '100%', height: '120px', borderRadius: '16px',
                    border: `2px dashed ${isDragging ? C.primary : C.borderDefault}`,
                    backgroundColor: isDragging ? 'rgba(72, 178, 175, 0.06)' : C.surfaceSecondary,
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    gap: '8px',
                  }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={isDragging ? C.primary : C.textDisabled} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span style={{
                    fontFamily: font, fontSize: '13px', fontWeight: 400,
                    color: isDragging ? C.primary : C.textCaption,
                  }}>
                    {isDragging ? '여기에 놓으세요' : '이미지를 드래그하거나 클릭하세요 (10MB 이하)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleReferenceUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>

            {/* ── 레퍼런스 모드 (레퍼런스가 있을 때만) ── */}
            {referencePreview && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  fontFamily: font, fontSize: '15px', fontWeight: 600,
                  lineHeight: '20px', letterSpacing: '-0.3px',
                  color: C.textPrimary, display: 'block', marginBottom: '10px',
                }}>
                  참고 방식
                </label>
                <div className="flex" style={{ gap: '8px' }}>
                  {REFERENCE_MODES.map(mode => {
                    const selected = referenceMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => setReferenceMode(mode.id)}
                        className="flex-1"
                        style={{
                          padding: '12px 8px', borderRadius: '12px',
                          backgroundColor: selected ? C.primaryLight : C.surface,
                          border: `1.5px solid ${selected ? C.primary : C.borderDefault}`,
                          cursor: 'pointer', transition: 'all 0.15s ease',
                          textAlign: 'center',
                        }}
                      >
                        <p style={{
                          fontFamily: font, fontSize: '14px', fontWeight: selected ? 600 : 400,
                          color: selected ? C.primary : C.textPrimary,
                          letterSpacing: '-0.28px',
                        }}>
                          {mode.label}
                        </p>
                        <p style={{
                          fontFamily: font, fontSize: '11px', fontWeight: 400,
                          color: C.textCaption, marginTop: '4px',
                          letterSpacing: '-0.22px',
                        }}>
                          {mode.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 이미지 비율 ── */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                fontFamily: font, fontSize: '15px', fontWeight: 600,
                lineHeight: '20px', letterSpacing: '-0.3px',
                color: C.textPrimary, display: 'block', marginBottom: '10px',
              }}>
                이미지 비율
              </label>
              <div className="flex flex-wrap" style={{ gap: '8px' }}>
                {ASPECT_RATIOS.map(ratio => {
                  const selected = ratioId === ratio.id;
                  return (
                    <button
                      key={ratio.id}
                      onClick={() => setRatioId(ratio.id)}
                      style={{
                        height: '40px', padding: '0 14px', borderRadius: '12px',
                        fontFamily: font, fontSize: '13px', fontWeight: selected ? 600 : 400,
                        letterSpacing: '-0.26px',
                        color: selected ? C.textWhite : C.textTertiary,
                        backgroundColor: selected ? C.primary : C.surface,
                        border: selected ? 'none' : `1px solid ${C.borderDefault}`,
                        cursor: 'pointer', transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ratio.label}
                    </button>
                  );
                })}
              </div>
              <p style={{
                fontFamily: font, fontSize: '12px', fontWeight: 400,
                color: C.textCaption, marginTop: '8px',
                letterSpacing: '-0.24px',
              }}>
                {selectedRatio.desc} ({selectedRatio.width}×{selectedRatio.height}px)
              </p>
            </div>

            {/* ── 생성 개수 ── */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                fontFamily: font, fontSize: '15px', fontWeight: 600,
                lineHeight: '20px', letterSpacing: '-0.3px',
                color: C.textPrimary, display: 'block', marginBottom: '10px',
              }}>
                생성 개수
              </label>
              <div className="flex items-center" style={{ gap: '8px' }}>
                {IMAGE_COUNTS.map(count => {
                  const selected = imageCount === count && !customCountActive;
                  return (
                    <button
                      key={count}
                      onClick={() => { setImageCount(count); setCustomCountActive(false); }}
                      style={{
                        width: '48px', height: '40px', borderRadius: '12px',
                        fontFamily: font, fontSize: '14px', fontWeight: selected ? 600 : 400,
                        color: selected ? C.textWhite : C.textTertiary,
                        backgroundColor: selected ? C.primary : C.surface,
                        border: selected ? 'none' : `1px solid ${C.borderDefault}`,
                        cursor: 'pointer', transition: 'all 0.15s ease',
                      }}
                    >
                      {count}장
                    </button>
                  );
                })}
                <div className="flex items-center" style={{
                  height: '40px', borderRadius: '12px',
                  border: `1.5px solid ${customCountActive ? C.primary : C.borderDefault}`,
                  backgroundColor: customCountActive ? C.primaryLight : C.surface,
                  padding: '0 4px 0 10px',
                  transition: 'all 0.15s ease',
                  gap: '2px',
                }}>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={customCountActive ? imageCount : ''}
                    placeholder="직접"
                    onFocus={() => setCustomCountActive(true)}
                    onChange={e => {
                      setCustomCountActive(true);
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 1 && v <= 50) setImageCount(v);
                    }}
                    className="outline-none bg-transparent"
                    style={{
                      width: '40px', height: '100%',
                      fontFamily: font, fontSize: '14px', fontWeight: customCountActive ? 600 : 400,
                      color: customCountActive ? C.primary : C.textTertiary,
                      textAlign: 'center', border: 'none',
                    }}
                  />
                  <span style={{
                    fontFamily: font, fontSize: '13px', fontWeight: 400,
                    color: customCountActive ? C.primary : C.textCaption,
                  }}>장</span>
                </div>
              </div>
            </div>

            {/* ── 파일 형식 ── */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                fontFamily: font, fontSize: '15px', fontWeight: 600,
                lineHeight: '20px', letterSpacing: '-0.3px',
                color: C.textPrimary, display: 'block', marginBottom: '10px',
              }}>
                파일 형식
              </label>
              <div className="flex" style={{ gap: '8px' }}>
                {FILE_FORMATS.map(fmt => {
                  const selected = fileFormat === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      onClick={() => setFileFormat(fmt.id)}
                      style={{
                        height: '40px', padding: '0 14px', borderRadius: '12px',
                        fontFamily: font, fontSize: '13px', fontWeight: selected ? 600 : 400,
                        letterSpacing: '-0.26px',
                        color: selected ? C.textWhite : C.textTertiary,
                        backgroundColor: selected ? C.primary : C.surface,
                        border: selected ? 'none' : `1px solid ${C.borderDefault}`,
                        cursor: 'pointer', transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fmt.label}
                    </button>
                  );
                })}
              </div>
              <p style={{
                fontFamily: font, fontSize: '12px', fontWeight: 400,
                color: C.textCaption, marginTop: '8px',
                letterSpacing: '-0.24px',
              }}>
                {FILE_FORMATS.find(f => f.id === fileFormat)?.desc}
              </p>
            </div>

            {/* ── 리스트 감지 안내 ── */}
            {isListMode && parsedItems && (
              <div style={{
                padding: '14px 16px', borderRadius: '12px',
                backgroundColor: C.primaryLight, marginBottom: '16px',
                border: `1px solid ${C.primary}20`,
              }}>
                <p style={{
                  fontFamily: font, fontSize: '13px', fontWeight: 600,
                  color: C.primaryDark, letterSpacing: '-0.26px', marginBottom: '8px',
                }}>
                  {parsedItems.items.length}개 항목 감지됨 — 항목별 1장씩 생성
                </p>
                <div className="flex flex-wrap" style={{ gap: '6px' }}>
                  {parsedItems.items.map((item, i) => (
                    <span key={i} style={{
                      padding: '3px 8px', borderRadius: '6px',
                      backgroundColor: C.surface,
                      fontFamily: font, fontSize: '12px', fontWeight: 400,
                      color: C.textSecondary, letterSpacing: '-0.24px',
                    }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── 스펙 요약 ── */}
            <div style={{
              padding: '14px 16px', borderRadius: '12px',
              backgroundColor: C.surfaceSecondary, marginBottom: '24px',
            }}>
              <p style={{
                fontFamily: font, fontSize: '13px', fontWeight: 400,
                lineHeight: '20px', color: C.textCaption, letterSpacing: '-0.26px',
              }}>
                {selectedRatio.label} · {selectedRatio.width}×{selectedRatio.height}px · {isListMode ? `${parsedItems!.items.length}장 (항목별)` : `${imageCount}장`} · {fileFormat.toUpperCase()}
                {referencePreview && ` · 레퍼런스 ${referenceMode === 'style_only' ? '스타일' : '캐릭터+스타일'}`}
              </p>
            </div>

            {/* ── CTA Button ── */}
            <div style={{
              position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
              maxWidth: '440px', width: '100%', padding: '12px 20px 32px',
              backgroundColor: C.surface,
              borderTop: `1px solid ${C.borderDivider}`,
            }}>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                style={{
                  width: '100%', height: '56px', borderRadius: '16px',
                  backgroundColor: canGenerate ? C.primary : C.surfaceDisabled,
                  border: 'none', cursor: canGenerate ? 'pointer' : 'default',
                  fontFamily: font, fontSize: '16px', fontWeight: 500,
                  color: canGenerate ? C.textWhite : C.textDisabled,
                  letterSpacing: '-0.32px',
                  transition: 'all 0.15s ease',
                }}
                onPointerDown={e => { if (canGenerate) e.currentTarget.style.transform = 'scale(0.99)'; }}
                onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
              >
                {isListMode ? `${parsedItems!.items.length}장 생성하기` : '썸네일 생성하기'}
              </button>
            </div>
          </div>
        )}

        {/* ════════ STEP: RESULT ════════ */}
        {step === 'result' && (
          <div style={{ padding: '0 20px', paddingBottom: '140px' }}>

            {/* Progress */}
            {generating && (
              <div style={{
                padding: '16px', borderRadius: '12px',
                backgroundColor: C.primaryLight, marginBottom: '16px', marginTop: '8px',
              }}>
                <p style={{
                  fontFamily: font, fontSize: '14px', fontWeight: 500,
                  color: C.primaryDark, letterSpacing: '-0.28px',
                }}>
                  {generatedCount}/{effectiveCount}장 생성 중...
                </p>
                <div style={{
                  width: '100%', height: '4px', borderRadius: '2px',
                  backgroundColor: '#d4eceb', marginTop: '8px',
                }}>
                  <div style={{
                    width: `${(generatedCount / effectiveCount) * 100}%`,
                    height: '100%', borderRadius: '2px',
                    backgroundColor: C.primary,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                padding: '14px 16px', borderRadius: '12px',
                backgroundColor: '#fff2f0', border: '1px solid #ffccc7',
                marginBottom: '16px', marginTop: generating ? '0' : '8px',
              }}>
                <p style={{
                  fontFamily: font, fontSize: '13px', fontWeight: 400,
                  color: '#cf1322', letterSpacing: '-0.26px',
                }}>
                  {error}
                </p>
              </div>
            )}

            {/* Images */}
            <div className="flex flex-col" style={{ gap: '20px', marginTop: generating ? '0' : '8px' }}>
              {images.map(img => (
                <div key={img.id}>
                  {/* Label + Actions */}
                  <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
                    <span style={{
                      fontFamily: font, fontSize: '14px', fontWeight: 600,
                      color: C.textPrimary, letterSpacing: '-0.28px',
                    }}>
                      #{img.id}{img.label && ` ${img.label}`}
                    </span>
                    {img.src && (
                      <div className="flex" style={{ gap: '8px' }}>
                        <button
                          onClick={() => handleRegenerate(img.id)}
                          style={{
                            padding: '6px 12px', borderRadius: '8px',
                            border: `1px solid ${C.borderDefault}`,
                            backgroundColor: C.surface, cursor: 'pointer',
                            fontFamily: font, fontSize: '12px', fontWeight: 500,
                            color: C.textSecondary, letterSpacing: '-0.24px',
                          }}
                        >
                          재생성
                        </button>
                        <button
                          onClick={() => handleDownload(img)}
                          style={{
                            padding: '6px 12px', borderRadius: '8px',
                            border: 'none',
                            backgroundColor: C.primary, cursor: 'pointer',
                            fontFamily: font, fontSize: '12px', fontWeight: 500,
                            color: C.textWhite, letterSpacing: '-0.24px',
                          }}
                        >
                          다운로드
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Image Container */}
                  <div
                    className="transform-gpu"
                    style={{
                      width: '100%',
                      aspectRatio: `${selectedRatio.width}/${selectedRatio.height}`,
                      borderRadius: '12px',
                      backgroundColor: C.surfaceSecondary,
                      overflow: 'hidden',
                      border: `1px solid ${C.borderDefault}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {img.src ? (
                      <img
                        src={img.src}
                        alt={`썸네일 ${img.id}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div className="flex flex-col items-center" style={{ gap: '12px' }}>
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '50%',
                          border: `3px solid ${C.borderDefault}`,
                          borderTopColor: C.primary,
                          animation: 'spin 1s linear infinite',
                        }} />
                        <p style={{
                          fontFamily: font, fontSize: '14px', fontWeight: 400,
                          color: C.textCaption,
                        }}>
                          재생성 중...
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Generating placeholders for remaining */}
            {generating && images.length < effectiveCount && (
              <div className="flex flex-col" style={{ gap: '20px', marginTop: images.length > 0 ? '20px' : '8px' }}>
                {Array.from({ length: effectiveCount - images.length }, (_, i) => {
                  const pendingIdx = images.length + i;
                  const pendingLabel = isListMode && parsedItems ? parsedItems.items[pendingIdx] : undefined;
                  return (
                  <div key={`pending-${i}`}>
                    <div style={{ marginBottom: '10px' }}>
                      <span style={{
                        fontFamily: font, fontSize: '14px', fontWeight: 600,
                        color: C.textDisabled, letterSpacing: '-0.28px',
                      }}>
                        #{pendingIdx + 1}{pendingLabel && ` ${pendingLabel}`}
                      </span>
                    </div>
                    <div
                      className="transform-gpu"
                      style={{
                        width: '100%',
                        aspectRatio: `${selectedRatio.width}/${selectedRatio.height}`,
                        borderRadius: '12px',
                        backgroundColor: C.surfaceSecondary,
                        overflow: 'hidden',
                        border: `1px solid ${C.borderDefault}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <div className="flex flex-col items-center" style={{ gap: '12px' }}>
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '50%',
                          border: `3px solid ${C.borderDefault}`,
                          borderTopColor: C.primary,
                          animation: 'spin 1s linear infinite',
                        }} />
                        <p style={{
                          fontFamily: font, fontSize: '14px', fontWeight: 400,
                          color: C.textCaption,
                        }}>
                          대기 중...
                        </p>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* Bottom Buttons */}
            {!generating && images.length > 0 && (
              <div style={{
                position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                maxWidth: '440px', width: '100%', padding: '12px 20px 32px',
                backgroundColor: C.surface,
                borderTop: `1px solid ${C.borderDivider}`,
              }}>
                <div className="flex" style={{ gap: '8px' }}>
                  <button
                    onClick={() => setStep('input')}
                    style={{
                      flex: 1, height: '56px', borderRadius: '16px',
                      backgroundColor: C.surface,
                      border: `1.5px solid ${C.borderDefault}`,
                      cursor: 'pointer',
                      fontFamily: font, fontSize: '16px', fontWeight: 500,
                      color: C.textSecondary, letterSpacing: '-0.32px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    처음으로
                  </button>
                  <button
                    onClick={handleDownloadAll}
                    disabled={zipping}
                    style={{
                      flex: 1, height: '56px', borderRadius: '16px',
                      backgroundColor: zipping ? C.primaryDark : C.primary, border: 'none',
                      cursor: zipping ? 'default' : 'pointer',
                      fontFamily: font, fontSize: '16px', fontWeight: 500,
                      color: C.textWhite, letterSpacing: '-0.32px',
                      transition: 'all 0.15s ease',
                    }}
                    onPointerDown={e => { if (!zipping) e.currentTarget.style.transform = 'scale(0.99)'; }}
                    onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                    onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                  >
                    {zipping ? 'ZIP 생성 중...' : 'ZIP 다운로드'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
