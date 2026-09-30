import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      //
      // `gd_python/` queda fuera del vigilante a propósito: el servicio OAPAT
      // escribe ahí sus artefactos (informes de validación, modelos entrenados,
      // auditoría). Sin esta exclusión, cada corrida lanzada desde la interfaz
      // creaba archivos que Vite interpretaba como cambios de código y recargaba
      // la página entera, borrando el resultado justo al llegar.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/gd_python/**'],
      },
    },
  };
});
