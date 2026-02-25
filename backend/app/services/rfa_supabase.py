"""
Lecture / écriture des données RFA depuis/vers la table Supabase `rfa_data`.
Remplace le cache JSON dans AppSettings pour les cold starts Vercel.
"""
from __future__ import annotations
from typing import List, Dict, Any, Optional

# Mapping clé interne → colonne Supabase
FIELD_TO_COL: Dict[str, str] = {
    "GLOBAL_ACR":              "global_acr",
    "GLOBAL_ALLIANCE":         "global_alliance",
    "GLOBAL_DCA":              "global_dca",
    "GLOBAL_EXADIS":           "global_exadis",
    "TRI_DCA_SBS":             "tri_dca_sbs",
    "TRI_DCA_DAYCO":           "tri_dca_dayco",
    "TRI_ACR_FREINAGE":        "tri_acr_freinage",
    "TRI_ACR_EMBRAYAGE":       "tri_acr_embrayage",
    "TRI_ACR_FILTRE":          "tri_acr_filtre",
    "TRI_ACR_DISTRIBUTION":    "tri_acr_distribution",
    "TRI_ACR_MACHINE_TOURNANTE": "tri_acr_machine_tournante",
    "TRI_ACR_LIAISON_AU_SOL":  "tri_acr_liaison_au_sol",
    "TRI_EXADIS_FREINAGE":     "tri_exadis_freinage",
    "TRI_EXADIS_EMBRAYAGE":    "tri_exadis_embrayage",
    "TRI_EXADIS_FILTRATION":   "tri_exadis_filtration",
    "TRI_EXADIS_DISTRIBUTION": "tri_exadis_distribution",
    "TRI_EXADIS_ETANCHEITE":   "tri_exadis_etancheite",
    "TRI_EXADIS_THERMIQUE":    "tri_exadis_thermique",
    "TRI_SCHAEFFLER":          "tri_schaeffler",
    "TRI_ALLIANCE_DELPHI":     "tri_alliance_delphi",
    "TRI_ALLIANCE_BREMBO":     "tri_alliance_brembo",
    "TRI_ALLIANCE_SOGEFI":     "tri_alliance_sogefi",
    "TRI_ALLIANCE_SKF":        "tri_alliance_skf",
    "TRI_ALLIANCE_NAPA":       "tri_alliance_napa",
    "TRI_PURFLUX_COOPERS":     "tri_purflux_coopers",
}

COL_TO_FIELD: Dict[str, str] = {v: k for k, v in FIELD_TO_COL.items()}

_NUMERIC_COLS = list(FIELD_TO_COL.values())
_ALL_COLS = ["code_union", "nom_client", "groupe_client"] + _NUMERIC_COLS


def write_rfa_to_supabase(session, data_list: List[Dict[str, Any]]) -> int:
    """
    UPSERT de toutes les lignes RFA dans la table `rfa_data`.
    Retourne le nombre de lignes insérées/mises à jour.
    """
    from sqlalchemy import text
    if not data_list:
        return 0

    # Colonnes numériques pour le SET dans ON CONFLICT
    set_clauses = ", ".join(
        f"{col} = EXCLUDED.{col}" for col in ["nom_client", "groupe_client"] + _NUMERIC_COLS
    ) + ", updated_at = NOW()"

    col_list = ", ".join(_ALL_COLS)
    val_list = ", ".join(f":{col.replace('-', '_')}" for col in _ALL_COLS)

    sql = text(f"""
        INSERT INTO rfa_data ({col_list})
        VALUES ({val_list})
        ON CONFLICT (code_union) DO UPDATE SET {set_clauses}
    """)

    count = 0
    for row in data_list:
        params = {
            "code_union":   str(row.get("code_union", "") or ""),
            "nom_client":   str(row.get("nom_client", "") or ""),
            "groupe_client": str(row.get("groupe_client", "") or ""),
        }
        for field, col in FIELD_TO_COL.items():
            params[col] = float(row.get(field, 0) or 0)
        try:
            session.execute(sql, params)
            count += 1
        except Exception as e:
            print(f"[RFA_SUPABASE] Erreur upsert {row.get('code_union')}: {e}")

    # Supprime les anciens codes qui ne sont plus dans la feuille
    current_codes = [r.get("code_union") for r in data_list if r.get("code_union")]
    if current_codes:
        placeholders = ", ".join(f":c{i}" for i in range(len(current_codes)))
        del_params = {f"c{i}": c for i, c in enumerate(current_codes)}
        session.execute(text(f"DELETE FROM rfa_data WHERE code_union NOT IN ({placeholders})"), del_params)

    session.commit()
    return count


def read_rfa_from_supabase(session) -> Optional[List[Dict[str, Any]]]:
    """
    Lit toutes les lignes depuis `rfa_data` et les convertit au format ImportData.data.
    Retourne None si la table est vide.
    """
    from sqlalchemy import text
    try:
        result = session.execute(text("SELECT * FROM rfa_data ORDER BY code_union")).fetchall()
        if not result:
            return None
        keys = list(result[0]._mapping.keys()) if result else []
        data_list = []
        for row in result:
            mapping = dict(row._mapping)
            rec: Dict[str, Any] = {
                "code_union":   mapping.get("code_union", ""),
                "nom_client":   mapping.get("nom_client", ""),
                "groupe_client": mapping.get("groupe_client", "Sans groupe") or "Sans groupe",
            }
            for col, field in COL_TO_FIELD.items():
                rec[field] = float(mapping.get(col, 0) or 0)
            data_list.append(rec)
        return data_list
    except Exception as e:
        print(f"[RFA_SUPABASE] Erreur lecture: {e}")
        return None


def build_column_mapping() -> Dict[str, str]:
    """Retourne un column_mapping compatible ImportData (clé interne → nom colonne)."""
    cm = {
        "code_union":   "code_union",
        "nom_client":   "nom_client",
        "groupe_client": "groupe_client",
    }
    cm.update({k: k for k in FIELD_TO_COL.keys()})
    return cm
