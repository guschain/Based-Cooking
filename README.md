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

### Guided option

Use the interactive generator:

```bash
npm run new-recipe
```

It asks for the title, category, tags, image, ingredients, preparation steps, and optional notes, then creates a new file in `recipes/`.

### Non-technical option

Copy `templates/recipe-template.md` into `recipes/`, rename it, and replace the visible placeholders:

- `[TITULO_DA_RECEITA]`
- `[CATEGORIA]`
- `[TAGS_SEPARADAS_POR_VIRGULAS]`
- `[CAMINHO_DA_IMAGEM]`
- `[[INGREDIENTES]]`
- `[[PREPARACAO]]`
- `[[NOTAS_SECTION]]`

The generator script also reads this template file, so non-technical users can change the default structure in one place without editing any JavaScript.

### Publish the change

After creating or editing a recipe, run:

```bash
npm run build
```

## Add an image

1. Put the image in `images/`.
2. Reference it in the recipe front matter, for example `image: images/frango-assado.jpg`.
3. Rebuild the site.

## Change the recipe template

Edit `templates/recipe-template.md`.

Keep these placeholders somewhere in the file so the generator can fill them:

- `[TITULO_DA_RECEITA]`
- `[CATEGORIA]`
- `[TAGS_SEPARADAS_POR_VIRGULAS]`
- `[CAMINHO_DA_IMAGEM]`
- `[[INGREDIENTES]]`
- `[[PREPARACAO]]`
- `[[NOTAS_SECTION]]`

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
