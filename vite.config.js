import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React entra aos poucos: telas migradas são componentes montados pelo main.js
// (que continua sendo o dono do estado). O plugin só habilita o JSX.
export default defineConfig({ plugins: [react()], server: { port: 5172 } });
