"""
Seed / sync des cotisations RFA 2026.

- Contrats spécifiques (fiches 1–21) : montants fixes
- Adhérents 2026 : montants selon niveau d'atterrissage (projection Pure Data)

N'écrase PAS le statut Offrir déjà enregistré (facturee/deduite).
Met à jour le montant si le barème théorique change, sauf si overridden
et montant forcé différent — on aligne toujours sur le barème théorique
quand source=special/level, en conservant facturee/deduite.

Usage:
  python _seed_cotisations_2026.py
  python _seed_cotisations_2026.py --offrir-all   # tout passer en Offrir
"""
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from sqlmodel import Session, select

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

from app.database import engine, init_db
from app.models import CotisationSetting
from app.services.cotisation_2026 import SPECIAL_COTISATION_2026
from app.services.pure_data_cumulative_supabase import read_cumulative_rows, count_cumulative_rows
from app.services.pure_data_network_rfa import compute_network_rfa_2026


YEAR = 2026


def _upsert(
    session: Session,
    *,
    entity_key: str,
    entity_type: str,
    amount: float,
    offrir_all: bool,
) -> str:
    key = (entity_key or "").strip().upper()
    if not key or amount <= 0:
        return "skip"
    existing = session.exec(
        select(CotisationSetting).where(
            CotisationSetting.entity_key == key,
            CotisationSetting.entity_type == entity_type,
            CotisationSetting.year == YEAR,
        )
    ).first()
    now = datetime.now()
    if existing:
        existing.amount = amount
        if offrir_all:
            existing.facturee = False
            existing.deduite = False
        # sinon conserve facturee/deduite
        existing.updated_at = now
        session.add(existing)
        return "updated"
    session.add(
        CotisationSetting(
            entity_key=key,
            entity_type=entity_type,
            amount=amount,
            facturee=False if offrir_all else True,
            deduite=False if offrir_all else True,
            year=YEAR,
            updated_at=now,
        )
    )
    return "created"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--offrir-all",
        action="store_true",
        help="Initialise / force toutes les cotisations 2026 en Offrir",
    )
    args = parser.parse_args()
    init_db()

    created = updated = 0
    with Session(engine) as session:
        # 1) Spéciaux (fiches)
        for key, amount in SPECIAL_COTISATION_2026.items():
            entity_type = "group" if " " in key or key in (
                "CODIFA",
                "GROUPE APA MARSEILLE",
                "GROUPE AUTO MOURAD",
                "GROUPE CENTER",
                "GROUPE DISCOUNT",
                "GROUPE JUMBO",
                "GROUPE SMP",
            ) or key.startswith("GROUPE") else "client"
            if key.startswith("M") and len(key) <= 6:
                entity_type = "client"
            if key in ("CODIFA",) or key.startswith("GROUPE"):
                entity_type = "group"
            action = _upsert(
                session,
                entity_key=key,
                entity_type=entity_type,
                amount=amount,
                offrir_all=args.offrir_all,
            )
            if action == "created":
                created += 1
            elif action == "updated":
                updated += 1
            print(f"[SPECIAL] {key:30} {amount:>7.0f} €  ({entity_type}) {action}")

        session.commit()

    # 2) Adhérents 2026 via réseau Pure Data (niveau projection)
    try:
        if count_cumulative_rows() <= 0:
            raise RuntimeError("aucune ligne cumulative")
        all_rows, _, _ = read_cumulative_rows()
        rows = [
            r for r in (all_rows or [])
            if int(r.get("annee") or r.get("year") or 0) == YEAR
            or str(r.get("annee") or r.get("year") or "") == str(YEAR)
        ]
        if not rows:
            rows = all_rows or []
        # reporting month depuis max mois
        months = [int(r.get("mois") or r.get("month") or 0) for r in rows if r.get("mois") or r.get("month")]
        reporting_month = max(months) if months else None
        network = compute_network_rfa_2026(
            rows,
            year=YEAR,
            reporting_month=reporting_month,
        )
    except Exception as exc:
        print(f"[WARN] Pure Data réseau indisponible — skip niveaux Adhérents: {exc}")
        network = None

    if network:
        with Session(engine) as session:
            for e in (network.get("independents") or []) + (network.get("groups") or []):
                cot = e.get("cotisation") or {}
                if cot.get("source") != "level":
                    continue
                amount = float(cot.get("amount") or 0)
                if amount <= 0:
                    continue
                entity_type = "group" if e.get("entity_type") == "group" else "client"
                # Ne pas écraser un spécial déjà mappé
                from app.services.cotisation_2026 import special_cotisation_amount
                if special_cotisation_amount(e.get("code")) is not None:
                    continue
                action = _upsert(
                    session,
                    entity_key=e.get("code"),
                    entity_type=entity_type,
                    amount=amount,
                    offrir_all=args.offrir_all,
                )
                if action == "created":
                    created += 1
                elif action == "updated":
                    updated += 1
                print(
                    f"[LEVEL]   {str(e.get('code')):30} {amount:>7.0f} €  "
                    f"({cot.get('label')}) {action}"
                )
            session.commit()

    print(f"\nDone. created={created} updated={updated} offrir_all={args.offrir_all}")


if __name__ == "__main__":
    main()
