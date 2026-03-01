const maxSuggestions = 6;
const minimumVisibleTagCount = 2;
const mobileMedia = window.matchMedia("(max-width: 860px)");

const state = {
  recipes: [],
  filteredRecipes: [],
  activeTags: new Set(),
  activeCategory: "all",
  query: "",
  selectedSlug: "",
  mobileView: "browse"
};

const elements = {
  mobileNav: document.querySelector("[data-mobile-nav]"),
  mobileButtons: document.querySelectorAll("[data-mobile-panel]"),
  workspace: document.querySelector("[data-workspace]"),
  search: document.querySelector("[data-search]"),
  searchSuggestions: document.querySelector("[data-search-suggestions]"),
  category: document.querySelector("[data-category]"),
  tags: document.querySelector("[data-tags]"),
  totalRecipes: document.querySelector("[data-total-recipes]"),
  visibleRecipes: document.querySelector("[data-visible-recipes]"),
  resultsSummary: document.querySelector("[data-results-summary]"),
  summaryArt: document.querySelector("[data-summary-art]"),
  summaryArtLabel: document.querySelector("[data-summary-art-label]"),
  resultsLabel: document.querySelector("[data-results-label]"),
  resultsCount: document.querySelector("[data-results-count]"),
  resultsHelp: document.querySelector("[data-results-help]"),
  results: document.querySelector("[data-results]"),
  detail: document.querySelector("[data-detail]"),
  clear: document.querySelector("[data-clear]")
};

function isMobileViewport() {
  return mobileMedia.matches;
}

const categoryVisuals = {
  all: {
    src: "./assets/category-art/livro.svg",
    label: "Livro completo"
  },
  Entradas: {
    src: "./assets/category-art/entradas.svg",
    label: "Entradas"
  },
  "Pratos principais": {
    src: "./assets/category-art/pratos-principais.svg",
    label: "Pratos principais"
  },
  Sopas: {
    src: "./assets/category-art/sopas.svg",
    label: "Sopas"
  },
  "Pequeno-almoço e lanches": {
    src: "./assets/category-art/pequeno-almoco-e-lanches.svg",
    label: "Pequeno-almo\u00E7o e lanches"
  },
  Sobremesas: {
    src: "./assets/category-art/sobremesas.svg",
    label: "Sobremesas"
  },
  Bebidas: {
    src: "./assets/category-art/bebidas.svg",
    label: "Bebidas"
  }
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

function activeCategoryVisual() {
  return categoryVisuals[state.activeCategory] || categoryVisuals.all;
}

function visualForCategory(category) {
  return categoryVisuals[category] || categoryVisuals.all;
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

function tagPanelRecipes() {
  return state.recipes.filter((recipe) => {
    const matchesCategory =
      state.activeCategory === "all" || recipe.category === state.activeCategory;
    const matchesQuery =
      !state.query || normalise(recipe.searchText).includes(normalise(state.query));

    return matchesCategory && matchesQuery;
  });
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

  if (slug && isMobileViewport()) {
    state.mobileView = "detail";
  }

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
  renderMobileView();

  if (slug) {
    scrollMobileWorkspaceIntoView();
  }
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
  renderMobileView();
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

function renderMobileView() {
  if (!elements.workspace || !elements.mobileNav) {
    return;
  }

  if (!isMobileViewport()) {
    elements.mobileNav.hidden = true;
    elements.workspace.dataset.mobileView = "split";
  } else {
    elements.mobileNav.hidden = false;
    elements.workspace.dataset.mobileView = state.mobileView;
  }

  for (const button of elements.mobileButtons) {
    const panel = button.dataset.mobilePanel;
    const isActive = isMobileViewport() && panel === state.mobileView;

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
}

function scrollMobileWorkspaceIntoView() {
  if (!isMobileViewport() || !elements.mobileNav) {
    return;
  }

  const top = window.scrollY + elements.mobileNav.getBoundingClientRect().top - 8;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function renderHeroStats() {
  elements.totalRecipes.textContent = String(state.recipes.length);
  elements.visibleRecipes.textContent = String(state.filteredRecipes.length);
}

function renderSummaryVisual() {
  const visual = activeCategoryVisual();

  elements.summaryArt.src = visual.src;
  elements.summaryArt.alt = visual.label;
  elements.summaryArtLabel.textContent = visual.label;
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
      isActive: state.activeTags.has(tag)
    }))
    .filter((entry) => entry.isActive || entry.count >= minimumVisibleTagCount)
    .sort((left, right) => {
      if (left.isActive !== right.isActive) {
        return left.isActive ? -1 : 1;
      }

      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return left.tag.localeCompare(right.tag, "pt");
    });

  const hiddenSingleTags = [...counts.entries()].filter(
    ([tag, count]) => !state.activeTags.has(tag) && count < minimumVisibleTagCount
  ).length;

  if (!visibleTags.length) {
    elements.tags.innerHTML =
      '<p class="tag-note-chip">Sem tags repetidas neste filtro. Usa a pesquisa para detalhes mais espec\u00EDficos.</p>';
    return;
  }

  elements.tags.innerHTML = `
    ${visibleTags
      .map((entry) => {
        const className = entry.isActive ? "tag-chip is-active" : "tag-chip";

        return `
          <button
            class="${className}"
            type="button"
            data-tag="${escapeHtml(entry.tag)}"
            aria-pressed="${entry.isActive ? "true" : "false"}"
          >
            <span class="tag-chip-name">${escapeHtml(entry.tag)}</span>
            <span class="tag-chip-count">${entry.count}</span>
          </button>
        `;
      })
      .join("")}
    ${
      hiddenSingleTags
        ? `<span class="tag-note-chip">+ ${hiddenSingleTags} tags \u00FAnicas ocultas</span>`
        : ""
    }
  `;

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

      state.mobileView = "browse";
      applyFilters();
    });
  }
}

function renderResultsSummary() {
  const count = state.filteredRecipes.length;
  const filterLabel = buildFilterLabel();
  const idleHelp = isMobileViewport()
    ? "Escolhe uma receita para abrir os detalhes."
    : "Escolhe uma receita na lista ou no painel da direita para abrir os detalhes.";
  const activeHelp = isMobileViewport()
    ? "Podes trocar de receita sempre que quiseres."
    : "A lista continua vis\u00EDvel para poderes trocar de receita dentro deste filtro.";

  renderSummaryVisual();
  elements.resultsLabel.textContent = filterLabel;
  elements.resultsCount.textContent =
    count === 1 ? "1 receita dispon\u00EDvel" : `${count} receitas dispon\u00EDveis`;

  if (!count) {
    elements.resultsHelp.textContent = "Ajusta a pesquisa ou remove alguns filtros.";
    return;
  }

  if (!state.selectedSlug) {
    elements.resultsHelp.textContent = idleHelp;
    return;
  }

  elements.resultsHelp.textContent = activeHelp;
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
      const visual = visualForCategory(recipe.category);
      const meta = [
        `<span class="meta-pill">${escapeHtml(recipe.category)}</span>`,
        ...recipe.tags
          .slice(0, 4)
          .map((tag) => `<span class="meta-pill is-tag">${escapeHtml(tag)}</span>`)
      ].join("");

      return `
        <button class="${className}" type="button" data-slug="${escapeHtml(recipe.slug)}">
          <div class="recipe-card-head">
            <span class="recipe-card-thumb-frame">
              <img
                class="recipe-card-thumb"
                src="${escapeHtml(visual.src)}"
                alt="${escapeHtml(visual.label)}"
              >
            </span>
            <div class="recipe-card-head-copy">
              <h3>${escapeHtml(recipe.title)}</h3>
              <div class="recipe-meta">${meta}</div>
            </div>
          </div>
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

  if (!query) {
    elements.searchSuggestions.hidden = true;
    elements.searchSuggestions.innerHTML = "";
    return;
  }

  const normalisedQuery = normalise(query);
  const categorySuggestions = uniqueCategories()
    .filter((category) => normalise(category).includes(normalisedQuery))
    .map((category) => ({
      key: `category:${category}`,
      type: "category",
      title: category,
      meta: "Categoria",
      visual: visualForCategory(category)
    }));
  const recipeSuggestions = state.filteredRecipes.map((recipe) => ({
    key: `recipe:${recipe.slug}`,
    type: "recipe",
    slug: recipe.slug,
    title: recipe.title,
    meta: recipe.category,
    visual: visualForCategory(recipe.category)
  }));
  const allSuggestions = [...categorySuggestions, ...recipeSuggestions];

  if (!allSuggestions.length) {
    elements.searchSuggestions.hidden = true;
    elements.searchSuggestions.innerHTML = "";
    return;
  }

  const visibleSuggestions = allSuggestions.slice(0, maxSuggestions);
  const extraCount = Math.max(0, allSuggestions.length - visibleSuggestions.length);

  elements.searchSuggestions.hidden = false;
  elements.searchSuggestions.innerHTML = `
    ${visibleSuggestions
      .map(
        (suggestion) => `
          <button
            class="search-suggestion"
            type="button"
            data-suggestion-type="${escapeHtml(suggestion.type)}"
            data-suggestion-key="${escapeHtml(suggestion.key)}"
          >
            <span class="search-suggestion-thumb-frame">
              <img
                class="search-suggestion-thumb"
                src="${escapeHtml(suggestion.visual.src)}"
                alt="${escapeHtml(suggestion.visual.label)}"
              >
            </span>
            <span class="search-suggestion-body">
              <span class="search-suggestion-title">${escapeHtml(suggestion.title)}</span>
              <span class="search-suggestion-meta">${escapeHtml(suggestion.meta)}</span>
            </span>
            <span class="search-suggestion-kind search-suggestion-kind-${escapeHtml(suggestion.type)}">
              ${suggestion.type === "category" ? "Categoria" : "Receita"}
            </span>
          </button>
        `
      )
      .join("")}
    ${
      extraCount
        ? `<p class="search-suggestion-more">+ ${extraCount} ${
            extraCount === 1 ? "receita compat\u00EDvel" : "receitas compat\u00EDveis"
          }</p>`
        : ""
    }
  `;

  for (const button of elements.searchSuggestions.querySelectorAll("[data-suggestion-key]")) {
    button.addEventListener("click", () => {
      const type = button.dataset.suggestionType;
      const key = button.dataset.suggestionKey;

      if (type === "category") {
        const category = key?.replace(/^category:/, "");

        if (!category) {
          return;
        }

        state.activeCategory = category;
        state.query = "";
        state.mobileView = "browse";
        elements.category.value = category;
        elements.search.value = "";
        clearSelection();
        applyFilters();
        return;
      }

      const slug = key?.replace(/^recipe:/, "");
      const recipe = state.recipes.find((item) => item.slug === slug);

      if (slug && recipe) {
        state.query = recipe.title;
        elements.search.value = recipe.title;
        applyFilters();
        setSelection(slug);
      }
    });
  }
}

function renderDetail() {
  const recipe = state.filteredRecipes.find((item) => item.slug === state.selectedSlug);

  if (!recipe) {
    const count = state.filteredRecipes.length;
    const visual = activeCategoryVisual();

    if (!count) {
      elements.detail.innerHTML = `
        <div class="detail-placeholder detail-placeholder-empty">
          <figure class="detail-placeholder-art-frame">
            <img
              class="detail-placeholder-art"
              src="${escapeHtml(visual.src)}"
              alt="${escapeHtml(visual.label)}"
            >
          </figure>
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
      .slice(0, 6)
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
    const remainingCount = Math.max(0, count - 6);

    elements.detail.innerHTML = `
      <div class="detail-placeholder">
        <div class="detail-placeholder-top">
          <figure class="detail-placeholder-art-frame">
            <img
              class="detail-placeholder-art"
              src="${escapeHtml(visual.src)}"
              alt="${escapeHtml(visual.label)}"
            >
          </figure>
          <div class="detail-placeholder-head">
            <p class="eyebrow">${escapeHtml(buildFilterLabel())}</p>
            <h2>${escapeHtml(count === 1 ? "1 receita neste filtro" : `${count} receitas neste filtro`)}</h2>
            <p class="detail-placeholder-copy">
              ${
                isMobileViewport()
                  ? "Escolhe uma receita abaixo. Nada \u00E9 aberto automaticamente."
                  : "Escolhe uma receita abaixo ou usa a lista da esquerda. Nada \u00E9 aberto automaticamente."
              }
            </p>
          </div>
        </div>
        <div class="detail-picker-block">
          <p class="detail-picker-label">Abertura r\u00E1pida</p>
          <div class="detail-picker-list">${quickPickButtons}</div>
          ${
            remainingCount
              ? `<p class="detail-picker-more">+ ${remainingCount} ${
                  remainingCount === 1 ? "receita na lista" : "receitas na lista"
                }</p>`
              : ""
          }
        </div>
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
    state.mobileView = "browse";
    applyFilters();
  });

  elements.category.addEventListener("change", (event) => {
    state.activeCategory = event.target.value;
    state.mobileView = "browse";
    applyFilters();
  });

  elements.clear.addEventListener("click", () => {
    state.query = "";
    state.activeCategory = "all";
    state.activeTags.clear();
    state.mobileView = "browse";
    elements.search.value = "";
    elements.category.value = "all";
    clearSelection();
    applyFilters();
  });

  window.addEventListener("hashchange", () => {
    syncSelectionFromHash();
  });

  for (const button of elements.mobileButtons) {
    button.addEventListener("click", () => {
      const panel = button.dataset.mobilePanel;

      if (!panel) {
        return;
      }

      state.mobileView = panel;
      renderMobileView();
      scrollMobileWorkspaceIntoView();
    });
  }

  if (typeof mobileMedia.addEventListener === "function") {
    mobileMedia.addEventListener("change", renderMobileView);
  } else if (typeof mobileMedia.addListener === "function") {
    mobileMedia.addListener(renderMobileView);
  }
}

async function init() {
  bindEvents();
  renderMobileView();

  try {
    const response = await fetch("./data/recipes.json");

    if (!response.ok) {
      throw new Error(`Unexpected status: ${response.status}`);
    }

    state.recipes = await response.json();
    state.filteredRecipes = [...state.recipes];
    renderCategoryOptions();
    renderHeroStats();
    renderSummaryVisual();
    applyFilters();
  } catch (error) {
    elements.resultsLabel.textContent = "Erro";
    elements.resultsCount.textContent = "N\u00E3o foi poss\u00EDvel carregar as receitas.";
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
