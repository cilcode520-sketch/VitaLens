import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  Profile,
  Supplement,
  SafetyFlag,
  FoodItem,
  NutrientData,
} from '@/types/database'

export const runtime = 'edge'
export const maxDuration = 30

// ─────────────────────────────────────────────────────────────
// POST /api/analyze
// Body: { imageBase64, voiceTranscript, profileId, mealTime }
// Returns: AnalyzeResponse
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequest = await req.json()
    const { imageBase64, voiceTranscript, profileId, mealTime } = body

    if (!profileId) {
      return NextResponse.json({ error: '缺少 profileId' }, { status: 400 })
    }
    if (!imageBase64 && !voiceTranscript) {
      return NextResponse.json({ error: '需要提供圖片或語音文字' }, { status: 400 })
    }

    // ── 1. Fetch profile & related supplements from Supabase ──
    const supabase = await createClient()

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: '找不到用戶檔案' }, { status: 404 })
    }

    const { data: supplements } = await supabase
      .from('supplements')
      .select('*')

    // ── 2. Build AI prompt ──────────────────────────────────
    const systemPrompt = buildSystemPrompt(profile as Profile)
    const userPrompt = buildUserPrompt(voiceTranscript, mealTime)

    // ── 3. Call OpenAI GPT-4o with vision ──────────────────
    const aiResult = await callOpenAI(
      systemPrompt,
      userPrompt,
      imageBase64 ?? null
    )

    // ── 4. Safety check against profile ────────────────────
    const safetyFlags = checkSafety(
      aiResult.items,
      aiResult.nutrients,
      profile as Profile,
      supplements as Supplement[] ?? []
    )

    // ── 5. Supplement suggestions ───────────────────────────
    const supplementSuggestions = suggestSupplements(
      aiResult.items,
      aiResult.nutrients,
      profile as Profile,
      supplements as Supplement[] ?? [],
      safetyFlags,
      voiceTranscript
    )

    const response: AnalyzeResponse = {
      items: aiResult.items,
      nutrients: aiResult.nutrients,
      safety_flags: safetyFlags,
      supplement_suggestions: supplementSuggestions,
      ai_summary: aiResult.summary,
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[/api/analyze] Error:', err)
    const message = err instanceof Error ? err.message : '分析失敗，請重試'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────
// OpenAI GPT-4o call
// ─────────────────────────────────────────────────────────────
interface AIAnalysisResult {
  items: FoodItem[]
  nutrients: NutrientData
  summary: string
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  imageBase64: string | null
): Promise<AIAnalysisResult> {
  const messages: object[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: imageBase64
        ? [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'high',
              },
            },
            { type: 'text', text: userPrompt },
          ]
        : userPrompt,
    },
  ]

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      max_tokens: 1024,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API 錯誤：${err}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content

  if (!content) throw new Error('AI 未回傳結果')

  try {
    const parsed = JSON.parse(content)
    return {
      items: parsed.items ?? [],
      nutrients: parsed.nutrients ?? {},
      summary: parsed.summary ?? '已完成食物辨識',
    }
  } catch {
    throw new Error('AI 回傳格式錯誤')
  }
}

// ─────────────────────────────────────────────────────────────
// Prompt Builders
// ─────────────────────────────────────────────────────────────
function buildSystemPrompt(profile: Profile): string {
  const ageInfo = profile.birthday
    ? `生日 ${profile.birthday}，` : ''

  const healthInfo = profile.health_tags.length
    ? `疾病史：${profile.health_tags.join('、')}。` : ''

  const allergyInfo = profile.allergy_tags.length
    ? `過敏原：${profile.allergy_tags.join('、')}。` : ''

  const medInfo = profile.medications.length
    ? `目前服用藥物：${profile.medications.join('、')}。` : ''

  const menstrualInfo =
    profile.menstrual_tracking && profile.gender === 'female'
      ? '此用戶有開啟經期追蹤，若食物或描述與生理期相關，優先建議富含鐵、鎂的補給。'
      : ''

  return `你是 VitaLens，一款專業的家庭精準營養 AI 助理。

用戶資料：
- 姓名：${profile.name}（${profile.type === 'self' ? '大人' : '小孩'}）
- ${ageInfo}性別：${profile.gender ?? '未設定'}
- ${healthInfo}
- ${allergyInfo}
- ${medInfo}
- ${menstrualInfo}

你的任務：
1. 辨識照片中的所有食物或補劑
2. 估算每項食物的份量與總熱量/營養素
3. 生成簡短繁體中文摘要（50字以內）

請以 JSON 格式回答，格式如下：
{
  "items": [
    { "name": "食物名稱", "quantity": 1, "unit": "份", "confidence": 0.92 }
  ],
  "nutrients": {
    "calories": 650,
    "protein_g": 32,
    "carbs_g": 78,
    "fat_g": 18,
    "sodium_mg": 820,
    "potassium_mg": 400
  },
  "summary": "午餐為雞腿便當，熱量約650大卡，蛋白質豐富。"
}

注意：
- 若圖片模糊，confidence 填 0.5 以下
- 熱量與營養素為估算值，以常見份量為準
- 所有文字使用繁體中文`
}

function buildUserPrompt(voiceTranscript?: string, mealTime?: string): string {
  let prompt = '請分析這張照片中的食物。'

  if (mealTime) {
    const mealLabels: Record<string, string> = {
      breakfast: '早餐',
      lunch: '午餐',
      dinner: '晚餐',
      snack: '點心',
      midnight: '消夜',
    }
    prompt += `這是${mealLabels[mealTime] ?? mealTime}。`
  }

  if (voiceTranscript) {
    prompt += `\n\n用戶語音補充說明：「${voiceTranscript}」`
    prompt += '\n請參考上述語音說明輔助判斷食物種類或份量。'
  }

  return prompt
}

// ─────────────────────────────────────────────────────────────
// Safety Checks (M3 Red-line system)
// ─────────────────────────────────────────────────────────────
function checkSafety(
  items: FoodItem[],
  nutrients: NutrientData,
  profile: Profile,
  supplements: Supplement[]
): SafetyFlag[] {
  const flags: SafetyFlag[] = []
  const itemNames = items.map((i) => i.name.toLowerCase())
  const age = getAgeInMonths(profile.birthday)

  // ── 兒童禁忌 ──────────────────────────────────────
  if (age !== null && age < 12) {
    const dangerousForInfants = ['蜂蜜', 'honey']
    if (dangerousForInfants.some((food) => itemNames.some((n) => n.includes(food)))) {
      flags.push({
        level: 'red',
        message: '🚨 1歲以下嬰兒嚴禁食用蜂蜜！可能導致嬰兒肉毒桿菌中毒，有生命危險。',
      })
    }
  }

  if (age !== null && age < 6) {
    const solidFoods = items.filter((i) => !['母乳', '配方奶', '奶粉'].includes(i.name))
    if (solidFoods.length > 0) {
      flags.push({
        level: 'yellow',
        message: '6個月以下寶寶建議純母乳或配方奶哺育，固體食物請先諮詢小兒科醫師。',
      })
    }
  }

  // ── 腎病高鉀警告 ─────────────────────────────────
  if (profile.health_tags.includes('kidney_disease')) {
    const highKFoods = ['香蕉', '番茄', '馬鈴薯', '菠菜', '豆類', '堅果']
    const found = highKFoods.filter((f) => itemNames.some((n) => n.includes(f)))
    if (found.length > 0 || (nutrients.potassium_mg ?? 0) > 400) {
      flags.push({
        level: 'red',
        message: `腎病患者注意：${found.join('、') || '此餐點'}含有較高鉀離子，請控制份量並諮詢醫師。`,
        nutrient: 'potassium',
      })
    }
  }

  // ── 糖尿病高碳水警告 ─────────────────────────────
  if (profile.health_tags.includes('diabetes')) {
    if ((nutrients.carbs_g ?? 0) > 60) {
      flags.push({
        level: 'yellow',
        message: `此餐碳水化合物約 ${nutrients.carbs_g}g，超過建議單餐攝取量，請注意血糖波動。`,
        nutrient: 'carbs',
      })
    }
  }

  // ── 過敏原偵測 ───────────────────────────────────
  const allergyMap: Record<string, string[]> = {
    nuts: ['花生', '腰果', '核桃', '杏仁', '堅果', 'nut'],
    shellfish: ['蝦', '蟹', '貝', '龍蝦', '海鮮', 'shrimp', 'crab'],
    gluten: ['小麥', '麵包', '麵條', '餃子', '饅頭', 'wheat', 'gluten'],
    dairy: ['牛奶', '乳酪', '起司', '奶油', 'milk', 'cheese'],
    eggs: ['蛋', '蛋黃', '蛋白', 'egg'],
  }

  for (const allergy of profile.allergy_tags) {
    const triggers = allergyMap[allergy] ?? [allergy]
    const detected = triggers.filter((t) => itemNames.some((n) => n.includes(t)))
    if (detected.length > 0) {
      flags.push({
        level: 'red',
        message: `⚠️ 偵測到過敏原「${allergy}」！食物中含有 ${detected.join('、')}，請勿食用。`,
      })
    }
  }

  // ── 藥物衝突（基於補劑庫）─────────────────────────
  if (profile.medications.length > 0) {
    const alcoholKeywords = ['酒', '啤酒', '紅酒', 'alcohol', 'wine', 'beer']
    const hasAlcohol = alcoholKeywords.some((k) => itemNames.some((n) => n.includes(k)))

    if (hasAlcohol) {
      const riskMeds = ['metformin', '二甲雙胍', 'warfarin', '華法林', 'aspirin', '阿斯匹林']
      const conflicting = profile.medications.filter((m) =>
        riskMeds.some((r) => m.toLowerCase().includes(r.toLowerCase()))
      )
      if (conflicting.length > 0) {
        flags.push({
          level: 'red',
          message: `酒精可能與您服用的藥物「${conflicting.join('、')}」產生嚴重交互作用，請避免飲酒。`,
        })
      }
    }
  }

  // ── 高鈉警告（通用）─────────────────────────────
  if ((nutrients.sodium_mg ?? 0) > 1000) {
    flags.push({
      level: 'yellow',
      message: `此餐鈉含量約 ${nutrients.sodium_mg}mg，已接近每日建議攝取上限（2000mg）的 ${Math.round((nutrients.sodium_mg! / 2000) * 100)}%。`,
      nutrient: 'sodium',
    })
  }

  return flags
}

// ─────────────────────────────────────────────────────────────
// Supplement Suggestions (M3 Smart Stacking)
// ─────────────────────────────────────────────────────────────
function suggestSupplements(
  items: FoodItem[],
  nutrients: NutrientData,
  profile: Profile,
  supplements: Supplement[],
  safetyFlags: SafetyFlag[],
  voiceTranscript?: string
): AnalyzeResponse['supplement_suggestions'] {
  const suggestions: AnalyzeResponse['supplement_suggestions'] = []
  const itemNames = items.map((i) => i.name.toLowerCase())
  const redFlaggedSupplements = new Set(
    safetyFlags
      .filter((f) => f.level === 'red' && f.supplement)
      .map((f) => f.supplement!)
  )

  for (const supp of supplements) {
    // Skip if contraindicated for this profile
    if (redFlaggedSupplements.has(supp.id)) continue

    // Check medication conflicts
    const medConflict = supp.contraindications.medications?.some((med) =>
      profile.medications.some((m) => m.toLowerCase().includes(med.toLowerCase()))
    )
    if (medConflict) continue

    // Check health tag conflicts
    const healthConflict = supp.contraindications.health_tags?.some((tag) =>
      profile.health_tags.includes(tag)
    )
    if (healthConflict) continue

    // Check age restriction
    const ageMonths = getAgeInMonths(profile.birthday)
    if (
      ageMonths !== null &&
      supp.contraindications.min_age_months !== undefined &&
      ageMonths < supp.contraindications.min_age_months
    ) continue

    // ── Match logic ──────────────────────────────
    let reason: string | null = null

    // Pair with food keywords
    const pairKeywords = supp.recommendations.pair_with ?? []
    const matchedFood = pairKeywords.find((k) =>
      itemNames.some((n) => n.includes(k.toLowerCase()))
    )
    if (matchedFood) {
      reason = `與${matchedFood}同食，${supp.recommendations.timing ?? '可提升效果'}`
    }

    // High-fat meal → digestive enzymes
    if (!reason && (nutrients.fat_g ?? 0) > 25 && supp.category === 'enzyme') {
      reason = `此餐油脂較高（${nutrients.fat_g}g），建議搭配消化酶幫助消化`
    }

    // Large meal → enzymes / probiotics
    if (!reason && (nutrients.calories ?? 0) > 700 && ['enzyme', 'probiotic'].includes(supp.category ?? '')) {
      reason = `豐盛餐點熱量較高，${supp.name}有助於消化吸收`
    }

    // Menstrual phase → iron / magnesium
    const isMenstrual = profile.menstrual_tracking &&
      profile.gender === 'female' &&
      isMenstrualPhase(profile.last_period_date, profile.cycle_days)
    const menstrualKeywords = ['生理期', '月經', '經痛', '肚子痛']
    const hasMenstrualMention = menstrualKeywords.some((k) => voiceTranscript?.includes(k))

    if (!reason && (isMenstrual || hasMenstrualMention)) {
      const phase = supp.recommendations.menstrual_phase ?? []
      if (phase.includes('menstruation')) {
        reason = `經期補充${supp.name}有助於補鐵、緩解經痛與肌肉放鬆`
      }
    }

    if (reason) {
      suggestions.push({
        supplement: { id: supp.id, name: supp.name, recommendations: supp.recommendations },
        reason,
      })
    }

    if (suggestions.length >= 3) break // Max 3 suggestions
  }

  return suggestions
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getAgeInMonths(birthday: string | null): number | null {
  if (!birthday) return null
  const birth = new Date(birthday)
  const now = new Date()
  return (
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth())
  )
}

function isMenstrualPhase(
  lastPeriodDate: string | null,
  cycleDays: number
): boolean {
  if (!lastPeriodDate) return false
  const last = new Date(lastPeriodDate)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - last.getTime()) / 86400000)
  const cycleDay = diffDays % cycleDays
  return cycleDay <= 5 // Days 1-5 of cycle = menstruation
}
