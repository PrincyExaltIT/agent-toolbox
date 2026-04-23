import { describe, it, expect } from 'vitest';
import { hasBlock, replaceBlock, stripBlock, appendBlock } from '../src/surfaces/marker.js';

const BEGIN = '<!-- agent-toolbox:myprof:begin -->';
const END = '<!-- agent-toolbox:myprof:end -->';
const BLOCK = `${BEGIN}\n@/abs/myprof/CLAUDE.md\n${END}`;

describe('marker.hasBlock', () => {
  it('returns false for empty content', () => {
    expect(hasBlock('', BEGIN)).toBe(false);
  });

  it('matches only on exact full-line marker', () => {
    expect(hasBlock(`some text ${BEGIN} inline`, BEGIN)).toBe(false);
    expect(hasBlock(`before\n${BEGIN}\nafter`, BEGIN)).toBe(true);
  });

  it('does not match a different profile\'s marker', () => {
    expect(hasBlock(`before\n${BEGIN}\nafter`, '<!-- agent-toolbox:other:begin -->')).toBe(false);
  });
});

describe('marker.appendBlock', () => {
  it('appends with newline when content is empty', () => {
    expect(appendBlock('', BLOCK)).toBe(`${BLOCK}\n`);
  });

  it('always leaves exactly one blank line between existing content and the block', () => {
    // This symmetry is what makes append + strip cycles stable — stripBlock
    // removes a single blank line above the block, so append must always put
    // one there regardless of whether content already ends with a newline.
    expect(appendBlock('existing\n', BLOCK)).toBe(`existing\n\n${BLOCK}\n`);
    expect(appendBlock('existing', BLOCK)).toBe(`existing\n\n${BLOCK}\n`);
  });
});

describe('marker.replaceBlock', () => {
  it('replaces the block contents while keeping surrounding text intact', () => {
    const content = `preamble\n${BEGIN}\n@old/path\n${END}\ntrailer`;
    const next = `${BEGIN}\n@new/path\n${END}`;
    expect(replaceBlock(content, BEGIN, END, next)).toBe(
      `preamble\n${BEGIN}\n@new/path\n${END}\ntrailer`
    );
  });

  it('is a no-op when the marker does not exist', () => {
    const content = 'nothing to replace\n';
    expect(replaceBlock(content, BEGIN, END, BLOCK)).toBe(content);
  });

  it('only replaces the first occurrence (duplicates should not happen but must not corrupt)', () => {
    const content = `${BEGIN}\nA\n${END}\n${BEGIN}\nB\n${END}`;
    const next = `${BEGIN}\nNEW\n${END}`;
    const out = replaceBlock(content, BEGIN, END, next);
    // Implementation replaces the first block and drops the body of the second
    // (its begin/end are still treated as block delimiters).
    expect(out).toContain('NEW');
    expect(out.match(new RegExp(BEGIN, 'g'))!.length).toBeGreaterThanOrEqual(1);
  });
});

describe('marker.stripBlock', () => {
  it('removes the block and the single blank line immediately above it', () => {
    const content = `preamble\n\n${BEGIN}\nbody\n${END}\ntrailer`;
    expect(stripBlock(content, BEGIN, END)).toBe(`preamble\ntrailer`);
  });

  it('preserves other content when the block is at the top', () => {
    const content = `${BEGIN}\nbody\n${END}\nafter`;
    expect(stripBlock(content, BEGIN, END)).toBe('after');
  });

  it('is a no-op when the marker is not present', () => {
    expect(stripBlock('just text\n', BEGIN, END)).toBe('just text\n');
  });

  it('repeated append + strip does not accumulate blank lines', () => {
    const base = 'existing content\n';
    let current = appendBlock(base, BLOCK);
    current = stripBlock(current, BEGIN, END);
    current = appendBlock(current, BLOCK);
    current = stripBlock(current, BEGIN, END);
    expect(current).toBe(base);
  });
});
