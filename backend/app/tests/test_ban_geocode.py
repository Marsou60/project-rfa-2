"""Géocodage : données fictives, aucun appel réseau."""
from __future__ import annotations

from sqlalchemy import create_engine, text

from app.services.ban_geocode import (
    AddressInput,
    address_quality,
    classify,
    decide,
    parse_ban_csv,
    run,
)


SECRET_STREET = "12 rue des Lilas fictive"


def _engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text(
            """
            CREATE TABLE nathalie_adherents (
                code_union TEXT PRIMARY KEY,
                adresse TEXT,
                code_postal TEXT,
                ville TEXT,
                is_closed INTEGER
            )
            """
        ))
        conn.execute(text(
            """
            CREATE TABLE adherent_positions (
                code_union TEXT PRIMARY KEY,
                lat REAL,
                lng REAL,
                geocode_status TEXT,
                geocode_score REAL,
                result_type TEXT,
                address_fingerprint TEXT,
                geocoded_at TEXT
            )
            """
        ))
        conn.execute(text(
            "INSERT INTO nathalie_adherents (code_union, adresse, code_postal, ville, is_closed) VALUES "
            "('DEMO1', :street, '29200', 'Brest', 0),"
            "('DEMO2', '', '', '', 0),"
            "('DEMO3', '1 rue courte', '13001', 'Marseille', 0),"
            "('DEMO4', '8 quai du port', '44000', 'Nantes', 0)"
        ), {"street": SECRET_STREET})
    return engine


def _fake_geocoder(rows):
    out = {}
    for row in rows:
        if row.code_union == "DEMO1":
            out[row.code_union] = {
                "lat": 48.390,
                "lng": -4.486,
                "score": 0.92,
                "result_type": "housenumber",
            }
        elif row.code_union == "DEMO3":
            out[row.code_union] = {
                "lat": 43.3,
                "lng": 5.4,
                "score": 0.2,
                "result_type": "municipality",
            }
        elif row.code_union == "DEMO4":
            out[row.code_union] = {
                "lat": 0.0,
                "lng": 0.0,
                "score": 0.99,
                "result_type": "locality",
            }
    return out


def test_quality_and_classify():
    assert address_quality("", "", "") == "none"
    assert address_quality("", "75011", "") == "postcode"
    assert address_quality("12 rue des fleurs", "", "Lyon") == "street_city"
    assert classify("none", 48.8, 2.3, 0.9) == "no_address"
    assert classify("postcode", 48.8, 2.3, 0.4) == "ambiguous"
    assert classify("postcode", 48.8, 2.3, 0.6) == "ok"
    assert classify("postcode", 0.0, 0.0, 0.99) == "failed"
    fix = decide(AddressInput("demo1", "", "", ""), None)
    assert fix.status == "no_address"
    assert fix.lat is None
    assert fix.code_union == "DEMO1"


def test_parse_ban_csv_ignores_blank_codes():
    payload = (
        "code_union,adresse,latitude,longitude,result_score,result_type\n"
        "DEMO1,secret,48.85,2.35,0.8,housenumber\n"
        ",secret,1,1,0.2,street\n"
    )
    parsed = parse_ban_csv(payload)
    assert set(parsed) == {"DEMO1"}
    assert parsed["DEMO1"]["lat"] == 48.85
    assert "secret" not in str(parsed["DEMO1"])


def test_dry_run_places_only_confident_matches_and_prints_no_address():
    engine = _engine()
    summary = run(engine, apply=False, geocoder=_fake_geocoder)
    rendered = summary.render()
    assert summary.placed == 1
    assert summary.no_address == 1
    assert summary.ambiguous == 1
    assert summary.failed == 1
    assert summary.written == 0
    assert SECRET_STREET not in rendered
    assert "rue des Lilas" not in rendered
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM adherent_positions")).scalar()
    assert count == 0


def test_apply_writes_coordinates_without_the_street():
    engine = _engine()
    summary = run(engine, apply=True, geocoder=_fake_geocoder)
    assert summary.written == 4
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT code_union, lat, lng, geocode_status, address_fingerprint FROM adherent_positions"
        )).mappings().all()
    by_code = {row["code_union"]: row for row in rows}
    assert by_code["DEMO1"]["geocode_status"] == "ok"
    assert by_code["DEMO1"]["lat"] == 48.39
    assert by_code["DEMO2"]["lat"] is None
    assert by_code["DEMO3"]["geocode_status"] == "ambiguous"
    assert by_code["DEMO3"]["lat"] is None
    assert by_code["DEMO4"]["geocode_status"] == "failed"
    blob = " ".join(str(dict(row)) for row in rows)
    assert SECRET_STREET not in blob
    def only_retry_failed(rows):
        assert [row.code_union for row in rows] == ["DEMO4"]
        return _fake_geocoder(rows)

    second = run(engine, apply=True, geocoder=only_retry_failed)
    assert second.unchanged == 3
    assert second.failed == 1
    assert "position_source" in second.render()
    assert "absente" not in second.render()


def test_closed_adherents_are_not_geocoded_and_open_duplicate_wins():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text(
            """
            CREATE TABLE nathalie_adherents (
                code_union TEXT,
                adresse TEXT,
                code_postal TEXT,
                ville TEXT,
                is_closed INTEGER
            )
            """
        ))
        conn.execute(text(
            """
            CREATE TABLE adherent_positions (
                code_union TEXT PRIMARY KEY,
                lat REAL,
                lng REAL,
                geocode_status TEXT,
                geocode_score REAL,
                result_type TEXT,
                address_fingerprint TEXT,
                geocoded_at TEXT
            )
            """
        ))
        conn.execute(text(
            "INSERT INTO nathalie_adherents (code_union, adresse, code_postal, ville, is_closed) VALUES "
            "('OPEN', '1 quai', '44000', 'Nantes', 0),"
            "('OPEN', '9 rue fermee', '59000', 'Lille', 1),"
            "('SHUT', '9 rue fermee', '59000', 'Lille', 1)"
        ))
    seen = []

    def geocoder(rows):
        seen.extend(row.code_union for row in rows)
        return {
            row.code_union: {"lat": 47.2, "lng": -1.55, "score": 0.9, "result_type": "housenumber"}
            for row in rows
        }

    summary = run(engine, apply=True, geocoder=geocoder)
    assert seen == ["OPEN"]
    assert summary.closed_skipped == 1
    assert summary.placed == 1
    with engine.connect() as conn:
        codes = [row[0] for row in conn.execute(text("SELECT code_union FROM adherent_positions"))]
        ville = conn.execute(text(
            "SELECT address_fingerprint FROM adherent_positions WHERE code_union = 'OPEN'"
        )).scalar()
    assert codes == ["OPEN"]
    from app.services.ban_geocode import fingerprint
    assert ville == fingerprint("1 quai", "44000", "Nantes")
    rendered = summary.render()
    assert "rue fermee" not in rendered


def test_manual_and_insee_locks_are_never_overwritten():
    from app.services.ban_geocode import GeoFix, _write

    engine = _engine()
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE adherent_positions ADD COLUMN position_source TEXT"))
        conn.execute(text(
            "INSERT INTO adherent_positions "
            "(code_union, lat, lng, geocode_status, address_fingerprint, position_source) VALUES "
            "('DEMO1', 41.9, 8.7, 'ok', 'ancien', 'ok_manual'),"
            "('DEMO3', 43.7, 7.2, 'ok', 'ancien', 'INSEE')"
        ))
    seen = []

    def geocoder(rows):
        seen.extend(row.code_union for row in rows)
        return _fake_geocoder(rows)

    summary = run(engine, apply=True, force=True, geocoder=geocoder)
    assert summary.locked == 2
    assert "DEMO1" not in seen
    assert "DEMO3" not in seen
    assert "DEMO4" in seen
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT code_union, lat, lng, position_source FROM adherent_positions"
        )).mappings().all()
    by_code = {row["code_union"]: row for row in rows}
    assert by_code["DEMO1"]["lat"] == 41.9
    assert by_code["DEMO1"]["lng"] == 8.7
    assert by_code["DEMO3"]["lat"] == 43.7
    assert by_code["DEMO3"]["position_source"] == "INSEE"

    _write(
        engine,
        [GeoFix(code_union="DEMO1", status="ok", lat=48.0, lng=2.0, fingerprint="force")],
        lock_column=True,
    )
    with engine.connect() as conn:
        lat = conn.execute(text(
            "SELECT lat FROM adherent_positions WHERE code_union = 'DEMO1'"
        )).scalar()
    assert lat == 41.9
    rendered = summary.render()
    assert "ne sont pas actifs" not in rendered


def test_force_still_rewrites_without_the_source_column():
    engine = _engine()
    run(engine, apply=True, geocoder=_fake_geocoder)

    def moved(rows):
        out = _fake_geocoder(rows)
        if "DEMO1" in out:
            out["DEMO1"] = {**out["DEMO1"], "lat": 49.0, "lng": 2.0}
        return out

    summary = run(engine, apply=True, force=True, geocoder=moved)
    assert summary.locked == 0
    with engine.connect() as conn:
        row = conn.execute(text(
            "SELECT lat, lng FROM adherent_positions WHERE code_union = 'DEMO1'"
        )).one()
    assert row.lat == 49.0
    assert row.lng == 2.0
