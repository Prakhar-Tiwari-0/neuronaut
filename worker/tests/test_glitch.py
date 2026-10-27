"""Which replies count as degenerate. A neuron whose worst reply degenerates is a glitch, not a legendary, so a miss here
puts broken neurons at the top of the dex. The fixtures are real sweep replies (sweep_replies.json):

- comma_tail: L28 N598. Every reply ends in ",,,,,,,,,,,,,,". Its tokens are all different multi-comma pieces, so
  token distinct-2 scores it 1.00, as clean as a healthy neuron. It was ranked legendary at z=25.5.
- tautology: L25 N5043, repetitive on purpose ("a tautology of tautologies") but readable. Must stay a real neuron.
- alien: L22 N2742, a normal strong neuron.
"""
import json
import os

import pytest

from engine import degenerate

REPLIES = json.load(open(os.path.join(os.path.dirname(__file__), "sweep_replies.json")))


@pytest.mark.parametrize("text", REPLIES["comma_tail"])
def test_punctuation_run_at_the_end_is_degenerate(text):
    assert degenerate(text)


@pytest.mark.parametrize("text", REPLIES["tautology"] + REPLIES["alien"])
def test_readable_replies_are_not(text):
    assert not degenerate(text)


@pytest.mark.parametrize("text", [
    "Here you go!!!!!!!!!!!!",                      # one character
    "The answer is ...................... done",    # in the middle, not just at the end
    "ha ha hahahahahahahahahahahahahaha",            # a 2-char unit
    "",                                              # empty replies count as fully looped
])
def test_short_unit_runs(text):
    assert degenerate(text)


@pytest.mark.parametrize("text", [
    "| a | b |\n|---|---|\n| 1 | 2 |",               # a markdown table
    "Wait... what? Really...",                       # ellipses
    "Step 1\n\n\n\n\nStep 2",                        # blank lines are invisible, not a loop
    "Mississippi has 4 s's and 4 i's.",
])
def test_ordinary_text_is_not(text):
    assert not degenerate(text)
