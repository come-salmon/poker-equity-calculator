"""Conversion helpers and deck utilities wrapping treys."""

from treys import Card, Deck


def strings_to_cards(card_strings: list[str]) -> list[int]:
    """Convert a list of card strings (e.g. ['Ah', 'Kd']) to treys integers."""
    return [Card.new(s) for s in card_strings]


def get_remaining_deck(used_cards: list[int]) -> list[int]:
    """Return all 52 cards except those already in use."""
    deck = Deck()
    return [c for c in deck.cards if c not in used_cards]


def infer_street(num_community: int) -> str:
    mapping = {0: "preflop", 3: "flop", 4: "turn", 5: "river"}
    return mapping.get(num_community, "unknown")
