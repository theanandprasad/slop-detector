import { adapterFor } from '@/adapters';
import type { SiteAdapter } from '@/adapters/types';
import { sendClassify } from '@/lib/messages';
import { getSettings } from '@/lib/settings';
import { createBadge } from '@/ui/badge';

type PostState = {
  text: string;
  requested: boolean;
  badge: ReturnType<typeof createBadge> | null;
};

export default defineContentScript({
  matches: ['*://*.linkedin.com/*', '*://x.com/*', '*://*.x.com/*', '*://twitter.com/*'],
  runAt: 'document_idle',

  async main() {
    const adapter = adapterFor(location);
    if (!adapter) return;

    let settings = await getSettings();
    let missingKey = false;
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.settings) {
        void getSettings().then((s) => (settings = s));
        missingKey = false;
      }
    });

    const states = new WeakMap<HTMLElement, PostState>();

    // Classify only when a post is about to scroll into view.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const post = e.target as HTMLElement;
          io.unobserve(post);
          void classifyPost(post);
        }
      },
      { rootMargin: '600px 0px' },
    );

    async function classifyPost(post: HTMLElement) {
      const state = states.get(post);
      if (!state || state.requested) return;
      state.requested = true;

      const badge = createBadge();
      state.badge = badge;
      mount(adapter!, post, badge.host);
      badge.refresh(); // now attached, it can pick up the page's colors

      if (missingKey) {
        badge.update({ kind: 'error', message: 'Add your OpenRouter API key in the Slop Detector options.' });
        return;
      }

      const textAtRequest = state.text;
      try {
        const res = await sendClassify({
          platform: adapter!.platform,
          text: textAtRequest,
          partial: adapter!.isTruncated(post),
        });
        // The element may have been recycled for a different post meanwhile.
        if (states.get(post) !== state) return;
        if (res.ok) {
          badge.update({ kind: 'verdict', verdict: res.verdict, cached: res.cached });
        } else {
          if (res.code === 'no_key') missingKey = true;
          badge.update({ kind: 'error', message: res.error });
        }
      } catch (err) {
        // Typically "Extension context invalidated" after reloading the extension.
        badge.update({ kind: 'error', message: `${err}. Reload the page.` });
      }
    }

    function scan() {
      if (!settings.sites[adapter!.platform]) return;
      for (const post of adapter!.findPosts(document)) {
        if (!adapter!.shouldClassify(post)) continue;
        const textEl = adapter!.textElement(post);
        if (!textEl) continue;
        const text = adapter!.extractText(textEl);
        if (text.length < settings.minChars) continue;

        const existing = states.get(post);
        if (existing?.text === text) {
          // Site re-rendered and dropped our badge: put it back.
          if (existing.badge && !existing.badge.host.isConnected) {
            mount(adapter!, post, existing.badge.host);
            existing.badge.refresh();
          }
          continue;
        }

        // New post, or a recycled element now holding different text.
        existing?.badge?.host.remove();
        states.set(post, { text, requested: false, badge: null });
        io.unobserve(post);
        io.observe(post);
      }
    }

    let scheduled = false;
    const scheduleScan = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        scan();
      }, 250);
    };

    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
    scan();
  },
});

function mount(adapter: SiteAdapter, post: HTMLElement, host: HTMLElement) {
  const textEl = adapter.textElement(post);
  if (textEl) adapter.mountBadge(post, textEl, host);
}
