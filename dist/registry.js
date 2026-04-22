const REGISTRY_URL = 'https://raw.githubusercontent.com/PrincyExaltIT/agent-toolbox-registry/main/registry.json';
export async function fetchRegistry() {
    let res;
    try {
        res = await fetch(REGISTRY_URL);
    }
    catch {
        throw new Error('Could not reach the registry.\n→ Check your internet connection or install directly with `atb stack add <github-url>`.');
    }
    if (!res.ok) {
        throw new Error(`Registry returned ${res.status}.\n→ Try again later or install directly with \`atb stack add <github-url>\`.`);
    }
    return res.json();
}
export function searchRegistry(registry, query) {
    const q = query.toLowerCase();
    return registry.stacks.filter((s) => s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)));
}
export function findInRegistry(registry, name) {
    return registry.stacks.find((s) => s.name === name);
}
