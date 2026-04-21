import fs from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import { listSharedGuidelines, listStacks } from '../profiles.js';
import { profilesRoot } from '../paths.js';
import { renderProfileYaml, renderProjectContext, renderProfileClaudeMd, } from '../templates.js';
/**
 * Interactive (or flag-driven) scaffolder for a new profile under
 * ~/.agent-toolbox/profiles/<name>/. Writes profile.yaml, project-context.md
 * (skeleton with placeholders) and CLAUDE.md (@-imports wired to the selected
 * shared files and stacks). Never touches the bundled tree.
 */
export async function newProfile(name, opts) {
    const dir = path.join(profilesRoot(), name);
    if (fs.existsSync(dir)) {
        throw new Error(`Profile "${name}" already exists at ${dir}`);
    }
    const shared = listSharedGuidelines();
    const stacks = listStacks();
    if (shared.length === 0 && stacks.length === 0) {
        throw new Error('No shared guidelines or stacks found. Install the bundled content first or add entries under ~/.agent-toolbox/{shared,stacks}.');
    }
    const interactive = !opts.yes && process.stdin.isTTY;
    let description = opts.description ?? '';
    let pickedShared = parseCsv(opts.shared);
    let pickedStacks = parseCsv(opts.stacks);
    let copilotDescription = opts.copilotDescription ?? '';
    if (interactive) {
        p.intro(kleur.bold(`Create a new profile: ${name}`));
        if (!description) {
            const ans = await p.text({
                message: 'Description (one line)',
                placeholder: 'My project — Stack summary',
            });
            if (p.isCancel(ans))
                return cancel();
            description = ans;
        }
        if (pickedShared.length === 0 && shared.length > 0) {
            const ans = await p.multiselect({
                message: 'Which shared guidelines?',
                options: shared.map((s) => ({
                    value: s.file,
                    label: s.file,
                    hint: s.description?.slice(0, 80) ?? '',
                })),
                initialValues: shared.map((s) => s.file),
                required: false,
            });
            if (p.isCancel(ans))
                return cancel();
            pickedShared = ans;
        }
        if (pickedStacks.length === 0 && stacks.length > 0) {
            const ans = await p.multiselect({
                message: 'Which stacks?',
                options: stacks.map((st) => ({
                    value: st.name,
                    label: st.name,
                })),
                initialValues: [],
                required: false,
            });
            if (p.isCancel(ans))
                return cancel();
            pickedStacks = ans;
        }
        if (!copilotDescription) {
            const ans = await p.text({
                message: 'Copilot agent description',
                placeholder: description || `${name} agent`,
            });
            if (p.isCancel(ans))
                return cancel();
            copilotDescription = ans || description || `${name} agent`;
        }
    }
    else if (!opts.yes) {
        throw new Error('Non-TTY without --yes and missing flags — cannot run interactively. Pass --description and --shared/--stacks or use --yes.');
    }
    // Defaults in non-interactive mode with --yes.
    if (!description)
        description = `${name} profile`;
    if (pickedShared.length === 0)
        pickedShared = shared.slice(0, 2).map((s) => s.file);
    // stacks default empty — user probably wants to pick explicitly
    if (!copilotDescription)
        copilotDescription = description;
    // Validate picks.
    const sharedSet = new Set(shared.map((s) => s.file));
    for (const f of pickedShared) {
        if (!sharedSet.has(f))
            throw new Error(`Unknown shared guideline "${f}"`);
    }
    const stackSet = new Set(stacks.map((s) => s.name));
    for (const s of pickedStacks) {
        if (!stackSet.has(s))
            throw new Error(`Unknown stack "${s}" — create it under ~/.agent-toolbox/stacks/${s}/ first.`);
    }
    // Compose @-imports for stacks: each file in the stack dir is imported
    // explicitly so the skeleton stays greppable.
    const stackImports = pickedStacks
        .flatMap((stackName) => {
        const info = stacks.find((s) => s.name === stackName);
        return fs
            .readdirSync(info.dir)
            .filter((f) => f.endsWith('.md'))
            .sort()
            .map((f) => `@../../stacks/${stackName}/${f}`);
    })
        .join('\n');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'profile.yaml'), renderProfileYaml({
        name,
        description,
        shared: pickedShared,
        stacks: pickedStacks,
        projectContext: 'project-context.md',
        copilot: { description: copilotDescription },
    }));
    fs.writeFileSync(path.join(dir, 'project-context.md'), renderProjectContext(name, description));
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), renderProfileClaudeMd(name, pickedShared, [stackImports].filter(Boolean)));
    if (interactive) {
        p.log.success(`Created profile at ${dir.split(path.sep).join('/')}`);
        p.log.info('Files: profile.yaml, project-context.md (skeleton — edit before installing), CLAUDE.md (@-imports wired)');
        p.log.info(`Next: edit project-context.md, then \`atb install ${name}\``);
        p.outro('Done.');
    }
    else {
        console.log(`Created profile at ${dir.split(path.sep).join('/')}`);
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
