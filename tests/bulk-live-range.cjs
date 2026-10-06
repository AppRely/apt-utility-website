const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('src/store/bulkLinkStore.ts', 'utf8');
const implementation = source.slice(source.indexOf('let linkQueue ='))
  .replace('export const useBulkLinkStore = create<BulkLinkState>', 'store = create')
  .replace('new Promise<void>', 'new Promise');
let state;
let deferred;
const ranges = { 4: { start_frame: 0, end_frame: 10 }, 12: { start_frame: 11, end_frame: 20 } };
vm.runInNewContext(implementation, {
  create: initialize => {
    const get = () => state;
    const set = update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
    state = initialize(set, get);
    return { getState: get };
  },
  getActiveObjectRange: async (_, id) => {
    if (deferred) await deferred;
    return { object_id: id, ...ranges[id] };
  },
});
const ids = () => Array.from(state.objects, object => object.object_id);
(async () => {
  for (const mode of ['link', 'delete']) {
    for (const source of ['manual', 'rectangle']) {
      state.start(1, mode);
      state.beginCapture(0);
      state.updateCaptureFrame(0);
      await state.select(1, 4, 0, source);
      assert.deepStrictEqual(ids(), [4]);
      state.updateCaptureFrame(14);
      await state.select(1, 12, 14, source);
      assert.deepStrictEqual(ids(), [4, 12]); // ID 12 need not finish first.
      state.updateCaptureFrame(16);
      assert.deepStrictEqual(ids(), [4, 12]);
      state.updateCaptureFrame(11);
      assert.deepStrictEqual(ids(), [4, 12]); // Inclusive overlap at frame 11.
      state.updateCaptureFrame(10);
      assert.deepStrictEqual(ids(), [4]);
      assert.deepStrictEqual(Array.from(state.selectionOrder), [4]);
      assert.deepStrictEqual(Array.from(state.excluded), []);
      state.updateCaptureFrame(14);
      await state.select(1, 12, 14, source);
      assert.deepStrictEqual(ids(), [4, 12]);
      state.remove(12);
      // Allow explicit retry, then shrink while its range is loading.
      let release;
      deferred = new Promise(resolve => { release = resolve; });
      const late = state.select(1, 12, 14, 'manual');
      state.updateCaptureFrame(10);
      release();
      await late;
      deferred = null;
      assert.deepStrictEqual(ids(), [4]);
      assert.strictEqual(state.pending.length, 0);
      assert(!state.selectionOrder.includes(12));
      state.finishCapture(10);
      state.updateCaptureFrame(0);
      assert.deepStrictEqual(ids(), [4]); // Frozen range is unchanged.
    }
    state.start(1, mode);
    state.beginCapture(20);
    state.updateCaptureFrame(0);
    await state.select(1, 4, 0);
    await state.select(1, 12, 14);
    state.updateCaptureFrame(11);
    assert.deepStrictEqual(ids(), [12]); // Reverse interval shrinks too.
    state.reset();
    assert.strictEqual(state.captureFrame, null);
  }
  console.log('Bulk live range checks passed: IDs 4 and 12 at frames 14/16/11/10, both modes, reverse capture, and delayed responses.');
})().catch(error => { console.error(error); process.exitCode = 1; });
