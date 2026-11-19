"""Carte adhérents : la rue ne sort jamais, le hors-périmètre non plus."""
from __future__ import annotations

import json

from sqlalchemy import create_engine, text

from app.services.adherent_map import (
    contract_tier_label,
    list_map_adherents,
    near_contract_tier,
    platform_details,
)

SECRET_STREET = "12 rue des Lilas fictive"


def _engine(with_positions: bool = True):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text(
            """
            CREATE TABLE nathalie_adherents (
                code_union TEXT PRIMARY KEY,
                nom_client TEXT,
                ville TEXT,
                agent_union TEXT,
                is_closed INTEGER,
                adresse TEXT,
                code_postal TEXT,
                telephone TEXT
            )
            """
        ))
        conn.execute(text(
            """
            CREATE TABLE adherent_profils (
                code_union TEXT,
                annee INTEGER,
                raison_sociale TEXT,
                ca REAL,
                plateformes TEXT,
                commercial TEXT
            )
            """
        ))
        if with_positions:
            conn.execute(text(
                """
                CREATE TABLE adherent_positions (
                    code_union TEXT PRIMARY KEY,
                    lat REAL,
                    lng REAL,
                    geocode_status TEXT
                )
                """
            ))
        conn.execute(text(
            """
            INSERT INTO nathalie_adherents
                (code_union, nom_client, ville, agent_union, is_closed, adresse, code_postal, telephone)
            VALUES
                ('DEMO1', 'Garage des Tilleuls', 'Brest', 'Rayane', 0, :street, '29200', '0600000000'),
                ('DEMO2', 'Atelier sans adresse', NULL, 'Rayane', 0, '', '', '0600000001'),
                ('DEMO3', 'Pièces du Canal', 'Lyon', 'El mehdi', 0, '1 quai', '69001', '0600000002'),
                ('DEMO4', 'Magasin fermé', 'Lille', 'Rayane', 1, '9 rue close', '59000', '0600000003'),
                ('DEMO5', 'Résultat incertain', 'Saint-Martin', 'Rayane', 0, 'place', '97150', '0600000004')
            """
        ), {"street": SECRET_STREET})
        conn.execute(text(
            """
            INSERT INTO adherent_profils
                (code_union, annee, raison_sociale, ca, plateformes, commercial)
            VALUES
                ('DEMO1', 2026, 'Garage des Tilleuls', 86000, '["ACR","DCA"]', 'RAYANE'),
                ('DEMO3', 2025, 'Ancien', 1000, '["ACR"]', 'EL MEHDI'),
                ('DEMO3', 2026, 'Pièces du Canal', 250000, :platforms, 'EL MEHDI'),
                ('DEMO6', 2026, 'Profil seul', 40000, '["ALLIANCE"]', 'Emeric')
            """
        ), {
            "platforms": '[{"platform":"ACR","ca":40000},{"platform":"EXADIS","ca":210000}]',
        })
        if with_positions:
            conn.execute(text(
                """
                INSERT INTO adherent_positions (code_union, lat, lng, geocode_status) VALUES
                    ('DEMO1', 48.39, -4.486, 'ok'),
                    ('DEMO3', 45.75, 4.85, 'ok'),
                    ('DEMO4', 50.63, 3.06, 'ok'),
                    ('DEMO5', 43.0, 2.0, 'ambiguous'),
                    ('DEMO6', 47.2, -1.55, 'ok')
                """
            ))
    return engine


def _payload(engine, scope):
    import app.database as database

    database.engine = engine
    try:
        return list_map_adherents(scope)
    finally:
        pass


def test_contract_tier_and_principal_supplier():
    assert contract_tier_label(None) is None
    assert contract_tier_label(0) == "Classique"
    assert contract_tier_label(86_000) == "Classique"
    assert contract_tier_label(100_001) == "Silver"
    assert contract_tier_label(250_000) == "Silver"
    assert contract_tier_label(300_001) == "Gold"
    labels, principal = platform_details(["DCA", "ACR"])
    assert labels == ["DCA", "ACR"]
    assert principal == "DCA"
    labels, principal = platform_details([
        {"platform": "ACR", "ca": 12000},
        {"label": "EXADIS", "montant": 90000},
        {"platform": "ACR", "ca": 15000},
    ])
    assert labels == ["ACR", "EXADIS"]
    assert principal == "EXADIS"
    labels, principal = platform_details({"ALLIANCE": 10, "ACR": 50})
    assert principal == "ACR"
    assert set(labels) == {"ALLIANCE", "ACR"}


def test_near_contract_tier_matches_rfa_screen():
    assert near_contract_tier(86_000) is True
    assert near_contract_tier(50_000) is False
    assert near_contract_tier(250_000) is True
    assert near_contract_tier(180_000) is False
    assert near_contract_tier(300_001) is False
    assert near_contract_tier(None) is False


def test_payload_has_no_postal_address_and_respects_scope(monkeypatch):
    engine = _engine()
    import app.database as database
    monkeypatch.setattr(database, "engine", engine)

    full = list_map_adherents(None)
    blob = json.dumps(full).lower()
    assert "lilas" not in blob
    assert "0600000000" not in blob
    assert "29200" not in blob
    keys = set()

    def walk(value):
        if isinstance(value, dict):
            keys.update(value)
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(full)
    assert keys.isdisjoint({
        "adresse", "code_postal", "telephone", "mail", "siret", "rib_url",
    })

    codes = {point["code_union"] for point in full["points"]}
    assert codes == {"DEMO1", "DEMO3", "DEMO6"}
    assert "DEMO4" not in codes
    unlocated = {row["code_union"]: row["reason"] for row in full["unlocated"]}
    assert unlocated["DEMO2"] == "no_address"
    assert unlocated["DEMO5"] == "ambiguous"
    assert "DEMO4" not in unlocated

    brest = next(point for point in full["points"] if point["code_union"] == "DEMO1")
    assert brest["ville"] == "Brest"
    assert brest["plateformes"] == ["ACR", "DCA"]
    assert brest["near_tier"] is True
    assert brest["commercial"] == "Rayane"
    assert brest["palier"] == "Classique"
    assert brest["fournisseur_principal"] == "ACR"
    lyon = next(point for point in full["points"] if point["code_union"] == "DEMO3")
    assert lyon["ca"] == 250000
    assert lyon["near_tier"] is True
    assert lyon["plateformes"] == ["ACR", "EXADIS"]
    assert lyon["fournisseur_principal"] == "EXADIS"
    assert lyon["palier"] == "Silver"
    assert lyon["commercial"] == "El Mehdi"
    solo = next(point for point in full["points"] if point["code_union"] == "DEMO6")
    assert solo["fournisseur_principal"] == "ALLIANCE"
    assert solo["palier"] == "Classique"
    assert solo["commercial"] == "Emeric"
    missing = next(row for row in full["unlocated"] if row["code_union"] == "DEMO2")
    assert missing["commercial"] == "Rayane"
    assert missing["ca"] is None
    assert missing["palier"] is None
    assert missing["fournisseur_principal"] is None

    rayane = list_map_adherents("Rayane")
    rayane_codes = {point["code_union"] for point in rayane["points"]}
    assert rayane_codes == {"DEMO1"}
    assert {row["code_union"] for row in rayane["unlocated"]} == {"DEMO2", "DEMO5"}

    mehdi = list_map_adherents("El Mehdi")
    assert {point["code_union"] for point in mehdi["points"]} == {"DEMO3"}


def test_missing_position_table_lists_everyone_as_pending(monkeypatch):
    engine = _engine(with_positions=False)
    import app.database as database
    monkeypatch.setattr(database, "engine", engine)
    payload = list_map_adherents(None)
    assert payload["migration_required"] is True
    assert payload["points"] == []
    assert payload["unlocated"]
    assert {row["reason"] for row in payload["unlocated"]} == {"pending"}
    blob = json.dumps(payload).lower()
    assert "lilas" not in blob


def test_map_route_requires_staff():
    from app.api import require_staff, router

    routes = [route for route in router.routes if getattr(route, "path", None) == "/map/adherents"]
    assert len(routes) == 1
    dependant = routes[0].dependant
    calls = []
    stack = [dependant]
    while stack:
        item = stack.pop()
        if item.call:
            calls.append(item.call)
        stack.extend(item.dependencies)
    assert require_staff in calls
