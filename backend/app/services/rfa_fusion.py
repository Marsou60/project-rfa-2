"""
Fusion de comptes pour la RFA : un client qui change de Kbis a du CA
sur plusieurs codes Union. On additionne ce CA et on applique un seul contrat.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from sqlmodel import Session, select

from app.models import Contract, RfaFusion, RfaFusionMember


def parse_codes(raw: Any) -> List[str]:
    """Accepte une liste ou un texte « M0001, M0002 »."""
    if raw is None:
        return []
    if isinstance(raw, str):
        parts = re.split(r"[,;\s]+", raw)
    elif isinstance(raw, (list, tuple)):
        parts = []
        for item in raw:
            parts.extend(re.split(r"[,;\s]+", str(item or "")))
    else:
        parts = re.split(r"[,;\s]+", str(raw))
    out: List[str] = []
    seen = set()
    for part in parts:
        code = part.strip().upper()
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(code)
    return out


def _fusion_dict(session: Session, fusion: RfaFusion) -> Dict[str, Any]:
    members = session.exec(
        select(RfaFusionMember).where(RfaFusionMember.fusion_id == fusion.id)
    ).all()
    contract = session.get(Contract, fusion.contract_id)
    return {
        "id": fusion.id,
        "label": fusion.label,
        "contract_id": fusion.contract_id,
        "contract_name": contract.name if contract else None,
        "codes": sorted(m.code_union for m in members),
    }


def list_fusions(session: Session) -> List[Dict[str, Any]]:
    rows = session.exec(select(RfaFusion).order_by(RfaFusion.label)).all()
    return [_fusion_dict(session, row) for row in rows]


def fusion_for_code(session: Session, code_union: Optional[str]) -> Optional[Dict[str, Any]]:
    code = (code_union or "").strip().upper()
    if not code:
        return None
    member = session.exec(
        select(RfaFusionMember).where(RfaFusionMember.code_union == code)
    ).first()
    if not member:
        return None
    fusion = session.get(RfaFusion, member.fusion_id)
    if not fusion:
        return None
    return _fusion_dict(session, fusion)


def create_fusion(
    session: Session,
    *,
    label: str,
    contract_id: int,
    codes: Any,
) -> Dict[str, Any]:
    name = (label or "").strip()
    if not name:
        raise ValueError("Nom de la fusion requis")
    parsed = parse_codes(codes)
    if len(parsed) < 2:
        raise ValueError("Indiquez au moins deux codes Union")
    if not session.get(Contract, contract_id):
        raise ValueError("Contrat introuvable")
    taken = session.exec(
        select(RfaFusionMember).where(RfaFusionMember.code_union.in_(parsed))
    ).all()
    if taken:
        busy = ", ".join(sorted(m.code_union for m in taken))
        raise ValueError(f"Déjà dans une fusion : {busy}")
    fusion = RfaFusion(label=name, contract_id=int(contract_id))
    session.add(fusion)
    session.commit()
    session.refresh(fusion)
    for code in parsed:
        session.add(RfaFusionMember(fusion_id=fusion.id, code_union=code))
    session.commit()
    session.refresh(fusion)
    return _fusion_dict(session, fusion)


def load_rows_for_codes(codes: List[str], year: int):
    """Concatène le Pure Data de chaque code (cumulé, sinon mensuel)."""
    from app.services.entity_directory import load_pure_data_rows_for_entity

    rows: List[Dict] = []
    source = ""
    for code in codes:
        part, src = load_pure_data_rows_for_entity(code_union=code, year=year)
        if part:
            rows.extend(part)
            source = src or source
    return rows, source


def update_fusion(
    session: Session,
    fusion_id: int,
    *,
    label: Optional[str] = None,
    contract_id: Optional[int] = None,
    codes: Any = None,
) -> Dict[str, Any]:
    fusion = session.get(RfaFusion, fusion_id)
    if not fusion:
        raise KeyError(fusion_id)
    if label is not None:
        name = label.strip()
        if not name:
            raise ValueError("Nom de la fusion requis")
        fusion.label = name
    if contract_id is not None:
        if not session.get(Contract, int(contract_id)):
            raise ValueError("Contrat introuvable")
        fusion.contract_id = int(contract_id)
    if codes is not None:
        parsed = parse_codes(codes)
        if len(parsed) < 2:
            raise ValueError("Indiquez au moins deux codes Union")
        taken = session.exec(
            select(RfaFusionMember).where(
                RfaFusionMember.code_union.in_(parsed),
                RfaFusionMember.fusion_id != fusion.id,
            )
        ).all()
        if taken:
            busy = ", ".join(sorted(m.code_union for m in taken))
            raise ValueError(f"Déjà dans une fusion : {busy}")
        current = session.exec(
            select(RfaFusionMember).where(RfaFusionMember.fusion_id == fusion.id)
        ).all()
        for member in current:
            session.delete(member)
        session.flush()
        for code in parsed:
            session.add(RfaFusionMember(fusion_id=fusion.id, code_union=code))
    session.add(fusion)
    session.commit()
    session.refresh(fusion)
    return _fusion_dict(session, fusion)


def delete_fusion(session: Session, fusion_id: int) -> None:
    fusion = session.get(RfaFusion, fusion_id)
    if not fusion:
        raise KeyError(fusion_id)
    members = session.exec(
        select(RfaFusionMember).where(RfaFusionMember.fusion_id == fusion.id)
    ).all()
    for member in members:
        session.delete(member)
    session.delete(fusion)
    session.commit()
