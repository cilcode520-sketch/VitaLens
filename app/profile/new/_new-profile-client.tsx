'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type ProfileType = 'self' | 'child' | 'elder' | 'partner'

const PROFILE_TYPES: { value: ProfileType; label: string; emoji: string; desc: string }[] = [
  { value: 'self',    label: '自己',   emoji: '🙋', desc: '成人（主要用戶）' },
  { value: 'child',   label: '孩子',   emoji: '👶', desc: '嬰幼兒 / 兒童' },
  { value: 'elder',   label: '長輩',   emoji: '👴', desc: '銀髮族家人' },
  { value: 'partner', label: '伴侶',   emoji: '💑', desc: '配偶 / 伴侶' },
]

export default function NewProfileClient() {
  const router = useRouter()
  const supabase = createClient()

  const [name, setName] = useState('')
  const [type, setType] = useState<ProfileType>('self')
  const [birthYear, setBirthYear] = useState(String(new Date().getFullYear() - 30))
  const [healthTags, setHealthTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const COMMON_HEALTH_TAGS = [
    '無特殊需求', '高血壓', '糖尿病', '腎臟病', '過敏體質',
    '素食', '乳糖不耐', '懷孕中', '哺乳中', '貧血',
  ]

  const toggleTag = (tag: string) => {
    setHealthTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError('請輸入名稱')
      return
    }

    setSaving(true)
    setError(null)

    try {
      // Ensure authenticated
      const { data: { user } } = await supabase.auth.getUser()
      let userId = user?.id

      if (!userId) {
        const { data } = await supabase.auth.signInAnonymously()
        userId = data.user?.id
      }

      if (!userId) throw new Error('無法取得用戶 ID')

      const { error: insertError } = await supabase.from('profiles').insert({
        user_id: userId,
        name: name.trim(),
        type,
        birth_year: parseInt(birthYear) || new Date().getFullYear() - 30,
        health_tags: healthTags.filter(t => t !== '無特殊需求'),
        is_active: true,
      })

      if (insertError) throw insertError

      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div
        className="px-5 pt-14 pb-6"
        style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)' }}
      >
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center mb-4"
        >
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-white text-xl font-bold">建立個人檔案</h1>
        <p className="text-purple-200 text-sm mt-1">AI 會根據此資料提供個人化建議</p>
      </div>

      {/* Form */}
      <div className="flex-1 px-4 py-6 space-y-5">

        {/* Name */}
        <div className="ios-card p-5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-3">
            名稱
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例：媽媽、小明、爸爸..."
            className="w-full text-base text-gray-900 bg-gray-50 rounded-xl px-4 py-3
                       border border-gray-200 focus:outline-none focus:border-violet-400"
          />
        </div>

        {/* Type */}
        <div className="ios-card p-5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-3">
            身份
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PROFILE_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`p-3 rounded-2xl text-left transition-all active:scale-95
                            ${type === t.value
                              ? 'bg-violet-600 text-white ring-2 ring-violet-400'
                              : 'bg-gray-50 text-gray-700'
                            }`}
              >
                <span className="text-2xl block mb-1">{t.emoji}</span>
                <span className="text-sm font-semibold">{t.label}</span>
                <span className={`text-xs block mt-0.5 ${type === t.value ? 'text-purple-200' : 'text-gray-400'}`}>
                  {t.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Birth Year */}
        <div className="ios-card p-5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-3">
            出生年份
          </label>
          <input
            type="number"
            value={birthYear}
            onChange={e => setBirthYear(e.target.value)}
            min="1920"
            max={new Date().getFullYear()}
            className="w-full text-base text-gray-900 bg-gray-50 rounded-xl px-4 py-3
                       border border-gray-200 focus:outline-none focus:border-violet-400"
          />
          <p className="text-xs text-gray-400 mt-2">
            用於計算年齡，調整營養建議
          </p>
        </div>

        {/* Health Tags */}
        <div className="ios-card p-5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-3">
            健康標籤（選填，可多選）
          </label>
          <div className="flex flex-wrap gap-2">
            {COMMON_HEALTH_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all active:scale-95
                            ${healthTags.includes(tag)
                              ? 'bg-violet-600 text-white'
                              : 'bg-gray-100 text-gray-600'
                            }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="w-full py-4 bg-gradient-to-r from-violet-600 to-purple-600
                     text-white font-bold text-base rounded-2xl
                     active:scale-95 transition-transform disabled:opacity-50 shadow-lg"
        >
          {saving ? '建立中...' : '✓ 建立檔案'}
        </button>

      </div>
    </div>
  )
}
