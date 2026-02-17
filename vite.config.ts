
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // We retain this as requested, though we are not injecting them via define anymore.
  
  // Fix: Cast process to any to avoid "Property 'cwd' does not exist on type 'Process'" error.
  const currentWorkingDir = (process as any).cwd();
  const env = loadEnv(mode, currentWorkingDir, '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        // Fix: Use currentWorkingDir instead of __dirname to avoid "Cannot find name '__dirname'" error.
        "@": path.resolve(currentWorkingDir, "./src"),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
    },
    // define block has been removed to prevent injecting sensitive environment variables directly into the client code.
  };
});
