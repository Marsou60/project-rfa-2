"""Géocodage France via l'API Adresse (data.gouv.fr), sans clé.

Le script n'écrit une position que si le résultat tombe en France et que le
score est suffisant. Sinon le magasin reste « non placé » : jamais de point
au hasard. L'adresse ne sort pas de ce module (pas de journal, pas de fichier).
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
import unicodedata
import uuid
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, List, Optional
from urllib import error, request

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError, ProgrammingError

BAN_URL = "https://api-adresse.data.gouv.fr/search/csv/"
USER_AGENT = "groupement-union-rfa-geocode"

# Seuils : avec un code postal on accepte le centroïde communal ;
# sans code postal il faut une rue convaincante (homonymes).
MIN_SCORE = {
    "postcode": 0.5,
    "street_city": 0.6,
    "street": 0.75,
}

# Métropole, Corse et DOM. Un point hors de ces cadres n'est pas retenu.
FRANCE_BOXES = (
    (41.0, 51.8, -5.8, 10.2),
    (15.8, 16.6, -61.9, -60.8),
    (14.3, 15.0, -61.3, -60.7),
    (2.0, 5.9, -54.7, -51.4),
    (-21.5, -20.8, 55.1, 55.9),
    (-13.1, -12.6, 44.9, 45.4),
    (46.7, 47.2, -56.5, -56.0),
)

STATUSES = ("ok", "no_address", "failed", "ambiguous", "pending")


@dataclass
class AddressInput:
    code_union: str
    adresse: str = ""
    code_postal: str = ""
    ville: str = ""


@dataclass
class GeoFix:
    code_union: str
    status: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    score: Optional[float] = None
    result_type: Optional[str] = None
    fingerprint: str = ""


@dataclass
class GeoSummary:
    read: int = 0
    unchanged: int = 0
    no_address: int = 0
    placed: int = 0
    ambiguous: int = 0
    failed: int = 0
    written: int = 0
    apply: bool = False
    lines: List[str] = field(default_factory=list)

    def render(self) -> str:
        mode = "écriture" if self.apply else "simulation (aucune écriture)"
        return "\n".join([
            f"Adhérents lus : {self.read}",
            f"Déjà à jour : {self.unchanged}",
            f"Sans adresse exploitable : {self.no_address}",
            f"Positions retenues : {self.placed}",
            f"Résultats trop incertains (non placés) : {self.ambiguous}",
            f"Sans résultat : {self.failed}",
            f"Lignes écrites : {self.written}",
            f"Mode : {mode}",
            *self.lines,
        ])


def _norm(value: Optional[str]) -> str:
    text_value = unicodedata.normalize("NFKD", value or "")
    text_value = "".join(ch for ch in text_value if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text_value).strip().upper()


def postal_digits(value: Optional[str]) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 4:
        digits = "0" + digits
    return digits if len(digits) == 5 else ""


def address_quality(adresse: Optional[str], code_postal: Optional[str], ville: Optional[str]) -> str:
    street = _norm(adresse)
    if postal_digits(code_postal):
        return "postcode"
    if len(street) >= 6 and _norm(ville):
        return "street_city"
    if len(street) >= 12:
        return "street"
    return "none"


def fingerprint(adresse: Optional[str], code_postal: Optional[str], ville: Optional[str]) -> str:
    raw = "|".join([_norm(adresse), postal_digits(code_postal), _norm(ville)])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def in_france(lat: float, lng: float) -> bool:
    for south, north, west, east in FRANCE_BOXES:
        if south <= lat <= north and west <= lng <= east:
            return True
    return False


def classify(quality: str, lat: Optional[float], lng: Optional[float], score: Optional[float]) -> str:
    if quality == "none":
        return "no_address"
    if lat is None or lng is None or score is None:
        return "failed"
    if not in_france(float(lat), float(lng)):
        return "failed"
    if float(score) < MIN_SCORE[quality]:
        return "ambiguous"
    return "ok"


def _float(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    raw = str(value).strip().replace(",", ".")
    if not raw:
        return None
    try:
        number = float(raw)
    except ValueError:
        return None
    if number != number:  # NaN
        return None
    return number


def _multipart(csv_bytes: bytes) -> tuple:
    boundary = "----rfaBan" + uuid.uuid4().hex

    def field(name: str, value: str) -> bytes:
        return (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n"
        ).encode("utf-8")

    file_head = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="data"; filename="adresses.csv"\r\n'
        "Content-Type: text/csv; charset=utf-8\r\n\r\n"
    ).encode("utf-8")
    body = b"".join([
        field("columns", "adresse"),
        field("columns", "ville"),
        field("postcode", "code_postal"),
        file_head,
        csv_bytes,
        b"\r\n",
        f"--{boundary}--\r\n".encode("utf-8"),
    ])
    return body, f"multipart/form-data; boundary={boundary}"


def parse_ban_csv(payload: str) -> Dict[str, Dict[str, Optional[float]]]:
    reader = csv.DictReader(io.StringIO(payload))
    found: Dict[str, Dict[str, Optional[float]]] = {}
    for row in reader:
        code = (row.get("code_union") or "").strip().upper()
        if not code:
            continue
        result_type = (row.get("result_type") or "").strip() or None
        found[code] = {
            "lat": _float(row.get("latitude")),
            "lng": _float(row.get("longitude")),
            "score": _float(row.get("result_score")),
            "result_type": result_type,
        }
    return found


def fetch_ban_csv(rows: Iterable[AddressInput], opener=None) -> Dict[str, dict]:
    batch = list(rows)
    if not batch:
        return {}
    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer,
        fieldnames=["code_union", "adresse", "code_postal", "ville"],
        lineterminator="\n",
    )
    writer.writeheader()
    for row in batch:
        writer.writerow({
            "code_union": row.code_union,
            "adresse": row.adresse or "",
            "code_postal": postal_digits(row.code_postal),
            "ville": row.ville or "",
        })
    body, content_type = _multipart(buffer.getvalue().encode("utf-8"))
    req = request.Request(
        BAN_URL,
        data=body,
        headers={"Content-Type": content_type, "User-Agent": USER_AGENT},
        method="POST",
    )
    open_url = opener or request.urlopen
    try:
        with open_url(req, timeout=120) as response:
            raw = response.read()
    except error.HTTPError as exc:
        raise RuntimeError(f"API Adresse HTTP {exc.code}") from None
    except error.URLError:
        raise RuntimeError("API Adresse injoignable") from None
    return parse_ban_csv(raw.decode("utf-8-sig"))


def decide(row: AddressInput, ban: Optional[dict]) -> GeoFix:
    quality = address_quality(row.adresse, row.code_postal, row.ville)
    fp = fingerprint(row.adresse, row.code_postal, row.ville)
    lat = None if not ban else ban.get("lat")
    lng = None if not ban else ban.get("lng")
    score = None if not ban else ban.get("score")
    status = classify(quality, lat, lng, score)
    if status != "ok":
        lat, lng = None, None
    return GeoFix(
        code_union=row.code_union.strip().upper(),
        status=status,
        lat=None if lat is None else round(float(lat), 6),
        lng=None if lng is None else round(float(lng), 6),
        score=None if score is None else round(float(score), 4),
        result_type=None if not ban else ban.get("result_type"),
        fingerprint=fp,
    )


def _table_exists(engine: Engine) -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT code_union FROM adherent_positions LIMIT 0"))
        return True
    except (OperationalError, ProgrammingError):
        return False


def _load_directory(engine: Engine, limit: int) -> List[AddressInput]:
    sql = """
        SELECT code_union, adresse, code_postal, ville, is_closed
        FROM nathalie_adherents
    """
    with engine.connect() as conn:
        rows = conn.execute(text(sql)).mappings().all()
    chosen: Dict[str, AddressInput] = {}
    closed: Dict[str, bool] = {}
    for row in rows:
        code = (row.get("code_union") or "").strip().upper()
        if not code:
            continue
        is_closed = _flag(row.get("is_closed"))
        previous = chosen.get(code)
        # On garde le magasin ouvert s'il existe en double.
        if previous is not None and closed.get(code) is False:
            continue
        if previous is not None and is_closed and closed.get(code) is False:
            continue
        chosen[code] = AddressInput(
            code_union=code,
            adresse=row.get("adresse") or "",
            code_postal=str(row.get("code_postal") or ""),
            ville=row.get("ville") or "",
        )
        closed[code] = is_closed
    items = [chosen[code] for code in sorted(chosen)]
    if limit and limit > 0:
        return items[:limit]
    return items


def _flag(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    return str(value).strip().lower() in {"1", "true", "t", "yes"}


def _existing(engine: Engine) -> Dict[str, dict]:
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT code_union, geocode_status, address_fingerprint FROM adherent_positions"
        )).mappings().all()
    return {
        (row["code_union"] or "").strip().upper(): {
            "status": row.get("geocode_status"),
            "fingerprint": row.get("address_fingerprint"),
        }
        for row in rows
    }


def _write(engine: Engine, fixes: List[GeoFix]) -> int:
    if not fixes:
        return 0
    sql = """
        INSERT INTO adherent_positions (
            code_union, lat, lng, geocode_status, geocode_score,
            result_type, address_fingerprint, geocoded_at
        ) VALUES (
            :code, :lat, :lng, :status, :score, :result_type, :fingerprint, CURRENT_TIMESTAMP
        )
        ON CONFLICT (code_union) DO UPDATE SET
            lat = excluded.lat,
            lng = excluded.lng,
            geocode_status = excluded.geocode_status,
            geocode_score = excluded.geocode_score,
            result_type = excluded.result_type,
            address_fingerprint = excluded.address_fingerprint,
            geocoded_at = CURRENT_TIMESTAMP
    """
    payload = [
        {
            "code": fix.code_union,
            "lat": fix.lat,
            "lng": fix.lng,
            "status": fix.status,
            "score": fix.score,
            "result_type": fix.result_type,
            "fingerprint": fix.fingerprint,
        }
        for fix in fixes
    ]
    with engine.begin() as conn:
        conn.execute(text(sql), payload)
    return len(payload)


def run(
    engine: Engine,
    *,
    apply: bool,
    force: bool = False,
    limit: int = 0,
    geocoder: Callable[[List[AddressInput]], Dict[str, dict]] = fetch_ban_csv,
) -> GeoSummary:
    summary = GeoSummary(apply=apply)
    if not _table_exists(engine):
        summary.lines.append(
            "Table adherent_positions absente. Lancez d'abord "
            "backend/migrations/20261119_adherent_positions.sql"
        )
        return summary

    directory = _load_directory(engine, limit)
    summary.read = len(directory)
    existing = _existing(engine)
    pending: List[AddressInput] = []
    fixes: List[GeoFix] = []

    for row in directory:
        fp = fingerprint(row.adresse, row.code_postal, row.ville)
        previous = existing.get(row.code_union)
        # Un échec réseau (failed) est retenté. Le reste est stable tant que l'adresse ne change pas.
        if (
            not force
            and previous
            and previous.get("fingerprint") == fp
            and previous.get("status") in {"ok", "no_address", "ambiguous"}
        ):
            summary.unchanged += 1
            continue
        if address_quality(row.adresse, row.code_postal, row.ville) == "none":
            fix = decide(row, None)
            fixes.append(fix)
            summary.no_address += 1
            continue
        pending.append(row)

    looked_up = geocoder(pending) if pending else {}
    for row in pending:
        fix = decide(row, looked_up.get(row.code_union))
        fixes.append(fix)
        if fix.status == "ok":
            summary.placed += 1
        elif fix.status == "ambiguous":
            summary.ambiguous += 1
        elif fix.status == "no_address":
            summary.no_address += 1
        else:
            summary.failed += 1

    if apply:
        summary.written = _write(engine, fixes)
    else:
        summary.lines.append("Relancez avec --apply pour enregistrer ces positions.")
    return summary
