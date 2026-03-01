import { promises as fs } from "node:fs";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents } from "node:readline";
import readline from "node:readline/promises";

const rootDir = process.cwd();
const templatePath = path.join(rootDir, "templates", "recipe-template.md");
const recipeDir = path.join(rootDir, "recipes");
const placeholderImage = "images/recipe-placeholder.svg";
const maxVisibleOptions = 8;

const stopwords = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "receita",
  "receitas",
  "sem",
  "sob",
  "sobre",
  "um",
  "uma",
  "vegetariana",
  "vegetariano",
  "caseira",
  "caseiro",
  "facil",
  "facilmente",
  "tradicional",
  "pequena",
  "pequeno"
]);

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalise(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normaliseForSearch(value) {
  return normalise(value).toLowerCase();
}

function canonicalTag(value) {
  return slugify(value);
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatTagList(values) {
  return dedupe(values.map(canonicalTag)).join(", ");
}

function canUseInteractivePicker() {
  return Boolean(input.isTTY && output.isTTY && typeof input.setRawMode === "function");
}

function sortText(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "pt"));
}

function buildSuggestedTags(title, category, knownTags) {
  const suggestions = [];
  const knownTagSet = new Set(knownTags);

  const addSuggestion = (rawValue) => {
    const tag = canonicalTag(rawValue);

    if (!tag || suggestions.includes(tag)) {
      return;
    }

    if (knownTagSet.size && !knownTagSet.has(tag) && tag !== canonicalTag(category)) {
      return;
    }

    suggestions.push(tag);
  };

  addSuggestion(category);

  const words = normalise(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const word of words) {
    if (word.length < 4 || stopwords.has(word)) {
      continue;
    }

    addSuggestion(word);

    if (suggestions.length >= 5) {
      break;
    }
  }

  return suggestions;
}

async function parseExistingRecipeOptions() {
  try {
    const entries = await fs.readdir(recipeDir, { withFileTypes: true });
    const categories = new Set();
    const tags = new Set();

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }

      const filePath = path.join(recipeDir, entry.name);
      const content = await fs.readFile(filePath, "utf8");
      const categoryMatch = content.match(/^category:\s*(.+)$/m);
      const tagsMatch = content.match(/^tags:\s*(.+)$/m);

      if (categoryMatch) {
        categories.add(categoryMatch[1].trim());
      }

      if (tagsMatch) {
        for (const tag of tagsMatch[1].split(",")) {
          const canonical = canonicalTag(tag.trim());

          if (canonical) {
            tags.add(canonical);
          }
        }
      }
    }

    return {
      categories: sortText(categories),
      tags: sortText(tags)
    };
  } catch {
    return {
      categories: [],
      tags: []
    };
  }
}

async function promptRequired(rl, label) {
  while (true) {
    const value = (await rl.question(label)).trim();

    if (value) {
      return value;
    }

    console.log("Este campo e obrigatorio.");
  }
}

async function promptOptional(rl, label, fallback = "") {
  const value = (await rl.question(label)).trim();
  return value || fallback;
}

async function promptMultiline(rl, intro, formatter, { required = false } = {}) {
  console.log(intro);
  const lines = [];

  while (true) {
    const line = (await rl.question("> ")).trim();

    if (!line) {
      if (required && !lines.length) {
        console.log("Adiciona pelo menos uma linha antes de terminar.");
        continue;
      }

      break;
    }

    lines.push(line);
  }

  if (!lines.length) {
    return "";
  }

  return lines.map((line, index) => formatter(line, index)).join("\n");
}

function renderNotesSection(notes) {
  if (!notes) {
    return "";
  }

  return `\n#### Notas\n${notes}\n`;
}

function fillTemplate(template, fields) {
  return template
    .replaceAll("[TITULO_DA_RECEITA]", fields.title)
    .replaceAll("[CATEGORIA]", fields.category)
    .replaceAll("[TAGS_SEPARADAS_POR_VIRGULAS]", fields.tags)
    .replaceAll("[CAMINHO_DA_IMAGEM]", fields.image)
    .replaceAll("[[INGREDIENTES]]", fields.ingredients)
    .replaceAll("[[PREPARACAO]]", fields.preparation)
    .replaceAll("[[NOTAS_SECTION]]", fields.notesSection)
    .replace(/\n{3,}$/g, "\n");
}

async function confirmOverwrite(rl, filePath) {
  const answer = (
    await rl.question(`O ficheiro ${path.basename(filePath)} ja existe. Substituir? (s/N): `)
  )
    .trim()
    .toLowerCase();

  return answer === "s" || answer === "sim" || answer === "y" || answer === "yes";
}

function clearRenderedBlock(lineCount) {
  if (!lineCount || !output.isTTY) {
    return;
  }

  output.write(`\x1b[${lineCount}F`);
  output.write("\x1b[J");
}

function safeResumeReadline(rl) {
  if (!rl.closed) {
    rl.resume();
  }
}

function safeCloseReadline(rl) {
  if (!rl.closed) {
    rl.close();
  }
}

function createVisibleWindow(rows, cursorIndex) {
  const safeCursor = Math.max(0, Math.min(cursorIndex, Math.max(rows.length - 1, 0)));
  const maxStart = Math.max(0, rows.length - maxVisibleOptions);
  const start = Math.max(0, Math.min(safeCursor - 3, maxStart));
  const visibleRows = rows.slice(start, start + maxVisibleOptions);

  return {
    cursorIndex: safeCursor,
    start,
    visibleRows
  };
}

async function selectSingleOption(title, options, { allowCustom = true } = {}) {
  return new Promise((resolve, reject) => {
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();

    let query = "";
    let cursorIndex = 0;
    let renderedLines = 0;
    let rows = [];

    const cleanup = () => {
      input.off("keypress", onKeypress);
      input.setRawMode(false);
      input.pause();
      clearRenderedBlock(renderedLines);
    };

    const finish = (value) => {
      cleanup();
      console.log(`${title}: ${value}`);
      resolve(value);
    };

    const render = () => {
      const filtered = options.filter((option) =>
        normaliseForSearch(option).includes(normaliseForSearch(query))
      );

      rows = [];

      if (allowCustom && query.trim()) {
        rows.push({
          type: "custom",
          label: `Criar novo valor: ${query.trim()}`,
          value: query.trim()
        });
      }

      for (const option of filtered) {
        rows.push({
          type: "option",
          label: option,
          value: option
        });
      }

      if (!rows.length) {
        rows.push({
          type: "empty",
          label: allowCustom
            ? "Sem resultados. Escreve para criar um novo valor."
            : "Sem resultados para este filtro.",
          value: ""
        });
      }

      const windowState = createVisibleWindow(rows, cursorIndex);
      cursorIndex = windowState.cursorIndex;

      const lines = [
        title,
        "Escreve para filtrar. Usa as setas para mover e Enter para escolher.",
        `Pesquisa: ${query || "(sem filtro)"}`,
        ""
      ];

      if (windowState.start > 0) {
        lines.push("  ...");
      }

      for (let index = 0; index < windowState.visibleRows.length; index += 1) {
        const globalIndex = windowState.start + index;
        const row = windowState.visibleRows[index];
        const pointer = globalIndex === cursorIndex ? ">" : " ";
        lines.push(`${pointer} ${row.label}`);
      }

      if (windowState.start + windowState.visibleRows.length < rows.length) {
        lines.push("  ...");
      }

      clearRenderedBlock(renderedLines);
      output.write(`${lines.join("\n")}\n`);
      renderedLines = lines.length;
    };

    const onKeypress = (keyValue, key = {}) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Operacao cancelada."));
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        const activeRow = rows[cursorIndex];

        if (activeRow && activeRow.type !== "empty") {
          finish(activeRow.value);
        }

        return;
      }

      if (key.name === "up") {
        cursorIndex = Math.max(0, cursorIndex - 1);
        render();
        return;
      }

      if (key.name === "down") {
        cursorIndex = Math.min(rows.length - 1, cursorIndex + 1);
        render();
        return;
      }

      if (key.name === "backspace") {
        if (query) {
          query = query.slice(0, -1);
          cursorIndex = 0;
          render();
        }

        return;
      }

      if (key.name === "escape") {
        if (query) {
          query = "";
          cursorIndex = 0;
          render();
        }

        return;
      }

      if (!key.ctrl && !key.meta && keyValue && keyValue >= " ") {
        query += keyValue;
        cursorIndex = 0;
        render();
      }
    };

    input.on("keypress", onKeypress);
    render();
  });
}

async function selectMultipleTags(existingTags, selectedTags) {
  return new Promise((resolve, reject) => {
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();

    let query = "";
    let cursorIndex = 0;
    let renderedLines = 0;
    let rows = [];
    const selected = new Set(selectedTags.map(canonicalTag).filter(Boolean));
    const tagPool = sortText(dedupe([...existingTags, ...selected]));

    const cleanup = () => {
      input.off("keypress", onKeypress);
      input.setRawMode(false);
      input.pause();
      clearRenderedBlock(renderedLines);
    };

    const finish = () => {
      cleanup();
      const orderedSelection = tagPool.filter((tag) => selected.has(tag));
      console.log(`Tags: ${orderedSelection.join(", ") || "(sem tags)"}`);
      resolve(orderedSelection);
    };

    const addCustomTag = (rawValue) => {
      const tag = canonicalTag(rawValue);

      if (!tag) {
        return;
      }

      if (!tagPool.includes(tag)) {
        tagPool.push(tag);
        tagPool.sort((left, right) => left.localeCompare(right, "pt"));
      }

      selected.add(tag);
    };

    const render = () => {
      const filtered = tagPool.filter((tag) =>
        normaliseForSearch(tag).includes(normaliseForSearch(query))
      );

      rows = [
        {
          type: "done",
          label: "[Concluir selecao]"
        }
      ];

      const customTag = canonicalTag(query.trim());

      if (customTag && !tagPool.includes(customTag)) {
        rows.push({
          type: "create",
          label: `Criar nova tag: ${customTag}`,
          value: customTag
        });
      }

      for (const tag of filtered) {
        rows.push({
          type: "tag",
          label: `${selected.has(tag) ? "[x]" : "[ ]"} ${tag}`,
          value: tag
        });
      }

      const windowState = createVisibleWindow(rows, cursorIndex);
      cursorIndex = windowState.cursorIndex;

      const lines = [
        "Tags",
        "Escreve para filtrar. Usa as setas para mover. Enter adiciona/remove. Enter em [Concluir selecao] termina.",
        `Pesquisa: ${query || "(sem filtro)"}`,
        `Selecionadas: ${[...selected].join(", ") || "(nenhuma)"}`,
        ""
      ];

      if (windowState.start > 0) {
        lines.push("  ...");
      }

      for (let index = 0; index < windowState.visibleRows.length; index += 1) {
        const globalIndex = windowState.start + index;
        const row = windowState.visibleRows[index];
        const pointer = globalIndex === cursorIndex ? ">" : " ";
        lines.push(`${pointer} ${row.label}`);
      }

      if (windowState.start + windowState.visibleRows.length < rows.length) {
        lines.push("  ...");
      }

      clearRenderedBlock(renderedLines);
      output.write(`${lines.join("\n")}\n`);
      renderedLines = lines.length;
    };

    const onKeypress = (keyValue, key = {}) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Operacao cancelada."));
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        const activeRow = rows[cursorIndex];

        if (!activeRow) {
          return;
        }

        if (activeRow.type === "done") {
          finish();
          return;
        }

        if (activeRow.type === "create") {
          addCustomTag(activeRow.value);
          query = "";
          cursorIndex = 0;
          render();
          return;
        }

        if (activeRow.type === "tag") {
          if (selected.has(activeRow.value)) {
            selected.delete(activeRow.value);
          } else {
            selected.add(activeRow.value);
          }

          query = "";
          cursorIndex = 0;
          render();
        }

        return;
      }

      if (key.name === "up") {
        cursorIndex = Math.max(0, cursorIndex - 1);
        render();
        return;
      }

      if (key.name === "down") {
        cursorIndex = Math.min(rows.length - 1, cursorIndex + 1);
        render();
        return;
      }

      if (key.name === "backspace") {
        if (query) {
          query = query.slice(0, -1);
          cursorIndex = 0;
          render();
        }

        return;
      }

      if (key.name === "escape") {
        if (query) {
          query = "";
          cursorIndex = 0;
          render();
        }

        return;
      }

      if (!key.ctrl && !key.meta && keyValue && keyValue >= " ") {
        query += keyValue;
        cursorIndex = 0;
        render();
      }
    };

    input.on("keypress", onKeypress);
    render();
  });
}

async function promptCategory(rl, categories) {
  if (!canUseInteractivePicker()) {
    return promptRequired(rl, "Categoria: ");
  }

  rl.pause();

  try {
    return await selectSingleOption("Categoria", categories, { allowCustom: true });
  } finally {
    safeResumeReadline(rl);
  }
}

async function promptTags(rl, existingTags, suggestedTags) {
  const defaultValue = formatTagList(suggestedTags);

  if (!canUseInteractivePicker()) {
    const typedTags = await promptOptional(
      rl,
      `Tags (separadas por virgulas) [${defaultValue}]: `,
      defaultValue
    );

    return formatTagList(typedTags.split(",").map((tag) => tag.trim()));
  }

  rl.pause();

  try {
    const selectedTags = await selectMultipleTags(existingTags, suggestedTags);
    return formatTagList(selectedTags);
  } finally {
    safeResumeReadline(rl);
  }
}

async function main() {
  const template = await fs.readFile(templatePath, "utf8");
  await fs.mkdir(recipeDir, { recursive: true });

  const rl = readline.createInterface({ input, output });

  try {
    const recipeOptions = await parseExistingRecipeOptions();
    const title = await promptRequired(rl, "Titulo da receita: ");
    const category = await promptCategory(rl, recipeOptions.categories);
    const suggestedTags = buildSuggestedTags(title, category, recipeOptions.tags);
    const tags = await promptTags(rl, recipeOptions.tags, suggestedTags);
    const image = await promptOptional(rl, `Imagem [${placeholderImage}]: `, placeholderImage);
    const ingredients = await promptMultiline(
      rl,
      "Ingredientes (uma linha por ingrediente; linha vazia para terminar):",
      (line) => `- ${line}`,
      { required: true }
    );
    const preparation = await promptMultiline(
      rl,
      "Preparacao (uma linha por passo; linha vazia para terminar):",
      (line, index) => `${index + 1}. ${line}`,
      { required: true }
    );
    const notes = await promptMultiline(
      rl,
      "Notas (opcional; uma linha por nota; linha vazia para terminar):",
      (line) => `- ${line}`
    );

    const slug = slugify(title);

    if (!slug) {
      throw new Error("Nao foi possivel gerar um nome de ficheiro a partir do titulo.");
    }

    const filePath = path.join(recipeDir, `${slug}.md`);

    try {
      await fs.access(filePath);
      const overwrite = await confirmOverwrite(rl, filePath);

      if (!overwrite) {
        console.log("Operacao cancelada.");
        return;
      }
    } catch {
      // File does not exist yet.
    }

    const content = fillTemplate(template, {
      title,
      category,
      tags,
      image,
      ingredients,
      preparation,
      notesSection: renderNotesSection(notes)
    });

    await fs.writeFile(filePath, `${content.trimEnd()}\n`, "utf8");

    console.log(`Receita criada: recipes/${path.basename(filePath)}`);
    console.log("Se quiser ver a mudanca localmente, executa `npm run build`.");
    console.log("Para publicar no site, faz commit e push para `main` ou usa o editor do GitHub.");
  } finally {
    safeCloseReadline(rl);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
