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

    // Keep ClearLoop's languagePreference synced into the webview.
    const pushLocale = () => {
      const lang =
        vscode.workspace.getConfiguration("clearLoop").get<string>("languagePreference") ||
        "en";
      webview?.postMessage({ command: "clearLoop-locale", data: lang });
    };
    pushLocale();
    const sub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("clearLoop.languagePreference")) {
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
    viewId: "clearLoop.commentNavigatorWebview",
    resolveWebviewView,
    sendAuthRequest,
    postMessage,
  };
}
