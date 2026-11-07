"""
Cache mémoire du dashboard réseau et des KPI.

Un seul process (le worker Railway actuel). Pas de partage entre replicas :
une écriture n'invalide que ce process. Une sécurité de 90 secondes limite
une invalidation manquée. Ne jamais y mettre un résultat sans le périmètre
commercial dans la clé : un adhérent n'appelle pas ces entrées.
"""
from __future__ import annotations

import threading
import time
from typing import Any, Callable, Dict, Tuple

_TTL_S = 90.0
_lock = threading.Lock()
_generation = 0
_store: Dict[str, Tuple[int, float, Any]] = {}
_flight: Dict[str, Tuple[int, threading.Event, dict]] = {}


def invalidate_network_cache() -> None:
    global _generation
    with _lock:
        _generation += 1
        _store.clear()


def cache_generation() -> int:
    return _generation


def cached_network_value(key: str, compute: Callable[[], Any]) -> Any:
    """Un seul calcul par clé et par génération. Les autres attendent le résultat."""
    with _lock:
        gen = _generation
        hit = _store.get(key)
        now = time.monotonic()
        if hit and hit[0] == gen and now - hit[1] < _TTL_S:
            return hit[2]
        flight = _flight.get(key)
        if flight and flight[0] == gen:
            event, box = flight[1], flight[2]
            leader = False
        else:
            event = threading.Event()
            box = {}
            _flight[key] = (gen, event, box)
            leader = True
    if not leader:
        event.wait(120)
        if box.get("gen") == gen and "value" in box:
            return box["value"]
        return compute()
    try:
        value = compute()
    except Exception:
        box["gen"] = gen
        raise
    else:
        with _lock:
            if _generation == gen:
                _store[key] = (gen, time.monotonic(), value)
        box["value"] = value
        box["gen"] = gen
        return value
    finally:
        event.set()
        with _lock:
            current = _flight.get(key)
            if current and current[1] is event:
                _flight.pop(key, None)
