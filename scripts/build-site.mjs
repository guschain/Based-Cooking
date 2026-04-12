import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const recipeDir = path.join(rootDir, "recipes");
const sourceDir = path.join(rootDir, "src");
const imageDir = path.join(rootDir, "images");
const outputDir = path.join(rootDir, "docs");
const placeholderImage = "images/recipe-placeholder.svg";
const recipePageDirName = "receitas";
const categoryPageDirName = "categorias";

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

function buildRecipeIndexHref(depth = 0) {
  return `${relativePrefix(depth)}${recipePageDirName}/`;
}

function buildCategoryHref(slug, depth = 0) {
  return `${relativePrefix(depth)}${categoryPageDirName}/${slug}/`;
}

function buildCategoryIndexHref(depth = 0) {
  return `${relativePrefix(depth)}${categoryPageDirName}/`;
}

function buildHomeHref(depth = 0) {
  return relativePrefix(depth);
}

function buildPageTitle(value) {
  return `${value} | Based Cooking`;
}

function hasCustomImage(recipe) {
  return recipe.image && recipe.image !== placeholderImage;
}

function buildDocumentHead({ title, description, stylesheetHref }) {
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
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
    >
    <link rel="stylesheet" href="${escapeHtml(stylesheetHref)}">
  </head>`;
}

function renderSiteHeader(depth, currentSection = "") {
  const homeHref = buildHomeHref(depth);
  const recipesHref = buildRecipeIndexHref(depth);
  const categoriesHref = buildCategoryIndexHref(depth);

  return `
    <header class="site-header">
      <a class="brand-link" href="${escapeHtml(homeHref)}">Based Cooking</a>
      <nav class="site-nav" aria-label="Navegação principal">
        <a class="nav-link ${currentSection === "home" ? "is-active" : ""}" href="${escapeHtml(homeHref)}">Início</a>
        <a class="nav-link ${currentSection === "categories" ? "is-active" : ""}" href="${escapeHtml(categoriesHref)}">Categorias</a>
        <a class="nav-link ${currentSection === "recipes" ? "is-active" : ""}" href="${escapeHtml(recipesHref)}">Receitas</a>
      </nav>
    </header>
  `;
}

function renderRecipeCard(recipe, depth, extraClass = "") {
  const summary = /^(ingredientes|preparacao|preparo)\b/i.test(recipe.excerpt)
    ? "Abre a receita completa para ver ingredientes e preparação passo a passo."
    : recipe.excerpt;

  return `
    <a class="recipe-card ${extraClass}" href="${escapeHtml(buildRecipeHref(recipe.slug, depth))}">
      <figure class="recipe-card-media">
        <img
          src="${escapeHtml(buildAssetHref(recipe.image, depth))}"
          alt="${escapeHtml(recipe.title)}"
        >
      </figure>
      <div class="recipe-card-body">
        <p class="card-kicker">${escapeHtml(recipe.category)}</p>
        <h3>${escapeHtml(recipe.title)}</h3>
        <p>${escapeHtml(summary)}</p>
        <span class="card-link">Abrir receita</span>
      </div>
    </a>
  `;
}

function renderCategoryCard(category, depth, extraClass = "") {
  const featuredRecipe = category.recipes.find(hasCustomImage) || category.recipes[0];
  const image = featuredRecipe ? buildAssetHref(featuredRecipe.image, depth) : buildAssetHref(placeholderImage, depth);
  const description = category.description || `Ver receitas de ${category.name.toLowerCase()}.`;

  return `
    <a class="collection-card ${extraClass}" href="${escapeHtml(buildCategoryHref(category.slug, depth))}">
      <div class="collection-card-copy">
        <p class="card-kicker">Categoria</p>
        <h3>${escapeHtml(category.name)}</h3>
        <p>${escapeHtml(description)}</p>
        <span class="card-link">Ver receitas</span>
      </div>
      <figure class="collection-card-media">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(category.name)}">
      </figure>
    </a>
  `;
}

function renderPageHero({ eyebrow, title, description, primaryHref, primaryLabel, secondaryHref = "", secondaryLabel = "", mediaImage = "", mediaAlt = "" }) {
  const secondaryMarkup = secondaryHref
    ? `<a class="button-secondary" href="${escapeHtml(secondaryHref)}">${escapeHtml(secondaryLabel)}</a>`
    : "";
  const mediaMarkup = mediaImage
    ? `
      <figure class="hero-media">
        <img src="${escapeHtml(mediaImage)}" alt="${escapeHtml(mediaAlt || title)}">
      </figure>
    `
    : "";

  return `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="hero-lead">${escapeHtml(description)}</p>
        <div class="hero-actions">
          <a class="button-primary" href="${escapeHtml(primaryHref)}">${escapeHtml(primaryLabel)}</a>
          ${secondaryMarkup}
        </div>
      </div>
      ${mediaMarkup}
    </section>
  `;
}

function renderSection(title, description, content, extraClass = "") {
  return `
    <section class="section-block ${extraClass}">
      <div class="section-heading">
        <p class="eyebrow">Based Cooking</p>
        <h2>${escapeHtml(title)}</h2>
        ${description ? `<p class="section-copy">${escapeHtml(description)}</p>` : ""}
      </div>
      ${content}
    </section>
  `;
}

function renderRecipeGrid(recipes, depth, featuredFirst = false) {
  if (!recipes.length) {
    return `
      <div class="empty-state">
        <h3>Sem receitas.</h3>
        <p>Adiciona uma nova receita em <code>recipes/</code> para a ver aqui.</p>
      </div>
    `;
  }

  return `
    <div class="recipe-grid">
      ${recipes
        .map((recipe, index) => renderRecipeCard(recipe, depth, featuredFirst && index === 0 ? "recipe-card-featured" : ""))
        .join("")}
    </div>
  `;
}

function renderCategoryGrid(categories, depth) {
  return `
    <div class="collection-grid">
      ${categories
        .map((category, index) => renderCategoryCard(category, depth, index === 0 ? "collection-card-featured" : ""))
        .join("")}
    </div>
  `;
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

function buildCategoryDescription(name) {
  const key = slugify(name);
  const descriptions = {
    bebidas: "Bebidas para acompanhar, servir ao pequeno-almoço ou fechar a refeição.",
    entradas: "Receitas para começar a mesa com algo rápido e partilhável.",
    "molhos-e-temperos": "Molhos, pastas e temperos para completar outros pratos.",
    "pequeno-almoco-e-lanches": "Ideias simples para manhãs, lanches e pausas rápidas.",
    "pratos-principais": "Pratos para almoço ou jantar, pensados para ser o centro da refeição.",
    sobremesas: "Doces e sobremesas para fechar a refeição ou servir em ocasião especial.",
    sopas: "Sopas e caldos para dias mais leves ou refeições reconfortantes."
  };

  return descriptions[key] || `Receitas reunidas em ${name.toLowerCase()}.`;
}

function buildCategories(recipes) {
  const grouped = new Map();

  for (const recipe of recipes) {
    if (!grouped.has(recipe.category)) {
      grouped.set(recipe.category, []);
    }

    grouped.get(recipe.category).push(recipe);
  }

  return [...grouped.entries()]
    .map(([name, groupedRecipes]) => ({
      name,
      slug: slugify(name),
      description: buildCategoryDescription(name),
      recipes: groupedRecipes.sort((left, right) => left.title.localeCompare(right.title, "pt"))
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "pt"));
}

function renderHomePage(recipes, categories) {
  const featuredRecipe = recipes.find((recipe) => recipe.image !== placeholderImage) || recipes[0];
  const prominentCategories = [...categories]
    .sort((left, right) => right.recipes.length - left.recipes.length || left.name.localeCompare(right.name, "pt"))
    .slice(0, 4);
  const featuredRecipes = recipes.filter((recipe) => recipe.image !== placeholderImage).slice(0, 6);

  return `${buildDocumentHead({
    title: "Based Cooking",
    description: "Receitas organizadas por categoria, com uma página dedicada para cada prato.",
    stylesheetHref: "./assets/styles.css"
  })}
  <body class="catalog-page">
    <div class="site-shell">
      ${renderSiteHeader(0, "home")}
      ${renderPageHero({
        eyebrow: "Receitas",
        title: "Encontra a próxima receita em segundos.",
        description: "Escolhe por tipo de prato ou abre diretamente uma receita já destacada. Cada opção leva-te para uma página própria, sem confusão de filtros.",
        primaryHref: buildRecipeIndexHref(),
        primaryLabel: "Ver todas as receitas",
        secondaryHref: buildCategoryIndexHref(),
        secondaryLabel: "Explorar categorias",
        mediaImage: buildAssetHref(featuredRecipe.image, 0),
        mediaAlt: featuredRecipe.title
      })}

      ${renderSection(
        "Escolhe por tipo de prato",
        "As categorias funcionam como páginas reais. Entras numa coleção e vês apenas as receitas desse tipo.",
        renderCategoryGrid(prominentCategories, 0)
      )}

      ${renderSection(
        "Receitas para abrir já",
        "Uma seleção direta para começar sem pensar demasiado.",
        renderRecipeGrid(featuredRecipes, 0, true)
      )}
    </div>
  </body>
</html>
`;
}

function renderCategoriesIndexPage(categories) {
  return `${buildDocumentHead({
    title: buildPageTitle("Categorias"),
    description: "Navega por categorias e abre coleções com páginas próprias.",
    stylesheetHref: "../assets/styles.css"
  })}
  <body class="catalog-page">
    <div class="site-shell">
      ${renderSiteHeader(1, "categories")}
      ${renderPageHero({
        eyebrow: "Categorias",
        title: "Escolhe pela forma como queres comer.",
        description: "Pratos principais, entradas, sobremesas e outras coleções com página própria para navegação mais clara.",
        primaryHref: buildRecipeIndexHref(1),
        primaryLabel: "Ver todas as receitas",
        secondaryHref: buildHomeHref(1),
        secondaryLabel: "Voltar ao início"
      })}
      ${renderSection(
        "Todas as categorias",
        "",
        renderCategoryGrid(categories, 1)
      )}
    </div>
  </body>
</html>
`;
}

function renderCategoryPage(category) {
  const depth = 2;
  const mediaRecipe = category.recipes.find(hasCustomImage) || category.recipes[0];

  return `${buildDocumentHead({
    title: buildPageTitle(category.name),
    description: category.description,
    stylesheetHref: buildAssetHref("assets/styles.css", depth)
  })}
  <body class="catalog-page">
    <div class="site-shell">
      ${renderSiteHeader(depth, "categories")}
      ${renderPageHero({
        eyebrow: "Categoria",
        title: category.name,
        description: category.description,
        primaryHref: buildRecipeIndexHref(depth),
        primaryLabel: "Ver todas as receitas",
        secondaryHref: buildCategoryIndexHref(depth),
        secondaryLabel: "Mais categorias",
        mediaImage: buildAssetHref(mediaRecipe.image, depth),
        mediaAlt: mediaRecipe.title
      })}
      ${renderSection(
        `${category.name}: receitas`,
        "Todas as receitas desta categoria, cada uma com a sua própria página.",
        renderRecipeGrid(category.recipes, depth, true)
      )}
    </div>
  </body>
</html>
`;
}

function renderRecipeIndexPage(recipes) {
  return `${buildDocumentHead({
    title: buildPageTitle("Receitas"),
    description: "Lista completa das receitas publicadas no site.",
    stylesheetHref: "../assets/styles.css"
  })}
  <body class="catalog-page">
    <div class="site-shell">
      ${renderSiteHeader(1, "recipes")}
      ${renderPageHero({
        eyebrow: "Receitas",
        title: "Todas as receitas num só sítio.",
        description: "Abre diretamente a receita certa ou entra numa categoria para reduzir a escolha.",
        primaryHref: buildCategoryIndexHref(1),
        primaryLabel: "Ver categorias",
        secondaryHref: buildHomeHref(1),
        secondaryLabel: "Voltar ao início"
      })}
      ${renderSection(
        "Catálogo completo",
        "",
        renderRecipeGrid(recipes, 1, true)
      )}
    </div>
  </body>
</html>
`;
}

function renderRecipePage(recipe, context) {
  const { previousRecipe, nextRecipe, relatedRecipes } = context;
  const stylesheetHref = buildAssetHref("assets/styles.css", 2);
  const imageHref = buildAssetHref(recipe.image, 2);
  const homeHref = buildHomeHref(2);
  const prevHref = previousRecipe ? buildRecipeHref(previousRecipe.slug, 2) : buildRecipeIndexHref(2);
  const nextHref = nextRecipe ? buildRecipeHref(nextRecipe.slug, 2) : buildRecipeIndexHref(2);
  const categoryHref = buildCategoryHref(recipe.categorySlug, 2);
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
      <section class="section-block">
        <div class="section-heading">
          <p class="eyebrow">Mais receitas</p>
          <h2>Continua a explorar</h2>
        </div>
        <div class="recipe-grid recipe-grid-compact">
          ${relatedRecipes.map((relatedRecipe) => renderRecipeCard(relatedRecipe, 2)).join("")}
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
    <div class="site-shell">
      ${renderSiteHeader(2, "recipes")}

      <section class="recipe-hero">
        <div class="recipe-hero-copy">
          <div class="breadcrumb-row">
            <a href="${escapeHtml(homeHref)}">Início</a>
            <span>/</span>
            <a href="${escapeHtml(categoryHref)}">${escapeHtml(recipe.category)}</a>
            <span>/</span>
            <span>${escapeHtml(recipe.title)}</span>
          </div>
          <p class="eyebrow">Receita</p>
          <h1>${escapeHtml(recipe.title)}</h1>
          <p class="hero-lead">${escapeHtml(description)}</p>
          <div class="recipe-hero-tags">
            <span class="recipe-tag recipe-tag-primary">${escapeHtml(recipe.category)}</span>
            ${renderTagMarkup(recipe.tags)}
          </div>
          <div class="metric-row">
            ${renderStatisticMarkup("Ingredientes", ingredientCount)}
            ${renderStatisticMarkup("Preparação", stepCount, "metric-panel-highlight")}
          </div>
          <div class="hero-actions">
            <a class="button-primary" href="${escapeHtml(categoryHref)}">Mais desta categoria</a>
            <a class="button-secondary" href="${escapeHtml(prevHref)}">Anterior</a>
            <a class="button-secondary" href="${escapeHtml(nextHref)}">Seguinte</a>
          </div>
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
      categorySlug: slugify(category),
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

  return recipes.sort((left, right) => left.title.localeCompare(right.title, "pt"));
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

  await fs.writeFile(path.join(recipeDirOutput, "index.html"), renderRecipeIndexPage(recipes), "utf8");
}

async function writeCategoryPages(categories) {
  const categoryDirOutput = path.join(outputDir, categoryPageDirName);
  await fs.mkdir(categoryDirOutput, { recursive: true });
  await fs.writeFile(path.join(categoryDirOutput, "index.html"), renderCategoriesIndexPage(categories), "utf8");

  for (const category of categories) {
    const pageDir = path.join(categoryDirOutput, category.slug);
    await fs.mkdir(pageDir, { recursive: true });
    await fs.writeFile(path.join(pageDir, "index.html"), renderCategoryPage(category), "utf8");
  }
}

function buildRecipeIndex(recipes) {
  return recipes.map((recipe) => ({
    slug: recipe.slug,
    title: recipe.title,
    category: recipe.category,
    categorySlug: recipe.categorySlug,
    tags: recipe.tags,
    image: recipe.image,
    excerpt: recipe.excerpt,
    ingredientCount: recipe.ingredientCount,
    stepCount: recipe.stepCount,
    searchText: recipe.searchText,
    href: buildRecipeHref(recipe.slug),
    categoryHref: buildCategoryHref(recipe.categorySlug)
  }));
}

async function main() {
  const recipes = await loadRecipes();

  if (!recipes.length) {
    throw new Error("No recipe files were found in recipes/.");
  }

  const categories = buildCategories(recipes);

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outputDir, "data"), { recursive: true });
  await copyStaticSource();
  await writeRecipePages(recipes);
  await writeCategoryPages(categories);
  await fs.writeFile(path.join(outputDir, "index.html"), renderHomePage(recipes, categories), "utf8");
  await fs.writeFile(
    path.join(outputDir, "data", "recipes.json"),
    `${JSON.stringify(buildRecipeIndex(recipes), null, 2)}\n`,
    "utf8"
  );

  console.log(`Built ${recipes.length} recipes and ${categories.length} categories into docs/.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
