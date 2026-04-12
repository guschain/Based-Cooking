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

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildExcerpt(text) {
  if (!text) {
    return "";
  }

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
    introText: "",
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
      structured.introText = `${structured.introText} ${stripMarkdown(markdown)}`.trim();
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
      href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;700;800&display=swap"
      rel="stylesheet"
    >
    <link rel="stylesheet" href="${escapeHtml(stylesheetHref)}">
  </head>`;
}

function renderSiteHeader(depth, currentSection = "") {
  const homeHref = buildHomeHref(depth);
  const categoriesHref = buildCategoryIndexHref(depth);
  const recipesHref = buildRecipeIndexHref(depth);

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

function renderTextLink(label, href) {
  return `<a class="text-link" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function renderHomeMasthead(recipe) {
  return `
    <section class="masthead masthead-home">
      <div class="masthead-copy">
        <p class="eyebrow">Arquivo de cozinha</p>
        <h1 class="display-title">Receitas pensadas como páginas para abrir com gosto.</h1>
        <p class="masthead-dek">
          Um arquivo editorial de pratos, doces e refeições do dia a dia, organizado por capítulos
          e desenhado para escolher com calma.
        </p>
        <div class="masthead-actions">
          ${renderTextLink("Entrar nas categorias", buildCategoryIndexHref())}
          ${renderTextLink("Ver todas as receitas", buildRecipeIndexHref())}
        </div>
      </div>
      <figure class="masthead-figure">
        <img
          class="masthead-image"
          src="${escapeHtml(buildAssetHref(recipe.image, 0))}"
          alt="${escapeHtml(recipe.title)}"
        >
        <figcaption class="masthead-caption">
          <p class="eyebrow">Em destaque</p>
          <h2>${escapeHtml(recipe.title)}</h2>
          <p>${escapeHtml(recipe.excerpt)}</p>
          ${renderTextLink("Abrir receita", buildRecipeHref(recipe.slug))}
        </figcaption>
      </figure>
    </section>
  `;
}

function renderCollectionHero({ eyebrow, title, description, imageHref = "", imageAlt = "" }) {
  const mediaMarkup = imageHref
    ? `
      <figure class="collection-hero-media">
        <img src="${escapeHtml(imageHref)}" alt="${escapeHtml(imageAlt || title)}">
      </figure>
    `
    : "";

  return `
    <section class="collection-hero ${imageHref ? "has-media" : ""}">
      <div class="collection-hero-copy">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1 class="display-title">${escapeHtml(title)}</h1>
        <p class="collection-hero-dek">${escapeHtml(description)}</p>
      </div>
      ${mediaMarkup}
    </section>
  `;
}

function renderSectionIntro(eyebrow, title, description = "") {
  return `
    <div class="section-intro">
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h2 class="section-title">${escapeHtml(title)}</h2>
      ${description ? `<p class="section-copy">${escapeHtml(description)}</p>` : ""}
    </div>
  `;
}

function renderChapterFeature(category, depth) {
  const featuredRecipe = category.recipes.find(hasCustomImage) || category.recipes[0];
  const imageHref = buildAssetHref(featuredRecipe.image, depth);

  return `
    <article class="chapter-feature">
      <figure class="chapter-feature-media">
        <img src="${escapeHtml(imageHref)}" alt="${escapeHtml(category.name)}">
      </figure>
      <div class="chapter-feature-copy">
        <p class="eyebrow">Capítulo</p>
        <h3>${escapeHtml(category.name)}</h3>
        <p>${escapeHtml(category.description)}</p>
        ${renderTextLink("Ver receitas desta categoria", buildCategoryHref(category.slug, depth))}
      </div>
    </article>
  `;
}

function renderChapterListItem(category, depth) {
  const featuredRecipe = category.recipes.find(hasCustomImage) || category.recipes[0];
  const imageMarkup = featuredRecipe
    ? `
      <figure class="chapter-item-media">
        <img src="${escapeHtml(buildAssetHref(featuredRecipe.image, depth))}" alt="${escapeHtml(category.name)}">
      </figure>
    `
    : "";

  return `
    <a class="chapter-item" href="${escapeHtml(buildCategoryHref(category.slug, depth))}">
      <div class="chapter-item-copy">
        <p class="eyebrow">Categoria</p>
        <h3>${escapeHtml(category.name)}</h3>
        <p>${escapeHtml(category.description)}</p>
      </div>
      ${imageMarkup}
    </a>
  `;
}

function renderChapterSection(categories, depth) {
  const [featuredCategory, ...remainingCategories] = categories;

  return `
    <section class="editorial-section">
      ${renderSectionIntro(
        "Capítulos",
        "Entradas por tipo de prato, como num livro de cozinha bem ordenado.",
        "Cada categoria abre uma página própria, com uma seleção editorial de receitas desse universo."
      )}
      <div class="chapter-layout">
        ${renderChapterFeature(featuredCategory, depth)}
        <div class="chapter-list">
          ${remainingCategories.map((category) => renderChapterListItem(category, depth)).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderStoryEntry(recipe, depth, index, compact = false) {
  const summary = recipe.excerpt || "Abrir a receita completa para ver ingredientes e preparação.";

  return `
    <article class="story-entry ${index % 2 === 1 ? "is-reversed" : ""} ${compact ? "is-compact" : ""}">
      <a class="story-media" href="${escapeHtml(buildRecipeHref(recipe.slug, depth))}">
        <img src="${escapeHtml(buildAssetHref(recipe.image, depth))}" alt="${escapeHtml(recipe.title)}">
      </a>
      <div class="story-copy">
        <p class="eyebrow">${escapeHtml(recipe.category)}</p>
        <h3>${escapeHtml(recipe.title)}</h3>
        <p>${escapeHtml(summary)}</p>
        ${renderTextLink("Abrir receita", buildRecipeHref(recipe.slug, depth))}
      </div>
    </article>
  `;
}

function renderStoryRiver(recipes, depth, compact = false) {
  return `
    <div class="story-river ${compact ? "is-compact" : ""}">
      ${recipes.map((recipe, index) => renderStoryEntry(recipe, depth, index, compact)).join("")}
    </div>
  `;
}

function renderTagMarkup(tags) {
  return tags.map((tag) => `<span class="recipe-tag">${escapeHtml(tag)}</span>`).join("");
}

function renderStatisticMarkup(label, value) {
  return `
    <div class="recipe-fact">
      <span class="recipe-fact-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderArticleSection(title, content, extraClass = "") {
  if (!content) {
    return "";
  }

  return `
    <section class="article-section ${extraClass}">
      <div class="article-section-head">
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
    .map((section) => renderArticleSection(section.title, section.html))
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

      if (hasCustomImage(candidate)) {
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
    .slice(0, 3)
    .map((entry) => entry.candidate);
}

function buildCategoryDescription(name) {
  const key = slugify(name);
  const descriptions = {
    bebidas: "Bebidas para acompanhar a mesa, abrir a manhã ou fechar a refeição devagar.",
    entradas: "Receitas para começar a mesa com leveza, partilha e apetite.",
    "molhos-e-temperos": "Molhos, pastas e temperos para dar profundidade ao que vem a seguir.",
    "pequeno-almoco-e-lanches": "Ideias simples para manhãs, pausas curtas e pequenos rituais do dia.",
    "pratos-principais": "Pratos para almoço ou jantar, com presença de mesa e vontade de repetir.",
    sobremesas: "Doces para fechar a refeição com calma ou abrir espaço para um desvio feliz.",
    sopas: "Sopas e caldos para dias mais recolhidos, taças quentes e ritmo mais lento."
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
      recipes: groupedRecipes.sort((left, right) => {
        if (hasCustomImage(left) !== hasCustomImage(right)) {
          return hasCustomImage(left) ? -1 : 1;
        }

        return left.title.localeCompare(right.title, "pt");
      })
    }))
    .sort((left, right) => right.recipes.length - left.recipes.length || left.name.localeCompare(right.name, "pt"));
}

function selectShowcaseRecipes(recipes, limit) {
  const withImage = recipes.filter(hasCustomImage);
  const withoutImage = recipes.filter((recipe) => !hasCustomImage(recipe));

  return [...withImage, ...withoutImage].slice(0, limit);
}

function renderHomePage(recipes, categories) {
  const featuredRecipe = selectShowcaseRecipes(recipes, 1)[0];
  const featuredCategories = categories.slice(0, 5);
  const showcaseRecipes = selectShowcaseRecipes(recipes, 4);

  return `${buildDocumentHead({
    title: "Based Cooking",
    description: "Receitas organizadas como um arquivo editorial, com páginas próprias por categoria e por prato.",
    stylesheetHref: "./assets/styles.css"
  })}
  <body class="page page-home">
    <div class="site-shell">
      ${renderSiteHeader(0, "home")}
      ${renderHomeMasthead(featuredRecipe)}
      ${renderChapterSection(featuredCategories, 0)}
      <section class="editorial-section">
        ${renderSectionIntro(
          "Seleção",
          "Quatro páginas para abrir já, como numa sequência de revista.",
          "Fotografia grande, leitura clara e espaço para a receita respirar antes mesmo do clique."
        )}
        ${renderStoryRiver(showcaseRecipes, 0)}
      </section>
    </div>
  </body>
</html>
`;
}

function renderCategoriesIndexPage(categories) {
  const featuredCategory = categories[0];

  return `${buildDocumentHead({
    title: buildPageTitle("Categorias"),
    description: "Capítulos editoriais para navegar o arquivo de receitas.",
    stylesheetHref: "../assets/styles.css"
  })}
  <body class="page page-categories">
    <div class="site-shell">
      ${renderSiteHeader(1, "categories")}
      ${renderCollectionHero({
        eyebrow: "Capítulos",
        title: "Categorias para entrar pelo apetite, não pelo ruído.",
        description: "Cada coleção abre a sua própria página e organiza a leitura como um capítulo de livro de cozinha.",
        imageHref: buildAssetHref((featuredCategory.recipes.find(hasCustomImage) || featuredCategory.recipes[0]).image, 1),
        imageAlt: featuredCategory.name
      })}
      ${renderChapterSection(categories, 1)}
    </div>
  </body>
</html>
`;
}

function renderCategoryPage(category) {
  const depth = 2;
  const featureRecipe = category.recipes.find(hasCustomImage) || category.recipes[0];

  return `${buildDocumentHead({
    title: buildPageTitle(category.name),
    description: category.description,
    stylesheetHref: buildAssetHref("assets/styles.css", depth)
  })}
  <body class="page page-category">
    <div class="site-shell">
      ${renderSiteHeader(depth, "categories")}
      ${renderCollectionHero({
        eyebrow: "Categoria",
        title: category.name,
        description: category.description,
        imageHref: buildAssetHref(featureRecipe.image, depth),
        imageAlt: featureRecipe.title
      })}
      <section class="editorial-section">
        ${renderSectionIntro(
          "Arquivo da categoria",
          `Receitas de ${category.name.toLowerCase()} em leitura contínua.`,
          "Cada entrada abre para uma página própria, com fotografia dominante e receita completa."
        )}
        ${renderStoryRiver(category.recipes, depth)}
      </section>
    </div>
  </body>
</html>
`;
}

function renderRecipeIndexPage(recipes) {
  return `${buildDocumentHead({
    title: buildPageTitle("Receitas"),
    description: "Arquivo completo das receitas publicadas no site.",
    stylesheetHref: "../assets/styles.css"
  })}
  <body class="page page-recipes">
    <div class="site-shell">
      ${renderSiteHeader(1, "recipes")}
      ${renderCollectionHero({
        eyebrow: "Arquivo",
        title: "Todas as receitas num arquivo contínuo e sem distrações.",
        description: "Uma leitura simples, página após página, com prioridade total à fotografia, ao título e ao gesto de abrir."
      })}
      <section class="editorial-section">
        ${renderStoryRiver(recipes, 1, true)}
      </section>
    </div>
  </body>
</html>
`;
}

function renderRecipePage(recipe, context) {
  const { previousRecipe, nextRecipe, relatedRecipes } = context;
  const depth = 2;
  const stylesheetHref = buildAssetHref("assets/styles.css", depth);
  const imageHref = buildAssetHref(recipe.image, depth);
  const homeHref = buildHomeHref(depth);
  const categoryHref = buildCategoryHref(recipe.categorySlug, depth);
  const prevHref = previousRecipe ? buildRecipeHref(previousRecipe.slug, depth) : buildRecipeIndexHref(depth);
  const nextHref = nextRecipe ? buildRecipeHref(nextRecipe.slug, depth) : buildRecipeIndexHref(depth);
  const description = recipe.excerpt || `Receita de ${recipe.title}.`;
  const introMarkup = renderArticleSection("Introdução", recipe.introHtml, "article-section-intro");
  const notesMarkup = renderArticleSection("Notas", recipe.notesHtml);
  const extraMarkup = renderExtraSections(recipe.extraSections);
  const relatedMarkup = relatedRecipes.length
    ? `
      <section class="editorial-section editorial-section-related">
        ${renderSectionIntro("Continuação", "Mais páginas para abrir a seguir.")}
        ${renderStoryRiver(relatedRecipes, depth, true)}
      </section>
    `
    : "";

  return `${buildDocumentHead({
    title: buildPageTitle(recipe.title),
    description,
    stylesheetHref
  })}
  <body class="page page-recipe">
    <div class="site-shell">
      ${renderSiteHeader(depth, "recipes")}
      <article class="recipe-article">
        <header class="recipe-header">
          <div class="breadcrumb-row">
            <a href="${escapeHtml(homeHref)}">Início</a>
            <span>/</span>
            <a href="${escapeHtml(categoryHref)}">${escapeHtml(recipe.category)}</a>
            <span>/</span>
            <span>${escapeHtml(recipe.title)}</span>
          </div>
          <p class="eyebrow">Receita</p>
          <h1 class="display-title">${escapeHtml(recipe.title)}</h1>
          <p class="recipe-dek">${escapeHtml(description)}</p>
          <div class="recipe-meta-line">
            ${renderStatisticMarkup("Ingredientes", `${recipe.ingredientCount || 0}`)}
            ${renderStatisticMarkup("Passos", `${recipe.stepCount || 0}`)}
            <div class="recipe-meta-tags">
              <span class="recipe-tag recipe-tag-primary">${escapeHtml(recipe.category)}</span>
              ${renderTagMarkup(recipe.tags)}
            </div>
          </div>
        </header>

        <figure class="recipe-figure">
          <img src="${escapeHtml(imageHref)}" alt="${escapeHtml(recipe.title)}">
        </figure>

        <div class="recipe-body">
          <aside class="recipe-sidebar">
            ${renderArticleSection("Ingredientes", recipe.ingredientsHtml, "article-section-sidebar")}
            ${notesMarkup}
            <nav class="article-pagination" aria-label="Navegação entre receitas">
              ${renderTextLink("Mais desta categoria", categoryHref)}
              ${renderTextLink("Receita anterior", prevHref)}
              ${renderTextLink("Receita seguinte", nextHref)}
            </nav>
          </aside>

          <div class="recipe-main">
            ${introMarkup}
            ${renderArticleSection("Preparação", recipe.preparationHtml, "article-section-steps")}
            ${extraMarkup}
          </div>
        </div>
      </article>

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
    const bodyText = stripMarkdown(body);
    const title = data.title || fileName.replace(/\.md$/, "");
    const category = data.category || "Sem categoria";
    const tags = (data.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const slug = slugify(title);
    const leadText = structured.introText || bodyText;

    recipes.push({
      slug,
      title,
      category,
      categorySlug: slugify(category),
      tags,
      image: await resolveRecipeImage(data.image),
      excerpt: buildExcerpt(leadText),
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

async function main() {
  const recipes = await loadRecipes();

  if (!recipes.length) {
    throw new Error("No recipe files were found in recipes/.");
  }

  const categories = buildCategories(recipes);

  await fs.rm(outputDir, { recursive: true, force: true });
  await copyStaticSource();
  await writeRecipePages(recipes);
  await writeCategoryPages(categories);
  await fs.writeFile(path.join(outputDir, "index.html"), renderHomePage(recipes, categories), "utf8");

  console.log(`Built ${recipes.length} recipes and ${categories.length} categories into docs/.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
