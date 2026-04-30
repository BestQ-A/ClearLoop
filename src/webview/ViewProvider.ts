import * as vscode from "vscode";
import { getWebviewContent } from "./WebviewContentProvider";
import { createMessageHandler } from "./MessageHandler";
import { RustClient } from "../rustclient/RustClient";

export function createViewProvider(
  extensionUri: vscode.Uri,
  context: vscode.ExtensionContext,
  rustClient?: RustClient
): vscode.WebviewViewProvider & {
  viewId: string;
  sendAuthRequest: () => Promise<void>;
  postMessage: (message: any) => void;
} {
  let webview: vscode.Webview | undefined;
  const messageHandler = createMessageHandler(context, rustClient);

  async function sendAuthRequest() {
    if (webview) {
      webview.postMessage({ command: "Github Authentication" });
    }
  }

  function resolveWebviewView(
    webviewView: vscode.WebviewView,
    webviewContext: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webview = webviewView.webview;
    messageHandler.setWebview(webview);

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [extensionUri],
    };

    webviewView.webview.html = getWebviewContent(extensionUri, webview);

    webviewView.webview.onDidReceiveMessage((message) =>
      messageHandler.handleMessage(message)
    );

    // 把 VS Code 设置 codesail.languagePreference 同步到 webview。
    // Traycer 的 languagePreference 设置同时控制 LLM 输出语言 + UI 显示语言。
    // 这里两者都管：webview 收到 setLocale 后切 UI；后续 LLM 调用从设置读再传给后端。
    const pushLocale = () => {
      const lang =
        vscode.workspace.getConfiguration("codesail").get<string>("languagePreference") ||
        "en";
      // command 名约定为 `codesail-locale`，I18nContext 监听同名 message
      webview?.postMessage({ command: "codesail-locale", data: lang });
    };
    // 初次推送
    pushLocale();
    // 设置变更时再推送
    const sub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("codesail.languagePreference")) {
        pushLocale();
      }
    });
    context.subscriptions.push(sub);
  }

  function postMessage(message: any) {
    if (webview) {
      webview.postMessage(message);
    }
  }

  return {
    viewId: "codesailView",
    resolveWebviewView,
    sendAuthRequest,
    postMessage,
  };
}
