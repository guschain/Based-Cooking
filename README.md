# Based Cooking

Minimal static cookbook for GitHub Pages, built from Markdown files in `recipes/`.

## How it works

1. `recipes/*.md` is the source of truth.
2. Each recipe has a small front matter block for `title`, `category`, `tags`, and `image`.
3. `node scripts/build-site.mjs` generates the static site into `docs/`.
4. The GitHub Actions workflow deploys `docs/` to GitHub Pages on every push to `main`.

## GitHub Actions and Pages

The workflow file is `.github/workflows/deploy-pages.yml`.

What it does:

1. Checks out the repository.
2. Builds the static site from the recipe Markdown files.
3. Uploads the generated site.
4. Publishes it to GitHub Pages.

How often it runs:

1. Automatically on every push to `main`.
2. Manually whenever you click `Run workflow` in the `Actions` tab, because `workflow_dispatch` is enabled.

Why it matters:

1. You do not need to manually upload website files.
2. GitHub rebuilds and republishes the site for free each time recipes change.
3. This is what keeps the public cookbook online at `https://guschain.github.io/Based-Cooking/`.

How to use it:

1. Make a change in the repository.
2. Commit that change to `main` either in GitHub or from your computer.
3. Open the `Actions` tab and wait for `Deploy GitHub Pages` to finish.
4. Reload the public site after the workflow succeeds.

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

Step by step:

1. Open a terminal in this project folder.
2. Run `npm run new-recipe`.
3. Answer each question.
4. When the script finishes, a new file will appear in `recipes/`.
5. If you want to preview the site on your own computer, run `npm run build`.
6. Commit and push the new recipe to GitHub.
7. Wait for the `Deploy GitHub Pages` workflow to finish.

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

Step by step in GitHub, with no terminal:

1. Open `https://github.com/guschain/Based-Cooking`.
2. Open the `recipes` folder.
3. Click `Add file`, then `Create new file`.
4. Name the file something like `recipes/frango-assado.md`.
5. In another browser tab, open `templates/recipe-template.md`.
6. Copy its contents and paste them into the new file.
7. Replace all placeholders with the real recipe details.
8. Scroll down and click `Commit changes...`.
9. Commit directly to `main`.
10. Open the `Actions` tab and wait for `Deploy GitHub Pages` to finish.
11. Open `https://guschain.github.io/Based-Cooking/` and refresh the page.

### Publish the change

If you want to preview locally before publishing, run:

```bash
npm run build
```

This local build is optional for publishing. GitHub Actions builds the site again on GitHub after you push.

## Add an image

1. Put the image in `images/`.
2. Reference it in the recipe front matter, for example `image: images/frango-assado.jpg`.
3. If you want a local preview, rebuild the site.
4. Commit and push the image and recipe change.

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
5. If the first run fails right after setup, run the workflow again once from the `Actions` tab. The first failure can happen if Pages was not fully enabled yet when the workflow started.

If this local folder is not yet connected to the repo, use:

```bash
git init
git branch -M main
git remote add origin https://github.com/guschain/Based-Cooking.git
git add .
git commit -m "Initial cookbook site"
git push -u origin main
```
