const state = {
  recipes: [],
  filteredRecipes: [],
  activeTags: new Set(),
  activeCategory: "all",
  query: "",
  selectedSlug: ""
};

const elements = {
  search: document.querySelector("[data-search]"),
  category: document.querySelector("[data-category]"),
  tags: document.querySelector("[data-tags]"),
  resultsCount: document.querySelector("[data-results-count]"),
  results: document.querySelector("[data-results]"),
  detail: document.querySelector("[data-detail]"),
  clear: document.querySelector("[data-clear]")
};

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalise(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function resolveAssetPath(value) {
  if (!value) {
    return "";
  }

  if (/^https?:\/\//.test(value)) {
    return value;
  }

  return `./${value.replace(/^\.\//, "")}`;
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

function recipeMatches(recipe) {
  const matchesCategory =
    state.activeCategory === "all" || recipe.category === state.activeCategory;
  const matchesTags = [...state.activeTags].every((tag) => recipe.tags.includes(tag));
  const matchesQuery =
    !state.query || normalise(recipe.searchText).includes(normalise(state.query));

  return matchesCategory && matchesTags && matchesQuery;
}

function setSelection(slug, { updateHash = true } = {}) {
  state.selectedSlug = slug;

  if (updateHash && slug) {
    if (window.location.hash !== `#${slug}`) {
      window.location.hash = slug;
    }
  }

  renderRecipeList();
  renderDetail();
}

function syncSelectionFromHash() {
  const slugFromHash = window.location.hash.replace(/^#/, "");
  const filtered = state.filteredRecipes;

  if (slugFromHash && filtered.some((recipe) => recipe.slug === slugFromHash)) {
    state.selectedSlug = slugFromHash;
    renderRecipeList();
    renderDetail();
    return;
  }

  if (!filtered.length) {
    state.selectedSlug = "";
    renderRecipeList();
    renderDetail();
    return;
  }

  if (!filtered.some((recipe) => recipe.slug === state.selectedSlug)) {
    setSelection(filtered[0].slug, { updateHash: true });
    return;
  }

  renderRecipeList();
  renderDetail();
}

function renderCategoryOptions() {
  const options = [
    '<option value="all">Todas</option>',
    ...uniqueCategories().map(
      (category) =>
        `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
    )
  ];

  elements.category.innerHTML = options.join("");
  elements.category.value = state.activeCategory;
}

function renderTags() {
  const tags = uniqueTags();

  if (!tags.length) {
    elements.tags.innerHTML = '<p class="results-count">Sem tags disponiveis.</p>';
    return;
  }

  elements.tags.innerHTML = tags
    .map((tag) => {
      const isActive = state.activeTags.has(tag);
      const className = isActive ? "tag-chip is-active" : "tag-chip";

      return `<button class="${className}" type="button" data-tag="${escapeHtml(tag)}">${escapeHtml(
        tag
      )}</button>`;
    })
    .join("");

  for (const button of elements.tags.querySelectorAll("[data-tag]")) {
    button.addEventListener("click", () => {
      const tag = button.dataset.tag;

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

function renderRecipeList() {
  const recipes = state.filteredRecipes;

  elements.resultsCount.textContent =
    recipes.length === 1 ? "1 receita encontrada" : `${recipes.length} receitas encontradas`;

  if (!recipes.length) {
    elements.results.innerHTML =
      '<div class="empty-state"><div><p class="eyebrow">Sem resultados</p><p>Ajusta a pesquisa ou remove alguns filtros.</p></div></div>';
    return;
  }

  elements.results.innerHTML = recipes
    .map((recipe) => {
      const isActive = recipe.slug === state.selectedSlug;
      const className = isActive ? "recipe-card is-active" : "recipe-card";
      const meta = [
        `<span class="meta-pill">${escapeHtml(recipe.category)}</span>`,
        ...recipe.tags
          .slice(0, 4)
          .map((tag) => `<span class="meta-pill is-tag">${escapeHtml(tag)}</span>`)
      ].join("");

      return `
        <button class="${className}" type="button" data-slug="${escapeHtml(recipe.slug)}">
          <h3>${escapeHtml(recipe.title)}</h3>
          <div class="recipe-meta">${meta}</div>
          <p>${escapeHtml(recipe.excerpt)}</p>
        </button>
      `;
    })
    .join("");

  for (const button of elements.results.querySelectorAll("[data-slug]")) {
    button.addEventListener("click", () => {
      const slug = button.dataset.slug;

      if (slug) {
        setSelection(slug);
      }
    });
  }
}

function renderDetail() {
  const recipe = state.filteredRecipes.find((item) => item.slug === state.selectedSlug);

  if (!recipe) {
    elements.detail.innerHTML = `
      <div class="empty-state">
        <div>
          <p class="eyebrow">Sem receita ativa</p>
          <h2>Escolhe uma receita para ver os detalhes.</h2>
        </div>
      </div>
    `;
    return;
  }

  const imageMarkup = recipe.image
    ? `
      <figure class="recipe-photo">
        <img src="${escapeHtml(resolveAssetPath(recipe.image))}" alt="${escapeHtml(recipe.title)}">
      </figure>
    `
    : "";

  const meta = [
    `<span class="meta-pill">${escapeHtml(recipe.category)}</span>`,
    ...recipe.tags.map((tag) => `<span class="meta-pill is-tag">${escapeHtml(tag)}</span>`)
  ].join("");

  elements.detail.innerHTML = `
    ${imageMarkup}
    <p class="eyebrow">Receita</p>
    <h2>${escapeHtml(recipe.title)}</h2>
    <div class="recipe-meta">${meta}</div>
    <article class="recipe-content">${recipe.html}</article>
  `;
}

function applyFilters() {
  state.filteredRecipes = state.recipes.filter(recipeMatches);
  renderTags();
  syncSelectionFromHash();
}

function bindEvents() {
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    applyFilters();
  });

  elements.category.addEventListener("change", (event) => {
    state.activeCategory = event.target.value;
    applyFilters();
  });

  elements.clear.addEventListener("click", () => {
    state.query = "";
    state.activeCategory = "all";
    state.activeTags.clear();
    elements.search.value = "";
    elements.category.value = "all";
    applyFilters();
  });

  window.addEventListener("hashchange", () => {
    syncSelectionFromHash();
  });
}

async function init() {
  bindEvents();

  try {
    const response = await fetch("./data/recipes.json");

    if (!response.ok) {
      throw new Error(`Unexpected status: ${response.status}`);
    }

    state.recipes = await response.json();
    state.filteredRecipes = [...state.recipes];
    renderCategoryOptions();
    applyFilters();
  } catch (error) {
    elements.resultsCount.textContent = "Nao foi possivel carregar as receitas.";
    elements.results.innerHTML = "";
    elements.detail.innerHTML = `
      <div class="empty-state">
        <div>
          <p class="eyebrow">Erro</p>
          <h2>Falha ao carregar o site.</h2>
          <p>${escapeHtml(error.message)}</p>
        </div>
      </div>
    `;
  }
}

init();
