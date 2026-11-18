import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ignored = new Set(['.git', 'node_modules', '.cache', 'dist', 'coverage']);
const privateDirectories = new Set(['docs', 'tickets', 'internal-docs']);

async function listFiles(root, folder = root) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
    if (folder === root && privateDirectories.has(entry.name)) continue;
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) result.push(...(await listFiles(root, path)));
    else result.push(relative(root, path).split(sep).join('/'));
  }
  return result.sort();
}

// This checks repository inline-link targets, not full Markdown semantics.
// External URLs and heading fragments deliberately require separate review.
export async function checkMarkdownLinks(
  root,
  file,
  content,
  additionalRoots = [],
) {
  const errors = [];
  const prose = content.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  const links = prose.matchAll(
    /!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g,
  );
  for (const match of links) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(target.split(/[?#]/, 1)[0]);
    } catch {
      errors.push(`${file}: invalid URL encoding: ${target}`);
      continue;
    }
    const destination = resolve(root, dirname(file), decoded);
    const allowed = [root, ...additionalRoots].some((allowedRoot) => {
      const local = relative(resolve(allowedRoot), destination);
      return (
        local !== '..' &&
        !local.startsWith(`..${sep}`) &&
        !/^[A-Za-z]:/.test(local)
      );
    });
    if (!allowed) {
      errors.push(`${file}: link escapes repository: ${target}`);
      continue;
    }
    try {
      await stat(destination);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      errors.push(`${file}: missing local link: ${target}`);
    }
  }
  return errors;
}

export function checkPrivatePaths(paths) {
  return paths
    .filter((file) =>
      privateDirectories.has(
        file.replaceAll('\\', '/').split('/')[0].toLowerCase(),
      ),
    )
    .map((file) => `Internal planning must not be tracked: ${file}`);
}

export function checkDecisionMatrix(content) {
  const rows = content.split('\n').filter((line) => line.startsWith('|'));
  const cells = rows.map((row) =>
    row
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
  const weights = cells
    .filter((row) => row.length === 3 && /^\d+$/.test(row[1]))
    .map((row) => Number(row[1]));
  const errors = [];
  if (weights.length !== 12 || weights.reduce((a, b) => a + b, 0) !== 100) {
    return ['Decision matrix must contain 12 weights summing to 100'];
  }
  const options = cells.filter(
    (row) => row.length !== 3 && /^\d+$/.test(row[1]),
  );
  if (options.length === 0)
    errors.push('Decision matrix has no scored options');
  for (const row of options) {
    if (row.length !== 14) {
      errors.push(
        `Decision option must have 12 scores and one total: ${row[0]}`,
      );
      continue;
    }
    const scores = row.slice(1, 13).map(Number);
    if (
      scores.some((value) => !Number.isInteger(value) || value < 1 || value > 5)
    ) {
      errors.push(`Invalid decision scores: ${row[0]}`);
      continue;
    }
    const expected =
      scores.reduce((sum, score, i) => sum + score * weights[i], 0) / 100;
    if (
      Math.abs(Number(row[13]) - expected) > 0.001 ||
      !Number.isFinite(Number(row[13]))
    ) {
      errors.push(
        `${row[0]}: total should be ${expected.toFixed(2)}, found ${row[13]}`,
      );
    }
  }
  return errors;
}

export async function checkRepository(root) {
  const files = await listFiles(root);
  const errors = [];
  const markdown = files.filter((file) => file.endsWith('.md'));
  for (const file of markdown) {
    const content = await readFile(resolve(root, file), 'utf8');
    errors.push(...(await checkMarkdownLinks(root, file, content)));
    if (!/^#\s+\S/m.test(content))
      errors.push(`${file}: missing document title`);
    if ((content.match(/^```/gm)?.length ?? 0) % 2)
      errors.push(`${file}: unclosed fenced block`);
  }
  for (const file of files.filter((path) => path.endsWith('.json'))) {
    try {
      JSON.parse(await readFile(resolve(root, file), 'utf8'));
    } catch (error) {
      errors.push(`${file}: invalid JSON: ${error.message}`);
    }
  }
  return { errors, markdownCount: markdown.length };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = await checkRepository(root);
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  result.errors.push(...checkPrivatePaths(tracked));
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(
      `Checked ${result.markdownCount} public Markdown files, local links, JSON syntax and tracked private paths. No external team files are required; external links, Mermaid and protocol semantics are not checked.`,
    );
  }
}
