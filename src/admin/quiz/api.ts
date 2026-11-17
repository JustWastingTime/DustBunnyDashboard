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
  canEdit: boolean
  pendingDrafts: number
}

export type ChangeSummary = { questions: number; entries: number; changed: number; first?: number | null; text: string }
export type DraftSummary = {
  id: string
  categoryId: string
  categoryName: string
  authorId: string
  authorName: string
  createdAt: string
  updatedAt: string
  baseBlobSha: string
  message: string
  summary: ChangeSummary
  status: 'pending' | 'changes_requested'
  note: string
  reviewedBy?: string
}
export type Draft = DraftSummary & { data: CategoryFile }

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

export type SaveCategoryResult =
  | { published: true; summary: ChangeSummary; commitSha: string; blobSha: string | null }
  | { published: false; draft: DraftSummary }

const json = (body: unknown) => ({ body: JSON.stringify(body) })

export const quizApi = {
  categories: () => adminFetch<{ categories: CategorySummary[]; pendingDrafts: number }>('/api/admin/quiz/categories'),
  category: (id: string) => adminFetch<{ data: CategoryFile; blobSha: string; enabled: boolean }>(`/api/admin/quiz/categories/${encodeURIComponent(id)}`),
  createCategory: (id: string, name: string) =>
    adminFetch<{ id: string }>('/api/admin/quiz/categories', { method: 'POST', ...json({ id, name }) }),
  saveCategory: (id: string, body: { data: CategoryFile; baseBlobSha: string; message?: string; draftId?: string | null }) =>
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
  drafts: () => adminFetch<{ drafts: DraftSummary[] }>('/api/admin/quiz/drafts'),
  draft: (id: string) => adminFetch<{ draft: Draft }>(`/api/admin/quiz/drafts/${encodeURIComponent(id)}`),
  approveDraft: (id: string) => adminFetch<{ ok: true }>(`/api/admin/quiz/drafts/${encodeURIComponent(id)}/approve`, { method: 'POST', body: '{}' }),
  rejectDraft: (id: string, note: string) =>
    adminFetch<{ draft: DraftSummary }>(`/api/admin/quiz/drafts/${encodeURIComponent(id)}/reject`, { method: 'POST', ...json({ note }) }),
  deleteDraft: (id: string) => adminFetch<{ ok: true }>(`/api/admin/quiz/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  editors: () => adminFetch<{ editors: QuizEditor[] }>('/api/admin/quiz/editors'),
  saveEditor: (editor: Pick<QuizEditor, 'discordId' | 'label' | 'role' | 'categories' | 'canPublish'>) =>
    adminFetch<{ editors: QuizEditor[] }>('/api/admin/quiz/editors', { method: 'PUT', ...json({ editor }) }),
  removeEditor: (discordId: string) =>
    adminFetch<{ editors: QuizEditor[] }>(`/api/admin/quiz/editors/${encodeURIComponent(discordId)}`, { method: 'DELETE' }),
}

export function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason)
}
