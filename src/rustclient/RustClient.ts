import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { StreamHandler, StreamEvent } from "./StreamHandler";

/**
 * Map VS Code settings (`clearLoop.*`) into codesail-server environment vars.
 * 用户可以在 settings.json 里配自己的 LLM endpoint / key / model，
 * 不再需要 hardcode 或写 launch script。
 */
function buildServerEnv(): NodeJS.ProcessEnv {
    const cfg = vscode.workspace.getConfiguration("clearLoop");
    const env: NodeJS.ProcessEnv = { ...process.env };

    const provider = cfg.get<string>("defaultProvider") || "ollama";
    const model = cfg.get<string>("defaultModel") || "qwen3.5:9b";
    const apiEndpoint = cfg.get<string>("apiEndpoint") || "";
    const apiKey = cfg.get<string>("apiKey") || "";

    env.CODESAIL_DEFAULT_PROVIDER = provider;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
        env.CODESAIL_WORKSPACE_ROOT = workspaceRoot;
    }

    // OpenAI-compatible: 任何走 /v1/chat/completions 的 endpoint
    // （MiMo Token-Plan, Together, Groq, OpenRouter, vLLM 自部署 …）
    if (apiEndpoint) {
        env.CODESAIL_API_ENDPOINT = apiEndpoint;
        env.CODESAIL_API_MODEL = model;
        if (apiKey) {
            env.CODESAIL_API_KEY = apiKey;
        }
    }

    // Ollama 默认走 localhost:11434；这里只覆盖 model
    env.CODESAIL_OLLAMA_MODEL = model;

    return env;
}

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}

export class RustClient {
    private proc: ChildProcess | undefined;
    private nextId = 1;
    private pending = new Map<number, PendingRequest>();
    private buffer = "";
    private ready = false;
    private streamHandler = new StreamHandler();

    async start(extensionPath: string): Promise<void> {
        const binaryName = process.platform === "win32"
            ? "codesail-server.exe"
            : "codesail-server";
        const binaryPath = path.join(extensionPath, "bin", binaryName);

        this.proc = spawn(binaryPath, [], {
            stdio: ["pipe", "pipe", "pipe"],
            env: buildServerEnv(),
        });

        this.proc.stdout!.on("data", (chunk: Buffer) => {
            this.buffer += chunk.toString("utf8");
            this.processBuffer();
        });

        this.proc.stderr!.on("data", (chunk: Buffer) => {
            console.error("[codesail-server]", chunk.toString("utf8"));
        });

        this.proc.on("error", (err) => {
            console.error("[codesail-server] process error:", err);
        });

        this.proc.on("exit", (code) => {
            console.error("[codesail-server] exited with code:", code);
            for (const [id, pending] of this.pending) {
                pending.reject(new Error(`Server exited with code ${code}`));
            }
            this.pending.clear();
        });

        // Wait for the ready notification from the server
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Server did not send ready notification"));
            }, 10000);

            const checkReady = () => {
                if (this.ready) {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    setTimeout(checkReady, 100);
                }
            };
            checkReady();
        });
    }

    private processBuffer() {
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";

        for (const line of lines) {
            if (line.trim().length === 0) continue;
            // 将每行同时传递给 StreamHandler 处理流式通知
            this.streamHandler.processLine(line);
            try {
                const msg = JSON.parse(line);
                this.handleMessage(msg);
            } catch (e) {
                console.error("[codesail-server] failed to parse:", line);
            }
        }
    }

    private handleMessage(msg: any) {
        // Notification (no id) — could be the ready message
        if (msg.id === undefined || msg.id === null) {
            if (msg.result?.status === "ready") {
                this.ready = true;
            }
            return;
        }

        const id = msg.id as number;
        const pending = this.pending.get(id);
        if (!pending) return;

        this.pending.delete(id);

        if (msg.error) {
            pending.reject(new Error(msg.error.message || "Unknown server error"));
        } else {
            pending.resolve(msg.result);
        }
    }

    async request(method: string, params: any = {}): Promise<any> {
        if (!this.proc || this.proc.exitCode !== null) {
            throw new Error("Server is not running");
        }

        const id = this.nextId++;
        const msg = JSON.stringify({
            jsonrpc: "2.0",
            id,
            method,
            params,
        });

        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.proc!.stdin!.write(msg + "\n");

            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`Request ${method} timed out`));
                }
            }, 120000);
        });
    }

    /** 获取 StreamHandler 实例，用于监听流式事件 */
    getStreamHandler(): StreamHandler {
        return this.streamHandler;
    }

    /** 注册流式事件回调 */
    onStream(callback: (event: StreamEvent) => void): void {
        this.streamHandler.on("stream", callback);
    }

    /**
     * 发送流式请求——发出 JSON-RPC 请求后，等待 StreamHandler 收到 "done" 事件才 resolve。
     * 期间所有流式事件通过 StreamHandler 发出。
     * 超时 300000ms（5 分钟）。
     */
    async requestStream(method: string, params: any = {}): Promise<any> {
        if (!this.proc || this.proc.exitCode !== null) {
            throw new Error("Server is not running");
        }

        const id = this.nextId++;
        const msg = JSON.stringify({
            jsonrpc: "2.0",
            id,
            method,
            params,
        });

        return new Promise((resolve, reject) => {
            const streamTimeout = 300000; // 5 分钟

            const onComplete = (data: any) => {
                clearTimeout(timer);
                cleanup();
                resolve(data);
            };

            const cleanup = () => {
                this.streamHandler.removeListener("complete", onComplete);
            };

            this.streamHandler.on("complete", onComplete);

            // 同时监听普通 JSON-RPC 响应（以防服务端直接返回而非流式）
            this.pending.set(id, {
                resolve: (result: any) => {
                    clearTimeout(timer);
                    cleanup();
                    resolve(result);
                },
                reject: (err: any) => {
                    clearTimeout(timer);
                    cleanup();
                    reject(err);
                },
            });

            this.proc!.stdin!.write(msg + "\n");

            const timer = setTimeout(() => {
                this.pending.delete(id);
                cleanup();
                reject(new Error(`Stream request ${method} timed out`));
            }, streamTimeout);
        });
    }

    async shutdown(): Promise<void> {
        if (this.proc && this.proc.exitCode === null) {
            try {
                await this.request("shutdown");
            } catch {
                // ignore
            }
            this.proc.kill();
            this.proc = undefined;
        }
    }
}
