import { AppError } from '../../lib/errors.js';
import type { CompanyInput } from '../../lib/validation.js';
import { createCompany, findDuplicateCompany } from '../../repositories/companies.js';
import { saveSources, type SourcePayload } from '../../repositories/sources.js';
import { relinkConversations } from '../crm/whatsapp.js';
import { jobService } from '../jobs/JobService.js';

/** Logotipo da empresa: a primeira imagem do tipo "logo" liberada para uso. */
export function withLogo(input: CompanyInput): CompanyInput {
  const logo = input.images.find((i) => i.type === 'logo' && i.usage_allowed);
  return { ...input, logo_url: logo?.url ?? null };
}

/**
 * Cadastra a empresa revisada (tela "Nova Landing Page" ou lote de LPs): recusa duplicada, liga as conversas
 * do CRM pelo número e guarda o conteúdo completo do site lido pela análise (`analysisJobId`).
 */
export async function registerCompany(orgId: string, userId: string, input: CompanyInput, sourceMeta: object, analysisJobId?: string) {
  const dup = await findDuplicateCompany(orgId, {
    url: input.reference_url,
    website: input.website,
    name: input.name,
    tradeName: input.trade_name,
    phones: [input.phone, input.mobile, input.whatsapp],
    zip: input.zip_code,
  });
  if (dup) throw new AppError(409, `Esta empresa já foi cadastrada: "${dup.name}" (mesmo ${dup.reason}).`, 'DUPLICATE_COMPANY');
  const id = await createCompany(orgId, userId, withLogo(input), sourceMeta);
  await relinkConversations(orgId, { onlyUnlinked: true });
  if (analysisJobId) {
    const job = await jobService.get(orgId, analysisJobId);
    const raw = (job?.result as { raw?: SourcePayload } | null)?.raw;
    if (job?.type === 'analyze_url' && raw) await saveSources(id, raw);
  }
  return id;
}
