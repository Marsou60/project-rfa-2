"""
Modèles SQLModel pour la base de données.
"""
from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum


class RuleScope(str, Enum):
    """Portée d'une règle."""
    GLOBAL = "GLOBAL"
    TRI = "TRI"


class ContractScope(str, Enum):
    """Type de contrat."""
    ADHERENT = "ADHERENT"
    UNION = "UNION"


class TargetType(str, Enum):
    """Type de cible pour une affectation."""
    CODE_UNION = "CODE_UNION"
    GROUPE_CLIENT = "GROUPE_CLIENT"


class Contract(SQLModel, table=True):
    """Contrat parametrable."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: Optional[str] = None
    scope: ContractScope = Field(default=ContractScope.ADHERENT, index=True)
    is_default: bool = Field(default=False, index=True)
    is_active: bool = Field(default=True, index=True)
    # Option: utiliser le CA total combine (ACR+DCA+ALLIANCE+EXADIS) pour calculer le taux
    # puis appliquer ce taux a chaque fournisseur individuellement
    use_combined_global_rate: bool = Field(default=False)
    
    # Règles marketing (format JSON: {"GLOBAL_ACR": {"type": "rate", "rate": 0.007}, ...})
    marketing_rules: Optional[str] = None
    
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    # Relations
    rules: List["ContractRule"] = Relationship(back_populates="contract")
    assignments: List["ContractAssignment"] = Relationship(back_populates="contract")


class ContractRule(SQLModel, table=True):
    """Règle d'un contrat (paliers pour une clé)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    contract_id: int = Field(foreign_key="contract.id")
    key: str = Field(index=True)  # ex: GLOBAL_ACR, TRI_DCA_SBS
    scope: RuleScope = Field(index=True)  # GLOBAL ou TRI
    label: str  # Label affiché (repris du field_catalog)
    
    # JSON pour les paliers
    tiers_rfa: Optional[str] = None  # JSON string pour scope=GLOBAL
    tiers_bonus: Optional[str] = None  # JSON string pour scope=GLOBAL
    tiers: Optional[str] = None  # JSON string pour scope=TRI
    bonus_groups: Optional[str] = None  # JSON: [{"groupe_client":"...","bonus_rate":0.03,"label":"..."}]
    
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    # Relations
    contract: Contract = Relationship(back_populates="rules")


class ContractAssignment(SQLModel, table=True):
    """Affectation d'un contrat à un Code Union ou Groupe Client."""
    id: Optional[int] = Field(default=None, primary_key=True)
    contract_id: int = Field(foreign_key="contract.id")
    target_type: TargetType = Field(index=True)
    target_value: str = Field(index=True)  # ex: "M0022" ou "GROUPE APA MARSEILLE"
    priority: int = Field(default=50)  # CODE_UNION=100, GROUPE=50
    created_at: datetime = Field(default_factory=datetime.now)
    
    # Relations
    contract: Contract = Relationship(back_populates="assignments")
    
    class Config:
        # Contrainte unique sur (target_type, target_value)
        pass


class OverrideTierType(str, Enum):
    """Type de palier pour un override."""
    RFA = "rfa"
    BONUS = "bonus"
    TRI = "tri"


class ContractOverride(SQLModel, table=True):
    """Override de taux personnalise pour un client ou groupe specifique."""
    id: Optional[int] = Field(default=None, primary_key=True)
    target_type: TargetType = Field(index=True)  # CODE_UNION ou GROUPE_CLIENT
    target_value: str = Field(index=True)        # Le client (code_union) ou groupe concerne
    field_key: str = Field(index=True)           # Ex: "GLOBAL_ACR", "TRI_DCA_SBS"
    tier_type: OverrideTierType                  # "rfa", "bonus", ou "tri"
    custom_tiers: str                            # JSON des paliers personnalises [{min: X, rate: Y}, ...]
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    class Config:
        # Contrainte unique sur (target_type, target_value, field_key, tier_type)
        pass


class Ad(SQLModel, table=True):
    """Annonce partenaire ou promotion."""
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(index=True)
    subtitle: Optional[str] = None
    image_url: Optional[str] = None  # URL externe OU chemin local (uploads/ads/xxx.png)
    link_url: Optional[str] = None
    kind: str = Field(default="logo", index=True)  # "logo" ou "promo"
    is_active: bool = Field(default=True, index=True)
    sort_order: int = Field(default=0, index=True)
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class UserRole(str, Enum):
    """Rôle utilisateur."""
    ADMIN      = "ADMIN"       # Accès complet
    COMMERCIAL = "COMMERCIAL"  # Nicolas + Nathalie uniquement
    ADHERENT   = "ADHERENT"    # Espace client uniquement (futur)


class User(SQLModel, table=True):
    """Utilisateur de l'application."""
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str  # Hash bcrypt du mot de passe
    display_name: Optional[str] = None
    role: UserRole = Field(default=UserRole.ADHERENT, index=True)
    # Pour les adhérents: leur code_union ou groupe associé
    linked_code_union: Optional[str] = None
    linked_groupe: Optional[str] = None
    # Photo de profil
    avatar_url: Optional[str] = None  # URL ou chemin local (uploads/avatars/xxx.png)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.now)
    last_login: Optional[datetime] = None


class SupplierLogo(SQLModel, table=True):
    """Logo d'un fournisseur."""
    id: Optional[int] = Field(default=None, primary_key=True)
    supplier_key: str = Field(index=True, unique=True)  # ex: ACR, DCA, EXADIS, ALLIANCE
    supplier_name: str  # Nom affiche (ex: "ACR", "DCA Distribution")
    image_url: Optional[str] = None  # Chemin local (uploads/supplier_logos/xxx.png)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class AppSettings(SQLModel, table=True):
    """Paramètres de l'application."""
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(index=True, unique=True)
    value: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.now)




