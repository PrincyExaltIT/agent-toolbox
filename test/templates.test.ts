import { describe, it, expect } from 'vitest';
import YAML from 'yaml';
import {
  renderProfileYaml,
  renderProjectContext,
  renderSharedGuidelineSkeleton,
  renderStackGuidelineSkeleton,
  renderSubagentSkeleton,
  renderSkillSkeleton,
  renderPromptSkeleton,
  renderChatModeSkeleton,
  renderProfileClaudeMd,
} from '../src/templates.js';

/**
 * Templates are pure — they take strings and return strings. We check:
 *   1) the output has valid YAML frontmatter (parses, carries expected keys)
 *   2) the user-supplied description / name make it into the body
 *   3) no leaked TODO markers from wrong branches
 */

function parseFrontmatter(body: string): Record<string, unknown> {
  const m = body.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) throw new Error('no frontmatter');
  return YAML.parse(m[1]);
}

describe('renderProfileYaml', () => {
  it('emits a parseable manifest with every field', () => {
    const out = renderProfileYaml({
      name: 'myprof',
      description: 'desc',
      shared: ['a.md'],
      stacks: ['react'],
      projectContext: 'project-context.md',
      copilot: { description: 'agent desc' },
    });
    const parsed = YAML.parse(out);
    expect(parsed.name).toBe('myprof');
    expect(parsed.shared).toEqual(['a.md']);
    expect(parsed.stacks).toEqual(['react']);
    expect(parsed.project_context).toBe('project-context.md');
    expect(parsed.copilot).toEqual({ description: 'agent desc' });
  });
});

describe('renderSubagentSkeleton', () => {
  it('produces Claude-compatible frontmatter', () => {
    const out = renderSubagentSkeleton('code-reviewer', 'reviews PRs carefully');
    const fm = parseFrontmatter(out);
    expect(fm.name).toBe('code-reviewer');
    expect(fm.description).toBe('reviews PRs carefully');
    expect(fm.model).toBe('inherit');
  });

  it('mentions the subagent name in the heading', () => {
    const out = renderSubagentSkeleton('planner', 'plans');
    expect(out).toMatch(/^# planner$/m);
  });
});

describe('renderSkillSkeleton', () => {
  it('produces a SKILL.md-shaped body', () => {
    const out = renderSkillSkeleton('echo', 'echoes input');
    const fm = parseFrontmatter(out);
    expect(fm.name).toBe('echo');
    expect(fm.description).toBe('echoes input');
    expect(out).toMatch(/## When to use this skill/);
    expect(out).toMatch(/## How the skill works/);
  });
});

describe('renderPromptSkeleton', () => {
  it('produces a Copilot prompt file with mode: agent', () => {
    const out = renderPromptSkeleton('review', 'review helper');
    const fm = parseFrontmatter(out);
    expect(fm.description).toBe('review helper');
    expect(fm.mode).toBe('agent');
  });
});

describe('renderChatModeSkeleton', () => {
  it('produces a Copilot chat mode file with a tools array', () => {
    const out = renderChatModeSkeleton('planner', 'planning mode');
    const fm = parseFrontmatter(out);
    expect(fm.description).toBe('planning mode');
    expect(Array.isArray(fm.tools)).toBe(true);
  });
});

describe('renderSharedGuidelineSkeleton', () => {
  it('titleises the filename in the heading', () => {
    const out = renderSharedGuidelineSkeleton('git-guidelines.md', 'git rules');
    expect(out).toMatch(/^# git guidelines$/m);
    const fm = parseFrontmatter(out);
    expect(fm.description).toBe('git rules');
  });
});

describe('renderStackGuidelineSkeleton', () => {
  it('prefixes the heading with the stack name', () => {
    const out = renderStackGuidelineSkeleton('react', 'react-coding-guidelines.md', 'React rules');
    expect(out).toMatch(/^# react — react coding guidelines$/m);
  });
});

describe('renderProjectContext', () => {
  it('includes the description and required sections', () => {
    const out = renderProjectContext('myprof', 'frontend monorepo');
    expect(out).toContain('frontend monorepo');
    expect(out).toMatch(/## Stack at a glance/);
    expect(out).toMatch(/## Architectural context/);
    expect(out).toMatch(/## Common commands/);
  });
});

describe('renderProfileClaudeMd', () => {
  it('composes shared @-imports relative to the profile dir', () => {
    const out = renderProfileClaudeMd('myprof', ['git.md'], ['@/abs/stacks/react/rules.md']);
    expect(out).toContain('@../../shared/git.md');
    expect(out).toContain('@/abs/stacks/react/rules.md');
    expect(out).toContain('@./project-context.md');
  });

  it('bakes a Priority section that names global skill paths the profile should override', () => {
    const out = renderProfileClaudeMd('myprof', ['git.md'], []);
    expect(out).toContain('## Priority');
    expect(out).toMatch(/~\/\.claude\/skills/);
    expect(out).toMatch(/authoritative source|profile rules win/i);
    expect(out).toContain('## Imports');
    // Imports must still appear after the Priority block — regression for the
    // existing test's expectations.
    const priorityIdx = out.indexOf('## Priority');
    const importsIdx = out.indexOf('## Imports');
    const sharedIdx = out.indexOf('@../../shared/git.md');
    expect(priorityIdx).toBeGreaterThan(-1);
    expect(importsIdx).toBeGreaterThan(priorityIdx);
    expect(sharedIdx).toBeGreaterThan(importsIdx);
  });
});
