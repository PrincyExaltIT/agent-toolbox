import fs from 'node:fs';
import path from 'node:path';
import { readManifest } from './manifest.js';
import { profilesRoot, sharedRoot, stacksRoot } from './paths.js';
/**
 * Resolve the directory containing a profile. Reads from the configured
 * content root only — bundled fallback was removed in v0.3.
 */
export function locateProfile(name) {
    const dir = path.join(profilesRoot(), name);
    if (!isProfileDir(dir)) {
        throw new Error(`Profile "${name}" not found at ${dir}\n→ Run \`atb list\` to see available profiles, or \`atb new profile ${name}\` to create it.`);
    }
    return { name, dir, manifest: readManifest(dir) };
}
export function listProfiles() {
    const root = profilesRoot();
    if (!fs.existsSync(root))
        return [];
    const out = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const dir = path.join(root, entry.name);
        if (!isProfileDir(dir))
            continue;
        out.push({ name: entry.name, dir, manifest: readManifest(dir) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}
function isProfileDir(dir) {
    return fs.existsSync(path.join(dir, 'profile.yaml'));
}
export function resolveShared(entry) {
    const p = path.join(sharedRoot(), entry);
    if (!fs.existsSync(p)) {
        throw new Error(`Shared guideline "${entry}" not found at ${p}\n→ Run \`atb new shared ${entry.replace(/\.md$/, '')}\` to create it, or check the filename in profile.yaml.`);
    }
    return p;
}
export function resolveStack(stack) {
    const p = path.join(stacksRoot(), stack);
    if (!fs.existsSync(p)) {
        throw new Error(`Stack "${stack}" not found at ${p}\n→ Run \`atb new stack ${stack}\` to create it, or check the stack name in profile.yaml.`);
    }
    return p;
}
export function listSharedGuidelines() {
    const dir = sharedRoot();
    if (!fs.existsSync(dir))
        return [];
    const out = [];
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.md'))
            continue;
        const absolutePath = path.join(dir, f);
        out.push({
            file: f,
            absolutePath,
            description: readFrontmatterDescription(absolutePath),
        });
    }
    return out.sort((a, b) => a.file.localeCompare(b.file));
}
export function listStacks() {
    const root = stacksRoot();
    if (!fs.existsSync(root))
        return [];
    const out = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        out.push({ name: entry.name, dir: path.join(root, entry.name) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}
function readFrontmatterDescription(file) {
    const content = fs.readFileSync(file, 'utf8');
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match)
        return undefined;
    const line = match[1].split('\n').find((l) => l.startsWith('description:'));
    if (!line)
        return undefined;
    return line
        .replace(/^description:\s*/, '')
        .replace(/^"|"$/g, '')
        .replace(/^'|'$/g, '')
        .trim();
}
