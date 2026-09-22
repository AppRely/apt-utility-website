// Dependency-free regression checks for the store's selection transitions.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('src/store/bulkLinkStore.ts', 'utf8');
const implementation = source.slice(source.indexOf('export const useBulkLinkStore'))
  .replace('export const useBulkLinkStore = create<BulkLinkState>', 'store = create');
let state;
let deferred;
const context = {
  create: initialize => {
    const get = () => state;
    const set = update => { state = Object.assign({}, state, typeof update === 'function' ? update(state) : update); };
    state = initialize(set, get);
    return { getState: get };
  },
  getActiveObjectRange: async (_, id) => {
    if (deferred) await deferred;
    return { object_id: id, start_frame: 1, end_frame: 100 };
  },
};
vm.runInNewContext(implementation, context);
const ids = () => Array.from(state.objects, object => object.object_id);
(async () => {
  for (const mode of ['delete', 'link']) {
    state.start(1, mode);
    await state.select(1, 6, 1);
    for (const id of [7, 8, 9]) await state.select(1, id, 1, 'rectangle');
    state.remove(6);
    // Repeated rectangle evaluation on paused and subsequent frames must skip 6.
    for (const frame of [1, 1, 2, 100]) await state.select(1, 6, frame, 'rectangle');
    assert.deepStrictEqual(ids(), [7, 8, 9]);
    state.remove(9);
    await state.select(1, 9, 100, 'rectangle');
    assert.deepStrictEqual(ids(), [7, 8]);
    assert.strictEqual(state.selectionOrder[state.selectionOrder.length - 1], 8);
    await state.select(1, 10, 101, 'rectangle');
    assert.deepStrictEqual(ids(), [7, 8, 10]);
    await state.select(1, 6, 101);
    assert.deepStrictEqual(ids(), [6, 7, 8, 10]);
    let resolve;
    deferred = new Promise(done => { resolve = done; });
    const pending = state.select(1, 11, 101, 'rectangle');
    state.remove(11);
    resolve();
    await pending;
    deferred = null;
    assert(!ids().includes(11));
    assert(!state.selectionOrder.includes(11));
    assert.strictEqual(state.pending.length, 0);
    state.reset();
    assert.strictEqual(state.excluded.length, 0);
    state.start(1, mode);
    await state.select(1, 11, 101, 'rectangle');
    assert.deepStrictEqual(ids(), [11]);
  }
  console.log('Bulk selection regression checks passed (delete and link).');
})().catch(error => { console.error(error); process.exitCode = 1; });
