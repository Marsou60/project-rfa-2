"""
Remplace l'annuaire Nathalie par LISTE_CLIENTS_UNION_SIRET_TVA.xlsx.

Upsert par code_union : conserve RIB / Kbis / dossier Drive déjà liés.
Supprime les codes absents du fichier (ex. Groupement Union recréé ensuite).

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
    list_clients,
    parse_excel_rows,
    replace_directory,
)

SAMPLE = ROOT / "SAMPLES" / "LISTE_CLIENTS_UNION_SIRET_TVA.xlsx"


def main() -> None:
    if not SAMPLE.exists():
        raise SystemExit(f"Fichier introuvable : {SAMPLE}")
    init_db()
    rows = parse_excel_rows(str(SAMPLE))
    print(f"[NATHALIE] {len(rows)} lignes lues (LISTE CLIENTS SIRET/TVA)")
    with_region = sum(1 for r in rows if r.get("region_commerciale"))
    with_agent = sum(1 for r in rows if r.get("agent_union"))
    closed = sum(1 for r in rows if r.get("is_closed"))
    print(f"[NATHALIE] région={with_region} agent={with_agent} fermés={closed}")
    result = replace_directory(rows)
    print(
        f"[NATHALIE] import: created={result['created']} "
        f"updated={result['updated']} deleted={result.get('deleted', 0)} "
        f"errors={len(result['errors'])}"
    )
    for err in result["errors"]:
        print("  -", err)
    clients = list_clients()
    closed_db = sum(1 for c in clients if c.get("is_closed"))
    drive = sum(1 for c in clients if c.get("drive_folder_id"))
    print(
        f"[NATHALIE] table: {len(clients)} adhérents "
        f"({closed_db} fermés, {drive} avec dossier Drive)"
    )


if __name__ == "__main__":
    main()
