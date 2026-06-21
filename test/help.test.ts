import assert from 'node:assert/strict';
import test from 'node:test';

import { getHelpResult } from '../src/commands/help.js';

test('root help lists the main commands', () => {
  const result = getHelpResult();

  assert.equal(result.ok, true);
  assert.match(result.message, /kiipu <command> \[options\]/);
  assert.match(result.message, /Core commands:/);
  assert.match(result.message, /ask\s+Ask questions over your Kiipu notes/);
  assert.match(result.message, /note\s+Create, browse, update, and delete notes/);
  assert.match(result.message, /skills\s+Show where the Claude Code plugin package lives/);
  assert.match(result.message, /kiipu ask "What changed in my roadmap notes\?"/);
  assert.match(result.message, /kiipu note create "Hello Kiipu"/);
  assert.match(result.message, /kiipu note list --starred/);
  assert.match(result.message, /kiipu auth login/);
  assert.doesNotMatch(result.message, /skills install/);
  assert.match(result.message, /claude --plugin-dir \.\/packages\/claude-plugin/);
});

test('subcommand help renders auth usage', () => {
  const result = getHelpResult('auth');

  assert.equal(result.ok, true);
  assert.match(result.message, /kiipu auth login --device-name/);
  assert.match(result.message, /kiipu auth login --no-browser/);
  assert.match(result.message, /kiipu auth login --api-key <cpk_\.\.\.>/);
  assert.match(result.message, /kiipu auth logout/);
});

test('subcommand help renders ask usage', () => {
  const result = getHelpResult('ask');

  assert.equal(result.ok, true);
  assert.match(result.message, /kiipu ask "question"/);
  assert.match(result.message, /kiipu ask --conversation-id <conversationId>/);
  assert.match(result.message, /kiipu ask history/);
  assert.match(result.message, /kiipu ask show --id <conversationId>/);
  assert.match(result.message, /--source-mode <value>/);
});

test('subcommand help renders skills and note options', () => {
  const skillsHelp = getHelpResult('skills');
  const postHelp = getHelpResult('note');

  assert.equal(skillsHelp.ok, true);
  assert.match(
    skillsHelp.message,
    /Claude Code plugin support is published from the separate `@kiipu\/claude-plugin` package/,
  );
  assert.match(skillsHelp.message, /claude --plugin-dir \.\/packages\/claude-plugin/);

  assert.equal(postHelp.ok, true);
  assert.match(postHelp.message, /kiipu note create --content/);
  assert.match(postHelp.message, /kiipu note list \[--tag <tag>\]/);
  assert.match(postHelp.message, /kiipu note show --id <noteId>/);
  assert.match(postHelp.message, /kiipu note update --id <noteId> --content/);
  assert.match(postHelp.message, /kiipu note delete --id/);
});
