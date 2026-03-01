import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const recipeDir = path.join(rootDir, "recipes");
const sourceDir = path.join(rootDir, "src");
const imageDir = path.join(rootDir, "images");
const outputDir = path.join(rootDir, "docs");

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return value
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
  if (!content.startsWith("---\n")) {
    return { data: {}, body: content };
  }

  const endIndex = content.indexOf("\n---\n", 4);

  if (endIndex === -1) {
    return { data: {}, body: content };
  }

  const rawFrontMatter = content.slice(4, endIndex);
  const body = content.slice(endIndex + 5).trim();
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
  if (text.length <= 160) {
    return text;
  }

  return `${text.slice(0, 157).trim()}...`;
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
      tags,
      image: data.image || "",
      excerpt: buildExcerpt(text),
      searchText: [title, category, tags.join(" "), text].join(" ").toLowerCase(),
      html: markdownToHtml(body)
    });
  }

  return recipes;
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

async function main() {
  const recipes = await loadRecipes();

  if (!recipes.length) {
    throw new Error("No recipe files were found in recipes/.");
  }

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outputDir, "data"), { recursive: true });
  await copyStaticSource();
  await fs.writeFile(
    path.join(outputDir, "data", "recipes.json"),
    `${JSON.stringify(recipes, null, 2)}\n`,
    "utf8"
  );

  console.log(`Built ${recipes.length} recipes into docs/.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
