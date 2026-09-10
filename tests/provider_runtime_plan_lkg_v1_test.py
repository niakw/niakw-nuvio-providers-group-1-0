#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "provider_runtime_plan_lkg_v1.py"
spec = importlib.util.spec_from_file_location("runtime_plan_lkg", SCRIPT)
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root / "providers").mkdir()
    green_model = {
        "routes": ["/?s={query}", "/anime/{slug}/", "/anime/{slug}/saison-{season}/episode-{episode}/"],
        "providerValuePlan": [],
        "searchRequestPlan": [],
        "externalIdentityPlan": [],
    }
    red_model = {"routes": ["/?s={query}", "/show/{slug}/"]}

    def provider_file(name: str, model: dict) -> tuple[str, str]:
        rel = f"providers/{name}.js"
        text = "const NIAKVIO_PROVIDER_MODEL = Object.freeze(" + json.dumps(model, separators=(",", ":")) + ");\n"
        (root / rel).write_text(text, encoding="utf-8")
        return rel, hashlib.sha256(text.encode()).hexdigest()

    green_file, green_sha = provider_file("green", green_model)
    red_file, red_sha = provider_file("red", red_model)
    bad_file, _bad_sha = provider_file("badhash", {"routes": ["/?s={query}"]})

    write_json(root / "manifest.json", {"scrapers": [
        {"id": "green", "filename": green_file},
        {"id": "red", "filename": red_file},
        {"id": "badhash", "filename": bad_file},
    ]})
    write_json(root / "provider-v3-materialization.json", {"generation": "g1", "sourceSha": "abc", "providers": [
        {"provider": "green", "file": green_file, "sha256": green_sha},
        {"provider": "red", "file": red_file, "sha256": red_sha},
        {"provider": "badhash", "file": bad_file, "sha256": "0" * 64},
    ]})
    write_json(root / "baseline.json", {"rows": [
        {"provider_id": "green", "semantic_type": "anime", "playable": 1, "verified": 1, "contradictions": 0},
        {"provider_id": "red", "semantic_type": "anime", "playable": 0, "verified": 0, "contradictions": 0},
        {"provider_id": "badhash", "semantic_type": "movie", "playable": 1, "verified": 1, "contradictions": 0},
        {"provider_id": "red", "semantic_type": "movie", "playable": 1, "verified": 1, "contradictions": 1},
    ]})
    snapshot_path = root / "snapshot.json"
    snapshot = mod.capture(
        root=root,
        baseline_path=root / "baseline.json",
        manifest_path=root / "manifest.json",
        materialization_path=root / "provider-v3-materialization.json",
        snapshot_path=snapshot_path,
    )
    assert set(snapshot["providers"]) == {"green"}, snapshot
    assert snapshot["rejected"]["badhash"] == "materialization-sha-mismatch"
    assert "red" not in snapshot["providers"]

    original_route_data = [{"route": "/anime/{slug}/", "validationState": "candidate", "executedEvidence": False}]
    write_json(root / "knowledge.json", {"providers": {
        "green": {"model": {
            "routes": ["/anime/{slug}/"],
            "routeData": original_route_data,
            "routeProof": {"provenRouteCount": 14},
        }},
        "red": {"model": {"routes": ["/show/{slug}/"]}},
    }})
    write_json(root / "overrides.json", {"provider_patches": {
        "green": {"learned_routes": ["/anime/{slug}/"], "route_proof": {"provenRouteCount": 14}},
        "red": {"learned_routes": ["/show/{slug}/"]},
    }})

    result = mod.apply(
        snapshot_path=snapshot_path,
        knowledge_path=root / "knowledge.json",
        overrides_path=root / "overrides.json",
    )
    assert result["changedProviders"] == ["green"], result

    knowledge = json.loads((root / "knowledge.json").read_text())
    overrides = json.loads((root / "overrides.json").read_text())
    green = knowledge["providers"]["green"]["model"]
    patch = overrides["provider_patches"]["green"]

    expected = ["/?s={query}", "/anime/{slug}/", "/anime/{slug}/saison-{season}/episode-{episode}/"]
    assert green["routes"] == expected, green["routes"]
    assert patch["learned_routes"] == expected, patch["learned_routes"]
    assert green["routeData"] == original_route_data, green["routeData"]
    assert green["routeProof"] == {"provenRouteCount": 14}, green["routeProof"]
    assert green["runtimePlanLkg"]["proofPromotion"] is False
    assert green["runtimePlanLkg"]["activationAuthority"] is False
    assert "runtime_plan_lkg" not in overrides["provider_patches"]["red"]

    green["routes"].append("/new/{tmdbId}")
    patch["learned_routes"].append("/new/{tmdbId}")
    write_json(root / "knowledge.json", knowledge)
    write_json(root / "overrides.json", overrides)
    mod.apply(
        snapshot_path=snapshot_path,
        knowledge_path=root / "knowledge.json",
        overrides_path=root / "overrides.json",
    )
    knowledge2 = json.loads((root / "knowledge.json").read_text())
    assert knowledge2["providers"]["green"]["model"]["routes"][-1] == "/new/{tmdbId}"

print("provider runtime plan LKG v1 tests passed: verified current bundle plan preserved without proof promotion")
