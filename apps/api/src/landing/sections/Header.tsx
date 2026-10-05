import type { RenderContext } from '../context.js';
import { cad, ed } from '../context.js';
import { CtaButton } from './CtaButton.js';
import { Icon } from './Icon.js';

export function Header({ ctx, nav }: { ctx: RenderContext; nav: { href: string; label: string; key: string }[] }) {
  const cta = ctx.labels.header_cta;
  const showLogo = !!ctx.logo && ctx.theme.logoPlacement === 'header' && ctx.theme.brand !== 'name';
  const name = cad(ctx, 'company.name', ctx.displayName);
  return (
    <header className="site-header">
      <div className="container">
        <a className="brand" href="#inicio" aria-label={ctx.displayName}>
          {/* Logotipo e/ou nome, como escolhido no editor (sem logotipo, sempre o nome) */}
          {showLogo ? <img referrerPolicy="no-referrer" src={ctx.logo!.url} alt={ctx.logo!.alt} height={44} /> : null}
          {!showLogo || ctx.theme.brand === 'both' ? <span {...name.attrs}>{name.text}</span> : null}
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
