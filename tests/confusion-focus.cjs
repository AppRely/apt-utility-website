const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpile(fs.readFileSync('src/lib/animalFocus.ts', 'utf8'), {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
}), context);
const { getAnimalFocus } = context.exports;
const view = { width: 800, height: 600, scale: 0.5, offsetX: 100, offsetY: 50, bboxScale: 1 };
const points = [[100, 200], [300, 400]];
const focus = getAnimalFocus(points, view);
assert(focus.zoom > 1 && focus.zoom <= 10);
assert.strictEqual(focus.x + (100 + 200 * 0.5) * focus.zoom, 400);
assert.strictEqual(focus.y + (50 + 300 * 0.5) * focus.zoom, 300);
const enlarged = getAnimalFocus(points, { ...view, bboxScale: 2 });
assert(enlarged.zoom < focus.zoom);
assert.strictEqual(getAnimalFocus([[10, 10]], view).zoom, 10);
assert.strictEqual(getAnimalFocus([], view), null);
assert.strictEqual(getAnimalFocus([[NaN, 0]], view), null);
assert.strictEqual(getAnimalFocus(points, { ...view, width: 0 }), null);

const source = fs.readFileSync('src/components/dashboard/DynamicVideo.tsx', 'utf8').replace(/\r\n/g, '\n');
const handlerStart = source.indexOf('    const handleMessage =');
const handlerEnd = source.indexOf('    window.addEventListener("message", handleMessage)', handlerStart);
const jumps = [];
const selections = [];
const requests = [];
const messages = {
  window: { location: { origin: 'https://local.example' } }, projectId: 7,
  handleFrameJump: frame => jumps.push(frame),
  setSelectedObjects: selection => selections.push(selection),
  setPendingAnimalFocus: request => requests.push(request),
};
vm.runInNewContext(ts.transpile(source.slice(handlerStart, handlerEnd).replace('const handleMessage =', 'handleMessage ='), {
  target: ts.ScriptTarget.ES2020,
}), messages);
function send(data, origin = 'https://local.example') { messages.handleMessage({ data, origin }); }
send({ type: 'CONFUSION_JUMP', projectId: 7, frame: 25, objectId: 11 });
assert.deepStrictEqual(jumps, [25]);
assert.strictEqual(selections[0][0].object_id, 11);
assert.strictEqual(requests[0].frame, 25);
assert.strictEqual(requests[0].objectId, 11);
send({ type: 'CONFUSION_JUMP', projectId: 8, frame: 30, objectId: 12 });
send({ type: 'CONFUSION_JUMP', projectId: 7, frame: -1, objectId: 12 });
send({ type: 'CONFUSION_JUMP', projectId: 7, frame: 30, objectId: 12 }, 'https://other.example');
assert.deepStrictEqual(jumps, [25]);
send({ type: 'UNIQUE_SELECT', frame: 40 });
assert.deepStrictEqual(jumps, [25, 40]);

// Run the actual focus effect with annotations arriving after the frame jump.
const effectStart = source.indexOf('  useLayoutEffect(() => {\n    if (!pendingAnimalFocus');
const effectEnd = source.indexOf('  }, [pendingAnimalFocus', effectStart);
const focuses = [];
let cleared = 0;
const effect = {
  useLayoutEffect: callback => { effect.run = callback; },
  pendingAnimalFocus: { projectId: 7, frame: 25, objectId: 11 }, projectId: 7,
  currentFrame: 25, annotationsReady: false, annotationMap: new Map(),
  stageWidth: 800, stageHeight: 600, scale: 0.5, offsetX: 100, offsetY: 50, bboxScale: 1,
  getAnimalFocus, focusedAnimalFrameRef: { current: null },
  setStageScale: scale => focuses.push(scale), setCurrentZoom: () => {}, setStagePos: () => {},
  setPendingAnimalFocus: request => { if (request === null) cleared++; }, showZoomIndicator: () => {},
};
vm.runInNewContext(source.slice(effectStart, effectEnd) + '  });', effect);
effect.run();
assert.strictEqual(focuses.length, 0);
effect.annotationsReady = true;
effect.annotationMap.set('11-25', { coordinates: points });
effect.currentFrame = 24;
effect.run();
assert.strictEqual(focuses.length, 0);
effect.currentFrame = 25;
effect.run();
assert.strictEqual(focuses.length, 1);
assert(focuses[0].x > 1);
assert.strictEqual(cleared, 1);
assert.strictEqual(effect.focusedAnimalFrameRef.current, 25);
console.log('Confusion focus checks passed: correct animal/frame, delayed annotations, centered fit, zoom bounds, and message guards.');
