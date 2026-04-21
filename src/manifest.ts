import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export interface CopilotMeta {
  name?: string;
  description?: string;
  argumentHint?: string;
  tools?: string[];
  model?: string;
}

export interface ProfileManifest {
  name: string;
  description?: string;
  shared: string[];
  stacks: string[];
  projectContext?: string;
  copilot: CopilotMeta;
}

export function readManifest(profileDir: string): ProfileManifest {
  const manifestPath = path.join(profileDir, 'profile.yaml');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Profile manifest not found: ${manifestPath}`);
  }
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const parsed = YAML.parse(raw) ?? {};

  const manifest: ProfileManifest = {
    name: stringOrDefault(parsed.name, path.basename(profileDir)),
    description: parsed.description,
    shared: arrayOfStrings(parsed.shared),
    stacks: arrayOfStrings(parsed.stacks),
    projectContext: parsed.project_context,
    copilot: normaliseCopilot(parsed.copilot),
  };

  return manifest;
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function normaliseCopilot(value: unknown): CopilotMeta {
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  return {
    name: typeof v.name === 'string' ? v.name : undefined,
    description: typeof v.description === 'string' ? v.description : undefined,
    argumentHint: typeof v['argument-hint'] === 'string' ? (v['argument-hint'] as string) : undefined,
    tools: arrayOfStrings(v.tools),
    model: typeof v.model === 'string' ? v.model : undefined,
  };
}
