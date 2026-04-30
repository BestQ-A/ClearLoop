import { EventEmitter } from "events";

export interface StreamChunk {
  delta: string;
  done: boolean;
}

export interface StreamEvent {
  type: string;
  data: any;
  timestamp: string;
}

export class StreamHandler extends EventEmitter {
  private buffer = "";

  processLine(line: string): void {
    try {
      const msg = JSON.parse(line);
      // 通知消息没有 id 字段
      if (msg.id === undefined || msg.id === null) {
        if (msg.method === "stream") {
          const event = msg.params as StreamEvent;
          this.emit("stream", event);
          this.emit(event.type, event.data);
          if (event.type === "done") {
            this.emit("complete", event.data);
          }
        }
      }
    } catch {
      // 非 JSON 内容，忽略
    }
  }
}
