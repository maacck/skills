// @ts-check
import fs from 'node:fs';
import { lintPlanDir } from './lib/lint.mjs';
import { knownFormat, readPlanDir } from './lib/parse-plan.mjs';

const args = process.argv.slice(2);
let dir, asFormat, json = false, invalid = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json' && !json) json = true;
  else if (args[i] === '--as' && asFormat === undefined && /^[1-9]\d*$/.test(args[i + 1] || '') && Number.isSafeInteger(Number(args[i + 1]))) asFormat = Number(args[++i]);
  else if (!args[i].startsWith('-') && !dir) dir = args[i];
  else invalid = true;
}
if (invalid || !dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  console.error('Usage: lint-plan.mjs <plan-dir> [--as <N>] [--json]');
  process.exitCode = 2;
} else {
  const known = knownFormat();
  const issues = lintPlanDir(dir, { asFormat, knownFormat: known });
  const data = readPlanDir(dir, { knownFormat: known });
  const errors = issues.filter(issue => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  if (json) console.log(JSON.stringify(issues, null, 2));
  else {
    for (const issue of issues) console.log(`${issue.file}:${issue.line}  ${issue.severity}  ${issue.rule}  ${issue.message}`);
    console.log(`${errors} errors, ${warnings} warnings (plan format ${data.plan?.format ?? 'N/A'}, impl format ${data.impl?.format ?? 'N/A'}, known ${known})`);
  }
  if (errors) process.exitCode = 1;
}
