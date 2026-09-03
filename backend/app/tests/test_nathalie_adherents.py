from pathlib import Path

from app.services.nathalie_adherents import (
    clean_code_union,
    clean_postal,
    clean_siret,
    is_closed_from,
    normalize_groupe_label,
    parse_excel_rows,
)

JUILLET = (
    Path(__file__).resolve().parents[2]
    / "SAMPLES"
    / "Liste adhérents Groupement Union 2026 - COMPLET (2).xlsx"
)
LISTE_SIRET = (
    Path(__file__).resolve().parents[2]
    / "SAMPLES"
    / "LISTE_CLIENTS_UNION_SIRET_TVA.xlsx"
)


def test_clean_postal_and_siret():
    assert clean_postal(57050.0) == "57050"
    assert clean_postal("75011") == "75011"
    assert clean_postal("57050 Le Ban-Saint-Martin, France") == "57050"
    assert clean_siret(97974266500016.0) == "97974266500016"
    assert clean_siret("97974266500016.0") == "97974266500016"
    assert clean_siret("?") is None
    assert clean_code_union("m0160") == "M0160"
    assert clean_code_union("-") is None


def test_groupe_and_closed():
    assert normalize_groupe_label("INDEPENDANT") == "INDEPENDANT UNION"
    assert normalize_groupe_label("GROUPE CODIFA") == "GROUPE CODIFA"
    assert is_closed_from("APA MARSEILLE (FERME)", None)
    assert is_closed_from("JUMBO PNEUS ROUEN (FERMER)", None)
    assert is_closed_from("X", "liquidation judiciaire")
    assert is_closed_from("X", None, "Cessée")
    assert not is_closed_from("GARAGE DUPONT", None)
    assert not is_closed_from("GARAGE DUPONT", None, "Active")


def test_parse_juillet_2026_excel():
    if not JUILLET.exists():
        return
    rows = parse_excel_rows(str(JUILLET))
    assert len(rows) >= 280
    codes = [clean_code_union(r["code_union"]) for r in rows]
    assert None not in codes
    # M0265 apparaît 2 fois (même magasin Jumbo Villetaneuse)
    assert len(set(codes)) >= 280
    assert len(codes) - len(set(codes)) <= 2
    prefixes = {}
    for c in codes:
        prefixes[c[0]] = prefixes.get(c[0], 0) + 1
    assert prefixes.get("J", 0) >= 30
    assert prefixes.get("M", 0) >= 240
    groupes = {r["groupe"] for r in rows if r.get("groupe")}
    assert "GROUPE CODIFA" in groupes
    assert "GROUPE CENTER" in groupes
    assert any(r["is_closed"] for r in rows)


def test_parse_liste_clients_siret_tva():
    if not LISTE_SIRET.exists():
        return
    rows = parse_excel_rows(str(LISTE_SIRET))
    codes = [clean_code_union(r["code_union"]) for r in rows]
    assert None not in codes
    assert len(codes) == len(set(codes))
    assert len(rows) >= 320
    assert any(r.get("region_commerciale") for r in rows)
    assert any(r.get("agent_union") for r in rows)
    assert any(r.get("raison_sociale") for r in rows)
    closed = [r for r in rows if r.get("is_closed")]
    assert 10 <= len(closed) <= 80
    # Périmètre 2025 n'est pas un motif de fermeture à lui seul
    open_2025 = [
        r for r in rows
        if str(r.get("perimetre") or "").startswith("2025") and not r.get("is_closed")
    ]
    assert len(open_2025) >= 200
    jumbo = next(r for r in rows if r["code_union"] == "J0068")
    assert jumbo["is_closed"]
    assert jumbo["agent_union"] == "Vanessa"
