import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
export const PROJECT_CONFIG_FILE = '.agent-toolbox.yaml';
export function projectConfigExists(cwd = process.cwd()) {
    return fs.existsSync(path.join(cwd, PROJECT_CONFIG_FILE));
}
export function readProjectConfig(cwd = process.cwd()) {
    const file = path.join(cwd, PROJECT_CONFIG_FILE);
    if (!fs.existsSync(file)) {
        throw new Error(`No profile specified and no ${PROJECT_CONFIG_FILE} found in the current directory.\n→ Pass a profile name: \`atb install <profile>\`, or run \`atb init\` to create a project config.`);
    }
    const parsed = YAML.parse(fs.readFileSync(file, 'utf8')) ?? {};
    if (!parsed.profile || typeof parsed.profile !== 'string') {
        throw new Error(`${PROJECT_CONFIG_FILE} is missing a valid "profile" key.\n→ Expected format: profile: <name>`);
    }
    return { profile: parsed.profile };
}
export function writeProjectConfig(config, cwd = process.cwd()) {
    const file = path.join(cwd, PROJECT_CONFIG_FILE);
    fs.writeFileSync(file, `# agent-toolbox project config\n# Commit this file so teammates can run \`atb install\` with no argument.\nprofile: ${config.profile}\n`, 'utf8');
    return file.split(path.sep).join('/');
}
