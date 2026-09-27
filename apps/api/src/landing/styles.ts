import type { ResolvedTheme } from './theme.js';

/** CSS da Landing Page: único bloco inline, mobile-first, sem framework e sem JS obrigatório. */
export function landingCss(theme: ResolvedTheme): string {
  const vars = Object.entries(theme.vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  const dark = theme.p.dark;

  return `
:root{${vars};--container:1180px;--gutter:20px;--section-y:clamp(72px,10vw,128px);color-scheme:${dark ? 'dark' : 'light'}}
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;overflow-x:hidden;background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{max-width:100%;display:block}
a{color:inherit}
h1,h2,h3{font-family:var(--font-heading);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking);line-height:var(--heading-lh);text-transform:var(--heading-case);margin:0;text-wrap:balance}
p{margin:0;text-wrap:pretty}
.container{width:100%;max-width:var(--container);margin:0 auto;padding:0 var(--gutter)}
.skip{position:absolute;left:-9999px}.skip:focus{left:16px;top:16px;z-index:100;background:var(--bg);padding:8px 12px}
:focus-visible{outline:2px solid var(--primary-ink);outline-offset:3px;border-radius:4px}
.ico{display:inline-flex;flex:none}

/* Botões */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:14px 26px;border-radius:var(--btn-radius);font:600 16px/1.2 var(--font-body);text-decoration:none;border:1.5px solid transparent;transition:transform .2s ease,box-shadow .2s ease,background-color .2s ease,color .2s ease;cursor:pointer;white-space:nowrap}
.btn-primary{background:var(--primary);color:var(--on-primary);box-shadow:0 1px 0 rgba(255,255,255,.12) inset,0 8px 24px -10px var(--primary)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 14px 30px -12px var(--primary)}
.btn-ghost{border-color:var(--border);color:var(--text);background:transparent}
.btn-ghost:hover{border-color:var(--text)}
.btn .ico{transition:transform .2s ease}.btn:hover .ico{transform:translateX(3px)}
.btn-sm{min-height:42px;padding:10px 18px;font-size:15px}

/* Cabeçalho */
.site-header{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:saturate(1.6) blur(14px);-webkit-backdrop-filter:saturate(1.6) blur(14px);border-bottom:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.site-header .container{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:72px}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;min-width:0}
.brand img{max-height:44px;width:auto;max-width:180px;object-fit:contain}
.brand span{font-family:var(--font-heading);font-weight:var(--heading-weight);text-transform:var(--heading-case);letter-spacing:var(--heading-tracking);font-size:21px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav{display:none;gap:30px;font-size:15px;font-weight:500}
.nav a{text-decoration:none;color:var(--muted);transition:color .2s}.nav a:hover{color:var(--text)}
.header-cta{display:none}
.menu{position:relative}
.menu summary{list-style:none;cursor:pointer;display:grid;place-items:center;width:44px;height:44px;border-radius:10px;border:1px solid var(--border)}
.menu summary::-webkit-details-marker{display:none}
.menu-panel{position:absolute;right:0;top:54px;min-width:230px;background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:10px;box-shadow:0 24px 48px -20px rgba(0,0,0,.35);display:grid}
.menu-panel a{padding:12px 14px;border-radius:8px;text-decoration:none;font-weight:500}
.menu-panel a:hover{background:var(--surface)}
@media(min-width:960px){.nav{display:flex}.header-cta{display:inline-flex}.menu{display:none}}

/* Tipografia de seção */
.eyebrow{display:inline-flex;align-items:center;gap:10px;font:600 13px/1.2 var(--font-body);letter-spacing:.14em;text-transform:uppercase;color:var(--primary-ink);margin-bottom:18px}
.eyebrow::before{content:"";width:22px;height:1.5px;background:currentColor;opacity:.7}
.section{padding:var(--section-y) 0}
.section-alt{background:var(--surface)}
.section-head{max-width:720px;margin-bottom:clamp(40px,6vw,64px)}
.section-head.center{margin-left:auto;margin-right:auto;text-align:center}
.section-head.center .eyebrow::before{display:none}
.section-head h2{font-size:clamp(2rem,1.2rem + 3vw,3.25rem)}
.lead{margin-top:18px;font-size:clamp(1.05rem,1rem + .3vw,1.2rem);color:var(--muted);max-width:640px}
.section-head.center .lead{margin-left:auto;margin-right:auto}

/* Hero */
.hero{position:relative;overflow:hidden;padding:clamp(56px,9vw,120px) 0 clamp(64px,9vw,120px)}
.hero h1{font-size:clamp(2.5rem,1.3rem + 5vw,4.75rem)}
.hero .sub{margin-top:24px;font-size:clamp(1.08rem,1rem + .45vw,1.3rem);color:var(--muted);max-width:600px}
.hero-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}
.hero-actions .btn{flex:1 1 auto}
@media(max-width:559px){.btn{white-space:normal;text-align:center}}
@media(min-width:560px){.hero-actions .btn{flex:0 0 auto}}
.highlights{display:flex;flex-wrap:wrap;gap:10px 22px;margin:40px 0 0;padding:0;list-style:none;font-size:15px;color:var(--muted)}
.highlights li{display:flex;align-items:center;gap:8px}
.highlights .ico{color:var(--primary-ink)}
.hero-split .container{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(40px,6vw,72px);align-items:center}
@media(min-width:960px){.hero-split .container{grid-template-columns:1.15fr .85fr}}
.hero-media{position:relative;border-radius:var(--radius);overflow:hidden;aspect-ratio:4/5;background:var(--surface);box-shadow:0 40px 80px -40px rgba(0,0,0,.35)}
.hero-media img{width:100%;height:100%;object-fit:cover}
.hero-card{position:relative;border-radius:var(--radius);background:var(--band);color:var(--band-text);padding:clamp(28px,4vw,44px);overflow:hidden;box-shadow:0 40px 80px -40px rgba(0,0,0,.45)}
.hero-card::after{content:"";position:absolute;right:-80px;top:-80px;width:240px;height:240px;border-radius:50%;border:1.5px solid var(--band-border);box-shadow:0 0 0 40px color-mix(in srgb,var(--band-border) 35%,transparent)}
.hero-card h3{font-size:24px;margin-bottom:22px;position:relative}
.hero-card ul{list-style:none;margin:0;padding:0;display:grid;gap:18px;position:relative}
.hero-card li{display:flex;gap:14px;align-items:flex-start;font-size:16px}
.hero-card li .ico{color:var(--band-accent);margin-top:2px}
.hero-card small{display:block;color:var(--band-muted);font-size:13px;letter-spacing:.04em;text-transform:uppercase}
.hero-card a{text-decoration:none}
.hero-card .btn{margin-top:28px;width:100%;position:relative}
.hero-centered{text-align:center}
.hero-centered .sub{margin-left:auto;margin-right:auto}
.hero-centered .hero-actions,.hero-centered .highlights{justify-content:center}
.hero-centered h1{max-width:980px;margin:0 auto}
.hero-centered .eyebrow::before{display:none}
.hero-pattern{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(color-mix(in srgb,var(--primary) ${dark ? 28 : 18}%,transparent) 1.2px,transparent 1.2px);background-size:26px 26px;mask-image:radial-gradient(ellipse 70% 60% at 50% 40%,#000 20%,transparent 75%);-webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 40%,#000 20%,transparent 75%)}
.hero-centered .container{position:relative}
.hero-image{min-height:min(88vh,860px);display:flex;align-items:flex-end;color:#fff}
.hero-image .bg{position:absolute;inset:0}
.hero-image .bg img{width:100%;height:100%;object-fit:cover}
.hero-image .bg::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.25) 0%,rgba(0,0,0,.35) 40%,rgba(0,0,0,.78) 100%)}
.hero-image .container{position:relative}
.hero-image .sub,.hero-image .highlights{color:rgba(255,255,255,.86)}
.hero-image .eyebrow,.hero-image .highlights .ico{color:#fff}
.hero-image .btn-ghost{color:#fff;border-color:rgba(255,255,255,.5)}.hero-image .btn-ghost:hover{border-color:#fff}
.hero-image h1{max-width:900px}

/* Sobre */
.about{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(40px,6vw,80px);align-items:center}
@media(min-width:960px){.about{grid-template-columns:1fr 1fr}}
.about-text .section-head{margin-bottom:28px}
.about-text p+p{margin-top:18px}
.about-text p{color:var(--muted);font-size:18px}
.about-media{border-radius:var(--radius);overflow:hidden;aspect-ratio:5/4}
.about-media img{width:100%;height:100%;object-fit:cover}
.facts{display:grid;gap:0;border-top:1px solid var(--border)}
.facts div{display:flex;gap:18px;padding:22px 0;border-bottom:1px solid var(--border);align-items:flex-start}
.facts .ico{color:var(--primary-ink);margin-top:3px}
.facts dt{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.facts dd{margin:4px 0 0;font-weight:500}

/* Serviços */
.grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr))}
.card{position:relative;padding:32px 28px;border-radius:var(--radius);background:var(--bg);border:1px solid var(--border);transition:transform .25s ease,box-shadow .25s ease,border-color .25s}
.section-alt .card{background:var(--bg)}
.card:hover{transform:translateY(-3px);box-shadow:0 24px 48px -28px rgba(0,0,0,.28);border-color:color-mix(in srgb,var(--primary) 35%,var(--border))}
.card .icon-box{width:52px;height:52px;border-radius:calc(var(--radius-sm));display:grid;place-items:center;background:var(--primary-soft);color:var(--primary-ink);margin-bottom:24px}
.card h3{font-size:clamp(1.3rem,1.1rem + .6vw,1.55rem);margin-bottom:12px}
.card p{color:var(--muted);font-size:16px}
.benefit{display:flex;gap:10px;align-items:flex-start;margin-top:20px;padding-top:18px;border-top:1px dashed var(--border);font-size:15px;font-weight:500}
.benefit .ico{color:var(--primary-ink);margin-top:2px}
.rows{border-top:1px solid var(--border)}
.row{display:grid;grid-template-columns:minmax(0,1fr);gap:10px 40px;padding:34px 0;border-bottom:1px solid var(--border)}
@media(min-width:860px){.row{grid-template-columns:90px 1fr 1.2fr;align-items:baseline}}
.row .num{font-family:var(--font-heading);font-size:22px;color:var(--accent-ink)}
.row h3{font-size:clamp(1.45rem,1.2rem + .8vw,1.9rem)}
.row p{color:var(--muted)}
.row .benefit{border:0;padding:0;margin-top:12px}

/* Diferenciais */
.band{background:var(--band);color:var(--band-text)}
.band .eyebrow{color:var(--band-accent)}
.band .lead{color:var(--band-muted)}
.diff-grid{display:grid;gap:0;background:var(--band);border:1px solid var(--band-border);border-radius:var(--radius);overflow:hidden;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.diff{background:var(--band);padding:clamp(28px,4vw,40px);box-shadow:0 0 0 .5px var(--band-border)}
.diff .ico{color:var(--band-accent)}
.diff h3{font-size:clamp(1.25rem,1.1rem + .5vw,1.5rem);margin:20px 0 10px}
.diff p{color:var(--band-muted);font-size:16px}

/* Produtos */
.product ul{list-style:none;padding:0;margin:18px 0 0;display:grid;gap:8px}
.product li{display:flex;gap:10px;font-size:15px;color:var(--muted)}
.product li .ico{color:var(--primary-ink);margin-top:3px}

/* Galeria */
.gallery{display:grid;gap:12px;grid-template-columns:repeat(2,1fr)}
@media(min-width:860px){.gallery{grid-template-columns:repeat(4,1fr);grid-auto-rows:240px}.gallery figure:first-child{grid-column:span 2;grid-row:span 2}}
.gallery figure{margin:0;border-radius:var(--radius-sm);overflow:hidden;background:var(--surface);aspect-ratio:1}
@media(min-width:860px){.gallery figure{aspect-ratio:auto}}
.gallery img{width:100%;height:100%;object-fit:cover;transition:transform .6s ease}
.gallery figure:hover img{transform:scale(1.04)}

/* Depoimentos */
.quotes{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}
.quote{margin:0;padding:34px 30px;border-radius:var(--radius);background:var(--bg);border:1px solid var(--border);display:flex;flex-direction:column}
.quote::before{content:"\\201C";font-family:var(--font-heading);font-size:64px;line-height:.6;color:var(--primary-ink);height:28px}
.quote p{font-size:17px;flex:1}
.quote footer{margin-top:22px;font-weight:600;font-size:15px}

/* FAQ */
.faq{max-width:860px;margin:0 auto;border-top:1px solid var(--border)}
.faq details{border-bottom:1px solid var(--border)}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:24px;align-items:center;padding:26px 0;font-weight:600;font-size:clamp(1.05rem,1rem + .3vw,1.2rem)}
.faq summary::-webkit-details-marker{display:none}
.faq summary .ico{transition:transform .25s ease;color:var(--primary-ink)}
.faq details[open] summary .ico{transform:rotate(45deg)}
.faq details p{padding:0 48px 26px 0;color:var(--muted)}

/* Contato */
.contact{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(36px,5vw,72px)}
@media(min-width:960px){.contact{grid-template-columns:1fr 1fr;align-items:start}}
.contact-list{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.contact-list a,.contact-list div{display:flex;gap:16px;align-items:flex-start;padding:20px 22px;border-radius:var(--radius-sm);border:1px solid var(--border);text-decoration:none;background:var(--bg);transition:border-color .2s}
.contact-list a:hover{border-color:var(--primary-ink)}
.contact-list .ico{color:var(--primary-ink);margin-top:2px}
.contact-list small{display:block;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
.contact-list strong{font-weight:600;word-break:break-word;white-space:pre-line}
.socials{display:flex;gap:10px;margin-top:28px;flex-wrap:wrap}
.socials a{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--border);transition:background .2s,color .2s,border-color .2s}
.socials a:hover{background:var(--primary);color:var(--on-primary);border-color:var(--primary)}

/* CTA final */
.final{background:var(--primary);color:var(--on-primary);text-align:center;position:relative;overflow:hidden}
.final::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 20% 0%,rgba(255,255,255,.14),transparent 45%);pointer-events:none}
.final .container{position:relative;max-width:900px}
.final h2{font-size:clamp(2.1rem,1.3rem + 3.4vw,3.6rem)}
.final p{margin:20px auto 0;font-size:clamp(1.05rem,1rem + .35vw,1.25rem);opacity:.86;max-width:640px}
.final .btn{margin-top:36px;background:var(--on-primary);color:var(--primary);box-shadow:0 18px 40px -18px rgba(0,0,0,.45)}
.final .btn:hover{transform:translateY(-2px)}

/* Rodapé */
.site-footer{padding:40px 0 calc(40px + env(safe-area-inset-bottom));font-size:14px;color:var(--muted);border-top:1px solid var(--border)}
.site-footer .container{display:flex;flex-wrap:wrap;gap:12px 24px;justify-content:space-between}

/* WhatsApp flutuante */
.wa-float{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:50;width:60px;height:60px;border-radius:50%;display:grid;place-items:center;background:#25d366;color:#fff;box-shadow:0 14px 30px -10px rgba(0,0,0,.45);transition:transform .2s}
.wa-float:hover{transform:scale(1.06)}

/* Animações discretas (somente com JS ativo e sem preferência por movimento reduzido) */
.js .reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
.js .reveal.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.js .reveal{opacity:1;transform:none;transition:none}*{transition:none!important}}
`.replace(/\n\s*/g, '');
}

export const REVEAL_SCRIPT = `document.documentElement.classList.add('js');addEventListener('DOMContentLoaded',function(){var e=document.querySelectorAll('.reveal');if(!('IntersectionObserver'in window)){e.forEach(function(n){n.classList.add('in')});return}var o=new IntersectionObserver(function(t){t.forEach(function(n){if(n.isIntersecting){n.target.classList.add('in');o.unobserve(n.target)}})},{rootMargin:'0px 0px -8% 0px'});e.forEach(function(n){o.observe(n)})});`;
