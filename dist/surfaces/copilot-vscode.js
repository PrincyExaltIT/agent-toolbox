import fs from 'node:fs';
import path from 'node:path';
import { vscodePromptsDir } from '../paths.js';
export function runCopilotVscode(profile, artifacts, opts = {}) {
    const promptsDir = vscodePromptsDir(opts.vscodeSettings);
    const dst = path.join(promptsDir, `${profile.name}.agent.md`).split(path.sep).join('/');
    if (opts.uninstall) {
        if (!fs.existsSync(dst)) {
            return { surface: 'copilot-vscode', action: 'noop', detail: `no file at ${dst}` };
        }
        if (opts.dryRun) {
            return { surface: 'copilot-vscode', action: 'planned', detail: `would remove ${dst}` };
        }
        fs.rmSync(dst);
        return { surface: 'copilot-vscode', action: 'remove', detail: `removed ${dst}` };
    }
    const src = artifacts.agentMd;
    if (!fs.existsSync(src)) {
        throw new Error(`Generator output missing: ${src}`);
    }
    const upToDate = fs.existsSync(dst) && fileEqual(src, dst);
    if (upToDate) {
        return { surface: 'copilot-vscode', action: 'noop', detail: `already up to date at ${dst}` };
    }
    if (opts.dryRun) {
        return {
            surface: 'copilot-vscode',
            action: 'planned',
            detail: `would copy ${src} → ${dst}`,
        };
    }
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.copyFileSync(src, dst);
    return { surface: 'copilot-vscode', action: 'append', detail: `copied agent file to ${dst}` };
}
function fileEqual(a, b) {
    const bufA = fs.readFileSync(a);
    const bufB = fs.readFileSync(b);
    return bufA.equals(bufB);
}
