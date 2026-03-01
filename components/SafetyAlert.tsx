'use client'

import type { SafetyFlag } from '@/types/database'

interface SafetyAlertProps {
  flags: SafetyFlag[]
}

const LEVEL_CONFIG = {
  red: {
    bg: 'bg-red-50 border-red-200',
    icon: '🚫',
    iconBg: 'bg-red-100',
    title: 'text-red-700',
    body: 'text-red-600',
    label: '嚴格禁止',
    pulse: true,
  },
  yellow: {
    bg: 'bg-amber-50 border-amber-200',
    icon: '⚠️',
    iconBg: 'bg-amber-100',
    title: 'text-amber-700',
    body: 'text-amber-600',
    label: '建議調整',
    pulse: false,
  },
  green: {
    bg: 'bg-emerald-50 border-emerald-200',
    icon: '✅',
    iconBg: 'bg-emerald-100',
    title: 'text-emerald-700',
    body: 'text-emerald-600',
    label: '安全',
    pulse: false,
  },
}

export default function SafetyAlert({ flags }: SafetyAlertProps) {
  if (!flags || flags.length === 0) return null

  // Sort: red first, then yellow, then green
  const sorted = [...flags].sort((a, b) => {
    const order = { red: 0, yellow: 1, green: 2 }
    return order[a.level] - order[b.level]
  })

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((flag, i) => {
        const cfg = LEVEL_CONFIG[flag.level]
        return (
          <div
            key={i}
            className={`flex gap-3 p-3 rounded-2xl border ${cfg.bg} ${
              cfg.pulse ? 'animate-pulse-slow' : ''
            }`}
          >
            <span className={`w-8 h-8 rounded-xl ${cfg.iconBg} flex items-center justify-center text-base flex-shrink-0`}>
              {cfg.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold uppercase tracking-wide ${cfg.title}`}>
                {cfg.label}
              </p>
              <p className={`text-sm mt-0.5 ${cfg.body}`}>{flag.message}</p>
              {flag.nutrient && (
                <p className={`text-xs mt-1 opacity-70 ${cfg.body}`}>
                  相關營養素：{flag.nutrient}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
