import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitepress';

// Project settings live in prototype.config.json at the repo root.
const project = JSON.parse(readFileSync(new URL('../../prototype.config.json', import.meta.url), 'utf8'));

// Versioned builds set these (see scripts/publish-site.sh); defaults match the latest site.
const SITE: string = project.pagesUrl;
const base = process.env.DOCS_BASE ?? `${project.basePath}/docs/`;
const version = process.env.SITE_VERSION ?? 'latest';
const versions = (process.env.DOCS_VERSIONS ?? '').split(',').filter(Boolean);
const demo = `${new URL(SITE).origin}${base.replace(/docs\/$/, 'demo/')}`;

export default defineConfig({
    title: project.title,
    description: `Documentation for ${project.title}`,
    base,
    cleanUrls: true,
    ignoreDeadLinks: 'localhostLinks',
    themeConfig: {
        nav: [
            { text: 'Game Design', link: '/gdd/' },
            { text: 'Guide', link: '/guide/getting-started' },
            { text: 'Play', link: demo },
            {
                text: version,
                items: [
                    { text: 'latest', link: `${SITE}/docs/` },
                    ...versions.map((v) => ({ text: v, link: `${SITE}/${v}/docs/` })),
                    { text: 'All versions', link: `${SITE}/#versions` }
                ]
            }
        ],
        outline: { level: [2, 3] },
        sidebar: {
            '/gdd/': [
                { text: 'Game Design Document', items: [{ text: 'Contents', link: '/gdd/' }] },
                {
                    text: 'I. Vision',
                    items: [{ text: '1. Overview', link: '/gdd/overview' }]
                },
                {
                    text: 'II. Gameplay',
                    items: [
                        { text: '2. Core loop', link: '/gdd/core-loop' },
                        { text: '3. Rules & mechanics', link: '/gdd/rules' },
                        { text: '4. Level format', link: '/gdd/level-format' }
                    ]
                },
                {
                    text: 'III. Art',
                    items: [{ text: '5. Art direction', link: '/gdd/art' }]
                },
                {
                    text: 'IV. Production',
                    items: [
                        { text: '6. Roadmap & open questions', link: '/gdd/roadmap' },
                        { text: '7. Changelog', link: '/gdd/changelog' }
                    ]
                }
            ],
            '/guide/': [
                {
                    text: 'Developer guide',
                    items: [
                        { text: 'Getting Started', link: '/guide/getting-started' },
                        { text: 'Deployment', link: '/guide/deployment' },
                        { text: 'Level editor', link: '/guide/editor' },
                        { text: 'Tạo asset bằng ChatGPT', link: '/guide/assets' },
                        { text: 'Game Design Document →', link: '/gdd/' }
                    ]
                }
            ]
        },
        footer: { message: `${project.title} · ${version}` },
        search: { provider: 'local' },
        socialLinks: [{ icon: 'github', link: `https://github.com/${project.repo}` }]
    }
});
