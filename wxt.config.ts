import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  // Visible in Finder (the default .output is hidden), for Chrome's "Load unpacked".
  outDir: 'dist',
  manifest: {
    name: 'Slop Detector',
    description: 'Tells you which LinkedIn and X posts are useful and which are just engagement bait, using Jev.',
    permissions: ['storage', 'unlimitedStorage'],
    host_permissions: ['https://openrouter.ai/*'],
  },
});
