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
