import fs from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import { sharedRoot } from '../paths.js';
import { renderSharedGuidelineSkeleton } from '../templates.js';

export interface NewSharedOptions {
  description?: string;
  yes?: boolean;
}

/**
 * `atb new shared <name>` — scaffolds `<content-root>/shared/<name>.md` with
 * minimal frontmatter + placeholder sections. The `.md` extension is appended
 * if the user forgot it.
 */
export async function newShared(name: string, opts: NewSharedOptions): Promise<void> {
  const filename = name.endsWith('.md') ? name : `${name}.md`;
  const filePath = path.join(sharedRoot(), filename);

  if (fs.existsSync(filePath)) {
    throw new Error(`Shared guideline already exists at ${filePath}`);
  }

  const interactive = !opts.yes && process.stdin.isTTY;

  let description = opts.description ?? '';

  if (interactive) {
    p.intro(kleur.bold(`Create a new shared guideline: ${filename}`));

    if (!description) {
      const ans = await p.text({
        message: 'Description (one line, surfaced in profile scope hints)',
        placeholder: 'Conventions for ...',
        validate: (v) => (v && v.trim().length > 0 ? undefined : 'Description required'),
      });
      if (p.isCancel(ans)) return cancel();
      description = ans as string;
    }
  } else if (!opts.yes) {
    throw new Error('Non-TTY without --yes and missing --description.');
  }

  if (!description) description = filename;

  fs.mkdirSync(sharedRoot(), { recursive: true });
  fs.writeFileSync(filePath, renderSharedGuidelineSkeleton(filename, description));

  const out = filePath.split(path.sep).join('/');
  if (interactive) {
    p.log.success(`Created ${out}`);
    p.log.info('Flesh out the sections, then list the filename in your profile.yaml `shared` array.');
    p.outro('Done.');
  } else {
    console.log(`Created ${out}`);
  }
}

function cancel(): void {
  p.cancel('Cancelled.');
  process.exit(0);
}
