// Auto-generated types matching Supabase schema
// Run `npx supabase gen types typescript` to regenerate after schema changes

export type ProfileType = 'self' | 'child'
export type Gender = 'male' | 'female' | 'other'
export type IntakeType = 'food' | 'supplement' | 'drink'
export type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'midnight'
export type Intensity = 'low' | 'medium' | 'high'
export type SafetyLevel = 'green' | 'yellow' | 'red'

export interface Profile {
  id: string
  user_id: string
  name: string
  type: ProfileType
  birthday: string | null
  gender: Gender | null
  avatar_url: string | null
  health_tags: string[]
  allergy_tags: string[]
  medications: string[]
  menstrual_tracking: boolean
  last_period_date: string | null
  cycle_days: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface NutrientData {
  calories?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  fiber_g?: number
  sodium_mg?: number
  potassium_mg?: number
  calcium_mg?: number
  iron_mg?: number
  vitamin_c_mg?: number
  vitamin_d_iu?: number
}

export interface SafetyFlag {
  level: SafetyLevel
  message: string
  nutrient?: string
  supplement?: string
}

export interface FoodItem {
  name: string
  quantity: number
  unit: string
  confidence: number
}

export interface IntakeLog {
  id: string
  profile_id: string
  type: IntakeType
  meal_time: MealTime | null
  items: FoodItem[]
  nutrients: NutrientData
  safety_flags: SafetyFlag[]
  voice_note: string | null
  image_url: string | null
  ai_response: Record<string, unknown>
  created_at: string
}

export interface Supplement {
  id: string
  name: string
  name_en: string | null
  category: string | null
  ingredients: Array<{ name: string; amount_mg?: number; cfu?: string }>
  contraindications: {
    medications?: string[]
    health_tags?: string[]
    min_age_months?: number
    notes?: string
  }
  recommendations: {
    pair_with?: string[]
    menstrual_phase?: string[]
    timing?: string
  }
  created_at: string
}

export interface WorkoutLog {
  id: string
  profile_id: string
  activity: string
  duration_min: number
  intensity: Intensity | null
  calories_burned: number | null
  recovery_advice: {
    protein_g?: number
    electrolytes?: boolean
    suggested_supplements?: string[]
  }
  created_at: string
}

export interface SymptomLog {
  id: string
  profile_id: string
  symptoms: string[]
  severity: number | null
  voice_note: string | null
  ai_analysis: {
    probable_cause?: string
    related_logs?: string[]
    advice?: string
  }
  created_at: string
}

// API request/response types
export interface AnalyzeRequest {
  imageBase64?: string
  voiceTranscript?: string
  profileId: string
  mealTime?: MealTime
}

export interface AnalyzeResponse {
  items: FoodItem[]
  nutrients: NutrientData
  safety_flags: SafetyFlag[]
  supplement_suggestions: Array<{
    supplement: Pick<Supplement, 'id' | 'name' | 'recommendations'>
    reason: string
  }>
  ai_summary: string
}
