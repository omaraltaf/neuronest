// ============================================================
// NEURONEST — Core Types
// ============================================================

export type Language = 'en' | 'no'

export type AppPhase =
  | 'onboarding'
  | 'intake'
  | 'profile_review'
  | 'plan_generation'
  | 'plan_feedback'
  | 'active'
  | 'weekly_checkin'
  | 'plan_review'

export type AgentType =
  | 'intake'
  | 'profile'
  | 'planning'
  | 'content'
  | 'progress'
  | 'child'
  | 'orchestrator'

// ── Child ────────────────────────────────────────────────────
export interface Child {
  id: string
  user_id: string
  name: string
  dob: string | null
  gender: string | null
  diagnosis: string | null
  diagnosis_date: string | null
  diagnosis_source: string | null
  country: string
  school_name: string | null
  teacher_name: string | null
  interests: string[]
  language: Language
  created_at: string
  updated_at: string
}

// ── Domain Confidence ────────────────────────────────────────
export interface DomainConfidence {
  communication: number  // 0–100
  social: number
  sensory: number
  behaviour: number
  motor: number
  cognition: number
  family_context: number
  strengths: number
}

// ── Intake Session ───────────────────────────────────────────
export interface IntakeSession {
  id: string
  child_id: string
  messages: ChatMessage[]
  domain_confidence: DomainConfidence
  extracted_profile: ExtractedProfile | null
  status: 'in_progress' | 'complete'
  started_at: string
  completed_at: string | null
  updated_at: string
}

export interface ExtractedProfile {
  communication: DomainData
  social: DomainData
  sensory: DomainData
  behaviour: DomainData
  motor: DomainData
  cognition: DomainData
  family_context: DomainData
  strengths: DomainData
  extracted_scores: Record<string, unknown>
  open_questions: string[]
  clinical_observations: string
  priority_flags: string[]
}

export interface DomainData {
  confidence: number
  [key: string]: unknown
}

// ── Chat Message ─────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

// ── Document ─────────────────────────────────────────────────
export interface Document {
  id: string
  child_id: string
  file_name: string
  file_url: string | null
  doc_type: string | null
  extracted_data: Record<string, unknown> | null
  processing_status: 'pending' | 'processing' | 'complete' | 'failed'
  uploaded_at: string
  processed_at: string | null
}

// ── Child Profile ────────────────────────────────────────────
export interface ChildProfile {
  id: string
  child_id: string
  version: number
  profile_data: ProfileData
  root_causes: RootCauses | null
  strength_map: StrengthMap | null
  priority_matrix: PriorityItem[] | null
  hypotheses: Hypothesis[] | null
  parent_confirmed: boolean
  confirmed_at: string | null
  generated_at: string
  is_current: boolean
}

export interface ProfileData {
  snapshot: string
  communication: DomainProfile
  social: DomainProfile
  sensory: DomainProfile
  behaviour: DomainProfile
  motor: DomainProfile
  cognition: DomainProfile
  family_context: DomainProfile
}

export interface DomainProfile {
  summary: string
  strengths: string[]
  challenges: string[]
  root_cause: string
  targets: string[]
}

export interface RootCauses {
  communication: string
  social: string
  sensory: string
  behaviour: string
  motor: string
  cognition: string
}

export interface StrengthMap {
  strengths: Array<{ label: string; description: string; leverage: string }>
}

export interface PriorityItem {
  rank: number
  area: string
  label: string
  rationale: string
  urgency: 'high' | 'medium' | 'low'
}

export interface Hypothesis {
  if: string
  then: string
  because: string
}

// ── Plan ─────────────────────────────────────────────────────
export interface Plan {
  id: string
  child_id: string
  profile_id: string | null
  version: number
  plan_data: PlanData
  phase_structure: Phase[] | null
  status: 'draft' | 'feedback' | 'active' | 'archived'
  parent_approved: boolean
  approved_at: string | null
  created_at: string
  activated_at: string | null
  is_current: boolean
}

export interface PlanData {
  overview: string
  phases: Phase[]
  goals: PlanGoal[]
  parent_priorities_addressed: string[]
}

export interface Phase {
  number: number
  title: string
  weeks: string
  focus: string
  goals: string[]
}

export interface PlanGoal {
  id: string
  area: string
  label: string
  rationale: string
  root_cause_addressed: string
  approach: string
  baseline: string
  target_criterion: string
  timeline_weeks: number
  evidence_base: string
  activities: Activity[]
  generalisation_plan: string
  dependencies: string[]
}

export interface Activity {
  id: string
  title: string
  duration: string
  instruction: string
  what_you_need: string[]
  what_to_say: string
  success_looks_like: string
  if_struggling: string
  if_succeeding: string
  why_it_works: string
}

// ── Goal (DB) ─────────────────────────────────────────────────
export type GoalStatus = 'not_started' | 'in_progress' | 'emerging' | 'achieved' | 'paused'

export interface Goal {
  id: string
  plan_id: string
  child_id: string
  area: string
  label: string
  rationale: string | null
  root_cause_addressed: string | null
  approach: string | null
  baseline: string | null
  target_criterion: string | null
  timeline_weeks: number | null
  evidence_base: string | null
  activities: Activity[] | null
  generalisation_plan: string | null
  dependencies: string[]
  status: GoalStatus
  started_at: string | null
  achieved_at: string | null
  created_at: string
  updated_at: string
}

// ── App State ─────────────────────────────────────────────────
export interface AppState {
  id: string
  child_id: string
  current_phase: AppPhase
  intake_complete: boolean
  profile_confirmed: boolean
  plan_approved: boolean
  current_week: number
  last_checkin_at: string | null
  next_checkin_due: string | null
  total_stars: number
  updated_at: string
}

// ── Weekly Check-In ───────────────────────────────────────────
export interface WeeklyCheckin {
  id: string
  child_id: string
  week_number: number
  messages: ChatMessage[]
  parent_wellbeing: number | null
  wins: string[]
  challenges: string[]
  goal_assessments: GoalAssessment[] | null
  recommendations: string[]
  escalation_flags: string[]
  plan_adjustment_needed: boolean
  created_at: string
  completed_at: string | null
}

export interface GoalAssessment {
  goal_id: string
  goal_label: string
  status: 'progressing' | 'stable' | 'plateauing' | 'regressing'
  parent_confidence: number
  what_happened: string
  barriers: string
  next_week_adjustment: string
}

// ── Generated Content ─────────────────────────────────────────
export type ContentType =
  | 'activity'
  | 'social_story'
  | 'flashcard_set'
  | 'game'
  | 'role_play'
  | 'visual_aid'
  | 'sensory_card'

export interface GeneratedContent {
  id: string
  child_id: string
  goal_id: string | null
  content_type: ContentType
  title: string
  content_data: Record<string, unknown>
  language: Language
  active: boolean
  generated_at: string
}

// ── Session Log ───────────────────────────────────────────────
export interface SessionLog {
  id: string
  child_id: string
  goal_id: string | null
  activity_title: string
  area: string | null
  rating: number | null
  notes: string | null
  duration_min: number | null
  logged_at: string
}
