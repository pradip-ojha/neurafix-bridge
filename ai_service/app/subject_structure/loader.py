from __future__ import annotations

import json
from pathlib import Path

_cache: dict[str, dict] = {}
_DATA_DIR = Path(__file__).parent / "data"


def get_structure(subject: str) -> dict:
    key = subject.strip().lower().replace(" ", "_")
    if key not in _cache:
        path = _DATA_DIR / f"{key}.json"
        if not path.exists():
            raise FileNotFoundError(f"No structure file found for subject: {subject}")
        _cache[key] = json.loads(path.read_text(encoding="utf-8"))
    return _cache[key]
