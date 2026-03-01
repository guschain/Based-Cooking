# Based Cooking

Minimal static cookbook for GitHub Pages, built from Markdown files in `recipes/`.

## How it works

1. `recipes/*.md` is the source of truth.
2. Each recipe has a small front matter block for `title`, `category`, `tags`, and `image`.
3. `node scripts/build-site.mjs` generates the static site into `docs/`.
4. The GitHub Actions workflow deploys `docs/` to GitHub Pages on every push to `main`.

## Current cookbook import

The existing `Livro_de_Receitas_Consolidado.md` can be split into per-recipe files with:

```bash
npm run import
```

The importer preserves `tags` and `image` if a recipe file already exists, so you can re-run it after updating the consolidated book without losing those fields.

## Add a recipe

Create a new file in `recipes/`, for example:

```md
---
title: Frango Assado
category: Pratos principais
tags: pratos-principais, frango, forno
image: images/frango-assado.jpg
---

#### Ingredientes
- 1 frango
- Sal

#### Preparacao
1. Temperar.
2. Assar.
```

Then run:

```bash
npm run build
```

## Add an image

1. Put the image in `images/`.
2. Reference it in the recipe front matter, for example `image: images/frango-assado.jpg`.
3. Rebuild the site.

## Local preview

Because the site loads `recipes.json` with `fetch`, preview it from a small local server:

```bash
npm run build
python3 -m http.server 4173 -d docs
```

Then open `http://localhost:4173`.

## GitHub Pages setup

1. Push this folder to `https://github.com/guschain/Based-Cooking`.
2. In GitHub, open `Settings > Pages`.
3. Under `Build and deployment`, choose `GitHub Actions`.
4. Push to `main` whenever you add or edit recipes.

If this local folder is not yet connected to the repo, use:

```bash
git init
git branch -M main
git remote add origin https://github.com/guschain/Based-Cooking.git
git add .
git commit -m "Initial cookbook site"
git push -u origin main
```
