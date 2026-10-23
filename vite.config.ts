import { mkdirSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import config from './prototype.config.json';

/** Chỉ khi dev: POST /__snap?name=x (body = dataURL PNG) lưu ảnh chụp canvas vào .snaps/ để soát hình. */
function snapshots(): Plugin {
    return {
        name: 'dev-snapshots',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/__snap', (req, res) => {
                const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'snap';
                let body = '';
                req.on('data', (c) => (body += c));
                req.on('end', () => {
                    mkdirSync('.snaps', { recursive: true });
                    writeFileSync(`.snaps/${name.replace(/[^\w-]/g, '')}.png`, Buffer.from(body.split(',')[1] ?? '', 'base64'));
                    res.end('ok');
                });
            });
        }
    };
}

export default defineConfig({
    base: './',
    // Set by scripts/publish-site.sh ("latest" or a tag like "v0.2.0"); "dev" when run locally.
    define: { __APP_VERSION__: JSON.stringify(process.env.SITE_VERSION ?? 'dev') },
    server: { port: config.devPort },
    plugins: [snapshots()],
    build: {
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
            output: {
                manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined)
            }
        }
    }
});
