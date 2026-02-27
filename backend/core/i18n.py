"""
Backend i18n module — loads TR/EN locale files and provides t() helper.
Language is read from X-Lang header (default: tr).
"""

import json
import os
from functools import lru_cache
from fastapi import Request

_LOCALES_DIR = os.path.join(os.path.dirname(__file__), "locales")
_DEFAULT_LANG = "tr"
_SUPPORTED = {"tr", "en"}


@lru_cache(maxsize=2)
def _load_locale(lang: str) -> dict:
    path = os.path.join(_LOCALES_DIR, f"{lang}.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def _resolve(data: dict, key: str) -> str | None:
    parts = key.split(".")
    obj = data
    for p in parts:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(p)
    return obj if isinstance(obj, str) else None


def t(key: str, lang: str = _DEFAULT_LANG, **kwargs) -> str:
    """Translate a key to the given language with optional placeholder substitution."""
    if lang not in _SUPPORTED:
        lang = _DEFAULT_LANG
    val = _resolve(_load_locale(lang), key)
    if val is None:
        # Fallback to default language
        val = _resolve(_load_locale(_DEFAULT_LANG), key)
    if val is None:
        return key
    if kwargs:
        for k, v in kwargs.items():
            val = val.replace("{" + k + "}", str(v))
    return val


def get_lang(request: Request) -> str:
    """Extract language from X-Lang header, default to 'tr'."""
    lang = (request.headers.get("X-Lang") or _DEFAULT_LANG).lower().strip()
    return lang if lang in _SUPPORTED else _DEFAULT_LANG
