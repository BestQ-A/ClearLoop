import { createContext, useContext } from "react";
import type {
  AgentConfig,
  ConversationTurn,
  Epic,
  FilePath,
  HistoryEntry,
  PlanResult,
  ProviderInfo,
  StreamEvent,
  ValidationResult,
  WorkflowType,
} from "../types/Homepage";

export interface TraycerNotification {
  id: string;
  title: string;
  description: string;
  tone: "info" | "success" | "warning" | "error";
  createdAt: string;
}

export interface TraycerAppContextValue {
  activeWorkflow: WorkflowType;
  activeEntryStep?: string;
  setWorkflowSelection: (workflow: WorkflowType, entryStep?: string) => void;
  allFiles: FilePath[];
  selectedFiles: FilePath[];
  attachFile: (file: FilePath) => void;
  removeFile: (file: FilePath) => void;
  providers: ProviderInfo[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  modelProfile: "frontier" | "balanced" | "eco";
  setModelProfile: (profile: "frontier" | "balanced" | "eco") => void;
  conversation: ConversationTurn[];
  planResult: PlanResult | null;
  validationResult: ValidationResult | null;
  history: HistoryEntry[];
  epics: Epic[];
  currentEpic: Epic | null;
  agents: AgentConfig[];
  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;
  isLoading: boolean;
  isStreaming: boolean;
  streamEvents: StreamEvent[];
  notifications: TraycerNotification[];
  error: string;
  clearError: () => void;
  sendToExtension: (command: string, data?: unknown) => void;
  handleSubmit: (text: string) => void;
  handleSlashCommand: (cmd: string, args?: string) => void;
  handleValidate: () => void;
  handleGenerate: (agent: string) => void;
  cancelStream: () => void;
  handleClear: () => void;
  refreshHistory: () => void;
  refreshEpics: () => void;
  openEpic: (epic: Epic) => void;
  createEpic: () => void;
}

const TraycerAppContext = createContext<TraycerAppContextValue | null>(null);

export const TraycerAppProvider = TraycerAppContext.Provider;

export function useTraycerApp(): TraycerAppContextValue {
  const value = useContext(TraycerAppContext);
  if (!value) {
    throw new Error("useTraycerApp must be used inside RootLayout");
  }
  return value;
}
