import { install, InstallOptions } from './install.js';
import { SurfaceName } from '../state.js';

export interface SurfaceOptions extends Omit<InstallOptions, 'uninstall' | 'all' | 'claude' | 'copilotVscode' | 'copilotCli' | 'codex'> {
  profile: string;
}

/**
 * Enable one surface for a given profile (thin wrapper around `install`).
 */
export async function surfaceEnable(name: SurfaceName, opts: SurfaceOptions): Promise<void> {
  await install(opts.profile, withSurface(opts, name, false));
}

/**
 * Disable one surface for a given profile.
 */
export async function surfaceDisable(name: SurfaceName, opts: SurfaceOptions): Promise<void> {
  await install(opts.profile, withSurface(opts, name, true));
}

function withSurface(
  opts: SurfaceOptions,
  name: SurfaceName,
  uninstall: boolean
): InstallOptions {
  const { profile: _profile, ...rest } = opts;
  return {
    ...rest,
    uninstall,
    yes: true,
    claude: name === 'claude',
    copilotVscode: name === 'copilot-vscode',
    copilotCli: name === 'copilot-cli',
    codex: name === 'codex',
  };
}
