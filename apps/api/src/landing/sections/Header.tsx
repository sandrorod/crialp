import type { RenderContext } from '../context.js';
import { cad, ed } from '../context.js';
import { CtaButton } from './CtaButton.js';
import { Icon } from './Icon.js';

export function Header({ ctx, nav }: { ctx: RenderContext; nav: { href: string; label: string; key: string }[] }) {
  const cta = ctx.labels.header_cta;
  return (
    <header className="site-header">
      <div className="container">
        <a className="brand" href="#inicio" aria-label={ctx.displayName}>
          {ctx.logo ? <img referrerPolicy="no-referrer" src={ctx.logo.url} alt={ctx.logo.alt} height={44} /> : <span {...cad(ctx, 'company.name', ctx.displayName).attrs}>{cad(ctx, 'company.name', ctx.displayName).text}</span>}
        </a>
        <nav className="nav" aria-label="Seções">
          {nav.map((n) => (
            <a key={n.href} href={n.href} {...ed(ctx, `labels.${n.key}`)}>
              {n.label}
            </a>
          ))}
        </nav>
        <CtaButton ctx={ctx} label={cta} path="labels.header_cta" className="btn btn-primary btn-sm header-cta" icon={false} />
        <details className="menu">
          <summary aria-label="Abrir menu">
            <Icon name="menu" />
          </summary>
          <div className="menu-panel">
            {nav.map((n) => (
              <a key={n.href} href={n.href} {...ed(ctx, `labels.${n.key}`)}>
                {n.label}
              </a>
            ))}
            <CtaButton ctx={ctx} label={cta} path="labels.header_cta" className="btn btn-primary btn-sm" icon={false} />
          </div>
        </details>
      </div>
    </header>
  );
}
