from app.core.ids import id_from_name, slugify


def test_slugify_ascii_names():
    assert slugify("Front Gate") == "front-gate"
    assert slugify("  Loading   Dock  ") == "loading-dock"


def test_slugify_hebrew_names_fall_back():
    assert slugify("משאית חוצה שער הכניסה") == "item"
    assert slugify("שער הכניסה", fallback="") == ""
    assert slugify("אדם נשאר במחסן 30 שניות", fallback="") == ""


def test_id_from_name_hebrew_gets_random_id():
    rid = id_from_name("rule", "משאית חוצה שער הכניסה")
    assert rid.startswith("rule_")
    assert rid != "rule_-----" and "-" not in rid
    assert len(rid) == len("rule_") + 12
    assert id_from_name("line", "Gate A") == "line_gate-a"
