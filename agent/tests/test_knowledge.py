from novamart.knowledge import KnowledgeBase


def test_loads_all_documents():
    kb = KnowledgeBase()
    assert len(kb.documents) == 8
    assert len(kb.sections) >= 30
    assert all(s.text for s in kb.sections)


def test_catalog_lists_titles_and_sections():
    catalog = KnowledgeBase().catalog()
    assert "returns_and_refunds" in catalog
    assert "Holiday extension" in catalog
    assert "Human Resources" in catalog


def test_search_finds_the_right_section():
    kb = KnowledgeBase()
    results = kb.search("return window for electronics")
    refs = [(r["doc_id"], r["heading"]) for r in results[:3]]
    assert ("returns_and_refunds", "Standard return window") in refs
    assert any("15 days" in r["text"] for r in results[:3])


def test_search_matches_plurals():
    kb = KnowledgeBase()
    top = kb.search("gift card cash")[0]
    assert top["doc_id"] == "gift_cards_and_store_credit"


def test_search_order_statuses():
    kb = KnowledgeBase()
    top = kb.search("order delayed what to tell the customer")[0]
    assert top["doc_id"] == "delivery_and_order_tracking"


def test_search_returns_nothing_for_unknown_words():
    assert KnowledgeBase().search("xqzvt plombir") == []


def test_get_section_is_case_insensitive():
    kb = KnowledgeBase()
    assert kb.get_section("price_match", "exclusions") is not None
    assert kb.get_section("price_match", "nope") is None
