from types import SimpleNamespace

from app.services.push_notifications import (
    atteints_message,
    note_after_import,
    plan_recipients,
    receives_all_notifications,
)


def _user(username, display_name, role, user_id):
    return SimpleNamespace(username=username, display_name=display_name, role=role, id=user_id)


def test_direction_recoit_tout_un_commercial_seulement_son_portefeuille():
    martial = _user("martial", "Martial", "ADMIN", 1)
    julien = _user("RYHAN", "Ryhan Julien", "COMMERCIAL", 2)
    rayane = _user("rayane", "Rayane", "COMMERCIAL", 3)
    adherent = _user("fx01", "Garage", "ADHERENT", 4)
    assert receives_all_notifications(martial)
    assert receives_all_notifications(julien)
    assert not receives_all_notifications(rayane)
    counts = {"all": 12, "Rayane": 2}
    plans = plan_recipients([martial, julien, rayane, adherent], counts, 10, subscribed_user_ids=[1])
    by_name = {item["username"]: item for item in plans}
    assert "fx01" not in by_name
    assert by_name["martial"]["count"] == 12
    assert by_name["martial"]["body"] == "12 adhérents ont franchi un palier en octobre"
    assert by_name["martial"]["would_push"] is True
    assert by_name["RYHAN"]["scope"] == "all"
    assert by_name["rayane"]["scope"] == "Rayane"
    assert by_name["rayane"]["count"] == 2
    assert by_name["rayane"]["would_push"] is False
    assert atteints_message(1, 10)["body"].startswith("1 adhérent a")


def test_import_et_essai_n_envoient_rien(monkeypatch):
    monkeypatch.delenv("PUSH_AFTER_IMPORT", raising=False)
    monkeypatch.delenv("PUSH_SEND_ENABLED", raising=False)
    assert note_after_import(10)["skipped"] is True
    called = []
    monkeypatch.setattr(
        "app.services.push_notifications.fetch_atteints",
        lambda commercial: called.append(commercial),
    )
    assert called == []
