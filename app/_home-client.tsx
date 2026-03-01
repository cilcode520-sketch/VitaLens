'use client'

// 強制動態渲染：需要 Supabase 即時資料，不可靜態預渲染
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useProfiles } from '@/lib/hooks/useProfile'
import { createClient } from '@/lib/supabase/client'
import type { IntakeLog } from '@/types/database'
import Link from 'next/link'

// ─────────────────────────────────────────────
// Home / Dashboard Page
// ─────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()

  const { profiles, activeProfile, setActiveProfile, loading: profileLoading, refetch: refetchProfiles } =
    useProfiles()

  const [todayLogs, setTodayLogs] = useState<IntakeLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [totalCalories, setTotalCalories] = useState(0)
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [profileCreateError, setProfileCreateError] = useState<string | null>(null)

  // ── Auto sign-in anonymously + create default profile ───────────
  const ensureAuth = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      // Sign in anonymously so RLS works
      await supabase.auth.signInAnonymously()
    }
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ensureAuth()
  }, [ensureAuth])

  // ── Quick-create default profile (for first-time users) ─────────
  const handleCreateDefaultProfile = useCallback(async () => {
    setCreatingProfile(true)
    setProfileCreateError(null)
    try {
      // Ensure we have a session
      let { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const { data, error: anonError } = await supabase.auth.signInAnonymously()
        if (anonError) throw new Error(`匿名登入失敗：${anonError.message}`)
        if (!data.user) throw new Error('無法建立匿名帳號')
        user = data.user
      }

      const { error } = await supabase.from('profiles').insert({
        user_id: user.id,
        name: '我',
        type: 'self',
        birth_year: new Date().getFullYear() - 30,
        is_active: true,
      })
      if (error) throw new Error(`建立檔案失敗：${error.message}`)
      await refetchProfiles()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知錯誤'
      setProfileCreateError(msg)
      console.error('Create profile error:', msg)
    } finally {
      setCreatingProfile(false)
    }
  }, [supabase, refetchProfiles])

  // Fetch today's intake logs for active profile
  useEffect(() => {
    if (!activeProfile) return
    setLogsLoading(true)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    supabase
      .from('intake_logs')
      .select('*')
      .eq('profile_id', activeProfile.id)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const logs = (data ?? []) as IntakeLog[]
        setTodayLogs(logs)
        const cal = logs.reduce((sum, l) => sum + (l.nutrients?.calories ?? 0), 0)
        setTotalCalories(Math.round(cal))
        setLogsLoading(false)
      })
  }, [activeProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──────────────────────────────────
  const hasRedFlags = todayLogs.some((l) =>
    l.safety_flags?.some((f) => f.level === 'red')
  )

  const greeting = getGreeting()

  // ── Render ───────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header ── */}
      <div
        className="relative px-5 pt-14 pb-8 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 50%, #5B21B6 100%)' }}
      >
        {/* Decorative circle */}
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white/5" />

        {/* Greeting */}
        <p className="text-purple-200 text-sm font-medium relative z-10">{greeting}</p>
        <h1 className="text-white text-2xl font-bold mt-1 relative z-10">
          {profileLoading ? '載入中...' : activeProfile?.name ?? '我的 VitaLens'}
        </h1>

        {/* Profile switcher pills */}
        {!profileLoading && profiles.length > 0 && (
          <div className="flex gap-2 mt-4 relative z-10 overflow-x-auto no-scrollbar pb-1">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveProfile(p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
                            whitespace-nowrap transition-all active:scale-95 flex-shrink-0
                            ${activeProfile?.id === p.id
                              ? 'bg-white text-purple-700 shadow-lg'
                              : 'bg-white/20 text-white'
                            }`}
              >
                <span className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-300 to-pink-400
                                 flex items-center justify-center text-[9px] font-bold text-white">
                  {p.name.charAt(0)}
                </span>
                {p.name}
              </button>
            ))}
            <Link
              href="/profile/new"
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm
                         bg-white/10 text-white/70 whitespace-nowrap flex-shrink-0"
            >
              <span>＋</span>
              新增檔案
            </Link>
          </div>
        )}

        {/* Today Summary card */}
        {activeProfile && (
          <div className="mt-5 bg-white/15 backdrop-blur-sm rounded-2xl p-4 relative z-10">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-white">{totalCalories}</p>
                <p className="text-purple-200 text-xs mt-0.5">今日熱量</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{todayLogs.length}</p>
                <p className="text-purple-200 text-xs mt-0.5">記錄次數</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {hasRedFlags ? '🔴' : '🟢'}
                </p>
                <p className="text-purple-200 text-xs mt-0.5">安全狀態</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 px-4 pt-4 pb-28 space-y-4">

        {/* No profile prompt */}
        {!profileLoading && profiles.length === 0 && (
          <div className="ios-card p-6 text-center border-2 border-dashed border-violet-200">
            <p className="text-4xl mb-3">👤</p>
            <p className="text-sm font-semibold text-gray-700">尚未建立個人檔案</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">需要個人檔案才能記錄飲食與分析安全性</p>
            <button
              onClick={handleCreateDefaultProfile}
              disabled={creatingProfile}
              className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600
                         text-white text-sm font-semibold rounded-2xl
                         active:scale-95 transition-transform disabled:opacity-60"
            >
              {creatingProfile ? '建立中...' : '✦ 快速建立「我」的檔案'}
            </button>
            {profileCreateError && (
              <p className="mt-3 text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">
                ❌ {profileCreateError}
              </p>
            )}
            <Link
              href="/profile/new"
              className="block mt-2 text-xs text-violet-500 underline"
            >
              或自訂詳細設定
            </Link>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => router.push('/camera')}
            className="ios-card p-4 flex flex-col items-center gap-2
                       active:scale-95 transition-transform"
          >
            <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center">
              <span className="text-2xl">📷</span>
            </div>
            <p className="text-sm font-semibold text-gray-800">拍照記錄</p>
            <p className="text-xs text-gray-400 text-center">相機 + 語音同步辨識</p>
          </button>

          <button
            onClick={() => router.push('/symptom')}
            className="ios-card p-4 flex flex-col items-center gap-2
                       active:scale-95 transition-transform"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center">
              <span className="text-2xl">🤒</span>
            </div>
            <p className="text-sm font-semibold text-gray-800">我不舒服</p>
            <p className="text-xs text-gray-400 text-center">AI 回溯近24小時紀錄</p>
          </button>
        </div>

        {/* Red flag alert */}
        {hasRedFlags && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-2xl flex-shrink-0">🚫</span>
            <div>
              <p className="text-sm font-semibold text-red-700">今日有安全警告</p>
              <p className="text-xs text-red-500 mt-0.5">請查看以下紀錄中的紅色警示項目</p>
            </div>
          </div>
        )}

        {/* Today's log list */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-2">
            今日記錄
          </h2>

          {logsLoading ? (
            <div className="ios-card p-6 flex justify-center">
              <div className="w-6 h-6 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
            </div>
          ) : todayLogs.length === 0 ? (
            <div className="ios-card p-8 text-center">
              <p className="text-3xl mb-2">🍽️</p>
              <p className="text-sm text-gray-500">還沒有記錄</p>
              <p className="text-xs text-gray-400 mt-1">點擊「拍照記錄」開始追蹤</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayLogs.map((log) => (
                <IntakeLogCard key={log.id} log={log} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Navigation ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl
                      border-t border-gray-200 pb-safe-bottom px-6 pt-3
                      flex items-center justify-around">
        <NavItem href="/" icon="🏠" label="首頁" active />
        <NavItem href="/history" icon="📊" label="歷史" />
        <NavItem href="/supplements" icon="💊" label="補劑" />
        <NavItem href="/profile" icon="👤" label="檔案" />
      </nav>
    </div>
  )
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function IntakeLogCard({ log }: { log: IntakeLog }) {
  const hasRed = log.safety_flags?.some((f) => f.level === 'red')
  const hasYellow = log.safety_flags?.some((f) => f.level === 'yellow')
  const mealEmoji: Record<string, string> = {
    breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍪', midnight: '🌙',
  }

  const time = new Date(log.created_at).toLocaleTimeString('zh-TW', {
    hour: '2-digit', minute: '2-digit',
  })

  const itemNames = log.items?.map((i) => i.name).join('、') || '未辨識'

  return (
    <div className={`ios-card p-4 flex gap-3 items-start
                     ${hasRed ? 'ring-1 ring-red-200' : ''}`}>
      {/* Left: image or emoji */}
      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {log.image_url ? (
          // In production, use Supabase Storage public URL
          <span className="text-2xl">{mealEmoji[log.meal_time ?? ''] ?? '🍽️'}</span>
        ) : (
          <span className="text-2xl">{mealEmoji[log.meal_time ?? ''] ?? '🍽️'}</span>
        )}
      </div>

      {/* Right: info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800 truncate pr-2">{itemNames}</p>
          <p className="text-xs text-gray-400 flex-shrink-0">{time}</p>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {log.nutrients?.calories ? `${log.nutrients.calories} kcal` : ''}
          {log.nutrients?.protein_g ? ` · 蛋白質 ${log.nutrients.protein_g}g` : ''}
        </p>
        {log.voice_note && (
          <p className="text-xs text-violet-500 mt-1 truncate">🎤 {log.voice_note}</p>
        )}
        {(hasRed || hasYellow) && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {log.safety_flags.slice(0, 2).map((f, i) => (
              <span
                key={i}
                className={`text-xs px-2 py-0.5 rounded-full font-medium
                            ${f.level === 'red'
                              ? 'bg-red-100 text-red-600'
                              : 'bg-amber-100 text-amber-600'
                            }`}
              >
                {f.level === 'red' ? '🚫' : '⚠️'} {f.message.slice(0, 20)}...
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NavItem({
  href, icon, label, active = false,
}: {
  href: string; icon: string; label: string; active?: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 px-3 py-1
                  active:scale-90 transition-transform
                  ${active ? 'text-violet-600' : 'text-gray-400'}`}
    >
      <span className="text-xl">{icon}</span>
      <span className={`text-[10px] font-medium ${active ? 'text-violet-600' : 'text-gray-400'}`}>
        {label}
      </span>
    </Link>
  )
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '深夜了，注意休息 🌙'
  if (hour < 10) return '早安，記錄今天的早餐了嗎？ 🌅'
  if (hour < 14) return '午安！今天午餐吃得均衡嗎？ ☀️'
  if (hour < 18) return '下午好，補充能量的時刻 🌤️'
  if (hour < 22) return '晚上好，今天攝取夠了嗎？ 🌙'
  return '夜深了，消夜記得記錄 🍜'
}
