import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function checkSarif(document) {
  if (
    document.version !== '2.1.0' ||
    !Array.isArray(document.runs) ||
    !document.runs.length
  )
    throw new Error('Invalid SARIF document');
  let blocked = 0,
    total = 0;
  for (const run of document.runs) {
    if (
      !Array.isArray(run.results) ||
      run.invocations?.some((i) => i.executionSuccessful === false)
    )
      throw new Error('Incomplete SARIF analysis');
    const rules = run.tool?.driver?.rules ?? [];
    for (const result of run.results) {
      total++;
      const rule =
        rules.find((r) => r.id === result.ruleId) ?? rules[result.ruleIndex];
      const raw = rule?.properties?.['security-severity'];
      const severity = raw === undefined ? 0 : Number(raw);
      if (!Number.isFinite(severity) || severity < 0 || severity > 10)
        throw new Error('Invalid SARIF severity');
      if (
        severity >= 7 ||
        (result.level ?? rule?.defaultConfiguration?.level) === 'error'
      )
        blocked++;
    }
  }
  return { total, blocked };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const folder = resolve(process.argv[2] ?? '');
    const files = (await readdir(folder)).filter((f) => f.endsWith('.sarif'));
    if (!files.length) throw new Error('Missing SARIF output');
    let total = 0,
      blocked = 0;
    for (const name of files) {
      const path = resolve(folder, name);
      if ((await stat(path)).size > 25 * 1024 * 1024)
        throw new Error('SARIF output exceeds limit');
      const result = checkSarif(JSON.parse(await readFile(path, 'utf8')));
      total += result.total;
      blocked += result.blocked;
    }
    console.log(
      'CodeQL findings: ' +
        total +
        '; blocking high-severity/error findings: ' +
        blocked,
    );
    if (blocked) process.exitCode = 1;
  } catch {
    console.error('CodeQL result validation failed');
    process.exitCode = 1;
  }
}
