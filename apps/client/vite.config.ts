import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { readFileSync } from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import pkg from './package.json';

// REEF's release version (the vX.Y.Z the GitHub releases are tagged with)
// lives in desktop/package.json — the client package.json tracks upstream
// Sharkord. The standalone shells compare this against the latest release to
// offer updates.
const readReefVersion = (): string => {
  try {
    const desktopPkg = JSON.parse(
      readFileSync(
        path.resolve(__dirname, '../../desktop/package.json'),
        'utf8'
      )
    ) as { version?: string };

    return desktopPkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    build: {
      target: 'esnext'
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    define: {
      VITE_APP_VERSION: JSON.stringify(pkg.version),
      VITE_REEF_VERSION: JSON.stringify(readReefVersion())
    },
    server: {
      proxy: {
        '/manifest.json': `http://localhost:${env.SERVER_PORT || 4991}`
      }
    }
  };
});
