#!/usr/bin/env node
import './config/load-env.js';

import { createDefaultConfig, loadKiipuConfig } from './config/config.js';
import { runAskCommand } from './commands/ask.js';
import { runAuthCommand } from './commands/auth.js';
import { runDoctorCommand } from './commands/doctor.js';
import { getHelpResult } from './commands/help.js';
import { runNoteCommand } from './commands/note.js';
import { runSkillsCommand } from './commands/skills.js';
import { readFlag, hasFlag } from './utils/args.js';
import type { CliCommandResult } from './types/index.js';
import { CLI_VERSION } from './version.js';

function printResult(result: CliCommandResult, asJson: boolean) {
  if (asJson) {
    console.log(JSON.stringify(result.json ?? result, null, 2));
  } else {
    console.log(result.message);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
  const commandArgs = normalizedArgs.filter(
    (arg) =>
      arg !== '--json' && arg !== '--help' && arg !== '-h' && arg !== '--version' && arg !== '-v',
  );
  const asJson = hasFlag(normalizedArgs, '--json');
  const wantsHelp = hasFlag(normalizedArgs, '--help') || hasFlag(normalizedArgs, '-h');
  const wantsVersion = hasFlag(normalizedArgs, '--version') || hasFlag(normalizedArgs, '-v');
  const flagsWithValues = new Set([
    '--scheduled-at',
    '--package-root',
    '--skills-dir',
    '--text',
    '--content',
    '--id',
    '--api-key',
    '--device-name',
    '--config-path',
    '--wrapper-path',
    '--conversation-id',
    '--tag',
    '--sort',
    '--query',
    '--title',
    '--visibility',
    '--tags',
    '--question',
    '--conversation-id',
    '--top-k',
    '--source-mode',
    '--limit',
  ]);
  const positionalArgs = normalizedArgs.filter((arg, index, all) => {
    if (
      arg === '--json' ||
      arg === '--help' ||
      arg === '-h' ||
      arg === '--version' ||
      arg === '-v' ||
      arg === '--no-browser' ||
      arg.startsWith('--')
    ) {
      return false;
    }
    const prev = all[index - 1];
    return prev ? !flagsWithValues.has(prev) : true;
  });
  const [command, subcommand] = positionalArgs;

  if (wantsVersion) {
    console.log(CLI_VERSION);
    return;
  }

  if (wantsHelp || command === 'help') {
    return printResult(getHelpResult(command === 'help' ? subcommand : command), asJson);
  }

  const config = (await loadKiipuConfig()) ?? createDefaultConfig();
  let result: CliCommandResult;

  if (command === 'skills') {
    if (wantsHelp || !subcommand) {
      result = getHelpResult('skills');
      return printResult(result, asJson);
    }

    result = await runSkillsCommand();
    return printResult(result, asJson);
  }

  if (command === 'doctor') {
    result = await runDoctorCommand(await loadKiipuConfig());
    return printResult(result, asJson);
  }

  if (command === 'note') {
    result = await runNoteCommand(config, commandArgs);
    return printResult(result, asJson);
  }

  if (command === 'ask') {
    result = await runAskCommand(config, commandArgs, {
      stream: !asJson,
      write: (chunk) => process.stdout.write(chunk),
    });
    return printResult(result, asJson);
  }

  if (command === 'auth') {
    const action = subcommand as 'login' | 'status' | 'logout' | undefined;
    if (!action || !['login', 'status', 'logout'].includes(action)) {
      result = getHelpResult('auth');
      return printResult(result, asJson);
    }

    result = await runAuthCommand(config, {
      action,
      apiKey: readFlag(normalizedArgs, '--api-key'),
      deviceName: readFlag(normalizedArgs, '--device-name'),
      noBrowser: hasFlag(normalizedArgs, '--no-browser'),
    });
    return printResult(result, asJson);
  }

  result = getHelpResult();
  printResult(result, asJson);
}

void main();
