from app.services.rfa_fusion import parse_codes


def test_parse_codes_dedupes_and_requires_separators():
    assert parse_codes("m0123, M0456\nM0123") == ["M0123", "M0456"]
    assert parse_codes(["m1", "M2", "m1"]) == ["M1", "M2"]
    assert parse_codes("") == []


def test_create_fusion_links_both_codes_and_rejects_reuse():
    from sqlmodel import Session, SQLModel, create_engine

    from app.models import Contract
    from app.services.rfa_fusion import create_fusion, fusion_for_code, update_fusion

    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        contract = Contract(name="Special Dupont")
        session.add(contract)
        session.commit()
        session.refresh(contract)

        created = create_fusion(
            session, label="Dupont Kbis", contract_id=contract.id, codes="m100, M200"
        )
        assert created["codes"] == ["M100", "M200"]
        assert created["contract_name"] == "Special Dupont"

        again = fusion_for_code(session, "m200")
        assert again["id"] == created["id"]
        assert again["codes"] == ["M100", "M200"]
        assert fusion_for_code(session, "M999") is None

        try:
            create_fusion(
                session, label="Autre", contract_id=contract.id, codes="M200, M300"
            )
            raise AssertionError("un code déjà fusionné doit être refusé")
        except ValueError as exc:
            assert "M200" in str(exc)

        updated = update_fusion(
            session,
            created["id"],
            contract_id=contract.id,
            codes=["M100", "M300"],
            label="Dupont nouveau Kbis",
        )
        assert updated["codes"] == ["M100", "M300"]
        assert updated["label"] == "Dupont nouveau Kbis"
        assert fusion_for_code(session, "M200") is None
        assert fusion_for_code(session, "m300")["id"] == created["id"]
