# CLAUDE.md — Contexte technique pour Claude Code

Ce fichier décrit l'architecture, les conventions et les détails d'implémentation du projet **Poker Equity Calculator**. Il est destiné à servir de contexte de travail dans VS Code avec Claude Code.

---

## Vue d'ensemble du projet

Application web full-stack qui calcule l'équité (probabilité de victoire) d'une main de Texas Hold'em No-Limit par simulation Monte Carlo. L'utilisateur saisit sa main + le nombre de joueurs, puis renseigne les cartes communautaires au fil des streets. L'équité se met à jour à chaque étape.

---

## Stack

- **Backend** : Python 3.11+, FastAPI, Uvicorn
- **Librairie poker** : `treys` (évaluation des mains)
- **Simulation** : Python `random` natif (ou NumPy si besoin de performance)
- **Frontend** : HTML/CSS/JS vanilla + Chart.js (CDN)
- **Pas de base de données** : tout est stateless, calculé à la volée

---

## Structure des fichiers

```
poker-equity-calculator/
│
├── backend/
│   ├── main.py           # FastAPI app, routes /equity et /exact
│   ├── simulator.py      # Classe MonteCarloSimulator
│   ├── evaluator.py      # Wrapper treys, helpers de conversion
│   └── requirements.txt  # fastapi, uvicorn, treys, numpy
│
├── frontend/
│   ├── index.html        # Structure HTML, card picker, sliders
│   ├── style.css         # Styles (cartes, couleurs, layout)
│   └── app.js            # Logique UI, fetch API, Chart.js
│
├── CLAUDE.md             # Ce fichier
└── README.md             # Documentation lisible
```

---

## Représentation des cartes

### Librairie `treys`

`treys` représente chaque carte comme un entier 32 bits. On utilise `Card.new(str)` pour créer une carte.

```python
from treys import Card, Evaluator, Deck

card = Card.new('Ah')   # As de cœur
card = Card.new('Kd')   # Roi de carreau
card = Card.new('2c')   # 2 de trèfle
card = Card.new('Ts')   # 10 de pique
```

**Convention de notation :**
- Valeurs : `2 3 4 5 6 7 8 9 T J Q K A`
- Couleurs : `h` (hearts/cœur), `d` (diamonds/carreau), `c` (clubs/trèfle), `s` (spades/pique)

### Côté frontend → API

Les cartes sont envoyées en JSON sous forme de strings `"Ah"`, `"Kd"`, etc.

```json
{
  "hole_cards": ["Qh", "Jd"],
  "community_cards": ["Ah", "Kd", "Tc"],
  "num_players": 4,
  "num_simulations": 10000
}
```

---

## API — Endpoints

### `POST /equity`

Calcul Monte Carlo (préflop, flop, turn).

**Request body :**
```json
{
  "hole_cards": ["Qh", "Jd"],
  "community_cards": [],
  "num_players": 4,
  "num_simulations": 10000
}
```

**Response :**
```json
{
  "win": 0.412,
  "lose": 0.543,
  "tie": 0.045,
  "street": "preflop"
}
```

`street` est inféré automatiquement selon la longueur de `community_cards` :
- 0 cartes → `"preflop"`
- 3 cartes → `"flop"`
- 4 cartes → `"turn"`
- 5 cartes → `"river"` (Monte Carlo, board complet — seules les mains adverses sont tirées aléatoirement)

### `POST /exact`

Calcul exact à la river (5 cartes communautaires connues). Énumère toutes les combinaisons possibles pour les adversaires.

**Request body :** identique à `/equity` mais `community_cards` doit contenir exactement 5 cartes.

**Response :** identique à `/equity` avec `"street": "river"`.

---

## Implémentation — `simulator.py`

### Classe `MonteCarloSimulator`

```python
class MonteCarloSimulator:
    def __init__(self, hole_cards: list[int], community_cards: list[int], num_players: int):
        ...

    def run(self, num_simulations: int = 10000) -> dict:
        """Retourne {"win": float, "lose": float, "tie": float}"""
        ...

    def _simulate_once(self, remaining_deck: list[int]) -> str:
        """Retourne 'win', 'lose' ou 'tie' pour une simulation."""
        ...
```

### Logique d'une simulation

```python
def _simulate_once(self, remaining_deck):
    deck_copy = remaining_deck.copy()
    random.shuffle(deck_copy)

    # Compléter le board
    cards_needed = 5 - len(self.community_cards)
    board = self.community_cards + deck_copy[:cards_needed]
    deck_copy = deck_copy[cards_needed:]

    # Distribuer les mains adverses
    opponent_hands = []
    for _ in range(self.num_players - 1):
        opponent_hands.append(deck_copy[:2])
        deck_copy = deck_copy[2:]

    # Évaluer
    evaluator = Evaluator()
    my_score = evaluator.evaluate(board, self.hole_cards)

    for opp_hand in opponent_hands:
        opp_score = evaluator.evaluate(board, opp_hand)
        if opp_score < my_score:   # IMPORTANT : score plus bas = main meilleure dans treys
            return 'lose'
        elif opp_score == my_score:
            pass  # gérer égalité

    return 'win'
```

> ⚠️ **Attention** : dans `treys`, un score **plus bas** signifie une **meilleure** main. `1` = quinte flush royale, `7462` = 7 high.

---

## Implémentation — `evaluator.py`

Helpers utiles :

```python
from treys import Card, Deck

def strings_to_cards(card_strings: list[str]) -> list[int]:
    return [Card.new(s) for s in card_strings]

def get_remaining_deck(used_cards: list[int]) -> list[int]:
    deck = Deck()
    deck.shuffle()
    return [c for c in deck.cards if c not in used_cards]
```

---

## Implémentation — `main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # OK pour dev local
    allow_methods=["*"],
    allow_headers=["*"],
)

class EquityRequest(BaseModel):
    hole_cards: list[str]
    community_cards: list[str] = []
    num_players: int
    num_simulations: int = 10000

@app.post("/equity")
def compute_equity(req: EquityRequest):
    ...
```

---

## Frontend — `app.js`

### Structure principale

```javascript
const state = {
  holeCards: [],          // 2 strings max
  communityCards: [],     // 0, 3, 4 ou 5 strings
  numPlayers: 4,
  equityHistory: []       // [{street, win, lose, tie}] pour le graphique
};

async function fetchEquity() {
  const endpoint = '/equity'; // Monte Carlo pour toutes les streets, y compris river
  const res = await fetch(`http://localhost:8000${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hole_cards: state.holeCards,
      community_cards: state.communityCards,
      num_players: state.numPlayers
    })
  });
  const data = await res.json();
  updateUI(data);
  updateChart(data);
}
```

### Card Picker

Le card picker est une grille 4 couleurs × 13 valeurs. Chaque carte est un `<button>` avec attributs `data-rank` et `data-suit`. Les cartes déjà sélectionnées sont grisées et non cliquables.

### Graphique Chart.js

Graphique en courbe avec l'equity (win %) sur l'axe Y (0–100%) et les streets sur l'axe X (`["Préflop", "Flop", "Turn", "River"]`).

---

## Conventions de code

- **Python** : type hints partout, docstrings sur les méthodes publiques, pas de classes inutiles
- **JS** : ES6+, pas de framework, fonctions nommées explicitement
- **Nommage** : snake_case en Python, camelCase en JS
- **Pas de commentaires évidents** : commenter uniquement ce qui n'est pas immédiatement clair

---

## Pièges connus

| Problème | Solution |
|----------|----------|
| Score `treys` inversé | Score bas = bonne main. Toujours comparer avec `<` pour trouver le gagnant |
| Cartes en double | Toujours construire le deck restant en excluant `hole_cards + community_cards` |
| CORS bloqué | Le middleware CORS FastAPI doit être ajouté avant les routes |
| Égalité (split pot) | Compter comme 0.5 victoire dans la simulation ou gérer séparément |

---

## Ordre de développement suggéré

1. `evaluator.py` — helpers de conversion + test unitaire rapide
2. `simulator.py` — logique Monte Carlo + vérification manuelle sur quelques mains connues
3. `main.py` — routes FastAPI + test via `/docs`
4. `frontend/index.html` + `style.css` — card picker statique
5. `frontend/app.js` — connexion à l'API + affichage des résultats
6. Ajout du graphique Chart.js
7. Monte Carlo à la river via `/equity` (5 community cards) — `/exact` reste dispo dans l'API mais n'est pas utilisé par le frontend

## UI — Ambitions visuelles

- Stack frontend : HTML + Tailwind CSS (CDN) + JS vanilla
- Ambiance : dark theme premium, tons vert foncé / noir / or — univers poker haut de gamme
- Card picker interactif : grille 4 couleurs × 13 valeurs, animation au survol et au clic, cartes déjà sélectionnées grisées
- Transitions fluides CSS entre les streets (preflop → flop → turn → river)
- Résultats affichés avec des barres de progression animées (win/lose/tie)
- Graphique Chart.js qui se met à jour street par street
- Responsive mobile
- Inspirations visuelles : PokerStars, 888poker, interfaces casino premium