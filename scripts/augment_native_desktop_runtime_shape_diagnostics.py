#!/usr/bin/env python3
"""Add sanitized response-shape evidence to the existing Desktop runtime bisect.

This is Lab-only instrumentation. It first applies the canonical Desktop runtime
console/fetch diagnostic transform, then augments the injected fetch wrapper so
QuickJS reports only structural response facts: content type, JSON top-level
kind, row counts and presence/count of HTTP-shaped URL fields. It never emits
response bodies, stream URLs, headers, cookies, tokens or signatures.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import augment_native_desktop_runtime_diagnostics as base

MARKER = "NIAKVIO_NATIVE_RUNTIME_RESPONSE_SHAPE_V1"
ANCHOR = """                    var response = await state.originalFetch.apply(this, arguments);\n                    capture(\"fetch\", ["""
INJECTION = """                    var response = await state.originalFetch.apply(this, arguments);\n                    /* NIAKVIO_NATIVE_RUNTIME_RESPONSE_SHAPE_V1 */\n                    try {\n                        var contentType = \"\";\n                        try {\n                            contentType = String(response && response.headers && response.headers.get\n                                ? (response.headers.get(\"content-type\") || \"\") : \"\");\n                            contentType = contentType.split(\";\")[0].toLowerCase().slice(0, 96);\n                        } catch (_) {}\n                        capture(\"fetch-shape\", [method, url, \"contentType=\" + contentType]);\n\n                        if (response && typeof response.json === \"function\") {\n                            var originalJson = response.json;\n                            response.json = async function () {\n                                var value = await originalJson.apply(this, arguments);\n                                var kind = value === null ? \"null\" : Array.isArray(value) ? \"array\" : typeof value;\n                                var rows = [];\n                                try {\n                                    if (Array.isArray(value)) rows = value;\n                                    else if (value && Array.isArray(value.streams)) rows = value.streams;\n                                    else if (value && Array.isArray(value.results)) rows = value.results;\n                                    else if (value && Array.isArray(value.data)) rows = value.data;\n                                } catch (_) {}\n                                var httpUrlRows = 0, externalUrlRows = 0, objectRows = 0;\n                                for (var i = 0; i < rows.length; i++) {\n                                    var row = rows[i];\n                                    if (!row || typeof row !== \"object\") continue;\n                                    objectRows += 1;\n                                    try {\n                                        if (typeof row.url === \"string\" && /^https?:\\/\\//i.test(row.url)) httpUrlRows += 1;\n                                        if (typeof row.externalUrl === \"string\" || typeof row.external_url === \"string\") externalUrlRows += 1;\n                                    } catch (_) {}\n                                }\n                                capture(\"fetch-json-shape\", [\n                                    method, url,\n                                    \"kind=\" + kind,\n                                    \"rows=\" + String(rows.length),\n                                    \"objectRows=\" + String(objectRows),\n                                    \"httpUrlRows=\" + String(httpUrlRows),\n                                    \"externalUrlRows=\" + String(externalUrlRows)\n                                ]);\n                                return value;\n                            };\n                        }\n                        if (response && typeof response.text === \"function\") {\n                            var originalText = response.text;\n                            response.text = async function () {\n                                var value = await originalText.apply(this, arguments);\n                                var length = 0;\n                                try { length = String(value == null ? \"\" : value).length; } catch (_) {}\n                                capture(\"fetch-text-shape\", [method, url, \"chars=\" + String(length)]);\n                                return value;\n                            };\n                        }\n                    } catch (shapeError) {\n                        capture(\"fetch-shape-error\", [method, url, state.stringify ? state.stringify(shapeError) : \"Error\"]);\n                    }\n                    capture(\"fetch\", ["""


def augment(path: Path) -> bool:
    base.augment(path)
    text = path.read_text(encoding="utf-8")
    if MARKER in text:
        print(f"FIELD_NATIVE_DESKTOP_RUNTIME_RESPONSE_SHAPE already=true source={path}")
        return False
    count = text.count(ANCHOR)
    if count != 1:
        raise SystemExit(f"desktop response-shape diagnostic anchor count={count}")
    text = text.replace(ANCHOR, INJECTION, 1)
    path.write_text(text, encoding="utf-8")
    print(
        "FIELD_NATIVE_DESKTOP_RUNTIME_RESPONSE_SHAPE "
        f"added=true sanitized=true source={path}"
    )
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    args = parser.parse_args()
    augment(Path(args.source).resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
