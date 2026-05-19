# Trading News Filter for X/Twitter - Sprint Plan

Ce fichier explique le decoupage du projet en sprints, l'etat actuel de chaque sprint, ce qui est deja developpe, et comment utiliser l'extension localement.

## Resume d'avancement

Tous les sprints MVP ci-dessous sont developpes dans cette version locale.

Statut global : MVP fonctionnel.

Ce qui est inclus :

- Extension Chrome Manifest V3.
- Popup complet.
- Page options/settings.
- Content script sur `x.com` et `twitter.com`.
- Background service worker avec `chrome.alarms`.
- Scan manuel lent des 10 derniers tweets.
- Auto-refresh optionnel avec intervalle configurable, minimum 1 minute, puis scan lent des 10 derniers tweets.
- Analyse OpenAI optionnelle avec cle utilisateur stockee localement.
- Filtre `News for PAIR` pour Forex, crypto, actions, indices et commodities.
- Plan cockpit complet ajoute dans `COCKPIT_SPRINT_PLAN.md`.
- Context Edge Score 0-100 ajoute dans les cartes de tweets.
- Filtrage local par mots-cles trading.
- Scoring impact de 0 a 5.
- Classification categorie, direction bullish/bearish/neutral, resume local.
- Historique local via `chrome.storage.local`.
- Deduplication par URL de tweet ou hash du texte.
- Sidebar flottante optionnelle.
- Export JSON et CSV.
- README d'installation et d'utilisation.

## Sprint 1 - Base Chrome Extension MV3

Objectif : creer la structure technique minimale de l'extension.

Livrables :

- `manifest.json`
- `background.js`
- `content.js`
- `popup.html`
- `popup.js`
- `popup.css`
- Permissions MV3 : `storage`, `activeTab`, `scripting`, `alarms`, `tabs`
- Host permissions : `https://x.com/*`, `https://twitter.com/*`

Statut : fait.

Fichiers principaux :

- `manifest.json`
- `background.js`
- `content.js`
- `popup.html`
- `popup.js`
- `popup.css`

## Sprint 2 - Scan manuel lent des 10 derniers tweets

Objectif : permettre a l'utilisateur de scanner les 10 derniers tweets de la page X/Twitter ouverte avec un scroll lent et limite.

Livrables :

- Bouton `Scan Latest 10 Tweets`.
- Detection des tweets via les balises `article`.
- Retour en haut de la timeline avant scan.
- Scroll lent par etapes.
- Arret automatique a 10 tweets uniques.
- Extraction du texte.
- Extraction de l'auteur si disponible.
- Extraction de la date/heure si disponible.
- Extraction de l'URL du tweet si disponible.
- Message clair si aucun tweet visible n'est trouve.
- Aucun scroll infini.
- Aucun appel a des endpoints internes X/Twitter.

Statut : fait.

Fichiers principaux :

- `content.js`
- `popup.js`

## Sprint 3 - Filtrage trading local

Objectif : filtrer uniquement les tweets pertinents pour le trading.

Livrables :

- Categories trading :
  - Gold / XAUUSD
  - USD / DXY / Yields
  - Fed / Rates
  - Inflation
  - Jobs / US Data
  - Geopolitics
  - Oil / Risk sentiment
  - EURUSD / ECB
- Detection des mots-cles.
- Classification locale sans backend.
- Aucun appel API externe.

Statut : fait.

Fichiers principaux :

- `scoring.js`
- `storage.js`

## Sprint 4 - Scoring d'impact et classification

Objectif : donner une priorite claire aux news importantes.

Livrables :

- Fonction `calculateImpactScore(tweetText)`.
- Score de 0 a 5.
- Labels :
  - `5/5` : High Impact
  - `4/5` : Important
  - `3/5` : Medium
  - `1-2/5` : Low
- Reason local.
- Resume court local.
- Direction simple : `bullish`, `bearish`, `neutral`.
- Objet final structure comme :

```json
{
  "id": "unique_id",
  "text": "...",
  "author": "...",
  "time": "...",
  "url": "...",
  "categories": ["Gold / XAUUSD", "Fed / Rates"],
  "impactScore": 5,
  "importanceLabel": "High Impact",
  "reason": "Mentions CPI and USD, which can strongly impact watched trading pairs.",
  "detectedKeywords": ["cpi", "usd", "gold"],
  "createdAt": "ISO_DATE"
}
```

Statut : fait.

Fichiers principaux :

- `scoring.js`

## Sprint 5 - Popup UX dashboard

Objectif : creer une interface compacte et lisible pour utiliser l'extension.

Livrables :

- Titre `Trading News Filter`.
- Bouton `Scan Trading News`.
- Toggle `Auto-refresh every 5 minutes`.
- Statut `Auto-refresh: ON/OFF`.
- Nombre de tweets scannes.
- Nombre de tweets pertinents.
- Dernier scan.
- Prochain refresh.
- Filtres :
  - All
  - High Impact only
  - XAUUSD
  - USD
  - Fed
  - Inflation
  - Geopolitics
- Liste des tweets filtres.
- Bouton `Open Tweet`.
- Bouton `Save`.
- Bouton `Clear History`.
- Export JSON.
- Export CSV.

Statut : fait.

Fichiers principaux :

- `popup.html`
- `popup.js`
- `popup.css`

## Sprint 6 - Auto-refresh configurable

Objectif : permettre un refresh automatique controle, non agressif, active uniquement par l'utilisateur.

Livrables :

- Option desactivee par defaut.
- Toggle dans le popup.
- Option dans la page settings.
- Intervalle configurable par l'utilisateur.
- Sauvegarde dans `chrome.storage.local`.
- Utilisation de `chrome.alarms`.
- Intervalle minimum : 1 minute.
- Refresh uniquement de l'onglet actif.
- Refresh uniquement si l'URL est `x.com` ou `twitter.com`.
- Aucun nouvel onglet ouvert automatiquement.
- Apres refresh, attente du chargement de la page.
- Scan automatique lent des 10 derniers tweets une seule fois apres refresh.
- Deduplication avant sauvegarde.
- Desactivation possible a tout moment.

Statut : fait.

## Sprint 11 - Market Research Knowledge Terminal IA

Objectif : ajouter une couche d'analyse marche orientee traders basee sur les news visibles filtrees.

Livrables :

- Champ OpenAI API Key dans les options.
- Champ modele OpenAI.
- Bouton `Analyze with OpenAI` dans le popup.
- Prompt IA personnalisable dans la page options.
- Analyse bullish / bearish / mixed / neutral.
- Mention des news qui influencent la decision.
- Resume macro.
- Drivers de marche.
- Facteurs bullish.
- Facteurs bearish.
- Notes de risque.
- Filtre `News for Pair`.
- Liste configurable de paires / marches suivis.

Statut : fait.

Fichiers principaux :

- `background.js`
- `popup.html`
- `popup.js`
- `popup.css`
- `options.html`
- `options.js`
- `storage.js`
- `scoring.js`

## Sprint Cockpit 0-2 - Base AI Trading Context Cockpit

Objectif : commencer l'adaptation vers le cockpit de contexte trading defini dans `COCKPIT_SPRINT_PLAN.md`.

Livrables :

- Ajout du plan complet comme fichier de reference : `COCKPIT_SPRINT_PLAN.md`.
- Ajout du module `cockpit.js`.
- Modele local `CapturedTweet`.
- Modele local `LocalTweetAnalysis`.
- Modele local `ContextScore`.
- Detection des actifs affectes.
- Detection des termes calendar risk.
- Inference d'un theme macro.
- Calcul du Context Edge Score 0-100.
- Affichage dans les cartes :
  - score contexte 0-100,
  - risk level,
  - clarity,
  - affected assets,
  - macro theme,
  - reasons,
  - penalties.
- Export CSV enrichi avec :
  - `contextScoreValue`,
  - `contextRiskLevel`,
  - `contextClarity`,
  - `affectedAssets`,
  - `macroTheme`.

Statut : fait pour la base 0-2.

Limites :

- Les types sont implementes comme objets JavaScript locaux, pas encore comme TypeScript strict.
- Le dashboard sidebar a onglets reste a faire.
- Les modules Session Brief, Macro Desk, Instrument Bias, Journal, Coach et Daily Report restent a faire.

## Sprint Cockpit 3 - AI Tweet Analysis

Objectif : analyser un tweet individuellement avec un JSON stable et un fallback local.

Livrables :

- Bouton `Ask AI` sur chaque carte tweet.
- Message background `TNF_ANALYZE_TWEET`.
- Fonction `analyzeTweet()` dans `ai.js`.
- Prompt par tweet sans signal buy/sell.
- JSON stable :
  - `isRelevant`,
  - `importance`,
  - `affectedAssets`,
  - `marketBias`,
  - `riskTone`,
  - `summary`,
  - `whyItMatters`,
  - `mainDriver`,
  - `tradingWarning`,
  - `clarity`,
  - `shouldNotify`.
- Fallback local si :
  - cle OpenAI absente,
  - erreur reseau,
  - erreur OpenAI,
  - JSON invalide.
- Affichage inline dans la carte tweet.
- Persistance dans l'historique local et le dernier scan.

Statut : fait.

Limites :

- L'analyse IA par tweet n'est pas encore visible dans la sidebar dashboard a onglets.
- Pas encore de rate limit visuel avance par utilisateur.

## Sprint Cockpit 4 - Sidebar Dashboard avec onglets

Objectif : transformer la sidebar simple en cockpit lisible pendant une session de trading.

Livrables :

- Sidebar renomme en `AI Trading Context Cockpit`.
- Navigation par onglets :
  - Today,
  - Macro Desk,
  - Assets,
  - Calendar Risk,
  - Journal,
  - Coach,
  - Settings.
- Onglet Today :
  - nombre de tweets scannes,
  - average context score,
  - risk tone,
  - main driver,
  - assets detectes,
  - top tweets importants.
- Onglet Macro Desk :
  - groupement local par theme macro,
  - score contexte moyen,
  - assets associes.
- Onglet Assets :
  - fiche locale par actif detecte,
  - biais news local,
  - context score moyen,
  - nombre de tweets.
- Onglet Calendar Risk :
  - detection locale des termes calendar risk,
  - mentions count,
  - assets,
  - warning prudent.
- Onglets Journal, Coach, Settings :
  - etats vides propres prets pour les prochains sprints.

Statut : fait pour la base locale.

Limites :

- Les onglets Journal et Coach ne sont pas encore connectes a un vrai journal.
- Macro Desk et Assets sont locaux, sans narrative IA dediee pour l'instant.
- Le Session Brief IA complet reste au sprint suivant.

Fichiers principaux :

- `background.js`
- `popup.js`
- `options.js`
- `storage.js`

## Sprint 7 - Historique local et deduplication

Objectif : conserver localement les news pertinentes sans doublons.

Livrables :

- `getHistory()`
- `saveTweet()`
- `saveTweets()`
- `clearHistory()`
- `deduplicateTweets()`
- Stockage via `chrome.storage.local`.
- Deduplication par URL si disponible.
- Sinon deduplication par hash simple du texte.

Statut : fait.

Fichiers principaux :

- `storage.js`
- `utils.js`

## Sprint 8 - Sidebar flottante X/Twitter

Objectif : afficher les news pertinentes directement dans la page X/Twitter.

Livrables :

- Bouton `Show Sidebar`.
- Sidebar positionnee a droite.
- Largeur 360px.
- Hauteur maximale 80vh.
- Dark mode compatible.
- Bouton fermer.
- Tweets high impact en haut.
- Score visible.
- Bouton `Open Tweet`.

Statut : fait.

Fichiers principaux :

- `content.js`
- `popup.js`

## Sprint 9 - Page Options / Settings

Objectif : rendre l'extension configurable sans modifier le code.

Livrables :

- `options.html`
- Modifier les mots-cles par categorie.
- Activer/desactiver les categories.
- Modifier le score minimum a afficher.
- Activer/desactiver auto-refresh.
- Afficher l'etat auto-refresh.
- Export JSON des settings.
- Import JSON des settings.
- Reset settings.
- Theme : system / light / dark.
- Future AI Backend URL, desactive par defaut.

Statut : fait.

Fichiers principaux :

- `options.html`
- `options.js`
- `options.css`

## Sprint 10 - Documentation et securite

Objectif : documenter l'installation, l'utilisation, les limites et les regles de securite.

Livrables :

- `README.md`
- Description projet.
- Installation locale dans Chrome.
- Utilisation.
- Activation/desactivation auto-refresh.
- Limites connues.
- Roadmap future.
- Avertissement trading.
- Avertissement X/Twitter.
- Pas de cle API dans le code.
- Pas d'endpoints internes X/Twitter.

Statut : fait.

Fichiers principaux :

- `README.md`
- `SPRINTS.md`

## Comment installer l'extension

1. Ouvrir Chrome.
2. Aller sur `chrome://extensions`.
3. Activer `Developer Mode`.
4. Cliquer sur `Load unpacked`.
5. Selectionner le dossier :

```text
/Users/zakariaeelouazzani/Documents/scrap/trading-news-extension
```

6. Epingler l'extension si besoin.

## Comment tester le scan manuel

1. Ouvrir une page X/Twitter, par exemple :

```text
https://x.com/nom_du_compte
```

2. Cliquer sur l'icone de l'extension.
3. Cliquer sur `Scan Latest 10 Tweets`.
4. Verifier :
   - nombre de tweets scannes,
   - nombre de tweets pertinents,
   - cartes de news,
   - score,
   - categories,
   - keywords,
   - bouton `Open Tweet`.

## Comment tester l'auto-refresh

1. Ouvrir une page `x.com` ou `twitter.com`.
2. Ouvrir le popup.
3. Choisir un intervalle en minutes, minimum 1.
4. Activer `Auto-refresh visible page`.
4. Verifier que le statut passe a `Auto-refresh: ON`.
5. Attendre l'intervalle configure.
6. L'onglet actif X/Twitter est recharge.
7. Apres chargement, l'extension scanne lentement les 10 derniers tweets.
8. Les tweets pertinents non dupliques sont sauvegardes.

Pour desactiver :

- couper le toggle dans le popup,
- ou cliquer `Disable auto-refresh now`,
- ou aller dans la page options et desactiver l'option.

## Comment modifier les mots-cles

1. Aller dans les options de l'extension.
2. Modifier les mots-cles dans la categorie souhaitee.
3. Les mots-cles doivent etre separes par des virgules.
4. Cliquer sur `Save Settings`.
5. Relancer un scan.

## Comment utiliser OpenAI

1. Ouvrir la page options de l'extension.
2. Coller une cle OpenAI personnelle dans `OpenAI API Key`.
3. Choisir le modele, par exemple `gpt-4.1-mini`.
4. Modifier `AI analysis prompt` pour guider la methode d'analyse de ton modele.
5. Cliquer `Save Settings`.
6. Ouvrir une page X/Twitter.
7. Cliquer `Scan Latest 10 Tweets`.
8. Choisir une paire dans `News for pair / market`.
9. Cliquer `Analyze with OpenAI`.

Important :

- La cle est stockee dans `chrome.storage.local`.
- La cle n'est pas dans le code.
- Ne jamais commit une cle API.
- Pour une version production, preferer un backend personnel entre l'extension et OpenAI.

## Comment exporter les news

Depuis le popup :

- Cliquer `Export JSON` pour exporter les tweets filtres en JSON.
- Cliquer `Export CSV` pour exporter les tweets filtres en CSV.

## Comment nettoyer l'historique

Depuis le popup :

1. Cliquer `Clear History`.
2. L'historique local est vide.

## Ce qui n'est pas encore developpe

Ces elements sont dans la roadmap future, pas dans le MVP actuel :

- Alertes Telegram via webhook personnel.
- Backend local Node.js ou Python.
- Resume IA via endpoint personnel.
- Dashboard web complet.
- Integration officielle X API.
- Scoring base sur calendrier economique.
- Detection bullish/bearish avancee pour XAUUSD.
- Filtre par compte Twitter specifique.
- Notifications desktop Chrome.

## Notes importantes

- L'extension lit uniquement les tweets rendus dans la page ouverte, avec un scroll lent limite aux 10 derniers tweets.
- Elle ne fait pas de scraping agressif.
- Elle ne contourne pas les protections de X/Twitter.
- Elle n'utilise pas les endpoints internes de X/Twitter.
- Elle ne fait pas d'auto-scroll.
- Elle ne garantit aucun signal de trading.
- Elle ne remplace pas l'analyse humaine.
