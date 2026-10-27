import type { RenderContext } from '../context.js';
import { ed } from '../context.js';
import { Icon } from './Icon.js';

/** Botão "Fale conosco" (qualquer caixa/acentuação/pontuação): sempre leva à seção Contato. */
const isTalkToUs = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[^a-zA-Z ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase() === 'fale conosco';

/** `iconFirst`: ícone antes do texto (no WhatsApp, o balão com fone). `toContact`: leva à seção Contato. */
export function CtaButton({
  ctx,
  label,
  path,
  className = 'btn btn-primary',
  icon = true,
  iconFirst = false,
  toContact = false,
}: {
  ctx: RenderContext;
  label: string;
  path?: string;
  className?: string;
  icon?: boolean;
  iconFirst?: boolean;
  toContact?: boolean;
}) {
  const contact = toContact || isTalkToUs(label);
  const ext = !contact && ctx.links.primaryIsExternal;
  const glyph = icon ? (
    <Icon name={contact ? 'arrow' : ctx.links.whatsapp ? (iconFirst ? 'whatsapp' : 'message') : 'arrow'} size={iconFirst ? 22 : 18} stroke={2} />
  ) : null;
  return (
    <a className={className} href={contact ? '#contato' : ctx.links.primary} {...(ext ? { target: '_blank', rel: 'noopener' } : {})}>
      {iconFirst ? glyph : null}
      <span {...(path ? ed(ctx, path) : {})}>{label}</span>
      {iconFirst ? null : glyph}
    </a>
  );
}
