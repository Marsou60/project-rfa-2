"""
Seed de l'annuaire Nathalie depuis la liste Excel Union (feuille JUILLET 2026).

Upsert par code_union : ne duplique pas, conserve RIB/Kbis/Drive déjà renseignés.

Usage (depuis backend/) :
  python _seed_nathalie_adherents.py
"""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

from app.database import init_db  # noqa: E402
from app.services.nathalie_adherents import (  # noqa: E402
    import_excel_rows,
    list_clients,
    parse_excel_rows,
)

SAMPLE = ROOT / "SAMPLES" / "Liste adhérents Groupement Union 2026 - COMPLET (2).xlsx"


def main() -> None:
    if not SAMPLE.exists():
        raise SystemExit(f"Fichier introuvable : {SAMPLE}")
    init_db()
    rows = parse_excel_rows(str(SAMPLE))
    print(f"[NATHALIE] {len(rows)} lignes lues (JUILLET 2026)")
    result = import_excel_rows(rows)
    print(
        f"[NATHALIE] import: created={result['created']} "
        f"updated={result['updated']} errors={len(result['errors'])}"
    )
    for err in result["errors"]:
        print("  -", err)
    clients = list_clients()
    closed = sum(1 for c in clients if c.get("is_closed"))
    print(f"[NATHALIE] table: {len(clients)} adhérents ({closed} fermés)")


if __name__ == "__main__":
    main()
