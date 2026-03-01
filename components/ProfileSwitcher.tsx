'use client'

import { useState } from 'react'
import type { Profile } from '@/types/database'

interface ProfileSwitcherProps {
  profiles: Profile[]
  activeProfile: Profile | null
  onSelect: (profile: Profile) => void
}

const AVATAR_COLORS: Record<string, string> = {
  self: 'from-violet-500 to-purple-600',
  child: 'from-rose-400 to-pink-500',
}

function getAge(birthday: string | null): string {
  if (!birthday) return ''
  const birth = new Date(birthday)
  const now = new Date()
  const months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  if (months < 24) return `${months}個月`
  return `${Math.floor(months / 12)}歲`
}

export default function ProfileSwitcher({
  profiles,
  activeProfile,
  onSelect,
}: ProfileSwitcherProps) {
  const [open, setOpen] = useState(false)

  if (!activeProfile) return null

  return (
    <div className="relative">
      {/* Active profile pill */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full
                   bg-white/20 backdrop-blur-md border border-white/30
                   text-white text-sm font-medium active:scale-95 transition-transform"
      >
        {/* Avatar */}
        <span
          className={`w-6 h-6 rounded-full bg-gradient-to-br ${AVATAR_COLORS[activeProfile.type]}
                      flex items-center justify-center text-xs font-bold text-white`}
        >
          {activeProfile.name.charAt(0)}
        </span>
        <span>{activeProfile.name}</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute top-full mt-2 left-0 z-50 min-w-[160px]
                          bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl
                          border border-white/60 overflow-hidden">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => { onSelect(profile); setOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left
                            hover:bg-black/5 transition-colors
                            ${activeProfile.id === profile.id ? 'bg-violet-50' : ''}`}
              >
                <span
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${AVATAR_COLORS[profile.type]}
                              flex items-center justify-center text-sm font-bold text-white flex-shrink-0`}
                >
                  {profile.name.charAt(0)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {profile.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {profile.type === 'self' ? '我自己' : `小孩 · ${getAge(profile.birthday)}`}
                  </p>
                </div>
                {activeProfile.id === profile.id && (
                  <svg className="w-4 h-4 text-violet-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
