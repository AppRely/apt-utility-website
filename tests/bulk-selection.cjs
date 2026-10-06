// Dependency-free regression checks for the store's selection transitions.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('src/store/bulkLinkStore.ts', 'utf8');
const implementation = source.slice(source.indexOf('let linkQueue ='))
  .replace('export const useBulkLinkStore = create<BulkLinkState>', 'store = create')
  .replace('new Promise<void>', 'new Promise');
let state;
let deferred;
let ranges = {};
const context = {
  create: initialize => {
    const get = () => state;
    const set = update => { state = Object.assign({}, state, typeof update === 'function' ? update(state) : update); };
    state = initialize(set, get);
    return { getState: get };
  },
  getActiveObjectRange: async (_, id) => {
    if (deferred) await deferred;
    return { object_id: id, start_frame: id * 100, end_frame: id * 100 + 99, ...ranges[id] };
  },
};
vm.runInNewContext(implementation, context);
const ids = () => Array.from(state.objects, object => object.object_id);
(async () => {
  for (const mode of ['delete', 'link']) {
    state.start(1, mode);
    state.armCapture();
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
    state.armCapture();
    await state.select(1, 11, 101, 'rectangle');
    assert.deepStrictEqual(ids(), [11]);
  }
  for (const mode of ['delete', 'link']) {
  state.start(1, mode);
  state.armCapture();
  state.finishCapture(30); // Drawing-induced pause must not finish capture.
  assert.strictEqual(state.capturePhase, 'armed');
  ranges = { 4: { start_frame: 1, end_frame: 100 }, 5: { start_frame: 30, end_frame: 60 },
    6: { start_frame: 29, end_frame: 40 }, 7: { start_frame: 40, end_frame: 61 } };
  await state.select(1, 4, 30, 'rectangle');
  state.beginCapture(30);
  for (const id of [5, 6, 7]) await state.select(1, id, 40, 'rectangle');
  state.finishCapture(60);
  assert.strictEqual(state.capturePhase, 'ready');
  assert.deepStrictEqual(ids(), mode === 'link' ? [] : [5]); // Earlier overlapping candidates were skipped in Link.
  state.beginCapture(70); // Ordinary playback cannot alter the finished range.
  assert.strictEqual(state.captureStart, 30);
  state.armCapture();
  state.beginCapture(30);
  let resolve;
  deferred = new Promise(done => { resolve = done; });
  const outside = state.select(1, 4, 40, 'rectangle');
  const inside = state.select(1, 5, 40, 'rectangle');
  state.finishCapture(60);
  resolve();
  await Promise.all([outside, inside]);
  deferred = null;
  assert.deepStrictEqual(ids(), [5]);
  state.armCapture();
  deferred = new Promise(done => { resolve = done; });
  const stale = state.select(1, 4, 40, 'rectangle');
  state.armCapture();
  resolve();
  await stale;
  deferred = null;
  assert.deepStrictEqual(ids(), []);
  }
  ranges = { 1: { start_frame: 0, end_frame: 50 }, 2: { start_frame: 51, end_frame: 100 },
    3: { start_frame: 100, end_frame: 150 }, 5: { start_frame: 31, end_frame: 50 } };
  for (const mode of ['link', 'delete']) {
    state.start(1, mode);
    state.armCapture();
    state.beginCapture(0);
    await Promise.all([1, 5, 2, 3].map(id => state.select(1, id, 40, 'rectangle')));
    assert.deepStrictEqual(ids(), mode === 'link' ? [1, 2] : [1, 5, 2, 3]);
    if (mode === 'link') {
      await state.select(1, 5, 40, 'rectangle');
      assert.deepStrictEqual(ids(), [1, 2]);
      state.remove(1);
      await state.select(1, 5, 40); // Explicit retry once the conflict is removed.
      assert.deepStrictEqual(ids(), [5, 2]);
    }
    state.finishCapture(150);
    assert.strictEqual(state.pending.length, 0);
  }
  ranges = { 23: { start_frame: 1, end_frame: 10 }, 24: { start_frame: 11, end_frame: 20 } };
  for (const mode of ['link', 'delete']) {
    for (const delayed of [false, true]) {
      state.start(1, mode);
      state.armCapture();
      state.beginCapture(5);
      let resolve;
      if (delayed) deferred = new Promise(done => { resolve = done; });
      const selections = [state.select(1, 23, 5, 'rectangle'), state.select(1, 24, 11, 'rectangle')];
      if (!delayed) await Promise.all(selections);
      state.finishCapture(15); // Neither action may include trajectories extending past either boundary.
      if (delayed) resolve();
      await Promise.all(selections);
      deferred = null;
      assert.deepStrictEqual(ids(), []);
      assert.deepStrictEqual(Array.from(state.selectionOrder), []);
      assert.strictEqual(state.pending.length, 0);
    }
  }
  // Inclusive boundaries also apply when the range is captured backwards.
  for (const mode of ['link', 'delete']) {
    for (const delayed of [false, true]) {
      state.start(1, mode);
      state.beginCapture(20);
      let resolve;
      if (delayed) deferred = new Promise(done => { resolve = done; });
      const selections = [state.select(1, 23, 10), state.select(1, 24, 20)];
      if (!delayed) await Promise.all(selections);
      state.finishCapture(1);
      if (delayed) resolve();
      await Promise.all(selections);
      deferred = null;
      assert.deepStrictEqual(ids(), [23, 24]);
      assert.strictEqual(state.captureStart, 1);
      assert.strictEqual(state.captureEnd, 20);
    }
  }
  for (const mode of ['link', 'delete']) {
    state.start(1, mode);
    state.captureBoundary(5);
    assert.strictEqual(state.capturePhase, 'idle'); // Ctrl+C cannot start capture.
    await state.select(1, 23, 5); // Number-key/click selection works before drawing.
    assert.deepStrictEqual(ids(), [23]);
    assert.strictEqual(state.capturePhase, 'capturing');
    assert.strictEqual(state.captureStart, 5);
    state.captureBoundary(20);
    assert.strictEqual(state.capturePhase, 'ready');
    assert.deepStrictEqual(ids(), []);
    state.captureBoundary(30);
    assert.strictEqual(state.capturePhase, 'ready'); // Ctrl+C must not restart.
    assert.strictEqual(state.captureEnd, 20);
    state.armCapture();
    state.beginCapture(30); // The rectangle starts capture directly.
    assert.strictEqual(state.captureStart, 30);
    state.busy = true;
    state.captureBoundary(40);
    assert.strictEqual(state.capturePhase, 'capturing');
    state.busy = false;
    state.captureBoundary(40);
    assert.strictEqual(state.captureEnd, 40);
  }
  console.log('Bulk selection regression checks passed (delete and link).');
})().catch(error => { console.error(error); process.exitCode = 1; });
