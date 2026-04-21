/**
 * Tiny marker-block utilities shared by the claude and copilot-cli surfaces.
 * A marker block looks like:
 *
 *   <begin line>
 *   <body>
 *   <end line>
 *
 * Operations are idempotent, preserve surrounding content, and collapse one
 * blank line immediately before the block on removal (so repeated
 * install/uninstall cycles do not accumulate blank lines).
 */
export function hasBlock(content, begin) {
    return content.split('\n').some((line) => line === begin);
}
export function replaceBlock(content, begin, end, block) {
    const lines = content.split('\n');
    const out = [];
    let inBlock = false;
    let replaced = false;
    for (const line of lines) {
        if (line === begin) {
            inBlock = true;
            if (!replaced) {
                out.push(...block.split('\n'));
                replaced = true;
            }
            continue;
        }
        if (line === end) {
            if (inBlock) {
                inBlock = false;
                continue;
            }
        }
        if (!inBlock)
            out.push(line);
    }
    return out.join('\n');
}
export function stripBlock(content, begin, end) {
    const lines = content.split('\n');
    const out = [];
    let inBlock = false;
    for (const line of lines) {
        if (line === begin) {
            inBlock = true;
            // Drop a single blank line immediately before the block, if any.
            if (out.length > 0 && out[out.length - 1] === '') {
                out.pop();
            }
            continue;
        }
        if (line === end) {
            if (inBlock) {
                inBlock = false;
                continue;
            }
        }
        if (!inBlock)
            out.push(line);
    }
    return out.join('\n');
}
export function appendBlock(content, block) {
    if (content.length === 0) {
        return `${block}\n`;
    }
    const sep = content.endsWith('\n') ? '\n' : '\n\n';
    return `${content}${sep}${block}\n`;
}
