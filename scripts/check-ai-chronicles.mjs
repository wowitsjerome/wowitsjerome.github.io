import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve('src/content/ai-chronicles');
const files = (await readdir(dir)).filter((name) => /\.(md|mdx)$/i.test(name)).sort();

const errors = [];
const byFilenameDate = new Map();
const byPubDate = new Map();

function parseFrontmatterValue(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*['\"]?(.+?)['\"]?\\s*$`, 'm'));
  return match?.[1]?.trim();
}

function normalizeDate(raw) {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

for (const file of files) {
  const fullPath = path.join(dir, file);
  const source = await readFile(fullPath, 'utf8');
  const filenameDate = file.slice(0, 10);
  const pubDateRaw = parseFrontmatterValue(source, 'pubDate');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(filenameDate)) {
    errors.push(`${file}: filename must start with YYYY-MM-DD`);
    continue;
  }

  if (!pubDateRaw) {
    errors.push(`${file}: missing pubDate frontmatter`);
    continue;
  }

  const pubDate = normalizeDate(pubDateRaw);
  if (!pubDate) {
    errors.push(`${file}: invalid pubDate \"${pubDateRaw}\"`);
    continue;
  }

  if (filenameDate !== pubDate) {
    errors.push(`${file}: filename date ${filenameDate} does not match pubDate ${pubDate}`);
  }

  if (byFilenameDate.has(filenameDate)) {
    errors.push(
      `duplicate filename date ${filenameDate}: ${byFilenameDate.get(filenameDate)} and ${file}`,
    );
  } else {
    byFilenameDate.set(filenameDate, file);
  }

  if (byPubDate.has(pubDate)) {
    errors.push(`duplicate pubDate ${pubDate}: ${byPubDate.get(pubDate)} and ${file}`);
  } else {
    byPubDate.set(pubDate, file);
  }
}

if (errors.length > 0) {
  console.error('AI Chronicles validation failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`AI Chronicles validation passed for ${files.length} posts.`);
