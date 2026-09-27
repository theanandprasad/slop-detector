import type { PostState } from '@/lib/questions';

// All brittle, site-specific DOM knowledge lives behind this interface.
export interface SiteAdapter {
  platform: PostState['platform'];
  /** Does this adapter handle the current page? */
  matches(location: Location): boolean;
  /** Top-level post containers under `root`. */
  findPosts(root: ParentNode): HTMLElement[];
  /** Whether this post is in scope (v0.1: feed posts only, no replies/comments). */
  shouldClassify(post: HTMLElement): boolean;
  /** The element holding the post body text, or null if none (e.g. image-only). */
  textElement(post: HTMLElement): HTMLElement | null;
  /** The post text from `textElement`, minus any UI chrome (e.g. "… more" buttons). */
  extractText(textEl: HTMLElement): string;
  /** True when the visible text is truncated and the full text isn't in the DOM. */
  isTruncated(post: HTMLElement): boolean;
  /** Insert the badge host near the text. */
  mountBadge(post: HTMLElement, textEl: HTMLElement, host: HTMLElement): void;
}

