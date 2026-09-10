#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "scripts" / "discover_provider_hub_sources.py"
spec = importlib.util.spec_from_file_location("hub_discovery", PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

existing_hub = {
    "hub": "https://good.example/hub",
    "sources": [],
}
assert module.provider_is_protected(existing_hub)
assert not module.apply_candidate(existing_hub, {
    "url": "https://bad.example/hub",
    "type": "hub",
    "purpose": "test",
})
assert existing_hub["hub"] == "https://good.example/hub"

existing_telegram = {
    "hub": None,
    "sources": [{"type": "telegram_public", "url": "https://t.me/s/provider"}],
}
assert module.provider_is_protected(existing_telegram)
assert not module.apply_candidate(existing_telegram, {
    "url": "https://provider.wiki",
    "type": "hub",
})

missing = {"hub": None, "sources": [{"type": "search", "query": "provider address"}]}
assert not module.provider_is_protected(missing)
assert module.apply_candidate(missing, {
    "url": "https://provider.wiki",
    "type": "hub",
    "purpose": "test authoritative hub",
})
assert missing["hub"] == "https://provider.wiki/"
assert any(source.get("type") == "hub" for source in missing["sources"])

# A direct provider terminal is not itself an address hub candidate.
row = {
    "direct": "https://provider.example/",
    "direct_candidates": ["https://provider.example/"],
    "allowed_terminal_hosts": ["provider.example"],
}
assert not module.safe_source_host(row, "https://provider.example/")
assert module.safe_source_host(row, "https://provider.wiki/")

# Keep structural policy assertions, but do not couple safety to a source-code
# comment. The behavioral assertions above are the real non-regression gate.
source = PATH.read_text(encoding="utf-8")
assert "provider_is_protected(row)" in source
assert 'confirmations") or 0) >= 2' in source

print("provider hub source discovery guard test: ok")
