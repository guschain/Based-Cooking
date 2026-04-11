const placeholderImage = "images/recipe-placeholder.svg";
const maxVisibleTags = 16;
const featuredRecipeCount = 4;

const state = {
  recipes: [],
  filteredRecipes: [],
  query: "",
  activeCategory: "all",
  activeTags: new Set()
};

const elements = {
  search: document.querySelector("[data-search]"),
  clear: document.querySelector("[data-clear]"),
  categories: document.querySelector("[data-categories]"),
  tags: document.querySelector("[data-tags]"),
  results: document.querySelector("[data-results]"),
  resultsTitle: document.querySelector("[data-results-title]"),
  resultsCopy: document.querySelector("[data-results-copy]"),
  totalRecipes: document.querySelector("[data-total-recipes]"),
  visibleRecipes: document.querySelector("[data-visible-recipes]"),
  featuredGrid: document.querySelector("[data-featured-grid]"),
  randomLink: document.querySelector("[data-random-link]")
};

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

function uniqueCategories() {
  const categories = new Set(state.recipes.map((recipe) => recipe.category));
  return [...categories].sort((left, right) => left.localeCompare(right, "pt"));
}

function uniqueTags() {
  const tags = new Set();

  for (const recipe of state.recipes) {
    for (const tag of recipe.tags) {
      tags.add(tag);
    }
  }

  return [...tags].sort((left, right) => left.localeCompare(right, "pt"));
}

function sortRecipes(recipes) {
  return [...recipes].sort((left, right) => {
    if (hasCustomImage(left) !== hasCustomImage(right)) {
      return hasCustomImage(left) ? -1 : 1;
    }

    return left.title.localeCompare(right.title, "pt");
  });
}

function parseSearchParams() {
  const params = new URLSearchParams(window.location.search);
  const query = params.get("q");
  const category = params.get("category");
  const tags = params.get("tags");

  state.query = query ? query.trim() : "";
  state.activeCategory = category || "all";
  state.activeTags = new Set(
    (tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
  );

  if (elements.search) {
    elements.search.value = state.query;
  }
}

function syncSearchParams() {
  const params = new URLSearchParams();

  if (state.query) {
    params.set("q", state.query);
  }

  if (state.activeCategory !== "all") {
    params.set("category", state.activeCategory);
  }

  if (state.activeTags.size) {
    params.set("tags", [...state.activeTags].join(","));
  }

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, "", nextUrl);
}

function recipeMatchesBase(recipe) {
  const categoryMatches =
    state.activeCategory === "all" || recipe.category === state.activeCategory;
  const tagMatches = [...state.activeTags].every((tag) => recipe.tags.includes(tag));

  return categoryMatches && tagMatches;
}

function recipeMatches(recipe) {
  const queryMatches =
    !state.query || normalise(recipe.searchText).includes(normalise(state.query));

  return recipeMatchesBase(recipe) && queryMatches;
}

function tagPanelRecipes() {
  return state.recipes.filter((recipe) => {
    const queryMatches =
      !state.query || normalise(recipe.searchText).includes(normalise(state.query));
    const categoryMatches =
      state.activeCategory === "all" || recipe.category === state.activeCategory;

    return queryMatches && categoryMatches;
  });
}

function categoryPanelRecipes() {
  return state.recipes.filter((recipe) => {
    const queryMatches =
      !state.query || normalise(recipe.searchText).includes(normalise(state.query));
    const tagMatches = [...state.activeTags].every((tag) => recipe.tags.includes(tag));

    return queryMatches && tagMatches;
  });
}

function buildFilterSummary() {
  const parts = [];

  if (state.activeCategory !== "all") {
    parts.push(`Categoria: ${state.activeCategory}`);
  }

  if (state.activeTags.size) {
    parts.push(`Tags: ${[...state.activeTags].join(", ")}`);
  }

  if (state.query) {
    parts.push(`Pesquisa: "${state.query}"`);
  }

  return parts.length ? parts.join(" | ") : "Catálogo completo";
}

function renderHeroStats() {
  elements.totalRecipes.textContent = String(state.recipes.length);
  elements.visibleRecipes.textContent = String(state.filteredRecipes.length);
}

function renderResultsSummary() {
  const count = state.filteredRecipes.length;
  const title =
    count === 1 ? "1 receita pronta a abrir" : `${count} receitas prontas a abrir`;

  elements.resultsTitle.textContent = title;
  elements.resultsCopy.textContent =
    count === 0
      ? "Não há receitas para este filtro. Ajusta a pesquisa ou remove uma tag."
      : buildFilterSummary();
}

function renderFeaturedGrid() {
  const source = state.filteredRecipes.length ? state.filteredRecipes : state.recipes;
  const featured = sortRecipes(source).slice(0, featuredRecipeCount);

  if (!featured.length) {
    elements.featuredGrid.innerHTML = `
      <article class="showcase-card showcase-card-loading">
        <div class="showcase-card-body">
          <p>Sem receitas em destaque para este filtro.</p>
        </div>
      </article>
    `;
    return;
  }

  elements.featuredGrid.innerHTML = featured
    .map(
      (recipe, index) => `
        <a class="showcase-card showcase-card-${index + 1}" href="${escapeHtml(recipe.href)}">
          <img
            class="showcase-card-media"
            src="${escapeHtml(resolveAssetPath(recipe.image))}"
            alt="${escapeHtml(recipe.title)}"
          >
          <div class="showcase-card-body">
            <span class="meta-pill">${escapeHtml(recipe.category)}</span>
            <h2>${escapeHtml(recipe.title)}</h2>
            <p>${escapeHtml(recipe.excerpt)}</p>
          </div>
        </a>
      `
    )
    .join("");
}

function renderCategories() {
  const counts = new Map();

  for (const recipe of categoryPanelRecipes()) {
    counts.set(recipe.category, (counts.get(recipe.category) || 0) + 1);
  }

  const categories = uniqueCategories();
  const allCount = categoryPanelRecipes().length;

  elements.categories.innerHTML = [
    `
      <button
        class="category-pill ${state.activeCategory === "all" ? "is-active" : ""}"
        type="button"
        data-category-filter="all"
      >
        <span>Todas</span>
        <strong>${allCount}</strong>
      </button>
    `,
    ...categories.map((category) => `
      <button
        class="category-pill ${state.activeCategory === category ? "is-active" : ""}"
        type="button"
        data-category-filter="${escapeHtml(category)}"
      >
        <span>${escapeHtml(category)}</span>
        <strong>${counts.get(category) || 0}</strong>
      </button>
    `)
  ].join("");

  for (const button of elements.categories.querySelectorAll("[data-category-filter]")) {
    button.addEventListener("click", () => {
      state.activeCategory = button.dataset.categoryFilter || "all";
      applyFilters();
    });
  }
}

function renderTags() {
  const counts = new Map();

  for (const recipe of tagPanelRecipes()) {
    for (const tag of recipe.tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  const visibleTags = [...new Set([...counts.keys(), ...state.activeTags])]
    .map((tag) => ({
      tag,
      count: counts.get(tag) || 0,
      active: state.activeTags.has(tag)
    }))
    .sort((left, right) => {
      if (left.active !== right.active) {
        return left.active ? -1 : 1;
      }

      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return left.tag.localeCompare(right.tag, "pt");
    })
    .slice(0, maxVisibleTags);

  if (!visibleTags.length) {
    elements.tags.innerHTML = '<p class="empty-inline">Sem tags disponíveis para este filtro.</p>';
    return;
  }

  elements.tags.innerHTML = visibleTags
    .map(
      (entry) => `
        <button
          class="tag-pill ${entry.active ? "is-active" : ""}"
          type="button"
          data-tag-filter="${escapeHtml(entry.tag)}"
        >
          <span>${escapeHtml(entry.tag)}</span>
          <strong>${entry.count}</strong>
        </button>
      `
    )
    .join("");

  for (const button of elements.tags.querySelectorAll("[data-tag-filter]")) {
    button.addEventListener("click", () => {
      const tag = button.dataset.tagFilter;

      if (!tag) {
        return;
      }

      if (state.activeTags.has(tag)) {
        state.activeTags.delete(tag);
      } else {
        state.activeTags.add(tag);
      }

      applyFilters();
    });
  }
}

function renderRecipeGrid() {
  if (!state.filteredRecipes.length) {
    elements.results.innerHTML = `
      <article class="empty-panel">
        <p class="section-kicker">Sem resultados</p>
        <h3>Nenhuma receita corresponde a este filtro.</h3>
        <p>Ajusta a pesquisa, remove uma tag ou volta ao catálogo completo.</p>
      </article>
    `;
    return;
  }

  elements.results.innerHTML = state.filteredRecipes
    .map(
      (recipe) => `
        <a class="recipe-card" href="${escapeHtml(recipe.href)}">
          <figure class="recipe-card-media">
            <img
              src="${escapeHtml(resolveAssetPath(recipe.image))}"
              alt="${escapeHtml(recipe.title)}"
            >
          </figure>
          <div class="recipe-card-body">
            <div class="recipe-card-topline">
              <span class="meta-pill">${escapeHtml(recipe.category)}</span>
              <span class="recipe-card-stats">
                ${recipe.ingredientCount || 0} ing. · ${recipe.stepCount || 0} passos
              </span>
            </div>
            <h3>${escapeHtml(recipe.title)}</h3>
            <p>${escapeHtml(recipe.excerpt)}</p>
            <div class="tag-stack">
              ${recipe.tags
                .slice(0, 4)
                .map((tag) => `<span class="meta-pill meta-pill-tag">${escapeHtml(tag)}</span>`)
                .join("")}
            </div>
          </div>
        </a>
      `
    )
    .join("");
}

function updateRandomLink() {
  if (!elements.randomLink) {
    return;
  }

  if (!state.filteredRecipes.length) {
    elements.randomLink.href = "./";
    elements.randomLink.classList.add("is-disabled");
    elements.randomLink.setAttribute("aria-disabled", "true");
    return;
  }

  const index = Math.floor(Math.random() * state.filteredRecipes.length);
  const recipe = state.filteredRecipes[index];

  elements.randomLink.href = recipe.href;
  elements.randomLink.classList.remove("is-disabled");
  elements.randomLink.removeAttribute("aria-disabled");
}

function normaliseState() {
  const categories = new Set(uniqueCategories());
  const tags = new Set(uniqueTags());

  if (state.activeCategory !== "all" && !categories.has(state.activeCategory)) {
    state.activeCategory = "all";
  }

  state.activeTags = new Set([...state.activeTags].filter((tag) => tags.has(tag)));
}

function applyFilters() {
  normaliseState();
  state.filteredRecipes = sortRecipes(state.recipes.filter(recipeMatches));
  renderHeroStats();
  renderResultsSummary();
  renderFeaturedGrid();
  renderCategories();
  renderTags();
  renderRecipeGrid();
  updateRandomLink();
  syncSearchParams();
}

function bindEvents() {
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    applyFilters();
  });

  elements.clear.addEventListener("click", () => {
    state.query = "";
    state.activeCategory = "all";
    state.activeTags.clear();
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
    elements.resultsTitle.textContent = "Erro ao carregar";
    elements.resultsCopy.textContent = "Confirma se o build do site foi publicado.";
    elements.categories.innerHTML = "";
    elements.tags.innerHTML = "";
    elements.featuredGrid.innerHTML = `
      <article class="showcase-card showcase-card-loading">
        <div class="showcase-card-body">
          <p>${escapeHtml(error.message)}</p>
        </div>
      </article>
    `;
    elements.results.innerHTML = `
      <article class="empty-panel">
        <p class="section-kicker">Erro</p>
        <h3>Não foi possível carregar as receitas.</h3>
        <p>${escapeHtml(error.message)}</p>
      </article>
    `;
  }
}

init();
