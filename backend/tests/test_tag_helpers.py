from app.lib.tags import normalize_tag_names


def test_normalize_tag_names_deduplicates_and_cleans():
    assert normalize_tag_names(["  Networking ", "networking", "Cloud  Security", ""]) == [
        "networking",
        "cloud security",
    ]


def test_normalize_tag_names_handles_non_string_inputs():
    assert normalize_tag_names(["Topic", None, 42]) == ["topic", "42"]
