import type { RenderContext } from '../context.js';
import { ed } from '../context.js';
import { Icon } from './Icon.js';

/** `iconFirst`: ícone antes do texto (no WhatsApp, o balão com fone). */
export function CtaButton({ ctx, label, path, className = 'btn btn-primary', icon = true, iconFirst = false }: { ctx: RenderContext; label: string; path?: string; className?: string; icon?: boolean; iconFirst?: boolean }) {
  const ext = ctx.links.primaryIsExternal;
  const glyph = icon ? <Icon name={ctx.links.whatsapp ? (iconFirst ? 'whatsapp' : 'message') : 'arrow'} size={iconFirst ? 22 : 18} stroke={2} /> : null;
  return (
    <a className={className} href={ctx.links.primary} {...(ext ? { target: '_blank', rel: 'noopener' } : {})}>
      {iconFirst ? glyph : null}
      <span {...(path ? ed(ctx, path) : {})}>{label}</span>
      {iconFirst ? null : glyph}
    </a>
  );
}
