import { execFile } from 'node:child_process';
import { access, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import matter from 'gray-matter';
import YAML from 'yaml';

const execFileAsync = promisify(execFile);

const requiredGuidance = [
  'AGENTS.md',
  'src/AGENTS.md',
  'src/content/AGENTS.md',
  'docs/AGENTS.md',
  'memory/AGENTS.md',
];

const requiredSkills = [
  'research-and-publish',
  'site-change',
  'archive-and-memory',
];

const requiredCatalogFields = [
  'title',
  'path',
  'topic',
  'type',
  'language',
  'status',
  'summary',
  'source',
  'updated',
];

const requiredTopicFields = ['id', 'name', 'description', 'folder'];
const markdownExtensions = new Set(['.md', '.mdx']);
const sourceExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mdx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
]);
const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const binaryExtensions = new Set([
  '.avif',
  '.eot',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.otf',
  '.png',
  '.ttf',
  '.wasm',
  '.webp',
  '.woff',
  '.woff2',
]);
const forbiddenLocalArtifactPrefixes = [
  '.superpowers/',
  'docs/superpowers/',
  'docs/_inbox/',
];
const identityLeakPattern = new RegExp([
  String.raw`/Users/(?!user\b|example\b)[A-Za-z0-9._-]+`,
  String.raw`@[A-Za-z0-9.-]*(?:gmail|naver|icloud)\.com\b`,
  String.raw`(?:m\.)?blog\.naver\.com/(?!example)[A-Za-z0-9_-]+`,
  String.raw`origin:\s*kws\b`,
  String.raw`origin:\s*'kws'`,
  String.raw`"origin"\s*:\s*"kws"`,
  String.raw`\[\s*'kws'\s*,\s*'external'`,
].join('|'), 'i');

function repoPath(root, absolutePath) {
  return relative(root, absolutePath).split('\\').join('/');
}

function isInside(parent, candidate) {
  const result = relative(parent, candidate);
  return result === '' || (result !== '..' && !result.startsWith('../') && !result.startsWith('..\\') && !isAbsolute(result));
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function realPath(path) {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

async function collectFiles(directory, extensions) {
  if (!await exists(directory)) {
    return [];
  }

  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, extensions));
    } else if (extensions.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readText(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function discoverSkillPaths(root) {
  const skillsRoot = join(root, '.agents/skills');
  if (!await exists(skillsRoot)) {
    return [];
  }

  const paths = [];
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = `.agents/skills/${entry.name}/SKILL.md`;
    if (await exists(join(root, path))) {
      paths.push(path);
    }
  }
  return paths;
}

function parseYamlArray(text, label, errors) {
  if (text === null) {
    errors.push(`${label}: file is required`);
    return [];
  }

  try {
    const value = YAML.parse(text);
    if (!Array.isArray(value)) {
      errors.push(`${label}: expected a YAML array`);
      return [];
    }
    return value;
  } catch (error) {
    errors.push(`${label}: invalid YAML (${error.message})`);
    return [];
  }
}

function validateYamlEntries(entries, requiredFields, label, errors) {
  const objects = [];
  for (const [index, entry] of entries.entries()) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${label}: entry ${index + 1} must be an object`);
      continue;
    }

    objects.push(entry);
    for (const field of requiredFields) {
      const value = entry[field];
      if (value === undefined || value === null || value === '') {
        errors.push(`${label}: entry ${index + 1} missing field "${field}"`);
      } else if (typeof value !== 'string') {
        errors.push(`${label}: entry ${index + 1} field "${field}" must be a string`);
      }
    }
  }
  return objects;
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates];
}

function graphifyStatement(line, index) {
  const start = Math.max(
    line.lastIndexOf(';', index - 1),
    line.lastIndexOf('.', index - 1),
  ) + 1;
  const nextSeparators = [line.indexOf(';', index), line.indexOf('.', index)]
    .filter((position) => position !== -1);
  const end = nextSeparators.length === 0 ? line.length : Math.min(...nextSeparators);
  return line.slice(start, end);
}

function isGraphifyRemovalMention(statementText) {
  const statement = statementText.toLowerCase();
  return /\b(?:is|was|has been|had been)\s+removed\b/.test(statement)
    || /\b(?:do not|don't|never)\s+(?:run|restore|use|invoke|install|enable)\b/.test(statement)
    || /\b(?:not|no longer)\b.*\b(?:dependency|integrated|supported|used)\b/.test(statement)
    || /\bmust\s+(?:remain|stay)\s+disabled\b/.test(statement)
    || /\bhistorical\b/.test(statement)
    || /\bcontent only\b/.test(statement);
}

function containsGraphifyCommand(markdown) {
  const pattern = /\b(graphify)\s+((?:--?)?[a-z][a-z0-9-]*)\b/gi;
  for (const line of markdown.split(/\r?\n/)) {
    for (const match of line.matchAll(pattern)) {
      if (isGraphifyRemovalMention(graphifyStatement(line, match.index))) {
        continue;
      }
      const executable = match[1];
      const prefix = line.slice(0, match.index).replace(/[`*_]/g, '').trim();
      const startsLowercaseCommand = prefix === '' && executable === 'graphify';
      const explicitCommandContext = /^(?:[$>]|[-+]|\d+[.)])$/.test(prefix)
        || /\b(?:call|execute|invoke|run|use)\s*$/i.test(prefix);
      if (startsLowercaseCommand || explicitCommandContext) {
        return true;
      }
    }
  }
  return false;
}

function stripMarkdownFences(markdown) {
  let fence = null;
  return markdown.split(/\r?\n/).map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence === null && marker) {
      fence = { character: marker[0], length: marker.length };
      return '';
    }
    if (fence !== null) {
      const closing = new RegExp(`^ {0,3}\\${fence.character}{${fence.length},}\\s*$`);
      if (closing.test(line)) {
        fence = null;
      }
      return '';
    }
    return line;
  }).join('\n');
}

function normalizeReferenceLabel(label) {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function markdownDestination(rawDestination) {
  const value = rawDestination.trim();
  if (value.startsWith('<')) {
    const closing = value.indexOf('>');
    return closing < 0 ? null : value.slice(1, closing);
  }

  let depth = 0;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')' && depth > 0) {
      depth -= 1;
    } else if (/\s/.test(character) && depth === 0) {
      return value.slice(0, index);
    }
  }
  return value;
}

function findClosingBracket(markdown, openIndex) {
  let depth = 0;
  let escaped = false;
  for (let index = openIndex; index < markdown.length; index += 1) {
    const character = markdown[index];
    if (escaped) {
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '[') {
      depth += 1;
    } else if (character === ']') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function normalizedIndexTarget(root, destination) {
  if (!destination) {
    return null;
  }
  const withoutSuffix = destination.split(/[?#]/, 1)[0];
  if (!withoutSuffix || withoutSuffix.startsWith('//')
    || /^[a-z][a-z0-9+.-]*:/i.test(withoutSuffix)) {
    return null;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    return null;
  }
  const unescaped = decoded.replace(/\\([\\`*_[\]{}()#+\-.!<>])/g, '$1');
  return repoPath(root, resolve(root, 'docs', unescaped));
}

function indexTargets(root, markdown) {
  const targets = new Set();
  const withoutFences = stripMarkdownFences(markdown);
  const definitions = new Map();
  const bodyLines = withoutFences.split('\n');
  for (const [index, line] of bodyLines.entries()) {
    const definition = /^ {0,3}\[([^\]]+)\]:\s*(.+)$/.exec(line);
    if (!definition) {
      continue;
    }
    const destination = markdownDestination(definition[2]);
    if (destination !== null) {
      definitions.set(normalizeReferenceLabel(definition[1]), destination);
    }
    bodyLines[index] = '';
  }
  const body = bodyLines.join('\n');

  for (let index = 0; index < body.length; index += 1) {
    if (body[index] !== '[' || body[index - 1] === '!') {
      continue;
    }
    const labelEnd = findClosingBracket(body, index);
    if (labelEnd < 0) {
      continue;
    }
    let destinationStart = labelEnd + 1;
    while (/\s/.test(body[destinationStart] ?? '')) {
      destinationStart += 1;
    }
    if (body[destinationStart] !== '(') {
      index = labelEnd;
      continue;
    }
    const destinationEnd = findClosingParenthesis(body, destinationStart);
    if (destinationEnd < 0) {
      index = labelEnd;
      continue;
    }
    const destination = markdownDestination(body.slice(destinationStart + 1, destinationEnd));
    const target = normalizedIndexTarget(root, destination);
    if (target !== null) {
      targets.add(target);
    }
    index = destinationEnd;
  }

  const referenceUsage = /(?<!!)\[([^\]\n]+)\](?:\[([^\]\n]*)\])?/g;
  for (const match of body.matchAll(referenceUsage)) {
    if (body[match.index + match[0].length] === '(') {
      continue;
    }
    const label = match[2] === undefined || match[2] === '' ? match[1] : match[2];
    const destination = definitions.get(normalizeReferenceLabel(label));
    const target = normalizedIndexTarget(root, destination);
    if (target !== null) {
      targets.add(target);
    }
  }
  return targets;
}

function parseStaticString(expression) {
  const text = expression.trim();
  const quote = text[0];
  if (!['\'', '"', '`'].includes(quote) || text.at(-1) !== quote) {
    return null;
  }

  let value = '';
  for (let index = 1; index < text.length - 1; index += 1) {
    const character = text[index];
    if (quote === '`' && character === '$' && text[index + 1] === '{') {
      return null;
    }
    if (character === '\\') {
      index += 1;
      if (index >= text.length - 1) {
        return null;
      }
      const escaped = text[index];
      value += ({ n: '\n', r: '\r', t: '\t' })[escaped] ?? escaped;
    } else if (character === quote) {
      return null;
    } else {
      value += character;
    }
  }
  return value;
}

function findClosingParenthesis(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '\'' || character === '"' || character === '`') {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function splitArguments(source) {
  const argumentsList = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '\'' || character === '"' || character === '`') {
      quote = character;
    } else if (character === '(' || character === '[' || character === '{') {
      depth += 1;
    } else if (character === ')' || character === ']' || character === '}') {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      argumentsList.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  argumentsList.push(source.slice(start).trim());
  return argumentsList;
}

function staticPathValues(expression, root, filePath, pathCallees) {
  const text = expression.trim();
  const literal = parseStaticString(text);
  if (literal !== null) {
    return [literal];
  }
  if (text === 'process.cwd()') {
    return [root];
  }
  if (text === '__dirname' || text === 'import.meta.dirname') {
    return [dirname(filePath)];
  }

  const call = /^((?:[A-Za-z_$][\w$]*\.)*(join|resolve))\s*\(/.exec(text);
  if (!call || !pathCallees.has(call[1])) {
    return [];
  }
  const openIndex = text.indexOf('(', call.index);
  const closeIndex = findClosingParenthesis(text, openIndex);
  if (closeIndex !== text.length - 1) {
    return [];
  }

  const argumentsList = splitArguments(text.slice(openIndex + 1, closeIndex));
  const valueSets = argumentsList.map(
    (argument) => staticPathValues(argument, root, filePath, pathCallees),
  );
  if (valueSets.some((values) => values.length === 0)) {
    return [];
  }

  let combinations = [[]];
  for (const values of valueSets) {
    combinations = combinations.flatMap((combination) => (
      values.map((value) => [...combination, value])
    ));
  }
  return combinations.map((parts) => (
    call[2] === 'resolve' ? resolve(root, ...parts) : join(...parts)
  ));
}

function namedBindingPairs(bindings) {
  const pairs = [];
  for (const binding of bindings.split(',')) {
    const match = /^\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(binding);
    if (match) {
      pairs.push({ imported: match[1], local: match[2] ?? match[1] });
    }
  }
  return pairs;
}

function addNamedBindings(target, bindings, allowedNames) {
  for (const { imported, local } of namedBindingPairs(bindings)) {
    if (allowedNames.has(imported)) {
      target.add(local);
    }
  }
}

function importedFileApiCallees(source) {
  const pathNames = new Set(['join', 'resolve']);
  const fileNames = new Set(['readFile', 'readFileSync']);
  const pathCallees = new Set();
  const fileCallees = new Set();
  const pathModules = new Set(['node:path', 'path']);
  const syncFileModules = new Set(['node:fs', 'fs']);
  const promiseFileModules = new Set(['node:fs/promises', 'fs/promises']);

  function addFileBindings(bindings, moduleName) {
    const allowedNames = syncFileModules.has(moduleName)
      ? fileNames
      : promiseFileModules.has(moduleName) ? new Set(['readFile']) : null;
    if (!allowedNames) return;
    addNamedBindings(fileCallees, bindings, allowedNames);
    if (syncFileModules.has(moduleName)) {
      for (const { imported, local } of namedBindingPairs(bindings)) {
        if (imported === 'promises') fileCallees.add(`${local}.readFile`);
      }
    }
  }

  function addFileObject(localName, moduleName) {
    if (syncFileModules.has(moduleName)) {
      for (const name of fileNames) fileCallees.add(`${localName}.${name}`);
      fileCallees.add(`${localName}.promises.readFile`);
    } else if (promiseFileModules.has(moduleName)) {
      fileCallees.add(`${localName}.readFile`);
    }
  }

  const namedImport = /\bimport\s*{([^}]*)}\s*from\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(namedImport)) {
    if (pathModules.has(match[2])) {
      addNamedBindings(pathCallees, match[1], pathNames);
    } else {
      addFileBindings(match[1], match[2]);
    }
  }

  const objectImport = /\bimport\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(objectImport)) {
    const [localName, moduleName] = [match[1], match[2]];
    if (pathModules.has(moduleName)) {
      for (const name of pathNames) pathCallees.add(`${localName}.${name}`);
    } else {
      addFileObject(localName, moduleName);
    }
  }

  const namedRequire = /\b(?:const|let|var)\s*{([^}]*)}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(namedRequire)) {
    const normalizedBindings = match[1].replace(/:/g, ' as ');
    if (pathModules.has(match[2])) {
      addNamedBindings(pathCallees, normalizedBindings, pathNames);
    } else {
      addFileBindings(normalizedBindings, match[2]);
    }
  }

  const objectRequire = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(objectRequire)) {
    const [localName, moduleName] = [match[1], match[2]];
    if (pathModules.has(moduleName)) {
      for (const name of pathNames) pathCallees.add(`${localName}.${name}`);
    } else {
      addFileObject(localName, moduleName);
    }
  }

  return { fileCallees, pathCallees };
}

function reachesPrivateMemory(root, filePath, values, includeProjectRoot) {
  const memoryRoot = resolve(root, 'memory');
  for (const value of values) {
    const candidates = isAbsolute(value)
      ? [resolve(value)]
      : [resolve(dirname(filePath), value)];
    if (includeProjectRoot) {
      candidates.push(resolve(root, value));
    }
    if (candidates.some((candidate) => isInside(memoryRoot, candidate))) {
      return true;
    }
  }
  return false;
}

function codePositionMask(source) {
  const mask = new Uint8Array(source.length);
  let state = 'code';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'line-comment') {
      if (character === '\n') {
        state = 'code';
        mask[index] = 1;
      }
      continue;
    }
    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        state = 'code';
        index += 1;
      }
      continue;
    }
    if (state !== 'code') {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if ((state === 'single' && character === '\'')
        || (state === 'double' && character === '"')
        || (state === 'template' && character === '`')) {
        state = 'code';
      }
      continue;
    }

    if (character === '/' && next === '/') {
      state = 'line-comment';
      index += 1;
    } else if (character === '/' && next === '*') {
      state = 'block-comment';
      index += 1;
    } else if (character === '\'') {
      state = 'single';
    } else if (character === '"') {
      state = 'double';
    } else if (character === '`') {
      state = 'template';
    } else {
      mask[index] = 1;
    }
  }
  return mask;
}

function referencesPrivateMemory(root, filePath, source) {
  const scannableSource = extname(filePath) === '.mdx'
    ? stripMarkdownFences(source)
    : source;
  const codePositions = codePositionMask(scannableSource);
  const { fileCallees, pathCallees } = importedFileApiCallees(scannableSource);
  const staticModuleReference = /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/gm;
  const sideEffectImport = /^[ \t]*import\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/gm;
  for (const pattern of [staticModuleReference, sideEffectImport]) {
    for (const match of scannableSource.matchAll(pattern)) {
      if (!codePositions[match.index]) {
        continue;
      }
      const value = parseStaticString(match[1]);
      if (value !== null && (value.startsWith('.') || isAbsolute(value))
        && reachesPrivateMemory(root, filePath, [value], false)) {
        return true;
      }
    }
  }

  const callPattern = /\b((?:[A-Za-z_$][\w$]*\.)*(import|require|readFile|readFileSync|resolve|join))\s*\(/g;
  for (const match of scannableSource.matchAll(callPattern)) {
    if (!codePositions[match.index]) {
      continue;
    }
    const openIndex = scannableSource.indexOf('(', match.index);
    const closeIndex = findClosingParenthesis(scannableSource, openIndex);
    if (closeIndex < 0) {
      continue;
    }
    const argumentsList = splitArguments(scannableSource.slice(openIndex + 1, closeIndex));
    const [callee, name] = [match[1], match[2]];
    if ((name === 'resolve' || name === 'join') && !pathCallees.has(callee)) {
      continue;
    }
    if ((name === 'readFile' || name === 'readFileSync') && !fileCallees.has(callee)) {
      continue;
    }
    if (name === 'require' && callee !== 'require') {
      continue;
    }
    const expression = name === 'resolve' || name === 'join'
      ? scannableSource.slice(match.index, closeIndex + 1)
      : argumentsList[0] ?? '';
    const values = staticPathValues(expression, root, filePath, pathCallees);
    const moduleReference = name === 'import' || name === 'require';
    if (moduleReference && values.some((value) => !value.startsWith('.') && !isAbsolute(value))) {
      continue;
    }
    if (reachesPrivateMemory(root, filePath, values, !moduleReference)) {
      return true;
    }
  }
  return false;
}

async function checkGuidance(root, errors) {
  for (const path of requiredGuidance) {
    if (!await exists(join(root, path))) {
      errors.push(`${path}: required guidance file is missing`);
    }
  }

  const rootGuidance = await readText(join(root, 'AGENTS.md')) ?? '';
  const requiredLinks = [
    'docs/notes/project/agent-runbook.md',
    'src/AGENTS.md',
    'src/content/AGENTS.md',
    'docs/AGENTS.md',
    'memory/AGENTS.md',
  ];
  for (const link of requiredLinks) {
    if (!rootGuidance.includes(link)) {
      errors.push(`AGENTS.md: missing scoped guidance link "${link}"`);
    }
  }

  const activeGuidance = [
    ...requiredGuidance,
    'docs/notes/project/agent-runbook.md',
    ...await discoverSkillPaths(root),
  ];
  for (const path of activeGuidance) {
    const text = await readText(join(root, path));
    if (text && containsGraphifyCommand(text)) {
      errors.push(`${path}: removed Graphify operating command is not allowed`);
    }
  }
}

async function checkSkills(root, errors) {
  const paths = await discoverSkillPaths(root);
  const discovered = new Set(paths);
  const names = [];
  for (const expectedName of requiredSkills) {
    const path = `.agents/skills/${expectedName}/SKILL.md`;
    if (!discovered.has(path)) {
      errors.push(`${path}: required project skill is missing`);
    }
  }

  for (const path of paths) {
    const directoryName = path.split('/').at(-2);
    if (!skillNamePattern.test(directoryName)) {
      errors.push(`${path}: skill directory name must use lowercase letters, numbers, and hyphens`);
    }

    const text = await readText(join(root, path));
    let parsed;
    try {
      parsed = matter(text, { strict: true });
    } catch {
      errors.push(`${path}: invalid frontmatter`);
      continue;
    }

    const expectedName = requiredSkills.find(
      (name) => path === `.agents/skills/${name}/SKILL.md`,
    );
    if (expectedName && parsed.data.name !== expectedName) {
      errors.push(`${path}: frontmatter name must be "${expectedName}"`);
    } else if (!expectedName && (typeof parsed.data.name !== 'string' || !parsed.data.name.trim())) {
      errors.push(`${path}: frontmatter name is required`);
    } else if (!skillNamePattern.test(parsed.data.name)) {
      errors.push(`${path}: frontmatter name must use lowercase letters, numbers, and hyphens`);
    } else if (parsed.data.name !== directoryName) {
      errors.push(`${path}: frontmatter name must match directory "${directoryName}"`);
    }
    if (typeof parsed.data.description !== 'string' || !parsed.data.description.trim()) {
      errors.push(`${path}: frontmatter description is required`);
    }
    if (typeof parsed.data.name === 'string') {
      names.push(parsed.data.name);
    }
  }

  for (const name of duplicateValues(names)) {
    errors.push(`.agents/skills: duplicate skill name "${name}"`);
  }
}

async function checkDocs(root, errors) {
  const catalogPath = 'docs/_index/catalog.yml';
  const topicsPath = 'docs/_index/topics.yml';
  const indexPath = 'docs/INDEX.md';
  const catalog = validateYamlEntries(
    parseYamlArray(await readText(join(root, catalogPath)), catalogPath, errors),
    requiredCatalogFields,
    catalogPath,
    errors,
  );
  const topics = validateYamlEntries(
    parseYamlArray(await readText(join(root, topicsPath)), topicsPath, errors),
    requiredTopicFields,
    topicsPath,
    errors,
  );
  const indexText = await readText(join(root, indexPath));

  const catalogPaths = catalog
    .map((entry) => entry.path)
    .filter((path) => typeof path === 'string' && path);
  const topicIds = topics
    .map((topic) => topic.id)
    .filter((id) => typeof id === 'string' && id);
  for (const path of duplicateValues(catalogPaths)) {
    errors.push(`${catalogPath}: duplicate path "${path}"`);
  }
  for (const id of duplicateValues(topicIds)) {
    errors.push(`${topicsPath}: duplicate id "${id}"`);
  }

  const knownTopics = new Set(topicIds);
  const indexedPaths = indexText === null ? new Set() : indexTargets(root, indexText);
  if (indexText === null) {
    errors.push(`${indexPath}: file is required`);
  }

  const uniqueCatalogPaths = new Set(catalogPaths);
  const notesRoot = resolve(root, 'docs/notes');
  const realNotesRoot = await realPath(notesRoot);
  for (const entry of catalog) {
    if (typeof entry.path !== 'string' || !entry.path) {
      continue;
    }
    const fullPath = resolve(root, entry.path);
    const lexicallyContained = isInside(notesRoot, fullPath);
    if (!lexicallyContained) {
      errors.push(`${catalogPath}: path must stay under docs/notes/ "${entry.path}"`);
    }
    const pathExists = await exists(fullPath);
    if (!pathExists) {
      errors.push(`${catalogPath}: path does not exist "${entry.path}"`);
    } else if (lexicallyContained && realNotesRoot !== null) {
      const realTarget = await realPath(fullPath);
      if (realTarget !== null && !isInside(realNotesRoot, realTarget)) {
        errors.push(`${catalogPath}: path resolves outside docs/notes/ "${entry.path}"`);
      }
    }
    if (typeof entry.topic === 'string' && entry.topic && !knownTopics.has(entry.topic)) {
      errors.push(`${catalogPath}: unknown topic "${entry.topic}"`);
    }
    if (!indexedPaths.has(entry.path)) {
      errors.push(`${indexPath}: missing catalog path "${entry.path}"`);
    }
  }

  for (const topic of topics) {
    if (typeof topic.folder !== 'string' || !topic.folder) {
      continue;
    }
    const fullFolder = resolve(root, topic.folder);
    const lexicallyContained = isInside(notesRoot, fullFolder);
    if (!lexicallyContained) {
      errors.push(`${topicsPath}: folder must stay under docs/notes/ "${topic.folder}"`);
    }
    const folderExists = await exists(fullFolder);
    if (!folderExists) {
      errors.push(`${topicsPath}: folder does not exist "${topic.folder}"`);
    } else if (lexicallyContained && realNotesRoot !== null) {
      const realFolder = await realPath(fullFolder);
      if (realFolder !== null && !isInside(realNotesRoot, realFolder)) {
        errors.push(`${topicsPath}: folder resolves outside docs/notes/ "${topic.folder}"`);
      }
    }
  }

  for (const file of await collectFiles(resolve(root, 'docs/notes'), markdownExtensions)) {
    if (file.endsWith('/README.md') || file.endsWith('\\README.md')) {
      continue;
    }
    const path = repoPath(root, file);
    if (!uniqueCatalogPaths.has(path)) {
      errors.push(`${path}: curated note is missing from catalog.yml`);
    }
  }
}

function isForbiddenLocalArtifact(path) {
  const normalized = path.split('\\').join('/');
  if (forbiddenLocalArtifactPrefixes.some((prefix) => (
    normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)
  ))) {
    return true;
  }
  if (normalized.startsWith('docs/raw/') && normalized !== 'docs/raw/README.md') {
    return true;
  }
  if (normalized.startsWith('memory/review/') && (normalized.endsWith('.jsonl') || normalized.endsWith('.md'))) {
    return true;
  }
  if (/^memory\/thoughts\/private-.+\.md$/.test(normalized)) {
    return true;
  }
  if (normalized.startsWith('memory/thoughts/') && normalized.endsWith('.local.md')) {
    return true;
  }
  return false;
}

async function trackedFiles(root) {
  if (!await exists(join(root, '.git'))) {
    return null;
  }

  try {
    const { stdout } = await execFileAsync('git', ['-C', root, 'ls-files', '-z'], {
      maxBuffer: 20 * 1024 * 1024,
    });
    return stdout.split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

async function checkPublicIdentity(root, errors) {
  const files = await trackedFiles(root);
  if (files === null) {
    return;
  }

  for (const path of files) {
    if (isForbiddenLocalArtifact(path)) {
      errors.push(`${path}: tracked gitignored local artifact is not allowed`);
      continue;
    }

    if (binaryExtensions.has(extname(path).toLowerCase())) {
      continue;
    }

    const text = await readText(join(root, path));
    if (text && identityLeakPattern.test(text)) {
      errors.push(`${path}: personal identity leak is not allowed`);
    }
  }
}

async function checkPrivateMemoryBoundary(root, errors) {
  const publicSourceRoots = [
    'apps/site/app',
    'apps/site/src',
    'packages/contracts/src',
    'packages/content/src',
    'src',
  ];
  for (const publicSourceRoot of publicSourceRoots) {
    for (const file of await collectFiles(resolve(root, publicSourceRoot), sourceExtensions)) {
      const source = await readText(file);
      if (source && referencesPrivateMemory(root, file, source)) {
        errors.push(`${repoPath(root, file)}: public source references top-level memory/**`);
      }
    }
  }
}

export async function checkAgentSetup(root = process.cwd()) {
  const resolvedRoot = resolve(root);
  const errors = [];
  await checkGuidance(resolvedRoot, errors);
  await checkSkills(resolvedRoot, errors);
  await checkDocs(resolvedRoot, errors);
  await checkPrivateMemoryBoundary(resolvedRoot, errors);
  await checkPublicIdentity(resolvedRoot, errors);
  return [...new Set(errors)].sort();
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const errors = await checkAgentSetup();
  if (errors.length > 0) {
    console.error('Agent setup check failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Agent setup check passed.');
  }
}
