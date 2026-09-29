/** `paths` liga sobretítulo, título e texto de apoio aos campos do conteúdo (edição na prévia). */
export function SectionHead({ eyebrow, title, lead, center, paths = {} }: { eyebrow?: string | null; title: string; lead?: string | null; center?: boolean; paths?: { eyebrow?: Record<string, string>; title?: Record<string, string>; lead?: Record<string, string> } }) {
  return (
    <div className={`section-head reveal${center ? ' center' : ''}`}>
      {eyebrow ? <div className="eyebrow" {...paths.eyebrow}>{eyebrow}</div> : null}
      <h2 {...paths.title}>{title}</h2>
      {lead ? <p className="lead" {...paths.lead}>{lead}</p> : null}
    </div>
  );
}
