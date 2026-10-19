#!/usr/bin/env python3
"""Check Crowns of the Atlantic for missing keys, tags, and images."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOD = ROOT / "CrownsOfTheAtlantic"

REQUIRED_MOD_FIELDS = ("Name:", "Description:", "Tags:", "ChangeNote:")
EVENT_KEYS = ("id=", "title=", "desc=", "option_btn", "option_end", "trigger_")
LANGS = [
    "Bundle.properties",
    "Bundle_es.properties",
    "Bundle_fr.properties",
    "Bundle_de.properties",
    "Bundle_pl.properties",
]


def prop_keys(path: Path) -> set[str]:
    keys = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        keys.add(line.split("=", 1)[0])
    return keys


def main() -> int:
    errors: list[str] = []
    mod_txt = (MOD / "mod.txt").read_text(encoding="utf-8")
    for field in REQUIRED_MOD_FIELDS:
        if field not in mod_txt:
            errors.append(f"mod.txt missing {field}")

    civ_dir = MOD / "game" / "civilizations"
    tags = []
    for path in sorted(civ_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        tag = data.get("Tag")
        if tag != path.stem:
            errors.append(f"{path.name} Tag {tag!r} does not match the file name")
        for key in ("iR", "iG", "iB", "ReligionID", "Wiki"):
            if key not in data:
                errors.append(f"{path.name} missing {key}")
        for channel in ("iR", "iG", "iB"):
            value = data[channel]
            if not isinstance(value, int) or not 0 <= value <= 255:
                errors.append(f"{path.name} {channel} out of range")
        tags.append(tag)

    register = (MOD / "reference" / "register.txt").read_text(encoding="utf-8")
    for tag in tags:
        if f"{tag};" not in register:
            errors.append(f"register.txt missing {tag}")

    if (MOD / "game" / "Governments.json").exists():
        errors.append("Governments.json would replace the vanilla government list")
    if (MOD / "game" / "Civilizations.txt").exists():
        errors.append("Civilizations.txt would replace the vanilla civilization list")

    bundles = {name: prop_keys(MOD / "languages" / name) for name in LANGS}
    english = bundles["Bundle.properties"]
    for name, keys in bundles.items():
        missing = english - keys
        extra = keys - english
        if missing:
            errors.append(f"{name} missing keys: {sorted(missing)[:8]}")
        if extra:
            errors.append(f"{name} extra keys: {sorted(extra)[:8]}")

    event_ids = []
    referenced_civs: set[str] = set()
    referenced_vars: set[str] = set()
    string_keys: set[str] = set()
    for path in sorted((MOD / "game" / "events" / "common").glob("*.txt")):
        text = path.read_text(encoding="utf-8")
        if "\n\n" in text:
            errors.append(f"{path.name} has a blank line")
        for key in EVENT_KEYS:
            if key not in text:
                errors.append(f"{path.name} missing {key}")
        if text.count("option_btn") != text.count("option_end"):
            errors.append(f"{path.name} option blocks are unbalanced")
        match = re.search(r"^id=(.+)$", text, re.M)
        if not match or match.group(1) != path.stem:
            errors.append(f"{path.name} id does not match the file name")
        else:
            event_ids.append(match.group(1))
        referenced_civs.update(re.findall(r"^is_civ=(.+)$", text, re.M))
        referenced_vars.update(re.findall(r"^has_variable=(.+)$", text, re.M))
        for field in ("title", "desc", "mission_desc", "name"):
            string_keys.update(re.findall(rf"^{field}=(.+)$", text, re.M))
        image = re.search(r"^image=(.+)$", text, re.M)
        if image and not (MOD / "game" / "events" / "images" / "H" / image.group(1)).exists():
            errors.append(f"{path.name} image missing: {image.group(1)}")

    unknown = referenced_civs - set(tags)
    if unknown:
        errors.append(f"events reference unknown civs: {sorted(unknown)}")
    unknown_vars = referenced_vars - set(event_ids)
    if unknown_vars:
        errors.append(f"events reference unknown variables: {sorted(unknown_vars)}")
    missing_strings = {key for key in string_keys if key not in english}
    if missing_strings:
        errors.append(f"event strings missing from Bundle.properties: {sorted(missing_strings)}")

    for tag in tags:
        for folder in ("gfx/flagsXH", "game/flagsH", "game/flags"):
            if not (MOD / folder / f"{tag}.png").exists():
                errors.append(f"missing flag {folder}/{tag}.png")
    if not (MOD / "logo.png").exists():
        errors.append("missing logo.png")

    if errors:
        print("\n".join(errors))
        return 1
    print(f"ok: {len(tags)} civilizations, {len(event_ids)} events, {len(english)} strings")
    return 0


if __name__ == "__main__":
    sys.exit(main())
