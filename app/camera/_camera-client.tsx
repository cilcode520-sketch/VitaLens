'use client'

// 強制動態渲染：此頁面需要相機權限與 Supabase，不可靜態預渲染
export const dynamic = 'force-dynamic'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useCamera } from '@/lib/hooks/useCamera'
import { useProfiles } from '@/lib/hooks/useProfile'
import { createClient } from '@/lib/supabase/client'
import ProfileSwitcher from '@/components/ProfileSwitcher'
import SafetyAlert from '@/components/SafetyAlert'
import type { AnalyzeResponse, MealTime } from '@/types/database'

// ─────────────────────────────────────────────
// Stage machine for the camera flow
// ─────────────────────────────────────────────
type Stage =
  | 'idle'        // Camera not started
  | 'preview'     // Live camera feed
  | 'captured'    // Photo taken, awaiting confirm
  | 'analyzing'   // Sending to AI
  | 'result'      // AI result shown
  | 'saving'      // Writing to Supabase
  | 'done'        // Saved successfully

export default function CameraPage() {
  const router = useRouter()
  const supabase = createClient()

  // ── Hooks ───────────────────────────────────
  const {
    videoRef,
    isStreaming,
    error: cameraError,
    facing,
    startCamera,
    stopCamera,
    flipCamera,
    capturePhoto,
    hasMultipleCameras,
  } = useCamera()

  const { profiles, activeProfile, setActiveProfile, loading: profileLoading } =
    useProfiles()

  // ── Local State ─────────────────────────────
  const [stage, setStage] = useState<Stage>('idle')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResponse | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [mealTime, setMealTime] = useState<MealTime>(guessMealTime())

  const shutterRef = useRef<HTMLButtonElement>(null)

  // ── Start camera on mount ────────────────────
  useEffect(() => {
    startCamera('environment').then(() => {
      setStage('preview')
    })

    return () => {
      stopCamera()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Capture Photo ────────────────────────────
  const handleCapture = useCallback(() => {
    const dataUrl = capturePhoto()
    if (!dataUrl) return

    setCapturedImage(dataUrl)
    setStage('captured')
    setApiError(null)
  }, [capturePhoto])

  // ── Retake ───────────────────────────────────
  const handleRetake = useCallback(() => {
    setCapturedImage(null)
    setAnalyzeResult(null)
    setApiError(null)
    setStage('preview')
  }, [])

  // ── Send to AI ───────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!capturedImage) return
    if (!activeProfile) {
      setApiError('請先到首頁建立個人檔案，才能分析飲食')
      return
    }

    setStage('analyzing')
    setApiError(null)

    try {
      // Extract base64 content (remove data:image/jpeg;base64, prefix)
      const base64 = capturedImage.split(',')[1]

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          voiceTranscript: null,
          profileId: activeProfile.id,
          mealTime,
        }),
      })

      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error ?? '分析失敗，請重試')
      }

      const data: AnalyzeResponse = await res.json()
      setAnalyzeResult(data)
      setStage('result')

      // Trigger haptic if safety flags exist
      const hasRed = data.safety_flags.some((f) => f.level === 'red')
      if (hasRed && 'vibrate' in navigator) navigator.vibrate([100, 50, 100, 50, 200])
    } catch (err) {
      setApiError(err instanceof Error ? err.message : '未知錯誤')
      setStage('captured') // Go back to confirm stage
    }
  }, [capturedImage, activeProfile, mealTime])

  // ── Save to Supabase ─────────────────────────
  const handleSave = useCallback(async () => {
    if (!analyzeResult || !activeProfile || !capturedImage) return

    setStage('saving')

    try {
      // 1. Upload image to Supabase Storage
      const blob = await (await fetch(capturedImage)).blob()
      const filename = `${activeProfile.id}/${Date.now()}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('intake-images')
        .upload(filename, blob, { contentType: 'image/jpeg', upsert: false })

      if (uploadError) console.warn('Image upload failed:', uploadError.message)

      // 2. Insert intake log
      const { error: insertError } = await supabase.from('intake_logs').insert({
        profile_id: activeProfile.id,
        type: 'food',
        meal_time: mealTime,
        items: analyzeResult.items,
        nutrients: analyzeResult.nutrients,
        safety_flags: analyzeResult.safety_flags,
        voice_note: null,
        image_url: uploadError ? null : filename,
        ai_response: analyzeResult,
      })

      if (insertError) throw new Error(insertError.message)

      setStage('done')
      if ('vibrate' in navigator) navigator.vibrate(50)

      // Navigate back after 1.5s
      setTimeout(() => router.push('/'), 1500)
    } catch (err) {
      setApiError(err instanceof Error ? err.message : '儲存失敗')
      setStage('result') // Back to result so user can retry
    }
  }, [analyzeResult, activeProfile, capturedImage, mealTime, supabase, router])

  // ── Render ────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden">

      {/* ── Top Bar ── */}
      <div className="relative z-20 flex items-center justify-between px-4 pt-safe-top pt-4 pb-2">
        <button
          onClick={() => { stopCamera(); router.push('/') }}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm
                     flex items-center justify-center text-white active:scale-90 transition-transform"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Profile switcher */}
        {!profileLoading && (
          <ProfileSwitcher
            profiles={profiles}
            activeProfile={activeProfile}
            onSelect={setActiveProfile}
          />
        )}

        {/* Flip camera */}
        {hasMultipleCameras && stage === 'preview' && (
          <button
            onClick={flipCamera}
            className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm
                       flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M16 3l4 4-4 4M8 21l-4-4 4-4M20 7H9a4 4 0 00-4 4v1M4 17h11a4 4 0 004-4v-1" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Camera / Preview Area ── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Live camera feed */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300
                      ${facing === 'user' ? 'scale-x-[-1]' : ''}
                      ${stage === 'preview' && isStreaming ? 'opacity-100' : 'opacity-0'}`}
          playsInline
          muted
          autoPlay
        />

        {/* Captured photo */}
        {capturedImage && (
          <img
            src={capturedImage}
            alt="拍攝的照片"
            className={`absolute inset-0 w-full h-full object-cover
                        ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
          />
        )}

        {/* Viewfinder overlay (during preview) */}
        {stage === 'preview' && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Corner brackets */}
            <div className="absolute top-1/4 left-8 w-8 h-8 border-t-2 border-l-2 border-white/70 rounded-tl-lg" />
            <div className="absolute top-1/4 right-8 w-8 h-8 border-t-2 border-r-2 border-white/70 rounded-tr-lg" />
            <div className="absolute bottom-1/4 left-8 w-8 h-8 border-b-2 border-l-2 border-white/70 rounded-bl-lg" />
            <div className="absolute bottom-1/4 right-8 w-8 h-8 border-b-2 border-r-2 border-white/70 rounded-br-lg" />
          </div>
        )}

        {/* Camera error */}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-6 text-center">
              <p className="text-4xl mb-3">📷</p>
              <p className="text-white font-medium">{cameraError}</p>
              <button
                onClick={() => startCamera()}
                className="mt-4 px-6 py-2 bg-white text-black rounded-full text-sm font-semibold"
              >
                重新嘗試
              </button>
            </div>
          </div>
        )}

        {/* Analyzing overlay */}
        {stage === 'analyzing' && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white text-lg font-semibold">AI 分析中...</p>
              <p className="text-white/60 text-sm mt-1">辨識食物 & 計算營養素</p>
            </div>
          </div>
        )}

        {/* Done overlay */}
        {stage === 'done' && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white text-xl font-bold">已記錄！</p>
            </div>
          </div>
        )}

        {/* AI Result Panel */}
        {(stage === 'result' || stage === 'saving') && analyzeResult && (
          <div className="absolute bottom-0 left-0 right-0 max-h-[55%]
                          bg-white/95 backdrop-blur-xl rounded-t-3xl
                          overflow-y-auto shadow-2xl">
            <div className="p-5">
              {/* Handle bar */}
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />

              {/* AI Summary */}
              <p className="text-gray-700 text-sm mb-4 leading-relaxed">
                {analyzeResult.ai_summary}
              </p>

              {/* Nutrients */}
              {analyzeResult.nutrients.calories !== undefined && (
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[
                    { label: '熱量', value: analyzeResult.nutrients.calories, unit: 'kcal' },
                    { label: '蛋白質', value: analyzeResult.nutrients.protein_g, unit: 'g' },
                    { label: '碳水', value: analyzeResult.nutrients.carbs_g, unit: 'g' },
                    { label: '脂肪', value: analyzeResult.nutrients.fat_g, unit: 'g' },
                  ].map((n) => (
                    <div key={n.label} className="bg-gray-50 rounded-2xl p-2.5 text-center">
                      <p className="text-base font-bold text-gray-900">{n.value ?? '–'}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{n.unit}</p>
                      <p className="text-[10px] text-gray-500 font-medium">{n.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Safety flags */}
              {analyzeResult.safety_flags.length > 0 && (
                <div className="mb-4">
                  <SafetyAlert flags={analyzeResult.safety_flags} />
                </div>
              )}

              {/* Supplement suggestions */}
              {analyzeResult.supplement_suggestions.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    建議搭配補劑
                  </p>
                  <div className="flex flex-col gap-2">
                    {analyzeResult.supplement_suggestions.map((s, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-violet-50 rounded-2xl">
                        <span className="text-lg">💊</span>
                        <div>
                          <p className="text-sm font-semibold text-violet-900">{s.supplement.name}</p>
                          <p className="text-xs text-violet-600 mt-0.5">{s.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* API Error */}
              {apiError && (
                <p className="text-red-500 text-sm mb-3 text-center">{apiError}</p>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 mt-2">
                <button
                  onClick={handleRetake}
                  className="flex-1 py-3.5 rounded-2xl border-2 border-gray-200
                             text-gray-700 font-semibold text-sm active:scale-95 transition-transform"
                >
                  重新拍攝
                </button>
                <button
                  onClick={handleSave}
                  disabled={stage === 'saving'}
                  className="flex-2 flex-grow-[2] py-3.5 rounded-2xl
                             bg-gradient-to-r from-violet-600 to-purple-600
                             text-white font-semibold text-sm
                             active:scale-95 transition-transform disabled:opacity-60"
                >
                  {stage === 'saving' ? '儲存中...' : '✓ 確認記錄'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Controls ── */}
      {(stage === 'preview' || stage === 'captured') && (
        <div className="relative z-20 pb-safe-bottom pb-8 pt-4 px-6">

          {/* Meal time selector */}
          <MealTimeSelector value={mealTime} onChange={setMealTime} />

          {/* API Error display */}
          {apiError && (
            <p className="text-amber-400 text-xs mb-3 text-center">{apiError}</p>
          )}

          {/* Controls row */}
          <div className="flex items-center justify-center gap-10">

            {/* Retake button */}
            {stage === 'captured' ? (
              <button
                onClick={handleRetake}
                className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center
                           text-white active:scale-90 transition-transform"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            ) : (
              <div className="w-12 h-12" /> /* Spacer */
            )}

            {/* Shutter / Confirm */}
            {stage === 'preview' ? (
              <button
                ref={shutterRef}
                onClick={handleCapture}
                className="w-20 h-20 rounded-full bg-white
                           border-4 border-white/50
                           flex items-center justify-center
                           active:scale-90 transition-transform shadow-2xl"
              >
                <div className="w-16 h-16 rounded-full bg-white" />
              </button>
            ) : (
              <button
                onClick={handleAnalyze}
                disabled={stage !== 'captured'}
                className="w-20 h-20 rounded-full
                           bg-gradient-to-br from-violet-500 to-purple-700
                           flex items-center justify-center
                           active:scale-90 transition-transform shadow-2xl disabled:opacity-60"
              >
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </button>
            )}

            {/* Spacer (where mic button was) */}
            <div className="w-12 h-12" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function MealTimeSelector({
  value,
  onChange,
}: {
  value: MealTime
  onChange: (v: MealTime) => void
}) {
  const options: { value: MealTime; label: string; emoji: string }[] = [
    { value: 'breakfast', label: '早餐', emoji: '🌅' },
    { value: 'lunch', label: '午餐', emoji: '☀️' },
    { value: 'dinner', label: '晚餐', emoji: '🌙' },
    { value: 'snack', label: '點心', emoji: '🍪' },
  ]

  return (
    <div className="flex gap-2 justify-center mb-4 overflow-x-auto">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => { onChange(o.value); if ('vibrate' in navigator) navigator.vibrate(8) }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
                      whitespace-nowrap transition-all active:scale-95
                      ${value === o.value
                        ? 'bg-white text-gray-900 shadow-lg'
                        : 'bg-white/20 text-white/80'
                      }`}
        >
          <span>{o.emoji}</span>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function guessMealTime(): MealTime {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 10) return 'breakfast'
  if (hour >= 11 && hour < 14) return 'lunch'
  if (hour >= 17 && hour < 21) return 'dinner'
  if (hour >= 22 || hour < 6) return 'midnight'
  return 'snack'
}
