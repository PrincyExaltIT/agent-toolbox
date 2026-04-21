import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
export function readManifest(profileDir) {
    const manifestPath = path.join(profileDir, 'profile.yaml');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Profile manifest not found: ${manifestPath}`);
    }
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = YAML.parse(raw) ?? {};
    const manifest = {
        name: stringOrDefault(parsed.name, path.basename(profileDir)),
        description: parsed.description,
        shared: arrayOfStrings(parsed.shared),
        stacks: arrayOfStrings(parsed.stacks),
        projectContext: parsed.project_context,
        copilot: normaliseCopilot(parsed.copilot),
    };
    return manifest;
}
function arrayOfStrings(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((v) => typeof v === 'string');
}
function stringOrDefault(value, fallback) {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}
function normaliseCopilot(value) {
    if (!value || typeof value !== 'object')
        return {};
    const v = value;
    return {
        name: typeof v.name === 'string' ? v.name : undefined,
        description: typeof v.description === 'string' ? v.description : undefined,
        argumentHint: typeof v['argument-hint'] === 'string' ? v['argument-hint'] : undefined,
        tools: arrayOfStrings(v.tools),
        model: typeof v.model === 'string' ? v.model : undefined,
    };
}
