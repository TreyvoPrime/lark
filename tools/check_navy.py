#!/usr/bin/env python3
"""Check Definitive Navy events, strings, and images."""

from __future__ import annotations

import re
import sys
from pathlib import Path

MOD = Path(__file__).resolve().parents[1] / "DefinitiveNavy"


def main() -> int:
    errors: list[str] = []
    text = (MOD / "mod.txt").read_text(encoding="utf-8")
    for field in ("Name:", "Description:", "Tags:", "ChangeNote:"):
        if field not in text:
            errors.append(f"mod.txt missing {field}")
    if (MOD / "game" / "Governments.json").exists() or (MOD / "game" / "Units.json").exists():
        errors.append("mod ships a full-file replacement")

    keys = set()
    for line in (MOD / "languages" / "Bundle.properties").read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#") and "=" in line:
            keys.add(line.split("=", 1)[0])

    ids = []
    referenced = set()
    for path in sorted((MOD / "game" / "events" / "common").glob("*.txt")):
        body = path.read_text(encoding="utf-8")
        if "\n\n" in body:
            errors.append(f"{path.name} has a blank line")
        if body.count("option_btn") != body.count("option_end"):
            errors.append(f"{path.name} unbalanced options")
        found = re.search(r"^id=(.+)$", body, re.M)
        if not found or found.group(1) != path.stem:
            errors.append(f"{path.name} bad id")
        else:
            ids.append(found.group(1))
        referenced.update(re.findall(r"^has_variable=(\w+)$", body, re.M))
        image = re.search(r"^image=(.+)$", body, re.M)
        if image and not (MOD / "game" / "events" / "images" / "H" / image.group(1)).exists():
            errors.append(f"missing {image.group(1)}")
        for field in ("title", "desc", "mission_desc", "name"):
            for key in re.findall(rf"^{field}=(.+)$", body, re.M):
                if key not in keys:
                    errors.append(f"{path.name} missing string {key}")

    unknown = referenced - set(ids)
    if unknown:
        errors.append(f"unknown variables: {sorted(unknown)}")
    if not (MOD / "logo.png").exists():
        errors.append("missing logo")
    if errors:
        print("\n".join(errors))
        return 1
    print(f"ok: {len(ids)} naval events, {len(keys)} strings")
    return 0


if __name__ == "__main__":
    sys.exit(main())
