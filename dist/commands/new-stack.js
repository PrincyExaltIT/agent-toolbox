import fs from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import { stacksRoot } from '../paths.js';
import { renderStackGuidelineSkeleton } from '../templates.js';
/**
 * `atb new stack <name>` — scaffolds `<content-root>/stacks/<name>/` with at
 * least one guideline skeleton file. Wizard picks the initial file(s);
 * non-interactive mode uses `--files <csv>`.
 */
export async function newStack(name, opts) {
    const dir = path.join(stacksRoot(), name);
    if (fs.existsSync(dir)) {
        throw new Error(`Stack "${name}" already exists at ${dir}`);
    }
    const interactive = !opts.yes && process.stdin.isTTY;
    let description = opts.description ?? '';
    let files = parseCsv(opts.files);
    if (interactive) {
        p.intro(kleur.bold(`Create a new stack: ${name}`));
        if (!description) {
            const ans = await p.text({
                message: 'Description (one line)',
                placeholder: `${name} coding conventions`,
                validate: (v) => (v && v.trim().length > 0 ? undefined : 'Description required'),
            });
            if (p.isCancel(ans))
                return cancel();
            description = ans;
        }
        if (files.length === 0) {
            const ans = await p.multiselect({
                message: 'Initial guideline file(s)?',
                options: [
                    { value: `${name}-coding-guidelines.md`, label: `${name}-coding-guidelines.md`, hint: 'language / framework conventions' },
                    { value: 'testing.instructions.md', label: 'testing.instructions.md', hint: 'stack-specific testing rules' },
                    { value: 'component-testing.instructions.md', label: 'component-testing.instructions.md', hint: 'UI / component tests' },
                ],
                initialValues: [`${name}-coding-guidelines.md`],
                required: true,
            });
            if (p.isCancel(ans))
                return cancel();
            files = ans;
        }
    }
    else if (!opts.yes) {
        throw new Error('Non-TTY without --yes and missing flags. Pass --description and --files, or use --yes.');
    }
    if (!description)
        description = `${name} coding conventions`;
    if (files.length === 0)
        files = [`${name}-coding-guidelines.md`];
    fs.mkdirSync(dir, { recursive: true });
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.existsSync(filePath))
            continue;
        fs.writeFileSync(filePath, renderStackGuidelineSkeleton(name, file, description));
    }
    const out = dir.split(path.sep).join('/');
    if (interactive) {
        p.log.success(`Created stack at ${out}`);
        p.log.info(`Files: ${files.join(', ')}`);
        p.log.info(`Next: flesh them out, then reference the stack in a profile's stacks list.`);
        p.outro('Done.');
    }
    else {
        console.log(`Created stack at ${out}`);
        for (const f of files)
            console.log(`  ↳ ${f}`);
    }
}
function parseCsv(value) {
    if (!value)
        return [];
    return value.split(',').map((s) => s.trim()).filter(Boolean);
}
function cancel() {
    p.cancel('Cancelled.');
    process.exit(0);
}
