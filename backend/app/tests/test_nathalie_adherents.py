from pathlib import Path

from app.services.nathalie_adherents import (
    clean_code_union,
    clean_postal,
    clean_siret,
    is_closed_from,
    normalize_groupe_label,
    parse_excel_rows,
)

SAMPLE = (
    Path(__file__).resolve().parents[2]
    / "SAMPLES"
    / "Liste adhérents Groupement Union 2026 - COMPLET (2).xlsx"
)


def test_clean_postal_and_siret():
    assert clean_postal(57050.0) == "57050"
    assert clean_postal("75011") == "75011"
    assert clean_siret(97974266500016.0) == "97974266500016"
    assert clean_siret("97974266500016.0") == "97974266500016"
    assert clean_siret("?") is None
    assert clean_code_union("m0160") == "M0160"
    assert clean_code_union("-") is None


def test_groupe_and_closed():
    assert normalize_groupe_label("INDEPENDANT") == "INDEPENDANT UNION"
    assert normalize_groupe_label("GROUPE CODIFA") == "GROUPE CODIFA"
    assert is_closed_from("APA MARSEILLE (FERME)", None)
    assert is_closed_from("X", "liquidation judiciaire")
    assert not is_closed_from("GARAGE DUPONT", None)


def test_parse_juillet_2026_excel():
    if not SAMPLE.exists():
        return
    rows = parse_excel_rows(str(SAMPLE))
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
