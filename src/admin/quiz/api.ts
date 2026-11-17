import { adminFetch } from '../api'

export type QuizRole = 'owner' | 'reviewer' | 'editor'
export type QuizAccess = { role: QuizRole; categories: string[]; canPublish: boolean }

export type RawEntry = [string, string[], ...string[]] | Record<string, unknown>
export type RawQuestion = {
  promptTemplate?: string
  prompt?: string
  difficulty?: string
  entries?: RawEntry[]
  answers?: string[]
  [key: string]: unknown
}
export type CategoryFile = { name: string; questions: RawQuestion[]; [key: string]: unknown }

export type CategorySummary = {
  id: string
  name: string
  enabled: boolean
  questions: number
  entries: number
  difficulty: Record<'easy' | 'medium' | 'hard' | 'expert', number>
  /** Can publish straight into this category (and approve Test questions for it). */
  canEdit: boolean
  /** Can submit new questions meant for this category. */
  canSubmit: boolean
}

export type TestSummary = { id: string; name: string; total: number; waiting: number; mine: number }

export type Submission = {
  id: string
  index: number
  prompt: string
  difficulty: string | null
  shape: 'template' | 'fixed'
  entries: number
  target: string | null
  /** Set on questions moved over from the old draft queue, e.g. "Edited version of question 4". */
  note: string
  by: string | null
  byId: string | null
  at: string | null
  canApprove: boolean
  canEdit: boolean
}

export type ChangeSummary = { questions: number; entries: number; changed: number; first?: number | null; text: string }

export type CoverageItem = { key: string; label: string; rarity?: string; group?: string }
export type CoverageDataset = 'umas' | 'cards' | 'skills'
export type CoverageCheck = {
  dataset: CoverageDataset
  categoryId: string
  categoryName: string
  enabled: boolean
  index: number
  prompt: string
  entries: number
  covered: string[]
}
export type Recipe = { id: string; label: string; datasets: CoverageDataset[]; promptTemplate: string }

export type QuizEditor = {
  discordId: string
  label: string
  role: 'editor' | 'reviewer'
  categories: string[]
  canPublish: boolean
  addedBy: string | null
  addedAt: string
}

export type SaveCategoryResult = { summary: ChangeSummary; commitSha: string; blobSha: string | null }

const json = (body: unknown) => ({ body: JSON.stringify(body) })

export const quizApi = {
  categories: () => adminFetch<{ categories: CategorySummary[]; test: TestSummary | null }>('/api/admin/quiz/categories'),
  category: (id: string) => adminFetch<{ data: CategoryFile; blobSha: string; enabled: boolean }>(`/api/admin/quiz/categories/${encodeURIComponent(id)}`),
  createCategory: (id: string, name: string) =>
    adminFetch<{ id: string }>('/api/admin/quiz/categories', { method: 'POST', ...json({ id, name }) }),
  saveCategory: (id: string, body: { data: CategoryFile; baseBlobSha: string; message?: string }) =>
    adminFetch<SaveCategoryResult>(`/api/admin/quiz/categories/${encodeURIComponent(id)}`, { method: 'PUT', ...json(body) }),
  setEnabled: (categoryId: string, enabled: boolean) =>
    adminFetch<{ enabledCategories: string[] }>('/api/admin/quiz/settings', { method: 'PUT', ...json({ categoryId, enabled }) }),
  lists: () => adminFetch<{ lists: Record<string, string[]> }>('/api/admin/quiz/lists'),
  saveList: (name: string, items: string[]) =>
    adminFetch<{ lists: Record<string, string[]> }>(`/api/admin/quiz/lists/${encodeURIComponent(name)}`, { method: 'PUT', ...json({ items }) }),
  coverage: () => adminFetch<{ datasets: Record<CoverageDataset, CoverageItem[]>; checks: CoverageCheck[]; recipes: Recipe[] }>('/api/admin/quiz/coverage'),
  generate: (recipe: string, keys: string[]) =>
    adminFetch<{ recipe: string; promptTemplate: string; entries: RawEntry[]; skipped: Array<{ key: string; reason: string }> }>(
      '/api/admin/quiz/generate', { method: 'POST', ...json({ recipe, keys }) }),
  test: () => adminFetch<{ name: string; blobSha: string; oldDrafts: number; submissions: Submission[] }>('/api/admin/quiz/test'),
  importDrafts: () => adminFetch<{ imported: number; skipped: Array<{ id: string; by: string | null; reason: string }> }>('/api/admin/quiz/test/import-drafts', { method: 'POST', body: '{}' }),
  submission: (id: string) => adminFetch<{ question: RawQuestion; submission: Submission }>(`/api/admin/quiz/test/${encodeURIComponent(id)}`),
  submit: (question: RawQuestion, target: string) =>
    adminFetch<{ id: string }>('/api/admin/quiz/test', { method: 'POST', ...json({ question, target }) }),
  updateSubmission: (id: string, question: RawQuestion, target: string, message?: string) =>
    adminFetch<{ id: string }>(`/api/admin/quiz/test/${encodeURIComponent(id)}`, { method: 'PUT', ...json({ question, target, message }) }),
  removeSubmission: (id: string) => adminFetch<{ ok: true }>(`/api/admin/quiz/test/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  approve: (id: string, body: { target: string; mode: 'new' | 'merge' | 'replace'; questionIndex?: number; keep?: boolean }) =>
    adminFetch<{ categoryId: string; questionIndex: number }>(`/api/admin/quiz/test/${encodeURIComponent(id)}/approve`, { method: 'POST', ...json(body) }),
  editors: () => adminFetch<{ editors: QuizEditor[] }>('/api/admin/quiz/editors'),
  saveEditor: (editor: Pick<QuizEditor, 'discordId' | 'label' | 'role' | 'categories' | 'canPublish'>) =>
    adminFetch<{ editors: QuizEditor[] }>('/api/admin/quiz/editors', { method: 'PUT', ...json({ editor }) }),
  removeEditor: (discordId: string) =>
    adminFetch<{ editors: QuizEditor[] }>(`/api/admin/quiz/editors/${encodeURIComponent(discordId)}`, { method: 'DELETE' }),
}

export function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason)
}
