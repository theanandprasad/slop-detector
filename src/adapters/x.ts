import type { SiteAdapter } from './types';

const POST_SELECTOR = 'article[data-testid="tweet"]';
const TEXT_SELECTOR = '[data-testid="tweetText"]';
const SHOW_MORE_SELECTOR = '[data-testid="tweet-text-show-more-link"]';

export const x: SiteAdapter = {
  platform: 'x',

  matches: (loc) =>
    (loc.hostname === 'x.com' || loc.hostname.endsWith('.x.com') || loc.hostname === 'twitter.com') &&
    !loc.pathname.startsWith('/messages') &&
    !loc.pathname.startsWith('/i/chat'),

  findPosts(root) {
    return [...root.querySelectorAll<HTMLElement>(POST_SELECTOR)];
  },

  shouldClassify(post) {
    // v0.1: on a thread page (/status/…), only the focal post — replies are v0.2.
    if (!location.pathname.includes('/status/')) return true;
    const first = document.querySelector<HTMLElement>(`main ${POST_SELECTOR}`);
    return post === first;
  },

  textElement(post) {
    // The first tweetText is the post itself; a later one would be a quoted post.
    return post.querySelector<HTMLElement>(TEXT_SELECTOR);
  },

  extractText: (textEl) => textEl.innerText.trim(),

  isTruncated(post) {
    return post.querySelector(SHOW_MORE_SELECTOR) !== null;
  },

  mountBadge(_post, textEl, host) {
    textEl.parentElement?.insertBefore(host, textEl);
  },
};
