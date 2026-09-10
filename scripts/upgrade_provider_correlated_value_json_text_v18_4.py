#!/usr/bin/env python3
"""Provider Value Plan V18.4: parse JSON text and expose bounded CI trace.

The generic request layer may return a response body as a string even when the
remote endpoint is application/json. V18 previously selected the identity parser
only from the JavaScript runtime type, which sent such structured search results
to the HTML parser and silently lost provider ids/slugs.

V18.4 first attempts bounded JSON decoding for string payloads, reuses the strict
V18.1 JSON identity scorer, then falls back to HTML identity extraction. It also
exposes a tiny ephemeral execution trace for the CI probe: stage, semantic lane,
selected provider identity, step index and the already-known DATA route template.
No response body, media URL, host credential, token or request header is traced.
This remains a response/dataflow capability, not a provider-specific exception.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "scripts" / "provider_base_store.py"
MARKER = "NIAKVIO_PROVIDER_CORRELATED_VALUE_JSON_TEXT_V18_4"
TRACE_MARKER = "NIAKVIO_PROVIDER_VALUE_TRACE_V18_4"


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise AssertionError(f"{label}: expected one anchor, got {count}")
    return text.replace(old, new, 1)


def patch() -> bool:
    text = BASE.read_text(encoding="utf-8")
    if MARKER in text:
        validate(text)
        return False
    for required in (
        "NIAKVIO_PROVIDER_BASE_CORRELATED_VALUE_PLAN_V18",
        "NIAKVIO_PROVIDER_CORRELATED_VALUE_PLAN_V18_1",
        "NIAKVIO_PROVIDER_CORRELATED_VALUE_AUTHORITY_V18_2",
    ):
        if required not in text:
            raise AssertionError(f"V18.4 requires {required}")

    resolver_anchor = "async function _resolveProviderValuePlan(meta, mediaType, season, episode) {\n"
    trace_helper = r'''/* NIAKVIO_PROVIDER_VALUE_TRACE_V18_4 */
function _spv184Trace(stage, mediaType, providerId, stepIndex, route) {
  try {
    globalThis.__nuvioProviderValueTraceV18 = {
      stage: _text(stage).slice(0, 64),
      lane: _text(mediaType).slice(0, 32),
      providerId: _text(providerId).slice(0, 160),
      stepIndex: Number.isFinite(Number(stepIndex)) ? Number(stepIndex) : -1,
      route: _text(route).slice(0, 240)
    };
  } catch (_) {}
}
'''
    text = once(text, resolver_anchor, trace_helper + resolver_anchor, "v18.4-trace-helper")

    old_lane = '''    const lanes = Array.isArray(plan && plan.semanticTypes) ? plan.semanticTypes : [];
    if (lanes.length && !lanes.includes(mediaType) && !(mediaType === "anime" && lanes.includes("tv"))) continue;
    const searchBase = _text(plan && plan.searchBase);
'''
    new_lane = '''    const lanes = Array.isArray(plan && plan.semanticTypes) ? plan.semanticTypes : [];
    if (lanes.length && !lanes.includes(mediaType) && !(mediaType === "anime" && lanes.includes("tv"))) {
      _spv184Trace("lane_skip", mediaType, "", -1, "");
      continue;
    }
    _spv184Trace("plan_selected", mediaType, "", -1, _text(plan && plan.searchRoute));
    const searchBase = _text(plan && plan.searchBase);
'''
    text = once(text, old_lane, new_lane, "v18.4-lane-trace")

    old_identity = '''      const providerId = typeof searchPayload.value === "string"
        ? _spv18ProviderIdFromHtml(searchPayload.value, meta)
        : _spv18ProviderIdFromJson(searchPayload.value, meta);
      if (!providerId) continue;
'''
    new_identity = '''      /* NIAKVIO_PROVIDER_CORRELATED_VALUE_JSON_TEXT_V18_4 */
      let providerId = "";
      if (typeof searchPayload.value === "string") {
        const rawSearchValue = _text(searchPayload.value).trim();
        if (rawSearchValue && rawSearchValue.length <= 4 * 1024 * 1024 && /^[\\[{]/.test(rawSearchValue)) {
          try {
            providerId = _spv18ProviderIdFromJson(JSON.parse(rawSearchValue), meta);
          } catch (_) {}
        }
        if (!providerId) providerId = _spv18ProviderIdFromHtml(rawSearchValue, meta);
      } else {
        providerId = _spv18ProviderIdFromJson(searchPayload.value, meta);
      }
      _spv184Trace(providerId ? "identity_hit" : "identity_miss", mediaType, providerId, -1, searchRoute);
      if (!providerId) continue;
'''
    text = once(text, old_identity, new_identity, "v18.4-json-text-identity-bridge")

    old_step = '''      const values = Object.assign({}, baseValues, { providerId });
      for (const step of (plan.steps || []).slice(0, 4)) {
        const stepBase = _text(step && step.base);
        const stepRoute = _text(step && step.route);
        if (!/^https?:\\/\\//i.test(stepBase) || !stepRoute || !/\\{id\\}/i.test(stepRoute)) continue;
        const stepUrl = _recipeUrl(stepRoute, values, stepBase);
        if (!stepUrl) continue;
        const stepSpec = _recipeRequestSpec(
          { providerValueStep: step.requestSpec || { method: "GET" } },
          "providerValueStep",
          values
        );
        const payload = await _recipePayload(stepUrl, {}, stepSpec, values);
'''
    new_step = '''      const values = Object.assign({}, baseValues, { providerId });
      const valueSteps = (plan.steps || []).slice(0, 4);
      for (let stepIndex = 0; stepIndex < valueSteps.length; stepIndex += 1) {
        const step = valueSteps[stepIndex];
        const stepBase = _text(step && step.base);
        const stepRoute = _text(step && step.route);
        if (!/^https?:\\/\\//i.test(stepBase) || !stepRoute || !/\\{id\\}/i.test(stepRoute)) {
          _spv184Trace("step_shape_rejected", mediaType, providerId, stepIndex, stepRoute);
          continue;
        }
        const stepUrl = _recipeUrl(stepRoute, values, stepBase);
        if (!stepUrl) {
          _spv184Trace("step_url_empty", mediaType, providerId, stepIndex, stepRoute);
          continue;
        }
        _spv184Trace("step_fetch", mediaType, providerId, stepIndex, stepRoute);
        const stepSpec = _recipeRequestSpec(
          { providerValueStep: step.requestSpec || { method: "GET" } },
          "providerValueStep",
          values
        );
        const payload = await _recipePayload(stepUrl, {}, stepSpec, values);
        _spv184Trace("step_response", mediaType, providerId, stepIndex, stepRoute);
'''
    text = once(text, old_step, new_step, "v18.4-step-trace")

    BASE.write_text(text, encoding="utf-8")
    validate(text)
    return True


def validate(text: str | None = None) -> None:
    value = text if text is not None else BASE.read_text(encoding="utf-8")
    if value.count(MARKER) != 1:
        raise AssertionError(f"V18.4 marker count={value.count(MARKER)}")
    if value.count(TRACE_MARKER) != 1:
        raise AssertionError(f"V18.4 trace marker count={value.count(TRACE_MARKER)}")

    # Invariants owned by V18.4 itself and still required after later V20.x
    # response-value migrations. Later owners may replace local variable names,
    # id/slug representation and replay depth, but not this bounded trace API.
    for needle in (
        "function _spv184Trace(stage, mediaType, providerId, stepIndex, route)",
        "globalThis.__nuvioProviderValueTraceV18",
        'stage: _text(stage).slice(0, 64)',
        'providerId: _text(providerId).slice(0, 160)',
        'route: _text(route).slice(0, 240)',
        '"lane_skip"',
        '"plan_selected"',
        "const rawSearchValue = _text(searchPayload.value).trim();",
        "rawSearchValue.length <= 4 * 1024 * 1024",
        '"step_shape_rejected"',
        '"step_url_empty"',
        '"step_fetch"',
        '"step_response"',
    ):
        if needle not in value:
            raise AssertionError(f"V18.4 missing {needle}")

    legacy_identity_bridge = all(needle in value for needle in (
        "_spv18ProviderIdFromJson(JSON.parse(rawSearchValue), meta)",
        "if (!providerId) providerId = _spv18ProviderIdFromHtml(rawSearchValue, meta);",
        "providerId = _spv18ProviderIdFromJson(searchPayload.value, meta);",
    ))
    response_value_bridge = all(needle in value for needle in (
        "_spv20ProviderValuesFromJson(JSON.parse(rawSearchValue), meta)",
        "providerValues = _spv20ProviderValuesFromHtml(rawSearchValue, meta);",
        "providerValues = _spv20ProviderValuesFromJson(searchPayload.value, meta);",
    ))
    strict_v205_bridge = all(needle in value for needle in (
        "NIAKVIO_PROVIDER_RESPONSE_VALUE_DEPENDENCY_V20_5",
        "providerValues = _spv205StrictProviderValues(",
        "const providerTraceId = providerValues.id || providerValues.slug || \"\";",
    ))
    if not legacy_identity_bridge and not response_value_bridge and not strict_v205_bridge:
        raise AssertionError(
            "V18.4 JSON-text identity bridge missing legacy V18.4 or current V20.x owner"
        )

    legacy_trace = (
        '_spv184Trace(providerId ? "identity_hit" : "identity_miss", '
        'mediaType, providerId, -1, searchRoute);'
    )
    dependency_trace = (
        '_spv184Trace(providerTraceId ? "identity_hit" : "identity_miss", '
        'mediaType, providerTraceId, -1, searchRoute);'
    )
    if legacy_trace not in value and dependency_trace not in value:
        raise AssertionError(
            "V18.4 identity trace missing legacy providerId or V20.5 providerTraceId owner"
        )

    legacy_depth = "const valueSteps = (plan.steps || []).slice(0, 4);"
    current_depth = "const valueSteps = (plan.steps || []).slice(0, 8);"
    if legacy_depth not in value and current_depth not in value:
        raise AssertionError(
            "V18.4 provider-value depth missing legacy 4 or current V20.5 depth 8"
        )

    # Security check must inspect the V18.4 trace helper itself, not every helper
    # later migrations inserted before another resolver. V20.5 legitimately
    # contains words such as `authorization` in its *rejection* filters; that is
    # not trace output. Keep the forbidden-field policy unchanged and narrow only
    # the ownership window.
    trace_start = value.index("/* NIAKVIO_PROVIDER_VALUE_TRACE_V18_4 */")
    trace_function = value.index("function _spv184Trace(", trace_start)
    trace_end = value.find("\n}\n", trace_function)
    if trace_end < 0:
        raise AssertionError("V18.4 trace helper end missing")
    trace_window = value[trace_start : trace_end + 3].lower()
    if "globalthis.__nuvioprovidervaluetracev18" not in trace_window:
        raise AssertionError("V18.4 trace helper does not own the bounded trace object")
    for forbidden in ("authorization", "cookie", "set-cookie", "requestheaders", "responsebody"):
        if forbidden in trace_window:
            raise AssertionError(f"V18.4 trace leaks forbidden field {forbidden}")


def main() -> int:
    changed = patch()
    print(
        f"PROVIDER_CORRELATED_VALUE_JSON_TEXT_V18_4_OK changed={str(changed).lower()} "
        "json_text_first=1 strict_v18_identity_reused=1 html_fallback=1 bounded_payload=1 "
        "sanitized_stage_trace=1 provider_specific_rules=0"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
