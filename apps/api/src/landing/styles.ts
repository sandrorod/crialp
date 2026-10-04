import type { ResolvedTheme } from './theme.js';

/** CSS da Landing Page: único bloco inline, mobile-first, sem framework e sem JS obrigatório. */
export function landingCss(theme: ResolvedTheme): string {
  const vars = Object.entries(theme.vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  const dark = theme.p.dark;

  return `
:root{${vars};--container:1180px;--gutter:20px;--section-y:clamp(72px,10vw,128px);--section-y-scale:.85;--title-scale:.9;--hero-scale:.9;color-scheme:${dark ? 'dark' : 'light'}}
/* Títulos 10% menores em todos os modelos: no computador (acima) e no celular */
@media(max-width:767px){:root{--title-scale:.9}}
*,*::before,*::after{box-sizing:border-box}
/* Links do menu (#secao): a seção começa logo abaixo da barra fixa do topo (--header-h vem do script);
   o espaço acima do título é a própria margem interna da seção */
html{scroll-behavior:smooth;scroll-padding-top:var(--header-h,76px);-webkit-text-size-adjust:100%}
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
.body-logo{display:block;width:auto;height:auto;max-width:min(260px,70%);max-height:110px;object-fit:contain;margin:0 0 22px}
.hero-centered .body-logo{margin-left:auto;margin-right:auto}
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
/* Seções (todas menos o topo): margem interna de cima e de baixo com 50% da original, no computador e no celular */
.section{padding:calc(var(--section-y) * var(--section-y-scale) * .5) 0}
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
.hero h1{font-size:calc((clamp(2.5rem,1.3rem + 5vw,4.75rem)) * var(--title-scale) * var(--hero-scale))}
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
.card .icon-box{width:52px;height:52px;border-radius:calc(var(--radius-sm));display:grid;place-items:center;background:var(--primary-soft);color:var(--primary-ink);margin-bottom:10px}
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
.diff h3{font-size:calc((clamp(1.25rem,1.1rem + .5vw,1.5rem)) * var(--title-scale));margin:8px 0 10px}
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
.quote-more{flex:1;position:relative}
.quote-more-toggle{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.quote-more-full,.quote-more-toggle:checked~.quote-more-short{display:none}
.quote-more-toggle:checked~.quote-more-full{display:block}
.quote-more-link{font-weight:600;color:var(--primary-ink);text-decoration:underline;text-underline-offset:3px;white-space:nowrap;cursor:pointer}
.quote-more-toggle:focus-visible~p .quote-more-link{outline:2px solid var(--primary);outline-offset:2px;border-radius:2px}

/* FAQ */
.faq{max-width:860px;margin:0 auto;border-top:1px solid var(--border)}
.faq details{border-bottom:1px solid var(--border)}
.faq summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:24px;align-items:center;padding:13px 0;font-weight:600;font-size:clamp(1.05rem,1rem + .3vw,1.2rem)}
.faq summary::-webkit-details-marker{display:none}
.faq summary .ico{transition:transform .25s ease;color:var(--primary-ink)}
.faq details[open] summary .ico{transform:rotate(45deg)}
/* Dúvidas: pergunta → resposta 10px (−60%); entre perguntas 13px + 13px (−50%) */
.faq details[open] summary{padding-bottom:10px}
.faq details p{padding:0 48px 13px 0;color:var(--muted)}

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
.custom-center .custom-text{margin-left:auto;margin-right:auto;text-align:center}
.blocks{display:flex;flex-wrap:wrap;gap:28px;margin-top:32px;align-items:flex-start}
.custom-center .blocks{justify-content:center;text-align:center}
.section-head+.blocks{margin-top:0}
.blk{flex:1 1 100%;min-width:0}
.blk.w-half{flex:0 1 calc(50% - 14px)}
.blk.w-third{flex:0 1 calc(33.333% - 18.67px)}
@media(max-width:767px){.blk.w-half,.blk.w-third{flex-basis:100%}}
.blk-heading h3{font-size:calc((clamp(1.4rem,1.15rem + 1vw,2rem)) * var(--title-scale))}
.blk-text p{margin:0;color:var(--muted);font-size:18px;white-space:pre-line}
.blk-image figure{margin:0}
.blk-image img{display:block;width:100%;height:auto;border-radius:var(--radius)}
.blk-image figcaption{margin-top:10px;font-size:14px;color:var(--muted)}
.blk-img-empty{display:grid;place-items:center;min-height:180px;border:2px dashed var(--border);border-radius:var(--radius);color:var(--muted);font-size:14px}
.blk-icon .card{height:100%}
.custom-center .blk-icon .icon-box{margin-left:auto;margin-right:auto}
.blk-icon p{margin:0;color:var(--muted)}
.blk-divider hr{border:0;border-top:1px solid var(--border);margin:8px 0}

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
.tpl-minimalista .hero h1{font-size:calc((clamp(2.3rem,1.3rem + 4vw,4rem)) * var(--title-scale) * var(--hero-scale))}
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
.tpl-impacto .hero h1{font-size:calc((clamp(2.8rem,1.3rem + 6.2vw,5.75rem)) * var(--title-scale) * var(--hero-scale));letter-spacing:-.03em}
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

/* ─── Revista: editorial, fios pretos, capitular, colunas e mosaico ─── */
.tpl-revista{--radius:0px;--radius-sm:0px;--btn-radius:0px}
.tpl-revista .site-header{background:var(--bg);border-bottom:3px solid var(--text)}
.tpl-revista .hero{border-bottom:3px solid var(--text)}
.tpl-revista .hero-pattern{display:none}
.tpl-revista .eyebrow::before{display:none}
.tpl-revista .hero .eyebrow{display:flex;color:var(--text);border-top:1px solid var(--text);padding-top:10px}
.tpl-revista .hero h1{letter-spacing:-.035em;line-height:1}
.tpl-revista .hero-split .container{align-items:end}
@media(min-width:960px){.tpl-revista .hero-split .container{grid-template-columns:.8fr 1.2fr}}
.tpl-revista .hero-split .container>.hero-media{order:-1;aspect-ratio:3/4;box-shadow:none}
.tpl-revista .hero-card{box-shadow:none;border:3px solid var(--text);background:var(--bg);color:var(--text)}
.tpl-revista .hero-card::after{display:none}
.tpl-revista .hero-card small{color:var(--muted)}.tpl-revista .hero-card li .ico{color:var(--primary-ink)}
.tpl-revista .section-alt{background:transparent}
.tpl-revista .section+.section,.tpl-revista [data-section]:not([data-section="hero"])+[data-section] .section{border-top:1px solid var(--border)}
.tpl-revista .section>.container>.section-head{max-width:none;text-align:left;border-top:3px solid var(--text);padding-top:18px}
@media(min-width:960px){.tpl-revista .section>.container>.section-head{display:grid;grid-template-columns:220px minmax(0,1fr);column-gap:40px;align-items:start}.tpl-revista .section>.container>.section-head .eyebrow{grid-row:span 2;margin:10px 0 0}.tpl-revista .section>.container>.section-head .lead{grid-column:2;margin-left:0}}
.tpl-revista .about-text>.reveal:not(.section-head)>p:first-child::first-letter{float:left;font:700 4.4em/.82 var(--font-heading);margin:6px 12px 0 0;color:var(--primary-ink)}
.tpl-revista .about-media{aspect-ratio:4/5}
.tpl-revista .grid{gap:32px 40px}
.tpl-revista .card{border:0;border-top:2px solid var(--text);background:transparent!important;padding:24px 0 0;box-shadow:none}
.tpl-revista .card:hover{transform:none;box-shadow:none;border-color:var(--primary-ink)}
.tpl-revista .card .icon-box{width:auto;height:auto;background:transparent;place-items:start;margin-bottom:6px}
.tpl-revista .rows{border-top:2px solid var(--text)}
.tpl-revista .band{background:var(--bg);color:var(--text);border-top:3px solid var(--text);border-bottom:3px solid var(--text)}
.tpl-revista .band .eyebrow{color:var(--text)}.tpl-revista .band .lead,.tpl-revista .diff p{color:var(--muted)}
.tpl-revista .diff-grid{background:transparent;border:0;gap:0 40px}
.tpl-revista .diff{background:transparent;box-shadow:none;padding:24px 0;border-top:1px solid var(--border)}
.tpl-revista .diff .ico{color:var(--primary-ink)}
.tpl-revista .gallery{display:block;columns:2;column-gap:14px}
@media(min-width:860px){.tpl-revista .gallery{columns:3;column-gap:20px}}
.tpl-revista .gallery figure{break-inside:avoid;margin:0 0 14px;aspect-ratio:auto!important}
.tpl-revista .gallery img{height:auto}
.tpl-revista .quotes{gap:32px 48px}
.tpl-revista .quote{border:0;border-left:3px solid var(--primary);background:transparent;padding:4px 0 4px 24px}
.tpl-revista .quote::before{display:none}
.tpl-revista .quote p{font-family:var(--font-heading);font-size:clamp(1.15rem,1rem + .5vw,1.4rem);font-style:italic;line-height:1.45}
.tpl-revista .faq{border-top:2px solid var(--text)}
.tpl-revista .final{background:var(--bg);color:var(--text);border-top:3px solid var(--text)}
.tpl-revista .final::before{display:none}
.tpl-revista .final .btn{background:var(--primary);color:var(--on-primary)}
.tpl-revista .site-footer{border-top:3px solid var(--text)}

/* ─── Blocos: seções em painéis arredondados (bento) ─── */
.tpl-blocos{--radius:22px;--radius-sm:16px}
.tpl-blocos .site-header{margin:10px;border:1px solid var(--border);border-radius:20px;top:10px}
.tpl-blocos .hero,.tpl-blocos .section{width:calc(100% - 20px);max-width:calc(var(--container) + 40px);margin:10px auto;border-radius:30px}
.tpl-blocos .hero{background:var(--primary-soft)}
.tpl-blocos .hero-pattern{display:none}
.tpl-blocos .section{background:var(--surface)}
.tpl-blocos .section-alt{background:var(--primary-soft)}
.tpl-blocos .section.band{background:var(--band)}
.tpl-blocos .hero-media{box-shadow:none}
.tpl-blocos .card,.tpl-blocos .quote{border:0;background:var(--bg)}
.tpl-blocos .section-alt .card,.tpl-blocos .section-alt .quote{background:var(--bg)}
.tpl-blocos .grid>.card:first-child:not(:only-child){background:var(--band);color:var(--band-text)}
.tpl-blocos .grid>.card:first-child:not(:only-child) p,.tpl-blocos .grid>.card:first-child:not(:only-child) li{color:var(--band-muted)}
.tpl-blocos .grid>.card:first-child:not(:only-child) .icon-box{background:color-mix(in srgb,var(--band-text) 12%,var(--band));color:var(--band-accent)}
.tpl-blocos .grid>.card:first-child:not(:only-child) .benefit{border-color:var(--band-border)}
.tpl-blocos .grid>.card:first-child:not(:only-child) .ico{color:var(--band-accent)}
@media(min-width:960px){.tpl-blocos .grid{grid-template-columns:repeat(3,minmax(0,1fr))}.tpl-blocos .grid>:first-child{grid-column:span 2}.tpl-blocos .grid>:only-child{grid-column:1/-1}.tpl-blocos .grid>:last-child:nth-child(3n+1):not(:first-child){grid-column:span 2}.tpl-blocos .grid>:last-child:nth-child(3n):not(:first-child){grid-column:1/-1}}
.tpl-blocos .diff-grid{gap:12px;background:transparent;border:0;overflow:visible}
.tpl-blocos .diff{border-radius:22px;box-shadow:none;background:color-mix(in srgb,var(--band-text) 8%,var(--band))}
.tpl-blocos .gallery figure{border-radius:20px}
@media(min-width:860px){.tpl-blocos .gallery{grid-template-columns:repeat(4,1fr);grid-auto-rows:200px;grid-auto-flow:dense}.tpl-blocos .gallery figure:nth-child(4){grid-column:span 2}.tpl-blocos .gallery figure:nth-child(5){grid-row:span 2}}
.tpl-blocos .faq{border:0}
.tpl-blocos .faq details{border:0;background:var(--bg);border-radius:16px;padding:0 20px;margin-bottom:8px}
.tpl-blocos .contact-list a,.tpl-blocos .contact-list div{border:0}
.tpl-blocos .final{background:var(--primary)}
.tpl-blocos .site-footer{border:0}

/* ─── Noturno: página escura com brilho na cor da marca ─── */
.tpl-noturno{color-scheme:dark;--bg:#0b0d12;--surface:#11141b;--text:#eef1f6;--muted:#a3abb9;--border:rgba(255,255,255,.1);--primary-ink:color-mix(in srgb,var(--primary) 55%,#fff);--primary-soft:color-mix(in srgb,var(--primary) 20%,#0b0d12);--accent-ink:color-mix(in srgb,var(--accent) 55%,#fff);--band:#07080c;--band-text:#eef1f6;--band-muted:#a3abb9;--band-accent:color-mix(in srgb,var(--primary) 55%,#fff);--band-border:rgba(255,255,255,.1)}
.tpl-noturno .site-header{background:rgba(11,13,18,.72);border-bottom-color:rgba(255,255,255,.08)}
.tpl-noturno .hero::before{content:"";position:absolute;inset:-30% -10% auto;height:130%;pointer-events:none;background:radial-gradient(45% 45% at 25% 35%,color-mix(in srgb,var(--primary) 40%,transparent),transparent 70%),radial-gradient(35% 35% at 85% 20%,color-mix(in srgb,var(--accent) 28%,transparent),transparent 70%);filter:blur(30px)}
.tpl-noturno .hero>.container{position:relative}
.tpl-noturno .hero-pattern{opacity:.45}
.tpl-noturno .hero h1{background:linear-gradient(180deg,#fff 30%,color-mix(in srgb,#fff 55%,var(--primary)));-webkit-background-clip:text;background-clip:text;color:transparent}
.tpl-noturno .section{border-top:1px solid rgba(255,255,255,.05)}
.tpl-noturno .section-alt{background:var(--surface)}
.tpl-noturno .card,.tpl-noturno .quote,.tpl-noturno .contact-list a,.tpl-noturno .contact-list div{background:rgba(255,255,255,.035)!important;border-color:rgba(255,255,255,.08)}
.tpl-noturno .card:hover{border-color:color-mix(in srgb,var(--primary) 60%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--primary) 35%,transparent),0 24px 60px -24px color-mix(in srgb,var(--primary) 55%,transparent)}
.tpl-noturno .btn-primary{box-shadow:0 0 32px -6px var(--primary)}
.tpl-noturno .btn-ghost{border-color:rgba(255,255,255,.22)}
.tpl-noturno .hero-media,.tpl-noturno .about-media{box-shadow:0 0 0 1px rgba(255,255,255,.08),0 30px 80px -30px color-mix(in srgb,var(--primary) 65%,transparent)}
.tpl-noturno .hero-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1)}
.tpl-noturno .diff-grid{background:transparent}
.tpl-noturno .gallery img{filter:grayscale(.7) brightness(.85);transition:filter .5s ease,transform .6s ease}
.tpl-noturno .gallery figure:hover img{filter:none}
.tpl-noturno .final{background:radial-gradient(80% 140% at 50% 0%,color-mix(in srgb,var(--primary) 55%,#0b0d12),#0b0d12);color:#fff}
.tpl-noturno .final .btn{background:var(--primary);color:var(--on-primary)}
.tpl-noturno .site-footer{border-top-color:rgba(255,255,255,.08)}

/* ─── Capa: foto do topo em largura total com o texto por cima, carrosséis ─── */
.tpl-capa .hero-split:has(.hero-media){padding:0}
.tpl-capa .hero-split .container:has(>.hero-media){max-width:none;padding:0;gap:0}
.tpl-capa .hero-split .container>.hero-media{order:-1;border-radius:0;box-shadow:none;aspect-ratio:4/3}
.tpl-capa .hero-split .container:has(>.hero-media)>div:first-child{padding:32px var(--gutter) 40px}
@media(min-width:960px){
.tpl-capa .hero-split .container:has(>.hero-media){grid-template-columns:minmax(0,1fr);grid-template-areas:"capa"}
.tpl-capa .hero-split .container:has(>.hero-media)>*{grid-area:capa}
.tpl-capa .hero-split .container>.hero-media{aspect-ratio:auto;min-height:min(80vh,760px);align-self:stretch}
.tpl-capa .hero-split .container:has(>.hero-media)>div:first-child{position:relative;z-index:1;align-self:end;justify-self:start;max-width:600px;margin:56px 0 56px max(20px,calc((100% - var(--container)) / 2 + 20px));padding:clamp(32px,4vw,52px);background:var(--bg);border-radius:var(--radius);box-shadow:0 30px 70px -30px rgba(0,0,0,.45)}
}
.tpl-capa .section>.container>.section-head h2{padding-left:20px;border-left:6px solid var(--primary)}
.tpl-capa .section-head.center h2{padding:0;border:0}
.tpl-capa .card{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:8px;align-items:start}
.tpl-capa .card .icon-box{grid-row:span 4;margin:0}
.tpl-capa .card>:not(.icon-box){grid-column:2}
.tpl-capa .about-media{border-radius:0;aspect-ratio:1;box-shadow:-18px 18px 0 var(--primary-soft)}
.tpl-capa .diff{border-left:4px solid var(--band-accent)}
.tpl-capa .gallery,.tpl-capa .quotes{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:14px;scrollbar-width:thin}
.tpl-capa .gallery figure{flex:0 0 min(80%,420px);aspect-ratio:4/5!important;scroll-snap-align:start;border-radius:var(--radius)}
.tpl-capa .quote{flex:0 0 min(86%,440px);scroll-snap-align:start}
.tpl-capa .final{text-align:left}
.tpl-capa .final .container{max-width:var(--container)}
.tpl-capa .final p{margin-left:0}

/* ─── Orgânico: formas suaves, fotos em arco, faixas arredondadas ─── */
.tpl-organico{--radius:32px;--radius-sm:22px;--btn-radius:999px}
.tpl-organico .hero::before{content:"";position:absolute;width:540px;height:540px;right:-140px;top:-160px;border-radius:50%;background:var(--primary-soft);pointer-events:none}
.tpl-organico .hero::after{content:"";position:absolute;width:300px;height:300px;left:-120px;bottom:-140px;border-radius:50%;background:color-mix(in srgb,var(--accent) 14%,var(--bg));pointer-events:none}
.tpl-organico .hero>.container{position:relative;z-index:1}
.tpl-organico .hero-pattern{display:none}
.tpl-organico .hero-media{aspect-ratio:1;border-radius:58% 42% 46% 54% / 52% 44% 56% 48%;box-shadow:none}
.tpl-organico .about-media{aspect-ratio:4/5;border-radius:999px 999px 32px 32px}
.tpl-organico .eyebrow{background:var(--primary-soft);padding:8px 16px;border-radius:999px}
.tpl-organico .eyebrow::before{display:none}
.tpl-organico .section-alt .eyebrow{background:var(--bg)}
.tpl-organico .section>.container>.section-head{margin-left:auto;margin-right:auto;text-align:center}
.tpl-organico .section>.container>.section-head .lead{margin-left:auto;margin-right:auto}
.tpl-organico .section-alt,.tpl-organico .band,.tpl-organico .final{width:calc(100% - 20px);margin:0 auto;border-radius:44px}
.tpl-organico .section-alt{background:var(--primary-soft)}
.tpl-organico .card,.tpl-organico .quote{border:0;background:var(--surface);box-shadow:0 12px 30px -20px rgba(0,0,0,.2)}
.tpl-organico .section-alt .card,.tpl-organico .section-alt .quote{background:var(--bg)}
.tpl-organico .card{text-align:center}
.tpl-organico .card .icon-box{width:72px;height:72px;border-radius:50%;margin:0 auto 8px}
.tpl-organico .card .benefit{justify-content:center;text-align:left}
.tpl-organico .quote{border-radius:32px 32px 32px 6px}
.tpl-organico .diff-grid{gap:14px;background:transparent;border:0;overflow:visible}
.tpl-organico .diff{border-radius:28px;box-shadow:none;text-align:center;background:color-mix(in srgb,var(--band-text) 7%,var(--band))}
.tpl-organico .diff .ico{justify-content:center;width:100%}
.tpl-organico .gallery figure{border-radius:999px 999px 24px 24px}
@media(min-width:860px){.tpl-organico .gallery{grid-template-columns:repeat(3,1fr);grid-auto-rows:auto;gap:22px}.tpl-organico .gallery figure:first-child{grid-column:auto;grid-row:auto}.tpl-organico .gallery figure{aspect-ratio:3/4}}
.tpl-organico .faq{border:0}
.tpl-organico .faq details{border:0;background:var(--surface);border-radius:22px;padding:0 24px;margin-bottom:10px}
.tpl-organico .section-alt .faq details{background:var(--bg)}
.tpl-organico .contact-list a,.tpl-organico .contact-list div{border-radius:22px}
.tpl-organico .final{margin-bottom:10px}
.tpl-organico .site-footer{border:0}

/* ─── Aurora: clean e luminoso, brilho suave da marca, cartões de vidro ─── */
.tpl-aurora{--radius:24px;--radius-sm:16px;--btn-radius:999px}
.tpl-aurora .hero-pattern{display:none}
.tpl-aurora .hero::before{content:"";position:absolute;inset:-20% -10% auto -10%;height:120%;pointer-events:none;background:radial-gradient(40% 50% at 18% 30%,color-mix(in srgb,var(--primary) 22%,transparent),transparent 70%),radial-gradient(35% 45% at 82% 18%,color-mix(in srgb,var(--accent) 18%,transparent),transparent 70%),radial-gradient(30% 40% at 60% 85%,color-mix(in srgb,var(--primary) 12%,transparent),transparent 70%);filter:blur(24px)}
.tpl-aurora .hero>.container{position:relative}
.tpl-aurora .eyebrow{padding:6px 14px;border-radius:999px;border:1px solid color-mix(in srgb,var(--primary) 25%,var(--border));background:color-mix(in srgb,var(--bg) 70%,transparent);letter-spacing:.08em;font-size:12px}
.tpl-aurora .eyebrow::before{width:6px;height:6px;border-radius:50%;opacity:1;background:var(--primary)}
.tpl-aurora .section>.container>.section-head{margin-left:auto;margin-right:auto;text-align:center}
.tpl-aurora .section>.container>.section-head .lead{margin-left:auto;margin-right:auto}
.tpl-aurora .section-alt{background:linear-gradient(180deg,var(--bg),var(--primary-soft) 35%,var(--primary-soft) 65%,var(--bg))}
.tpl-aurora .card,.tpl-aurora .quote{background:color-mix(in srgb,var(--bg) 72%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border:1px solid color-mix(in srgb,var(--text) 8%,transparent);box-shadow:0 20px 50px -32px color-mix(in srgb,var(--primary) 45%,transparent)}
.tpl-aurora .section-alt .card,.tpl-aurora .section-alt .quote{background:color-mix(in srgb,var(--bg) 72%,transparent)}
.tpl-aurora .card .icon-box{background:linear-gradient(135deg,var(--primary-soft),color-mix(in srgb,var(--accent) 14%,var(--bg)));border:1px solid color-mix(in srgb,var(--primary) 18%,transparent)}
.tpl-aurora .hero-media,.tpl-aurora .about-media{border-radius:28px;box-shadow:0 30px 70px -35px color-mix(in srgb,var(--primary) 60%,transparent)}
.tpl-aurora .band{background:var(--primary-soft);color:var(--text)}
.tpl-aurora .band .eyebrow{color:var(--primary-ink)}.tpl-aurora .band .lead,.tpl-aurora .diff p{color:var(--muted)}
.tpl-aurora .diff-grid{gap:16px;background:transparent;border:0;overflow:visible}
.tpl-aurora .diff{border-radius:var(--radius);box-shadow:none;background:color-mix(in srgb,var(--bg) 75%,transparent);border:1px solid color-mix(in srgb,var(--primary) 14%,transparent)}
.tpl-aurora .diff .ico{color:var(--primary-ink)}
.tpl-aurora .gallery figure{border-radius:20px}
@media(min-width:860px){.tpl-aurora .gallery{grid-template-columns:repeat(3,1fr);grid-auto-rows:280px;gap:16px}.tpl-aurora .gallery figure:first-child{grid-column:auto;grid-row:auto}}
.tpl-aurora .faq{border:0}
.tpl-aurora .faq details{border:1px solid var(--border);border-radius:16px;padding:0 20px;margin-bottom:10px;background:var(--bg)}
.tpl-aurora .final{width:calc(100% - 20px);max-width:calc(var(--container) + 40px);margin:10px auto;border-radius:32px}
.tpl-aurora .site-footer{border:0}

/* ─── Linhas: grade de fios finos, células, cara de produto digital ─── */
.tpl-linhas{--radius:12px;--radius-sm:8px;--btn-radius:8px}
.tpl-linhas .hero-pattern{display:none}
.tpl-linhas .hero::before,.tpl-linhas .final::before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(ellipse 80% 70% at 50% 30%,#000 25%,transparent 80%);-webkit-mask-image:radial-gradient(ellipse 80% 70% at 50% 30%,#000 25%,transparent 80%)}
.tpl-linhas .hero>.container{position:relative}
.tpl-linhas .eyebrow{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:500;letter-spacing:.04em;font-size:12.5px}
.tpl-linhas .eyebrow::before{content:"//";width:auto;height:auto;background:none;opacity:.55}
.tpl-linhas .section-alt{background:transparent}
.tpl-linhas .section{border-top:1px solid var(--border)}
.tpl-linhas .btn-primary,.tpl-linhas .card,.tpl-linhas .quote{box-shadow:none}
.tpl-linhas .grid{gap:0;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.tpl-linhas .grid>.card{border:0;border-radius:0;box-shadow:0 0 0 .5px var(--border);background:transparent}
.tpl-linhas .grid>.card:hover{transform:none;box-shadow:0 0 0 .5px var(--border);background:var(--surface)}
.tpl-linhas .card .icon-box{width:42px;height:42px;border:1px solid var(--border);background:var(--bg)}
.tpl-linhas .band{background:var(--bg);color:var(--text);border-top:1px solid var(--border)}
.tpl-linhas .band .eyebrow{color:var(--primary-ink)}.tpl-linhas .band .lead,.tpl-linhas .diff p{color:var(--muted)}
.tpl-linhas .diff-grid{background:transparent;border-color:var(--border)}
.tpl-linhas .diff{background:transparent;box-shadow:0 0 0 .5px var(--border)}
.tpl-linhas .diff .ico{color:var(--primary-ink)}
.tpl-linhas .hero-media,.tpl-linhas .about-media{border:1px solid var(--border);padding:8px;background:var(--surface);box-shadow:none;border-radius:16px}
.tpl-linhas .hero-media img,.tpl-linhas .about-media img{border-radius:10px}
.tpl-linhas .hero-card{box-shadow:none}
.tpl-linhas .quotes{gap:0;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.tpl-linhas .quote{border:0;border-radius:0;box-shadow:0 0 0 .5px var(--border);background:transparent}
.tpl-linhas .gallery{gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.tpl-linhas .gallery figure{border-radius:0}
.tpl-linhas .final{background:var(--bg);color:var(--text);border-top:1px solid var(--border)}
.tpl-linhas .final .btn{background:var(--primary);color:var(--on-primary)}

/* ─── Suave: fundo levemente colorido, cartões brancos macios, ícones em círculo ─── */
.tpl-suave{--radius:28px;--radius-sm:18px;--btn-radius:999px;background:color-mix(in srgb,var(--primary) 5%,var(--bg))}
.tpl-suave .site-header{border-bottom:0;background:color-mix(in srgb,color-mix(in srgb,var(--primary) 5%,var(--bg)) 86%,transparent)}
.tpl-suave .hero-pattern{display:none}
.tpl-suave .section-alt{background:color-mix(in srgb,var(--primary) 10%,var(--bg))}
.tpl-suave .card,.tpl-suave .quote,.tpl-suave .contact-list a,.tpl-suave .contact-list div,.tpl-suave .section-alt .card,.tpl-suave .section-alt .quote{background:var(--bg);border:0;box-shadow:0 1px 2px rgba(0,0,0,.04),0 14px 34px -18px color-mix(in srgb,var(--primary) 35%,rgba(0,0,0,.2))}
.tpl-suave .card:hover{transform:translateY(-4px)}
.tpl-suave .card .icon-box{width:56px;height:56px;border-radius:50%;background:var(--primary);color:var(--on-primary)}
.tpl-suave .hero-media,.tpl-suave .about-media{border-radius:32px;border:8px solid var(--bg);box-shadow:0 30px 60px -30px rgba(0,0,0,.28)}
.tpl-suave .eyebrow{background:var(--bg);padding:7px 14px;border-radius:999px;box-shadow:0 6px 16px -10px rgba(0,0,0,.25)}
.tpl-suave .eyebrow::before{display:none}
.tpl-suave .band{background:transparent;color:var(--text)}
.tpl-suave .band .eyebrow{color:var(--primary-ink)}.tpl-suave .band .lead,.tpl-suave .diff p{color:var(--muted)}
.tpl-suave .diff-grid{gap:18px;background:transparent;border:0;overflow:visible}
.tpl-suave .diff{background:var(--bg);border-radius:var(--radius);box-shadow:0 14px 34px -18px color-mix(in srgb,var(--primary) 35%,rgba(0,0,0,.2))}
.tpl-suave .diff .ico{display:inline-grid;place-items:center;width:54px;height:54px;border-radius:50%;background:var(--primary-soft);color:var(--primary-ink)}
.tpl-suave .gallery{gap:14px}
.tpl-suave .gallery figure{border-radius:24px}
.tpl-suave .faq{border:0}
.tpl-suave .faq details{border:0;background:var(--bg);border-radius:20px;padding:0 22px;margin-bottom:10px;box-shadow:0 8px 24px -18px rgba(0,0,0,.25)}
.tpl-suave .final{width:calc(100% - 24px);max-width:calc(var(--container) + 40px);margin:12px auto;border-radius:36px}
.tpl-suave .site-footer{border:0}

/* ─── Estúdio: topo dividido até a borda, títulos de seção fixos à esquerda ─── */
.tpl-estudio{--radius:6px;--radius-sm:4px}
.tpl-estudio .hero-pattern{display:none}
.tpl-estudio .eyebrow::before{width:32px}
.tpl-estudio .hero-media,.tpl-estudio .about-media{box-shadow:none}
@media(min-width:960px){
.tpl-estudio .hero-split:has(.hero-media){padding-top:0;padding-bottom:0}
.tpl-estudio .hero-split .container:has(>.hero-media){max-width:none;padding:0;grid-template-columns:1fr 1fr;gap:0;align-items:stretch}
.tpl-estudio .hero-split .container:has(>.hero-media)>div:first-child{align-self:center;padding:clamp(56px,7vw,110px) clamp(32px,5vw,72px) clamp(56px,7vw,110px) max(20px,calc((100vw - var(--container)) / 2 + 20px))}
.tpl-estudio .hero-split .container>.hero-media{border-radius:0;aspect-ratio:auto;min-height:min(78vh,720px)}
.tpl-estudio .section>.container:has(>.section-head){display:grid;grid-template-columns:minmax(0,300px) minmax(0,1fr);gap:64px;align-items:start}
.tpl-estudio .section>.container>.section-head{position:sticky;top:calc(var(--header-h,76px) + 24px);margin:0}
.tpl-estudio .section>.container>.section-head h2{font-size:calc((clamp(1.8rem,1.2rem + 1.6vw,2.6rem)) * var(--title-scale))}
.tpl-estudio .row{grid-template-columns:56px 1fr 1.3fr}
}
.tpl-estudio .grid{gap:36px 32px}
.tpl-estudio .card,.tpl-estudio .section-alt .card{border:0;border-top:1px solid var(--text);border-radius:0;background:transparent;padding:22px 0 0;box-shadow:none}
.tpl-estudio .card:hover{transform:none;box-shadow:none;border-color:var(--primary-ink)}
.tpl-estudio .card .icon-box{width:44px;height:44px;border-radius:50%}
.tpl-estudio .rows{border-top:1px solid var(--text)}
.tpl-estudio .diff-grid{border:0;background:transparent;gap:0 32px}
.tpl-estudio .diff{background:transparent;box-shadow:none;padding:22px 0;border-top:1px solid var(--band-border)}
.tpl-estudio .gallery figure{border-radius:4px}
@media(min-width:860px){.tpl-estudio .gallery{grid-template-columns:repeat(3,1fr);grid-auto-rows:220px}}
.tpl-estudio .quote,.tpl-estudio .section-alt .quote{border:0;border-top:1px solid var(--text);border-radius:0;background:transparent;padding:22px 0 0}
.tpl-estudio .final{text-align:left}
.tpl-estudio .final .container{max-width:var(--container)}
.tpl-estudio .final p{margin-left:0}

/* ─── Degradê: cor principal → destaque no topo, botões, ícones e CTA final ─── */
.tpl-degrade{--grad:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 45%,var(--accent)));--grad-ink:linear-gradient(90deg,var(--primary-ink),var(--accent-ink));--radius:20px;--radius-sm:14px;--btn-radius:999px}
.tpl-degrade .hero{background:radial-gradient(60% 80% at 0% 0%,color-mix(in srgb,var(--primary) 16%,transparent),transparent 70%),radial-gradient(50% 70% at 100% 10%,color-mix(in srgb,var(--accent) 14%,transparent),transparent 70%)}
.tpl-degrade .hero-pattern{display:none}
.tpl-degrade .eyebrow{background:var(--grad-ink);-webkit-background-clip:text;background-clip:text;color:transparent}
.tpl-degrade .eyebrow::before{background:var(--grad-ink);opacity:1}
.tpl-degrade .band .eyebrow{background:none;color:var(--band-accent)}.tpl-degrade .band .eyebrow::before{background:currentColor}
.tpl-degrade .btn-primary{background:var(--grad);border:0;box-shadow:0 12px 30px -12px color-mix(in srgb,var(--primary) 70%,transparent)}
.tpl-degrade .card .icon-box{background:var(--grad);color:var(--on-primary);border-radius:16px}
.tpl-degrade .card:hover,.tpl-degrade .section-alt .card:hover{border-color:transparent;background:linear-gradient(var(--bg),var(--bg)) padding-box,var(--grad) border-box}
.tpl-degrade .section>.container>.section-head h2::after{content:"";display:block;width:56px;height:4px;border-radius:4px;background:var(--grad);margin-top:18px}
.tpl-degrade .section-head.center h2::after{margin-left:auto;margin-right:auto}
.tpl-degrade .hero-media,.tpl-degrade .about-media{box-shadow:22px 22px 0 -6px color-mix(in srgb,var(--accent) 28%,transparent),0 30px 60px -30px rgba(0,0,0,.3)}
.tpl-degrade .quote::before{background:var(--grad-ink);-webkit-background-clip:text;background-clip:text;color:transparent}
.tpl-degrade .gallery figure{border-radius:18px}
.tpl-degrade .socials a:hover{background:var(--grad);border-color:transparent}
.tpl-degrade .final{background:var(--grad)}
.tpl-degrade .final .btn{background:var(--bg);color:var(--text)}

/* Computador: título principal com 66px por padrão em todos os modelos */
@media(min-width:768px){:root .hero h1{font-size:calc(66px * var(--title-scale) * var(--hero-scale))}}

/* Animações discretas (somente com JS ativo e sem preferência por movimento reduzido) */
.js .reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
.js .reveal.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.js .reveal{opacity:1;transform:none;transition:none}*{transition:none!important}}
`.replace(/\n\s*/g, '');
}

export const REVEAL_SCRIPT = `document.documentElement.classList.add('js');addEventListener('DOMContentLoaded',function(){var h=document.querySelector('.site-header');function m(){if(h)document.documentElement.style.setProperty('--header-h',h.offsetHeight+'px')}m();addEventListener('resize',m);document.querySelectorAll('.menu-panel a').forEach(function(a){a.addEventListener('click',function(){var d=a.closest('details');if(d)d.open=false})});var e=document.querySelectorAll('.reveal');if(!('IntersectionObserver'in window)){e.forEach(function(n){n.classList.add('in')});return}var o=new IntersectionObserver(function(t){t.forEach(function(n){if(n.isIntersecting){n.target.classList.add('in');o.unobserve(n.target)}})},{rootMargin:'0px 0px -8% 0px'});e.forEach(function(n){o.observe(n)})});`;
