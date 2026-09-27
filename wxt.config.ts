import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  // Visible in Finder (the default .output is hidden), for Chrome's "Load unpacked".
  outDir: 'dist',
  manifest: {
    name: 'Slop Detector',
    description: 'Labels formulaic, low-effort writing on LinkedIn and X using Jev.',
    permissions: ['storage', 'unlimitedStorage'],
    host_permissions: ['https://openrouter.ai/*'],
  },
});
