/**
 * Rótulos fixos da página (sobretítulos das seções, menu, botão do cabeçalho).
 * Ficam em `content.labels` e podem ser editados; o que não for definido usa o padrão.
 */
export const DEFAULT_LABELS = {
  eyebrow_about: 'Sobre nós',
  eyebrow_services: 'Serviços',
  eyebrow_differentials: 'Por que nos escolher',
  eyebrow_products: 'Produtos',
  eyebrow_gallery: 'Galeria',
  eyebrow_testimonials: 'Depoimentos',
  eyebrow_faq: 'Perguntas frequentes',
  eyebrow_contact: 'Contato',
  nav_about: 'Sobre',
  nav_services: 'Serviços',
  nav_differentials: 'Diferenciais',
  nav_products: 'Produtos',
  nav_gallery: 'Galeria',
  nav_faq: 'Dúvidas',
  nav_contact: 'Contato',
  header_cta: 'Fale conosco',
  whatsapp_float: 'Conversar pelo WhatsApp',
  whatsapp_message: 'Olá! Vim pela página da {empresa} e gostaria de mais informações.',
  contact_whatsapp: 'WhatsApp',
  contact_phone: 'Telefone',
  contact_email: 'E-mail',
  contact_address: 'Endereço',
  contact_hours: 'Horário de atendimento',
  fact_specialty: 'Especialidade',
  fact_location: 'Onde estamos',
  fact_hours: 'Atendimento',
  fact_audience: 'Para quem',
  testimonial_more: 'Ler mais',
  footer_note: '',
  skip_link: 'Pular para o conteúdo',
} as const;

export type LabelKey = keyof typeof DEFAULT_LABELS;
export type Labels = Record<LabelKey, string>;

export function resolveLabels(custom: unknown): Labels {
  const out: Record<string, string> = { ...DEFAULT_LABELS };
  if (custom && typeof custom === 'object') {
    for (const [k, v] of Object.entries(custom)) {
      if (k in DEFAULT_LABELS && typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
  }
  return out as Labels;
}
