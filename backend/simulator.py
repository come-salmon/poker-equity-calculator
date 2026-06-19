"""Monte Carlo equity simulator for Texas Hold'em."""

import random
from itertools import combinations

from treys import Evaluator

from evaluator import get_remaining_deck


class MonteCarloSimulator:
    def __init__(
        self,
        hole_cards: list[int],
        community_cards: list[int],
        num_players: int,
    ) -> None:
        self.hole_cards = hole_cards
        self.community_cards = community_cards
        self.num_players = num_players
        self._evaluator = Evaluator()
        self._remaining = get_remaining_deck(hole_cards + community_cards)

    def run(self, num_simulations: int = 10_000) -> dict[str, float]:
        """Run Monte Carlo simulation and return win/lose/tie ratios."""
        wins = ties = losses = 0

        for _ in range(num_simulations):
            outcome = self._simulate_once()
            if outcome == "win":
                wins += 1
            elif outcome == "tie":
                ties += 1
            else:
                losses += 1

        total = num_simulations
        return {
            "win": wins / total,
            "lose": losses / total,
            "tie": ties / total,
        }

    def _simulate_once(self) -> str:
        deck = self._remaining.copy()
        random.shuffle(deck)

        cards_needed = 5 - len(self.community_cards)
        board = self.community_cards + deck[:cards_needed]
        deck = deck[cards_needed:]

        my_score = self._evaluator.evaluate(board, self.hole_cards)
        best_opp = None

        for i in range(self.num_players - 1):
            opp_hand = deck[i * 2 : i * 2 + 2]
            opp_score = self._evaluator.evaluate(board, opp_hand)
            # In treys: lower score = better hand
            if best_opp is None or opp_score < best_opp:
                best_opp = opp_score

        if best_opp is None:
            return "win"
        if best_opp < my_score:
            return "lose"
        if best_opp == my_score:
            return "tie"
        return "win"


class ExactCalculator:
    """Enumerate all possible opponent hands for river equity."""

    def __init__(
        self,
        hole_cards: list[int],
        community_cards: list[int],
        num_players: int,
    ) -> None:
        self.hole_cards = hole_cards
        self.community_cards = community_cards
        self.num_players = num_players
        self._evaluator = Evaluator()
        self._remaining = get_remaining_deck(hole_cards + community_cards)

    def run(self) -> dict[str, float]:
        """Enumerate all (num_players-1) opponent hands and compute exact equity."""
        board = self.community_cards
        my_score = self._evaluator.evaluate(board, self.hole_cards)
        wins = ties = losses = 0

        cards_per_opp = 2 * (self.num_players - 1)

        for opp_cards in combinations(self._remaining, cards_per_opp):
            opp_cards = list(opp_cards)
            best_opp = None
            for i in range(self.num_players - 1):
                opp_hand = opp_cards[i * 2 : i * 2 + 2]
                opp_score = self._evaluator.evaluate(board, opp_hand)
                if best_opp is None or opp_score < best_opp:
                    best_opp = opp_score

            if best_opp < my_score:
                losses += 1
            elif best_opp == my_score:
                ties += 1
            else:
                wins += 1

        total = wins + ties + losses
        if total == 0:
            return {"win": 0.0, "lose": 0.0, "tie": 0.0}

        return {
            "win": wins / total,
            "lose": losses / total,
            "tie": ties / total,
        }
