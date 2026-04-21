import fs from 'node:fs';
import path from 'node:path';
import { replaceBlock, stripBlock, hasBlock, appendBlock } from './marker.js';
export function runCopilotCli(profile, artifacts, opts = {}) {
    const profileDir = path.dirname(artifacts.agentsMd).split(path.sep).join('/');
    const exportLine = `export COPILOT_CUSTOM_INSTRUCTIONS_DIRS="\${COPILOT_CUSTOM_INSTRUCTIONS_DIRS:+$COPILOT_CUSTOM_INSTRUCTIONS_DIRS:}${profileDir}"`;
    if (!opts.writeShellRc) {
        if (opts.uninstall) {
            return {
                surface: 'copilot-cli',
                action: 'noop',
                detail: 'no --write-shell-rc passed; unset the env var manually if you had it',
            };
        }
        return {
            surface: 'copilot-cli',
            action: opts.dryRun ? 'planned' : 'noop',
            detail: `paste into your shell rc: ${exportLine}`,
        };
    }
    const rc = opts.writeShellRc;
    const begin = `# agent-toolbox:${profile.name}:begin`;
    const end = `# agent-toolbox:${profile.name}:end`;
    const block = `${begin}\n${exportLine}\n${end}`;
    const exists = fs.existsSync(rc);
    const content = exists ? fs.readFileSync(rc, 'utf8') : '';
    const present = hasBlock(content, begin);
    if (opts.uninstall) {
        if (!present) {
            return { surface: 'copilot-cli', action: 'noop', detail: `no ${profile.name} block in ${rc}` };
        }
        if (opts.dryRun) {
            return { surface: 'copilot-cli', action: 'planned', detail: `would remove ${profile.name} block from ${rc}` };
        }
        fs.writeFileSync(rc, stripBlock(content, begin, end));
        return { surface: 'copilot-cli', action: 'remove', detail: `removed ${profile.name} block from ${rc}` };
    }
    if (opts.dryRun) {
        return {
            surface: 'copilot-cli',
            action: 'planned',
            detail: `would ${present ? 'update' : 'append'} ${profile.name} block in ${rc}`,
        };
    }
    fs.mkdirSync(path.dirname(rc), { recursive: true });
    if (present) {
        fs.writeFileSync(rc, replaceBlock(content, begin, end, block));
        return { surface: 'copilot-cli', action: 'update', detail: `updated ${profile.name} block in ${rc}` };
    }
    fs.writeFileSync(rc, appendBlock(content, block));
    return { surface: 'copilot-cli', action: 'append', detail: `appended ${profile.name} block to ${rc}` };
}
