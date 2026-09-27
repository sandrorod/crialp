import { api } from '@/lib/api';
import type {
  AnalysisResult,
  Company,
  CompanyDraft,
  CompanyImage,
  CompanySources,
  CompanyListItem,
  DashboardStats,
  Job,
  LandingContent,
  LandingPage,
  LandingPageDetail,
  LandingPageListItem,
  LpStatus,
  Preset,
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
};

export const analysisService = {
  analyzeUrl: (url: string, allowImages = false) => api.post<{ jobId: string }>('/analyze-url', { url, allowImages }),
  generate: (companyId: string, opts: { landingPageId?: string; keepTheme?: boolean } = {}) =>
    api.post<{ jobId: string }>('/generate-landing-page', { companyId, ...opts }),
  job: <T>(id: string) => api.get<Job<T>>(`/jobs/${id}`),
};
export type { AnalysisResult };

export const companyService = {
  list: (f: { search?: string; segment?: string; city?: string; status?: string }) =>
    api.get<{ items: CompanyListItem[]; facets: { segments: string[]; cities: string[] } }>(`/companies${qs(f)}`),
  get: (id: string) => api.get<Company>(`/companies/${id}`),
  create: (draft: CompanyDraft & { source_meta?: object; analysis_job_id?: string }) => api.post<{ id: string }>('/companies', draft),
  update: (id: string, draft: CompanyDraft) => api.put<Company>(`/companies/${id}`, draft),
  remove: (id: string) => api.del(`/companies/${id}`),
  sources: (id: string) => api.get<CompanySources>(`/companies/${id}/sources`),
  refreshSources: (id: string) => api.post<CompanySources>(`/companies/${id}/sources/refresh`),
  fetchImages: (id: string, allowImages: boolean) =>
    api.post<{ images: CompanyImage[]; found: number; classified: boolean }>(`/companies/${id}/fetch-images`, { allowImages }),
};

export const landingPageService = {
  list: (f: { search?: string; status?: string }) => api.get<{ items: LandingPageListItem[] }>(`/landing-pages${qs(f)}`),
  get: (id: string) => api.get<LandingPageDetail>(`/landing-pages/${id}`),
  presets: () => api.get<Preset[]>('/landing-pages/presets'),
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
  exportUrl: (id: string) => `/api/landing-pages/${id}/export`,
};

export const miscService = {
  dashboard: () => api.get<DashboardStats>('/dashboard'),
  settings: () =>
    api.get<{ user: User; ai: { provider: string; model: string; configured: boolean }; app_url: string; storage: string; environment: string }>('/settings'),
  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ url: string }>('/uploads', form);
  },
};
