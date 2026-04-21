import kleur from 'kleur';
import * as p from '@clack/prompts';
import { readState } from '../state.js';
import { install, InstallOptions } from './install.js';
import { SurfaceName } from '../state.js';

export interface SwitchOptions extends Omit<InstallOptions, 'uninstall' | 'all'> {}

/**
 * Switch the active profile on every surface another profile currently occupies.
 * Uninstall the previous occupant first, then install the new one on the same
 * surfaces — never more, never fewer.
 */
export async function switchProfile(profileName: string, opts: SwitchOptions): Promise<void> {
  const state = readState();
  const others = Object.entries(state.profiles).filter(([name]) => name !== profileName);

  if (others.length === 0) {
    p.log.info(`No other profile is installed. Just installing ${profileName} (default surfaces).`);
    await install(profileName, { ...opts, all: true });
    return;
  }

  const surfaceSet = new Set<SurfaceName>();
  for (const [, st] of others) {
    for (const surface of Object.keys(st.surfaces) as SurfaceName[]) {
      surfaceSet.add(surface);
    }
  }

  p.log.info(
    `Switching to ${kleur.bold(profileName)} on surfaces: ${[...surfaceSet].join(', ')}`
  );

  // 1. Uninstall each other profile from the affected surfaces.
  for (const [otherName, st] of others) {
    const surfaces = Object.keys(st.surfaces) as SurfaceName[];
    if (surfaces.length === 0) continue;
    await install(otherName, {
      ...opts,
      uninstall: true,
      claude: surfaces.includes('claude'),
      copilotVscode: surfaces.includes('copilot-vscode'),
      copilotCli: surfaces.includes('copilot-cli'),
      codex: surfaces.includes('codex'),
      yes: true,
    });
  }

  // 2. Install the new profile on the same surface set.
  await install(profileName, {
    ...opts,
    claude: surfaceSet.has('claude'),
    copilotVscode: surfaceSet.has('copilot-vscode'),
    copilotCli: surfaceSet.has('copilot-cli'),
    codex: surfaceSet.has('codex'),
    yes: true,
  });
}
