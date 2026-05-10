// src/webview/WebviewContentProvider.ts
import * as vscode from "vscode";

export function getWebviewContent(
  extensionUri: vscode.Uri,
  webview: vscode.Webview
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      extensionUri,
      "webview-ui",
      "dist",
      "assets",
      "index.js"
    )
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      extensionUri,
      "webview-ui",
      "dist",
      "assets",
      "index.css"
    )
  );
  const cspSource = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:; connect-src http://localhost:8001 http://localhost:11434;`;

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="${cspSource}">
      <title>ClearLoop</title>
      <link href="${styleUri}" rel="stylesheet">
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="${scriptUri}"></script>
    </body>
    </html>`;
}
