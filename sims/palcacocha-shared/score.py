"""Score for the Palcacocha alluvion film: a slow, low bed in D minor (66 bpm) at one level, one impact when the
avalanche hits the lake, a low rumble under the flood while it runs down the valley, one riser that lands when the
front enters the city, and a soft pop when the hazard map and the safe places appear. Accent, never narrate.

    python run_sfx.py <repo>/sims/palcacocha-shared/score.py

Every time comes from palcacocha-film/timeline.json (the beats of script.js).
"""

import os

from sfx.score_kit import bed, chords, hz, motor
from sfx.synth import click, impact, pop, riser

TIMELINE = "../palcacocha-film/timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "palcacocha-score.wav")
TARGET_LUFS = -14.0
SEED = 41

CHORDS = chords("Dm9:D2 A2 C3 E3 F3/D1", "Bbmaj7:Bb1 F2 A2 D3/Bb0", "Gm9:G1 D2 F2 A2 Bb2/G0", "A7sus:A1 E2 G2 D3/A0")
MOTIF = [(0.5, hz("A4")), (2.5, hz("F4"))]


def score(mix, tl):
    dur = tl["duration"]
    beat = {b["name"]: b["t"] for b in tl["beats"]}
    left, right, low, drums = bed(dur, 66, CHORDS, MOTIF, motif_voice="epiano", kicks=(0,), snares=(), hats=0, swing=0.0, keys_vel=0.55, keys_lp=2600)
    mix.put_stereo(0, left, right, 0.12)
    mix.put(0, low, 0.12)
    mix.put(0, drums, 0.03)
    mix.put(beat["impact"], impact(1.6), 0.22)
    rumble = beat["santa"] - beat["impact"]
    mix.put(beat["impact"] + 0.4, motor(rumble, 60, 420, 4), 0.018)
    rise = 4.0
    mix.put(beat["entrance"] - rise, riser(rise, 180, 2600), 0.05)
    mix.put(beat["hazard"], pop(520, 880), 0.05)
    mix.put(beat["safe"], pop(660, 990), 0.05)
    for name in ("laguna", "frente", "ciudad", "general"):
        mix.put(beat[name], click(2200, 0.025), 0.04)
