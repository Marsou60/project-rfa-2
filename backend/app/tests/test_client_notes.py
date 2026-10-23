from types import SimpleNamespace

import pytest

from app.services.client_notes import clean_note, note_author


def test_note_author_prefers_display_name():
    user = SimpleNamespace(display_name="Ryhan Julien", username="RYHAN")
    assert note_author(user) == "Ryhan Julien"
    assert note_author(SimpleNamespace(display_name="", username="RAYANE")) == "RAYANE"


def test_clean_note_rejects_empty():
    with pytest.raises(ValueError):
        clean_note("   ")
    assert clean_note("  Passage magasin  ") == "Passage magasin"
