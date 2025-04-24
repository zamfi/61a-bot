import { get } from "http";
import * as vscode from 'vscode';
import { window } from 'vscode';
import fetch, { Response } from "node-fetch";

const API_VERSION = "v2";
const EXT_VERSION = 5;

const SERVER = "http://localhost:8890";
const BACKEND = SERVER+"/get-help";
const FEEDBACK_BACKEND = SERVER+"/feedback";

const FE_KEY = "ARBITRARY-KEY-MATCHES-BACKEND-TO-EXTENSION";

export async function getHelpForCode(email: string, consent: boolean, hwId: string, activeFunction: string, code: string | undefined, studentQuery: string | undefined, priorExchange: Array<{role: string, content: string}> = []): Promise<{output: string, requestId: string}> {
  try {
    let timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        reject("Timed out after 30 seconds");
      }, 30000);
    });
    let response = await Promise.race([timeoutPromise, fetch(BACKEND, {
      method: "POST",
      body: JSON.stringify({
        email,
        consent,
        promptLabel: "Get_help",
        hwId,
        activeFunction,
        code,
        studentQuery,
        messages: priorExchange,
        version: API_VERSION,
        extVersion: EXT_VERSION,
        key: FE_KEY
      })
    })]) as Response;
    let json = await response.json() as {output: string, requestId: string};
    // console.log(json);
    return json;
  } catch (e) {
    // console.error(e);
    return {output: "An error occurred: " + e, requestId: ""};
  }
}

export async function submitFeedback(requestId: string, feedback: string): Promise<void> {
  try {
    let timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        reject("Timed out after 30 seconds");
      }, 30000);
    });
    let response = await Promise.race([timeoutPromise, fetch(FEEDBACK_BACKEND, {
      method: "POST",
      body: JSON.stringify({
        requestId,
        feedback,
        version: API_VERSION,
        extVersion: EXT_VERSION,
        key: FE_KEY
      })
    })]) as Response;
    let json = await response.json() as {status: string};
    console.log(json);
    // return json;
  } catch (e) {
    console.error(e);
    // return {output: "An error occurred: " + e, requestId: ""};
  }
}
  

export async function getActiveFunction(): Promise<{name: string, text: string} | null> {
  let editor = vscode.window.activeTextEditor;

  if (editor) {
    let position = editor.selection.active; // current cursor position
    let document = editor.document;

    const fallback = () => {
      // console.log("Falling back to searching for function definition");
      let line = position.line;
      let name = "";
      while (line >= 0) {
        let text = document.lineAt(line).text;
        // match both `def f():` and `def f ():` as well as `(define f (` and `(define (f) (` and `(define (f x) (`
        let match = text.match(/^(?:def\s+(\w+)\s*\(|\(define(?:-macro)?\s+\(?\s*([-?\w]+)[\s\)]|CREATE\s+TABLE\s+([_\w]+)\s+)/);
        if (match) {
          console.log("found! name", match[1] || match[2] || match[3]); // function name
          name = match[1] || match[2] || match[3];
          // console.log("text", text); // function definition
          break;
        } else {
          // console.log("line", text, "didn't match");
        }
        line--;
      }
      let start = new vscode.Position(Math.max(0, line), 0);
      // ...and forwards for the next global function definition
      line = position.line;
      while (line < document.lineCount) {
        let text = document.lineAt(line).text;
        let match = text.match(/^(?:def\s+(\w+)\s*\(|\(define(?:-macro)?\s+\(?\s*([-?\w]+)[\s\)]|CREATE\s+TABLE\s+(\w+)\s+)/);
        if (match) {
          // console.log(match[1]); // function name
          // console.log(text); // function definition
          break;
        }
        line++;
      }
      let end = new vscode.Position(line, 0);
      let functionText = document.getText(new vscode.Range(start, end));
      // console.log("fallback", functionText);
      return {name, text: functionText};
    };

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', document.uri);
    if (symbols) {
      let findEnclosingFunction = (symbol: vscode.DocumentSymbol): vscode.DocumentSymbol | null => {
        console.log("SYMBOL!", symbol.name, symbol.range, symbol.kind);
        if (symbol.range?.contains(position) && symbol.kind === vscode.SymbolKind.Function) {
          return symbol;
        }
        if (symbol.children) {
          for (let child of symbol.children) {
            let found = findEnclosingFunction(child);
            if (found) {
              return found;
            }
          }
        }
        return null;
      };

      let enclosingFunction = findEnclosingFunction({ children: symbols } as vscode.DocumentSymbol);

      if (enclosingFunction) {
        // console.log(enclosingFunction.name); // function name
        let functionText = document.getText(enclosingFunction.range);
        // console.log("vscode", functionText); // function range
        return {name: enclosingFunction.name, text: functionText};
      }
    }
    // fallback to searching backwards for the previous global function definition...
    return fallback();
  }	else {
    return null;
  }
}