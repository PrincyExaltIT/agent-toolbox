import fs from 'node:fs';
import path from 'node:path';
import { readManifest } from './manifest.js';
import { bundledGuidelinesRoot, userProfilesRoot } from './paths.js';
/**
 * Resolve the directory containing a profile. User-scope profiles override
 * bundled profiles of the same name — so `~/.agent-toolbox/profiles/frequencies`
 * wins over the bundled one if both exist.
 */
export function locateProfile(name) {
    const userDir = path.join(userProfilesRoot(), name);
    if (isProfileDir(userDir)) {
        return { name, origin: 'user', dir: userDir, manifest: readManifest(userDir) };
    }
    const bundledDir = path.join(bundledGuidelinesRoot(), 'profiles', name);
    if (isProfileDir(bundledDir)) {
        return { name, origin: 'bundled', dir: bundledDir, manifest: readManifest(bundledDir) };
    }
    throw new Error(`Profile "${name}" not found. Looked in:\n  ${userDir}\n  ${bundledDir}`);
}
export function listProfiles() {
    const seen = new Map();
    for (const root of [userProfilesRoot(), path.join(bundledGuidelinesRoot(), 'profiles')]) {
        if (!fs.existsSync(root))
            continue;
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            const dir = path.join(root, entry.name);
            if (!isProfileDir(dir))
                continue;
            if (seen.has(entry.name))
                continue; // user-scope already registered (it's scanned first)
            const origin = root === userProfilesRoot() ? 'user' : 'bundled';
            seen.set(entry.name, {
                name: entry.name,
                origin,
                dir,
                manifest: readManifest(dir),
            });
        }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function isProfileDir(dir) {
    return fs.existsSync(path.join(dir, 'profile.yaml'));
}
/**
 * Resolve a shared guideline file by its manifest entry (e.g. "git-guidelines.md").
 * User-scope shared dir takes precedence over bundled, same as profiles.
 */
export function resolveShared(entry) {
    const userPath = path.join(userProfilesRoot(), '..', 'shared', entry);
    if (fs.existsSync(userPath))
        return userPath;
    const bundledPath = path.join(bundledGuidelinesRoot(), 'shared', entry);
    if (fs.existsSync(bundledPath))
        return bundledPath;
    throw new Error(`Shared guideline "${entry}" not found in user or bundled trees.`);
}
/**
 * Resolve a stack directory by name. Same precedence rules.
 */
export function resolveStack(stack) {
    const userPath = path.join(userProfilesRoot(), '..', 'stacks', stack);
    if (fs.existsSync(userPath))
        return userPath;
    const bundledPath = path.join(bundledGuidelinesRoot(), 'stacks', stack);
    if (fs.existsSync(bundledPath))
        return bundledPath;
    throw new Error(`Stack "${stack}" not found in user or bundled trees.`);
}
/**
 * List every shared guideline file available (bundled and user-scope). User
 * files with the same filename as bundled ones shadow the bundled entry.
 */
export function listSharedGuidelines() {
    const result = new Map();
    const roots = [
        [path.join(userProfilesRoot(), '..', 'shared'), 'user'],
        [path.join(bundledGuidelinesRoot(), 'shared'), 'bundled'],
    ];
    for (const [dir, origin] of roots) {
        if (!fs.existsSync(dir))
            continue;
        for (const f of fs.readdirSync(dir)) {
            if (!f.endsWith('.md'))
                continue;
            if (result.has(f))
                continue; // user wins
            const absolutePath = path.join(dir, f);
            result.set(f, { file: f, origin, absolutePath, description: readFrontmatterDescription(absolutePath) });
        }
    }
    return [...result.values()].sort((a, b) => a.file.localeCompare(b.file));
}
/**
 * List every stack directory available. User stacks shadow bundled ones.
 */
export function listStacks() {
    const result = new Map();
    const roots = [
        [path.join(userProfilesRoot(), '..', 'stacks'), 'user'],
        [path.join(bundledGuidelinesRoot(), 'stacks'), 'bundled'],
    ];
    for (const [dir, origin] of roots) {
        if (!fs.existsSync(dir))
            continue;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            if (result.has(entry.name))
                continue;
            result.set(entry.name, { name: entry.name, origin, dir: path.join(dir, entry.name) });
        }
    }
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
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
