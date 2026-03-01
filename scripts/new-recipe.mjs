import { promises as fs } from "node:fs";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";

const rootDir = process.cwd();
const templatePath = path.join(rootDir, "templates", "recipe-template.md");
const recipeDir = path.join(rootDir, "recipes");
const placeholderImage = "images/recipe-placeholder.svg";

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

function buildStarterTags(title, category) {
  const tags = new Set([slugify(category)]);
  const words = normalise(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const word of words) {
    if (word.length < 4 || stopwords.has(word)) {
      continue;
    }

    tags.add(word);

    if (tags.size >= 5) {
      break;
    }
  }

  return [...tags].join(", ");
}

async function parseExistingCategories() {
  try {
    const entries = await fs.readdir(recipeDir, { withFileTypes: true });
    const categories = new Set();

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }

      const filePath = path.join(recipeDir, entry.name);
      const content = await fs.readFile(filePath, "utf8");
      const match = content.match(/^category:\s*(.+)$/m);

      if (match) {
        categories.add(match[1].trim());
      }
    }

    return [...categories].sort((left, right) => left.localeCompare(right, "pt"));
  } catch {
    return [];
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

  return lines.map(formatter).join("\n");
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
  const answer = (await rl.question(`O ficheiro ${path.basename(filePath)} ja existe. Substituir? (s/N): `))
    .trim()
    .toLowerCase();

  return answer === "s" || answer === "sim" || answer === "y" || answer === "yes";
}

async function main() {
  const template = await fs.readFile(templatePath, "utf8");
  await fs.mkdir(recipeDir, { recursive: true });

  const rl = readline.createInterface({ input, output });

  try {
    const categories = await parseExistingCategories();

    if (categories.length) {
      console.log(`Categorias atuais: ${categories.join(" | ")}`);
    }

    const title = await promptRequired(rl, "Titulo da receita: ");
    const category = await promptRequired(rl, "Categoria: ");
    const suggestedTags = buildStarterTags(title, category);
    const tags = await promptOptional(
      rl,
      `Tags (separadas por virgulas) [${suggestedTags}]: `,
      suggestedTags
    );
    const image = await promptOptional(
      rl,
      `Imagem [${placeholderImage}]: `,
      placeholderImage
    );
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
    console.log("Executa `npm run build` para atualizar o site.");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
