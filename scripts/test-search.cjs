const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../lib/search.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const searchModule = new Module(sourcePath, module);
searchModule._compile(compiled, sourcePath);
const { createPromptSearchIndex, searchPrompts } = searchModule.exports;
const record = (id, changes = {}) => ({
  id, title: id, category: '', tags: [], description: '', framework: '',
  difficulty: '', intent: '', modality: '', language: '', content: '', ...changes,
});
const search = (query, records, limit) => searchPrompts(query, createPromptSearchIndex(records), limit);

test('empty, whitespace, stop-word-only and unmatched queries are safe', () => {
  const data = [record('one', { title: 'Email reply' })];
  for (const query of ['', '  ', 'the prompt please', 'zxqnonexistent']) assert.deepEqual(search(query, data), []);
});

test('case and surrounding whitespace do not change ranking', () => {
  const data = [record('one', { title: 'Email reply' }), record('two', { title: 'Message template' })];
  assert.deepEqual(search('  EMAIL  ', data), search('email', data));
});

test('direct title matches rank above related-term matches', () => {
  const found = search('email', [record('related', { title: 'Message template' }), record('direct', { title: 'Email reply' })]);
  assert.deepEqual(found.map(({ prompt }) => prompt.id), ['direct', 'related']);
  assert.ok(found[0].score > found[1].score);
});

test('equal scores use title order and requested result limits are honored', () => {
  const data = [record('z', { title: 'Zebra', description: 'needle' }), record('a', { title: 'Alpha', description: 'needle' })];
  assert.deepEqual(search('needle', data).map(({ prompt }) => prompt.id), ['a', 'z']);
  assert.equal(search('needle', data, 1).length, 1);
});

test('an index normalizes each record once and is reusable across queries', () => {
  let contentReads = 0;
  const item = record('one', { title: 'Email reply' });
  Object.defineProperty(item, 'content', { get() { contentReads += 1; return 'Email communication reply'; } });
  const index = createPromptSearchIndex([item]);
  assert.equal(contentReads, 1);
  searchPrompts('email', index);
  searchPrompts('communication', index);
  assert.equal(contentReads, 1);
});

test('script-like prompt text stays unmodified inert data', () => {
  const content = '<script>globalThis.promptTextWasExecuted = true</script> needle needle needle';
  const item = Object.freeze(record('inert', { content }));
  const found = search('needle', [item]);
  assert.equal(found[0].prompt, item);
  assert.equal(found[0].prompt.content, content);
  assert.equal(globalThis.promptTextWasExecuted, undefined);
});

test('the shipped local corpus matches its manifest and returns real email results', () => {
  const root = path.resolve(__dirname, '../public');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/library.json'), 'utf8'));
  const records = manifest.dataFiles.flatMap(({ file }) => {
    assert.match(file, /^\/data\/[a-z0-9-]+\.json$/);
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  });
  assert.equal(records.length, manifest.records);
  const index = createPromptSearchIndex(records);
  const found = searchPrompts('email', index, records.length);
  assert.ok(found.length > 6);
  assert.match(found[0].prompt.title, /email/i);
  assert.equal(searchPrompts('email', index, 6).length, 6);
});
