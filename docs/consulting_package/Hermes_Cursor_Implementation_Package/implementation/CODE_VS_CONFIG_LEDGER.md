# Code vs Config Ledger

## Config-first items
These should be implemented primarily through files and configuration:
- Hermes profile creation
- SOUL instructions
- wiki structure
- report specs
- workflow pages
- governance pages
- `.env.example` templates
- `mcp.json` placeholders
- Kanban role assumptions

## Code-light items
These may use small local scripts if helpful:
- directory bootstrapping
- git initialization
- validation checks
- copying template files into profiles

## Deferred code-heavy items
These should remain deferred until after Pillar 1 is stable:
- final Data Brain physical schema implementation
- projection services
- connector-specific data sync code
- advanced semantic retrieval stack
- production-grade MCP service implementations
