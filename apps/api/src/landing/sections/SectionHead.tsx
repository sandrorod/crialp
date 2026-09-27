export function SectionHead({ eyebrow, title, lead, center }: { eyebrow?: string | null; title: string; lead?: string | null; center?: boolean }) {
  return (
    <div className={`section-head reveal${center ? ' center' : ''}`}>
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <h2>{title}</h2>
      {lead ? <p className="lead">{lead}</p> : null}
    </div>
  );
}
