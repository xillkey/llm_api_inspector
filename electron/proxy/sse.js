export class SSEParser {
  constructor() {
    this.buffer = '';
  }

  feed(chunkText) {
    this.buffer += chunkText;
    const events = [];
    const parts = this.buffer.split('\n\n');
    this.buffer = parts.pop() ?? '';

    for (const part of parts) {
      const event = this.parseEvent(part);
      if (event) events.push(event);
    }
    return events;
  }

  flush() {
    if (!this.buffer.trim()) {
      this.buffer = '';
      return [];
    }
    const event = this.parseEvent(this.buffer);
    this.buffer = '';
    return event ? [event] : [];
  }

  parseEvent(block) {
    const lines = block.split('\n');
    let data = '';

    for (const line of lines) {
      if (line.startsWith('data:')) {
        data += line.slice(5).trimStart();
      }
    }

    if (!data) return null;
    if (data === '[DONE]') return { done: true };

    try {
      return { done: false, json: JSON.parse(data) };
    } catch {
      return null;
    }
  }
}

export function decodeChunk(chunk) {
  if (typeof chunk === 'string') return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString('utf8');
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString('utf8');
  return String(chunk);
}
