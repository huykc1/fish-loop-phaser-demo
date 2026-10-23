import { defineConfig } from 'vite';

/**
 * Build riêng cho Level Editor → dist-editor/, đăng ở <pagesUrl>/editor/ (cạnh /demo/ và /docs/).
 * Không nằm trong bản snapshot của từng version (xem scripts/build-site.sh).
 * Khi dev, editor chạy chung server với game: http://localhost:8080/editor/
 */
export default defineConfig({
    root: 'editor',
    base: './',
    publicDir: '../public',
    build: { outDir: '../dist-editor', emptyOutDir: true }
});
