# 🃏 Poker Equity Calculator

Un outil web interactif qui calcule tes chances de gagner en temps réel au Texas Hold'em, street par street, grâce à la simulation Monte Carlo.

---

## Ce que fait le projet

Tu renseignes ta main (2 cartes), le nombre de joueurs à la table, et l'outil t'affiche ta probabilité de victoire. Au fur et à mesure que les cartes communes sont révélées (flop, turn, river), les probabilités se mettent à jour automatiquement et un graphique retrace l'évolution de ton equity tout au long de la main.

---

## La méthode : Monte Carlo

### Pourquoi pas un calcul exact ?

Calculer exactement les probabilités préflop avec plusieurs joueurs demanderait d'évaluer des millions de combinaisons. Avec 9 joueurs et un deck de 52 cartes, l'espace des possibles est trop grand pour être parcouru en temps réel dans un navigateur.

### Le principe de la simulation

La solution : **simuler un très grand nombre de parties aléatoires** et compter combien de fois tu gagnes.

À chaque simulation :
1. On pioche aléatoirement des mains pour chaque adversaire (parmi les cartes restantes)
2. On complète le board avec les cartes communautaires manquantes
3. On évalue quelle main est la meilleure
4. On note si tu gagnes, perds ou fais égalité

En répétant ce processus **10 000 fois**, la fréquence de victoire converge vers la vraie probabilité avec une marge d'erreur inférieure à 1%.

### Précision selon la street

| Street | Cartes connues | Inconnues restantes | Précision |
|--------|---------------|---------------------|-----------|
| Préflop | 2 | 50 | ~95% avec 10k simulations |
| Flop | 5 | 47 | ~98% |
| Turn | 6 | 46 | ~99% |
| River | 7 | 0 (board complet) | **100% exacte** |

À la river, plus besoin de simuler : on énumère toutes les mains possibles pour les adversaires et on calcule le résultat exact.

---

## Architecture

```
poker-equity-calculator/
│
├── backend/                  # API Python
│   ├── main.py               # Serveur FastAPI, définition des routes
│   ├── simulator.py          # Logique Monte Carlo
│   ├── evaluator.py          # Wrapper autour de la librairie treys
│   └── requirements.txt
│
├── frontend/                 # Interface utilisateur
│   ├── index.html
│   ├── style.css
│   └── app.js                # Logique UI, appels API, graphique
│
└── README.md
```

---

## Stack technique

| Composant | Outil | Pourquoi |
|-----------|-------|----------|
| Évaluation des mains | [`treys`](https://github.com/ihendley/treys) | Librairie Python légère et rapide, évalue n'importe quelle main poker en une ligne |
| Backend / API | `FastAPI` | Simple, rapide, génère automatiquement une doc interactive |
| Simulation | `NumPy` + Python natif | Tirage aléatoire efficace |
| Frontend | HTML / CSS / JS vanilla | Pas de framework lourd nécessaire pour ce scope |
| Graphique | `Chart.js` | Visualisation légère et jolie, intégrable en CDN |

---

## Fonctionnalités

- **Card picker** visuel — clique sur les cartes pour les sélectionner (4 couleurs, 13 valeurs)
- **Slider** pour le nombre de joueurs (2 à 9)
- **Affichage en temps réel** de la probabilité de victoire, défaite et égalité
- **Graphique d'évolution** de l'equity au fil des streets
- **Calcul exact** automatique à la river

---

## Lancer le projet en local

```bash
# 1. Cloner le repo
git clone https://github.com/ton-pseudo/poker-equity-calculator
cd poker-equity-calculator

# 2. Installer les dépendances Python
pip install -r backend/requirements.txt

# 3. Lancer le backend
uvicorn backend.main:app --reload

# 4. Ouvrir frontend/index.html dans ton navigateur
```

L'API sera disponible sur `http://localhost:8000` et la doc auto sur `http://localhost:8000/docs`.
