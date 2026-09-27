import { iconSvg } from '../icons.js';

export function Icon({ name, size = 22, stroke }: { name: string; size?: number; stroke?: number }) {
  return <span className="ico" dangerouslySetInnerHTML={{ __html: iconSvg(name, size, stroke) }} />;
}
