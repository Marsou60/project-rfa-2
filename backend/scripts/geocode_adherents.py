"""Géocode les adhérents et enregistre lat/lng dans adherent_positions.

À lancer par Martial, après la migration SQL. Le script lit les adresses dans
la base (table nathalie_adherents) et appelle l'API Adresse du gouvernement.
Il n'écrit un fichier nulle part : les adresses ne quittent pas le process,
sauf l'envoi ponctuel à api-adresse.data.gouv.fr.

Depuis le dossier backend, avec DATABASE_URL déjà exporté dans l'environnement
(le même que Railway). Ne passez pas l'URL en argument : elle contient le mot
de passe et resterait dans l'historique du terminal.

    python scripts/geocode_adherents.py
    python scripts/geocode_adherents.py --apply

Sans --apply, rien n'est écrit. Le script affiche seulement des comptes.
--force recalcule même les lignes dont l'adresse n'a pas changé.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine  # noqa: E402

from app.services.ban_geocode import run  # noqa: E402


def _engine_from_env():
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        print(
            "DATABASE_URL est absent. Exportez-le dans l'environnement, "
            "comme pour le backend. Ne le mettez pas dans la commande.",
            file=sys.stderr,
        )
        return None
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return create_engine(url, pool_pre_ping=True)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Géocode les adhérents (API Adresse).")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Écrit les coordonnées. Sans ce drapeau, simulation.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Recalcule même si l'adresse n'a pas changé.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Ne traite que les N premiers codes (essai).",
    )
    args = parser.parse_args(argv)
    engine = _engine_from_env()
    if engine is None:
        return 2
    try:
        summary = run(engine, apply=args.apply, force=args.force, limit=args.limit)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        print("Aucune adresse n'est affichée. Rien n'a été écrit si --apply n'avait pas commencé.", file=sys.stderr)
        return 1
    print(summary.render())
    if any("absente" in line for line in summary.lines):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
