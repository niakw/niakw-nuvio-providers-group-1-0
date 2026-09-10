#!/usr/bin/env python3
"""Portfolio preservation gate with stream-level content and external-drift safety.

Default behaviour is the historical strict gate. The canonical Repair pipeline may
opt into one narrow external-drift exception: a baseline-positive provider may stop
blocking publication when the *exact same provider bytes* later fail only because of
transient external network/timeout states, two targeted retry observations confirm
that state, and the final candidate explicitly disables the provider as repair/off
debt. This never turns the failed probe green and never preserves activation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

import compare_quick_yield_preservation_impl as impl

_original_load = impl.load
TRANSIENT_EXTERNAL_STAGES = {"timeout", "provider_network_exception"}
MIN_EXTERNAL_DRIFT_RETRY_OBSERVATIONS = 2


def accepted_verified_stream(row: dict) -> bool:
    return int(row.get("playable") or 0) > 0 and int(row.get("verified") or 0) > 0


def generic_app_shell_media(url: object) -> bool:
    """Recognize deterministic app-shell media, never provider/content media."""
    try:
        parsed = urlsplit(str(url or ""))
    except ValueError:
        return False
    host = str(parsed.hostname or "").casefold()
    path = str(parsed.path or "").casefold().rstrip("/")
    return host == "web.telegram.org" and path in {"/a/nojs.mp4", "/k/nojs.mp4"}


def generic_shell_only_positive(row: dict) -> bool:
    if not accepted_verified_stream(row):
        return False
    media_fetches: list[str] = []
    for fetch in row.get("debug_fetches") or []:
        if not isinstance(fetch, dict):
            continue
        status = int(fetch.get("status") or 0)
        content_type = str(fetch.get("content_type") or "").casefold()
        url = str(fetch.get("response_url") or fetch.get("url") or "")
        try:
            path = str(urlsplit(url).path or "").casefold()
        except ValueError:
            path = ""
        is_media = content_type.startswith(("video/", "audio/")) or path.endswith(
            (".m3u8", ".mpd", ".mp4", ".mkv", ".webm", ".m4v", ".ts")
        )
        if 200 <= status < 400 and is_media:
            media_fetches.append(url)
    return bool(media_fetches) and all(generic_app_shell_media(url) for url in media_fetches)


def normalize_report(report: dict) -> dict:
    value = dict(report)
    terminal_wrong: set[str] = set()
    false_positive: set[str] = set()
    for row in report.get("rows") or []:
        if not isinstance(row, dict):
            continue
        provider = str(row.get("provider_id") or row.get("provider") or "").strip().casefold()
        contradictions = int(row.get("contradictions") or 0)
        if provider and contradictions > 0 and not accepted_verified_stream(row):
            terminal_wrong.add(provider)
        if provider and generic_shell_only_positive(row):
            false_positive.add(provider)
    if isinstance(report.get("rows"), list):
        value["wrong_content_providers"] = sorted(terminal_wrong)
        value["audit_false_positive_providers"] = sorted(false_positive)
        for key in (
            "raw_providers",
            "playable_providers",
            "accepted_playable_providers",
            "verified_providers",
        ):
            if isinstance(report.get(key), list):
                value[key] = sorted(
                    str(provider)
                    for provider in report.get(key) or []
                    if str(provider).strip().casefold() not in false_positive
                )
    return value


def load(path: str | Path) -> dict:
    return normalize_report(_original_load(str(path)))


def provider_set(report: dict, key: str) -> set[str]:
    return {str(v).strip().casefold() for v in report.get(key) or [] if str(v).strip()}


def row_index(report: dict) -> dict[tuple[str, str], list[dict]]:
    out: dict[tuple[str, str], list[dict]] = {}
    for row in report.get("rows") or []:
        if not isinstance(row, dict):
            continue
        provider = str(row.get("provider_id") or row.get("provider") or "").strip().casefold()
        lane = str(row.get("semantic_type") or "").strip().casefold()
        if provider and lane in {"movie", "tv", "anime"}:
            out.setdefault((provider, lane), []).append(row)
    return out


def disposition_index(value: dict) -> dict[str, dict]:
    rows = value.get("providers") or []
    if isinstance(rows, dict):
        return {str(k).strip().casefold(): v for k, v in rows.items() if isinstance(v, dict)}
    return {
        str(row.get("provider") or row.get("providerId") or "").strip().casefold(): row
        for row in rows
        if isinstance(row, dict) and str(row.get("provider") or row.get("providerId") or "").strip()
    }


def manifest_index(value: dict) -> dict[str, dict]:
    return {
        str(row.get("id") or "").strip().casefold(): row
        for row in value.get("scrapers") or []
        if isinstance(row, dict) and str(row.get("id") or "").strip()
    }


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().casefold()


def baseline_positive_lanes(report: dict, provider: str) -> set[str]:
    lanes: set[str] = set()
    for row in report.get("rows") or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("provider_id") or row.get("provider") or "").strip().casefold() != provider:
            continue
        lane = str(row.get("semantic_type") or "").strip().casefold()
        if lane not in {"movie", "tv", "anime"}:
            continue
        if int(row.get("contradictions") or 0) > 0:
            continue
        if int(row.get("raw") or 0) > 0 or int(row.get("playable") or 0) > 0 or int(row.get("verified") or 0) > 0:
            lanes.add(lane)
    return lanes


def row_has_any_yield(row: dict) -> bool:
    return any(int(row.get(key) or 0) > 0 for key in ("raw", "playable", "verified"))


def rows_are_transient_only(rows: list[dict]) -> bool:
    if not rows:
        return False
    if any(int(row.get("contradictions") or 0) > 0 for row in rows):
        return False
    return all(
        row_has_any_yield(row)
        or str(row.get("debug_stage") or "").strip().casefold() in TRANSIENT_EXTERNAL_STAGES
        for row in rows
    )


def external_drift_waiver(
    provider: str,
    *,
    baseline: dict,
    candidate: dict,
    retry: dict,
    lkg: dict,
    manifest: dict,
    disposition: dict,
    root: Path,
    new_wrong: set[str],
) -> tuple[bool, str]:
    if provider in new_wrong:
        return False, "new-wrong-content"
    saved = (lkg.get("providers") or {}).get(provider)
    if not isinstance(saved, dict) or saved.get("proofPromotion") is not False:
        return False, "baseline-hash-proof-missing"
    baseline_sha = str(saved.get("manifestFileSha256") or "").strip().casefold()
    if not baseline_sha:
        return False, "baseline-sha-missing"

    manifest_row = manifest_index(manifest).get(provider)
    if not isinstance(manifest_row, dict):
        return False, "candidate-manifest-missing"
    filename = str(manifest_row.get("filename") or "").strip()
    path = root / filename
    if not filename or not path.is_file() or file_sha256(path) != baseline_sha:
        return False, "provider-bytes-changed"
    if manifest_row.get("enabled") is not False:
        return False, "candidate-still-enabled"

    disp = disposition_index(disposition).get(provider)
    if not isinstance(disp, dict):
        return False, "disposition-missing"
    if str(disp.get("activationState") or "").casefold() != "disabled":
        return False, "disposition-not-disabled"
    if str(disp.get("routeDataState") or "").casefold() not in {"repair", "off"}:
        return False, "disposition-not-debt"

    base_lanes = baseline_positive_lanes(baseline, provider)
    if not base_lanes:
        return False, "baseline-positive-lane-missing"
    cand_rows = row_index(candidate)
    retry_rows = row_index(retry)
    for lane in sorted(base_lanes):
        candidate_lane = list(cand_rows.get((provider, lane)) or [])
        retry_lane = list(retry_rows.get((provider, lane)) or [])
        if any(row_has_any_yield(row) for row in [*candidate_lane, *retry_lane]):
            continue
        if len(retry_lane) < MIN_EXTERNAL_DRIFT_RETRY_OBSERVATIONS:
            return False, f"lane-{lane}-retry-evidence-missing"
        if not rows_are_transient_only([*candidate_lane, *retry_lane]):
            return False, f"lane-{lane}-not-transient"
    return True, "byte-identical-repeated-transient-disabled-debt"


def strict_main() -> int:
    return impl.main()


def main() -> int:
    probe = argparse.ArgumentParser(add_help=False)
    probe.add_argument("--baseline-runtime-lkg")
    probe.add_argument("--manifest")
    probe.add_argument("--disposition")
    known, _unknown = probe.parse_known_args()
    if not (known.baseline_runtime_lkg and known.manifest and known.disposition):
        impl.load = load
        return strict_main()

    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--candidate-retry")
    parser.add_argument("--losses-output")
    parser.add_argument("--baseline-runtime-lkg", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--disposition", required=True)
    parser.add_argument("--root", default=".")
    args = parser.parse_args()

    baseline = load(args.baseline)
    candidate = load(args.candidate)
    retry = load(args.candidate_retry) if args.candidate_retry else {}
    lkg = _original_load(args.baseline_runtime_lkg)
    manifest = _original_load(args.manifest)
    disposition = _original_load(args.disposition)
    root = Path(args.root).resolve()

    base_raw = provider_set(baseline, "raw_providers")
    base_playable = provider_set(baseline, "playable_providers")
    base_verified = provider_set(baseline, "verified_providers")
    cand_raw = provider_set(candidate, "raw_providers") | provider_set(retry, "raw_providers")
    cand_playable = provider_set(candidate, "playable_providers") | provider_set(retry, "playable_providers")
    cand_verified = provider_set(candidate, "verified_providers") | provider_set(retry, "verified_providers")

    lost_raw = sorted(base_raw - cand_raw)
    lost_playable = sorted(base_playable - cand_playable)
    lost_verified = sorted(base_verified - cand_verified)
    losses = sorted(set(lost_raw) | set(lost_playable) | set(lost_verified))

    base_wrong = provider_set(baseline, "wrong_content_providers")
    cand_wrong = provider_set(candidate, "wrong_content_providers") | provider_set(retry, "wrong_content_providers")
    new_wrong = set(cand_wrong - base_wrong)

    waived: list[str] = []
    waiver_rejected: dict[str, str] = {}
    for provider in losses:
        ok, reason = external_drift_waiver(
            provider,
            baseline=baseline,
            candidate=candidate,
            retry=retry,
            lkg=lkg,
            manifest=manifest,
            disposition=disposition,
            root=root,
            new_wrong=new_wrong,
        )
        if ok:
            waived.append(provider)
        else:
            waiver_rejected[provider] = reason

    effective_lost_raw = sorted(set(lost_raw) - set(waived))
    effective_lost_playable = sorted(set(lost_playable) - set(waived))
    effective_lost_verified = sorted(set(lost_verified) - set(waived))
    effective_losses = sorted(set(effective_lost_raw) | set(effective_lost_playable) | set(effective_lost_verified))

    print(f"YIELD_BASELINE raw={len(base_raw)} playable={len(base_playable)} verified={len(base_verified)} wrong={len(base_wrong)}")
    print(f"YIELD_CANDIDATE raw={len(cand_raw)} playable={len(cand_playable)} verified={len(cand_verified)} wrong={len(cand_wrong)}")
    print("YIELD_LOST_RAW=" + ",".join(lost_raw))
    print("YIELD_LOST_PLAYABLE=" + ",".join(lost_playable))
    print("YIELD_LOST_VERIFIED=" + ",".join(lost_verified))
    print("YIELD_NEW_WRONG_CONTENT=" + ",".join(sorted(new_wrong)))
    print("YIELD_EXTERNAL_DRIFT_WAIVED=" + ",".join(waived))
    if waiver_rejected:
        print("YIELD_EXTERNAL_DRIFT_REJECTED=" + ",".join(f"{p}:{waiver_rejected[p]}" for p in sorted(waiver_rejected)))

    if args.losses_output:
        Path(args.losses_output).write_text(
            json.dumps({"providers": effective_losses, "externalDriftWaivedProviders": waived}, indent=2) + "\n",
            encoding="utf-8",
        )

    if effective_losses:
        raise SystemExit("yield preservation failed")
    if new_wrong:
        raise SystemExit("new wrong-content provider detected")
    print("YIELD_PRESERVATION_OK external_drift_policy=byte-identical-repeated-transient-disabled-debt")
    return 0


impl.load = load

if __name__ == "__main__":
    raise SystemExit(main())
