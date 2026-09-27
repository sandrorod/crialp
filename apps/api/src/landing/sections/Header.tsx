import type { RenderContext } from '../context.js';
import { CtaButton } from './CtaButton.js';
import { Icon } from './Icon.js';

export function Header({ ctx, nav }: { ctx: RenderContext; nav: { href: string; label: string }[] }) {
  const cta = ctx.labels.header_cta;
  return (
    <header className="site-header">
      <div className="container">
        <a className="brand" href="#inicio" aria-label={ctx.displayName}>
          {ctx.logo ? <img referrerPolicy="no-referrer" src={ctx.logo.url} alt={ctx.logo.alt} height={44} /> : <span>{ctx.displayName}</span>}
        </a>
        <nav className="nav" aria-label="Seções">
          {nav.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>
        <CtaButton ctx={ctx} label={cta} className="btn btn-primary btn-sm header-cta" icon={false} />
        <details className="menu">
          <summary aria-label="Abrir menu">
            <Icon name="menu" />
          </summary>
          <div className="menu-panel">
            {nav.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
            <CtaButton ctx={ctx} label={cta} className="btn btn-primary btn-sm" icon={false} />
          </div>
        </details>
      </div>
    </header>
  );
}
