from types import SimpleNamespace

from app.services.push_notifications import (
    atteints_message,
    deliver_planned,
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
    counts = {
        "all": {"paliers": 47, "adherents": 37},
        "Rayane": {"paliers": 2, "adherents": 1},
    }
    plans = plan_recipients([martial, julien, rayane, adherent], counts, 10, subscribed_user_ids=[1])
    by_name = {item["username"]: item for item in plans}
    assert "fx01" not in by_name
    assert by_name["martial"]["paliers"] == 47
    assert by_name["martial"]["adherents"] == 37
    assert by_name["martial"]["title"] == "RFA Union (test)"
    assert by_name["martial"]["body"] == (
        "47 paliers franchis par 37 adhérents en octobre — données réelles, notifications en phase de test"
    )
    assert by_name["martial"]["status"] == "prévu"
    assert by_name["martial"]["would_push"] is True
    assert by_name["RYHAN"]["scope"] == "all"
    assert by_name["rayane"]["scope"] == "Rayane"
    assert by_name["rayane"]["body"] == (
        "2 paliers franchis par 1 adhérent en octobre — données réelles, notifications en phase de test"
    )
    assert by_name["rayane"]["would_push"] is False
    assert atteints_message(1, 1, 10)["body"].startswith("1 palier franchi par 1 adhérent")


def test_un_compteur_a_zero_est_ignore_meme_si_le_telephone_est_abonne():
    coralie = _user("CORALIE", "CORALIE SAKILI", "COMMERCIAL", 9)
    plans = plan_recipients([coralie], {"Coralie": 0}, 10, subscribed_user_ids=[9])
    assert plans[0]["status"] == "ignoré"
    assert plans[0]["would_push"] is False
    assert plans[0]["reason"] == "ignoré"
    assert plans[0]["title"] == "RFA Union (test)"


def test_lenvoi_ne_part_que_vers_un_compte_prevu_et_abonne():
    martial = _user("admin", "Martial", "ADMIN", 1)
    coralie = _user("CORALIE", "CORALIE SAKILI", "COMMERCIAL", 9)
    rayane = _user("RAYANE", "Rayane", "COMMERCIAL", 3)
    plans = plan_recipients(
        [martial, coralie, rayane],
        {
            "all": {"paliers": 47, "adherents": 37},
            "Coralie": {"paliers": 0, "adherents": 0},
            "Rayane": {"paliers": 13, "adherents": 11},
        },
        10,
        subscribed_user_ids=[1, 9],
    )
    sent = []

    def sender(sub, payload):
        sent.append((sub["user_id"], payload))

    results = deliver_planned(
        plans,
        [{"user_id": 1, "endpoint": "https://push.example/martial", "p256dh": "p", "auth": "a"},
         {"user_id": 9, "endpoint": "https://push.example/coralie", "p256dh": "p", "auth": "a"}],
        sender,
    )
    by_name = {item["username"]: item for item in results}
    assert by_name["admin"]["result"] == "envoyé"
    assert by_name["admin"]["sent"] == 1
    assert by_name["CORALIE"]["result"] == "ignoré"
    assert by_name["CORALIE"]["sent"] == 0
    assert by_name["RAYANE"]["result"] == "pas d'abonnement"
    assert [item[0] for item in sent] == [1]
    assert "47 paliers franchis par 37 adhérents en octobre" in sent[0][1]


def test_un_echec_push_est_compte_sans_relancer():
    martial = _user("admin", "Martial", "ADMIN", 1)
    plans = plan_recipients([martial], {"all": {"paliers": 47, "adherents": 37}}, 10, subscribed_user_ids=[1])

    def sender(sub, payload):
        raise RuntimeError("réseau")

    results = deliver_planned(
        plans,
        [{"user_id": 1, "endpoint": "https://push.example/martial", "p256dh": "p", "auth": "a"}],
        sender,
    )
    assert results[0]["result"] == "échec"
    assert results[0]["failed"] == 1
    assert results[0]["errors"] == ["RuntimeError"]


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
