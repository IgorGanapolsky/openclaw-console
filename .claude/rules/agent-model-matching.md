# Agent-Model Matching

## Task Categories & Fallback Chains

Match the right "brain" to the right task to maximize effectiveness, speed, and cost-efficiency.

| Category | Description | Primary Model | Fallback 1 | Fallback 2 |
| :--- | :--- | :--- | :--- | :--- |
| **UltraBrain** | Deep architectural logic, multi-file reasoning, complex bug hunting | `claude-sonnet-4` | `claude-opus-4` | `gpt-4o` |
| **Deep** | Large-scale refactoring, complex feature implementation | `claude-opus-4` | `gpt-4o` | `gemini-2.5-pro` |
| **Quick** | Codebase search, file analysis, scaffolding, simple tests | `claude-haiku-4` | `gemini-2.5-flash` | `gpt-4o-mini` |
| **Visual** | UI/UX implementation, layout debugging, multimodal tasks | `gemini-2.5-pro` | `gpt-4o` | `claude-sonnet-4` |

## Resolution Logic

When an agent is invoked via the `Task` tool:
1. **Check Agent Category**: Refer to the agent's frontmatter (e.g., `category: Quick`).
2. **Resolve Model**: Use the Primary Model for that category.
3. **Handle Availability**: If the Primary is hitting rate limits or unavailable, proceed down the Fallback Chain.
4. **Environment Check**: Prioritize models where the local environment has active API keys/provider access.
