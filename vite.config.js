import { defineConfig } from 'vite';
import { resolve } from 'path';

const routes = {
  '/register':       '/src/pages/register.html',
  '/login':          '/src/pages/login.html',
  '/user-dashboard': '/src/pages/dashboard.html',
  '/create-circuit': '/src/pages/circuit.html',
  '/onboarding':     '/src/pages/onboarding.html',
  '/edit':           '/src/pages/edit.html',
  '/codes':          '/src/pages/codes.html',
  '/user-profile':'/src/pages/user-profile.html',
  '/circuit-view':'/src/pages/circuit-view.html'

};

function pageRewritePlugin() {
  return {
    name: 'page-rewrite',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const cleanUrl = req.url.split('?')[0];
        if (routes[cleanUrl]) req.url = routes[cleanUrl];
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [pageRewritePlugin()],
  build: {
    rollupOptions: {
      input: {
        main:       resolve(__dirname, 'index.html'),
        register:   resolve(__dirname, 'src/pages/register.html'),
        login:      resolve(__dirname, 'src/pages/login.html'),
        dashboard:  resolve(__dirname, 'src/pages/dashboard.html'),
        circuit:    resolve(__dirname, 'src/pages/circuit.html'),
        onboarding: resolve(__dirname, 'src/pages/onboarding.html'),
        edit:       resolve(__dirname, 'src/pages/edit.html'),
        codes:      resolve(__dirname, 'src/pages/codes.html'),
       
'user-profile': resolve(__dirname, 'src/pages/user-profile.html'),
      },
    },
  },
});