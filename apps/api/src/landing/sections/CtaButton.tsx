import type { RenderContext } from '../context.js';
import { Icon } from './Icon.js';

export function CtaButton({ ctx, label, className = 'btn btn-primary', icon = true }: { ctx: RenderContext; label: string; className?: string; icon?: boolean }) {
  const ext = ctx.links.primaryIsExternal;
  return (
    <a className={className} href={ctx.links.primary} {...(ext ? { target: '_blank', rel: 'noopener' } : {})}>
      {label}
      {icon ? <Icon name={ctx.links.whatsapp ? 'message' : 'arrow'} size={18} stroke={2} /> : null}
    </a>
  );
}
