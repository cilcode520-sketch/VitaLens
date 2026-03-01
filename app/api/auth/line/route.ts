import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// POST /api/auth/line
// Verifies LINE access token, then signs user in via Supabase custom JWT
export async function POST(req: NextRequest) {
  try {
    const { accessToken } = await req.json()

    if (!accessToken) {
      return NextResponse.json({ error: 'Missing accessToken' }, { status: 400 })
    }

    // 1. Verify token with LINE API
    const verifyRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!verifyRes.ok) {
      return NextResponse.json({ error: 'Invalid LINE token' }, { status: 401 })
    }

    const lineProfile = await verifyRes.json()
    const { userId: lineUserId, displayName, pictureUrl } = lineProfile

    // 2. Upsert user in Supabase via admin client
    const supabase = createAdminClient()

    // Use LINE userId as the email (LINE doesn't provide email by default)
    const email = `line_${lineUserId}@vitalens.app`
    const password = `line_${lineUserId}_${process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 8)}`

    let userId: string

    // Try to get existing user
    const { data: existingUser } = await supabase.auth.admin.listUsers()
    const found = existingUser?.users?.find((u: { id: string; email?: string }) => u.email === email)

    if (found) {
      userId = found.id
    } else {
      // Create new Supabase user
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          line_user_id: lineUserId,
          display_name: displayName,
          picture_url: pictureUrl,
          provider: 'line',
        },
      })

      if (createError || !newUser?.user) {
        throw new Error(createError?.message ?? 'Failed to create user')
      }

      userId = newUser.user.id
    }

    // 3. Generate a session token via signInWithPassword
    const { data: session, error: signInError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (signInError || !session) {
      throw new Error(signInError?.message ?? 'Failed to generate session')
    }

    return NextResponse.json({
      token: session.properties?.hashed_token,
      userId,
      displayName,
      pictureUrl,
    })
  } catch (err) {
    console.error('[/api/auth/line]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Auth failed' },
      { status: 500 }
    )
  }
}
