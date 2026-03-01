const maxSuggestions = 6;

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
  searchSuggestions: document.querySelector("[data-search-suggestions]"),
  category: document.querySelector("[data-category]"),
  tags: document.querySelector("[data-tags]"),
  totalRecipes: document.querySelector("[data-total-recipes]"),
  visibleRecipes: document.querySelector("[data-visible-recipes]"),
  resultsSummary: document.querySelector("[data-results-summary]"),
  resultsLabel: document.querySelector("[data-results-label]"),
  resultsCount: document.querySelector("[data-results-count]"),
  resultsHelp: document.querySelector("[data-results-help]"),
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

function baseFiltersMatch(recipe) {
  const matchesCategory =
    state.activeCategory === "all" || recipe.category === state.activeCategory;
  const matchesTags = [...state.activeTags].every((tag) => recipe.tags.includes(tag));

  return matchesCategory && matchesTags;
}

function recipeMatches(recipe) {
  const matchesQuery =
    !state.query || normalise(recipe.searchText).includes(normalise(state.query));

  return baseFiltersMatch(recipe) && matchesQuery;
}

function buildFilterLabel() {
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

  if (!parts.length) {
    return "Livro completo";
  }

  return parts.join(" | ");
}

function currentSelectionIsVisible() {
  return state.filteredRecipes.some((recipe) => recipe.slug === state.selectedSlug);
}

function clearSelection({ updateHash = true } = {}) {
  state.selectedSlug = "";

  if (updateHash && window.location.hash) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`
    );
  }
}

function setSelection(slug, { updateHash = true } = {}) {
  state.selectedSlug = slug;

  if (updateHash) {
    if (slug) {
      if (window.location.hash !== `#${slug}`) {
        window.location.hash = slug;
      }
    } else if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );
    }
  }

  renderResultsSummary();
  renderRecipeList();
  renderDetail();
  renderSearchSuggestions();
}

function syncSelectionFromHash() {
  const slugFromHash = window.location.hash.replace(/^#/, "");

  if (slugFromHash && state.filteredRecipes.some((recipe) => recipe.slug === slugFromHash)) {
    state.selectedSlug = slugFromHash;
  } else if (!currentSelectionIsVisible()) {
    clearSelection({ updateHash: Boolean(slugFromHash) });
  }

  renderResultsSummary();
  renderRecipeList();
  renderDetail();
  renderSearchSuggestions();
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

function renderHeroStats() {
  elements.totalRecipes.textContent = String(state.recipes.length);
  elements.visibleRecipes.textContent = String(state.filteredRecipes.length);
}

function renderTags() {
  const tags = uniqueTags();

  if (!tags.length) {
    elements.tags.innerHTML = '<p class="results-summary-help">Sem tags disponiveis.</p>';
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

function renderResultsSummary() {
  const count = state.filteredRecipes.length;
  const filterLabel = buildFilterLabel();

  elements.resultsLabel.textContent = filterLabel;
  elements.resultsCount.textContent =
    count === 1 ? "1 receita disponivel" : `${count} receitas disponiveis`;

  if (!count) {
    elements.resultsHelp.textContent = "Ajusta a pesquisa ou remove alguns filtros.";
    return;
  }

  if (!state.selectedSlug) {
    elements.resultsHelp.textContent =
      "Escolhe uma receita na lista ou no painel da direita para abrir os detalhes.";
    return;
  }

  elements.resultsHelp.textContent =
    "A lista continua visivel para poderes trocar de receita dentro deste filtro.";
}

function renderRecipeList() {
  const recipes = state.filteredRecipes;

  if (!recipes.length) {
    elements.results.innerHTML =
      '<div class="empty-state empty-state-compact"><div><p class="eyebrow">Sem resultados</p><p>Ajusta a pesquisa ou remove alguns filtros.</p></div></div>';
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

function renderSearchSuggestions() {
  const query = state.query.trim();
  const exactSelectedMatch =
    state.selectedSlug &&
    state.filteredRecipes.some(
      (recipe) =>
        recipe.slug === state.selectedSlug && normalise(recipe.title) === normalise(query)
    );

  if (!query || !state.filteredRecipes.length || exactSelectedMatch) {
    elements.searchSuggestions.hidden = true;
    elements.searchSuggestions.innerHTML = "";
    return;
  }

  const suggestions = state.filteredRecipes.slice(0, maxSuggestions);
  const extraCount = Math.max(0, state.filteredRecipes.length - suggestions.length);

  elements.searchSuggestions.hidden = false;
  elements.searchSuggestions.innerHTML = `
    ${suggestions
      .map(
        (recipe) => `
          <button
            class="search-suggestion"
            type="button"
            data-suggestion-slug="${escapeHtml(recipe.slug)}"
          >
            <span class="search-suggestion-title">${escapeHtml(recipe.title)}</span>
            <span class="search-suggestion-meta">${escapeHtml(recipe.category)}</span>
          </button>
        `
      )
      .join("")}
    ${
      extraCount
        ? `<p class="search-suggestion-more">+ ${extraCount} ${
            extraCount === 1 ? "receita compativel" : "receitas compativeis"
          }</p>`
        : ""
    }
  `;

  for (const button of elements.searchSuggestions.querySelectorAll("[data-suggestion-slug]")) {
    button.addEventListener("click", () => {
      const slug = button.dataset.suggestionSlug;
      const recipe = state.recipes.find((item) => item.slug === slug);

      if (!slug || !recipe) {
        return;
      }

      state.query = recipe.title;
      elements.search.value = recipe.title;
      applyFilters();
      setSelection(slug);
    });
  }
}

function renderDetail() {
  const recipe = state.filteredRecipes.find((item) => item.slug === state.selectedSlug);

  if (!recipe) {
    const count = state.filteredRecipes.length;
    if (!count) {
      elements.detail.innerHTML = `
        <div class="detail-placeholder detail-placeholder-empty">
          <p class="eyebrow">${escapeHtml(buildFilterLabel())}</p>
          <h2>Nenhuma receita corresponde a este filtro.</h2>
          <p class="detail-placeholder-copy">
            Tenta outra pesquisa, muda a categoria ou remove algumas tags.
          </p>
        </div>
      `;
      return;
    }

    const quickPickButtons = state.filteredRecipes
      .map(
        (item) => `
          <button
            class="detail-picker-button"
            type="button"
            data-detail-pick="${escapeHtml(item.slug)}"
          >
            <span class="detail-picker-title">${escapeHtml(item.title)}</span>
            <span class="detail-picker-meta">${escapeHtml(item.category)}</span>
          </button>
        `
      )
      .join("");

    elements.detail.innerHTML = `
      <div class="detail-placeholder">
        <p class="eyebrow">${escapeHtml(buildFilterLabel())}</p>
        <div class="detail-placeholder-head">
          <h2>${escapeHtml(count === 1 ? "1 receita neste filtro" : `${count} receitas neste filtro`)}</h2>
          <p class="detail-placeholder-copy">
            Escolhe uma receita abaixo ou usa a lista da esquerda. Nada e aberto automaticamente.
          </p>
        </div>
        <div class="detail-picker-list">${quickPickButtons}</div>
      </div>
    `;

    for (const button of elements.detail.querySelectorAll("[data-detail-pick]")) {
      button.addEventListener("click", () => {
        const slug = button.dataset.detailPick;

        if (slug) {
          setSelection(slug);
        }
      });
    }

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
  renderHeroStats();
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
    clearSelection();
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
    renderHeroStats();
    applyFilters();
  } catch (error) {
    elements.resultsLabel.textContent = "Erro";
    elements.resultsCount.textContent = "Nao foi possivel carregar as receitas.";
    elements.resultsHelp.textContent = "Confirma se os ficheiros do site foram publicados.";
    elements.results.innerHTML = "";
    elements.detail.innerHTML = `
      <div class="empty-state empty-state-wide">
        <div class="empty-state-card">
          <p class="eyebrow">Erro</p>
          <h2>Falha ao carregar o site.</h2>
          <p>${escapeHtml(error.message)}</p>
        </div>
      </div>
    `;
  }
}

init();
