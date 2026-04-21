import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
/** Invariant location of the CLI's own config file. Not user-configurable. */
export function configDir() {
    return normalise(path.join(os.homedir(), '.agent-toolbox'));
}
export function configFile() {
    return normalise(path.join(configDir(), 'config.json'));
}
export function readConfig() {
    const file = configFile();
    if (!fs.existsSync(file))
        return {};
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch {
        return {};
    }
}
export function writeConfig(cfg) {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}
export class ContentRootNotConfiguredError extends Error {
    constructor() {
        super('Content root is not configured. Run `atb config init` to choose where your toolbox content lives.');
        this.name = 'ContentRootNotConfiguredError';
    }
}
/**
 * Resolve the content root following the precedence chain:
 *   1. --root flag (passed explicitly)
 *   2. $AGENT_TOOLBOX_ROOT env var
 *   3. contentRoot in config.json
 * Throws ContentRootNotConfiguredError if none are set.
 */
export function resolveContentRoot(rootFlag) {
    if (rootFlag)
        return normalise(path.resolve(rootFlag));
    const env = process.env.AGENT_TOOLBOX_ROOT;
    if (env)
        return normalise(path.resolve(env));
    const cfg = readConfig();
    if (cfg.contentRoot)
        return normalise(cfg.contentRoot);
    throw new ContentRootNotConfiguredError();
}
function normalise(p) {
    return p.split(path.sep).join('/');
}
