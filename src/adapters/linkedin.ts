import type { SiteAdapter } from './types';

// LinkedIn's current feed (2026) uses hashed class names, so we key off stable
// data-testid / role / componentkey attributes. The legacy class selectors stay
// as fallbacks for accounts still on the old frontend.
const POST_SELECTORS = [
  '[role="listitem"][componentkey^="update-card"]',
  // legacy
  'div.feed-shared-update-v2',
  'div[data-urn^="urn:li:activity"]',
  'div[data-id^="urn:li:activity"]',
];

const TEXT_SELECTORS = [
  '[data-testid="expandable-text-box"]',
  // legacy
  '.update-components-text',
  '.feed-shared-inline-show-more-text',
  '.feed-shared-text',
];

const MORE_BUTTON_SELECTOR = '[data-testid="expandable-text-button"], button';

const COMMENTS_SELECTOR = '.comments-comments-list, .comments-comment-entity, article.comments-comment-item';

export const linkedin: SiteAdapter = {
  platform: 'linkedin',

  matches: (loc) => loc.hostname.endsWith('linkedin.com') && !loc.pathname.startsWith('/messaging'),

  findPosts(root) {
    const found = new Set<HTMLElement>();
    for (const sel of POST_SELECTORS) {
      root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        // Skip nested matches (e.g. the inner card of a reshare).
        if (!el.parentElement?.closest(POST_SELECTORS.join(','))) found.add(el);
      });
    }
    return [...found];
  },

  shouldClassify: () => true,

  textElement(post) {
    // The first text box in DOM order is the post commentary; later ones are a
    // reshared post's text or comments. Never take text from the comments section.
    for (const sel of TEXT_SELECTORS) {
      for (const el of post.querySelectorAll<HTMLElement>(sel)) {
        if (!el.closest(COMMENTS_SELECTOR)) return el;
      }
    }
    return null;
  },

  extractText(textEl) {
    let text = textEl.innerText;
    // The "… more" toggle lives inside the text box; drop its label.
    for (const btn of textEl.querySelectorAll<HTMLElement>(MORE_BUTTON_SELECTOR)) {
      const label = btn.innerText.trim();
      if (label && text.trimEnd().endsWith(label)) text = text.trimEnd().slice(0, -label.length);
    }
    return text.trim();
  },

  // The "… more" toggle only changes the visual clamp; the full text is already in the DOM.
  isTruncated: () => false,

  mountBadge(_post, textEl, host) {
    // The new feed wraps the text span in a <p>; put the badge above the paragraph.
    const anchor = textEl.parentElement?.tagName === 'P' ? textEl.parentElement : textEl;
    anchor.parentElement?.insertBefore(host, anchor);
  },
};
