#!/usr/bin/env python3
"""Сборка справочника Golf 7.5 CZCA.

Один источник данных -> два формата:
  1. site/                  — многофайловая версия для GitHub Pages
  2. site/golf-offline.html — одностраничная офлайн-версия для телефона

Запуск:  python3 build/build.py
Опции:   --extract  заново вытащить GRAPH из golf_map_offline_LATEST.html
"""

import base64
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
SITE = ROOT / "site"
ASSETS = SITE / "assets"
FONTS = ASSETS / "fonts"

LEGACY_MAP = ROOT / "golf_handoff" / "golf_handoff2" / "golf_map_offline_LATEST.html"
GRAPH_JSON = BUILD / "graph.json"


# ── 1. извлечение данных из старого монолита ────────────────────────────────
def extract_graph() -> dict:
    """Достаёт `const GRAPH = {...};` из старого одностраничника."""
    if not LEGACY_MAP.exists():
        sys.exit(f"нет исходника: {LEGACY_MAP}")
    src = LEGACY_MAP.read_text(encoding="utf-8")
    start = src.index("const GRAPH = {")
    body = src[start + len("const GRAPH = ") :]
    end = body.index("\n};")
    graph = json.loads(body[: end + 2])
    GRAPH_JSON.write_text(
        json.dumps(graph, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    return graph


def load_graph() -> dict:
    if "--extract" in sys.argv or not GRAPH_JSON.exists():
        return extract_graph()
    return json.loads(GRAPH_JSON.read_text(encoding="utf-8"))


# ── 2. проверки целостности ─────────────────────────────────────────────────
def check(graph: dict) -> dict:
    ids = {n["id"] for n in graph["nodes"]}
    assert len(ids) == len(graph["nodes"]), "дубликаты id среди узлов"

    orphans = [
        n["id"] for n in graph["nodes"] if n["parent"] and n["parent"] not in ids
    ]
    assert not orphans, f"узлы с несуществующим родителем: {orphans}"

    broken = [
        (l["source"], l["target"])
        for l in graph["links"]
        if l["source"] not in ids or l["target"] not in ids
    ]
    assert not broken, f"связи в никуда: {broken}"

    fuses = [n for n in graph["nodes"] if n["type"] == "fuse"]
    bad = [f["id"] for f in fuses if f.get("status") not in ("occ", "emp", "none")]
    assert not bad, f"предохранители без статуса: {bad}"

    return {
        "nodes": len(graph["nodes"]),
        "links": len(graph["links"]),
        "fuses": len(fuses),
        "pr": sum(len(g["items"]) for g in graph.get("pr", [])),
    }


# ── 3. data.js для многофайловой версии ─────────────────────────────────────
def write_data_js(graph: dict) -> str:
    payload = json.dumps(graph, ensure_ascii=False, separators=(",", ":"))
    js = f"/* сгенерировано build/build.py — руками не править */\nwindow.GOLF={payload};\n"
    (ASSETS / "data.js").write_text(js, encoding="utf-8")
    return js


# ── 4. одностраничная офлайн-версия ─────────────────────────────────────────
def inline_fonts(css: str) -> str:
    """Заменяет url('fonts/x.woff2') на data:-URI, чтобы файл был автономным."""

    def sub(m: "re.Match") -> str:
        name = m.group(1)
        raw = (FONTS / name).read_bytes()
        b64 = base64.b64encode(raw).decode("ascii")
        return f"url(data:font/woff2;base64,{b64}) format('woff2')"

    return re.sub(r"url\('fonts/([^']+)'\) format\('woff2'\)", sub, css)


def build_offline(graph: dict, stats: dict) -> Path:
    fonts_css = inline_fonts((ASSETS / "fonts.css").read_text(encoding="utf-8"))
    tokens_css = (ASSETS / "tokens.css").read_text(encoding="utf-8")
    app_css = (ASSETS / "app.css").read_text(encoding="utf-8")
    app_js = (ASSETS / "app.js").read_text(encoding="utf-8")
    data_js = f"window.GOLF={json.dumps(graph, ensure_ascii=False, separators=(',', ':'))};"

    shell = (SITE / "index.html").read_text(encoding="utf-8")
    # тело берём из index.html, чтобы разметка не разъезжалась между версиями
    body = shell[shell.index("<body>") + len("<body>") : shell.index("</body>")]
    body = re.sub(r'\s*<script src="assets/[^"]+"></script>', "", body)
    body = re.sub(r"\s*<script>window\.GOLF_HAS_GRAPH[^<]*</script>", "", body)

    ico = (
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'"
        "%3E%3Crect width='32' height='32' rx='7' fill='%231b1a17'/%3E%3Ctext x='16' y='23'"
        " font-family='monospace' font-size='18' font-weight='700' text-anchor='middle'"
        " fill='%23e8a33d'%3EG%3C/text%3E%3C/svg%3E"
    )

    html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Golf 7.5 CZCA — справочник (офлайн)</title>
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#1b1a17">
<meta name="robots" content="noindex">
<link rel="icon" href="{ico}">
<!-- Автономный файл: ни одного внешнего запроса.
     Сгенерирован build/build.py {date.today().isoformat()} ·
     {stats['nodes']} узлов · {stats['fuses']} предохранителей · {stats['pr']} PR-кодов. -->
<style>
{fonts_css}
{tokens_css}
{app_css}
</style>
<script>
try {{ if (localStorage.getItem('golf-theme') === 'light') {{
  document.documentElement.setAttribute('data-theme','light');
}} }} catch (e) {{}}
</script>
</head>
<body>{body}
<script>{data_js}</script>
<script>window.GOLF_HAS_GRAPH=false;</script>
<script>
{app_js}
</script>
</body>
</html>
"""
    out = SITE / "golf-offline.html"
    out.write_text(html, encoding="utf-8")
    shutil.copyfile(out, ROOT / "golf-offline.html")
    return out


# ── main ────────────────────────────────────────────────────────────────────
def main() -> None:
    graph = load_graph()
    stats = check(graph)

    write_data_js(graph)
    offline = build_offline(graph, stats)

    def kb(p: Path) -> str:
        return f"{p.stat().st_size / 1024:.0f} КБ"

    site_bytes = sum(f.stat().st_size for f in SITE.rglob("*") if f.is_file())
    site_bytes -= offline.stat().st_size

    print("данные   ", f"{stats['nodes']} узлов · {stats['links']} связей · "
                       f"{stats['fuses']} предохранителей · {stats['pr']} PR-кодов")
    print("site/    ", f"{site_bytes / 1024:.0f} КБ (без офлайн-файла)")
    print("офлайн   ", f"{offline.relative_to(ROOT)} — {kb(offline)}")
    print("копия    ", f"golf-offline.html — {kb(ROOT / 'golf-offline.html')}")


if __name__ == "__main__":
    main()
