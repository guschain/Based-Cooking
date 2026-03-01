import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, "Livro_de_Receitas_Consolidado.md");
const outputDir = path.join(rootDir, "recipes");

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

function parseFrontMatter(content) {
  if (!content.startsWith("---\n")) {
    return { data: {}, body: content };
  }

  const endIndex = content.indexOf("\n---\n", 4);

  if (endIndex === -1) {
    return { data: {}, body: content };
  }

  const rawFrontMatter = content.slice(4, endIndex);
  const body = content.slice(endIndex + 5);
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

function buildStarterTags(title, category) {
  const tags = new Set([slugify(category)]);
  const normalizedWords = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const word of normalizedWords) {
    if (word.length < 4 || stopwords.has(word)) {
      continue;
    }

    tags.add(word);

    if (tags.size >= 5) {
      break;
    }
  }

  return [...tags];
}

function trimRecipeBody(body) {
  return body
    .replace(/^\s+/, "")
    .replace(/\s+$/, "")
    .replace(/\n+---\s*$/, "")
    .trim();
}

function formatRecipe(recipe, preservedData = {}) {
  const tags = preservedData.tags
    ? preservedData.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : buildStarterTags(recipe.title, recipe.category);

  const image = preservedData.image ?? "";

  return [
    "---",
    `title: ${recipe.title}`,
    `category: ${recipe.category}`,
    `tags: ${tags.join(", ")}`,
    `image: ${image}`,
    "---",
    "",
    trimRecipeBody(recipe.body),
    ""
  ].join("\n");
}

function parseRecipes(content) {
  const lines = content.split(/\r?\n/);
  const recipes = [];
  let currentCategory = "";
  let currentRecipe = null;

  const flushRecipe = () => {
    if (!currentRecipe) {
      return;
    }

    currentRecipe.body = trimRecipeBody(currentRecipe.body);
    recipes.push(currentRecipe);
    currentRecipe = null;
  };

  for (const line of lines) {
    const categoryMatch = line.match(/^##\s+(.*)$/);

    if (categoryMatch) {
      flushRecipe();
      const category = categoryMatch[1].trim();

      if (category !== "Índice") {
        currentCategory = category;
      }

      continue;
    }

    const recipeMatch = line.match(/^###\s+(.*)$/);

    if (recipeMatch) {
      flushRecipe();
      currentRecipe = {
        title: recipeMatch[1].trim(),
        category: currentCategory,
        body: ""
      };
      continue;
    }

    if (!currentRecipe) {
      continue;
    }

    currentRecipe.body += `${line}\n`;
  }

  flushRecipe();
  return recipes.filter((recipe) => recipe.category && recipe.body);
}

async function readExistingMetadata(filePath) {
  try {
    const existing = await fs.readFile(filePath, "utf8");
    return parseFrontMatter(existing).data;
  } catch {
    return {};
  }
}

async function main() {
  const source = await fs.readFile(sourcePath, "utf8");
  const recipes = parseRecipes(source);

  if (!recipes.length) {
    throw new Error("No recipes were found in Livro_de_Receitas_Consolidado.md.");
  }

  await fs.mkdir(outputDir, { recursive: true });

  for (const recipe of recipes) {
    const fileName = `${slugify(recipe.title)}.md`;
    const filePath = path.join(outputDir, fileName);
    const existingData = await readExistingMetadata(filePath);
    const nextContent = formatRecipe(recipe, existingData);

    await fs.writeFile(filePath, nextContent, "utf8");
  }

  console.log(`Imported ${recipes.length} recipes into recipes/.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
