import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const recipeDir = path.join(rootDir, "recipes");
const sourceDir = path.join(rootDir, "src");
const imageDir = path.join(rootDir, "images");
const outputDir = path.join(rootDir, "docs");
const placeholderImage = "images/recipe-placeholder.svg";
const recipePageDirName = "receitas";

function normalise(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
  return normalise(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!match) {
    return { data: {}, body: content };
  }

  const rawFrontMatter = match[1];
  const body = content.slice(match[0].length).trim();
  const data = {};

  for (const line of rawFrontMatter.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    data[key] = value;
  }

  return { data, body };
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let unorderedItems = [];
  let orderedItems = [];

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }

    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushUnordered = () => {
    if (!unorderedItems.length) {
      return;
    }

    html.push(
      `<ul>${unorderedItems.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`
    );
    unorderedItems = [];
  };

  const flushOrdered = () => {
    if (!orderedItems.length) {
      return;
    }

    html.push(
      `<ol>${orderedItems.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`
    );
    orderedItems = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushUnordered();
    flushOrdered();
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushAll();
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushAll();
      html.push("<hr>");
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);

    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^- (.*)$/);

    if (unorderedMatch) {
      flushParagraph();
      flushOrdered();
      unorderedItems.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);

    if (orderedMatch) {
      flushParagraph();
      flushUnordered();
      orderedItems.push(orderedMatch[1]);
      continue;
    }

    flushUnordered();
    flushOrdered();
    paragraph.push(trimmed);
  }

  flushAll();
  return html.join("\n");
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^- /gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildExcerpt(text) {
  if (text.length <= 170) {
    return text;
  }

  return `${text.slice(0, 167).trim()}...`;
}

function normaliseRelativePath(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

async function resolveRecipeImage(value) {
  const requestedPath = normaliseRelativePath(value);

  if (!requestedPath) {
    return placeholderImage;
  }

  if (/^https?:\/\//.test(requestedPath)) {
    return requestedPath;
  }

  try {
    await fs.access(path.join(rootDir, requestedPath));
    return requestedPath;
  } catch {
    return placeholderImage;
  }
}

function parseMarkdownSections(markdown) {
  const sections = [];
  const lines = markdown.split(/\r?\n/);
  let current = { title: "", lines: [] };

  const pushCurrent = () => {
    const content = current.lines.join("\n").trim();

    if (current.title || content) {
      sections.push({
        title: current.title,
        lines: [...current.lines]
      });
    }
  };

  for (const line of lines) {
    const headingMatch = line.trim().match(/^(#{1,6})\s+(.*)$/);

    if (headingMatch) {
      pushCurrent();
      current = {
        title: headingMatch[2].trim(),
        lines: []
      };
      continue;
    }

    current.lines.push(line);
  }

  pushCurrent();
  return sections;
}

function detectSectionType(title) {
  if (!title) {
    return "intro";
  }

  const heading = normalise(title).toLowerCase();

  if (heading.includes("ingrediente")) {
    return "ingredients";
  }

  if (heading.includes("preparacao") || heading.includes("preparo")) {
    return "preparation";
  }

  if (heading.includes("nota") || heading.includes("observa")) {
    return "notes";
  }

  return "generic";
}

function countMatchingLines(lines, pattern) {
  return lines.map((line) => line.trim()).filter((line) => pattern.test(line)).length;
}

function appendHtml(existingHtml, nextHtml) {
  if (!nextHtml) {
    return existingHtml;
  }

  if (!existingHtml) {
    return nextHtml;
  }

  return `${existingHtml}\n${nextHtml}`;
}

function buildStructuredSections(body) {
  const structured = {
    introHtml: "",
    ingredientsHtml: "",
    preparationHtml: "",
    notesHtml: "",
    extraSections: [],
    ingredientCount: 0,
    stepCount: 0
  };

  for (const section of parseMarkdownSections(body)) {
    const markdown = section.lines.join("\n").trim();
    const html = markdown ? markdownToHtml(markdown) : "";
    const type = detectSectionType(section.title);

    if (type === "intro") {
      structured.introHtml = appendHtml(structured.introHtml, html);
      continue;
    }

    if (type === "ingredients") {
      structured.ingredientsHtml = appendHtml(structured.ingredientsHtml, html);
      structured.ingredientCount += countMatchingLines(section.lines, /^- /);
      continue;
    }

    if (type === "preparation") {
      structured.preparationHtml = appendHtml(structured.preparationHtml, html);
      structured.stepCount += countMatchingLines(section.lines, /^\d+\.\s+/);
      continue;
    }

    if (type === "notes") {
      structured.notesHtml = appendHtml(structured.notesHtml, html);
      continue;
    }

    structured.extraSections.push({
      title: section.title,
      html
    });
  }

  return structured;
}

function relativePrefix(depth) {
  return depth === 0 ? "./" : "../".repeat(depth);
}

function buildAssetHref(assetPath, depth) {
  if (!assetPath) {
    return "";
  }

  if (/^https?:\/\//.test(assetPath)) {
    return assetPath;
  }

  return `${relativePrefix(depth)}${normaliseRelativePath(assetPath)}`;
}

function buildRecipeHref(slug, depth = 0) {
  return `${relativePrefix(depth)}${recipePageDirName}/${slug}/`;
}

function buildHomeHref(depth = 0) {
  return relativePrefix(depth);
}

function buildPageTitle(value) {
  return `${value} | Based Cooking`;
}

function buildDocumentHead({ title, description, stylesheetHref, canonicalHref = "" }) {
  const canonicalMarkup = canonicalHref
    ? `<link rel="canonical" href="${escapeHtml(canonicalHref)}">`
    : "";

  return `<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
      href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800&family=Public+Sans:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    >
    <link rel="stylesheet" href="${escapeHtml(stylesheetHref)}">
    ${canonicalMarkup}
  </head>`;
}

function renderTagMarkup(tags) {
  return tags.map((tag) => `<span class="recipe-tag">${escapeHtml(tag)}</span>`).join("");
}

function renderStatisticMarkup(label, value, accentClass = "") {
  return `
    <article class="metric-panel ${accentClass}">
      <span class="metric-label">${escapeHtml(label)}</span>
      <strong class="metric-value">${escapeHtml(value)}</strong>
    </article>
  `;
}

function buildRelatedRecipes(recipes, recipe) {
  return recipes
    .filter((candidate) => candidate.slug !== recipe.slug)
    .map((candidate) => {
      let score = 0;

      if (candidate.category === recipe.category) {
        score += 6;
      }

      for (const tag of candidate.tags) {
        if (recipe.tags.includes(tag)) {
          score += 2;
        }
      }

      if (candidate.image !== placeholderImage) {
        score += 1;
      }

      return { candidate, score };
    })
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return left.candidate.title.localeCompare(right.candidate.title, "pt");
    })
    .slice(0, 4)
    .map((entry) => entry.candidate);
}

function renderSectionCard(title, content, extraClass = "") {
  if (!content) {
    return "";
  }

  return `
    <section class="detail-surface ${extraClass}">
      <div class="detail-surface-head">
        <p class="eyebrow">Receita</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
      <div class="content-flow">
        ${content}
      </div>
    </section>
  `;
}

function renderExtraSections(sections) {
  return sections
    .filter((section) => section.html)
    .map((section) => renderSectionCard(section.title, section.html))
    .join("");
}

function renderRecipePage(recipe, context) {
  const { previousRecipe, nextRecipe, relatedRecipes } = context;
  const stylesheetHref = buildAssetHref("assets/styles.css", 2);
  const imageHref = buildAssetHref(recipe.image, 2);
  const homeHref = buildHomeHref(2);
  const prevHref = previousRecipe ? buildRecipeHref(previousRecipe.slug, 2) : homeHref;
  const nextHref = nextRecipe ? buildRecipeHref(nextRecipe.slug, 2) : homeHref;
  const description = recipe.excerpt || `Receita de ${recipe.title}.`;
  const ingredientCount = recipe.ingredientCount
    ? `${recipe.ingredientCount} ingrediente${recipe.ingredientCount === 1 ? "" : "s"}`
    : "Ingredientes";
  const stepCount = recipe.stepCount
    ? `${recipe.stepCount} passo${recipe.stepCount === 1 ? "" : "s"}`
    : "Preparação";
  const introMarkup = renderSectionCard("Introdução", recipe.introHtml);
  const notesMarkup = renderSectionCard("Notas", recipe.notesHtml);
  const relatedMarkup = relatedRecipes.length
    ? `
      <section class="catalog-section related-section">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Mais receitas</p>
            <h2>Continua a explorar</h2>
          </div>
        </div>
        <div class="related-filmstrip">
          ${relatedRecipes
            .map(
              (relatedRecipe) => `
                <a class="related-card" href="${escapeHtml(buildRecipeHref(relatedRecipe.slug, 2))}">
                  <figure class="related-card-media">
                    <img
                      src="${escapeHtml(buildAssetHref(relatedRecipe.image, 2))}"
                      alt="${escapeHtml(relatedRecipe.title)}"
                    >
                  </figure>
                  <div class="related-card-body">
                    <div class="recipe-card-head">
                      <span class="recipe-kicker">${escapeHtml(relatedRecipe.category)}</span>
                    </div>
                    <h3>${escapeHtml(relatedRecipe.title)}</h3>
                    <p>${escapeHtml(relatedRecipe.excerpt)}</p>
                    <span class="text-link">Abrir receita</span>
                  </div>
                </a>
              `
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  return `${buildDocumentHead({
    title: buildPageTitle(recipe.title),
    description,
    stylesheetHref
  })}
  <body class="recipe-page">
    <div class="site-shell site-shell-recipe">
      <header class="site-header">
        <a class="brand-link" href="${escapeHtml(homeHref)}">Based Cooking</a>
        <div class="site-header-actions">
          <a class="header-link" href="${escapeHtml(homeHref)}#receitas">Catálogo</a>
        </div>
      </header>

      <section class="recipe-hero-banner">
        <div class="recipe-hero-copy">
          <p class="eyebrow">Receita</p>
          <div class="breadcrumb-row">
            <span>Based Cooking</span>
            <span>/</span>
            <span>${escapeHtml(recipe.category)}</span>
          </div>
          <h1>${escapeHtml(recipe.title)}</h1>
          <p class="intro-copy recipe-summary">${escapeHtml(description)}</p>
          <div class="recipe-hero-tags">
            <span class="recipe-kicker">${escapeHtml(recipe.category)}</span>
            ${renderTagMarkup(recipe.tags)}
          </div>
          <div class="metric-row">
            ${renderStatisticMarkup("Ingredientes", ingredientCount)}
            ${renderStatisticMarkup("Preparação", stepCount, "metric-panel-highlight")}
          </div>
          <div class="hero-actions">
            <a class="button-primary" href="${escapeHtml(homeHref)}#receitas">Mais receitas</a>
            <a class="button-secondary" href="${escapeHtml(prevHref)}">Anterior</a>
            <a class="button-secondary" href="${escapeHtml(nextHref)}">Seguinte</a>
          </div>
          <a class="text-link text-link-inline" href="${escapeHtml(homeHref)}">Voltar ao catálogo</a>
        </div>

        <figure class="recipe-hero-media">
          <img src="${escapeHtml(imageHref)}" alt="${escapeHtml(recipe.title)}">
        </figure>
      </section>

      <main class="recipe-content-grid">
        <aside class="recipe-side-column">
          ${renderSectionCard("Ingredientes", recipe.ingredientsHtml, "detail-surface-sticky")}
          ${notesMarkup}
        </aside>

        <article class="recipe-main-column">
          ${introMarkup}
          ${renderSectionCard("Preparação", recipe.preparationHtml, "detail-surface-steps")}
          ${renderExtraSections(recipe.extraSections)}
        </article>
      </main>

      ${relatedMarkup}
    </div>
  </body>
</html>
`;
}

async function loadRecipes() {
  const entries = await fs.readdir(recipeDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "pt"));

  const recipes = [];

  for (const fileName of files) {
    const filePath = path.join(recipeDir, fileName);
    const content = await fs.readFile(filePath, "utf8");
    const { data, body } = parseFrontMatter(content);
    const structured = buildStructuredSections(body);
    const text = stripMarkdown(body);
    const title = data.title || fileName.replace(/\.md$/, "");
    const category = data.category || "Sem categoria";
    const tags = (data.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const slug = slugify(title);

    recipes.push({
      slug,
      title,
      category,
      tags,
      image: await resolveRecipeImage(data.image),
      excerpt: buildExcerpt(text),
      searchText: [title, category, tags.join(" "), text].join(" ").toLowerCase(),
      introHtml: structured.introHtml,
      ingredientsHtml: structured.ingredientsHtml,
      preparationHtml: structured.preparationHtml,
      notesHtml: structured.notesHtml,
      extraSections: structured.extraSections,
      ingredientCount: structured.ingredientCount,
      stepCount: structured.stepCount
    });
  }

  return recipes;
}

async function copyStaticSource() {
  await fs.cp(sourceDir, outputDir, { recursive: true });

  try {
    await fs.access(imageDir);
    await fs.cp(imageDir, path.join(outputDir, "images"), { recursive: true });
  } catch {
    // Images are optional.
  }
}

async function writeRecipePages(recipes) {
  const recipeDirOutput = path.join(outputDir, recipePageDirName);
  await fs.mkdir(recipeDirOutput, { recursive: true });

  for (const [index, recipe] of recipes.entries()) {
    const previousRecipe = index > 0 ? recipes[index - 1] : recipes[recipes.length - 1];
    const nextRecipe = index < recipes.length - 1 ? recipes[index + 1] : recipes[0];
    const relatedRecipes = buildRelatedRecipes(recipes, recipe);
    const pageDir = path.join(recipeDirOutput, recipe.slug);

    await fs.mkdir(pageDir, { recursive: true });
    await fs.writeFile(
      path.join(pageDir, "index.html"),
      renderRecipePage(recipe, {
        previousRecipe,
        nextRecipe,
        relatedRecipes
      }),
      "utf8"
    );
  }
}

function buildRecipeIndex(recipes) {
  return recipes.map((recipe) => ({
    slug: recipe.slug,
    title: recipe.title,
    category: recipe.category,
    tags: recipe.tags,
    image: recipe.image,
    excerpt: recipe.excerpt,
    ingredientCount: recipe.ingredientCount,
    stepCount: recipe.stepCount,
    searchText: recipe.searchText,
    href: buildRecipeHref(recipe.slug)
  }));
}

async function main() {
  const recipes = await loadRecipes();

  if (!recipes.length) {
    throw new Error("No recipe files were found in recipes/.");
  }

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outputDir, "data"), { recursive: true });
  await copyStaticSource();
  await writeRecipePages(recipes);
  await fs.writeFile(
    path.join(outputDir, "data", "recipes.json"),
    `${JSON.stringify(buildRecipeIndex(recipes), null, 2)}\n`,
    "utf8"
  );

  console.log(`Built ${recipes.length} recipes into docs/.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
