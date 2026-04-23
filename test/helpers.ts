import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';

/**
 * Shared test fixtures. Every helper that touches the filesystem creates
 * directories under `os.tmpdir()` and returns absolute paths the caller
 * passes as override flags (e.g. `configDir`, `vscodeSettings`) so no test
 * ever touches the user's real `~/.claude` or VS Code config.
 */

export function makeTmpDir(label: string): string {
  const dir = path.join(os.tmpdir(), `atb-${label}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function rmTmpDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // swallow — Windows sometimes holds handles for an extra tick
  }
}

/**
 * Build a content-root tree with the given profiles, stacks, and shared
 * files. Each profile/stack entry is a record mapping relative file paths
 * to their body. Returns the absolute root path.
 */
export interface ContentRootSpec {
  profiles?: Record<string, Record<string, string>>;
  stacks?: Record<string, Record<string, string>>;
  shared?: Record<string, string>;
}

export function makeContentRoot(spec: ContentRootSpec = {}): string {
  const root = makeTmpDir('content');
  for (const [name, files] of Object.entries(spec.profiles ?? {})) {
    const dir = path.join(root, 'profiles', name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [rel, body] of Object.entries(files)) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
  }
  for (const [name, files] of Object.entries(spec.stacks ?? {})) {
    const dir = path.join(root, 'stacks', name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [rel, body] of Object.entries(files)) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
  }
  if (spec.shared) {
    const dir = path.join(root, 'shared');
    fs.mkdirSync(dir, { recursive: true });
    for (const [rel, body] of Object.entries(spec.shared)) {
      fs.writeFileSync(path.join(dir, rel), body);
    }
  }
  return root;
}

export interface ProfileYamlInput {
  name: string;
  description?: string;
  shared?: string[];
  stacks?: string[];
  projectContext?: string;
  copilot?: Record<string, unknown>;
}

export function profileYaml(input: ProfileYamlInput): string {
  return YAML.stringify({
    name: input.name,
    description: input.description ?? `${input.name} test profile`,
    shared: input.shared ?? [],
    stacks: input.stacks ?? [],
    project_context: input.projectContext,
    copilot: input.copilot ?? { description: `${input.name} agent` },
  });
}

/**
 * Minimal profile scaffold that satisfies Claude surface install
 * (needs a CLAUDE.md next to profile.yaml).
 */
export function minimalProfileFiles(
  name: string,
  opts: { stacks?: string[]; shared?: string[] } = {}
): Record<string, string> {
  return {
    'profile.yaml': profileYaml({ name, ...opts }),
    'CLAUDE.md': `# ${name}\n`,
  };
}

/**
 * Install the CLI config.json so `resolveContentRoot()` returns our scratch
 * root without reading or mutating the user's real ~/.agent-toolbox/. Call
 * this before any code path that routes through `paths.contentRoot()`.
 *
 * Uses the AGENT_TOOLBOX_ROOT env var (documented in README) which wins
 * over any config file, so tests don't need to write to configDir().
 */
export function withContentRoot(root: string): () => void {
  const prev = process.env.AGENT_TOOLBOX_ROOT;
  process.env.AGENT_TOOLBOX_ROOT = root;
  return () => {
    if (prev === undefined) delete process.env.AGENT_TOOLBOX_ROOT;
    else process.env.AGENT_TOOLBOX_ROOT = prev;
  };
}

/**
 * Redirect state.json + config.json writes to a scratch CLI state dir by
 * overriding the platform config-dir lookup. The CLI resolves configDir via
 * $APPDATA on Windows and $HOME/.agent-toolbox elsewhere, so we temporarily
 * point those at the scratch dir.
 */
export function withCliStateDir(dir: string): () => void {
  fs.mkdirSync(dir, { recursive: true });
  const prevHome = process.env.HOME;
  const prevAppData = process.env.APPDATA;
  const prevUserProfile = process.env.USERPROFILE;
  // Our config.ts uses os.homedir() internally which reads USERPROFILE on
  // Windows and HOME elsewhere. Rewriting them together covers both.
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  if (process.platform === 'win32') {
    // APPDATA flows to vscodeUserDir; leave it alone so VS Code paths are
    // still computed from the real location unless a test overrides it.
    process.env.APPDATA = process.env.APPDATA;
  }
  return () => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    if (prevAppData !== undefined) process.env.APPDATA = prevAppData;
  };
}

/**
 * Dirty trick for tests that load modules caching `os.homedir()` at import
 * time: vite-node re-imports per test file unless cached, but our config.ts
 * reads env at call time so this suffices.
 */
export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}
