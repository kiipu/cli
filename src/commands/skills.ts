import type { CliCommandResult } from '../types/index.js';

export async function runSkillsCommand(): Promise<CliCommandResult> {
  return {
    ok: true,
    message: [
      'Kiipu skills',
      'Claude Code plugin package: @kiipu/claude-plugin',
      'Skill assets package: @kiipu/skills',
      '',
      'Next actions:',
      '  npm view @kiipu/skills version',
      '  npm view @kiipu/claude-plugin version',
      '  In the monorepo: claude --plugin-dir ./packages/claude-plugin',
    ].join('\n'),
    data: {
      packageName: '@kiipu/claude-plugin',
      skillsPackageName: '@kiipu/skills',
      pluginDir: './packages/claude-plugin',
    },
  };
}
