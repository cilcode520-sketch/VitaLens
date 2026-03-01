'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types/database'

interface UseProfileReturn {
  profiles: Profile[]
  activeProfile: Profile | null
  setActiveProfile: (profile: Profile) => void
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useProfiles(): UseProfileReturn {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchProfiles = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setProfiles(data ?? [])
      // Auto-select first 'self' profile, or first profile
      if (!activeProfile && data && data.length > 0) {
        const selfProfile = data.find((p) => p.type === 'self') ?? data[0]
        setActiveProfileState(selfProfile)
      }
    }
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  const setActiveProfile = (profile: Profile) => {
    setActiveProfileState(profile)
    // Trigger haptic feedback if available
    if ('vibrate' in navigator) navigator.vibrate(10)
  }

  return {
    profiles,
    activeProfile,
    setActiveProfile,
    loading,
    error,
    refetch: fetchProfiles,
  }
}
