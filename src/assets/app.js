const placeholderImage = "images/recipe-placeholder.svg";
const maxVisibleTags = 18;

const state = {
  recipes: [],
  filteredRecipes: [],
  query: "",
  activeCategory: "all"
};

const elements = {
  search: document.querySelector("[data-search]"),
  searchForm: document.querySelector("[data-search-form]"),
  clear: document.querySelector("[data-clear]"),
  categories: document.querySelector("[data-categories]"),
  tags: document.querySelector("[data-tags]"),
  results: document.querySelector("[data-results]"),
  heroImage: document.querySelector("[data-hero-image]"),
  heroCategory: document.querySelector("[data-hero-category]"),
  heroTitle: document.querySelector("[data-hero-title]"),
  heroExcerpt: document.querySelector("[data-hero-excerpt]"),
  heroLink: document.querySelector("[data-hero-link]"),
  randomLinks: document.querySelectorAll("[data-random-link]")
};

function buildSearchParams({
  query = state.query,
  category = state.activeCategory
} = {}) {
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  if (category && category !== "all") {
    params.set("category", category);
  }

  return params;
}

function buildCatalogHref(options = {}) {
  const params = buildSearchParams(options);
  const query = params.toString();

  return query ? `${window.location.pathname}?${query}` : window.location.pathname;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalise(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slugify(value) {
  return normalise(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildTagHref(tag) {
  return `./tags/${slugify(tag)}/`;
}

function resolveAssetPath(value) {
  if (!value) {
    return `./${placeholderImage}`;
  }

  if (/^https?:\/\//.test(value)) {
    return value;
  }

  return `./${String(value).replace(/^\.\//, "")}`;
}

function hasCustomImage(recipe) {
  return recipe.image && recipe.image !== placeholderImage;
}

function sortRecipes(recipes) {
  return [...recipes].sort((left, right) => {
    if (hasCustomImage(left) !== hasCustomImage(right)) {
      return hasCustomImage(left) ? -1 : 1;
    }

    return left.title.localeCompare(right.title, "pt");
  });
}

function uniqueCategories() {
  const categories = new Set(state.recipes.map((recipe) => recipe.category));
  return [...categories].sort((left, right) => left.localeCompare(right, "pt"));
}

function parseSearchParams() {
  const params = new URLSearchParams(window.location.search);
  const query = params.get("q");
  const category = params.get("category");

  state.query = query ? query.trim() : "";
  state.activeCategory = category || "all";

  if (elements.search) {
    elements.search.value = state.query;
  }
}

function syncSearchParams() {
  window.history.replaceState(null, "", buildCatalogHref());
}

function recipeMatchesBase(recipe) {
  return state.activeCategory === "all" || recipe.category === state.activeCategory;
}

function recipeMatches(recipe) {
  const queryMatches =
    !state.query || normalise(recipe.searchText).includes(normalise(state.query));

  return recipeMatchesBase(recipe) && queryMatches;
}

function categoryPanelRecipes() {
  return state.recipes.filter((recipe) => {
    return !state.query || normalise(recipe.searchText).includes(normalise(state.query));
  });
}

function selectHeroRecipe() {
  const source = state.filteredRecipes.length ? state.filteredRecipes : state.recipes;
  const recipes = sortRecipes(source);

  return recipes.find(hasCustomImage) || recipes[0] || null;
}

function renderHeroRecipe() {
  const recipe = selectHeroRecipe();

  if (!recipe) {
    elements.heroImage.src = `./${placeholderImage}`;
    elements.heroImage.alt = "Sem receita em destaque";
    elements.heroCategory.textContent = "Receita em destaque";
    elements.heroTitle.textContent = "Sem receitas";
    elements.heroExcerpt.textContent = "Não foi possível carregar receitas.";
    elements.heroLink.href = "./";
    return;
  }

  elements.heroImage.src = resolveAssetPath(recipe.image);
  elements.heroImage.alt = recipe.title;
  elements.heroCategory.textContent = recipe.category;
  elements.heroTitle.textContent = recipe.title;
  elements.heroExcerpt.textContent = recipe.excerpt;
  elements.heroLink.href = recipe.href;
}

function renderCategories() {
  const scopedRecipes = categoryPanelRecipes();
  const counts = new Map();
  const representatives = new Map();

  for (const recipe of scopedRecipes) {
    counts.set(recipe.category, (counts.get(recipe.category) || 0) + 1);

    if (!representatives.has(recipe.category)) {
      representatives.set(recipe.category, recipe);
    } else if (hasCustomImage(recipe) && !hasCustomImage(representatives.get(recipe.category))) {
      representatives.set(recipe.category, recipe);
    }
  }

  const categories = uniqueCategories();
  const allCount = scopedRecipes.length;
  const allRepresentative = sortRecipes(scopedRecipes)[0];

  const items = [
    {
      value: "all",
      title: "Todas",
      count: allCount,
      recipe: allRepresentative
    },
    ...categories.map((category) => ({
      value: category,
      title: category,
      count: counts.get(category) || 0,
      recipe: representatives.get(category)
    }))
  ];

  elements.categories.innerHTML = items
    .map((item) => {
      const isActive = state.activeCategory === item.value;
      const image = item.recipe ? resolveAssetPath(item.recipe.image) : `./${placeholderImage}`;
      const subtitle = item.recipe ? item.recipe.title : "Sem destaque";
      const href = buildCatalogHref({
        category: item.value,
        query: state.query
      });

      return `
        <a
          class="signpost-card ${isActive ? "is-active" : ""}"
          data-category-filter="${escapeHtml(item.value)}"
          href="${escapeHtml(href)}"
          ${isActive ? 'aria-current="page"' : ""}
        >
          <div class="signpost-card-copy">
            <span class="signpost-card-title">${escapeHtml(item.title)}</span>
            <span class="signpost-card-meta">${escapeHtml(
              item.count === 1 ? "1 receita" : `${item.count} receitas`
            )}</span>
            <span class="signpost-card-subtitle">${escapeHtml(subtitle)}</span>
          </div>
          <img class="signpost-card-image" src="${escapeHtml(image)}" alt="${escapeHtml(item.title)}">
        </a>
      `;
    })
    .join("");
}

function renderTags() {
  const counts = new Map();

  for (const recipe of state.recipes) {
    for (const tag of recipe.tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  const visibleTags = [...counts.keys()]
    .map((tag) => ({
      tag,
      count: counts.get(tag) || 0
    }))
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return left.tag.localeCompare(right.tag, "pt");
    })
    .slice(0, maxVisibleTags);

  if (!visibleTags.length) {
    elements.tags.innerHTML = '<p class="empty-inline">Sem tags disponíveis.</p>';
    return;
  }

  elements.tags.innerHTML = visibleTags
    .map(
      (entry) => `
        <a class="tag-chip" href="${escapeHtml(buildTagHref(entry.tag))}">
          <span>${escapeHtml(entry.tag)}</span>
          <strong>${entry.count}</strong>
        </a>
      `
    )
    .join("");
}

function renderRecipeTags(recipe) {
  return recipe.tags
    .slice(0, 4)
    .map(
      (tag) => `
        <span class="recipe-tag">
          ${escapeHtml(tag)}
        </span>
      `
    )
    .join("");
}

function renderRecipeGrid() {
  if (!state.filteredRecipes.length) {
    elements.results.innerHTML = `
      <article class="recipe-card recipe-card-empty">
        <div class="recipe-card-body">
          <p class="eyebrow">Sem resultados</p>
          <h3>Nenhuma receita corresponde a este filtro.</h3>
          <p>Ajusta a pesquisa ou muda a categoria.</p>
        </div>
      </article>
    `;
    return;
  }

  elements.results.innerHTML = state.filteredRecipes
    .map((recipe) => {
      return `
        <a class="recipe-card" href="${escapeHtml(recipe.href)}">
          <figure class="recipe-card-media">
            <img
              src="${escapeHtml(resolveAssetPath(recipe.image))}"
              alt="${escapeHtml(recipe.title)}"
            >
          </figure>
          <div class="recipe-card-body">
            <div class="recipe-card-head">
              <span class="recipe-kicker">${escapeHtml(recipe.category)}</span>
              <span class="recipe-meta-line">${escapeHtml(
                `${recipe.ingredientCount || 0} ingredientes · ${recipe.stepCount || 0} passos`
              )}</span>
            </div>
            <h3>${escapeHtml(recipe.title)}</h3>
            <p>${escapeHtml(recipe.excerpt)}</p>
            <div class="recipe-card-tags">
              ${renderRecipeTags(recipe)}
            </div>
            <span class="text-link">Abrir receita</span>
          </div>
        </a>
      `;
    })
    .join("");
}

function updateRandomLinks() {
  for (const link of elements.randomLinks) {
    if (!state.filteredRecipes.length) {
      link.href = "./";
      link.classList.add("is-disabled");
      link.setAttribute("aria-disabled", "true");
      continue;
    }

    const index = Math.floor(Math.random() * state.filteredRecipes.length);
    const recipe = state.filteredRecipes[index];

    link.href = recipe.href;
    link.classList.remove("is-disabled");
    link.removeAttribute("aria-disabled");
  }
}

function normaliseState() {
  const categories = new Set(uniqueCategories());

  if (state.activeCategory !== "all" && !categories.has(state.activeCategory)) {
    state.activeCategory = "all";
  }
}

function applyFilters() {
  normaliseState();
  state.filteredRecipes = sortRecipes(state.recipes.filter(recipeMatches));
  document.body.classList.toggle(
    "is-searching",
    Boolean(state.query || state.activeCategory !== "all")
  );
  renderHeroRecipe();
  renderCategories();
  renderTags();
  renderRecipeGrid();
  updateRandomLinks();
  syncSearchParams();
}

function bindEvents() {
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    applyFilters();
  });

  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = elements.search.value.trim();
    applyFilters();
  });

  elements.clear.addEventListener("click", () => {
    state.query = "";
    state.activeCategory = "all";
    elements.search.value = "";
    applyFilters();
  });
}

async function init() {
  parseSearchParams();
  bindEvents();

  try {
    const response = await fetch("./data/recipes.json");

    if (!response.ok) {
      throw new Error(`Unexpected status: ${response.status}`);
    }

    state.recipes = await response.json();
    applyFilters();
  } catch (error) {
    elements.categories.innerHTML = "";
    elements.tags.innerHTML = "";
    elements.results.innerHTML = `
      <article class="recipe-card recipe-card-empty">
        <div class="recipe-card-body">
          <p class="eyebrow">Erro</p>
          <h3>Não foi possível carregar as receitas.</h3>
          <p>${escapeHtml(error.message)}</p>
        </div>
      </article>
    `;
  }
}

init();
