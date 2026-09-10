#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CURRENT_MANIFEST = ROOT / "manifest.json"
QUICK_YIELD = ROOT / "provider-v3-quick-yield.json"
RETENTION = ROOT / "providers" / ".generation-retention.json"
LEARN_HANDOFF = ROOT / "automation" / "provider-repair-learn-handoff-v1.json"
EVIDENCE = ROOT / "automation" / "provider-history-evidence-v1.json"
OUT_JSON = ROOT / "automation" / "provider-history-matrix.json"
OUT_MD = ROOT / "automation" / "PROVIDER-HISTORY-MATRIX.md"
EXPECTED = 96
PRIORITY = {"anime-sama","purstream","flemmix","uhdmovies","movieshunt","zinkmovies","vegamovies","hindmoviez","4khdhub","4khdhubnew","persianstremio","desiflix"}
VF_GUARDS = {"kehflix","streamzo"}

def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))

def canon(value: Any) -> str:
    return str(value or "").strip().casefold()

def manifest_map(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {canon(r.get("id")): r for r in (data.get("scrapers") or []) if isinstance(r, dict) and canon(r.get("id"))}

def git_show_json(ref: str, path: str) -> dict[str, Any]:
    p = subprocess.run(["git","show",f"{ref}:{path}"], cwd=ROOT, text=True, capture_output=True, check=False)
    if p.returncode != 0:
        return {}
    try:
        return json.loads(p.stdout)
    except json.JSONDecodeError:
        return {}

def short_hash(filename: Any) -> str:
    text = str(filename or "")
    for rx in (r"--([0-9a-f]{16})\.js$", r"--published-baseline--([0-9a-f]{16})\.js$", r"-([0-9a-f]{16})\.js$"):
        m = re.search(rx, text, re.I)
        if m:
            return m.group(1).lower()
    return "—"

def snapshot_cell(row: dict[str, Any] | None) -> str:
    if not row:
        return "—"
    return f"{row.get('version') or '?'} / `{short_hash(row.get('filename'))}`"

def lanes_from_rows(rows: list[dict[str, Any]], key: str = "semantic_type") -> dict[str,str]:
    out = {}
    for r in rows:
        media = canon(r.get(key))
        s = str(r.get("status") or "unknown")
        out[media] = "verified" if s == "playable_verified" else "wrong-content" if s == "wrong_content" else "zero" if s == "no_streams" else s
    return out

def lanes_text(lanes: dict[str,str]) -> str:
    if not lanes:
        return "—"
    icon = {"verified":"✓","wrong-content":"⚠","zero":"0"}
    order = [x for x in ("movie","tv","anime") if x in lanes] + sorted(x for x in lanes if x not in {"movie","tv","anime"})
    return " ".join(f"{x}:{icon.get(lanes[x],lanes[x])}" for x in order)

def guard_lanes(entry: dict[str,Any] | None) -> dict[str,str]:
    if not entry:
        return {}
    rows = []
    for r in entry.get("lanes") or []:
        rows.append({"semantic_type": r.get("mediaType"), "status": r.get("status")})
    return lanes_from_rows(rows)

def current_guard_map(evidence: dict[str,Any]) -> dict[str,dict[str,Any]]:
    out = {}
    ci = evidence.get("ciEvidence") or {}
    for key in ("published_priority_guard","published_vf_guard"):
        for pid, row in ((ci.get(key) or {}).get("providers") or {}).items():
            out[canon(pid)] = row
    return out

def field_positive_by_provider(evidence: dict[str,Any]) -> dict[str,list[dict[str,Any]]]:
    out = {}
    for row in evidence.get("fieldEvidence") or []:
        if not str(row.get("environment") or "").startswith("TV "):
            continue
        for pid in row.get("positiveProviders") or []:
            out.setdefault(canon(pid), []).append(row)
    return out

def family(rows: list[dict[str,Any]]) -> str:
    vals = []
    for r in rows:
        v = str((r.get("debug_model") or {}).get("source_runtime_family") or "")
        if v and v not in vals:
            vals.append(v)
    return ", ".join(vals) if vals else "—"

def candidate_green(evidence: dict[str,Any]) -> set[str]:
    ci = evidence.get("ciEvidence") or {}
    out = {canon(x) for x in ((ci.get("run87_reconstruction") or {}).get("verifiedProviders") or [])}
    out |= {canon(x) for x in ((ci.get("repair_run95") or {}).get("verifiedProviders") or [])}
    return out

def classify(pid: str, baseline: dict[str,str], guard: dict[str,str], field_rows: list[dict[str,Any]], candidate: bool, learn_owned: bool, old_replay: dict[str,str]) -> tuple[str,str,str]:
    field_ok = bool(field_rows)
    gv = set(guard.values())
    hist_green = "verified" in set(baseline.values())
    all_guard_green = bool(guard) and gv <= {"verified"}
    partial = "verified" in gv and ("zero" in gv or "wrong-content" in gv)
    wrong = "wrong-content" in gv
    if pid == "kehflix" and hist_green and guard and not all_guard_green and old_replay and "verified" not in set(old_replay.values()):
        return "UPSTREAM_DRIFT", "5.21.36 was historically green, but replaying the old 5.21.36 bytes against today's backend also fails.", "P1 LEARN/upstream refresh; do not rewrite Core as a fake regression fix."
    if pid == "streamzo" and field_ok and (wrong or "wrong-content" in set(old_replay.values())):
        return "PARTIAL_PROTECT", "Movie is field/current green; TV wrong-content is reproduced by historical 5.21.36 bytes.", "P0 TV identity in LEARN; freeze movie path."
    if field_ok:
        if wrong or partial:
            return "PARTIAL_PROTECT", "Current TV field evidence is positive, but CI exposes at least one bad/zero lane.", "Freeze proven field lanes; LEARN only the bad lanes."
        return "PROTECT", "Current published manifest has direct TV field evidence.", "Immutable live baseline; A/B required before replacement."
    if all_guard_green:
        return "PROTECT", "Current published-byte guard verifies every requested lane.", "Immutable live baseline; A/B required before replacement."
    if guard:
        if wrong or partial:
            return "PARTIAL", "Current published bytes have at least one verified lane and at least one failing/contradictory lane.", "Preserve green lanes; LEARN failing lanes."
        return "CURRENT_RED", "Current published-byte guard returns no verified requested lane.", "LEARN/diagnose; compare history before any Core change."
    if candidate:
        return "CANDIDATE_GREEN", "A recent reconstruction candidate verified live, but this is not equivalent to current published-byte proof.", "Keep candidate; A/B against published bytes before promotion."
    if hist_green:
        return "HISTORICAL_GREEN_UNRETESTED", "5.21.36 census had at least one verified lane; no newer published-byte guard is recorded here.", "Retest published bytes before touching route/data."
    if learn_owned:
        return "LEARN", "Residual repair debt is already handed to LEARN.", "Do not spend manual Repair loops unless a shared family fix is proven."
    return "UNVERIFIED", "No current positive evidence is recorded.", "Continue portfolio sweep; route/data debt goes to LEARN after bounded attempts."

def main() -> int:
    current = load_json(CURRENT_MANIFEST)
    quick = load_json(QUICK_YIELD)
    retention = load_json(RETENTION)
    learn = load_json(LEARN_HANDOFF)
    evidence = load_json(EVIDENCE)
    current_map = manifest_map(current)
    if len(current_map) != EXPECTED:
        raise SystemExit(f"expected {EXPECTED} current providers, got {len(current_map)}")
    snaps = evidence.get("snapshots") or {}
    tag0 = manifest_map(git_show_json(str((snaps.get("tag_5_21_0") or {}).get("ref") or "5.21.0"), "manifest.json"))
    tag16 = manifest_map(git_show_json(str((snaps.get("tag_5_21_16") or {}).get("ref") or "5.21.16"), "manifest.json"))
    rel36_ref = str((snaps.get("release_5_21_36") or {}).get("ref") or "b4d5bff4c2e3b8e9944c1eaaf8ae9690cb00d5cf")
    rel36 = manifest_map(git_show_json(rel36_ref, "manifest.json"))
    q36 = git_show_json(rel36_ref, "provider-v3-quick-yield.json")
    by36 = {}
    for r in q36.get("rows") or []:
        by36.setdefault(canon(r.get("provider_id")), []).append(r)
    byq = {}
    for r in quick.get("rows") or []:
        byq.setdefault(canon(r.get("provider_id")), []).append(r)
    learn_map = {canon(k):v for k,v in ((learn.get("providers") or {}).items())}
    field = field_positive_by_provider(evidence)
    guards = current_guard_map(evidence)
    candidates = candidate_green(evidence)
    old_guard = {canon(pid):guard_lanes(row) for pid,row in ((((evidence.get("ciEvidence") or {}).get("historical_5_21_36_replay") or {}).get("providers") or {}).items())}
    retention_order = retention.get("order") or {}
    rows_out = []
    for pid, cur in sorted(current_map.items()):
        qrows = byq.get(pid) or []
        # Exact-history rule: a missing 5.21.36 observation stays missing. Never
        # fill historical evidence with today's quick-yield rows.
        baseline = lanes_from_rows(by36.get(pid) or [])
        guard = guard_lanes(guards.get(pid))
        field_rows = field.get(pid) or []
        klass, verdict, action = classify(pid, baseline, guard, field_rows, pid in candidates, pid in learn_map, old_guard.get(pid) or {})
        gens = retention_order.get(pid) or []
        types = cur.get("canonicalSupportedTypes") or cur.get("supportedTypes") or []
        rows_out.append({
            "provider":pid,
            "name":str(cur.get("name") or pid),
            "types":[canon(x) for x in types],
            "languages":[canon(x) for x in (cur.get("contentLanguage") or [])],
            "family":family(qrows),
            "snapshots":{"5.21.0":snapshot_cell(tag0.get(pid)),"5.21.16":snapshot_cell(tag16.get(pid)),"5.21.36":snapshot_cell(rel36.get(pid)),str(current.get("version") or "current"):snapshot_cell(cur)},
            "retainedGenerationCount":len(gens),
            "publishedBaselineRetained":any("--published-baseline--" in str(x) for x in gens),
            "historical52136":baseline,
            "currentPublishedGuard":guard,
            "currentTvField":[{"fixture":str(x.get("fixture") or ""),"semanticType":canon(x.get("semanticType"))} for x in field_rows],
            "learnOwned":pid in learn_map,
            "priority":pid in PRIORITY,
            "vfRegressionGuard":pid in VF_GUARDS,
            "classification":klass,
            "historyVerdict":verdict,
            "action":action,
        })
    if len(rows_out) != EXPECTED:
        raise SystemExit(f"expected {EXPECTED} matrix rows, got {len(rows_out)}")
    counts = {}
    for r in rows_out:
        counts[r["classification"]] = counts.get(r["classification"],0) + 1
    desktop = next((str(x.get("observation")) for x in evidence.get("fieldEvidence") or [] if str(x.get("environment") or "").startswith("Desktop macOS")),"")
    out = {"schemaVersion":1,"providerCount":EXPECTED,"currentManifestVersion":current.get("version"),"snapshotRefs":snaps,"classificationCounts":dict(sorted(counts.items())),"desktopMacFieldObservation":desktop,"policy":evidence.get("policy"),"providers":rows_out}
    OUT_JSON.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    lines = ["# Provider history & live classification — 96/96","",f"- Current manifest: **{current.get('version')}**, providers: **{EXPECTED}**.","- Historical code snapshots: **5.21.0**, **5.21.16**, **5.21.36**, then current.","- Snapshot hash/version columns are code history, **not** live proof by themselves.","- Live precedence: current TV field evidence / current published-byte guard > recent reconstruction candidate > old census.",f"- Desktop macOS field observation: **{desktop or 'no field evidence'}**","- Non-regression policy: a known-good published provider/lane is immutable until a replacement wins an A/B live check.","","## Classification counts",""]
    for k,v in sorted(counts.items(), key=lambda kv:(-kv[1],kv[0])):
        lines.append(f"- **{k}**: {v}")
    lines += ["","## 96-provider matrix","","| Provider | Types | Family | 5.21.0 | 5.21.16 | 5.21.36 | Current | Retained | 5.21.36 live | Current published/field | Class | Action |","|---|---|---|---|---|---|---|---:|---|---|---|---|"]
    current_key = str(current.get("version") or "current")
    for r in rows_out:
        ev=[]
        if r["currentPublishedGuard"]: ev.append("guard "+lanes_text(r["currentPublishedGuard"]))
        if r["currentTvField"]: ev.append("field "+"; ".join(f"{x['semanticType']}:✓ {x['fixture']}" for x in r["currentTvField"]))
        if not ev: ev=["—"]
        retained=str(r["retainedGenerationCount"])+(" +baseline" if r["publishedBaselineRetained"] else "")
        lines.append("| {p} | {t} | {f} | {a} | {b} | {c} | {d} | {g} | {h} | {e} | **{k}** | {x} |".format(p=r["provider"],t=", ".join(r["types"]) or "—",f=r["family"],a=r["snapshots"]["5.21.0"],b=r["snapshots"]["5.21.16"],c=r["snapshots"]["5.21.36"],d=r["snapshots"][current_key],g=retained,h=lanes_text(r["historical52136"]),e="; ".join(ev),k=r["classification"],x=r["action"].replace("|","/")))
    lines += ["","## Priority interpretation","","- `PROTECT` / `PARTIAL_PROTECT`: do not rebuild blindly. Preserve the known-good lane/hash and require A/B live proof.","- `UPSTREAM_DRIFT`: old known-good bytes also fail against the present backend, so changing Core is not justified by that failure alone.","- `CANDIDATE_GREEN`: reconstruction proved live in CI but is not yet equivalent to a published-byte/device proof.","- `LEARN`: bounded Repair attempts are exhausted; route/data discovery belongs to LEARN unless a shared family fix is proven.","- `UNVERIFIED`: no current positive evidence in this ledger; continue the portfolio sweep rather than provider-by-provider manual loops.","","### Priority/VF providers",""]
    for r in rows_out:
        if r["priority"] or r["vfRegressionGuard"]:
            lines.append(f"- **{r['provider']}** — {r['classification']}: {r['historyVerdict']} Action: {r['action']}")
    OUT_MD.write_text("\n".join(lines)+"\n",encoding="utf-8")
    print(f"PROVIDER_HISTORY_MATRIX_OK providers={len(rows_out)} classes={json.dumps(counts,sort_keys=True)}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
