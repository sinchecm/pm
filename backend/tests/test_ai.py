import os

import pytest

from app import ai

requires_key = pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set"
)


@requires_key
def test_ai_answers_simple_math():
    answer = ai.ask("What is 2+2? Reply with just the number.")
    assert "4" in answer
