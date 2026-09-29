const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
// Run the API body with mocked transport; no server or TS install required.
let source = fs.readFileSync('src/lib/api/getTimelineData.ts', 'utf8');
source = 'getTimelineData = async (projectId, start, end, objectIds, signal) => {' +
  source.slice(source.indexOf('  let url ='));
source = source.replace('let idsParam: string', 'let idsParam')
  .replace('const merged: Record<string, Record<string, unknown>>', 'const merged')
  .replace('catch (err: any)', 'catch (err)')
  .replace('objectIds ?? ""', '(objectIds == null ? "" : objectIds)')
  .replace(/signal\?\.aborted/g, '(signal && signal.aborted)')
  .replace('result?.f ?? {}', '(result && result.f || {})')
  .replace('err?.name', '(err && err.name)');
let calls = [];
let handler;
const context = { API_BASE: 'https://test.invalid', Uint8Array,
  console: { log() {}, error() {} },
  pako: { inflate: bytes => Buffer.from(bytes).toString() },
  fetch: async (url, options) => {
    const ids = new URL(url).searchParams.get('object_ids');
    calls.push(ids);
    return handler(ids, options);
  },
};
vm.runInNewContext(source, context);
const response = (status, f = {}) => ({ ok: status === 200, status, statusText: 'test',
  arrayBuffer: async () => Uint8Array.from(Buffer.from(JSON.stringify({ f }))).buffer });
const plain = value => JSON.parse(JSON.stringify(value));
(async () => {
  handler = ids => ids === '1,2,3' || ids === '1' ? response(400) :
    response(200, { 100: { [ids]: [10, 20] } });
  const mixed = await context.getTimelineData(1, 90, 110, '1,2,3');
  assert.deepStrictEqual(plain(mixed), { f: { 100: { 2: [10, 20], 3: [10, 20] } } });
  assert.deepStrictEqual(calls, ['1,2,3', '1', '2', '3']);
  calls = [];
  handler = () => response(200, { 100: { 2: [1, 2] } });
  assert.deepStrictEqual(plain(await context.getTimelineData(1, 90, 110, '2,3')), { f: { 100: { 2: [1, 2] } } });
  assert.strictEqual(calls.length, 1); // Successful batched requests stay batched.
  handler = () => response(400);
  assert.deepStrictEqual(plain(await context.getTimelineData(1, 90, 110, [1, 2])), { f: {} });
  calls = [];
  const signal = { aborted: false };
  handler = () => { signal.aborted = true; return response(400); };
  assert.strictEqual(await context.getTimelineData(1, 90, 110, '1,2', signal), null);
  assert.strictEqual(calls.length, 1);
  handler = () => response(500);
  await assert.rejects(context.getTimelineData(1, 90, 110, '1,2'), /Failed to fetch timeline/);
  console.log('Timeline regression checks passed: mixed IDs, merge, success, empty window, cancellation, errors.');
})().catch(error => { console.error(error); process.exitCode = 1; });
