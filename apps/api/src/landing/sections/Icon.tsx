import { iconSvg } from '../icons.js';

export function Icon({ name, size = 22, stroke, attrs }: { name: string; size?: number; stroke?: number; attrs?: Record<string, string> }) {
  return <span className="ico" {...attrs} dangerouslySetInnerHTML={{ __html: iconSvg(name, size, stroke) }} />;
}
