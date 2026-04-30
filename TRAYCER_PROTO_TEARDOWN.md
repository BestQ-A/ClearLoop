# Traycer gRPC / Proto 契约逐字摘录

> Source: `external/traycer/extracted/extension/proto/traycer/stream/v3/`
> Package: `traycer.stream.v3`
> Syntax: `proto3`

---

## A. 服务定义

### Service: `CodeDebugService`

定义在 `rpc.proto` 末尾。包含一条**双向流**（核心 agent ↔ server 长连接）+ 一组**unary** Cloud-Data 持久化方法 + 一条 Models 查询。

```proto
service CodeDebugService {
  // Unary - 模型清单
  rpc GetAvailableModels(GetAvailableModelsRequest) returns (GetAvailableModelsResponse);

  // Bidi-stream - Agent 与 Server 之间的全部 plan/verify/反向 RPC 流量都走这条
  rpc Stream(stream AgentToServer) returns (stream ServerToAgent);

  // Unary - Cloud data persistence (task / epic / spec / ticket / phase 协作云存)
  rpc CloudDataListTasks(CloudDataListTasksRequest) returns (CloudDataListTasksResponse);
  rpc CloudDataGrantAccess(CloudDataGrantAccessRequest) returns (CloudDataListCollaboratorsResponse);
  rpc CloudDataListCollaborators(CloudDataListCollaboratorsRequest) returns (CloudDataListCollaboratorsResponse);
  rpc CloudDataBatchUpdateCollaboratorRoles(CloudDataBatchUpdateCollaboratorRolesRequest) returns (CloudDataListCollaboratorsResponse);
  rpc CloudDataRevokeCollaborator(CloudDataRevokeCollaboratorRequest) returns (CloudDataListCollaboratorsResponse);
  rpc CloudDataGenerateShareLink(CloudDataGenerateShareLinkRequest) returns (CloudDataGenerateShareLinkResponse);
  rpc CloudDataRevokeShareLink(CloudDataRevokeShareLinkRequest) returns (google.protobuf.Empty);
  rpc CloudDataAccessViaShareLink(CloudDataAccessViaShareLinkRequest) returns (CloudDataAccessViaShareLinkResponse);
  rpc CloudDataCreateEpic(CloudDataCreateEpicRequest) returns (CloudDataCreateEpicResponse);
  rpc CloudDataUpdateEpic(CloudDataUpdateEpicRequest) returns (CloudDataUpdateEpicResponse);
  rpc CloudDataDeleteEpic(CloudDataDeleteEpicRequest) returns (CloudDataDeleteEpicResponse);
  rpc CloudDataCreateSpec(CloudDataCreateSpecRequest) returns (CloudDataCreateSpecResponse);
  rpc CloudDataUpdateSpec(CloudDataUpdateSpecRequest) returns (CloudDataUpdateSpecResponse);
  rpc CloudDataDeleteSpec(CloudDataDeleteSpecRequest) returns (CloudDataDeleteSpecResponse);
  rpc CloudDataListSpecs(CloudDataListSpecsRequest) returns (CloudDataListSpecsResponse);
  rpc CloudDataCreateTicket(CloudDataCreateTicketRequest) returns (CloudDataCreateTicketResponse);
  rpc CloudDataUpdateTicket(CloudDataUpdateTicketRequest) returns (CloudDataUpdateTicketResponse);
  rpc CloudDataListTickets(CloudDataListTicketsRequest) returns (CloudDataListTicketsResponse);
  rpc CloudDataDeleteTicket(CloudDataDeleteTicketRequest) returns (CloudDataDeleteTicketResponse);
  rpc CloudDataLinkTaskToRepo(CloudDataLinkTaskToRepoRequest) returns (CloudDataLinkTaskToRepoResponse);
  rpc CloudDataCreateUserTaskWorkspace(CloudDataCreateUserTaskWorkspaceRequest) returns (CloudDataCreateUserTaskWorkspaceResponse);
  rpc CloudDataCreatePhase(CloudDataCreatePhaseRequest) returns (CloudDataCreatePhaseResponse);
  rpc CloudDataUpdatePhase(CloudDataUpdatePhaseRequest) returns (CloudDataUpdatePhaseResponse);
  rpc CloudDataDeletePhase(CloudDataDeletePhaseRequest) returns (CloudDataDeletePhaseResponse);
  rpc CloudDataBatchDelete(CloudDataBatchDeleteRequest) returns (CloudDataBatchDeleteResponse);
  rpc CloudDataBatchMigrateTask(CloudDataBatchMigrateTaskRequest) returns (CloudDataBatchMigrateTaskResponse);
  rpc GetCollabToken(GetCollabTokenRequest) returns (GetCollabTokenResponse);
  rpc GetNotificationToken(GetNotificationTokenRequest) returns (GetNotificationTokenResponse);
  rpc CloudDataGetTaskRoomInfo(CloudDataGetTaskRoomInfoRequest) returns (CloudDataGetTaskRoomInfoResponse);
  rpc CloudDataGetTaskContext(CloudDataGetTaskContextRequest) returns (CloudDataGetTaskContextResponse);
  rpc NotifyExtensionEvent(NotifyExtensionEventRequest) returns (google.protobuf.Empty);
}
```

**方法分类：**
- 双向流: `Stream` (1 个) — 全部 plan / verify / thinking / reverse-RPC 走此条
- Unary: 全部 Cloud-Data CRUD + `GetAvailableModels` + `GetCollabToken` / `GetNotificationToken` / `NotifyExtensionEvent` (≈ 32 个)
- 服务端流 / 客户端流: 无独立条目（全部聚合到 `Stream` 内部 oneof）

---

## B. 消息层级

### B.1 顶层信封：AgentToServer / ServerToAgent

```proto
message AgentToServer {
  oneof message {
    RPCRequest rpcRequest = 1;
    ReverseRPCResponse reverseRPCResponse = 2;
    AbortRPC abortRPC = 3;
    Ping ping = 4;
    ChunkedMessage chunkedMessage = 5;
  }
}

message ServerToAgent {
  oneof message {
    RPCResponse rpcResponse = 1;
    ReverseRPCRequest reverseRPCRequest = 2;
    SyncTaskTitle syncTaskTitle = 3;
    SyncTaskChainTitle syncTaskChainTitle = 4;
    SyncTaskSummary syncTaskSummary = 5;
    Pong pong = 6;
    SyncFileSummary syncFileSummary = 7;
    SyncPlanChatQueryType syncPlanChatQueryType = 8;
    SyncRateLimitUsageRequest syncRateLimitUsageRequest = 9;
    SyncPayToRunStatus syncPayToRunStatus = 10;
    ChunkedMessage chunkedMessage = 11;
    StreamThinking streamThinking = 12;
    StreamImplementationPlanDelta streamImplementationPlanDelta = 13;
    StreamEpicChatDelta streamEpicChatDelta = 14;
    SyncEpicTitle syncEpicTitle = 15;
    StreamPhaseChatDelta streamPhaseChatDelta = 16;
    SyncEpicChatTitle syncEpicChatTitle = 17;
    StreamEpicPlanDelta streamEpicPlanDelta = 18;
    SyncExecutionPlanChatQueryType syncExecutionPlanChatQueryType = 19;
    SyncExecutionTitle syncExecutionTitle = 20;
  }
}

message Ping {}
message Pong {}

message ChunkedMessage {
  string chunk_id = 1;
  int32 sequence_number = 2;
  int32 total_chunks = 3;
  bool is_final = 4;
  bytes data = 5;
}

message AbortRPC {
  int32 id = 1;
  reserved 2;
  AbortReason reason = 3;
}

enum AbortReason {
  USER_ABORT = 0;
  PING_WRITE_FAILURE = 1;
  PING_TIMEOUT = 2;
  EXTENSION_CLOSED = 3;
}
```

### B.2 RPCRequest / RPCResponse — 全部 oneof 分支

```proto
enum RPCErrorType {
  SERVER_ERROR = 0;
  NO_ACTIVE_SUBSCRIPTION = 1;
  RATE_LIMIT_EXCEEDED = 2;
  USER_ABORTED = 3;
  INSUFFICIENT_CREDITS = 4;
  ORG_BUNDLE_INSUFFICIENT = 5;
}

message RPCError {
  reserved 5;
  string message = 1;
  int32 retryAfter = 2;
  RPCErrorType errorType = 3;
  bool allowBundleOverage = 4;
}

message RPCRequest {
  reserved 15;
  int32 id = 1;
  Platform platform = 2;
  oneof message {
    PlanGenerationRequest planGenerationRequest = 3;
    PlanChatRequest planChatRequest = 4;
    FetchPersistedTicketRequest fetchPersistedTicketRequest = 5;
    PersistTicketRequest persistTicketRequest = 6;
    GenerateTicketLLMInputRequest generateTicketLLMInputRequest = 7;
    ImportPersistedTicketRequest importPersistedTicketRequest = 8;
    CompareTicketLLMInputRequest compareTicketLLMInputRequest = 9;
    VerificationRequest verificationRequest = 10;
    GetRateLimitUsageRequest getRateLimitUsageRequest = 11;
    PhaseGenerationRequest phaseGenerationRequest = 12;
    PhaseIterationRequest phaseIterationRequest = 13;
    ReVerificationRequest reVerificationRequest = 14;
    EpicChatRequest epicChatRequest = 18;
    ContinueEpicChatRequest continueEpicChatRequest = 19;
    // Epic-specific plan and verification requests
    ExecutionPlanGenerationRequest executionPlanGenerationRequest = 20;
    ExecutionPlanChatRequest executionPlanChatRequest = 21;
    ExecutionVerificationRequest executionVerificationRequest = 22;
    ExecutionReVerificationRequest executionReVerificationRequest = 23;
  }
  optional MCPParent selectedMCPParent = 16;
  SupportedLanguage languagePreference = 17;
  AccountContext accountContext = 24;
  ModelSelection modelSelection = 25;
}

message RPCResponse {
  int32 id = 1;
  oneof message {
    RPCError error = 2;
    PlanGenerationResponse planGenerationResponse = 3;
    PlanChatResponse planChatResponse = 4;
    FetchPersistedTicketResponse fetchPersistedTicketResponse = 5;
    PersistTicketResponse persistTicketResponse = 6;
    GenerateTicketLLMInputResponse generateTicketLLMInputResponse = 7;
    ImportPersistedTicketResponse importPersistedTicketResponse = 8;
    CompareTicketLLMInputResponse compareTicketLLMInputResponse = 9;
    VerificationResponse verificationResponse = 10;
    GetRateLimitUsageResponse getRateLimitUsageResponse = 11;
    ReVerificationResponse reVerificationResponse = 12;
    PhaseBreakdownResponse phaseBreakdownResponse = 13;
    EpicChatResponse epicChatResponse = 14;
    // Epic-specific plan and verification responses
    ExecutionPlanGenerationResponse executionPlanGenerationResponse = 15;
    ExecutionPlanChatResponse executionPlanChatResponse = 16;
    ExecutionVerificationResponse executionVerificationResponse = 17;
    ExecutionReVerificationResponse executionReVerificationResponse = 18;
  }
}
```

### B.3 ReverseRPCRequest / ReverseRPCResponse — 全部 oneof 分支

```proto
message ReverseRPCError { string message = 1; }

message ReverseRPCRequest {
  reserved 21, 22, 23, 24;
  int32 id = 1;
  oneof message {
    // File operations
    ReadFilesRequest readFilesRequest = 2;
    ListFilesRequest listFilesRequest = 3;
    RegexSearchRequest regexSearchRequest = 4;
    LSPSearchRequest lspSearchRequest = 5;
    FileGlobSearchRequest fileGlobSearchRequest = 6;
    GetDiagnosticsRequest getDiagnosticsRequest = 7;
    GetGitDiffRequest getGitDiffRequest = 8;
    GetGitInfoRequest getGitInfoRequest = 9;
    // Spec operations
    ReadSpecRequest readSpecRequest = 10;
    EditSpecRequest editSpecRequest = 11;
    DeleteSpecRequest deleteSpecRequest = 12;
    ListSpecsRequest listSpecsRequest = 13;
    // Ticket operations
    ReadTicketRequest readTicketRequest = 14;
    EditTicketRequest editTicketRequest = 15;
    DeleteTicketRequest deleteTicketRequest = 16;
    ListTicketsRequest listTicketsRequest = 17;
    // Workflow operations
    ListWorkflowCommandsRequest listWorkflowCommandsRequest = 18;
    UpdateSpecFieldsRequest updateSpecFieldsRequest = 19;
    UpdateTicketFieldsRequest updateTicketFieldsRequest = 20;
    // Execution operations
    ReadExecutionRequest readExecutionRequest = 25;
    ListExecutionsRequest listExecutionsRequest = 26;
  }
}

message ReverseRPCResponse {
  reserved 22, 23, 24, 25;
  int32 id = 1;
  oneof message {
    ReverseRPCError error = 2;
    ReadFilesResponse readFilesResponse = 3;
    ListFilesResponse listFilesResponse = 4;
    RegexSearchResponse regexSearchResponse = 5;
    LSPSearchResponse lspSearchResponse = 6;
    FileGlobSearchResponse fileGlobSearchResponse = 7;
    GetDiagnosticsResponse getDiagnosticsResponse = 8;
    GetGitDiffResponse getGitDiffResponse = 9;
    GetGitInfoResponse getGitInfoResponse = 10;
    ReadSpecResponse readSpecResponse = 11;
    EditSpecResponse editSpecResponse = 12;
    DeleteSpecResponse deleteSpecResponse = 13;
    ListSpecsResponse listSpecsResponse = 14;
    ReadTicketResponse readTicketResponse = 15;
    EditTicketResponse editTicketResponse = 16;
    DeleteTicketResponse deleteTicketResponse = 17;
    ListTicketsResponse listTicketsResponse = 18;
    ListWorkflowCommandsResponse listWorkflowCommandsResponse = 19;
    UpdateSpecFieldsResponse updateSpecFieldsResponse = 20;
    UpdateTicketFieldsResponse updateTicketFieldsResponse = 21;
    ReadExecutionResponse readExecutionResponse = 26;
    ListExecutionsResponse listExecutionsResponse = 27;
  }
}
```

### B.4 StreamThinking / Delta 类（流式增量）

```proto
message StreamThinking {
  ArtifactIdentifier artifactIdentifier = 1;
  Thinking thinking = 2;
}

message Thinking {
  string id = 1;
  ThinkingContent content = 2;
  repeated Thinking childrenThinkings = 3;
  bool isCompleted = 4;
}

message ThinkingContent {
  oneof content {
    MCPToolCallInfo mcpToolCallInfo = 1;
    CodeExplorationToolCallInfo codeExplorationToolCallInfo = 2;
  }
}

message MCPToolCallInfo {
  string toolName = 1;
  string parameters = 2;
  string result = 3;
}

message CodeExplorationToolCallInfo {
  string title = 1;
  string subTitle = 2;
  string description = 3;
  string result = 4;
}

message StreamImplementationPlanDelta {
  string outputDelta = 1;
  TaskPlanIdentifier taskPlanIdentifier = 2;
}

message StreamEpicPlanDelta {
  ExecutionPlanIdentifier executionPlanIdentifier = 1;
  string outputDelta = 2;
}

message EpicSpecDelta {
  SpecIdentifier specIdentifier = 1;
  optional string titleDelta = 2;
  optional string contentDelta = 3;
  bool isComplete = 4;
}

message EpicTicketDelta {
  TicketIdentifier ticketIdentifier = 1;
  optional string titleDelta = 2;
  optional string descriptionDelta = 3;
  bool isComplete = 4;
}

message NextStepsOptionDelta {
  string id = 1;
  optional string textDelta = 2;
  bool isComplete = 3;
}

message NextStepsDelta {
  optional string contentDelta = 1;
  optional NextStepsOptionDelta optionDelta = 2;
  bool isComplete = 3;
}

message EpicArtifactsDelta {
  optional EpicSpecDelta specDelta = 1;
  optional EpicTicketDelta ticketDelta = 2;
  optional NextStepsDelta nextStepsDelta = 3;
}

message StreamEpicChatDelta {
  EpicConversationIdentifier epicConversationIdentifier = 1;
  optional Question question = 2;
  optional EpicArtifactsDelta artifactsDelta = 3;
  optional string deprecatedPreMessageDelta = 4 [deprecated = true];
  optional string deprecatedPostMessageDelta = 5 [deprecated = true];
  optional NextStepsDelta nextStepsDelta = 6;
  optional string markdownDelta = 7;
}

message StreamPhaseChatDelta {
  PhaseConversationIdentifier phaseConversationIdentifier = 1;
  optional Question question = 2;
  optional Phase phase = 3;
  optional string preMessageDelta = 4;
  optional string postMessageDelta = 5;
  optional string explanationTextDelta = 6;
  optional bool canProposePhases = 7;
}

// 标题 / 摘要同步 (非 delta 类)
message SyncFileSummary { Path path = 1; string summary = 2; }
message SyncPlanChatQueryType {
  PlanChatQueryType queryType = 1;
  TaskPlanChatIdentifier taskPlanChatIdentifier = 2;
}
message SyncExecutionPlanChatQueryType {
  PlanChatQueryType queryType = 1;
  ExecutionPlanChatIdentifier executionPlanChatIdentifier = 2;
}
message SyncPayToRunStatus { reserved 2; ArtifactIdentifier artifactIdentifier = 1; }
message SyncTaskChainTitle { string taskChainID = 1; string title = 2; }
message SyncEpicTitle { EpicIdentifier epicIdentifier = 1; string title = 2; }
message SyncEpicChatTitle { EpicChatIdentifier epicChatIdentifier = 1; string title = 2; }
message SyncExecutionTitle { EpicExecutionIdentifier executionIdentifier = 1; string title = 2; }
message SyncTaskTitle { string title = 1; TaskIdentifier taskIdentifier = 2; }
message SyncTaskSummary {
  repeated AttachmentSummary attachmentSummaries = 1;
  TaskPlanIdentifier taskPlanIdentifier = 2;
  string planSummary = 3;
}
message SyncRateLimitUsageRequest {
  RateLimitInformation rateLimitInfo = 1;
  AccountContext accountContext = 2;
}
```

### B.5 Identifier 体系

```proto
message PhaseBreakdownIdentifier {
  string taskChainID = 1;
  string phaseBreakdownID = 2;
}

message PhaseConversationIdentifier {
  PhaseBreakdownIdentifier phaseBreakdownIdentifier = 1;
  string conversationID = 2;
}

message TaskPlanIdentifier {
  PhaseBreakdownIdentifier phaseBreakdownIdentifier = 1;
  string taskID = 2;
  string planID = 3;
}

message TaskPlanChatIdentifier {
  TaskPlanIdentifier taskPlanIdentifier = 1;
  string newPlanID = 2;
}

message TaskVerificationIdentifier {
  PhaseBreakdownIdentifier phaseBreakdownIdentifier = 1;
  string taskID = 2;
  string verificationID = 3;
}

message TaskIdentifier {
  PhaseBreakdownIdentifier phaseBreakdownIdentifier = 1;
  string taskID = 2;
}

message EpicIdentifier { string epicId = 1; }

message EpicChatIdentifier {
  EpicIdentifier epicIdentifier = 1;
  string chatId = 2;
}

message EpicConversationIdentifier {
  EpicIdentifier deprecatedEpicIdentifier = 1 [deprecated = true];
  string conversationId = 2;
  EpicChatIdentifier epicChatIdentifier = 3;
}

message WorkflowIdentifier { string workflowId = 1; }
message WorkflowCommandIdentifier {
  WorkflowIdentifier workflowIdentifier = 1;
  string name = 2;
}

message SpecIdentifier {
  EpicIdentifier epicIdentifier = 1;
  string specId = 2;
}

message TicketIdentifier {
  EpicIdentifier epicIdentifier = 1;
  string ticketId = 2;
}

// epic-execution-identifier.proto
message EpicExecutionIdentifier {
  string epicId = 1;
  string executionId = 2;
}

message ExecutionPlanIdentifier {
  EpicExecutionIdentifier executionIdentifier = 1;
  string planID = 2;
}

message ExecutionPlanChatIdentifier {
  ExecutionPlanIdentifier executionPlanIdentifier = 1;
  string newPlanID = 2;
}

message ExecutionVerificationIdentifier {
  EpicExecutionIdentifier executionIdentifier = 1;
  string verificationID = 2;
}

// 统一封装
message ArtifactIdentifier {
  oneof identifier {
    TaskPlanIdentifier taskPlanIdentifier = 1;
    PhaseConversationIdentifier phaseConversationIdentifier = 2;
    TaskVerificationIdentifier taskVerificationIdentifier = 3;
    TaskPlanChatIdentifier taskPlanChatIdentifier = 4;
    TaskIdentifier taskIdentifier = 5;
    EpicConversationIdentifier epicConversationIdentifier = 6;
    SpecIdentifier specIdentifier = 7;
    TicketIdentifier ticketIdentifier = 8;
    WorkflowIdentifier workflowIdentifier = 9;
    ExecutionPlanIdentifier executionPlanIdentifier = 10;
    ExecutionVerificationIdentifier executionVerificationIdentifier = 11;
    ExecutionPlanChatIdentifier executionPlanChatIdentifier = 12;
    EpicExecutionIdentifier epicExecutionIdentifier = 13;
  }
}

message EpicArtifactIdentifier {
  oneof identifier {
    SpecIdentifier specIdentifier = 1;
    TicketIdentifier ticketIdentifier = 2;
  }
}
```

### B.6 Epic / Spec / Ticket / Execution / Plan / Verification

```proto
// ----- Spec -----
message Spec {
  SpecIdentifier identifier = 1;
  string title = 2;
  string content = 3;
  int64 createdAt = 4;
  int64 updatedAt = 5;
  bool createdManually = 6;
  repeated ArtifactCommentThread comment_threads = 7;
}
message SpecSummary {
  string id = 1;
  string title = 2;
  int64 createdAt = 3;
  int64 updatedAt = 4;
  bool createdManually = 5;
}

// ----- Ticket -----
message Ticket {
  TicketIdentifier identifier = 1;
  string title = 2;
  string description = 3;
  string assignee = 4;
  TicketStatus status = 5;
  int64 createdAt = 6;
  int64 updatedAt = 7;
  bool createdManually = 8;
  repeated ArtifactCommentThread comment_threads = 9;
}
message TicketSummary {
  string id = 1;
  string title = 2;
  TicketStatus status = 3;
  string assignee = 4;
  int64 createdAt = 5;
  int64 updatedAt = 6;
  bool createdManually = 7;
}

// ----- Comments on Spec/Ticket -----
message ArtifactCommentEntry {
  string author = 1;
  string rendered_content = 2;
  int64 created_at = 3;
  optional int64 updated_at = 4;
}
message ArtifactCommentThread {
  string thread_id = 1;
  bool resolved = 2;
  string quoted_text = 3;
  repeated ArtifactCommentEntry comments = 4;
}

// ----- EpicSummary (for attachments) -----
message EpicSummary {
  string id = 1;
  string title = 2;
  int64 createdAt = 3;
  int64 updatedAt = 4;
  repeated SpecSummary specs = 5;
  repeated TicketSummary tickets = 6;
}

// ----- EpicExecution -----
message EpicExecutionSteps {
  StepState userQuery = 1;
  StepState planGeneration = 2;
  StepState verification = 3;
  StepState commit = 4;
}
message ExecutionCommitMetadata {
  string commitHash = 1;
  string commitMessage = 2;
  optional string commitError = 3;
  string commitScriptPath = 4;
  string workspacePath = 5;
}
message EpicExecution {
  EpicExecutionIdentifier executionIdentifier = 1;
  ExecutionPlanWithUserPrompt activePlan = 2;
  string title = 3;
  EpicExecutionSteps steps = 4;
  repeated ExecutionPlanWithUserPrompt parentPlans = 5;
  repeated AttachmentSummary attachmentSummaries = 6;
  repeated VerificationThread verificationThreads = 7;
  ExecutionCommitMetadata gitCommitMetadata = 8;
}
message ExecutionSummary {
  string id = 1;
  string title = 2;
  EpicExecutionSteps steps = 3;
  int64 createdAt = 4;
  int64 updatedAt = 5;
}

// ----- Plan -----
message ImplementationPlan {
  string output = 1;
  optional string aiGeneratedSummary = 2;
}
message AllPlan {
  oneof planType {
    ImplementationPlan implementationPlan = 1;
    ReviewOutput reviewOutput = 2;
  }
}
message TaskPlanWithUserPrompt {
  AllPlan plan = 1;
  UserPrompt userPrompt = 2;
  TaskPlanIdentifier taskPlanIdentifier = 3;
}
message ExecutionPlanWithUserPrompt {
  AllPlan plan = 1;
  UserPrompt userPrompt = 2;
  ExecutionPlanIdentifier executionPlanIdentifier = 3;
}

// ----- Plan Requests / Responses -----
message PlanGenerationRequest {
  TaskPlanIdentifier taskPlanIdentifier = 1;
  UserPrompt userPrompt = 2;
  repeated Task allTasks = 3;
  repeated WorkspaceRepoMapping workspaceRepoMappings = 4;
  string taskTitle = 5;
  string taskChainTitle = 6;
  repeated PhaseConversation deprecatedPhaseConversation = 7 [deprecated = true];
  PlanArtifactType planArtifactType = 8;
  repeated PhaseBreakdown phaseBreakdownsTillCurrent = 9;
}
message PlanChatRoot {
  TaskPlanWithUserPrompt planWithUserPrompt = 1;
  EncryptedLLMInput llmInput = 2;
  PlanArtifactType planArtifactType = 3;
}
message PlanChatRequest {
  PlanChatRoot root = 1;
  UserPrompt userPrompt = 2;
  repeated Task previousTasks = 3;
  TaskPlanChatIdentifier taskPlanChatIdentifier = 4;
  int32 priorPlanChatIterationCount = 5;
  repeated WorkspaceRepoMapping workspaceRepoMappings = 6;
}
message PlanGenerationResponse {
  reserved 2;
  AllPlan plan = 1;
  EncryptedLLMInput llmInput = 3;
}
message PlanChatResponse {
  reserved 4;
  AllPlan plan = 1;
  EncryptedLLMInput llmInput = 2;
  PlanChatQueryType queryType = 3;
}

// ----- Execution-Plan (Epic 内嵌) -----
message ExecutionPlanGenerationRequest {
  ExecutionPlanIdentifier executionPlanIdentifier = 1;
  UserPrompt userPrompt = 2;
  string executionTitle = 3;
  PlanArtifactType planArtifactType = 4;
  repeated WorkspaceRepoMapping workspaceRepoMappings = 5;
  string epicTitle = 6;
}
message ExecutionPlanGenerationResponse {
  reserved 3;
  AllPlan plan = 1;
  EncryptedLLMInput llmInput = 2;
}
message ExecutionPlanChatRoot {
  ExecutionPlanWithUserPrompt planWithUserPrompt = 1;
  EncryptedLLMInput llmInput = 2;
  PlanArtifactType planArtifactType = 3;
}
message ExecutionPlanChatRequest {
  ExecutionPlanChatRoot root = 1;
  UserPrompt userPrompt = 2;
  ExecutionPlanChatIdentifier executionPlanChatIdentifier = 4;
  int32 priorExecutionPlanChatIterationCount = 5;
  repeated WorkspaceRepoMapping workspaceRepoMappings = 6;
}
message ExecutionPlanChatResponse {
  reserved 4;
  AllPlan plan = 1;
  EncryptedLLMInput llmInput = 2;
  PlanChatQueryType queryType = 3;
}

// ----- Verification -----
message VerificationComment {
  string title = 1;
  string description = 2;
  string promptForAIAgent = 3;
  repeated Path referredFiles = 4;
  Severity severity = 5;
  bool isApplied = 6;
}
message VerificationThread {
  string id = 1;
  repeated VerificationComment comments = 2;
  VerificationThreadStatus status = 3;
}
message VerificationOutput {
  string markdown = 1;
  repeated VerificationComment comments = 2;
}
message VerificationRequestRoot {
  TaskVerificationIdentifier taskVerificationIdentifier = 1;
  repeated Task allTasks = 2;
  repeated WorkspaceRepoMapping workspaceRepoMappings = 3;
  repeated VerificationComment discardedComments = 4;
}
message VerificationRequest { VerificationRequestRoot root = 1; }
message VerificationResponse { reserved 2; VerificationOutput output = 1; }
message ReVerificationRequest {
  VerificationRequestRoot root = 1;
  repeated VerificationThread verificationThreads = 2;
}
message ReVerificationResponse {
  string markdown = 1;
  repeated ReVerificationUpdate updates = 2;
}
message ReVerificationUpdate {
  string verificationThreadID = 1;
  oneof reply {
    VerificationComment newComment = 2;
    VerificationThreadStatus statusUpdate = 3;
  }
}

// ----- Execution-Verification -----
message ExecutionVerificationRequestRoot {
  ExecutionVerificationIdentifier executionVerificationIdentifier = 1;
  repeated WorkspaceRepoMapping workspaceRepoMappings = 2;
  repeated VerificationComment discardedComments = 3;
  EpicExecution execution = 4;
}
message ExecutionVerificationRequest { ExecutionVerificationRequestRoot root = 1; }
message ExecutionVerificationResponse {
  reserved 3;
  VerificationOutput output = 1;
  EncryptedLLMInput llmInput = 2;
}
message ExecutionReVerificationRequest {
  ExecutionVerificationRequestRoot root = 1;
  repeated VerificationThread verificationThreads = 2;
}
message ExecutionReVerificationResponse {
  repeated ReVerificationUpdate updates = 1;
  string markdown = 2;
  EncryptedLLMInput llmInput = 3;
}

// ----- Review -----
message ReviewOutput {
  string markdown = 1;
  string howDidIGetHere = 2;
  string mermaid = 3;
  repeated ReviewComment comments = 4;
  optional string aiGeneratedSummary = 5;
}
message ReviewComment {
  string statement = 1;
  string explanation = 2;
  string promptForAIAgent = 3;
  repeated Path relevantFiles = 4;
  Category category = 5;
  bool isApplied = 6;
  string id = 7;
}

// ----- Task / Phase -----
message Task {
  string taskID = 1;
  TaskPlanWithUserPrompt activePlan = 2;
  string title = 3;
  TaskState state = 4;
  repeated TaskPlanWithUserPrompt parentPlans = 5;
  repeated AttachmentSummary attachmentSummaries = 6;
}
message Phase {
  string id = 1;
  string title = 2;
  string query = 3;
  repeated Path referredFiles = 4;
  repeated Path referredFolders = 5;
  PhaseStatus status = 6;
  string reasoning = 7;
  PhaseSize phaseSize = 8;
  PlanArtifactType planArtifactType = 9;
}
message PhaseOutput {
  repeated Phase phases = 1;
  string reasoning = 2;
}
message LivePhase { Phase phase = 1; TaskSteps taskSteps = 2; }
message TaskSteps {
  StepState userQuery = 1;
  StepState planGeneration = 2;
  StepState verification = 3;
  StepState commit = 4;
}
message PhaseBreakdownContext {
  repeated FileContent files = 1;
  repeated Directory directories = 2;
  repeated FileContent detectedRuleFiles = 3;
}
message PhaseBreakdown {
  repeated LivePhase livePhases = 1;
  PhaseBreakdownContext phaseBreakdownContext = 2;
  repeated PhaseConversation phaseBreakdownConversation = 3;
  string phaseBreakdownID = 4;
}
message PhaseConversation {
  UserPrompt userPrompt = 1;
  PhaseBreakdownResponse deprecatedOutput = 2 [deprecated = true];
  PhaseBreakdownOutput phaseBreakdownOutput = 3;
}
message ExplanationOutput {
  string text = 1;
  bool canProposePhases = 2;
}
message PhaseBreakdownOutput {
  string markdown = 1 [deprecated = true];
  oneof output {
    ExplanationOutput explanationOutput = 2;
    InterviewOutput interviewOutput = 3;
    PhaseOutput phaseOutput = 4;
  }
  string preMarkdown = 5;
  string postMarkdown = 6;
}
message PhaseBreakdownResponse {
  reserved 3;
  PhaseBreakdownOutput output = 1;
  EncryptedLLMInput llmInput = 2;
}
message PhaseBreakdownRequestCommon {
  PhaseConversationIdentifier phaseConversationIdentifier = 1;
  UserPrompt userPrompt = 2;
  repeated WorkspaceRepoMapping workspaceRepoMappings = 3;
  repeated PhaseConversation currentPhaseBreakdownConversation = 4;
  string taskChainTitle = 5;
}
message PhaseGenerationRequest {
  PhaseBreakdownRequestCommon commonRequest = 1;
  optional EncryptedLLMInput llmInput = 2;
}
message PhaseIterationRequest {
  PhaseBreakdownRequestCommon commonRequest = 1;
  EncryptedLLMInput llmInput = 2;
  repeated PhaseBreakdown previousPhaseBreakdowns = 3;
}
```

### B.7 ResponseField (oneof: markdown / interview / artifact / next-steps / ...)

`EpicResponseField` 是 Epic 流式响应的多态单元；`EpicConversationResponseField` 是它的"压缩版"（用于持久化，artifact 用 ID 引用而不是完整对象）。

```proto
message EpicResponseField {
  oneof content_type {
    string markdown = 1;                                    // User-facing text content
    InterviewOutput interview = 2;                          // Interview questions
    SpecsGroup specsGroup = 3;                              // Specs group (full objects)
    TicketsGroup ticketsGroup = 4;                          // Tickets group (full objects)
    NextSteps nextSteps = 5;                                // Next steps suggestions
    ExecutionRequestsGroup executionRequestsGroup = 6;      // Execution requests
  }
}

message EpicConversationResponseField {
  oneof content_type {
    string markdown = 1;
    InterviewOutput interview = 2;
    SpecArtifactsGroup specArtifactsGroup = 3;
    TicketArtifactsGroup ticketArtifactsGroup = 4;
    NextSteps nextSteps = 5;
    ExecutionArtifactsGroup executionArtifactsGroup = 6;
  }
}

message EpicOutput {
  InterviewOutput deprecatedInterviewOutput = 1 [deprecated = true];
  EpicArtifactsOutput deprecatedArtifactsOutput = 2 [deprecated = true];
  EpicOutputCommon deprecatedCommon = 3 [deprecated = true];
  repeated EpicResponseField orderedFields = 4;
}

message EpicConversationOutput {
  InterviewOutput deprecatedInterviewOutput = 1 [deprecated = true];
  EpicConversationArtifactsOutput deprecatedArtifactsOutput = 2 [deprecated = true];
  EpicOutputCommon deprecatedCommon = 3 [deprecated = true];
  repeated EpicConversationResponseField orderedFields = 4;
}

message EpicOutputCommon {
  optional string preMarkdown = 1;
  optional string postMarkdown = 2;
  repeated NextSteps nextSteps = 3;
}

message EpicArtifactsOutput {
  repeated Ticket tickets = 1;
  repeated Spec specs = 2;
}

message ExecutionRequestsGroup {
  repeated HandoffRequest handoffRequests = 1;
  repeated ResumeExecutionRequest resumeExecutionRequests = 2;
}

message SpecsGroup { repeated Spec specs = 1; }
message TicketsGroup { repeated Ticket tickets = 1; }

message SpecArtifactOutput { SpecIdentifier specIdentifier = 1; ArtifactOperation operation = 2; }
message TicketArtifactOutput { TicketIdentifier ticketIdentifier = 1; ArtifactOperation operation = 2; }
message ExecutionArtifactOutput {
  EpicExecutionIdentifier executionIdentifier = 1;
  ExecutionOperation operation = 2;
  string toolCallId = 3;
}
message SpecArtifactsGroup { repeated SpecArtifactOutput specArtifactOutputs = 1; }
message TicketArtifactsGroup { repeated TicketArtifactOutput ticketArtifactOutputs = 1; }
message ExecutionArtifactsGroup { repeated ExecutionArtifactOutput executionArtifactOutputs = 1; }
message ExecutionIdentifiers { repeated EpicExecutionIdentifier epicExecutionIdentifiers = 1; }

message EpicConversationArtifactsOutput {
  repeated SpecArtifactOutput specArtifactOutputs = 1;
  repeated TicketArtifactOutput ticketArtifactOutputs = 2;
  repeated ExecutionArtifactOutput executionArtifactOutputs = 3;
}

// 单步 NextSteps / Interview
message NextStepsOption { string id = 1; string text = 2; }
message NextSteps {
  string contentOutput = 1;
  repeated NextStepsOption options = 2;
}
message Question {
  string id = 1;
  string title = 2;
  string description = 3;
  repeated string options = 4;
  bool multiselect = 5;
}
message InterviewOutput { repeated Question questions = 1; }

// Epic Execution Handoff
message HandoffRequest {
  reserved 4, 7;
  string toolCallId = 1;
  string query = 2;
  string title = 3;
  PlanArtifactType planArtifactType = 5;
  EpicExecutionIdentifier executionIdentifier = 6;
}
message ResumeExecutionRequest {
  reserved 3;
  EpicExecutionIdentifier executionIdentifier = 1;
  string toolCallId = 2;
}
message ExecutionError { string errorType = 1; string message = 2; }
message ExecutionResult {
  string toolCallId = 1;
  EpicExecution execution = 2;
  ExecutionError executionError = 3;
}

// EpicChat / EpicConversation
message EpicChatRequest {
  EpicConversationIdentifier epicConversationIdentifier = 1;
  UserPrompt userPrompt = 2;
  Workflow workflow = 3;
  repeated EpicConversation previousConversations = 4;
  EncryptedLLMInput llmInput = 5;
  repeated WorkspaceRepoMapping workspaceRepoMappings = 6;
  string epicTitle = 7;
  EpicChatsContext epicChatsContext = 8;
}
message EpicChatResponse {
  reserved 4;
  EpicConversationIdentifier epicConversationIdentifier = 1;
  EpicOutput output = 2;
  EncryptedLLMInput llmInput = 3;
  bool wasMultiChat = 5;
}
message ContinueEpicChatRequest {
  EpicConversationIdentifier epicConversationIdentifier = 1;
  EncryptedLLMInput llmInput = 2;
  repeated ExecutionResult executionResults = 3;
  repeated WorkspaceRepoMapping workspaceRepoMappings = 4;
}
message EpicConversation {
  reserved 4;
  EpicConversationIdentifier epicConversationIdentifier = 1;
  UserPrompt userPrompt = 2;
  EpicConversationOutput output = 3;
  int64 creationTime = 5;
  int64 lastUpdatedTime = 6;
  WorkflowIdentifier workflowIdentifier = 7;
  bool wasMultiChat = 8;
}
message EpicChatReference {
  EpicChatIdentifier epicChatIdentifier = 1;
  string chatTitle = 2;
  Path transcriptPath = 3;
  int32 conversationCount = 4;
}
message EpicChatsContext {
  Path transcriptsDir = 1;
  repeated EpicChatReference chats = 2;
}
```

### B.8 ModelProfile / ModelSelection

```proto
enum ModelProfileType {
  MODEL_PROFILE_BALANCED = 0;
  MODEL_PROFILE_FRONTIER = 1;
  MODEL_PROFILE_ECO = 2;
}

message ModelDescriptorMessage {
  string id = 1;
  string name = 2;
  string creator = 3;
  bool isThinking = 4;
  string reasoningId = 5;
  string reasoningLabel = 6;
  ModelDeprecationMessage deprecation = 7;
}
message ModelDeprecationMessage {
  DateMessage deprecationDate = 1;
  string alternateModelId = 2;
  bool isDeprecated = 3;
  string docsLink = 4;
}
message DateMessage { int32 year = 1; int32 month = 2; int32 day = 3; }

message ModelProfileMessage {
  ModelProfileType type = 1;
  string name = 2;
  string description = 3;
  ModelProfileStepOverrides defaultStepOverrides = 4;
}

message ModelProfileStepOverrides {
  optional string planGeneration = 1;
  optional string planIteration = 2;
  optional string review = 3;
  optional string reviewIteration = 4;
  optional string verification = 5;
  optional string reVerification = 6;
  optional string epicPlanning = 7;
  optional string epicReview = 8;
  optional string phaseCreation = 9;
  optional string phaseIteration = 10;
  optional string orchestration = 11;
}

message ModelProfile {
  ModelProfileType type = 1;
  ModelProfileStepOverrides stepOverrides = 2;
}

message ModelSelection {
  oneof selection {
    ModelProfile profile = 1;
    string modelDescriptorId = 2;
  }
}

message GetAvailableModelsRequest {}
message GetAvailableModelsResponse {
  repeated ModelDescriptorMessage models = 1;
  repeated ModelProfileMessage profiles = 2;
}
```

### B.9 Workflow（step / edge / condition schema）

Traycer 的 workflow **不是** 显式 step + edge graph，而是「entry command + 子命令引用」的扁平 + nextSteps 链：

```proto
message WorkflowCommandInfo {
  WorkflowCommandIdentifier workflowCommandIdentifier = 1;
  string description = 2;
  repeated string argumentHints = 3;
  string content = 4;                    // 真正的 prompt body
  AgentSelectionType selectedAgent = 5;  // 该 step 用哪种 Agent (PLANNER/REVIEWER)
}

message WorkflowCommand {
  WorkflowCommandInfo workflowCommandInfo = 1;
  repeated WorkflowCommandInfo nextSteps = 2;  // edge: 当前 step 完成后，可指向的下一批 step
                                               // (用 WorkflowCommandInfo 而非完整 WorkflowCommand 避免循环引用)
}

message Workflow {
  WorkflowIdentifier workflowIdentifier = 1;
  string name = 2;
  string description = 3;
  WorkflowCommand entrypointCommand = 4;
  repeated WorkflowCommand commands = 5;
  int64 createdAt = 6;
  int64 updatedAt = 7;
}

message ListWorkflowCommandsRequest {
  WorkflowIdentifier workflowIdentifier = 1;
}
message ListWorkflowCommandsResponse {
  WorkflowCommand entrypointCommand = 1;
  repeated WorkflowCommand commands = 2;
}

enum AgentSelectionType {
  PLANNER = 0;
  REVIEWER = 1;
}
```

> **没有显式 condition / branch 字段**。分支建模手段：
> - `nextSteps` 列出下一批可走的 command（多选 = 用户自由选择）
> - `argumentHints` 提示用户填写参数
> - `selectedAgent` 决定本 step 走 PLANNER 还是 REVIEWER

### B.10 YOLO 三件套

```proto
message PlanYOLOConfig {
  bool skipPlan = 1;
  Path planPromptTemplatePath = 2;
  int32 executionTimeoutMinutes = 3;
  string executionAgent = 4;
}

message ReviewYOLOConfig {
  Path reviewPromptTemplatePath = 1;
  int32 executionTimeoutMinutes = 2;
  string executionAgent = 3;
  repeated Category reviewCategories = 4;
}

message VerificationYOLOConfig {
  bool disableVerification = 1;
  repeated Severity verificationSeverityLevels = 2;
  Path verificationPromptTemplatePath = 3;
  int32 executionTimeoutMinutes = 4;
  string executionAgent = 5;
  int32 maxRetries = 6;
}

message CommitSettings {
  bool autoCommit = 1;
  Path commitScriptPath = 2;
}

message ExecutionAgent { Path path = 1; string name = 2; }
message PromptTemplate { Path path = 1; string name = 2; PromptTemplateType type = 3; }
message CommitScript { Path path = 1; string displayName = 2; }

enum PromptTemplateType {
  PROMPT_TEMPLATE_TYPE_PLAN = 0;
  PROMPT_TEMPLATE_TYPE_VERIFICATION = 1;
  PROMPT_TEMPLATE_TYPE_REVIEW = 2;
  PROMPT_TEMPLATE_TYPE_GENERIC = 3;
  PROMPT_TEMPLATE_TYPE_USER_QUERY = 4;
}
```

### B.11 LLM Input / Encryption / UserPrompt / Attachments

```proto
message LLMInput {
  repeated UserMessage userMessages = 1;
  optional string model = 2;
  optional string reasoning_effort = 3;
  optional bool is_thinking = 4;
}
message UserMessage {
  string content = 1;
  optional AssistantMessage assistantMessage = 2;
  repeated Attachment attachments = 3;
}
message AssistantMessage {
  string content = 1;
  repeated ToolCall toolCalls = 2;
  repeated ToolCallReply toolCallReplies = 3;
}
message ToolCall {
  string id = 1;
  ToolFunc function = 2;
  optional string gemini_thought_signature = 3;
}
message ToolFunc { string name = 1; string arguments = 2; }
message ToolCallReply { string content = 1; string id = 2; }
message ContextUsage {
  int32 usedContextTokens = 1;
  int32 totalContextWindowTokens = 2;
}
message EncryptedLLMInput {
  bytes data = 1;
  int32 version = 2;
  ContextUsage contextUsage = 3;
}

message UserAttachedContext {
  repeated FileContent files = 1;
  repeated Directory directories = 2;
  repeated FileContent detectedRuleFiles = 3;
  optional TicketReferenceByName ticketReference = 4;
  repeated Attachment attachments = 5;
  repeated GitDiff gitDiffs = 6;
  repeated EpicSummary attachedEpics = 7;
  repeated Spec attachedSpecs = 8;
  repeated Ticket attachedTickets = 9;
  WorkflowCommand attachedWorkflowCommand = 10;
  repeated EpicChatReference attachedEpicChats = 11;
}

message UserPrompt {
  string query = 1;
  UserAttachedContext context = 2;
}

message AttachmentSummary { oneof attachmentSummary { FileAttachmentSummary fileAttachmentSummary = 1; } }
message FileAttachmentSummary { string fileName = 1; string summary = 2; }
message FileAttachment { string b64content = 1; string fileName = 2; }
message Attachment { oneof attachment { FileAttachment file = 1; } }

message AccountContext {
  string id = 1;
  AccountContextType type = 2;
}
message MCPParent {
  string id = 1;
  string providerHandle = 2;
  MCPParentType type = 3;
}
```

### B.12 文件系统 / Git / Path / Diagnostic / Workspace

```proto
message Path { string absolutePath = 1; bool isDirectory = 2; }
message Range { int32 startLine = 1; int32 count = 2; }
message FileContent {
  Path path = 1;
  string content = 2;
  Range range = 3;
  optional string summary = 4;
  repeated FileDiagnostic diagnostics = 5;
}
message FileDiagnosticsWithPath {
  Path path = 1;
  repeated FileDiagnostic diagnostics = 2;
}
message FileDiagnosticCode { string value = 1; optional string target_uri = 2; }
message FileDiagnosticInfo { string message = 1; FileDiagnosticInfoLocation location = 2; }
message FileDiagnosticInfoLocation { Range range = 1; Path path = 2; }
message FileDiagnostic {
  Range range = 1;
  string message = 2;
  string severity = 3;
  repeated FileDiagnosticInfo info = 4;
  repeated string tags = 5;
  optional FileDiagnosticCode code = 6;
  optional string source = 7;
}
message Directory {
  Path path = 1;
  repeated Path filePaths = 2;
  repeated Directory subDirectories = 3;
}
message WorkspaceSubDirectoryList { repeated WorkspaceSubDirectory subDirectories = 1; }
message FilePathList { repeated Path filePaths = 1; }
message WorkspaceSubDirectory {
  Path path = 1;
  oneof file_representation {
    FilePathList filePaths = 2;
    int32 fileCount = 3;
  }
  oneof directory_representation {
    WorkspaceSubDirectoryList subDirectoryList = 4;
    int32 subDirectoryCount = 5;
  }
}
message WorkspaceRepoMapping {
  Path workspacePath = 1;
  repeated Path files = 2;
  repeated WorkspaceSubDirectory directories = 3;
  repeated FileContent detectedRuleFiles = 4;
}

// Git
message GitFileDelta {
  Path currentPath = 1;
  string currentFileContent = 2;
  optional string previousFileContent = 3;
  optional Path previousPath = 4;
  string diff = 5;
  GitStatus gitStatus = 6;
}
message GitFileDeltaSummary {
  Path currentPath = 1;
  optional Path previousPath = 2;
  GitStatus gitStatus = 3;
  string stat = 4;
}
message GitFileDeltaList { repeated GitFileDelta fileDeltas = 1; }
message GitFileDeltaSummaryList { repeated GitFileDeltaSummary fileDeltaSummaries = 1; }
message GitFileDeltas {
  oneof fileDeltas {
    GitFileDeltaList fullDeltas = 1;
    GitFileDeltaSummaryList fileDeltaSummaries = 2;
  }
}
message GitDiffAgainstUncommitted {
  repeated GitFileDelta deprecatedFileDeltas = 1 [deprecated = true];
  GitFileDeltas fileDeltas = 2;
}
message GitDiffAgainstRevision {
  string revisionSpec = 1;
  repeated GitFileDelta deprecatedFileDeltas = 2 [deprecated = true];
  GitFileDeltas fileDeltas = 3;
}
message GitDiff {
  oneof diffType {
    GitDiffAgainstUncommitted gitDiffAgainstUncommitted = 3;
    GitDiffAgainstRevision gitDiffAgainstRevision = 4;
  }
}
message GitCommit { string hash = 1; string message = 2; string author = 3; string date = 4; }
message GitInfo {
  string currentBranch = 1;
  string currentCommitHash = 2;
  repeated string recentBranches = 3;
  repeated GitCommit recentCommits = 4;
}
```

### B.13 Ticket Assist (GitHub/Jira persisted ticket)

```proto
message FetchPersistedTicketRequest { TicketReferenceByID ticketReference = 1; }
message FetchPersistedTicketResponse { PersistedTicket ticket = 1; }
message ImportPersistedTicketRequest {
  string ticketID = 1;
  oneof reference {
    GitHubTicketReferenceByID github = 2;
  }
}
message ImportPersistedTicketResponse {
  PersistedTicket ticket = 1;
  oneof ticketReference {
    GitHubTicketReferenceByName github = 2;
  }
}
message PersistTicketRequest {
  TicketReferenceByID ticketReference = 1;
  PersistedTicketPlan plan = 2;
}
message PersistTicketResponse {
  PersistedTicket ticket = 1;
  TicketReferenceByName ticketReference = 2;
}
message CompareTicketLLMInputRequest {
  TicketLLMInput previousTicketLLMInput = 1;
  AllPlan previousPlan = 2;
  TicketLLMInput latestTicketLLMInput = 3;
}
message CompareTicketLLMInputResponse {
  bool isReworkNeeded = 1;
  string explanation = 2;
}
message GenerateTicketLLMInputRequest { TicketReferenceByName ticketReference = 1; }
message GenerateTicketLLMInputResponse { TicketLLMInput ticketLLMInput = 1; }

message TicketUser {
  string id = 1;
  string name = 2;
  string email = 3;
  string username = 4;
  string avatarUrl = 5;
  TicketUserType type = 6;
}
message TicketComment {
  string body = 1;
  TicketUser user = 2;
  string createdAt = 3;
  string updatedAt = 4;
  string id = 5;
}
message PersistedTicketPlan {
  string planId = 1;
  repeated Thinking thinkings = 2;
  AllPlan plan = 3;
  TicketLLMInput ticketInput = 4;
  string commitHash = 5;
  string targetBranch = 6;
  int32 version = 7;
}
message PersistedTicket {
  repeated PersistedTicketPlan plans = 1;
  string ticketId = 2;
}
message CommonTicket {
  string id = 1;
  string title = 2;
  string description = 3;
  repeated TicketUser assignee = 4;
  TicketUser creator = 5;
  string status = 6;
  int64 createdAt = 7;
  int64 updatedAt = 8;
  string url = 9;
  repeated TicketComment comments = 10;
  optional PersistedTicket persistedTicket = 11;
  repeated Attachment attachments = 12;
}
message TicketLLMInput {
  string title = 1;
  string description = 2;
  repeated TicketUser assignees = 3;
  TicketUser creator = 4;
  repeated TicketComment comments = 5;
  repeated string labels = 6;
  string ticketReference = 7;
  repeated Attachment attachments = 8;
}
message GitHubLabel { string id = 1; string name = 2; }
message GitHubTicket {
  CommonTicket common = 1;
  GitHubOrganization organization = 2;
  GitHubRepository repository = 3;
  repeated GitHubLabel labels = 4;
}
message GitHubOrganization { string login = 1; string id = 2; }
message GitHubRepository { string name = 1; string id = 2; }
message GitHubTicketReferenceByID {
  oneof ownerId { string organizationID = 1; string userID = 4; }
  string repositoryID = 2;
  optional string issueNumber = 3;
}
message GitHubTicketReferenceByName {
  oneof ownerLogin { string organizationLogin = 1; string userLogin = 4; }
  string repositoryName = 2;
  string issueNumber = 3;
}
message TicketReferenceByID { oneof reference { GitHubTicketReferenceByID github = 1; } }
message TicketReferenceByName { oneof reference { GitHubTicketReferenceByName github = 1; } }
```

### B.14 Cloud-Data Persistence（多人协作云端存储）

```proto
message CloudDataTaskRef { string taskId = 1; TaskType taskType = 2; }
message CloudDataPermission {
  PermissionRole role = 1;
  AccessType accessType = 2;
  optional string userId = 3;
  optional string organizationId = 4;
  string grantedBy = 5;
  int64 grantedAt = 6;
}
message TiptapCollabToken { string token = 1; int64 expiresAtMs = 2; }
message TiptapRoomInfo { string roomId = 1; string webSocketUrl = 2; TiptapCollabToken token = 3; }
message GetCollabTokenRequest { string roomId = 1; }
message GetCollabTokenResponse { TiptapCollabToken token = 1; }
message GetNotificationTokenRequest {}
message GetNotificationTokenResponse { TiptapCollabToken token = 1; string webSocketUrl = 2; }
message CloudDataBatchDeleteRequest { repeated string ids = 1; }
message CloudDataBatchDeleteItemResult {
  string taskId = 1;
  bool success = 2;
  optional string errorMessage = 3;
}
message CloudDataBatchDeleteResponse { repeated CloudDataBatchDeleteItemResult results = 1; }

// Collaborator
message CollaboratorProfile {
  string display_name = 1;
  string avatar_url = 2;
  string email = 3;
  string handle = 4;
}
message UserCollaborator { string user_id = 1; CollaboratorProfile profile = 2; }
message OrgCollaborator {
  string organization_id = 1;
  string organization_name = 2;
  repeated UserCollaborator org_members = 3;
}
message CollaboratorEntry {
  PermissionRole role = 1;
  AccessType access_type = 2;
  int64 granted_at = 3;
  string granted_by = 4;
  oneof member {
    UserCollaborator user = 5;
    OrgCollaborator org = 6;
  }
}
message CollaboratorInviteEntry {
  string identifier = 1;
  IdentifierType identifier_type = 2;
  PermissionRole role = 3;
}
message UserInviteGrant { repeated CollaboratorInviteEntry entries = 1; }
message OrgShareGrant { string organization_id = 1; PermissionRole role = 2; }
message CloudDataGrantAccessRequest {
  CloudDataTaskRef task = 1;
  oneof grant {
    UserInviteGrant user_invite = 2;
    OrgShareGrant org_share = 3;
  }
}
message CloudDataListCollaboratorsRequest { CloudDataTaskRef task = 1; }
message CloudDataListCollaboratorsResponse {
  repeated CollaboratorEntry collaborators = 1;
  bool collaborators_available = 2;
}
message CollaboratorRoleChange {
  oneof target { string user_id = 1; string organization_id = 2; }
  PermissionRole new_role = 3;
}
message CloudDataBatchUpdateCollaboratorRolesRequest {
  CloudDataTaskRef task = 1;
  repeated CollaboratorRoleChange changes = 2;
}
message CloudDataRevokeCollaboratorRequest {
  CloudDataTaskRef task = 1;
  oneof target { string user_id = 2; string organization_id = 3; }
}
message CloudDataGenerateShareLinkRequest { CloudDataTaskRef task = 1; PermissionRole role = 2; }
message CloudDataGenerateShareLinkResponse { string share_token = 1; string share_url = 2; }
message CloudDataRevokeShareLinkRequest { CloudDataTaskRef task = 1; }
message CloudDataAccessViaShareLinkRequest { string share_token = 1; }
message CloudDataAccessViaShareLinkResponse {
  oneof resource {
    CloudDataEpicLightWithPermission epic = 1;
    CloudDataPhaseLightWithPermission phase = 2;
  }
}

// Epic
message CloudDataEpicLight {
  string id = 1; string title = 2; string initialUserPrompt = 3;
  int32 ticketCount = 4; int32 specCount = 5; string status = 6;
  google.protobuf.Timestamp createdAt = 7; google.protobuf.Timestamp updatedAt = 8;
  string createdBy = 9; string version = 10;
}
message CloudDataEpicLightDelta {
  string id = 1; optional string title = 2; optional int32 ticketCount = 3;
  optional int32 specCount = 4; optional string status = 5;
  google.protobuf.Timestamp updatedAt = 6; optional string initialUserPrompt = 7;
}
message CloudDataEpicLightWithPermission {
  CloudDataEpicLight light = 1; CloudDataPermission permission = 2;
  repeated CloudDataTaskRepoAssociation repos = 3;
  repeated CloudDataUserTaskWorkspace workspaces = 4;
  TiptapRoomInfo roomInfo = 5;
}
message CloudDataSpecLight {
  string id = 1; string epicId = 2; string title = 3;
  google.protobuf.Timestamp createdAt = 4; google.protobuf.Timestamp updatedAt = 5;
  string createdBy = 6;
}
message CloudDataSpecLightDelta {
  string id = 1; string epicId = 2; string title = 3;
  google.protobuf.Timestamp updatedAt = 4;
}
message CloudDataTicketLight {
  string id = 1; string epicId = 2; string title = 3;
  TicketStatus status = 4; string assignee = 5;
  google.protobuf.Timestamp createdAt = 6; google.protobuf.Timestamp updatedAt = 7;
  string createdBy = 8;
}
message CloudDataTicketLightDelta {
  string id = 1; string epicId = 2; optional string title = 3;
  optional TicketStatus status = 4; optional string assignee = 5;
  google.protobuf.Timestamp updatedAt = 6;
}
// Epic CRUD
message CloudDataCreateEpicRequest {
  CloudDataEpicLight epic = 1;
  repeated CloudDataTaskRepoIdentifier repoIdentifiers = 2;
  repeated CloudDataTaskWorkspaceIdentifier workspaces = 3;
}
message CloudDataCreateEpicResponse { TiptapRoomInfo roomInfo = 1; }
message CloudDataUpdateEpicRequest { CloudDataEpicLightDelta epicDelta = 1; }
message CloudDataUpdateEpicResponse { bool updated = 1; }
message CloudDataDeleteEpicRequest { string id = 1; }
message CloudDataDeleteEpicResponse { bool success = 1; }
// Spec CRUD
message CloudDataCreateSpecRequest { CloudDataSpecLight spec = 1; }
message CloudDataCreateSpecResponse { bool created = 1; }
message CloudDataUpdateSpecRequest { CloudDataSpecLightDelta specDelta = 1; }
message CloudDataUpdateSpecResponse { bool updated = 1; }
message CloudDataDeleteSpecRequest { string id = 1; }
message CloudDataDeleteSpecResponse { bool success = 1; }
message CloudDataListSpecsRequest {}
message CloudDataListSpecsResponse { repeated CloudDataSpecLight specs = 1; }
// Ticket CRUD
message CloudDataCreateTicketRequest { CloudDataTicketLight ticket = 1; }
message CloudDataCreateTicketResponse { bool created = 1; }
message CloudDataUpdateTicketRequest { CloudDataTicketLightDelta ticketDelta = 1; }
message CloudDataUpdateTicketResponse { bool updated = 1; }
message CloudDataListTicketsRequest {}
message CloudDataListTicketsResponse { repeated CloudDataTicketLight tickets = 1; }
message CloudDataDeleteTicketRequest { string id = 1; }
message CloudDataDeleteTicketResponse { bool success = 1; }
message CloudDataMigrateEpicRequest {
  CloudDataEpicLight epic = 1;
  repeated CloudDataSpecLight specs = 2;
  repeated CloudDataTicketLight tickets = 3;
}
message MigratedCloudDataEpic {
  TiptapRoomInfo oldRoomInfo = 1; TiptapRoomInfo newRoomInfo = 2;
  string taskId = 3; bool success = 4; optional string errorMessage = 5;
}

// Phase
message CloudDataPhaseLight {
  string id = 1; string title = 2; string userQuery = 3;
  int32 phaseLength = 4; string status = 5;
  google.protobuf.Timestamp createdAt = 6; google.protobuf.Timestamp updatedAt = 7;
  string createdBy = 8; string version = 9;
}
message CloudDataPhaseLightDelta {
  string id = 1; optional string title = 2; optional string userQuery = 3;
  optional int32 phaseLength = 4; optional string status = 5;
  google.protobuf.Timestamp updatedAt = 6;
}
message CloudDataPhaseLightWithPermission {
  CloudDataPhaseLight light = 1; CloudDataPermission permission = 2;
  repeated CloudDataTaskRepoAssociation repos = 3;
  repeated CloudDataUserTaskWorkspace workspaces = 4;
  TiptapRoomInfo roomInfo = 5;
}
message CloudDataCreatePhaseRequest {
  CloudDataPhaseLight phase = 1;
  repeated CloudDataTaskRepoIdentifier repoIdentifiers = 2;
  repeated CloudDataTaskWorkspaceIdentifier workspaces = 3;
}
message CloudDataCreatePhaseResponse { TiptapRoomInfo roomInfo = 1; }
message CloudDataUpdatePhaseRequest { CloudDataPhaseLightDelta phaseDelta = 1; }
message CloudDataUpdatePhaseResponse { bool updated = 1; }
message CloudDataDeletePhaseRequest { string id = 1; }
message CloudDataDeletePhaseResponse { bool success = 1; }
message MigratedCloudDataPhase {
  string taskId = 1; TiptapRoomInfo oldRoomInfo = 2; TiptapRoomInfo newRoomInfo = 3;
  bool success = 4; optional string errorMessage = 5;
}

// Task list & migration
message CloudDataTaskFilters {
  optional string query = 1;
  optional TaskType taskType = 2;
  optional string repoIdentifier = 3;
  optional string workspacePath = 4;
  optional string deviceId = 5;
  optional string organizationId = 6;
}
message CloudDataListTasksRequest {
  int32 limit = 1;
  optional string cursor = 2;
  CloudDataTaskFilters filters = 3;
  string extensionPhaseVersion = 4;
  string extensionEpicVersion = 5;
}
message CloudDataTaskLight {
  oneof task {
    CloudDataEpicLightWithPermission epic = 1;
    CloudDataPhaseLightWithPermission phase = 2;
  }
}
message CloudDataListTasksResponse {
  repeated CloudDataTaskLight tasks = 1;
  optional string nextCursor = 2;
  bool hasMore = 3;
}
message CloudDataGetTaskRoomInfoRequest { string taskId = 1; }
message CloudDataGetTaskRoomInfoResponse { TiptapRoomInfo roomInfo = 1; }
message CloudDataGetTaskContextRequest { string taskId = 1; }
message CloudDataGetTaskContextResponse { CloudDataTaskLight task = 1; }
message CloudDataMigrateTask {
  oneof task {
    CloudDataMigrateEpicRequest epic = 1;
    CloudDataPhaseLight phase = 2;
  }
  repeated CloudDataTaskRepoIdentifier repoIdentifiers = 3;
  repeated CloudDataTaskWorkspaceIdentifier workspaces = 4;
}
message CloudDataMigrateTaskResponse {
  oneof response {
    MigratedCloudDataEpic epic = 1;
    MigratedCloudDataPhase phase = 2;
  }
}
message CloudDataBatchMigrateTaskRequest { repeated CloudDataMigrateTask tasks = 1; }
message CloudDataBatchMigrateTaskResponse { repeated CloudDataMigrateTaskResponse responses = 1; }

// Task-Repo / Task-Workspace mapping
message CloudDataTaskRepoIdentifier { string owner = 1; string repo = 2; }
message CloudDataTaskWorkspaceIdentifier { string deviceId = 1; string workspacePath = 2; }
message CloudDataTaskRepoAssociation {
  CloudDataTaskRef task = 1;
  CloudDataTaskRepoIdentifier repoIdentifier = 2;
  int64 createdAt = 3;
  string createdBy = 4;
}
message CloudDataUserTaskWorkspace {
  CloudDataTaskRef task = 1;
  string deviceId = 2;
  string workspacePath = 3;
  int64 createdAt = 4;
}
message CloudDataLinkTaskToRepoRequest {
  CloudDataTaskRef task = 1;
  repeated CloudDataTaskRepoIdentifier repoIdentifiers = 2;
}
message CloudDataLinkTaskToRepoResponse { bool success = 1; }
message CloudDataCreateUserTaskWorkspaceRequest {
  CloudDataTaskRef task = 1;
  repeated CloudDataTaskWorkspaceIdentifier workspaces = 2;
}
message CloudDataCreateUserTaskWorkspaceResponse { bool success = 1; }

// Notifications
message CommentEvent {
  CommentEventKind kind = 1;
  EpicArtifactIdentifier epic_artifact_identifier = 2;
  string thread_id = 3;
  repeated string target_user_ids = 4;
}
message NotifyExtensionEventRequest {
  oneof event {
    CommentEvent comment = 1;
  }
}
```

### B.15 Rate Limit / Usage Information

```proto
message GetRateLimitUsageRequest {}
message RateLimitInformation {
  float totalTokens = 1;
  float remainingTokens = 2;
  optional float retryAfter = 3;
}
message GetRateLimitUsageResponse { RateLimitInformation rateLimitInfo = 1; }
```

---

## C. 枚举（**完整原始值**逐字摘录）

```proto
// rpc.proto
enum RPCErrorType {
  SERVER_ERROR = 0;
  NO_ACTIVE_SUBSCRIPTION = 1;
  RATE_LIMIT_EXCEEDED = 2;
  USER_ABORTED = 3;
  INSUFFICIENT_CREDITS = 4;
  ORG_BUNDLE_INSUFFICIENT = 5;
}

enum AbortReason {
  USER_ABORT = 0;
  PING_WRITE_FAILURE = 1;
  PING_TIMEOUT = 2;
  EXTENSION_CLOSED = 3;
}

// file-system.proto
enum Platform { POSIX = 0; WINDOWS = 1; }

enum DiagnosticSeverity {
  ERROR = 0;
  WARNING = 1;
  INFORMATION = 2;
  HINT = 3;
}

// language.proto
enum SupportedLanguage {
  EN = 0; CA = 1; DE = 2; ES = 3; FR = 4; HI = 5; ID = 6; IT = 7;
  JA = 8; KO = 9; NL = 10; PL = 11; PT_BR = 12; RU = 13; TR = 14;
  VI = 15; ZH_CN = 16; ZH_TW = 17;
}

// account.proto
enum AccountContextType { PERSONAL = 0; ORG = 1; }

// mcp.proto
enum MCPParentType { USER = 0; ORGANIZATION = 1; }

// llm/tools.proto
enum LSPSearchType {
  DEFINITION = 0;
  REFERENCE = 1;
  IMPLEMENTATION = 2;
}

// llm/model-selection.proto
enum ModelProfileType {
  MODEL_PROFILE_BALANCED = 0;
  MODEL_PROFILE_FRONTIER = 1;
  MODEL_PROFILE_ECO = 2;
}

// task/plan/plan.proto
enum PlanChatQueryType {
  EXPLANATION = 0;
  ITERATION = 1;
}
enum PlanArtifactType {
  IMPLEMENTATION_ARTIFACT = 0;
  REVIEW_ARTIFACT = 1;
}

// task/review.proto  (== Category, used as ReviewCategory)
enum Category {
  UNKNOWN = 0;
  BUG = 1;
  CLARITY = 2;
  PERFORMANCE = 3;
  SECURITY = 4;
}

// task/verification.proto
enum Severity {
  MINOR = 0;
  MAJOR = 1;
  CRITICAL = 2;
}
enum VerificationThreadStatus {  // == ThreadStatus
  UNRESOLVED = 0;
  RESOLVED = 1;
  OUTDATED = 2;
}

// task/task.proto
enum TaskState {
  TASK_NOT_STARTED = 0;
  TASK_IN_PROGRESS = 1;
  TASK_COMPLETED = 2;
}

// task/yolo-config.proto
enum PromptTemplateType {
  PROMPT_TEMPLATE_TYPE_PLAN = 0;
  PROMPT_TEMPLATE_TYPE_VERIFICATION = 1;
  PROMPT_TEMPLATE_TYPE_REVIEW = 2;
  PROMPT_TEMPLATE_TYPE_GENERIC = 3;
  PROMPT_TEMPLATE_TYPE_USER_QUERY = 4;
}

// task/phase-breakdown/phase.proto
enum PhaseStatus {
  NEW_PHASE = 0;
  MODIFIED_PHASE = 1;
  UNCHANGED_PHASE = 2;
}
enum PhaseSize {  // 这就是 SpecType 的语义对应：分粒度
  ISSUE = 0;
  STORY = 1;
  EPIC = 2;
}

// extension/persistence.proto  (== StepStatus / ExecutionStatus)
enum StepState {
  NOT_STARTED = 0;
  RATE_LIMITED = 1;
  IN_PROGRESS = 2;
  COMPLETED = 3;
  FAILED = 4;
  ABORTING = 5;
  ABORTED = 6;
  SKIPPED = 7;
  WAITING_FOR_EXECUTION = 8;
  STEP_INSUFFICIENT_CREDITS = 9;
  STEP_ORG_BUNDLE_INSUFFICIENT = 10;
}

// task/epic/epic-ticket.proto
enum TicketStatus {
  TICKET_TODO = 0;
  TICKET_IN_PROGRESS = 1;
  TICKET_DONE = 2;
}

// task/epic/epic-conversation.proto
enum ArtifactOperation {
  ARTIFACT_CREATED = 0;
  ARTIFACT_UPDATED = 1;
  ARTIFACT_DELETED = 2;
}
enum ExecutionOperation {
  EXECUTION_CREATED = 0;
  EXECUTION_RESUMED = 1;
}

// task/epic/workflow.proto  (== WorkflowType - which agent kind handles this command)
enum AgentSelectionType {
  PLANNER = 0;
  REVIEWER = 1;
}

// ticket-assist/ticket-assist.proto
enum TicketSource {
  GITHUB_TICKET = 0;
  JIRA_TICKET = 1;
}

// ticket-assist/ticket.proto
enum SCMProviderType {
  GITHUB = 0;
  GITLAB = 1;
}
enum TicketUserType {
  TICKET_USER_TYPE_UNSPECIFIED = 0;
  TICKET_USER_TYPE_USER = 1;
  TICKET_USER_TYPE_BOT = 2;
}

// git.proto
enum GitStatus {
  UNKNOWN_STATUS = 0;
  INDEX_MODIFIED = 1;
  INDEX_ADDED = 2;
  INDEX_DELETED = 3;
  INDEX_RENAMED = 4;
  INDEX_COPIED = 5;
  MODIFIED = 6;
  DELETED = 7;
  UNTRACKED = 8;
  IGNORED = 9;
  INTENT_TO_ADD = 10;
  INTENT_TO_RENAME = 11;
  TYPE_CHANGED = 12;
  ADDED_BY_US = 13;
  ADDED_BY_THEM = 14;
  DELETED_BY_US = 15;
  DELETED_BY_THEM = 16;
  BOTH_ADDED = 17;
  BOTH_DELETED = 18;
  BOTH_MODIFIED = 19;
}

// cloud-persistence/cloud-data-persistence-common.proto
enum PermissionRole {
  PERMISSION_ROLE_OWNER = 0;
  PERMISSION_ROLE_EDITOR = 1;
  PERMISSION_ROLE_VIEWER = 2;
}
enum TaskType {
  TASK_TYPE_EPIC = 0;
  TASK_TYPE_PHASE = 1;
}
enum AccessType {
  ACCESS_TYPE_DIRECT = 0;
  ACCESS_TYPE_LINK = 1;
  ACCESS_TYPE_ORGANIZATION = 2;
}

// cloud-persistence/cloud-data-persistence-collaborator.proto
enum IdentifierType {
  EMAIL = 0;
  GITHUB_HANDLE = 1;
}

// cloud-persistence/cloud-data-persistence-notification.proto
enum CommentEventKind {
  COMMENT_EVENT_KIND_UNSPECIFIED = 0;
  COMMENT_EVENT_KIND_THREAD_CREATED = 1;
  COMMENT_EVENT_KIND_COMMENT_ADDED = 2;
  COMMENT_EVENT_KIND_THREAD_RESOLVED = 3;
  COMMENT_EVENT_KIND_THREAD_DELETED = 4;
}
```

> **架构 teardown 文档列举的枚举名映射注解：**
> - **StepStatus / ExecutionStatus** ≡ `StepState`（共享同一枚举，覆盖 task/execution 的所有 step 状态）
> - **EpicStatus / SpecStatus** 在 proto 中以 `string status` 存储（见 `CloudDataEpicLight.status` / `CloudDataPhaseLight.status` / `CloudDataSpecLight` 通过其它路径），**没有强类型枚举**
> - **TicketStatus** = `TicketStatus`（强类型）
> - **TicketPriority** **不存在**（proto 中无优先级字段，只有 status / assignee）
> - **ExecutionAgentType** 由 `string executionAgent`（自由文本路径名）+ `AgentSelectionType` (PLANNER/REVIEWER) 联合表达
> - **ReviewCategory** ≡ `Category` (UNKNOWN/BUG/CLARITY/PERFORMANCE/SECURITY)
> - **ThreadStatus** ≡ `VerificationThreadStatus`
> - **SpecType** 在 spec 上**没有显式枚举**；最接近的"粒度类型"是 `PhaseSize` (ISSUE/STORY/EPIC)
> - **WorkflowType** ≡ `AgentSelectionType` (PLANNER=0, REVIEWER=1)

---

## D. ReverseRPC（云端反向调用扩展能做什么）

云端通过 `ReverseRPCRequest` 反向调用扩展执行本地 IDE/工作区操作。**完整能力清单（共 19 个 RPC，按 oneof 顺序）：**

### D.1 文件系统 / IDE 类（8 个）

| oneof tag | RPC | 输入 → 输出 | 说明 |
|-----------|-----|------------|------|
| 2 | `ReadFilesRequest` → `ReadFilesResponse` | `repeated FileRequest{Path, Range, includeDiagnostics}` → `repeated FileContent` + `detectedRuleFiles` | 批量读文件（支持行区间 + 诊断信息） |
| 3 | `ListFilesRequest` → `ListFilesResponse` | `Path directory, bool recursive, repeated string ignoreFilePatterns` → `Directory tree` | 列目录（递归 / ignore pattern） |
| 4 | `RegexSearchRequest` → `RegexSearchResponse` | `string regex, Path directory, optional string includeFilesPattern, repeated string ignoreFilePatterns` → `repeated FileContent matchingFileSnippets` | 正则全文搜索 |
| 5 | `LSPSearchRequest` → `LSPSearchResponse` | `Path filePath, int32 lineNumber, string lineText, string word, LSPSearchType type` → `repeated FileContent matchingFileSnippets` | LSP 跳转（DEFINITION / REFERENCE / IMPLEMENTATION） |
| 6 | `FileGlobSearchRequest` → `FileGlobSearchResponse` | `string pattern, Path directory` → `repeated Path filePaths` | Glob 文件名搜索 |
| 7 | `GetDiagnosticsRequest` → `GetDiagnosticsResponse` | `optional string includePattern, repeated Path directories, optional DiagnosticSeverity severity` → `repeated FileDiagnosticsWithPath` | 获取诊断（lint / type error / warning） |
| 8 | `GetGitDiffRequest` → `GetGitDiffResponse` | `oneof{GetGitUncommittedDiffRequest, GetGitRevisionDiffRequest}` → `GitDiff` | Git diff（uncommitted 或对比某 revision） |
| 9 | `GetGitInfoRequest` → `GetGitInfoResponse` | `Path filePath, optional int32 numBranches, optional int32 numCommits` → `GitInfo{currentBranch, currentCommitHash, recentBranches, recentCommits}` | Git 仓库信息 |

### D.2 Spec 操作（4 个）

| oneof tag | RPC | 输入 → 输出 |
|-----------|-----|-----------|
| 10 | `ReadSpecRequest` → `ReadSpecResponse` | `repeated SpecIdentifier` → `repeated Spec` |
| 11 | `EditSpecRequest` → `EditSpecResponse` | `SpecIdentifier, string updated_content, EpicConversationIdentifier` → `bool success, optional string errorMessage` |
| 12 | `DeleteSpecRequest` → `DeleteSpecResponse` | `SpecIdentifier, EpicConversationIdentifier` → `bool success` |
| 13 | `ListSpecsRequest` → `ListSpecsResponse` | `EpicIdentifier` → `repeated SpecSummary` |
| 19 | `UpdateSpecFieldsRequest` → `UpdateSpecFieldsResponse` | `SpecIdentifier, optional string title, EpicConversationIdentifier` → `bool success, optional string errorMessage` |

### D.3 Ticket 操作（5 个）

| oneof tag | RPC | 输入 → 输出 |
|-----------|-----|-----------|
| 14 | `ReadTicketRequest` → `ReadTicketResponse` | `repeated TicketIdentifier` → `repeated Ticket` |
| 15 | `EditTicketRequest` → `EditTicketResponse` | `TicketIdentifier, string updated_content, EpicConversationIdentifier` → `bool success, optional string errorMessage` |
| 16 | `DeleteTicketRequest` → `DeleteTicketResponse` | `TicketIdentifier, EpicConversationIdentifier` → `bool success` |
| 17 | `ListTicketsRequest` → `ListTicketsResponse` | `EpicIdentifier` → `repeated TicketSummary` |
| 20 | `UpdateTicketFieldsRequest` → `UpdateTicketFieldsResponse` | `TicketIdentifier, optional string title, optional TicketStatus status, EpicConversationIdentifier` → `bool success, optional string errorMessage` |

### D.4 Workflow 操作（1 个）

| oneof tag | RPC | 输入 → 输出 |
|-----------|-----|-----------|
| 18 | `ListWorkflowCommandsRequest` → `ListWorkflowCommandsResponse` | `WorkflowIdentifier` → `WorkflowCommand entrypointCommand + repeated WorkflowCommand commands` |

### D.5 Execution 操作（2 个，2024 版本新增）

| oneof tag | RPC | 输入 → 输出 |
|-----------|-----|-----------|
| 25 | `ReadExecutionRequest` → `ReadExecutionResponse` | `repeated EpicExecutionIdentifier` → `repeated EpicExecution` |
| 26 | `ListExecutionsRequest` → `ListExecutionsResponse` | `EpicIdentifier` → `repeated ExecutionSummary` |

### D.6 ReverseRPC 关键设计观察

1. **错误统一封装**：所有失败统一通过 `ReverseRPCResponse.error: ReverseRPCError{string message}` 返回，不区分错误类型。
2. **请求 ID 关联**：`ReverseRPCRequest.id` 与 `ReverseRPCResponse.id` 必须匹配，扩展并发处理多个反向 RPC。
3. **EpicConversationIdentifier 透传**：所有 mutation 类（Edit/Delete/UpdateFields）都带 `EpicConversationIdentifier`，让扩展把变更挂到正确的对话上下文。
4. **诊断/Git/LSP 的能力等价于本地 IDE**：云端等于「无 IDE 的远端 LLM」，把 IDE 能力当作工具调用。
5. **保留 tag 21–24**：`reserved 21, 22, 23, 24` 显示曾有 4 个能力被废弃；很可能是 v3 早期的 Spec/Ticket fields 单字段编辑或别的 execution 操作（已合并到现有 Update*Fields）。
6. **Spec/Ticket/Execution 在扩展端持久化，不在云端**：这就是为什么这些 read/list/edit 需要走 ReverseRPC——artifact 真身存在用户机器/Cloud-Data 分级存储里。
