"""
Modèles Pydantic pour l'API.
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    """Réponse après upload Excel."""
    import_id: str
    meta: Dict
    nb_lignes: int
    colonnes_brutes: List[str]
    colonnes_reconnues: Dict[str, str]  # clé interne -> nom colonne Excel


class SyncFromSheetsRequest(BaseModel):
    """Corps de la requête pour synchroniser depuis Google Sheets."""
    spreadsheet_id: str
    sheet_name: Optional[str] = None  # ex. "Feuille1" ; si absent = première feuille


class ClientSummary(BaseModel):
    """Résumé client pour la liste."""
    code_union: str
    nom_client: Optional[str]
    groupe_client: Optional[str]
    global_total: float
    tri_total: float
    grand_total: float


class ClientRecap(BaseModel):
    """Récapitulatif complet d'un client."""
    code_union: str
    nom_client: Optional[str]
    groupe_client: str
    global_items: Dict[str, float] = Field(alias="global")
    tri: Dict[str, float]
    global_total: float
    tri_total: float
    grand_total: float
    
    class Config:
        populate_by_name = True


class GroupRecap(BaseModel):
    """Récapitulatif complet d'un groupe."""
    groupe_client: str
    nb_comptes: int
    codes_union: List[str]
    global_items: Dict[str, float] = Field(alias="global")
    tri: Dict[str, float]
    global_total: float
    tri_total: float
    grand_total: float
    
    class Config:
        populate_by_name = True


class EntitySummary(BaseModel):
    """Résumé d'une entité (client ou groupe) pour la liste."""
    id: str  # code_union ou groupe_client
    label: str  # "M0022 - TECHNO PIECES" ou "Groupe ABC"
    groupe_client: Optional[str] = None  # seulement pour les clients
    nb_comptes: Optional[int] = None  # seulement pour les groupes
    global_total: float
    tri_total: float
    grand_total: float
    rfa_total: Optional[float] = None  # Total RFA calculé (grand_total du RFA)


class AmountItem(BaseModel):
    """Item avec montant."""
    key: str
    label: str
    amount: float


class ClientDetail(BaseModel):
    """Détail complet d'un client."""
    code_union: str
    nom_client: Optional[str]
    groupe_client: Optional[str]
    global_items: List[AmountItem] = Field(alias="global")
    tri: List[AmountItem]
    totals: Dict[str, float]  # global_total, tri_total, grand_total
    
    class Config:
        populate_by_name = True  # Permet d'utiliser soit l'alias soit le nom du champ


class GroupDetail(BaseModel):
    """Détail complet d'un groupe."""
    groupe_client: str
    nb_comptes: int
    codes_union: List[str]
    global_items: List[AmountItem] = Field(alias="global")
    tri: List[AmountItem]
    totals: Dict[str, float]  # global_total, tri_total, grand_total
    
    class Config:
        populate_by_name = True


class TierResult(BaseModel):
    """Resultat d'un calcul de palier."""
    ca: float
    selected_min: Optional[float]
    min_threshold: Optional[float]  # Seuil minimal (premier palier), meme si non atteint
    rate: float
    triggered: bool
    value: float
    has_override: Optional[bool] = False  # Indique si un override client est applique


class GlobalRfaItem(BaseModel):
    """Item RFA pour une plateforme globale."""
    label: str
    ca: float
    rfa: TierResult
    bonus: TierResult
    total: Dict[str, float]  # rate, value
    triggered: bool
    has_override: Optional[bool] = False  # Indique si un override client est applique (rfa ou bonus)


class TriRfaItem(BaseModel):
    """Item RFA pour un tri-partite."""
    label: str
    ca: float
    selected_min: Optional[float]
    min_threshold: Optional[float]  # Seuil minimal (premier palier), meme si non atteint
    rate: float
    value: float
    triggered: bool
    has_override: Optional[bool] = False  # Indique si un override client est applique


class MarketingItem(BaseModel):
    """Item de rémunération Marketing."""
    label: str
    amount: float
    calculation_type: str  # "fixed" ou "rate"
    rate: Optional[float] = None
    base_amount: Optional[float] = None  # Montant sur lequel le taux est appliqué (si rate)


class RfaResult(BaseModel):
    """Résultat complet du calcul RFA."""
    global_items: Dict[str, GlobalRfaItem] = Field(alias="global")
    tri_items: Dict[str, TriRfaItem] = Field(alias="tri")
    marketing_items: Dict[str, MarketingItem] = Field(default={}, alias="marketing")
    totals: Dict[str, float]  # global_rfa, global_bonus, global_total, tri_total, grand_total, marketing_total
    bonus_groups: Optional[List[Dict]] = None  # Bonus groupes (ex: Soutien APA +3%)
    
    class Config:
        populate_by_name = True


class EntityDetailWithRfa(BaseModel):
    """Détail d'une entité avec calcul RFA."""
    # Identité
    code_union: Optional[str] = None
    nom_client: Optional[str] = None
    groupe_client: Optional[str] = None
    nb_comptes: Optional[int] = None
    codes_union: Optional[List[str]] = None
    
    # CA
    ca: Optional[Dict] = None  # {global: {...}, tri: {...}, totals: {...}}
    
    # RFA
    rfa: RfaResult
    
    # Contrat appliqué
    contract_applied: Optional[Dict[str, Any]] = None  # {id: int, name: str}


class PlatformRfaDetail(BaseModel):
    """Détail RFA pour une entité (client ou groupe) sur une plateforme."""
    entity_id: str  # code_union ou groupe_client
    entity_label: str  # "M0022 - TECHNO PIECES" ou "Groupe ABC"
    entity_type: str  # "client" ou "group"
    rfa_value: float
    ca_value: float
    rfa_rate: float  # Taux RFA (%)


class RecapGlobalRfa(BaseModel):
    """Récapitulatif global RFA sans double comptage."""
    # RFA par plateforme globale
    global_rfa_by_platform: Dict[str, float]  # key -> montant RFA
    # Détails par plateforme (liste des entités avec leur RFA)
    platform_details: Dict[str, List[PlatformRfaDetail]]  # key -> liste de détails
    # Totaux
    total_global_rfa: float
    total_global_bonus: float
    total_global: float  # RFA + Bonus
    total_tri: float
    grand_total: float  # Total final RFA


class AdBase(BaseModel):
    """Base annonce partenaire/promo."""
    title: str
    subtitle: Optional[str] = None
    image_url: Optional[str] = None
    link_url: Optional[str] = None
    kind: str = "logo"
    is_active: bool = True
    sort_order: int = 0
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None


class AdCreate(AdBase):
    """Création annonce."""
    pass


class AdUpdate(BaseModel):
    """Mise à jour annonce."""
    title: Optional[str] = None
    subtitle: Optional[str] = None
    image_url: Optional[str] = None
    link_url: Optional[str] = None
    kind: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None


class AdResponse(AdBase):
    """Réponse annonce."""
    id: int
    created_at: datetime
    updated_at: datetime


# ==================== AUTH ====================

class LoginRequest(BaseModel):
    """Requête de connexion."""
    username: str
    password: str


class LoginResponse(BaseModel):
    """Réponse de connexion."""
    user_id: int
    username: str
    display_name: Optional[str]
    role: str
    linked_code_union: Optional[str] = None
    linked_groupe: Optional[str] = None
    avatar_url: Optional[str] = None
    token: str  # Simple token = base64(user_id:timestamp)


class UserCreate(BaseModel):
    """Création d'utilisateur."""
    username: str
    password: str
    display_name: Optional[str] = None
    role: str = "ADHERENT"
    linked_code_union: Optional[str] = None
    linked_groupe: Optional[str] = None


class UserUpdate(BaseModel):
    """Mise à jour d'utilisateur."""
    display_name: Optional[str] = None
    password: Optional[str] = None  # Si fourni, met à jour le mot de passe
    role: Optional[str] = None
    linked_code_union: Optional[str] = None
    linked_groupe: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    """Réponse utilisateur."""
    id: int
    username: str
    display_name: Optional[str]
    role: str
    linked_code_union: Optional[str]
    linked_groupe: Optional[str]
    avatar_url: Optional[str]
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]
