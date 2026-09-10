#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "scripts" / "provider_live_baseline.py"
spec = importlib.util.spec_from_file_location("provider_live_baseline", POLICY)
assert spec is not None and spec.loader is not None
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)

manifest = {
    "version": "5.21.37",
    "scrapers": [
        {
            "id": "castle",
            "enabled": True,
            "filename": "providers/castle--nuvio--aaa.js",
            "canonicalSupportedTypes": ["movie", "tv"],
        },
        {
            "id": "partial",
            "enabled": True,
            "filename": "providers/partial--nuvio--bbb.js",
            "canonicalSupportedTypes": ["movie", "tv"],
        },
    ],
}
locks = {
    "schemaVersion": 1,
    "catalogueProviderCount": 2,
    "baselineManifestVersion": "5.21.37",
    "providers": {
        "castle": {
            "bundle": "providers/castle--nuvio--aaa.js",
            "protectedLanes": ["movie", "tv"],
            "completeProvider": True,
        },
        "partial": {
            "bundle": "providers/partial--nuvio--bbb.js",
            "protectedLanes": ["movie"],
            "completeProvider": False,
        },
    },
}

assert policy.baseline_lock_errors(manifest, locks) == []
assert policy.fully_green_provider_ids(manifest, locks) == {"castle"}

candidate = json.loads(json.dumps(manifest))
candidate["scrapers"][0]["filename"] = "providers/castle--nuvio--ccc.js"
errors = policy.candidate_replacement_errors(candidate, locks, None)
assert any("no live A/B proof" in value for value in errors)

ab = {
    "providers": {
        "castle": {
            "baselineBundle": "providers/castle--nuvio--aaa.js",
            "candidateBundle": "providers/castle--nuvio--ccc.js",
            "lanes": {
                "movie": {
                    "passed": True,
                    "noRegression": True,
                    "baseline": {"raw": 1, "playable": 1, "verified": 1, "contradictions": 0},
                    "candidate": {"raw": 1, "playable": 1, "verified": 1, "contradictions": 0},
                },
                "tv": {
                    "passed": True,
                    "noRegression": True,
                    "baseline": {"raw": 1, "playable": 1, "verified": 1, "contradictions": 0},
                    "candidate": {"raw": 2, "playable": 2, "verified": 2, "contradictions": 0},
                },
            },
        }
    }
}
assert policy.candidate_replacement_errors(candidate, locks, ab) == []

ab["providers"]["castle"]["lanes"]["tv"]["candidate"]["verified"] = 0
assert any(":tv:" in value for value in policy.candidate_replacement_errors(candidate, locks, ab))

candidate_partial = json.loads(json.dumps(manifest))
candidate_partial["scrapers"][1]["filename"] = "providers/partial--nuvio--ddd.js"
partial_ab = {
    "providers": {
        "partial": {
            "baselineBundle": "providers/partial--nuvio--bbb.js",
            "candidateBundle": "providers/partial--nuvio--ddd.js",
            "lanes": {
                "movie": {
                    "passed": True,
                    "noRegression": True,
                    "baseline": {"raw": 1, "playable": 1, "verified": 1, "contradictions": 0},
                    "candidate": {"raw": 1, "playable": 1, "verified": 1, "contradictions": 0},
                }
            },
        }
    }
}
assert policy.candidate_replacement_errors(candidate_partial, locks, partial_ab) == []
print("provider live baseline policy tests passed")
