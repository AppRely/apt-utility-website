const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const implementation = ts.transpile(fs.readFileSync('src/store/bulkLinkStore.ts', 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export const useBulkLinkStore = create<BulkLinkState>', 'store = create')
  .replace(/useBulkLinkStore/g, 'store'), { target: ts.ScriptTarget.ES2020 });
let state;
let deferred = null;
let rangeCalls = 0;
const ranges = {
  1: { start_frame: 0, end_frame: 60 }, // Reference parent starts before interval.
  2: { start_frame: 10, end_frame: 20 },
  3: { start_frame: 21, end_frame: 30 },
  4: { start_frame: 15, end_frame: 25 }, // Overlaps 2.
  5: { start_frame: 31, end_frame: 40 }, // Leaves the rectangle.
};
vm.runInNewContext(implementation, {
  create: initialize => {
    const get = () => state;
    const set = update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
    state = initialize(set, get);
    return { getState: get, setState: set };
  },
  getActiveObjectRange: async (_, id) => {
    rangeCalls++;
    if (deferred) await deferred;
    return { object_id: id, ...ranges[id] };
  },
  isBulkTrajectoryInside: async (_, object) => object.object_id !== 5,
});
const ids = () => Array.from(state.objects, object => object.object_id);
const rectangle = { left: 0, right: 100, top: 0, bottom: 100 };
(async () => {
  state.start(1);
  state.armCapture(rectangle);
  state.beginCapture(10);
  await state.select(1, 1, 10, 'rectangle');
  await state.select(1, 1, 10); // Already cached parent still gets its reference.
  assert.strictEqual(state.parent.object_id, 1);
  assert.deepStrictEqual(ids(), []);
  await state.select(1, 2, 10, 'rectangle');
  state.updateCaptureFrame(19);
  assert.deepStrictEqual(ids(), []); // Full end frame must lie within live interval.
  state.updateCaptureFrame(20);
  assert.deepStrictEqual(ids(), [2]); // No second click and no Ctrl+C required.
  await state.select(1, 3, 21, 'rectangle');
  state.updateCaptureFrame(29);
  assert.deepStrictEqual(ids(), [2]);
  state.updateCaptureFrame(30);
  assert.deepStrictEqual(ids(), [2, 3]); // Candidate remains available after disappearing.
  await state.select(1, 4, 22, 'rectangle');
  assert.deepStrictEqual(ids(), [2, 3]);
  assert(state.overlapping.includes(4));
  await state.select(1, 5, 31, 'rectangle');
  const calls = rangeCalls;
  await state.select(1, 5, 32, 'rectangle');
  assert.strictEqual(rangeCalls, calls); // Rejected IDs cannot cause a fetch/render loop.
  state.updateCaptureFrame(40);
  assert.deepStrictEqual(ids(), [2, 3]);
  state.updateCaptureFrame(19);
  assert.deepStrictEqual(ids(), []); // Seek immediately removes partial trajectories.
  state.updateCaptureFrame(30);
  assert.deepStrictEqual(ids(), [2, 3]);
  state.remove(2);
  assert.deepStrictEqual(ids(), [4]); // Another eligible candidate can now enter.
  await state.select(1, 2, 30, 'rectangle');
  assert.deepStrictEqual(ids(), [4]);
  await state.select(1, 2, 30);
  assert.deepStrictEqual(ids(), [2, 3]); // Explicit click can restore removed entry.
  state.finishCapture(30);
  state.updateCaptureFrame(60);
  assert.deepStrictEqual(ids(), [2, 3]);
  assert(!ids().includes(state.parentId));
  state.armCapture(rectangle);
  state.beginCapture(10);
  let release;
  deferred = new Promise(resolve => { release = resolve; });
  const late = state.select(1, 3, 21, 'rectangle');
  state.updateCaptureFrame(25);
  release();
  await late;
  deferred = null;
  assert.deepStrictEqual(ids(), []); // Async response uses latest interval.
  state.updateCaptureFrame(30);
  assert.deepStrictEqual(ids(), [3]);
  state.armCapture(rectangle);
  state.beginCapture(40);
  await state.select(1, 2, 20, 'rectangle');
  state.updateCaptureFrame(10);
  assert.deepStrictEqual(ids(), [2]); // Reverse interval is inclusive.
  state.reset();
  assert.strictEqual(state.parent, null);
  assert.strictEqual(state.rectangle, null);
  assert.strictEqual(state.candidates.length, 0);
  console.log('Bulk Link checks passed: live full containment, separate parent, cached promotion, shrink/reverse, overlap, removal, rejection, and delayed responses.');
})().catch(error => { console.error(error); process.exitCode = 1; });
