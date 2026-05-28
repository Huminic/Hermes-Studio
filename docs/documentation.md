**Huminic Studio Documentation**  
**Version 1.20.0 — Comprehensive technical reference for architecture, APIs, configuration, and advanced usage.**  
**Table of Contents**  
* 		Overview  
* 		Screens Reference  
* 		Chat System  
* 		Multi-Agent Orchestration  
* 		Task Management  
* 		Cron Job Management  
* 		Knowledge System  
* 		Skills Ecosystem  
* 		Agent Library  
* 		File Management & Terminal  
* 		Analytics & Observability  
* 		API Reference  
* 		Configuration Reference  
* 		Design System  
* 		Gateway Integration  
* 		Security  
* 		Keyboard Shortcuts  
**1. Overview**  
**What is Huminic Studio**  
**Huminic Studio is a full-featured web-based control panel for managing, monitoring, and orchestrating AI agents running on the Hermes Gateway. It provides a rich graphical interface for chat, multi-agent coordination, task tracking, memory management, skill installation, cron job scheduling, and system observability. The application is designed as a single-page progressive web app that connects to one or more Hermes Gateway instances via HTTP and Server-Sent Events (SSE).**  
**Architecture**  
**Huminic Studio is built on a modern full-stack TypeScript architecture:**  
* **		Frontend:** React 19 with TypeScript, rendered client-side as an SPA.  
* **		Routing:** TanStack Router (file-based route generation) with type-safe route params and search params.  
* **		Data Fetching:** TanStack Query for server state management with automatic caching, refetching, and optimistic updates.  
* **		Build System:** Vite with TanStack Start for SSR-capable bundling, HMR, and production builds.  
* **		Server Layer:** TanStack Start server functions handle API routes. The server process runs as a Node.js HTTP server that proxies to the Hermes Gateway.  
* **		State Management:** Zustand with persist middleware for client settings. React state and TanStack Query for ephemeral/server state.  
* **		Styling:** Tailwind CSS 4 with a custom CSS variable theming layer. All colors are theme-aware via var(--theme-*) tokens.  
**Gateway Connection Model**  
**Huminic Studio does not directly communicate with LLM providers. Instead, it connects to a Hermes Gateway server that manages agent sessions, tool execution, memory, and provider routing. The connection model works as follows:**  
* 		On startup, the Studio server probes the configured gateway URL to detect available capabilities.  
* 		Capabilities are classified as **Core** (health, chat completions, models, streaming) or **Enhanced** (sessions, skills, memory, config, jobs).  
* 		If enhanced capabilities are detected, Studio operates in full-featured mode with session management, tools, and approval workflows.  
* 		If only core capabilities are available, Studio degrades gracefully to a basic chat interface.  
* 		Capability probing results are cached for 120 seconds and refreshed automatically.  
**Feature Matrix**  

| Feature                    | Core Mode | Enhanced Mode |
| -------------------------- | --------- | ------------- |
| Chat with streaming        | Yes       | Yes           |
| Session management         | No        | Yes           |
| Tool execution & approvals | No        | Yes           |
| Multi-agent crews          | No        | Yes           |
| Conductor orchestration    | No        | Yes           |
| Cron jobs                  | No        | Yes           |
| Memory & knowledge         | No        | Yes           |
| Skills installation        | No        | Yes           |
| File browser               | No        | Yes           |
| Terminal                   | No        | Yes           |
| Analytics                  | Partial   | Yes           |
| Model selection            | Yes       | Yes           |
  
****2. Screens Reference****  
**Huminic Studio contains 18 distinct screens, each accessible via the sidebar navigation or keyboard shortcuts. Below is a reference for each screen.**  

| Screen | Route | Description |
| --------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard | /dashboard | System overview with active session count, token usage sparklines, gateway connection status, recent activity feed, and quick-launch cards for common actions. Displays real-time area charts of context usage over the past 24 hours. |
| Chat | /chat/:sessionKey | Primary conversational interface. Features session sidebar, streaming message display, approval cards, attachment handling, inspector panel, context meter, and multi-model selection. Supports both enhanced Hermes sessions and portable chat completions. |
| Files | /files | Profile-scoped file browser with tree navigation, Monaco editor integration for viewing and editing files with syntax highlighting, search, and configurable font size, word wrap, and minimap settings. |
| Terminal | /terminal | Integrated PTY terminal powered by Xterm.js. Supports persistent terminal sessions, resize events, ANSI color rendering, and clipboard integration. Sessions survive page refreshes. |
| Jobs | /jobs | Cron job management with creation wizard, schedule presets, delivery channel configuration, live run streaming via SSE, run history, and job lifecycle controls (pause, resume, delete, run now). |
| Crews | /crews | Multi-agent team management. Create crews from templates or scratch, configure members with personas and models, build DAG workflows, dispatch missions, track token costs, and clone crews with fresh sessions. |
| Crew Detail | /crews/:crewId | Individual crew management with member roster, workflow DAG editor, dispatch dialog, cost panel with per-member token breakdown, and crew settings. |
| Conductor | /conductor | Mission orchestration system. Enter a high-level goal, observe automated task decomposition, monitor worker agents in the Office View (Grid, Roundtable, or War Room layouts), track costs, and review completed mission outputs. |
| Operations | /operations | Real-time operational overview showing all active agent sessions in a grid layout, with status indicators, last activity timestamps, and output previews. Useful for monitoring multi-agent workloads. |
| Tasks | /tasks | Kanban-style task board with five columns (Backlog, Todo, In Progress, Review, Done). Supports drag-and-drop, priority levels, tags, assignee linking, and source URL references. |
| Agents | /agents | Agent persona library with built-in and custom agents. Create agents with emoji avatars, accent colors, system prompts, model overrides, and specialty tags. Agents integrate with crews and conductor. |
| Patterns | /patterns | Patterns and corrections system for managing reusable prompt patterns, behavior corrections, and agent guidelines that persist across sessions. |
| Analytics | /analytics | Event analytics with 14-day stacked bar charts showing tool usage frequency, message volume, and session activity. Includes provider usage breakdown and context window utilization graphs. |
| Session History | /session-history | Two-pane archive interface for browsing past sessions. Left pane shows session list with metadata; right pane lazy-loads full message threads with search and filter capabilities. |
| Audit Trail | /audit | Chronological event log filterable by event type, session, and date range. Records all significant system events including approvals, tool executions, session lifecycle changes, and configuration modifications. |
| Logs | /logs | Gateway log viewer displaying the last 500 lines of system logs with color-coded severity levels (debug, info, warn, error). Supports auto-scroll and manual pause. |
| Memory | /memory | Memory browser for viewing and editing identity files (SOUL.md, persona.md, CLAUDE.md), plus a knowledge graph visualization with force-directed layout and wikilink detection. |
| Skills | /skills | Skill registry browser with 2000+ available skills from skillsmp.com. Install, uninstall, enable/disable skills, view documentation, and search the hub for new capabilities. |
| Profiles | /profiles | Profile management for switching between different gateway configurations. Create, rename, activate, and delete profiles. Each profile maintains independent settings, memory files, and skill installations. |
| Settings | /settings | Application configuration including gateway connection, appearance (theme, accent color), editor preferences (font size, word wrap, minimap), notification settings, model preferences, and MCP server configuration. |
  
****3. Chat System****  
**Session Management**  
**Every conversation in Huminic Studio exists within a session. Sessions are server-managed entities created on the Hermes Gateway. Each session maintains its own context window, message history, tool permissions, and memory state.**  
* **		Creation:** Sessions are created via POST /api/sessions which delegates to the gateway. Each session receives a unique key (UUID format).  
* **		Switching:** The chat sidebar displays all active sessions. Clicking a session triggers a route change to /chat/:sessionKey and loads the message history.  
* **		Deletion:** Sessions can be deleted from the sidebar context menu. This removes the session from the gateway and clears associated message history.  
* **		Renaming:** Sessions can be renamed for easier identification. Names are stored as metadata on the gateway session object.  
* **		Status Polling:** The chat screen polls GET /api/sessions/:sessionKey/status to detect agent state changes (idle, active, waiting_for_input).  
**SSE Streaming Architecture**  
**Message streaming uses Server-Sent Events (SSE) for real-time delivery of agent responses. The architecture works as follows:**  
* 		User sends a message via POST /api/sessions/send which dispatches to the gateway.  
* 		The client opens an SSE connection to GET /api/chat-events with the session key as a query parameter.  
* 		The server proxies SSE events from the Hermes Gateway, forwarding token-by-token streaming data.  
* 		Events include: message_start, content_delta, content_end, tool_use, tool_result, approval_required, error.  
* 		The client accumulates deltas into complete messages, updating the React state incrementally for smooth rendering.  
* 		When the stream ends (either naturally or via abort), the client reconciles with the full message history from the gateway.  
**Message Persistence**  
**Messages are persisted by the Hermes Gateway using a tiered storage strategy:**  
* **		Primary (Redis):** When REDIS_URL is configured, messages are stored in Redis sorted sets keyed by session. This provides fast retrieval and supports TTL-based expiration.  
* **		Fallback (File):** When Redis is unavailable, messages fall back to file-based storage in the .runtime/ directory as JSON files per session.  
* **		Session tokens:** Authentication tokens are persisted in a Redis SET (hermes:studio:tokens) with a 30-day TTL, falling back to in-memory storage.  
**Approval Workflow**  
## **When an agent attempts a privileged action (file writes, command execution, network access), the gateway emits an **approval_required** event. The Studio UI renders an ApprovalCard with three resolution options:**  
* **		Approve (once):** Permits the specific action instance. Scope: this single invocation only.  
* **		Deny:** Rejects the action. The agent receives a denial signal and may propose an alternative approach.  
* **		Always Allow:** Grants permanent permission for this action pattern. Three scopes are available:  
    * **		once** — Allow this exact action one time.  
    * **		session** — Allow this action type for the remainder of the current session.  
    * **		always** — Permanently allow this action type across all sessions.  
## **Approvals are resolved via **POST /api/approvals/:approvalId/approve** or **POST /api/approvals/:approvalId/deny**. The approval card displays the action name, agent identity, and expandable context showing full arguments.**  
**Inspector Panel**  
**The chat inspector panel provides diagnostic visibility into the current session state. It displays active tool calls, pending approvals, token usage breakdown (input/output/cache), context window utilization as a percentage meter, and the raw event stream for debugging. The context bar shows real-time consumption with color thresholds (green under 60%, amber 60-85%, red above 85%).**  
**Attachment Handling**  
**The chat composer supports file attachments. Files are uploaded and converted to appropriate formats for the LLM (images become base64-encoded vision inputs, text files become inline content blocks). The research card component displays structured research outputs with collapsible sections and source citations.**  
**4. Multi-Agent Orchestration**  
**4a. Crews**  
**Crew Lifecycle**  
**Crews follow a defined lifecycle from creation through execution:**  
* **		Create:** Define a crew via the creation dialog or by selecting a template from the gallery. Set a name, description, and initial member roster.  
* **		Configure:** Assign personas, models, and system prompts to each member. Optionally build a workflow DAG defining execution order and dependencies.  
* **		Dispatch:** Launch the crew on a mission via the dispatch dialog. Provide a goal prompt, select the execution strategy (parallel, sequential, or DAG-ordered), and confirm.  
* **		Monitor:** Track progress in real-time. Each member's session status, output, and token usage updates live. The cost panel shows per-member and total spend.  
**Member Management**  
**Each crew member represents an agent session with specific configuration:**  
* **		Persona:** Selected from the agent library (built-in or custom). Determines the system prompt, avatar, and specialty tags.  
* **		Model:** Override the default model per member. Useful for assigning cheaper models to simpler tasks and premium models to complex reasoning.  
* **		Session:** Each member gets a dedicated gateway session that persists across dispatches. Sessions can be reset or re-minted.  
**Template System**  
**Huminic Studio includes 7 built-in crew templates plus support for user-created custom templates. Templates are categorized:**  
* **		Research:** Templates for investigation, analysis, and report generation.  
* **		Engineering:** Templates for code review, architecture, and implementation tasks.  
* **		Creative:** Templates for content creation, brainstorming, and design.  
* **		Operations:** Templates for deployment, monitoring, and maintenance workflows.  
* **		Conductor:** Templates optimized for the conductor orchestration pattern.  
## **Custom templates can be created from any existing crew configuration and are persisted via **POST /api/crews/templates**. User templates can be deleted; built-in templates are read-only.**  
**Workflow Builder**  
**The workflow builder is a visual DAG (Directed Acyclic Graph) editor for defining execution dependencies between crew members. Key features:**  
* 		Drag-and-drop node placement with automatic layout.  
* 		Edge creation by clicking source and target nodes.  
* 		Cycle detection — the editor prevents creating edges that would form cycles, ensuring a valid topological order.  
* 		Parallel execution — nodes without dependencies run concurrently.  
* 		Workflow state is persisted per crew via PUT /api/crews/:crewId/workflow.  
**Token Usage Tracking**  
## **The cost panel (**GET /api/crews/:crewId/usage**) provides per-member token breakdowns showing input tokens, output tokens, cache read/write tokens, and estimated cost. Costs use a blended rate of approximately $5 per million tokens.**  
**Clone with Session Minting**  
## **Crews can be cloned via **POST /api/crews/:crewId/clone**. Cloning creates a duplicate crew with fresh sessions for all members, preserving the workflow DAG and configuration but resetting all conversation state. This is useful for re-running experiments or creating variants.**  
**4b. Conductor V2**  
**Gateway-Native Architecture**  
**The Conductor V2 system uses a gateway-native approach where orchestration is performed by a dedicated Hermes agent session rather than client-side logic. The orchestrator agent receives a mission goal and a dispatch skill, then autonomously decomposes the work and spawns worker sessions.**  
**Mission Phases**  
**A conductor mission progresses through four phases:**  
* **		idle:** No active mission. The UI shows the mission input form and history.  
* **		decomposing:** The orchestrator agent is analyzing the goal and planning task allocation. The UI shows a thinking indicator.  
* **		running:** Worker agents have been spawned and are executing tasks. The Office View displays real-time progress.  
* **		complete:** All workers have finished. The UI shows the summary with outputs, costs, and mission duration.  
**Spawn Flow**  
**The spawn sequence is:**  
* 		Client sends POST /api/conductor-spawn with the goal, orchestrator model, worker model, projects directory, max parallel count, and supervised flag.  
* 		The server loads the workspace-dispatch skill from disk (searching multiple candidate paths).  
* 		An orchestrator prompt is constructed combining the goal with the dispatch skill instructions.  
* 		A Hermes cron job is created on the gateway to run the orchestrator as a one-shot task.  
* 		The orchestrator agent decomposes the goal and spawns worker sessions via the dispatch skill.  
* 		The client polls worker session statuses every 3 seconds to track progress.  
**Live Monitoring**  
**During the running phase, the client monitors worker agents through:**  
* **		3-second polling:** Session status is fetched for all active workers at a 3-second interval.  
* **		Staleness detection:** Workers that haven't reported activity within a threshold are marked as potentially stale.  
* **		Completion detection:** When all workers report idle/complete status, the mission transitions to the complete phase.  
* **		Office View:** Real-time visualization of all workers with status indicators, current task labels, and output previews.  
**Conductor Settings**  
**The settings drawer provides configuration for:**  
**Orchestrator Model**  
**The LLM model used for task decomposition and coordination. Defaults to auto (gateway default). Premium models (Claude Opus, GPT-4) recommended for complex missions.**  
**Worker Model**  
**The LLM model assigned to spawned worker agents. Can use cheaper models (Claude Sonnet, GPT-4o-mini) for cost efficiency.**  
**Projects Directory**  
## **Base directory where worker outputs are written. Defaults to **/tmp**. Set to your workspace root for persistent outputs.**  
**Max Parallel (1-5)**  
**Maximum number of worker agents that can run concurrently. Higher values increase throughput but consume more resources and API quota.**  
**Supervised**  
**When enabled, worker agents require approval for tool use. When disabled, workers operate autonomously.**  
**Office View Layouts**  
**The Office View provides three visualization layouts for monitoring workers:**  
* **		Grid (4x3):** Traditional grid arrangement showing up to 12 agent cards in rows. Each card displays the agent avatar, name, status glow, current task, and last output line.  
* **		Roundtable (circular):** Agents arranged in a circle around a central mission summary. Emphasizes equal participation and cross-agent awareness.  
* **		War Room (facing rows):** Two rows of agents facing each other, simulating a collaborative workspace. Status bars and speech bubbles show real-time activity.  
## **Layout preference is persisted in localStorage under the key **hermes-studio:office-layout**.**  
**Agent Avatar System**  
**Each conductor worker is assigned a unique pixel-art SVG robot avatar. The system provides:**  
* **		10 avatar variants:** Different robot body shapes with distinct head, body, arm, and leg geometry rendered as SVG pixel art.  
* **		10 accent colors:** Orange, Blue, Violet, Emerald, Rose, Amber, Cyan, Fuchsia, Lime, Sky. Each color provides bar, border, avatar, text, ring, and hex values.  
* 		Avatars are assigned deterministically based on agent index, ensuring consistent visual identity across sessions.  
**Mission History**  
**Completed missions are stored in localStorage with a maximum of 50 entries. Each history entry records the goal, start/end timestamps, worker count, total cost, and completion status. The history panel on the home screen allows reviewing past missions and re-launching similar goals.**  
**Cost Tracking**  
**The conductor tracks estimated costs using a blended rate of approximately $5 per 1 million tokens. The cost tracker component displays real-time accumulation during mission execution, with per-worker breakdowns available on hover. Final costs are recorded in the mission history entry.**  
**5. Task Management**  
**Kanban Board**  
**The Tasks screen implements a five-column Kanban board for tracking work items. Tasks flow left-to-right through the following columns:**  

| Column      | Purpose                                                 |
| ----------- | ------------------------------------------------------- |
| Backlog     | Captured ideas and future work not yet prioritized.     |
| Todo        | Prioritized work ready to be started in the next cycle. |
| In Progress | Actively being worked on by a human or agent.           |
| Review      | Work completed, awaiting review or validation.          |
| Done        | Completed and accepted work.                            |
  
****Task Properties****  
**Each task supports the following properties:**  
* **		Title:** Short descriptive name for the task.  
* **		Description:** Detailed explanation of the work required (supports markdown).  
* **		Priority:** One of low, medium, high, or critical. Displayed as color-coded badges.  
* **		Tags:** Arbitrary string labels for categorization and filtering.  
* **		Assignee:** Link to an agent persona or human identifier.  
* **		Source Links:** URLs referencing external resources (GitHub issues, docs, etc.).  
* **		Column:** Current Kanban column (determines board position).  
**HTML5 Drag-and-Drop**  
## **Tasks can be moved between columns using native HTML5 drag-and-drop. When a card is dragged to a new column, a **PATCH /api/tasks/:taskId/move** request updates the server state. The board uses optimistic updates for instant visual feedback, reverting on failure. Cards can also be reordered within a column to set priority ordering.**  
**Cross-Linking**  
**Tasks integrate with other Huminic Studio systems:**  
* 		Tasks can be created from conductor mission outputs, linking the task to the originating mission.  
* 		Crew dispatch results can generate review tasks automatically.  
* 		Task assignees can reference agent personas from the agent library.  
**6. Cron Job Management**  
**Job Lifecycle**  
**Cron jobs in Huminic Studio follow a lifecycle:**  
* **		Create:** Define a job with a name, prompt/instruction, schedule, and delivery configuration.  
* **		Schedule:** The gateway registers the job with its cron expression and begins scheduling.  
* **		Run:** At each scheduled time, the gateway spawns a one-shot agent session that executes the job prompt.  
* **		Monitor:** Run progress streams via SSE. Outputs are captured and stored in run history.  
**Schedule Presets and Cron Expressions**  
**The job creation dialog offers common schedule presets:**  
* 		Every 5 minutes, Every 15 minutes, Every hour  
* 		Every 6 hours, Every 12 hours, Daily at midnight  
* 		Weekly (Monday 9am), Monthly (1st at midnight)  
## **Advanced users can enter arbitrary cron expressions using standard 5-field format: **minute hour day-of-month month day-of-week**. The UI validates expressions and shows a human-readable interpretation.**  
**Delivery Channels**  
**Job outputs can be delivered through multiple channels:**  

| Channel  | Description                                                 |
| -------- | ----------------------------------------------------------- |
| Local    | Output stored in run history, viewable in the Studio UI.    |
| Telegram | Send output as a Telegram message to a configured bot/chat. |
| Discord  | Post output to a Discord channel via webhook.               |
| Slack    | Send output to a Slack channel via incoming webhook.        |
| Signal   | Deliver output via Signal messenger integration.            |
  
****Live Run Streaming****  
## **When a job is running (either scheduled or manually triggered), the output streams in real-time via SSE at **GET /api/hermes-runs/:runId/events**. The Studio UI renders streaming output with the same message formatting used in chat, including tool use indicators and markdown rendering.**  
**Run History**  
## **Each job maintains a history of past runs accessible via **GET /api/hermes-runs**. Run entries include start time, duration, exit status (success/failure/timeout), token usage, and the complete output text. The jobs screen displays recent runs in a timeline view with expandable output panels.**  
**7. Knowledge System**  
**Memory Browser**  
**The memory browser provides access to the agent's identity and knowledge files. These markdown files define the agent's personality, capabilities, and contextual information:**  
**SOUL.md**  
**Core identity file defining the agent's fundamental personality, values, communication style, and behavioral guidelines. Always loaded into context.**  
**persona.md**  
**Current active persona configuration including name, role, specialties, and interaction preferences. Can be swapped to change agent behavior.**  
**CLAUDE.md**  
**Project-specific instructions and context. Typically contains codebase conventions, architecture notes, and project-specific rules.**  
## **Files are read via **GET /api/memory/read** and written via **POST /api/memory/write**. The browser includes a Monaco editor for inline editing with markdown preview.**  
**Knowledge Graph**  
**The knowledge graph provides a force-directed visualization of relationships between knowledge entries. Built with D3-style physics simulation:**  
* **		Nodes:** Each knowledge file or memory entry becomes a node. Size reflects content length; color indicates file type.  
* **		Edges:** Connections are detected via wikilink syntax ([[target]]) within documents. Edges represent cross-references between knowledge items.  
* **		Physics:** Force-directed layout with charge repulsion, link attraction, and center gravity. Nodes can be dragged and pinned.  
* **		Search:** Full-text search via GET /api/knowledge/search highlights matching nodes and filters the graph display.  
## **The graph data is fetched from **GET /api/knowledge/graph** which returns nodes and edges as JSON. The knowledge list endpoint (**GET /api/knowledge/list**) provides the flat file listing.**  
**Wikilink Detection**  
## **The knowledge system automatically detects **[[wikilink]]** syntax in memory files. When a wikilink is found, the system attempts to resolve it against existing knowledge entries. Resolved links become navigable connections in the graph and clickable references in the editor. Unresolved links are highlighted as broken references.**  
**Patterns and Corrections**  
## **The Patterns screen (**/patterns**) manages reusable behavioral patterns and corrections:**  
* **		Patterns:** Reusable prompt templates that can be applied to sessions. Define common instructions, formatting rules, or behavioral guidelines.  
* **		Corrections:** Specific behavioral fixes that override default agent behavior. When a correction is active, it is injected into the agent's system prompt to prevent repeat mistakes.  
**8. Skills Ecosystem**  
**Skill Registry**  
**Huminic Studio provides access to a registry of 2000+ skills available from skillsmp.com (the Hermes skill marketplace). Skills extend agent capabilities by providing structured instructions, tool definitions, and workflow patterns. The skills screen displays installed skills with their status (enabled/disabled) and available skills from the hub.**  
**Installation Flow**  
**Skill installation follows a two-tier strategy:**  
* **		Gateway installation:** The primary path sends an install request to the Hermes Gateway via POST /api/skills/install. The gateway downloads the skill from the registry and places it in the skills directory.  
* **		ClawHub fallback:** If gateway installation fails (older gateway version, network issues), the system falls back to the ClawHub API for skill retrieval.  
## **Uninstallation is performed via **POST /api/skills/uninstall** which removes the skill files from the gateway's skill directory.**  
**Enable/Disable Toggle**  
## **Installed skills can be enabled or disabled without uninstalling. Disabled skills remain on disk but are excluded from the agent's active skill set. This allows quick experimentation without reinstallation overhead. Skill settings are managed via **POST /api/skills/settings**.**  
**Skill Documentation**  
## **Each skill includes a SKILL.md documentation file describing its capabilities, usage patterns, and configuration options. The skills screen renders this documentation inline when a skill is selected. Hub search (**GET /api/skills/hub-search**) returns skill metadata including name, description, category, and installation count.**  
**9. Agent Library**  
**Built-in Personas**  
**Huminic Studio ships with 8 built-in agent personas, each specialized for different task types:**  

| Name | Role | Emoji | Specialties |
| ----- | ------------------- | ----- | --------------------------------------------------------------- |
| Roger | Frontend Developer | 🎨 | React, CSS, Tailwind, UI/UX, components, layout, design |
| Sally | Backend Architect | 🏗️ | API, server, database, Node, Express, routes, schemas |
| Bill | Marketing Expert | 📣 | Marketing, SEO, content, copy, brand, social, campaigns |
| Ada | QA Engineer | 🔍 | Testing, QA, bugs, debugging, linting, TypeScript, validation |
| Max | DevOps Specialist | ⚙️ | Deploy, Docker, CI/CD, build, infrastructure, monitoring |
| Luna | Research Analyst | 🔬 | Research, analysis, comparison, reports, data, strategy |
| Kai | Full-Stack Engineer | ⚡ | Full-stack, features, implementation, scaffolding, refactoring |
| Nova | Security Specialist | 🛡️ | Security, auth, permissions, encryption, vulnerability scanning |
  
****Personas are assigned to crew members round-robin or by matching task keywords against specialty tags.****  
**Custom Agent Creation**  
**The agent editor dialog allows creating custom agents with the following properties:**  
* **		Name:** Display name for the agent.  
* **		Emoji:** Visual avatar emoji shown in UI elements.  
* **		Color:** Accent color for the agent's visual identity.  
* **		System Prompt:** Custom system instructions defining the agent's behavior, knowledge, and communication style.  
* **		Model Override:** Optionally lock this agent to a specific LLM model regardless of global settings.  
* **		Tags:** Specialty tags used for automatic persona matching in crews and conductor.  
## **Custom agents are managed via **POST /api/agents** (create), **PUT /api/agents/:agentId** (update), and **DELETE /api/agents/:agentId** (delete). They are stored in a file-backed definitions store.**  
**Integration with Crews and Templates**  
**Both built-in and custom agents appear in the crew member selection UI. When creating a crew from a template, the template specifies agent assignments by name or specialty match. Custom agents can be used in templates and will be resolved at dispatch time.**  
**10. File Management & Terminal**  
**Profile-Scoped File Browser**  
**The file browser operates within the active profile's workspace scope. It provides:**  
* 		Tree-style directory navigation with expandable folders.  
* 		File metadata display (size, modification time, type).  
* 		Create, rename, and delete operations for files and directories.  
* 		File content is served via GET /api/files?path=... and saved via POST /api/files.  
**Monaco Editor Integration**  
**File editing uses the Monaco editor (the same editor powering VS Code). Configuration options:**  
**Syntax Highlighting**  
**Automatic language detection based on file extension. Supports TypeScript, JavaScript, Python, Rust, Go, Markdown, JSON, YAML, HTML, CSS, and 50+ other languages.**  
**Font Size**  
## **Configurable via Settings (default: 13px). Stored in **editorFontSize** setting.**  
**Word Wrap**  
## **Toggle word wrapping for long lines. Stored in **editorWordWrap** setting.**  
**Minimap**  
## **Optional code minimap in the right gutter. Stored in **editorMinimap** setting.**  
**PTY Terminal**  
**The terminal screen provides a full PTY (pseudo-terminal) powered by Xterm.js:**  
* **		Persistent sessions:** Terminal sessions survive page refreshes. The PTY process continues running on the server.  
* **		Streaming:** Terminal I/O is streamed via GET /api/terminal-stream (SSE for output) and POST /api/terminal-input (keystrokes).  
* **		Resize:** Terminal dimensions are synchronized via POST /api/terminal-resize when the browser window or panel changes size.  
* **		Close:** Explicitly close a terminal session via POST /api/terminal-close.  
* **		ANSI support:** Full 256-color and true-color ANSI rendering, bold, italic, underline, and cursor positioning.  
**11. Analytics & Observability**  
**Event Analytics**  
## **The analytics screen (**/analytics**) provides visual insights into agent activity:**  
* **		14-day stacked bar chart:** Shows daily event counts broken down by type (messages, tool calls, approvals, errors). Data sourced from GET /api/state-analytics.  
* **		Tool frequency:** Ranked list of most-used tools with invocation counts and success rates.  
* **		Context usage:** Time-series chart showing context window utilization over time via GET /api/context-usage.  
* **		Provider usage:** Breakdown of token consumption by LLM provider via GET /api/provider-usage.  
**Session History**  
## **The session history screen (**/session-history**) provides a two-pane archive interface:**  
* **		Left pane:** Scrollable session list showing session name, creation date, message count, and last activity. Sorted by most recent activity.  
* **		Right pane:** Lazy-loaded message thread for the selected session. Messages render with full formatting including code blocks, tool results, and approval receipts.  
* **		Data source:** GET /api/history returns archived session metadata. Individual session messages are loaded on selection.  
**Audit Trail**  
## **The audit trail (**/audit**) maintains a chronological log of all significant system events:**  
* **		Event types:** Session created/deleted, message sent, tool executed, approval granted/denied, configuration changed, skill installed/removed, job created/run.  
* **		Filtering:** Filter by event type, session key, date range, or free-text search.  
* **		Data source:** GET /api/audit with query parameters for pagination and filtering.  
* **		Retention:** Audit entries are persisted on the gateway and retained indefinitely unless manually purged.  
**Logs Viewer**  
## **The logs screen (**/logs**) displays the last 500 lines of gateway system logs:**  
* **		Color coding:** Log levels are color-coded — debug (gray), info (blue), warn (amber), error (red).  
* **		Auto-scroll:** New log lines automatically scroll the view to the bottom. A pause button stops auto-scroll for manual inspection.  
* **		Timestamps:** Each line shows the timestamp in local time format.  
* **		Source:** Logs are fetched from the gateway and displayed in a monospace terminal-style container.  
**12. API Reference**  
## **All API endpoints are served by the Huminic Studio server process and proxy to the Hermes Gateway where appropriate. Base path: **/api**. All mutating endpoints require **Content-Type: application/json**. Authentication is via session cookie or Bearer token.**  
**Authentication**  

| Method | Path | Description |
| ------ | ---------------------- | --------------------------------------------------------------------------------- |
| GET | /api/auth-check | Check if the current session is authenticated. Returns 200 with user info or 401. |
| POST | /api/auth | Authenticate with password. Returns session token on success. |
| POST | /api/oauth/device-code | Initiate OAuth device code flow. Returns device code and user verification URL. |
| POST | /api/oauth/poll-token | Poll for OAuth token completion after device code authorization. |
  
****Sessions****  

| Method | Path | Description |
| ------ | ------------------------------------ | ------------------------------------------------------------------------- |
| GET | /api/sessions | List all active sessions with metadata (name, status, created timestamp). |
| POST | /api/sessions | Create a new session. Body: optional name, model, system prompt. |
| GET | /api/sessions/:sessionKey/status | Get current session status (idle, active, waiting_for_input). |
| GET | /api/sessions/:sessionKey/active-run | Get the currently active run for a session, if any. |
| POST | /api/sessions/send | Send a message to a session. Body: sessionKey, message, attachments. |
| GET | /api/session-status | Batch status check for multiple sessions. |
| GET | /api/chat-events | SSE stream of chat events for a session. Query: sessionKey. |
| GET | /api/events | SSE stream of global system events. |
| GET | /api/events/replay | Replay historical events for a session from a given timestamp. |
| POST | /api/send | Alternative send endpoint for portable chat completions mode. |
| GET | /api/send-stream | SSE stream for portable chat completions mode. |
| GET | /api/history | Get archived session history (past sessions with message counts). |
  
****Crews****  

| Method | Path | Description |
| ------ | --------------------------- | ---------------------------------------------------------------------- |
| GET | /api/crews | List all crews with member counts and status. |
| POST | /api/crews | Create a new crew. Body: name, description, members array. |
| GET | /api/crews/:crewId | Get crew details including members, workflow, and dispatch history. |
| PUT | /api/crews/:crewId | Update crew configuration (name, description, members). |
| DELETE | /api/crews/:crewId | Delete a crew and optionally its associated sessions. |
| POST | /api/crews/:crewId/dispatch | Dispatch a mission to the crew. Body: goal, strategy. |
| POST | /api/crews/:crewId/clone | Clone crew with fresh sessions for all members. |
| GET | /api/crews/:crewId/workflow | Get the crew's workflow DAG definition. |
| PUT | /api/crews/:crewId/workflow | Update the crew's workflow DAG (nodes and edges). |
| GET | /api/crews/:crewId/usage | Get token usage breakdown per crew member. |
| GET | /api/crews/templates | List all available crew templates (built-in + custom). |
| POST | /api/crews/templates | Create a custom crew template. |
| DELETE | /api/crews/templates/:id | Delete a user-created template (built-in templates cannot be deleted). |
  
****Conductor****  

| Method | Path | Description |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| POST | /api/conductor-spawn | Spawn a conductor mission. Body: goal, orchestratorModel, workerModel, projectsDir, maxParallel, supervised. |
| POST | /api/conductor-stop | Stop a running conductor mission. Terminates all worker sessions. |
  
****Tasks****  

| Method | Path | Description |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------- |
| GET | /api/tasks | List all tasks across all columns. |
| POST | /api/tasks | Create a new task. Body: title, description, priority, tags, column, assignee, sourceLinks. |
| GET | /api/tasks/:taskId | Get a single task by ID. |
| PUT | /api/tasks/:taskId | Update task properties. |
| DELETE | /api/tasks/:taskId | Delete a task. |
| PATCH | /api/tasks/:taskId/move | Move a task to a different column. Body: column, position. |
  
****Agents****  

| Method | Path | Description |
| ------ | -------------------- | ------------------------------------------------------------------------ |
| GET | /api/agents | List all custom agent definitions. |
| POST | /api/agents | Create a new agent. Body: name, emoji, color, systemPrompt, model, tags. |
| PUT | /api/agents/:agentId | Update an existing agent definition. |
| DELETE | /api/agents/:agentId | Delete a custom agent. |
  
****Jobs (Cron)****  

| Method | Path | Description |
| ------ | ------------------------------ | --------------------------------------------------------------------- |
| GET | /api/hermes-jobs | List all registered cron jobs with status and schedule info. |
| POST | /api/hermes-jobs | Create a new cron job. Body: name, prompt, schedule, delivery config. |
| GET | /api/hermes-jobs/:jobId | Get details of a specific job. |
| PUT | /api/hermes-jobs/:jobId | Update job configuration (schedule, prompt, delivery). |
| DELETE | /api/hermes-jobs/:jobId | Delete a cron job. |
| GET | /api/hermes-runs | List recent job runs with status and timing. |
| GET | /api/hermes-runs/:runId/events | SSE stream of events for a specific job run. |
  
****Memory & Knowledge****  

| Method | Path | Description |
| ------ | --------------------- | ------------------------------------------------------------- |
| GET | /api/memory | Get memory overview (file list with metadata). |
| GET | /api/memory/list | List all memory files with paths and sizes. |
| GET | /api/memory/read | Read a specific memory file. Query: path. |
| POST | /api/memory/write | Write content to a memory file. Body: path, content. |
| GET | /api/memory/search | Full-text search across memory files. Query: q. |
| GET | /api/knowledge/list | List all knowledge entries. |
| GET | /api/knowledge/read | Read a knowledge entry. Query: path. |
| GET | /api/knowledge/search | Search knowledge base. Query: q. |
| GET | /api/knowledge/graph | Get knowledge graph (nodes and edges JSON for visualization). |
  
****Skills****  

| Method | Path | Description |
| ------ | ---------------------- | --------------------------------------------------------------- |
| GET | /api/skills | List installed skills with enabled/disabled status. |
| POST | /api/skills/install | Install a skill from the registry. Body: skillId. |
| POST | /api/skills/uninstall | Uninstall a skill. Body: skillId. |
| POST | /api/skills/settings | Update skill settings (enable/disable). Body: skillId, enabled. |
| GET | /api/skills/hub-search | Search the skill marketplace. Query: q, category. |
  
****Files****  

| Method | Path | Description |
| ------ | ---------- | ----------------------------------------------------------------- |
| GET | /api/files | List files or read file content. Query: path, action (list/read). |
| POST | /api/files | Create or update a file. Body: path, content. |
| DELETE | /api/files | Delete a file. Body: path. |
| GET | /api/paths | Get workspace path information for the active profile. |
  
****Profiles****  

| Method | Path | Description |
| ------ | ---------------------- | -------------------------------------------------- |
| GET | /api/profiles/list | List all available profiles with active indicator. |
| POST | /api/profiles/create | Create a new profile. Body: name. |
| POST | /api/profiles/activate | Switch the active profile. Body: name. |
| POST | /api/profiles/rename | Rename a profile. Body: oldName, newName. |
| POST | /api/profiles/delete | Delete a profile. Body: name. |
| GET | /api/profiles/read | Read profile-specific configuration. |
  
****Configuration****  

| Method | Path | Description |
| ------ | ------------------ | ---------------------------------------------------------- |
| GET | /api/hermes-config | Get current gateway configuration. |
| PATCH | /api/hermes-config | Update gateway configuration. Body: partial config object. |
| GET | /api/mcp/servers | List configured MCP servers. |
| POST | /api/mcp/servers | Add or update an MCP server configuration. |
| POST | /api/mcp/reload | Reload MCP server connections. |
  
****Analytics****  

| Method | Path | Description |
| ------ | -------------------- | ---------------------------------------------------------- |
| GET | /api/state-analytics | Get event analytics data (14-day breakdown by event type). |
| GET | /api/context-usage | Get context window usage time series data. |
| GET | /api/provider-usage | Get token usage breakdown by LLM provider. |
  
****System****  

| Method | Path | Description |
| ------ | ---------------------- | -------------------------------------------------------------------------------- |
| GET | /api/ping | Health check. Returns 200 with timestamp. |
| GET | /api/system-health | Detailed system health including gateway connectivity, Redis status, and uptime. |
| GET | /api/systemd-status | Get systemd service status for the Hermes gateway process. |
| POST | /api/systemd-control | Control the Hermes gateway systemd service (start, stop, restart). |
| GET | /api/models | List available LLM models from the gateway. |
| GET | /api/workspace | Get workspace information (path, profile, gateway version). |
| GET | /api/gateway-status | Get gateway connection status and detected capabilities. |
| GET | /api/connection-status | Lightweight connection check (faster than full health). |
| POST | /api/start-hermes | Start the Hermes gateway process if not running. |
| POST | /api/start-agent | Start an agent session with specific configuration. |
  
****Operations****  

| Method | Path | Description |
| ------ | --------------- | ------------------------------------------------------------------------------ |
| GET | /api/operations | Get operational overview of all active agent sessions with status and metrics. |
  
****Approvals****  

| Method | Path | Description |
| ------ | ---------------------------------- | -------------------------------------------------------------- |
| POST | /api/approvals/:approvalId/approve | Approve a pending action. Body: scope (once, session, always). |
| POST | /api/approvals/:approvalId/deny | Deny a pending action. |
  
****Audit****  

| Method | Path | Description |
| ------ | ---------- | ----------------------------------------------------------------------- |
| GET | /api/audit | Get audit trail entries. Query: type, session, from, to, limit, offset. |
  
****Gateway Proxy****  

| Method | Path | Description |
| ------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| ANY | /api/hermes-proxy/* | Transparent proxy to the Hermes Gateway. Forwards any request path and method. Used for direct gateway access from custom integrations. |
  
****13. Configuration Reference****  
**localStorage Settings (Zustand Store)**  
## **Client-side settings are managed by a Zustand store with localStorage persistence. The store key is **hermes-studio-settings**.**  

| Key | Type | Default | Description |
| ----------------------- | ----------------------------------------- | -------- | ------------------------------------------------------- |
| hermesUrl | string | "" | Gateway server URL (e.g., http://localhost:8642) |
| hermesToken | string | "" | Bearer token for gateway authentication |
| hermesApiKey | string | "" | API server key for non-loopback Hermes instances |
| theme | "system" \| "dark" | "system" | Color scheme preference |
| accentColor | "orange" \| "purple" \| "blue" \| "green" | "blue" | UI accent color |
| editorFontSize | number | 13 | Monaco editor font size in pixels |
| editorWordWrap | boolean | true | Enable word wrapping in the editor |
| editorMinimap | boolean | false | Show code minimap in editor gutter |
| notificationsEnabled | boolean | true | Enable browser notifications |
| usageThreshold | number | 80 | Context usage warning threshold (%) |
| smartSuggestionsEnabled | boolean | false | Enable smart model suggestions based on task complexity |
| preferredBudgetModel | string | "" | Preferred model for cost-sensitive tasks |
| preferredPremiumModel | string | "" | Preferred model for complex/premium tasks |
| onlySuggestCheaper | boolean | false | Only suggest cheaper model alternatives |
| showSystemMetricsFooter | boolean | false | Show system metrics in the footer bar |
| mobileChatNavMode | "dock" \| "integrated" \| "scroll-hide" | "dock" | Mobile navigation mode for chat screen |
  
****Additional localStorage Keys****  

| Key | Description |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| hermes-theme | Active visual theme ID (hermes-os, hermes-official, hermes-classic, hermes-slate, hermes-mono) |
| hermes-studio:office-layout | Conductor office view layout preference (grid, roundtable, warroom) |
| hermes-studio:conductor-settings | Conductor configuration (orchestrator model, worker model, projects dir, max parallel, supervised) |
| hermes-studio:mission-history | Array of completed conductor missions (max 50 entries) |
  
****Gateway Configuration****  
## **The Hermes Gateway is configured via **~/.hermes/config.yaml**. Studio reads and writes this configuration through the **/api/hermes-config** endpoint. Key configuration sections:**  
```
# ~/.hermes/config.yaml
server:
  host: 0.0.0.0
  port: 8642
  cors_origins: ["*"]

auth:
  token: "your-bearer-token"
  password: "your-login-password"

providers:
  anthropic:
    api_key: "sk-ant-..."
    default_model: "claude-sonnet-4-20250514"
  openai:
    api_key: "sk-..."
    default_model: "gpt-4o"

sessions:
  persistence: redis  # or "file"
  redis_url: "redis://localhost:6379"
  max_sessions: 50

skills:
  directory: "~/.hermes/skills"
  auto_enable: true

memory:
  directory: "~/.hermes/memory"

jobs:
  directory: "~/.hermes/jobs"
  max_concurrent: 3

```
**Conductor Settings**  
**Conductor settings are stored in localStorage and passed to the spawn endpoint:**  
```
{
  "orchestratorModel": "",       // Empty = gateway default
  "workerModel": "",             // Empty = gateway default
  "projectsDir": "/tmp",         // Output directory for workers
  "maxParallel": 3,              // 1-5 concurrent workers
  "supervised": false            // Require approvals for workers
}

```
**File-Backed Stores**  
## **Several data stores use the **.runtime/** directory within the Huminic Studio installation:**  
**.runtime/crews.json**  
**Crew definitions and member configurations.**  
**.runtime/tasks.json**  
**Task board state (all tasks across all columns).**  
**.runtime/agents.json**  
**Custom agent definitions created via the agent editor.**  
**.runtime/templates/**  
**User-created crew templates (one JSON file per template).**  
**Environment Variables**  

| Variable | Default | Description |
| ---------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| HERMES_API_URL | http://127.0.0.1:8642 | URL of the Hermes Gateway server. The Studio server connects here for all gateway operations. |
| HERMES_API_TOKEN | (none) | Bearer token for authenticating with the gateway. Sent as Authorization header on all proxy requests. |
| HERMES_PASSWORD | (none) | Password required to log into Huminic Studio. When set, the login screen is shown on first visit. |
| REDIS_URL | (none) | Redis connection URL for session token persistence. Example: redis://localhost:6379. When unset, tokens are stored in memory only. |
| NODE_ENV | development | Environment mode. In production, error messages are sanitized and debug logging is suppressed. |
| PORT | 3000 | Port number for the Huminic Studio server. |
  
****14. Design System****  
**Theme System**  
## **Huminic Studio uses a CSS custom property theming system with 5 available themes. Themes are applied by setting the **data-theme** attribute on the document root. All themes operate in dark mode only.**  

| Theme ID | Label | Description |
| --------------- | ---------------- | --------------------------------------------------------------- |
| hermes-os | Huminic OS | Electric blue cinematic agent OS theme. The default theme. |
| hermes-official | Huminic Official | Navy and indigo flagship theme with professional aesthetics. |
| hermes-classic | Huminic Classic | Bronze accents on dark charcoal for a warm, sophisticated look. |
| hermes-slate | Slate | Cool blue developer theme with subtle gradients. |
| hermes-mono | Mono | Clean monochrome grayscale for minimal distraction. |
  
****CSS Variable Tokens****  
**Every theme provides the following CSS custom properties. All UI components must use these variables rather than hard-coded colors:**  

| Variable | Purpose |
| --------------------- | ---------------------------------------------------- |
| --theme-bg | Primary background color for pages and screens |
| --theme-sidebar | Sidebar navigation background |
| --theme-panel | Panel/drawer background (slightly elevated) |
| --theme-card | Card component background (first level) |
| --theme-card2 | Card component background (second level, nested) |
| --theme-border | Primary border color for cards, inputs, dividers |
| --theme-border-subtle | Subtle border for low-emphasis separators |
| --theme-text | Primary text color (headings, labels, body) |
| --theme-muted | Secondary text color (descriptions, metadata) |
| --theme-accent | Accent color for interactive elements, links, badges |
| --theme-accent-subtle | Light accent background for highlight regions |
| --theme-accent-border | Border color for accent-highlighted containers |
  
****Accent Colors****  
**The UI accent color is configurable separately from the theme. Four accent options are available: orange, purple, blue, and green. The accent color affects interactive elements, links, selected states, badges, and focus rings throughout the application.**  
**Component Library**  
**Huminic Studio uses a design system component library for consistent UI patterns:**  
**Card**  
**Container component with themed background, border, and border-radius. Supports header slots, padding variants, and hover states.**  
**SettingsRow**  
**Horizontal layout for settings with label on the left and control on the right. Used throughout the Settings screen.**  
**SectionHeader**  
**Section title component with optional subtitle and action button slot. Provides consistent spacing and typography.**  
**StatusBadge**  
**Small pill-shaped badge for displaying status (active, idle, error, complete). Color-coded by status type.**  
**ListItem**  
**Clickable list row with optional icon, title, description, and trailing element. Used in sidebars and selection lists.**  
**EmptyState**  
**Placeholder component shown when a list or view has no content. Includes icon, title, description, and optional action button.**  
**Icon Library**  
## **Huminic Studio uses HugeIcons (**@hugeicons/react** with **@hugeicons/core-free-icons**) as its primary icon library. Icons are imported individually by name and rendered via the **HugeiconsIcon** component. The icon set provides consistent 24px stroke icons with adjustable size and color props.**  
**Typography and Spacing**  
**The application loads four font families:**  
* **		Inter** (400-700): Primary UI font for all interface text.  
* **		Space Grotesk** (400-700): Used for headings and display text.  
* **		JetBrains Mono** (400-500): Monospace font for code, terminal, and technical content.  
* **		EB Garamond** (400-800): Serif font available for editorial/creative content contexts.  
**Spacing follows Tailwind CSS conventions (4px base unit). Common spacing values: p-2 (8px), p-3 (12px), p-4 (16px), p-6 (24px), gap-2 (8px), gap-4 (16px). Border radius uses rounded-lg (8px) for cards and rounded-xl (12px) for larger containers.**  
**15. Gateway Integration**  
**Capability Probing**  
**On server startup and periodically every 120 seconds, Huminic Studio probes the configured gateway to determine available API groups. The probing process:**  
* 		Send a GET request to the gateway health endpoint with a 3-second timeout.  
* 		If health responds, probe core capabilities: chat completions, models, streaming support.  
* 		If core capabilities are confirmed, probe enhanced capabilities: sessions, skills, memory, config, jobs.  
* 		Cache results with a 120-second TTL. Subsequent requests use cached capabilities without re-probing.  
* 		If probing fails (timeout, network error), all capabilities are marked as unavailable.  
**Enhanced vs Basic Mode**  
**Based on probing results, Studio operates in one of three chat modes:**  
**enhanced-hermes**  
**Full Hermes gateway with session management, tools, approvals, memory, and skills. All features are available.**  
**portable**  
**Basic OpenAI-compatible chat completions. Only streaming chat is available. No sessions, tools, or approvals.**  
**disconnected**  
**No gateway connectivity. The UI shows connection error state with retry options.**  
**Fallback Behavior**  
**When enhanced capabilities are unavailable, Studio degrades gracefully:**  
* 		Chat falls back to portable mode using /api/send and /api/send-stream for direct completions.  
* 		Crews, Conductor, Jobs, Skills, Memory, and Files screens show connection-required empty states.  
* 		The sidebar badges indicate which features require enhanced connectivity.  
* 		Settings remain fully functional (stored locally) regardless of connection status.  
**Session Persistence Backends**  
**The Hermes Gateway supports two persistence backends for session data:**  
**Redis**  
## **Recommended for production. Messages stored in sorted sets, session metadata in hashes. Supports TTL expiration, atomic operations, and multi-process access. Requires **REDIS_URL** environment variable.**  
**File**  
## **Fallback for development or single-user setups. Session data stored as JSON files in **.runtime/sessions/**. Simpler to deploy but lacks TTL management and concurrent access safety.**  
**Bearer Token Authentication**  
**The Studio server authenticates with the gateway using a Bearer token. The token is configured via:**  
* **		Environment variable:** HERMES_API_TOKEN (highest priority)  
* **		Client setting:** hermesToken in the Zustand settings store  
* **		Gateway config:** The auth.token field in ~/.hermes/config.yaml  
## **The token is sent as **Authorization: Bearer <token>** on all requests from the Studio server to the gateway. If no token is configured, requests are sent without authentication (suitable for localhost-only deployments).**  
**16. Security**  
**Authentication Strategies**  
**Huminic Studio supports multiple authentication methods:**  
* **		Password authentication:** When HERMES_PASSWORD is set, users must authenticate via a login form. On success, a 32-byte cryptographically random session token is generated and stored.  
* **		OAuth device code flow:** For integrations with external identity providers. Initiates via /api/oauth/device-code and polls for completion via /api/oauth/poll-token.  
* **		API key authentication:** The hermesApiKey setting supports non-loopback deployments where an API server key is required for access.  
* **		No authentication:** When no password or token is configured, Studio allows unauthenticated access. Suitable only for localhost development.  
**Session Token Management**  
## **Session tokens are 64-character hex strings generated from 32 bytes of **crypto.randomBytes**. Tokens are validated using timing-safe comparison to prevent timing attacks. Token storage:**  
* 		In-memory Set for fast validation (source of truth for the running process).  
* 		Redis SET (hermes:studio:tokens) for persistence across restarts, with 30-day TTL.  
* 		On startup, persisted tokens are loaded from Redis into the in-memory set.  
**CSRF Protection**  
## **All mutating endpoints (POST, PUT, PATCH, DELETE) are protected by the **requireJsonContentType** middleware. This function rejects requests that do not include **Content-Type: application/json**. Since browsers cannot set this header on simple form submissions or navigation requests, its presence proves the request originated from JavaScript (fetch/XHR), effectively preventing CSRF attacks without requiring tokens.**  
## **Requests failing this check receive a **415 Unsupported Media Type** response with the message "Content-Type must be application/json".**  
**Path Traversal Prevention**  
## **File access endpoints (**/api/files**, **/api/memory/read**, **/api/memory/write**) validate and sanitize all path parameters to prevent directory traversal attacks. Paths are resolved against the workspace root and rejected if they attempt to escape the allowed directory tree using **..** sequences or absolute paths outside the scope.**  
**Rate Limiting**  
**A sliding-window in-memory rate limiter protects sensitive endpoints:**  
* 		Rate limiting is applied per client IP (extracted from X-Forwarded-For header or defaulting to "local").  
* 		The sliding window tracks request timestamps and removes entries outside the window period.  
* 		When a client exceeds the limit, a 429 Too Many Requests response is returned.  
* 		Old entries are garbage-collected every 5 minutes to prevent memory leaks.  
* 		Authentication endpoints use stricter limits to prevent brute-force attacks.  
**Content-Security-Policy**  
**The application sets appropriate Content-Security-Policy headers to restrict resource loading:**  
* 		Scripts are restricted to same-origin with inline allowances for the build system.  
* 		Styles allow same-origin and Google Fonts CDN for font loading.  
* 		Connections are restricted to same-origin and the configured gateway URL.  
* 		Images allow same-origin and data: URIs for base64-encoded content.  
**17. Keyboard Shortcuts**  
**Huminic Studio provides keyboard shortcuts for fast navigation and common actions. Modifier keys: Ctrl on Windows/Linux, Cmd on macOS.**  
**Global Navigation**  

| Shortcut | Action                                  |
| -------- | --------------------------------------- |
| Ctrl + K | Open command palette / quick navigation |
| Ctrl + , | Open Settings                           |
| Ctrl + 1 | Navigate to Dashboard                   |
| Ctrl + 2 | Navigate to Chat                        |
| Ctrl + 3 | Navigate to Crews                       |
| Ctrl + 4 | Navigate to Conductor                   |
| Ctrl + 5 | Navigate to Tasks                       |
| Ctrl + 6 | Navigate to Jobs                        |
| Ctrl + 7 | Navigate to Memory                      |
| Ctrl + 8 | Navigate to Skills                      |
| Ctrl + 9 | Navigate to Agents                      |
| Ctrl + B | Toggle sidebar visibility               |
  
****Chat Screen****  

| Shortcut         | Action                                            |
| ---------------- | ------------------------------------------------- |
| Enter            | Send message                                      |
| Shift + Enter    | New line in message (without sending)             |
| Ctrl + N         | Create new session                                |
| Ctrl + Shift + A | Approve pending action                            |
| Ctrl + Shift + D | Deny pending action                               |
| Escape           | Cancel current streaming response / close overlay |
| Ctrl + /         | Toggle inspector panel                            |
| Ctrl + L         | Clear chat display (does not delete history)      |
  
****File Editor****  

| Shortcut         | Action                         |
| ---------------- | ------------------------------ |
| Ctrl + S         | Save current file              |
| Ctrl + P         | Quick file open (fuzzy search) |
| Ctrl + Shift + F | Search across files            |
| Ctrl + Z         | Undo                           |
| Ctrl + Shift + Z | Redo                           |
| Ctrl + G         | Go to line number              |
  
****Tasks Board****  

| Shortcut         | Action                          |
| ---------------- | ------------------------------- |
| Ctrl + Shift + N | Create new task                 |
| Escape           | Close task dialog               |
| Ctrl + Enter     | Save task (when dialog is open) |
  
****Conductor****  

| Shortcut         | Action                  |
| ---------------- | ----------------------- |
| Ctrl + Enter     | Submit mission goal     |
| Ctrl + Shift + S | Open conductor settings |
| Escape           | Close settings drawer   |
  
****Terminal****  

| Shortcut         | Action                           |
| ---------------- | -------------------------------- |
| Ctrl + Shift + C | Copy selected text from terminal |
| Ctrl + Shift + V | Paste into terminal              |
| Ctrl + Shift + T | Open new terminal tab            |
  

| Shortcut         | Action                           |
| ---------------- | -------------------------------- |
| Ctrl + Shift + C | Copy selected text from terminal |
| Ctrl + Shift + V | Paste into terminal              |
| Ctrl + Shift + T | Open new terminal tab            |
  
