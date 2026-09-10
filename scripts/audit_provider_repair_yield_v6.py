#!/usr/bin/env python3
"""Repair-yield gate with stream-level mixed-identity acceptance.

A lane is identity-safe when it has at least one playable verified stream, even if
other returned candidates were correctly rejected as contradictions. Rejected
candidates never become accepted output; they simply no longer poison the whole
provider lane. A lane with contradictions and zero verified playable streams
remains wrong-content/fail-closed.

The strict upstream-positive flag is an accounting gate, not an impossible
"everything upstream must already be live" gate. A positive upstream lane that the
current candidate cannot reproduce is allowed only when Repair has explicitly kept
that provider disabled (repair/off). No lost lane may belong to an enabled provider.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import audit_provider_repair_yield_v6_impl as impl

ROOT = Path(__file__).resolve().parents[1]
DISPOSITION = ROOT / "automation" / "provider-repair-disposition.json"


def accepted_verified_stream(row: dict) -> bool:
    return int(row.get("playable") or 0) > 0 and int(row.get("verified") or 0) > 0


def identity_safe(row: dict) -> bool:
    if accepted_verified_stream(row):
        return True
    return int(row.get("contradictions") or 0) == 0 and str(row.get("status") or "") != "wrong_content"


impl.identity_safe = identity_safe


def _output_path(argv: list[str]) -> Path:
    if "--output" in argv:
        at = argv.index("--output")
        if at + 1 < len(argv):
            value = Path(argv[at + 1])
            return value if value.is_absolute() else ROOT / value
    return ROOT / "automation" / "provider-repair-yield-v6.json"


def _account_upstream_debt(report_path: Path) -> int:
    if not report_path.is_file() or not DISPOSITION.is_file():
        print("UPSTREAM_POSITIVE_ACCOUNTING_FAIL reason=missing_report_or_disposition")
        return 3
    report = json.loads(report_path.read_text(encoding="utf-8"))
    disposition = json.loads(DISPOSITION.read_text(encoding="utf-8"))
    states = {
        str(row.get("provider") or "").strip().casefold(): row
        for row in disposition.get("providers") or []
        if isinstance(row, dict) and str(row.get("provider") or "").strip()
    }
    lost = [
        (str(pair[0]).strip().casefold(), str(pair[1]).strip().casefold())
        for pair in report.get("lostUpstreamPositivePairs") or []
        if isinstance(pair, list) and len(pair) == 2
    ]
    unaccounted: list[tuple[str, str]] = []
    active_loss: list[tuple[str, str]] = []
    repair_debt: list[tuple[str, str]] = []
    off_debt: list[tuple[str, str]] = []
    for provider, lane in lost:
        state = states.get(provider)
        if not isinstance(state, dict):
            unaccounted.append((provider, lane))
            continue
        activation = str(state.get("activationState") or "").strip().casefold()
        route_state = str(state.get("routeDataState") or "").strip().casefold()
        if activation == "enabled":
            active_loss.append((provider, lane))
        elif activation == "disabled" and route_state == "repair":
            repair_debt.append((provider, lane))
        elif activation == "disabled" and route_state == "off":
            off_debt.append((provider, lane))
        else:
            unaccounted.append((provider, lane))
    report["upstreamPositiveAccounting"] = {
        "policy": "lost-upstream-positive-lanes-must-be-disabled-repair-or-off",
        "activeLostPairs": [list(pair) for pair in active_loss],
        "repairDebtPairs": [list(pair) for pair in repair_debt],
        "offDebtPairs": [list(pair) for pair in off_debt],
        "unaccountedPairs": [list(pair) for pair in unaccounted],
        "gatePassed": not active_loss and not unaccounted,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "UPSTREAM_POSITIVE_ACCOUNTING "
        f"lost={len(lost)} repair_debt={len(repair_debt)} off_debt={len(off_debt)} "
        f"active_loss={len(active_loss)} unaccounted={len(unaccounted)}"
    )
    if active_loss:
        print("UPSTREAM_POSITIVE_ACTIVE_LOSS pairs=" + ",".join(f"{p}:{lane}" for p, lane in active_loss))
    if unaccounted:
        print("UPSTREAM_POSITIVE_UNACCOUNTED pairs=" + ",".join(f"{p}:{lane}" for p, lane in unaccounted))
    return 0 if not active_loss and not unaccounted else 3


def main() -> int:
    strict = "--require-upstream-positive-preserved" in sys.argv
    original_argv = list(sys.argv)
    if strict:
        sys.argv = [arg for arg in sys.argv if arg != "--require-upstream-positive-preserved"]
    try:
        result = impl.main()
    finally:
        sys.argv = original_argv
    if result != 0 or not strict:
        return result
    return _account_upstream_debt(_output_path(original_argv))


if __name__ == "__main__":
    raise SystemExit(main())
