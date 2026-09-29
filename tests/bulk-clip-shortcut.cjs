const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const storeSource = fs.readFileSync('src/store/bulkLinkStore.ts', 'utf8');
const implementation = storeSource.slice(storeSource.indexOf('let linkQueue ='))
  .replace('export const useBulkLinkStore = create<BulkLinkState>', 'store = create')
  .replace('new Promise<void>', 'new Promise');
let state;
const context = {
  create: initialize => {
    const get = () => state;
    const set = update => { state = Object.assign({}, state, typeof update === 'function' ? update(state) : update); };
    state = initialize(set, get);
    return { getState: get };
  },
  projectId: 1,
  video: { currentTime: 0 },
  pendingFrameRef: { current: null },
  stableFpsRef: { current: 10 },
  document: { activeElement: null, querySelector: () => null },
  // Deliberately stale storage, as during uninterrupted playback.
  sessionStorage: { getItem: key => key === 'frameId' ? '5' : null },
  safeToast: () => {},
};
vm.runInNewContext(implementation, context);
context.useBulkLinkStore = context.store;
const component = fs.readFileSync('src/components/dashboard/DynamicVideo.tsx', 'utf8');
const start = component.indexOf('    const handleBulkClipShortcut =');
const end = component.indexOf("    window.addEventListener('keydown', handleBulkClipShortcut)", start);
const handler = component.slice(start, end)
  .replace('const handleBulkClipShortcut = (event: KeyboardEvent)', 'handle = (event)')
  .replace(' as HTMLElement | null', '')
  .replace("target?.closest(", "target && target.closest(")
  .replace('pendingFrameRef.current ?? Math.round(video.currentTime * stableFpsRef.current)',
    '(pendingFrameRef.current !== null ? pendingFrameRef.current : Math.round(video.currentTime * stableFpsRef.current))');
vm.runInNewContext(handler, context);
function press(extra = {}) {
  const event = Object.assign({ key: 'c', ctrlKey: true, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; } }, extra);
  context.handle(event);
  return event;
}
for (const mode of ['link', 'delete']) {
  state.start(1, mode);
  state.armCapture();
  context.video.currentTime = 0.5;
  state.beginCapture(5);
  const first = { key: "c", ctrlKey: true, defaultPrevented: true };
  assert.strictEqual(state.captureStart, 5);
  assert.strictEqual(state.capturePhase, 'capturing');
  press({ repeat: true });
  assert.strictEqual(state.capturePhase, 'capturing');
  context.video.currentTime = 2;
  press();
  assert.strictEqual(state.capturePhase, 'ready');
  assert.strictEqual(state.captureEnd, 20); // Uses live frame, not stored frame 5.
  context.video.currentTime = 3;
  assert.strictEqual(state.captureEnd, 20); // Playback cannot extend the range.
  context.handle(first); // An already-handled event cannot restart capture.
  assert.strictEqual(state.capturePhase, 'ready');
  press();
  assert.strictEqual(state.capturePhase, 'ready');
  assert.strictEqual(state.captureEnd, 20);
  state.armCapture();
  state.beginCapture(30);
  assert.strictEqual(state.captureStart, 30);
  assert.strictEqual(state.capturePhase, 'capturing');
  context.document.activeElement = { closest: () => true };
  press();
  assert.strictEqual(state.capturePhase, 'capturing');
  context.document.activeElement = null;
  state.busy = true;
  press();
  assert.strictEqual(state.capturePhase, 'capturing');
  state.busy = false;
}
console.log('Bulk Ctrl+C checks passed: automatic start, live end, frozen end, repeat/focus/busy guards, both modes.');
