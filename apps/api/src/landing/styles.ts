import type { ResolvedTheme } from './theme.js';

/** CSS da Landing Page: único bloco inline, mobile-first, sem framework e sem JS obrigatório. */
export function landingCss(theme: ResolvedTheme): string {
  const vars = Object.entries(theme.vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  const dark = theme.p.dark;

  return `
:root{${vars};--container:1180px;--gutter:20px;--section-y:clamp(72px,10vw,128px);--section-y-scale:.85;--title-scale:.9;color-scheme:${dark ? 'dark' : 'light'}}
/* Títulos 10% menores em todos os modelos: no computador (acima) e no celular */
@media(max-width:767px){:root{--title-scale:.9}}
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
/* Margem interna superior/inferior das seções: 15% menor em todos os modelos */
.section{padding:calc(var(--section-y) * var(--section-y-scale)) 0}
.section-alt{background:var(--surface)}
.section-head{max-width:720px;margin-bottom:clamp(40px,6vw,64px)}
.section-head.center{margin-left:auto;margin-right:auto;text-align:center}
.section-head.center .eyebrow::before{display:none}
.section-head h2{font-size:calc((clamp(2rem,1.2rem + 3vw,3.25rem)) * var(--title-scale))}
.lead{margin-top:18px;font-size:clamp(1.05rem,1rem + .3vw,1.2rem);color:var(--muted);max-width:640px}
.section-head.center .lead{margin-left:auto;margin-right:auto}

/* Hero */
/* Topo: metade do espaço até a barra superior e até a seção seguinte */
.hero{position:relative;overflow:hidden;padding:calc(clamp(56px,9vw,120px) * var(--section-y-scale) * .5) 0 calc(clamp(64px,9vw,120px) * var(--section-y-scale) * .5)}
.hero h1{font-size:calc((clamp(2.5rem,1.3rem + 5vw,4.75rem)) * var(--title-scale))}
.hero .sub{margin-top:24px;font-size:clamp(1.08rem,1rem + .45vw,1.3rem);color:var(--muted);max-width:600px}
.hero-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}
.hero-actions .btn{flex:1 1 auto}
@media(max-width:559px){.btn{white-space:normal;text-align:center}}
@media(min-width:560px){.hero-actions .btn{flex:0 0 auto}}
.highlights{display:flex;flex-wrap:wrap;gap:10px 22px;margin:40px 0 0;padding:0;list-style:none;font-size:15px;color:var(--muted)}
.highlights li{display:flex;align-items:center;gap:8px}
.highlights .ico{color:var(--primary-ink)}
.hero-split .container{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(40px,6vw,72px);align-items:start}
@media(min-width:960px){.hero-split .container{grid-template-columns:1.15fr .85fr}}
.hero-media{position:relative;border-radius:var(--radius);overflow:hidden;aspect-ratio:4/5;background:var(--surface);box-shadow:0 40px 80px -40px rgba(0,0,0,.35)}
.hero-media img{width:100%;height:100%;object-fit:cover}
.hero-card{position:relative;border-radius:var(--radius);background:var(--band);color:var(--band-text);padding:clamp(28px,4vw,44px);overflow:hidden;box-shadow:0 40px 80px -40px rgba(0,0,0,.45)}
.hero-card::after{content:"";position:absolute;right:-80px;top:-80px;width:240px;height:240px;border-radius:50%;border:1.5px solid var(--band-border);box-shadow:0 0 0 40px color-mix(in srgb,var(--band-border) 35%,transparent)}
.hero-card h3{font-size:calc((24px) * var(--title-scale));margin-bottom:22px;position:relative}
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
.card h3{font-size:calc((clamp(1.3rem,1.1rem + .6vw,1.55rem)) * var(--title-scale));margin-bottom:12px}
.card p{color:var(--muted);font-size:16px}
.benefit{display:flex;gap:10px;align-items:flex-start;margin-top:20px;padding-top:18px;border-top:1px dashed var(--border);font-size:15px;font-weight:500}
.benefit .ico{color:var(--primary-ink);margin-top:2px}
.rows{border-top:1px solid var(--border)}
.row{display:grid;grid-template-columns:minmax(0,1fr);gap:10px 40px;padding:34px 0;border-bottom:1px solid var(--border)}
@media(min-width:860px){.row{grid-template-columns:90px 1fr 1.2fr;align-items:baseline}}
.row .num{font-family:var(--font-heading);font-size:22px;color:var(--accent-ink)}
.row h3{font-size:calc((clamp(1.45rem,1.2rem + .8vw,1.9rem)) * var(--title-scale))}
.row p{color:var(--muted)}
.row .benefit{border:0;padding:0;margin-top:12px}

/* Diferenciais */
.band{background:var(--band);color:var(--band-text)}
.band .eyebrow{color:var(--band-accent)}
.band .lead{color:var(--band-muted)}
.diff-grid{display:grid;gap:0;background:var(--band);border:1px solid var(--band-border);border-radius:var(--radius);overflow:hidden;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.diff{background:var(--band);padding:clamp(28px,4vw,40px);box-shadow:0 0 0 .5px var(--band-border)}
.diff .ico{color:var(--band-accent)}
.diff h3{font-size:calc((clamp(1.25rem,1.1rem + .5vw,1.5rem)) * var(--title-scale));margin:20px 0 10px}
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
.gallery figure:hover img:not([style*=scale]){transform:scale(1.04)}

/* Depoimentos */
.quotes{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}
.quote{margin:0;padding:34px 30px;border-radius:var(--radius);background:var(--bg);border:1px solid var(--border);display:flex;flex-direction:column}
.quote::before{content:"\\201C";font-family:var(--font-heading);font-size:64px;line-height:.6;color:var(--primary-ink);height:28px}
.quote p{font-size:17px;flex:1}
.quote footer{margin-top:22px;font-weight:600;font-size:15px}
.quote-more{flex:1}
.quote-more summary{list-style:none;cursor:pointer}
.quote-more summary::-webkit-details-marker{display:none}
.quote-more[open] summary{display:none}
.quote-more-link{font-weight:600;color:var(--primary-ink);text-decoration:underline;text-underline-offset:3px;white-space:nowrap}

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
.final h2{font-size:calc((clamp(2.1rem,1.3rem + 3.4vw,3.6rem)) * var(--title-scale))}
.final p{margin:20px auto 0;font-size:clamp(1.05rem,1rem + .35vw,1.25rem);opacity:.86;max-width:640px}
.final .btn{margin-top:36px;background:var(--on-primary);color:var(--primary);box-shadow:0 18px 40px -18px rgba(0,0,0,.45)}
.final .btn:hover{transform:translateY(-2px)}

/* Seções personalizadas */
.custom-text{max-width:760px;display:grid;gap:18px;color:var(--muted);font-size:18px;white-space:pre-line}
.custom-list{list-style:none;margin:32px 0 0;padding:0;display:grid;gap:14px 32px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.custom-list li{display:flex;gap:12px;align-items:flex-start;padding:16px 18px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg)}
.custom-list .ico{color:var(--primary-ink);margin-top:3px}

/* Rodapé */
.site-footer{padding:calc(40px * var(--section-y-scale)) 0 calc(40px * var(--section-y-scale) + env(safe-area-inset-bottom));font-size:14px;color:var(--muted);border-top:1px solid var(--border)}
.site-footer .container{display:flex;flex-wrap:wrap;gap:12px 24px;justify-content:space-between}

/* WhatsApp flutuante */
.wa-float{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:50;width:60px;height:60px;border-radius:50%;display:grid;place-items:center;background:#25d366;color:#fff;box-shadow:0 14px 30px -10px rgba(0,0,0,.45);transition:transform .2s}
.wa-float:hover{transform:scale(1.06)}

/* ─── Modelos de layout (classe no body); "Clássico" usa o estilo base ─── */
/* Títulos de seção centralizados (não afeta títulos dentro de colunas, como "Sobre" e "Contato") */
.tpl-moderno .section>.container>.section-head,.tpl-elegante .section>.container>.section-head{margin-left:auto;margin-right:auto;text-align:center}
.tpl-moderno .section>.container>.section-head .lead,.tpl-elegante .section>.container>.section-head .lead{margin-left:auto;margin-right:auto}
.tpl-moderno .section>.container>.section-head .eyebrow::before{display:none}

/* Moderno: cartões flutuantes, cantos mais arredondados, galeria sem vãos */
.tpl-moderno .card,.tpl-moderno .quote{border-color:transparent;box-shadow:0 18px 40px -24px rgba(0,0,0,.28)}
.tpl-moderno .section-alt .card,.tpl-moderno .section-alt .quote{background:var(--bg)}
.tpl-moderno .card .icon-box{border-radius:50%}
.tpl-moderno .about-media,.tpl-moderno .hero-media{border-radius:calc(var(--radius) + 12px)}
.tpl-moderno .gallery{gap:6px}
.tpl-moderno .diff-grid{gap:16px;background:transparent;border:0;border-radius:0;overflow:visible}
.tpl-moderno .diff{border-radius:var(--radius);box-shadow:none;background:color-mix(in srgb,var(--band-text) 7%,var(--band))}

/* Minimalista: sem faixas de fundo, linhas finas, sem sombras e sem padrão no topo */
.tpl-minimalista{--section-y:clamp(64px,8vw,112px)}
.tpl-minimalista .section-alt{background:transparent}
.tpl-minimalista .section+.section,.tpl-minimalista [data-section]:not([data-section="hero"])+[data-section] .section{border-top:1px solid var(--border)}
.tpl-minimalista .hero-pattern{display:none}
.tpl-minimalista .hero h1{font-size:calc((clamp(2.3rem,1.3rem + 4vw,4rem)) * var(--title-scale))}
.tpl-minimalista .card,.tpl-minimalista .quote{box-shadow:none;background:transparent}
.tpl-minimalista .card:hover{transform:none;box-shadow:none}
.tpl-minimalista .hero-media,.tpl-minimalista .hero-card{box-shadow:none}
.tpl-minimalista .btn-primary{box-shadow:none}
.tpl-minimalista .eyebrow::before{display:none}
.tpl-minimalista .band{background:var(--surface);color:var(--text)}
.tpl-minimalista .band .eyebrow{color:var(--primary-ink)}.tpl-minimalista .band .lead,.tpl-minimalista .diff p{color:var(--muted)}
.tpl-minimalista .diff-grid,.tpl-minimalista .diff{background:transparent;border-color:var(--border);box-shadow:0 0 0 .5px var(--border)}
.tpl-minimalista .diff .ico{color:var(--primary-ink)}

/* Elegante: molduras finas, eyebrow com traços dos dois lados, depoimentos em destaque */
.tpl-elegante{--container:1080px;--section-y:clamp(84px,11vw,144px)}
.tpl-elegante .band{background:var(--surface);color:var(--text)}
.tpl-elegante .band .eyebrow{color:var(--primary-ink)}.tpl-elegante .band .lead,.tpl-elegante .diff p{color:var(--muted)}
.tpl-elegante .diff-grid,.tpl-elegante .diff{background:transparent;border-color:var(--border);box-shadow:0 0 0 .5px var(--border)}
.tpl-elegante .diff{text-align:center}.tpl-elegante .diff .ico{color:var(--primary-ink);justify-content:center;width:100%}
.tpl-elegante .section>.container>.section-head .eyebrow::after{content:"";width:22px;height:1.5px;background:currentColor;opacity:.7}
.tpl-elegante .eyebrow{letter-spacing:.22em}
.tpl-elegante .hero-media,.tpl-elegante .about-media{padding:10px;background:var(--bg);border:1px solid var(--border);box-shadow:none}
.tpl-elegante .hero-media img,.tpl-elegante .about-media img{border-radius:calc(var(--radius) * .7)}
.tpl-elegante .quote{text-align:center;align-items:center;border:0;background:transparent}
.tpl-elegante .quote p{font-family:var(--font-heading);font-size:clamp(1.2rem,1.05rem + .6vw,1.5rem);font-style:italic;line-height:1.5}
.tpl-elegante .card{box-shadow:none}
.tpl-elegante .final{background:var(--band);color:var(--band-text)}
.tpl-elegante .final .btn{background:var(--primary);color:var(--on-primary)}

/* Impacto: topo em faixa escura, títulos grandes, cartões com borda de destaque */
.tpl-impacto .hero-centered,.tpl-impacto .hero-split{background:var(--band);color:var(--band-text)}
.tpl-impacto .hero-centered .sub,.tpl-impacto .hero-split .sub,.tpl-impacto .hero-centered .highlights,.tpl-impacto .hero-split .highlights{color:var(--band-muted)}
.tpl-impacto .hero-centered .eyebrow,.tpl-impacto .hero-split .eyebrow,.tpl-impacto .hero .highlights .ico{color:var(--band-accent)}
.tpl-impacto .hero-centered .btn-ghost,.tpl-impacto .hero-split .btn-ghost{color:var(--band-text);border-color:var(--band-border)}
.tpl-impacto .hero-pattern{background-image:radial-gradient(color-mix(in srgb,var(--band-accent) 30%,transparent) 1.2px,transparent 1.2px)}
.tpl-impacto .hero h1{font-size:calc((clamp(2.8rem,1.3rem + 6.2vw,5.75rem)) * var(--title-scale));letter-spacing:-.03em}
.tpl-impacto .section-head h2{font-size:calc((clamp(2.3rem,1.3rem + 3.8vw,3.9rem)) * var(--title-scale))}
.tpl-impacto .card{border-top:4px solid var(--primary);box-shadow:0 20px 44px -30px rgba(0,0,0,.35)}
.tpl-impacto .section-alt{background:var(--primary-soft)}
.tpl-impacto .btn{min-height:56px;font-weight:700}
.tpl-impacto .row .num{font-size:34px;color:var(--primary-ink)}

/* ─── Estrutura própria de cada modelo (vale mesmo com cores personalizadas por seção) ─── */
/* Moderno: foto antes do texto (topo e "Sobre"), fotos quadradas bem arredondadas, cartões centralizados, galeria em 3 colunas iguais */
.tpl-moderno .hero-split .container>.hero-media,.tpl-moderno .about>.about-media{order:-1}
@media(min-width:960px){.tpl-moderno .hero-split .container{grid-template-columns:.95fr 1.05fr}}
.tpl-moderno .hero-media{aspect-ratio:1;border-radius:36px}
.tpl-moderno .about-media{aspect-ratio:1;border-radius:36px}
.tpl-moderno .card{text-align:center;border-radius:24px}
.tpl-moderno .card .icon-box{margin-left:auto;margin-right:auto;width:64px;height:64px}
.tpl-moderno .card .benefit{justify-content:center;text-align:left}
.tpl-moderno .gallery figure{border-radius:22px}
@media(min-width:860px){.tpl-moderno .gallery{grid-template-columns:repeat(3,1fr);grid-auto-rows:300px;gap:14px}.tpl-moderno .gallery figure:first-child{grid-column:auto;grid-row:auto}}
.tpl-moderno .quote{border-radius:24px}

/* Minimalista: topo em coluna única com foto larga embaixo, "Sobre" com foto larga em cima e texto em duas colunas, galeria em 2 colunas */
.tpl-minimalista .hero-split .container{grid-template-columns:minmax(0,1fr);gap:clamp(36px,5vw,56px)}
.tpl-minimalista .hero-split h1{max-width:920px}
.tpl-minimalista .hero-media,.tpl-minimalista .about-media{aspect-ratio:21/9;border-radius:0;box-shadow:none}
@media(max-width:767px){.tpl-minimalista .hero-media,.tpl-minimalista .about-media{aspect-ratio:4/3}}
.tpl-minimalista .hero-card{max-width:560px}
.tpl-minimalista .about{grid-template-columns:minmax(0,1fr)}
.tpl-minimalista .about>.about-media{order:-1}
@media(min-width:960px){.tpl-minimalista .about-text>.reveal:not(.section-head){columns:2;column-gap:56px}.tpl-minimalista .about-text p{break-inside:avoid}}
.tpl-minimalista .gallery{grid-template-columns:minmax(0,1fr);gap:20px}
.tpl-minimalista .gallery figure{border-radius:0;aspect-ratio:3/2}
@media(min-width:860px){.tpl-minimalista .gallery{grid-template-columns:repeat(2,1fr);grid-auto-rows:auto;gap:28px}.tpl-minimalista .gallery figure:first-child{grid-column:auto;grid-row:auto}.tpl-minimalista .gallery figure{aspect-ratio:3/2}}
.tpl-minimalista .quote{border:0;border-top:1px solid var(--border);border-radius:0;padding:28px 0 0}

/* Elegante: topo centralizado com foto emoldurada larga embaixo, "Sobre" com foto em retrato à esquerda, galeria emoldurada em 3 colunas */
.tpl-elegante .hero-split .container{grid-template-columns:minmax(0,1fr);justify-items:center;text-align:center;gap:clamp(40px,5vw,64px)}
.tpl-elegante .hero-split h1{max-width:900px;margin:0 auto}
.tpl-elegante .hero-split .sub{margin-left:auto;margin-right:auto}
.tpl-elegante .hero-split .hero-actions,.tpl-elegante .hero-split .highlights{justify-content:center}
.tpl-elegante .hero-split .eyebrow::before{display:none}
.tpl-elegante .hero-split .hero-media{width:100%;max-width:980px;aspect-ratio:16/9}
@media(max-width:767px){.tpl-elegante .hero-split .hero-media{aspect-ratio:4/3}}
.tpl-elegante .hero-split .hero-card{width:100%;max-width:520px;text-align:left}
.tpl-elegante .about>.about-media{order:-1;aspect-ratio:4/5}
@media(min-width:960px){.tpl-elegante .about{grid-template-columns:.85fr 1.15fr}}
.tpl-elegante .gallery figure{padding:8px;border:1px solid var(--border);background:var(--bg);border-radius:calc(var(--radius-sm) * .8)}
.tpl-elegante .gallery img{border-radius:calc(var(--radius-sm) * .5)}
@media(min-width:860px){.tpl-elegante .gallery{grid-template-columns:repeat(3,1fr);grid-auto-rows:auto;gap:26px}.tpl-elegante .gallery figure:first-child{grid-column:auto;grid-row:auto}.tpl-elegante .gallery figure{aspect-ratio:4/5}}

/* Impacto: topo alto ocupando a tela, fotos com bloco de cor deslocado, serviços numerados, galeria com a 1ª foto em faixa larga */
.tpl-impacto .hero{display:flex;align-items:flex-start}
.tpl-impacto .hero>.container{width:100%}
.tpl-impacto .hero-media,.tpl-impacto .about-media{border-radius:0;box-shadow:18px 18px 0 var(--primary);margin:0 18px 18px 0}
.tpl-impacto .grid{counter-reset:svc}
.tpl-impacto .card{counter-increment:svc;padding-top:44px}
.tpl-impacto .card::after{content:counter(svc,decimal-leading-zero);position:absolute;top:16px;right:22px;font:800 46px/1 var(--font-heading);color:color-mix(in srgb,var(--primary) 22%,transparent)}
.tpl-impacto .gallery figure:first-child{grid-column:1/-1;aspect-ratio:16/9}
@media(min-width:860px){.tpl-impacto .gallery{grid-template-columns:repeat(3,1fr);grid-auto-rows:240px}.tpl-impacto .gallery figure:first-child{grid-column:1/-1;grid-row:span 2;aspect-ratio:auto}}
.tpl-impacto .final h2{font-size:calc((clamp(2.4rem,1.3rem + 4.4vw,4.4rem)) * var(--title-scale))}

/* Computador: título principal com 66px por padrão em todos os modelos */
@media(min-width:768px){:root .hero h1{font-size:calc(66px * var(--title-scale))}}

/* Animações discretas (somente com JS ativo e sem preferência por movimento reduzido) */
.js .reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
.js .reveal.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.js .reveal{opacity:1;transform:none;transition:none}*{transition:none!important}}
`.replace(/\n\s*/g, '');
}

export const REVEAL_SCRIPT = `document.documentElement.classList.add('js');addEventListener('DOMContentLoaded',function(){var e=document.querySelectorAll('.reveal');if(!('IntersectionObserver'in window)){e.forEach(function(n){n.classList.add('in')});return}var o=new IntersectionObserver(function(t){t.forEach(function(n){if(n.isIntersecting){n.target.classList.add('in');o.unobserve(n.target)}})},{rootMargin:'0px 0px -8% 0px'});e.forEach(function(n){o.observe(n)})});`;
