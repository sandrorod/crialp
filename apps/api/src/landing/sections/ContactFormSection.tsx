import type { RenderContext } from '../context.js';
import { ed } from '../context.js';
import { SectionHead } from './SectionHead.js';

/**
 * Seção "Fale conosco": formulário enviado ao e-mail cadastrado na empresa. Envio sem JavaScript
 * (POST comum para o sistema, que volta para a página com ?contato=…). Sem e-mail válido na empresa,
 * o formulário só aparece na prévia do editor, com o aviso de que é preciso cadastrar um.
 */
export function ContactFormSection({ ctx, alt }: { ctx: RenderContext; alt: boolean }) {
  const form = ctx.contactForm;
  if (!form || (!ctx.editable && !form.recipientOk)) return null;
  const l = ctx.labels;
  const status = form.status;
  const message =
    status === 'enviado' ? l.form_sent : status === 'invalido' ? l.form_invalid : status === 'limite' ? l.form_limit : status === 'erro' ? l.form_error : null;
  // Na prévia do editor o formulário não envia (os textos dele são editáveis)
  const preview = !!ctx.editable;
  const field = (name: string, label: keyof typeof l, input: React.ReactNode) => (
    <label className={`lead-field lead-${name}`}>
      <span {...ed(ctx, `labels.${label}`)}>{l[label]}</span>
      {input}
    </label>
  );
  return (
    <section id="fale-conosco" className={`section lead-section${alt ? ' section-alt' : ''}${preview && !form.recipientOk ? ' lead-missing' : ''}`}>
      <div className="container lead-wrap">
        <SectionHead
          eyebrow={l.form_eyebrow}
          title={l.form_title}
          lead={l.form_lead}
          paths={{ eyebrow: ed(ctx, 'labels.form_eyebrow'), title: ed(ctx, 'labels.form_title'), lead: ed(ctx, 'labels.form_lead') }}
        />
        {preview && !form.recipientOk ? (
          <div className="lead-warning" role="alert">
            <strong>Formulário sem e-mail para receber as mensagens.</strong> Para funcionar, cadastre um e-mail válido nas informações da empresa (Empresas →
            editar → E-mail). Enquanto isso, esta seção não aparece na página publicada.
          </div>
        ) : null}
        {message ? (
          <p className={`lead-status ${status === 'enviado' ? 'is-ok' : 'is-error'}`} role="status">
            {message}
          </p>
        ) : null}
        <form className="lead-form reveal" method="post" {...(preview ? {} : { action: form.action })}>
          {/* Campo isca: invisível para pessoas; robôs que preenchem tudo são descartados */}
          <div className="lead-hp" aria-hidden="true">
            <label>
              Site
              <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          {field('name', 'form_name', <input type="text" name="name" required maxLength={120} autoComplete="name" readOnly={preview} />)}
          {field('email', 'form_email', <input type="email" name="email" maxLength={200} autoComplete="email" readOnly={preview} />)}
          {field('phone', 'form_phone', <input type="tel" name="phone" maxLength={40} autoComplete="tel" readOnly={preview} />)}
          {field('message', 'form_message', <textarea name="message" required maxLength={3000} rows={5} readOnly={preview} />)}
          <div className="lead-actions">
            {preview ? <span className="lead-preview-note">Prévia: o envio funciona só na página publicada.</span> : null}
            <button type={preview ? 'button' : 'submit'} className="btn btn-primary">
              <span {...ed(ctx, 'labels.form_submit')}>{l.form_submit}</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
