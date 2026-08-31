const CHARS_PER_TICK = 3;
const TICK_MS = 25;

const runners = new Map();

function cloneToolCalls(toolCalls) {
  return (toolCalls || []).map((tc) => ({
    index: tc.index,
    id: tc.id,
    type: tc.type,
    name: tc.name || '',
    arguments: tc.arguments || '',
  }));
}

function needsMore(runner) {
  if (runner.displayed.content.length < runner.target.content.length) return true;
  if (runner.displayed.reasoning.length < runner.target.reasoning.length) return true;
  const target = runner.target.toolCalls;
  const displayed = runner.displayed.toolCalls;
  if (displayed.length < target.length) return true;
  for (let i = 0; i < target.length; i++) {
    if (displayed[i].name.length < target[i].name.length) return true;
    if (displayed[i].arguments.length < target[i].arguments.length) return true;
  }
  return false;
}

function advanceToolCalls(runner) {
  const target = runner.target.toolCalls;
  const displayed = runner.displayed.toolCalls;
  let moved = false;

  while (displayed.length < target.length) {
    displayed.push({
      index: target[displayed.length].index,
      name: '',
      arguments: '',
    });
    moved = true;
  }

  for (let i = 0; i < target.length; i++) {
    const t = target[i];
    const d = displayed[i];
    if (d.name.length < t.name.length) {
      d.name = t.name.slice(0, Math.min(d.name.length + CHARS_PER_TICK, t.name.length));
      moved = true;
    }
    if (d.arguments.length < t.arguments.length) {
      d.arguments = t.arguments.slice(
        0,
        Math.min(d.arguments.length + CHARS_PER_TICK, t.arguments.length)
      );
      moved = true;
    }
  }

  return moved;
}

function ensureRunning(runner) {
  if (runner.timer) return;
  runner.timer = setInterval(() => {
    let moved = false;

    if (runner.displayed.content.length < runner.target.content.length) {
      runner.displayed.content = runner.target.content.slice(
        0,
        Math.min(runner.displayed.content.length + CHARS_PER_TICK, runner.target.content.length)
      );
      moved = true;
    }

    if (runner.displayed.reasoning.length < runner.target.reasoning.length) {
      runner.displayed.reasoning = runner.target.reasoning.slice(
        0,
        Math.min(runner.displayed.reasoning.length + CHARS_PER_TICK, runner.target.reasoning.length)
      );
      moved = true;
    }

    if (advanceToolCalls(runner)) moved = true;

    if (moved) {
      runner.onPaint(runner.displayed, needsMore(runner));
    }

    if (!needsMore(runner)) {
      clearInterval(runner.timer);
      runner.timer = null;
      runner.onPaint(runner.displayed, false);
    }
  }, TICK_MS);
}

export function stopTypewriter(requestId) {
  const runner = runners.get(requestId);
  if (runner?.timer) clearInterval(runner.timer);
  runners.delete(requestId);
}

export function syncTypewriter(requestId, target, onPaint) {
  let runner = runners.get(requestId);
  if (!runner) {
    runner = {
      displayed: { content: '', reasoning: '', toolCalls: [] },
      target: { content: '', reasoning: '', toolCalls: [] },
      timer: null,
      onPaint,
    };
    runners.set(requestId, runner);
  }

  runner.target = {
    content: target.content || '',
    reasoning: target.reasoning || '',
    toolCalls: cloneToolCalls(target.toolCalls),
  };
  runner.onPaint = onPaint;
  ensureRunning(runner);

  if (!needsMore(runner)) {
    runner.onPaint(runner.displayed, false);
  }
}
