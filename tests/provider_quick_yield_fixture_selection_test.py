#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "audit_provider_quick_yield.py"
spec = importlib.util.spec_from_file_location("audit_provider_quick_yield", SCRIPT)
assert spec is not None and spec.loader is not None
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


tasks, provider_count = mod.build_tasks()
assert provider_count == 96, provider_count


def task(provider: str, semantic: str) -> dict:
    matches = [
        row for row in tasks
        if row.get("provider_id") == provider and row.get("semantic_type") == semantic
    ]
    assert len(matches) == 1, (provider, semantic, len(matches))
    return matches[0]


# Anime catalogues may expose a movie semantic lane specifically for anime films.
# The corpus already owns that proof fixture; do not test those lanes with a
# generic live-action movie such as Interstellar.
for provider in ("anime-sama", "animesama-co", "animevostfr", "french-manga"):
    row = task(provider, "movie")
    fixture = row["fixture"]
    assert fixture.get("title") == "Jujutsu Kaisen 0", (provider, fixture)
    assert fixture.get("animeMovie") is True, (provider, fixture)
    assert str(fixture.get("tmdbId")) == "810693", (provider, fixture)

# Generic/mixed movie providers keep the representative general movie fixture.
for provider in ("castle", "papadustream"):
    row = task(provider, "movie")
    fixture = row["fixture"]
    assert fixture.get("title") == "Interstellar", (provider, fixture)
    assert fixture.get("animeMovie") is not True, (provider, fixture)

# The anime episodic semantic lane remains independent from the movie transport.
anime = task("anime-sama", "anime")["fixture"]
assert anime.get("title") == "Jujutsu Kaisen"
assert anime.get("mediaType") == "anime"

print("provider quick-yield fixture selection passed: anime-film movie lanes use JJK0; general movie lanes use Interstellar")
