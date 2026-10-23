"""Réécriture d'une note de visite par Claude. N'enregistre rien."""
from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.services.client_notes import MAX_NOTE

_SYSTEM = """Tu réécris des notes de visite d'un commercial du groupement Union, un réseau de distributeurs de pièces auto.
Le lecteur est un collègue qui reprendra le dossier plusieurs semaines plus tard.

Contraintes :
- N'invente aucun fait, chiffre, nom, date, promesse ou suite à donner.
- Garde chaque information utile, même si la note de départ est télégraphique ou mal écrite.
- Français clair, phrases courtes, ton vivant et concret. Jamais corporate, jamais moqueur.
- Si plusieurs faits : une phrase d'accroche, puis des puces qui commencent par « • ».
- Sinon : un court paragraphe.
- Pas de titre, pas de préambule, pas de « voici la note améliorée », pas d'emoji.
"""


def polish_note(raw: str) -> str:
    source = (raw or "").strip()
    if not source:
        raise ValueError("Écrivez une note avant de l'améliorer.")
    if len(source) > MAX_NOTE:
        raise ValueError("La note est trop longue pour être améliorée.")
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        raise ValueError("L'amélioration Claude n'est pas encore branchée sur le serveur.")
    model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5").strip() or "claude-sonnet-4-5"
    payload = {
        "model": model,
        "max_tokens": 1200,
        "system": _SYSTEM,
        "messages": [{"role": "user", "content": source}],
    }
    request = Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(payload).encode(),
        headers={
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=28) as response:
            body = json.loads(response.read().decode())
    except HTTPError as exc:
        raise ValueError(_anthropic_error(exc)) from None
    except (URLError, TimeoutError):
        raise ValueError("Claude met trop de temps à répondre. Réessayez.") from None
    text = _extract_text(body).strip()
    if not text:
        raise ValueError("Claude n'a rien renvoyé. Réessayez.")
    return text[:MAX_NOTE]


def _extract_text(body: dict) -> str:
    parts = []
    for block in body.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "text" and block.get("text"):
            parts.append(block["text"])
    return "\n".join(parts)


def _anthropic_error(exc: HTTPError) -> str:
    if exc.code in (401, 403):
        return "La clé Claude a été refusée par le serveur."
    if exc.code == 429:
        return "Claude est saturé pour le moment. Réessayez dans une minute."
    if exc.code == 404:
        return "Le modèle Claude configuré est introuvable."
    return "Claude n'a pas pu réécrire la note."
