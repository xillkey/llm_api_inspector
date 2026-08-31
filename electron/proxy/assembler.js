export class StreamAssembler {
  constructor() {
    this.content = '';
    this.reasoning = '';
    this.toolCalls = new Map();
    this.finishReason = null;
    this.usage = null;
    this.model = null;
    this.id = null;
  }

  applyChunk(parsed) {
    if (!parsed || typeof parsed !== 'object') return;

    if (parsed.model) this.model = parsed.model;
    if (parsed.id) this.id = parsed.id;

    const choice = parsed.choices?.[0];
    if (!choice) {
      if (parsed.usage) this.usage = parsed.usage;
      return;
    }

    if (choice.finish_reason) this.finishReason = choice.finish_reason;

    const delta = choice.delta || choice.message || {};
    if (delta.content) this.content += delta.content;

    const reasoningPart = delta.reasoning_content ?? delta.reasoning;
    if (reasoningPart) this.reasoning += reasoningPart;

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const index = tc.index ?? 0;
        if (!this.toolCalls.has(index)) {
          this.toolCalls.set(index, {
            id: tc.id || '',
            type: tc.type || 'function',
            function: { name: '', arguments: '' },
          });
        }
        const existing = this.toolCalls.get(index);
        if (tc.id) existing.id = tc.id;
        if (tc.type) existing.type = tc.type;
        if (tc.function?.name) existing.function.name += tc.function.name;
        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
      }
    }

    if (parsed.usage) this.usage = parsed.usage;
  }

  toResponseObject() {
    const message = {
      role: 'assistant',
      content: this.content || null,
    };

    if (this.reasoning) {
      message.reasoning_content = this.reasoning;
    }

    const toolCallsArray = [...this.toolCalls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, tc]) => {
        let args = tc.function.arguments;
        try {
          args = JSON.parse(args);
        } catch {
          // keep raw string
        }
        return {
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: typeof args === 'string' ? args : JSON.stringify(args),
          },
        };
      });

    if (toolCallsArray.length) {
      message.tool_calls = toolCallsArray;
    }

    return {
      id: this.id,
      object: 'chat.completion',
      model: this.model,
      choices: [
        {
          index: 0,
          message,
          finish_reason: this.finishReason,
        },
      ],
      usage: this.usage,
    };
  }
}
