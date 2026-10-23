# Fish Loop

A colour-sorting fish puzzle on a looping pipe, built with Phaser 4

A Phaser 4 + TypeScript prototype. Play it at https://huykc1.github.io/fish-loop-phaser-demo/demo/ · docs and Game Design Document at https://huykc1.github.io/fish-loop-phaser-demo/docs/.

## Run

```bash
npm install
npm run dev      # http://localhost:8080
npm run build
```

## Releases

The live site is built locally and pushed to the `gh-pages` branch. There is no CI deploy.

```bash
npm run release:latest                  # after pushing main: update https://huykc1.github.io/fish-loop-phaser-demo/
npm version minor && npm run release    # publish a frozen copy at /fish-loop-phaser-demo/vX.Y.0/
```

The landing page lists every version. See `docs/guide/deployment.md` for details.
