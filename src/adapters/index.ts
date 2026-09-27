import { linkedin } from './linkedin';
import type { SiteAdapter } from './types';
import { x } from './x';

export const ADAPTERS: SiteAdapter[] = [linkedin, x];

export function adapterFor(loc: Location): SiteAdapter | undefined {
  return ADAPTERS.find((a) => a.matches(loc));
}
