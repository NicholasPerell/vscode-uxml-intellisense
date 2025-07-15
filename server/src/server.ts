import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  DocumentDiagnosticReportKind,
  DocumentDiagnosticReport,
  CompletionList,
  TextDocumentPositionParams
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser } from "./parsing/uxmlParser";
import { doValidation } from "./services/validation";
import { doCompletion, doCompletionResolve } from "./services/completetion";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      completionProvider: {
        resolveProvider: true
      },
      textDocumentSync: TextDocumentSyncKind.Incremental,
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false
      },
      renameProvider: true,
      // foldingRangeProvider: true
    }
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true
      }
    };
  }

  return result;
});

connection.languages.diagnostics.on(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (document !== undefined) {
    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: doValidation(document)
    } satisfies DocumentDiagnosticReport;
  } else {
    // We don't know the document. We can either try to read it from disk
    // or we don't report problems for it.
    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: []
    } satisfies DocumentDiagnosticReport;
  }
});

documents.onDidChangeContent((change) => {
  const document = documents.get(change.document.uri);
  const parser = new Parser(document!);
  parser.getErrors().forEach(e =>
    connection.window.showErrorMessage(
      `${e}`
    ));
  if (parser.getProgram()?.nsEngine) {
    connection.window.showInformationMessage(
      parser.getProgram()!.nsEngine!
    )
  }
});

// connection.onPrepareRename(doPrepareRename);
// connection.onRenameRequest(doRenameRequest);


// This handler provides the initial list of the completion items.
connection.onCompletion(
  (params: TextDocumentPositionParams): CompletionList => {
    const position = params.position;
    const doc = documents.get(params.textDocument.uri);

    if (!doc) {
      return {
        isIncomplete: false,
        items: []
      };
    }

    return doCompletion(doc, position, connection.window.showInformationMessage.bind(connection.window));
  }
);


// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(doCompletionResolve);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
