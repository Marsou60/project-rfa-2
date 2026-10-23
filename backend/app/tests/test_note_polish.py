import json

import pytest

from app.services.note_polish import polish_note


def test_polish_requires_text_and_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(ValueError, match="serveur"):
        polish_note("Passage magasin")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    with pytest.raises(ValueError, match="Écrivez"):
        polish_note("   ")


def test_polish_reads_claude_text(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return json.dumps({
                "content": [{"type": "text", "text": "Passage calme, rien à relancer."}],
            }).encode()

    monkeypatch.setattr("app.services.note_polish.urlopen", lambda *_args, **_kwargs: Response())
    assert polish_note("ras aujourd'hui") == "Passage calme, rien à relancer."
