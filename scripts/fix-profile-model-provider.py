#!/usr/bin/env python3
"""Point a Hermes profile's gateway inference at OpenAI (GAP-LIVE-001).

Scaffold profile config.yaml files set `model: default` (a bare scalar) or a
bare model name like `model: gpt-4o`. The Hermes gateway resolves a bare model
with no provider via its built-in default provider order (openrouter, nous, ...),
and with no OPENROUTER_API_KEY every inference call fails 401 "Missing
Authentication header". The working customer profiles (huminic, cedar-ridge) and
the global ~/.hermes/config.yaml use a structured block pointing at OpenAI. This
normalises any profile to that structured block, preserving a real model choice.

Idempotent: a profile whose `model` is already a dict with a provider is left
untouched. Backs up the original to config.yaml.bak.<ts> before writing.

Usage: python3 fix-profile-model-provider.py <profile-config.yaml> <timestamp>
"""
import sys, yaml, shutil, os

OPENAI_BASE = "https://api.openai.com/v1"


def normalise(path, ts):
    with open(path) as f:
        cfg = yaml.safe_load(f) or {}

    model = cfg.get("model")
    if isinstance(model, dict) and model.get("provider"):
        return "skip (already structured)"

    # Decide the default model name to keep.
    if isinstance(model, str) and model not in ("", "default"):
        default_model = model            # preserve a real choice e.g. gpt-4o
    else:
        default_model = "gpt-4.1"        # 'default'/empty -> match global/customers

    cfg["model"] = {
        "default": default_model,
        "provider": "custom",
        "base_url": OPENAI_BASE,
        "api_mode": "chat_completions",
    }
    providers = cfg.get("providers") or {}
    custom = providers.get("custom") or {}
    custom.setdefault("request_timeout_seconds", 600)
    custom.setdefault("stale_timeout_seconds", 900)
    providers["custom"] = custom
    cfg["providers"] = providers

    shutil.copy2(path, f"{path}.bak.{ts}")
    with open(path, "w") as f:
        yaml.safe_dump(cfg, f, sort_keys=False, default_flow_style=False)
    return f"fixed (default={default_model})"


if __name__ == "__main__":
    path, ts = sys.argv[1], sys.argv[2]
    print(f"{os.path.basename(os.path.dirname(path))}: {normalise(path, ts)}")
