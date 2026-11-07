"""
Cache mémoire du dashboard réseau et des KPI.

Un seul process. Un redémarrage vide le cache : le premier appel de chaque
clé recalcule (point froid). Un second process ne verrait ni la valeur ni
l'invalidation.

La valeur d'une clé reste servie tant que la génération n'a pas changé,
même après 90 secondes. Passé ce délai, un seul recalcul de fond met à jour
la clé. Une invalidation (import, réglage, droit) incrémente la génération
et interdit de resservir quoi que ce soit de l'ancienne.

Les waiters n'ouvrent pas de connexion : l'appelant doit avoir rendu la
sienne avant d'entrer ici. Un seul calcul lourd tourne à la fois, et il
n'attend pas le sémaphore en tenant une connexion.
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple

_TTL_S = 90.0
_lock = threading.Lock()
_generation = 0
_store: Dict[str, Tuple[int, float, Any]] = {}
_flight: Dict[str, Tuple[int, threading.Event, dict]] = {}
_bg_threads: list = []

_RETRY = object()


class _HeavyGate:
    def __init__(self) -> None:
        self._sem = threading.Semaphore(1)
        self._stats = threading.Lock()
        self.active = 0
        self.max_seen = 0

    def acquire(self) -> float:
        started = time.monotonic()
        self._sem.acquire()
        waited = time.monotonic() - started
        with self._stats:
            self.active += 1
            if self.active > self.max_seen:
                self.max_seen = self.active
        return waited

    def release(self) -> None:
        with self._stats:
            self.active -= 1
        self._sem.release()


_heavy = _HeavyGate()


def _log(event: str, key: str, **fields: Any) -> None:
    kind = "?"
    try:
        parsed = json.loads(key)
        if isinstance(parsed, dict) and parsed.get("kind"):
            kind = str(parsed["kind"])
    except (TypeError, ValueError):
        kind = "?"
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:8]
    extra = " ".join(f"{name}={value}" for name, value in fields.items())
    print(
        f"[NETWORK_CACHE] event={event} kind={kind} key={digest} "
        f"gen={_generation} {extra}".rstrip()
    )


def invalidate_network_cache() -> None:
    global _generation
    with _lock:
        _generation += 1
        _store.clear()
        generation = _generation
    print(f"[NETWORK_CACHE] event=invalidate gen={generation}")


def cache_generation() -> int:
    return _generation


def heavy_calc_max() -> int:
    return _heavy.max_seen


def reset_heavy_calc_stats() -> None:
    with _heavy._stats:
        _heavy.max_seen = 0
        _heavy.active = 0


def wait_for_network_refresh(timeout: float = 5.0) -> None:
    with _lock:
        threads = list(_bg_threads)
    for thread in threads:
        thread.join(timeout)


def _pop_flight(key: str, event: threading.Event) -> None:
    with _lock:
        current = _flight.get(key)
        if current and current[1] is event:
            _flight.pop(key, None)


def _schedule_refresh(key: str, gen: int, compute: Callable[[], Any]) -> None:
    with _lock:
        flight = _flight.get(key)
        if flight and flight[0] == gen:
            return
        event = threading.Event()
        box: dict = {}
        _flight[key] = (gen, event, box)

    def _background() -> None:
        try:
            _lead(key, gen, compute, event, box)
        except Exception as exc:
            _log("leader_fail", key, attempt="bg", error=type(exc).__name__)
        finally:
            event.set()
            _pop_flight(key, event)

    thread = threading.Thread(target=_background, name="network-cache-refresh", daemon=True)
    with _lock:
        _bg_threads.append(thread)
        if len(_bg_threads) > 32:
            _bg_threads[:] = [item for item in _bg_threads if item.is_alive()]
    thread.start()


def _lead(key: str, gen: int, compute: Callable[[], Any], event: threading.Event, box: dict) -> Any:
    """Calcule au plus deux fois. Ne publie rien si la génération a bougé."""
    error: Optional[BaseException] = None
    value: Any = None
    for attempt in (1, 2):
        with _lock:
            if _generation != gen:
                box["invalidated"] = True
                _log("skip_gen", key, attempt=attempt)
                return _RETRY
        waited = _heavy.acquire()
        if waited >= 0.001:
            _log("heavy_wait", key, wait_ms=int(waited * 1000))
        try:
            with _lock:
                if _generation != gen:
                    box["invalidated"] = True
                    _log("skip_gen", key, attempt=attempt)
                    return _RETRY
            started = time.monotonic()
            try:
                value = compute()
            except Exception as exc:
                error = exc
                _log("leader_fail", key, attempt=attempt, error=type(exc).__name__)
                continue
            _log("recompute", key, attempt=attempt, compute_ms=int((time.monotonic() - started) * 1000))
            error = None
            break
        finally:
            _heavy.release()
    if box.get("invalidated"):
        return _RETRY
    if error is not None:
        box["error"] = type(error).__name__
        box["gen"] = gen
        raise error
    with _lock:
        if _generation != gen:
            box["invalidated"] = True
            _log("skip_gen", key, attempt="store")
            return _RETRY
        _store[key] = (gen, time.monotonic(), value)
        box["value"] = value
        box["gen"] = gen
    return value


def cached_network_value(key: str, compute: Callable[[], Any]) -> Any:
    """Valeur de cette clé seulement. L'appelant ne tient pas de connexion."""
    last_error: Optional[BaseException] = None
    for _round in range(4):
        with _lock:
            gen = _generation
            hit = _store.get(key)
            now = time.monotonic()
            if hit and hit[0] == gen:
                age = now - hit[1]
                if age >= _TTL_S:
                    _log("stale", key, age_ms=int(age * 1000))
                    schedule = True
                else:
                    _log("hit", key, age_ms=int(age * 1000))
                    schedule = False
                value = hit[2]
            else:
                schedule = False
                value = _RETRY
            if value is _RETRY:
                flight = _flight.get(key)
                if flight and flight[0] == gen:
                    event, box = flight[1], flight[2]
                    leader = False
                    _log("wait", key)
                else:
                    event = threading.Event()
                    box = {}
                    _flight[key] = (gen, event, box)
                    leader = True
                    _log("miss", key)
        if schedule:
            _schedule_refresh(key, gen, compute)
        if value is not _RETRY:
            return value
        if not leader:
            started = time.monotonic()
            signaled = event.wait(120)
            _log(
                "wait_done",
                key,
                wait_ms=int((time.monotonic() - started) * 1000),
                signaled=int(bool(signaled)),
            )
            if box.get("invalidated") or box.get("gen") != gen:
                continue
            if "value" in box and box.get("gen") == gen:
                return box["value"]
            if box.get("error"):
                raise RuntimeError(f"calcul réseau en échec: {box['error']}")
            continue
        try:
            outcome = _lead(key, gen, compute, event, box)
        except Exception as exc:
            last_error = exc
            box["error"] = type(exc).__name__
            box["gen"] = gen
            raise
        finally:
            event.set()
            _pop_flight(key, event)
        if outcome is _RETRY:
            continue
        return outcome
    if last_error is not None:
        raise last_error
    raise RuntimeError("calcul réseau interrompu")
