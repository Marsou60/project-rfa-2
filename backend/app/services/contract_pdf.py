"""
Résolution du PDF de contrat / annexe rémunération à afficher
dans l'espace commercial.

- Contrats spéciaux : annexe nominative (data/contract_pdfs/special/<CLE>.pdf)
- Adhérents 2026 (indépendants hors groupe) : PDF standard
  Remuneration_Adherents_2026.pdf
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from sqlmodel import Session

from app.services.contract_resolver import (
    is_adherent_2026_contract,
    is_legacy_base_contract,
    normalize_value,
    resolve_contract,
)

ROOT = Path(__file__).resolve().parents[2]  # backend/
PDF_DIR = ROOT / "data" / "contract_pdfs"
SPECIAL_DIR = PDF_DIR / "special"
STANDARD_PDF = PDF_DIR / "Remuneration_Adherents_2026.pdf"

# Cible d'affectation (CODE_UNION / GROUPE_CLIENT) → fichier special/<CLE>.pdf
# Clé = valeur normalisée (uppercase, espaces → _)
SPECIAL_PDF_KEYS = {
    "M0005",
    "M0061",
    "M0110",
    "M0027",
    "M0028",
    "M0032",
    "M0163",
    "GROUPE_AUTO_MOURAD",
    "GROUPE_CENTER",
    "GROUPE_JUMBO",
    "GROUPE_SMP",
    "M0248",
    "M0164",
    "M0173",
    "M0258",
    "M0166",
    "M0022",
}


@dataclass
class ContractPdfInfo:
    available: bool
    kind: str  # "special" | "standard" | "none"
    label: str
    contract_name: str
    filename: str
    path: Optional[Path] = None
    reason: Optional[str] = None


def _file_key(value: str) -> str:
    """Normalise une cible en nom de fichier (M0110, GROUPE_JUMBO…)."""
    txt = unicodedata.normalize("NFD", value or "")
    txt = "".join(ch for ch in txt if unicodedata.category(ch) != "Mn")
    txt = txt.strip().upper()
    return re.sub(r"[^A-Z0-9]+", "_", txt).strip("_")


def special_pdf_path(target_value: str) -> Optional[Path]:
    key = _file_key(target_value)
    if key not in SPECIAL_PDF_KEYS:
        # Accepte aussi la clé brute si le fichier existe déjà
        path = SPECIAL_DIR / f"{key}.pdf"
        return path if path.is_file() else None
    path = SPECIAL_DIR / f"{key}.pdf"
    return path if path.is_file() else None


def resolve_contract_pdf(
    session: Session,
    *,
    mode: str,
    entity_id: str,
    code_union: Optional[str] = None,
    groupe_client: Optional[str] = None,
) -> ContractPdfInfo:
    """
    Détermine le PDF applicable pour l'entité (politique année 2026).

    mode=client : entity_id = code_union ; groupe_client optionnel pour la résolution.
    mode=group  : entity_id = groupe_client.

    Note : `session` est conservé pour cohérence d'API ; resolve_contract ouvre
    sa propre session (comportement historique du resolver).
    """
    mode = (mode or "client").strip().lower()
    eid = normalize_value(entity_id)

    if mode == "group":
        code = None
        groupe = eid or normalize_value(groupe_client)
        lookup_keys = [groupe] if groupe else []
    else:
        code = eid or normalize_value(code_union)
        groupe = normalize_value(groupe_client) if groupe_client else None
        lookup_keys = [k for k in (code, groupe) if k]

    try:
        contract = resolve_contract(
            code_union=code,
            groupe_client=groupe,
            year=2026,
        )
    except Exception:
        contract = None
    cname = (contract.name if contract else "") or ""

    # 1) Annexe nominative si on a un PDF pour la cible (code puis groupe)
    for key in lookup_keys:
        path = special_pdf_path(key)
        if path:
            return ContractPdfInfo(
                available=True,
                kind="special",
                label=f"Annexe rémunération — {cname or key}",
                contract_name=cname,
                filename=path.name,
                path=path,
            )

    # 2) Contrat Adhérents 2026 / base → PDF standard
    if contract and (is_adherent_2026_contract(contract) or is_legacy_base_contract(contract)):
        if STANDARD_PDF.is_file():
            return ContractPdfInfo(
                available=True,
                kind="standard",
                label="Contrat Adhérents 2026 — annexe rémunération",
                contract_name=cname or "Adhérents 2026",
                filename=STANDARD_PDF.name,
                path=STANDARD_PDF,
            )
        return ContractPdfInfo(
            available=False,
            kind="none",
            label="",
            contract_name=cname,
            filename="",
            reason="PDF standard Adhérents 2026 introuvable sur le serveur",
        )

    # 3) Contrat spécial sans fichier généré (APA, Discount, Lifting…)
    if contract:
        return ContractPdfInfo(
            available=False,
            kind="none",
            label="",
            contract_name=cname,
            filename="",
            reason=f"Annexe PDF non encore disponible pour « {cname} »",
        )

    return ContractPdfInfo(
        available=False,
        kind="none",
        label="",
        contract_name="",
        filename="",
        reason="Aucun contrat applicable trouvé",
    )
