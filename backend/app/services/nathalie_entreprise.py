"""
Préremplissage Nathalie : API Recherche d'entreprises + lecture Kbis.

L'OCR / le texte PDF ne sert qu'à extraire le SIRET (et éventuellement la TVA).
Les champs officiels (raison sociale, adresse, enseigne, TVA) viennent de
https://recherche-entreprises.api.gouv.fr (Annuaire des entreprises, sans clé).
"""
from __future__ import annotations

import io
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

SEARCH_URL = "https://recherche-entreprises.api.gouv.fr/search"
USER_AGENT = "GroupementUnion-Nathalie/1.0 (+https://groupementunion.pro)"
MAX_KBIS_BYTES = 10 * 1024 * 1024

TVA_RE = re.compile(r"\bFR\s*([0-9]{2})\s*([0-9]{9})\b", re.IGNORECASE)
SIRET_LABEL_RE = re.compile(
    r"\bSIRET\b\s*[:\.]?\s*((?:\d[\s.\-]*){14})",
    re.IGNORECASE,
)
SIRET_GROUPED_RE = re.compile(
    r"\b(\d{3}[\s.\-]\d{3}[\s.\-]\d{3}[\s.\-]\d{5})\b",
)
SIREN_LABEL_RE = re.compile(
    r"\bSIREN\b\s*[:\.]?\s*((?:\d[\s.\-]*){9})",
    re.IGNORECASE,
)
# RCS Paris B 443 061 841  |  RCS de Nanterre 443061841
RCS_RE = re.compile(
    r"""
    \bRCS\b
    (?:\s+(?:de|du))?
    (?:\s+[A-Za-zÀ-ÿ'().\-]+){0,5}
    (?:\s+[ABD])?
    \s+(\d{3}[\s.\-]*\d{3}[\s.\-]*\d{3})
    \b
    """,
    re.IGNORECASE | re.VERBOSE,
)
UNIQUE_ID_RE = re.compile(
    r"num[ée]ro unique(?:\s+d['’]identification)?\s*[:\.]?\s*((?:\d[\s.\-]*){9})",
    re.IGNORECASE,
)
SIREN_NEXTLINE_RE = re.compile(
    r"\b(?:SIREN|RCS|n[°o]\s*(?:SIREN|RCS)|n[°o]\s*unique)\b[^\S\r\n]*[:\.]?[^\S\r\n]*[\r\n]+\s*[ABD]?\s*(\d{3}[\s.\-]*\d{3}[\s.\-]*\d{3})\b",
    re.IGNORECASE,
)
IMMAT_RCS_RE = re.compile(
    r"immatricul[ée]e?\s+au\s+RCS.{0,60}?(\d{3}[\s.\-]*\d{3}[\s.\-]*\d{3})",
    re.IGNORECASE | re.DOTALL,
)
RM_RE = re.compile(
    r"\b(?:RM|r[ée]pertoire des m[ée]tiers)\b.{0,40}?(\d{3}[\s.\-]*\d{3}[\s.\-]*\d{3})",
    re.IGNORECASE | re.DOTALL,
)
GROUPED_SIREN_RE = re.compile(r"\b(\d{3}[\s.\-]\d{3}[\s.\-]\d{3})\b")
DENOM_LINE_RE = re.compile(
    r"^(?:d[ée]nomination(?:\s+ou\s+raison sociale)?|raison sociale|nom commercial|enseigne|nom de l['’]entreprise)\s*[:\.]?\s*(.*)$",
    re.IGNORECASE,
)
DENOM_SKIP_RE = re.compile(
    r"^(forme juridique|capital|adresse|si[eè]ge|rcs|siren|siret|greffe|extrait|immatriculation|activit|code ape|naf|dur[ée]e|date|n[°o]\s)\b",
    re.IGNORECASE,
)


def luhn_ok(digits: str) -> bool:
    if not digits.isdigit():
        return False
    total = 0
    reverse = digits[::-1]
    for i, ch in enumerate(reverse):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def tva_from_siren(siren: str) -> Optional[str]:
    siren = re.sub(r"\D", "", siren or "")
    if len(siren) != 9 or not siren.isdigit():
        return None
    key = (12 + 3 * (int(siren) % 97)) % 97
    return f"FR{key:02d}{siren}"


def only_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _push_digits(ordered: List[str], raw: str, length: int) -> None:
    value = only_digits(raw)
    if len(value) != length or not luhn_ok(value):
        return
    if value not in ordered:
        ordered.append(value)


def find_sirets(text: str) -> List[str]:
    """SIRET 14 chiffres (Luhn), d'abord ceux annotés « SIRET »."""
    if not text:
        return []
    ordered: List[str] = []
    for match in SIRET_LABEL_RE.finditer(text):
        _push_digits(ordered, match.group(1), 14)
    for match in SIRET_GROUPED_RE.finditer(text):
        _push_digits(ordered, match.group(1), 14)
    return ordered


def find_sirens(text: str) -> List[str]:
    """SIREN 9 chiffres : RCS, SIREN, n° unique, RM, TVA, puis XXX XXX XXX."""
    if not text:
        return []
    ordered: List[str] = []
    for pattern in (SIREN_LABEL_RE, RCS_RE, UNIQUE_ID_RE, SIREN_NEXTLINE_RE, IMMAT_RCS_RE, RM_RE):
        for match in pattern.finditer(text):
            _push_digits(ordered, match.group(1), 9)
    tva = find_tva(text)
    if tva and len(tva) >= 13:
        _push_digits(ordered, tva[-9:], 9)
    for match in GROUPED_SIREN_RE.finditer(text):
        _push_digits(ordered, match.group(1), 9)
    return ordered


def has_identifiant(text: str) -> bool:
    return bool(find_sirets(text) or find_sirens(text))


def find_denominations(text: str) -> List[str]:
    """Raison sociale / enseigne lues sur le Kbis (recherche si pas de RCS)."""
    names: List[str] = []
    lines = [re.sub(r"\s+", " ", ln).strip(" :.-") for ln in (text or "").splitlines()]
    for i, line in enumerate(lines):
        if not line:
            continue
        match = DENOM_LINE_RE.match(line)
        if not match:
            continue
        candidate = (match.group(1) or "").strip(" :.-")
        if len(candidate) < 3 and i + 1 < len(lines):
            candidate = lines[i + 1]
        if (
            len(candidate) >= 3
            and not DENOM_SKIP_RE.match(candidate)
            and not candidate.isdigit()
            and candidate not in names
        ):
            names.append(candidate[:120])
    return names[:5]


def is_siret_14(value: Optional[str]) -> bool:
    digits = only_digits(value or "")
    return len(digits) == 14 and luhn_ok(digits)


def find_tva(text: str) -> Optional[str]:
    match = TVA_RE.search(text or "")
    if not match:
        return None
    return f"FR{match.group(1)}{match.group(2)}"


def _street(etab: Dict[str, Any]) -> str:
    parts = [
        etab.get("numero_voie"),
        etab.get("indice_repetition"),
        etab.get("type_voie"),
        etab.get("libelle_voie"),
    ]
    street = " ".join(str(p).strip() for p in parts if p)
    if street:
        return street
    adresse = (etab.get("adresse") or "").strip()
    cp = str(etab.get("code_postal") or "").strip()
    ville = str(etab.get("libelle_commune") or "").strip()
    cleaned = adresse
    if cp:
        cleaned = re.sub(rf"\s*{re.escape(cp)}\s*", " ", cleaned)
    if ville:
        cleaned = re.sub(rf"\s*{re.escape(ville)}\s*$", "", cleaned, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", cleaned).strip()


def _enseigne(etab: Dict[str, Any]) -> Optional[str]:
    enseignes = etab.get("liste_enseignes") or []
    if isinstance(enseignes, list) and enseignes:
        name = str(enseignes[0]).strip()
        return name or None
    nom = etab.get("nom_commercial")
    if nom:
        return str(nom).strip() or None
    return None


def _contact(dirigeants: Any) -> Optional[str]:
    if not isinstance(dirigeants, list):
        return None
    for person in dirigeants:
        if not isinstance(person, dict):
            continue
        if person.get("type_dirigeant") and person.get("type_dirigeant") != "personne physique":
            continue
        prenoms = (person.get("prenoms") or "").strip()
        nom = (person.get("nom") or "").strip()
        if nom or prenoms:
            return " ".join(p for p in (prenoms, nom) if p)
    return None


def _tva_from_result(item: Dict[str, Any], siren: str) -> Optional[str]:
    raw = item.get("tva")
    if isinstance(raw, list) and raw:
        val = str(raw[0]).replace(" ", "").upper()
        if val.startswith("FR"):
            return val
    if isinstance(raw, str) and raw.upper().startswith("FR"):
        return raw.replace(" ", "").upper()
    return tva_from_siren(siren)


def map_etablissement(item: Dict[str, Any], etab: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    etab = etab or item.get("siege") or {}
    siren = str(item.get("siren") or "")[:9]
    siret = str(etab.get("siret") or "")
    enseigne = _enseigne(etab)
    raison = (item.get("nom_raison_sociale") or item.get("nom_complet") or "").strip()
    nom_client = enseigne or raison
    tva = _tva_from_result(item, siren)
    ville = (etab.get("libelle_commune") or "").strip()
    cp = str(etab.get("code_postal") or "").strip() or None
    closed = str(etab.get("etat_administratif") or item.get("etat_administratif") or "A") != "A"
    label_addr = etab.get("adresse") or " ".join(p for p in (_street(etab), cp, ville) if p)
    return {
        "nom_client": nom_client,
        "raison_sociale": raison,
        "enseigne": enseigne,
        "siret": siret,
        "siren": siren,
        "tva": tva,
        "adresse": _street(etab),
        "code_postal": cp,
        "ville": ville.title() if ville else None,
        "contact_magasin": _contact(item.get("dirigeants")),
        "est_siege": bool(etab.get("est_siege")),
        "ferme": closed,
        "label": " — ".join(p for p in (nom_client, label_addr) if p),
    }


def _expand_results(payload: Dict[str, Any], wanted_siret: Optional[str] = None) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen = set()
    wanted = only_digits(wanted_siret or "")
    for item in payload.get("results") or []:
        siege = item.get("siege") or {}
        etabs = []
        if wanted and len(wanted) == 14:
            if str(siege.get("siret") or "") == wanted:
                etabs = [siege]
            for extra in item.get("matching_etablissements") or []:
                if str(extra.get("siret") or "") == wanted:
                    etabs = [extra]
                    break
            if not etabs:
                etabs = [siege] if siege else []
        else:
            matches = [
                e for e in (item.get("matching_etablissements") or [])
                if str(e.get("etat_administratif") or "A") == "A"
            ]
            if matches:
                etabs = matches[:6]
            elif siege:
                etabs = [siege]
        for etab in etabs:
            mapped = map_etablissement(item, etab)
            key = mapped.get("siret") or mapped.get("label")
            if key in seen:
                continue
            seen.add(key)
            out.append(mapped)
            if len(out) >= 12:
                return out
    return out


def search_entreprises(query: str, *, per_page: int = 8) -> Dict[str, Any]:
    q = (query or "").strip()
    digits = only_digits(q)
    if len(digits) in (9, 14):
        q = digits
    elif len(q) < 3:
        return {"results": [], "total": 0, "query": query}
    params = urllib.parse.urlencode({"q": q, "per_page": per_page, "page": 1})
    req = urllib.request.Request(
        f"{SEARCH_URL}?{params}",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise ValueError(f"API entreprises indisponible ({exc.code})") from exc
    except Exception as exc:
        raise ValueError(f"API entreprises injoignable : {exc}") from exc

    wanted = digits if len(digits) == 14 else None
    results = _expand_results(payload, wanted_siret=wanted)
    return {"results": results, "total": len(results), "query": q}


def lookup_siret(siret: str) -> Optional[Dict[str, Any]]:
    siret = only_digits(siret)
    if len(siret) != 14:
        return None
    data = search_entreprises(siret, per_page=1)
    for row in data.get("results") or []:
        if row.get("siret") == siret:
            return row
    if data.get("results"):
        return data["results"][0]
    return None


def lookup_siren(siren: str) -> Optional[Dict[str, Any]]:
    siren = only_digits(siren)
    if len(siren) != 9:
        return None
    data = search_entreprises(siren, per_page=1)
    rows = data.get("results") or []
    for row in rows:
        if row.get("siren") == siren and row.get("est_siege"):
            return row
    for row in rows:
        if row.get("siren") == siren:
            return row
    return rows[0] if rows else None


def lookup_identifiant(*, siret: Optional[str] = None, siren: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if siret:
        found = lookup_siret(siret)
        if found:
            return _ensure_row_siret_14(found)
    if siren:
        return _ensure_row_siret_14(lookup_siren(siren))
    return None


def _ensure_row_siret_14(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    siret = resolve_siret_for_storage(row.get("siret") or row.get("siren"))
    if not siret:
        return None
    out = dict(row)
    out["siret"] = siret
    return out


def resolve_siret_for_storage(value: Optional[str]) -> Optional[str]:
    """
    Le stockage Union est toujours un SIRET 14 chiffres.
    Un RCS / SIREN (9) est résolu via l'annuaire vers le SIRET du siège.
    """
    digits = only_digits(value or "")
    if len(digits) == 14 and luhn_ok(digits):
        return digits
    if len(digits) == 9 and luhn_ok(digits):
        row = lookup_siren(digits)
        siret = only_digits((row or {}).get("siret") or "")
        if len(siret) == 14 and luhn_ok(siret):
            return siret
    return None


def _pick_by_name(names: List[str]) -> Optional[Dict[str, Any]]:
    for name in names:
        data = search_entreprises(name, per_page=8)
        rows = data.get("results") or []
        if not rows:
            continue
        needle = name.casefold()
        for row in rows:
            blob = f"{row.get('nom_client') or ''} {row.get('raison_sociale') or ''}".casefold()
            if needle[:10] in blob or (blob and blob[:10] in needle):
                found = _ensure_row_siret_14(row)
                if found:
                    return found
        found = _ensure_row_siret_14(rows[0])
        if found:
            return found
    return None


def _pdf_text(data: bytes) -> str:
    import fitz

    doc = fitz.open(stream=data, filetype="pdf")
    chunks: List[str] = []
    try:
        for page in doc:
            chunks.append(page.get_text("text") or "")
            words = page.get_text("words") or []
            if words:
                chunks.append(" ".join(w[4] for w in words if len(w) > 4))
    finally:
        doc.close()
    return "\n".join(chunks)


def _ocr_pixmap(pix) -> str:
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return ""
    mode = "RGBA" if pix.alpha else "RGB"
    image = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
    if image.mode == "RGBA":
        image = image.convert("RGB")
    try:
        return pytesseract.image_to_string(image, lang="fra+eng") or ""
    except Exception:
        try:
            return pytesseract.image_to_string(image) or ""
        except Exception:
            return ""


def _ocr_pdf_pages(data: bytes, max_pages: int = 3) -> str:
    import fitz

    doc = fitz.open(stream=data, filetype="pdf")
    chunks: List[str] = []
    try:
        for index, page in enumerate(doc):
            if index >= max_pages:
                break
            pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False)
            chunks.append(_ocr_pixmap(pix))
    finally:
        doc.close()
    return "\n".join(chunks)


def _ocr_image(data: bytes, filename: str) -> str:
    import fitz

    suffix = (filename or "").rsplit(".", 1)[-1].lower()
    kind = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "webp": "webp", "tif": "tiff", "tiff": "tiff"}.get(suffix)
    if kind:
        try:
            doc = fitz.open(stream=data, filetype=kind)
            try:
                page = doc[0]
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                return _ocr_pixmap(pix)
            finally:
                doc.close()
        except Exception:
            pass
    try:
        import pytesseract
        from PIL import Image

        image = Image.open(io.BytesIO(data))
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        try:
            return pytesseract.image_to_string(image, lang="fra+eng") or ""
        except Exception:
            return pytesseract.image_to_string(image) or ""
    except Exception:
        return ""


def extract_text_from_kbis(data: bytes, filename: str = "") -> Tuple[str, str]:
    """Retourne (texte, méthode)."""
    name = (filename or "").lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        text = _pdf_text(data)
        if has_identifiant(text) or find_denominations(text):
            return text, "pdf"
        ocr = _ocr_pdf_pages(data)
        combined = f"{text}\n{ocr}".strip()
        return combined, "ocr" if has_identifiant(ocr) else ("ocr" if ocr else "pdf")
    image_text = _ocr_image(data, name)
    return image_text, "ocr"


def extract_from_kbis(data: bytes, filename: str = "") -> Dict[str, Any]:
    if not data:
        raise ValueError("Fichier Kbis vide")
    if len(data) > MAX_KBIS_BYTES:
        raise ValueError("Fichier trop volumineux (max 10 Mo)")
    text, method = extract_text_from_kbis(data, filename)
    sirets = find_sirets(text)
    sirens = find_sirens(text)
    names = find_denominations(text)
    tva_ocr = find_tva(text)
    siret_kbis = sirets[0] if sirets else None
    siren = sirens[0] if sirens else None
    resolved_via = None
    entreprise = lookup_identifiant(siret=siret_kbis, siren=siren)
    if entreprise:
        resolved_via = "siret" if siret_kbis else "rcs"
    elif names:
        entreprise = _pick_by_name(names)
        if entreprise:
            resolved_via = "nom"
    if entreprise and not entreprise.get("tva") and tva_ocr:
        entreprise["tva"] = tva_ocr
    stored_siret = (entreprise or {}).get("siret") if entreprise else None
    if stored_siret and not is_siret_14(stored_siret):
        entreprise = None
        stored_siret = None
        resolved_via = None

    warning = None
    if not entreprise:
        if siren or names:
            warning = (
                "Entreprise trouvée sur le Kbis "
                f"({('RCS ' + siren) if siren else names[0]}) "
                "mais SIRET 14 chiffres introuvable dans l’annuaire. "
                "Cherchez le nom et sélectionnez l’établissement à stocker."
            )
        else:
            warning = (
                "RCS / dénomination illisibles sur ce Kbis. "
                "Saisissez le nom ou le n° RCS pour récupérer le SIRET."
            )
    return {
        "siret": stored_siret,
        "siren": (entreprise or {}).get("siren") or siren,
        "sirets": sirets,
        "sirens": sirens,
        "noms_kbis": names,
        "resolved_via": resolved_via,
        "tva_ocr": tva_ocr,
        "method": method,
        "entreprise": entreprise,
        "warning": warning,
    }
