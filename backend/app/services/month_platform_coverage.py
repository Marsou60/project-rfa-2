"""Indique si un mois est déjà importé pour une plateforme, ou encore en retard."""

from typing import Any, Dict, Iterable, Optional


def coverage_status(month: int, covered_through: Optional[int]) -> str:
    """known : le mois est dans les données (0 € est un vrai zéro).

    pending : la plateforme n'a pas encore ce mois (EXADIS ou DCA en retard).
    """
    if covered_through is not None and 1 <= int(covered_through) <= 12 and int(month) > int(covered_through):
        return "pending"
    return "known"


def annotate_platform_months(
    platforms: Iterable[Dict[str, Any]],
    platform_months: Optional[Dict[str, int]],
) -> None:
    covered = {str(key).strip().upper(): int(value) for key, value in (platform_months or {}).items()}
    for platform in platforms:
        name = str(platform.get("platform") or "").strip().upper()
        through = covered.get(name)
        for cell in platform.get("months") or []:
            cell["status"] = coverage_status(int(cell.get("month") or 0), through)
