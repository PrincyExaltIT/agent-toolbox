const REGISTRY_URL =
  'https://raw.githubusercontent.com/PrincyExaltIT/agent-toolbox-registry/main/registry.json';

export interface RegistryEntry {
  name: string;
  description: string;
  author: string;
  repo: string;
  tags: string[];
  version: string;
}

export interface Registry {
  version: number;
  stacks: RegistryEntry[];
}

export async function fetchRegistry(): Promise<Registry> {
  let res: Response;
  try {
    res = await fetch(REGISTRY_URL);
  } catch {
    throw new Error(
      'Could not reach the registry.\n→ Check your internet connection or install directly with `atb stack add <github-url>`.'
    );
  }
  if (!res.ok) {
    throw new Error(
      `Registry returned ${res.status}.\n→ Try again later or install directly with \`atb stack add <github-url>\`.`
    );
  }
  return res.json() as Promise<Registry>;
}

export function searchRegistry(registry: Registry, query: string): RegistryEntry[] {
  const q = query.toLowerCase();
  return registry.stacks.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q))
  );
}

export function findInRegistry(registry: Registry, name: string): RegistryEntry | undefined {
  return registry.stacks.find((s) => s.name === name);
}
