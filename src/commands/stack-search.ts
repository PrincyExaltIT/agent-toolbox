import kleur from 'kleur';
import * as p from '@clack/prompts';
import { fetchRegistry, searchRegistry, RegistryEntry } from '../registry.js';

export interface StackSearchOptions {
  json?: boolean;
}

export async function stackSearch(query: string, opts: StackSearchOptions): Promise<void> {
  const spinner = p.spinner();
  spinner.start('Fetching registry');
  let registry;
  try {
    registry = await fetchRegistry();
    spinner.stop('');
  } catch (err) {
    spinner.stop('');
    throw err;
  }

  const results = searchRegistry(registry, query);

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(kleur.yellow(`No stacks found for "${query}".`));
    console.log(kleur.gray(`→ Browse all stacks with \`atb stack search ""\` or visit the registry.`));
    return;
  }

  console.log(kleur.bold(`\n${results.length} stack(s) found:\n`));
  for (const entry of results) {
    printEntry(entry);
  }
}

function printEntry(entry: RegistryEntry): void {
  console.log(`  ${kleur.bold(entry.name.padEnd(20))} ${entry.description}`);
  console.log(`  ${''.padEnd(20)} ${kleur.gray(`by ${entry.author} · v${entry.version} · ${entry.tags.join(', ')}`)}`);
  console.log(`  ${''.padEnd(20)} ${kleur.gray(entry.repo)}`);
  console.log();
}
