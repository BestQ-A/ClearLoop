import * as vscode from "vscode";
import { getWorkspaceFiles, readFile } from "../utils/FileOperations";
import { createCodeAnalysisService } from "../services/CodeAnalysisService";
import { RustClient } from "../rustclient/RustClient";
import { StreamEvent } from "../rustclient/StreamHandler";

interface Message {
  command: string;
  data?: any;
}

export function createMessageHandler(
  context: vscode.ExtensionContext,
  rustClient?: RustClient
) {
  let webview: vscode.Webview | undefined;
  const legacyService = createCodeAnalysisService();
  let lastCode = "";

  // 设置持久流式监听器，将所有流式事件转发到 webview
  if (rustClient) {
    const streamHandler = rustClient.getStreamHandler();
    streamHandler.on("stream", (event: StreamEvent) => {
      if (webview) {
        webview.postMessage({ command: "streamEvent", data: event });
      }
    });
  }

  function setWebview(newWebview: vscode.Webview) {
    webview = newWebview;
    legacyService.setWebview(newWebview);
  }

  async function handleMessage(message: Message): Promise<void> {
    if (!webview) throw new Error("Webview not initialized");
    try {
      switch (message.command) {
        case "fetchdata": {
          const files = await getWorkspaceFiles();
          webview.postMessage({ command: "all-files", data: files });
          break;
        }

        case "initialize": {
          if (rustClient) {
            const result = await rustClient.request("initialize");
            webview.postMessage({ command: "initialized", data: result });
          }
          break;
        }

        // --- New workflow commands ---

        case "plan": {
          if (!message.data?.filePath || !message.data?.prompt) {
            webview.postMessage({ command: "error", text: "Missing file or prompt." });
            return;
          }
          const code = await readFile(message.data.filePath);
          if (!code) return;
          lastCode = code;

          if (rustClient) {
            webview.postMessage({ command: "analysisStart" });
            try {
              const result = await rustClient.request("plan", {
                code,
                prompt: message.data.prompt,
                workflow: message.data.workflow || "plan",
              });
              webview.postMessage({ command: "planResult", text: JSON.stringify(result) });
            } catch (err: any) {
              webview.postMessage({ command: "error", text: `Plan failed: ${err.message}` });
            }
          } else {
            await legacyService.analyzeCode(code, message.data.prompt);
          }
          break;
        }

        case "validate": {
          if (!rustClient || !message.data?.plan) {
            webview.postMessage({ command: "error", text: "No plan to validate." });
            return;
          }
          webview.postMessage({ command: "analysisStart" });
          try {
            const result = await rustClient.request("validate", {
              plan_id: message.data.planId || message.data.plan.id,
              plan: message.data.plan,
              original_code: lastCode,
            });
            webview.postMessage({ command: "validationResult", text: JSON.stringify(result) });
          } catch (err: any) {
            webview.postMessage({ command: "error", text: `Validation failed: ${err.message}` });
          }
          break;
        }

        case "generate": {
          if (!rustClient || !message.data?.plan) {
            webview.postMessage({ command: "error", text: "No plan to generate from." });
            return;
          }
          webview.postMessage({ command: "analysisStart" });
          try {
            const result = await rustClient.request("generate", {
              plan: message.data.plan,
              code: lastCode,
            });
            webview.postMessage({ command: "generateResult", text: JSON.stringify(result) });
          } catch (err: any) {
            webview.postMessage({ command: "error", text: `Generation failed: ${err.message}` });
          }
          break;
        }

        // --- Provider commands ---

        case "listProviders": {
          if (rustClient) {
            const providers = await rustClient.request("listProviders");
            webview.postMessage({ command: "providers", data: providers });
          }
          break;
        }

        case "setProvider": {
          if (rustClient && message.data) {
            await rustClient.request("setProvider", message.data);
            webview.postMessage({ command: "providerChanged", data: message.data.provider });
          }
          break;
        }

        // --- History ---

        case "history": {
          if (rustClient) {
            const result = await rustClient.request("history");
            webview.postMessage({ command: "historyResult", data: result });
          }
          break;
        }

        // --- Legacy ---

        case "Analyse File": {
          if (!message.data?.filePath || !message.data?.prompt) {
            webview.postMessage({ command: "error", text: "Missing file or prompt." });
            return;
          }
          const legacyCode = await readFile(message.data.filePath);
          if (!legacyCode) return;

          if (rustClient) {
            webview.postMessage({ command: "analysisStart" });
            try {
              const result = await rustClient.request("analyze", {
                code: legacyCode,
                prompt: message.data.prompt,
              });
              webview.postMessage({ command: "final", text: JSON.stringify(result) });
            } catch (err: any) {
              webview.postMessage({ command: "error", text: `Analysis failed: ${err.message}` });
            }
          } else {
            await legacyService.analyzeCode(legacyCode, message.data.prompt);
          }
          break;
        }

        // --- Epic 管理 ---

        case "createEpic": {
          if (!rustClient) break;
          const result = await rustClient.request("createEpic", message.data);
          webview.postMessage({ command: "epicCreated", data: result });
          break;
        }

        case "listEpics": {
          if (!rustClient) break;
          const result = await rustClient.request("listEpics");
          webview.postMessage({ command: "epicList", data: result });
          break;
        }

        case "getEpic": {
          if (!rustClient) break;
          const result = await rustClient.request("getEpic", message.data);
          webview.postMessage({ command: "epicDetail", data: result });
          break;
        }

        case "updateEpic": {
          if (!rustClient) break;
          const result = await rustClient.request("updateEpic", message.data);
          webview.postMessage({ command: "epicUpdated", data: result });
          break;
        }

        case "deleteEpic": {
          if (!rustClient) break;
          await rustClient.request("deleteEpic", message.data);
          webview.postMessage({ command: "epicDeleted", data: message.data });
          break;
        }

        // --- Spec 管理 ---

        case "createSpec": {
          if (!rustClient) break;
          const result = await rustClient.request("createSpec", message.data);
          webview.postMessage({ command: "specCreated", data: result });
          break;
        }

        case "updateSpec": {
          if (!rustClient) break;
          const result = await rustClient.request("updateSpec", message.data);
          webview.postMessage({ command: "specUpdated", data: result });
          break;
        }

        case "deleteSpec": {
          if (!rustClient) break;
          await rustClient.request("deleteSpec", message.data);
          webview.postMessage({ command: "specDeleted", data: message.data });
          break;
        }

        // --- Ticket 管理 ---

        case "createTicket": {
          if (!rustClient) break;
          const result = await rustClient.request("createTicket", message.data);
          webview.postMessage({ command: "ticketCreated", data: result });
          break;
        }

        case "updateTicket": {
          if (!rustClient) break;
          const result = await rustClient.request("updateTicket", message.data);
          webview.postMessage({ command: "ticketUpdated", data: result });
          break;
        }

        case "deleteTicket": {
          if (!rustClient) break;
          await rustClient.request("deleteTicket", message.data);
          webview.postMessage({ command: "ticketDeleted", data: message.data });
          break;
        }

        // --- 执行 ---

        case "startExecution": {
          if (!rustClient) break;
          const result = await rustClient.request("startExecution", message.data);
          webview.postMessage({ command: "executionStarted", data: result });
          break;
        }

        // --- 验证 ---

        case "verify": {
          if (!rustClient) break;
          webview.postMessage({ command: "analysisStart" });
          try {
            const result = await rustClient.request("verify", {
              plan_id: message.data.planId,
              plan_json: JSON.stringify(message.data.plan),
              original_code: lastCode,
              execution_id: message.data.executionId,
            });
            webview.postMessage({ command: "verifyResult", text: JSON.stringify(result) });
          } catch (err: any) {
            webview.postMessage({ command: "error", text: `Verification failed: ${err.message}` });
          }
          break;
        }

        // --- YOLO 模式 ---

        case "yoloRun": {
          if (!rustClient) break;
          webview.postMessage({ command: "analysisStart" });
          try {
            const result = await rustClient.request("yoloRun", message.data);
            webview.postMessage({ command: "yoloResult", data: result });
          } catch (err: any) {
            webview.postMessage({ command: "error", text: `YOLO run failed: ${err.message}` });
          }
          break;
        }

        // --- Agent 管理 ---

        case "listAgents": {
          if (!rustClient) break;
          const result = await rustClient.request("listAgents");
          webview.postMessage({ command: "agentList", data: result });
          break;
        }

        case "registerAgent": {
          if (!rustClient) break;
          await rustClient.request("registerAgent", message.data);
          webview.postMessage({ command: "agentRegistered" });
          break;
        }

        // --- MCP server registry ---

        case "listMcpServers": {
          if (!rustClient) return;
          const result = await rustClient.request("listMcpServers");
          webview.postMessage({ command: "mcpServerList", data: result });
          break;
        }
        case "addMcpServer": {
          if (!rustClient) return;
          await rustClient.request("addMcpServer", message.data);
          break;
        }
        case "removeMcpServer": {
          if (!rustClient) return;
          await rustClient.request("removeMcpServer", message.data);
          break;
        }
        case "toggleMcpServer": {
          if (!rustClient) return;
          await rustClient.request("toggleMcpServer", message.data);
          break;
        }

        // --- 流式 Plan / Validate / Generate ---
        // 注意：流式事件由扩展激活时注册的全局监听器（见构造区）转发到 webview，
        // 这里只负责发起请求并包裹 streamStart/streamEnd 标记。

        case "planStream": {
          if (!rustClient) {
            webview.postMessage({ command: "error", text: "Rust server not available" });
            return;
          }
          if (!message.data?.prompt) {
            webview.postMessage({ command: "error", text: "Missing prompt." });
            return;
          }

          // 从选中的文件路径列表读取代码（兼容单文件 filePath 与多文件 filePaths）
          let code = "";
          if (Array.isArray(message.data.filePaths) && message.data.filePaths.length > 0) {
            const contents = await Promise.all(
              message.data.filePaths.map((p: string) => readFile(p).catch(() => ""))
            );
            code = contents.filter(Boolean).join("\n\n--- FILE BOUNDARY ---\n\n");
          } else if (message.data.filePath) {
            code = (await readFile(message.data.filePath).catch(() => "")) || "";
          }
          lastCode = code;

          webview.postMessage({ command: "streamStart" });
          try {
            const result = await rustClient.request("planStream", {
              code,
              prompt: message.data.prompt,
              workflow: message.data.workflow || "plan",
            });
            webview.postMessage({ command: "planResult", text: JSON.stringify(result) });
          } catch (err: any) {
            webview.postMessage({ command: "error", text: `Plan failed: ${err.message}` });
          } finally {
            webview.postMessage({ command: "streamEnd" });
          }
          break;
        }

        case "validateStream": {
          if (!rustClient || !message.data?.plan) {
            webview.postMessage({ command: "error", text: "No plan to validate." });
            return;
          }
          webview.postMessage({ command: "streamStart" });
          try {
            const result = await rustClient.request("validateStream", {
              plan_id: message.data.planId || message.data.plan.id,
              plan: message.data.plan,
              original_code: lastCode,
            });
            webview.postMessage({ command: "validationResult", text: JSON.stringify(result) });
          } catch (err: any) {
            webview.postMessage({ command: "error", text: `Validation failed: ${err.message}` });
          } finally {
            webview.postMessage({ command: "streamEnd" });
          }
          break;
        }

        case "generateStream": {
          if (!rustClient || !message.data?.plan) {
            webview.postMessage({ command: "error", text: "No plan." });
            return;
          }
          webview.postMessage({ command: "streamStart" });
          try {
            const result = await rustClient.request("generateStream", {
              plan: message.data.plan,
              code: lastCode,
            });
            webview.postMessage({ command: "generateResult", text: JSON.stringify(result) });
          } catch (err: any) {
            webview.postMessage({ command: "error", text: `Generation failed: ${err.message}` });
          } finally {
            webview.postMessage({ command: "streamEnd" });
          }
          break;
        }

        // --- 原有命令 ---

        case "github-authentication":
          webview.postMessage({ command: "userProfile", data: null });
          break;

        // --- i18n: webview 切换语言后，把选择回写到 VS Code setting，
        //     ViewProvider 的 onDidChangeConfiguration 监听到后，
        //     会再 push 一条 codesail-locale 到所有 webview，保持一致。
        case "codesail-locale-set": {
          const next = typeof message.data === "string" ? message.data : "en";
          const config = vscode.workspace.getConfiguration("codesail");
          await config.update(
            "languagePreference",
            next,
            vscode.ConfigurationTarget.Global
          );
          break;
        }

        default:
          webview.postMessage({
            command: "error",
            text: `Unknown command: ${message.command}`,
          });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`${message.command} error:`, msg, error);
      webview.postMessage({ command: "error", text: msg });
    }
  }

  return { setWebview, handleMessage };
}
