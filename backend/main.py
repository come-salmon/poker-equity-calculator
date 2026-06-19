"""FastAPI app exposing /equity (Monte Carlo) and /exact (river enumeration)."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

from evaluator import strings_to_cards, infer_street
from simulator import MonteCarloSimulator, ExactCalculator

app = FastAPI(title="Poker Equity Calculator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

VALID_RANKS = set("23456789TJQKA")
VALID_SUITS = set("hdcs")


class EquityRequest(BaseModel):
    hole_cards: list[str]
    community_cards: list[str] = []
    num_players: int = 4
    num_simulations: int = 10_000

    @field_validator("hole_cards")
    @classmethod
    def validate_hole_cards(cls, v: list[str]) -> list[str]:
        if len(v) != 2:
            raise ValueError("hole_cards must contain exactly 2 cards")
        _validate_card_strings(v)
        return v

    @field_validator("community_cards")
    @classmethod
    def validate_community_cards(cls, v: list[str]) -> list[str]:
        if len(v) not in (0, 3, 4, 5):
            raise ValueError("community_cards must have 0, 3, 4, or 5 cards")
        _validate_card_strings(v)
        return v

    @field_validator("num_players")
    @classmethod
    def validate_num_players(cls, v: int) -> int:
        if not 2 <= v <= 9:
            raise ValueError("num_players must be between 2 and 9")
        return v

    @field_validator("num_simulations")
    @classmethod
    def validate_num_simulations(cls, v: int) -> int:
        if not 100 <= v <= 100_000:
            raise ValueError("num_simulations must be between 100 and 100,000")
        return v


def _validate_card_strings(cards: list[str]) -> None:
    for card in cards:
        if len(card) != 2 or card[0] not in VALID_RANKS or card[1] not in VALID_SUITS:
            raise ValueError(f"Invalid card string: '{card}'")
    if len(cards) != len(set(cards)):
        raise ValueError("Duplicate cards detected")


def _check_no_duplicates(hole: list[str], community: list[str]) -> None:
    combined = hole + community
    if len(combined) != len(set(combined)):
        raise HTTPException(status_code=422, detail="Duplicate cards between hole and community")


@app.post("/equity")
def compute_equity(req: EquityRequest) -> dict:
    """Monte Carlo equity for preflop, flop, or turn."""
    _check_no_duplicates(req.hole_cards, req.community_cards)

    hole = strings_to_cards(req.hole_cards)
    community = strings_to_cards(req.community_cards)
    street = infer_street(len(req.community_cards))

    sim = MonteCarloSimulator(hole, community, req.num_players)
    result = sim.run(req.num_simulations)
    return {**result, "street": street}


@app.post("/exact")
def compute_exact(req: EquityRequest) -> dict:
    """Exact enumeration equity for the river (5 community cards required)."""
    if len(req.community_cards) != 5:
        raise HTTPException(
            status_code=422,
            detail="Exact calculation requires exactly 5 community cards",
        )
    _check_no_duplicates(req.hole_cards, req.community_cards)

    hole = strings_to_cards(req.hole_cards)
    community = strings_to_cards(req.community_cards)

    calc = ExactCalculator(hole, community, req.num_players)
    result = calc.run()
    return {**result, "street": "river"}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
