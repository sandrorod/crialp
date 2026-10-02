import { api } from '@/lib/api';
import type {
  AIKeyInfo,
  AnalysisResult,
  ClientAccess,
  Company,
  CompanyDraft,
  CompanyImage,
  CompanySources,
  CompanyListItem,
  DashboardStats,
  FoundCompany,
  PlaceListing,
  Job,
  LandingContent,
  LandingPage,
  LandingPageDetail,
  LandingPageListItem,
  LpStatus,
  Preset,
  ProspectingNote,
  SalesCompany,
  SubUser,
  TemplateInfo,
  ThemeSettings,
  User,
} from '@/types';

const qs = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return s ? `?${s}` : '';
};

export const authService = {
  me: () => api.get<{ user: User }>('/auth/me'),
  login: (email: string, password: string) => api.post<{ user: User }>('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  changePassword: (current_password: string, new_password: string) => api.post('/auth/password', { current_password, new_password }),
  updateName: (name: string) => api.patch<{ user: User }>('/auth/me', { name }),
};

export const analysisService = {
  /** `place`: local do Google Maps escolhido em "Buscar empresas" (dados já obtidos na pesquisa) */
  analyzeUrl: (url: string, allowImages = false, place?: PlaceListing) => api.post<{ jobId: string }>('/analyze-url', { url, allowImages, place }),
  generate: (companyId: string, opts: { landingPageId?: string; keepTheme?: boolean } = {}) =>
    api.post<{ jobId: string }>('/generate-landing-page', { companyId, ...opts }),
  job: <T>(id: string) => api.get<Job<T>>(`/jobs/${id}`),
  /** Interrompe a análise ou a geração em andamento */
  cancelJob: (id: string) => api.post(`/jobs/${id}/cancel`),
};
export type { AnalysisResult };

export const searchService = {
  /** Locais do Google Maps; `page` > 0 busca em anéis mais largos ao redor do mesmo centro */
  places: (q: string, near: { lat: number; lng: number } | null, page = 0) =>
    api.get<{ items: FoundCompany[]; center: { latitude: number; longitude: number } | null; has_more: boolean; warning: string | null }>(
      `/company-search${qs({ q, type: 'locais', lat: near?.lat.toFixed(5), lng: near?.lng.toFixed(5), page: String(page) })}`,
    ),
};

export const companyService = {
  list: (f: { search?: string; segment?: string; city?: string; status?: string }) =>
    api.get<{ items: CompanyListItem[]; facets: { segments: string[]; cities: string[] } }>(`/companies${qs(f)}`),
  get: (id: string) => api.get<Company>(`/companies/${id}`),
  create: (draft: CompanyDraft & { source_meta?: object; analysis_job_id?: string }) => api.post<{ id: string }>('/companies', draft),
  update: (id: string, draft: CompanyDraft) => api.put<Company>(`/companies/${id}`, draft),
  remove: (id: string) => api.del(`/companies/${id}`),
  sources: (id: string) => api.get<CompanySources>(`/companies/${id}/sources`),
  refreshSources: (id: string) => api.post<CompanySources>(`/companies/${id}/sources/refresh`),
  /** Fotos adicionadas pelo editor da LP (entram liberadas para uso). */
  addImages: (id: string, images: { url: string; alt_text?: string | null; source: 'upload' | 'manual' }[]) =>
    api.post<Company>(`/companies/${id}/images`, { images }),
  /** Apaga fotos do cadastro (somem de todas as páginas da empresa). */
  removeImages: (id: string, urls: string[]) => api.post<Company>(`/companies/${id}/images/remove`, { urls }),
  fetchImages: (id: string, allowImages: boolean) =>
    api.post<{ images: CompanyImage[]; found: number; classified: boolean }>(`/companies/${id}/fetch-images`, { allowImages }),
};

export const landingPageService = {
  list: (f: { search?: string; status?: string }) => api.get<{ items: LandingPageListItem[] }>(`/landing-pages${qs(f)}`),
  get: (id: string) => api.get<LandingPageDetail>(`/landing-pages/${id}`),
  presets: () => api.get<Preset[]>('/landing-pages/presets'),
  templates: () => api.get<TemplateInfo[]>('/landing-pages/templates'),
  labels: () => api.get<Record<string, string>>('/landing-pages/labels'),
  saveContent: (
    id: string,
    body: { content: LandingContent; theme: ThemeSettings; seo: { seo_title: string | null; seo_description: string | null; seo_keywords: string[]; og_image: string | null }; note?: string },
  ) => api.put<LandingPage>(`/landing-pages/${id}/content`, body),
  setStatus: (id: string, status: LpStatus) => api.patch<LandingPage>(`/landing-pages/${id}/status`, { status }),
  publish: (id: string) => api.post<LandingPage>(`/landing-pages/${id}/publish`),
  updateSettings: (id: string, body: { slug?: string; custom_domain?: string | null }) => api.patch<LandingPage>(`/landing-pages/${id}/settings`, body),
  verifyDomain: (id: string) =>
    api.post<LandingPage & { verification: { ok: boolean; expected: { cname: string; a: string[] }; found: { cname: string[]; a: string[] } } }>(
      `/landing-pages/${id}/domain/verify`,
    ),
  restore: (id: string, version: number) => api.post<LandingPage>(`/landing-pages/${id}/versions/${version}/restore`),
  remove: (id: string) => api.del(`/landing-pages/${id}`),
  previewUrl: (id: string) => `/api/landing-pages/${id}/preview`,
  /** HTML da prévia com conteúdo e tema ainda não salvos. */
  previewDraft: (id: string, body: { content: LandingContent; theme: ThemeSettings }) => api.post<{ html: string }>(`/landing-pages/${id}/preview`, body),
  exportUrl: (id: string) => `/api/landing-pages/${id}/export`,
  /** Ícones dos elementos: { nome: svg } */
  icons: () => api.get<Record<string, string>>('/landing-pages/icons'),
  clientAccess: (id: string) => api.get<{ client: ClientAccess | null }>(`/landing-pages/${id}/client-access`),
  saveClientAccess: (id: string, body: { name?: string; email: string; password?: string }) =>
    api.put<{ client: ClientAccess | null }>(`/landing-pages/${id}/client-access`, body),
  removeClientAccess: (id: string) => api.del(`/landing-pages/${id}/client-access`),
};

export type KeyProvider = 'gemini' | 'rapidapi';

export const miscService = {
  dashboard: () => api.get<DashboardStats>('/dashboard'),
  settings: () =>
    api.get<{ user: User; ai: { provider: string; model: string; configured: boolean }; app_url: string; storage: string; environment: string }>('/settings'),
  /** Chaves com rodízio por provedor (Gemini e RapidAPI) */
  apiKeys: (provider: KeyProvider) =>
    api.get<{ keys: AIKeyInfo[]; env_key: { last4: string } | null; provider_active: boolean }>(`/settings/keys/${provider}`),
  addApiKey: (provider: KeyProvider, key: string, label?: string) => api.post<AIKeyInfo>(`/settings/keys/${provider}`, { key, label: label || null }),
  updateApiKey: (provider: KeyProvider, id: string, body: { active?: boolean; label?: string | null }) => api.patch(`/settings/keys/${provider}/${id}`, body),
  removeApiKey: (provider: KeyProvider, id: string) => api.del(`/settings/keys/${provider}/${id}`),
  /** Tira do rodízio a chave da variável de ambiente (GEMINI_API_KEY / RAPIDAPI_KEY) */
  removeEnvApiKey: (provider: KeyProvider) => api.del(`/settings/keys/${provider}/env`),
  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ url: string }>('/uploads', form);
  },
};

export const userService = {
  list: () => api.get<SubUser[]>('/users'),
  create: (body: { name: string; email: string; password: string; role: 'admin' | 'seller' }) => api.post<SubUser>('/users', body),
  update: (id: string, body: { name?: string; email?: string; role?: 'admin' | 'seller'; password?: string }) => api.patch<SubUser>(`/users/${id}`, body),
  remove: (id: string) => api.del(`/users/${id}`),
};

export const salesService = {
  companies: (f: { search?: string; segment?: string; city?: string }) =>
    api.get<{ items: SalesCompany[]; facets: { segments: string[]; cities: string[] } }>(`/sales/companies${qs(f)}`),
  notes: (companyId: string) => api.get<ProspectingNote[]>(`/sales/companies/${companyId}/notes`),
  addNote: (companyId: string, note: string) => api.post<ProspectingNote>(`/sales/companies/${companyId}/notes`, { note }),
  removeNote: (companyId: string, noteId: string) => api.del(`/sales/companies/${companyId}/notes/${noteId}`),
};
