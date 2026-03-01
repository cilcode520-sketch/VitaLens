'use client'

import type { Liff } from '@line/liff'

let liffInstance: Liff | null = null
let initPromise: Promise<Liff> | null = null

/**
 * Initialize LIFF SDK (idempotent – safe to call multiple times)
 * Returns the same promise if already initializing.
 */
export async function initLiff(): Promise<Liff> {
  if (liffInstance) return liffInstance

  if (initPromise) return initPromise

  initPromise = (async () => {
    const liff = (await import('@line/liff')).default
    await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! })
    liffInstance = liff
    return liff
  })()

  return initPromise
}

/**
 * Get LINE user profile after LIFF login.
 * Redirects to LINE login if not authenticated.
 */
export async function getLiffProfile() {
  const liff = await initLiff()

  if (!liff.isLoggedIn()) {
    liff.login()
    return null
  }

  const profile = await liff.getProfile()
  return {
    lineUserId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl ?? null,
    statusMessage: profile.statusMessage ?? null,
  }
}

/**
 * Exchange LINE Access Token for Supabase session via custom auth.
 * Calls /api/auth/line to do server-side token verification.
 */
export async function signInWithLine(): Promise<{ token: string } | null> {
  const liff = await initLiff()

  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href })
    return null
  }

  const accessToken = liff.getAccessToken()
  if (!accessToken) return null

  const res = await fetch('/api/auth/line', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken }),
  })

  if (!res.ok) return null
  return res.json()
}

/**
 * Check if running inside LINE app
 */
export async function isInLineApp(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const liff = await initLiff()
  return liff.isInClient()
}
