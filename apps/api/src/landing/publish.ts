import { env } from '../config/env.js';
import { getCompanyFullById } from '../repositories/companies.js';
import { saveSnapshot, type LandingPageRow } from '../repositories/landingPages.js';
import { buildContext } from './context.js';
import { renderLandingPage } from './render.js';
import { normalizeThemeSettings, resolveTheme } from './theme.js';
import type { ContactFormStatus } from './context.js';
import { isValidEmail } from '../services/mail/mailer.js';

/** URL pública canônica: domínio personalizado ativo ou /lp/:slug no domínio do sistema. */
export function publicUrl(lp: Pick<LandingPageRow, 'slug' | 'custom_domain' | 'domain_status'>) {
  if (lp.custom_domain && ['verified', 'active'].includes(lp.domain_status)) return `https://${lp.custom_domain}/`;
  return `${env.appUrl}/lp/${lp.slug}`;
}

/** Renderiza a LP a partir dos dados estruturados atuais (empresa + conteúdo + tema). */
/** `editable`: prévia do editor, com os textos marcados para edição direto na página. */
/** `contactStatus`: resultado do envio do formulário de contato, mostrado na volta (?contato=…). */
export async function renderFromData(lp: LandingPageRow, opts: { editable?: boolean; contactStatus?: ContactFormStatus | null } = {}): Promise<string | null> {
  const company = await getCompanyFullById(lp.company_id);
  if (!company) return null;
  const theme = resolveTheme(normalizeThemeSettings(lp.theme));
  const ctx = buildContext({
    editable: opts.editable,
    company,
    content: lp.content,
    theme,
    seo: { title: lp.seo_title, description: lp.seo_description, keywords: lp.seo_keywords, ogImage: lp.og_image },
    pageUrl: publicUrl(lp),
    // O envio vai sempre ao endereço do sistema (domínio próprio só atende GET da página)
    contactForm: { action: `${env.appUrl}/lp/contato/${lp.id}`, recipientOk: isValidEmail(company.email), status: opts.contactStatus ?? null },
  });
  return renderLandingPage(ctx);
}

/** Atualiza o snapshot HTML armazenado (exportação / hospedagem estática futura). */
export async function refreshSnapshot(lp: LandingPageRow) {
  const html = await renderFromData(lp);
  if (html) await saveSnapshot(lp.id, html);
  return html;
}
