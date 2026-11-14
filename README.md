# Trame — agenda, tâches et notes (FR / AR, hégirien)

Application Android (puis iOS) qui s'ajoute **par-dessus** les agendas du téléphone (Google, Outlook…) et y relie tâches, rappels et comptes rendus de réunion.
Tout reste sur le téléphone : aucun compte, aucun serveur.

## Ce que contient la version 0.2.0

| Fonction | Détail |
|---|---|
| Saisie rapide FR/AR | « réunion budget jeudi 10h », « ذكرني غدا على الساعة 9 صباحا… », « comité 3 رمضان de 9h à 10h ». Carte de confirmation obligatoire avant d'enregistrer. |
| Agendas du téléphone | Lecture / création / modification / suppression via `@ebarooni/capacitor-calendar`. Choix de l'agenda d'écriture et des agendas affichés. Agenda local « Trame » si l'accès est refusé. |
| Tâches et rappels | Échéance, durée, priorité, responsable, rappel. Filtres À faire / Rappels / Terminées. |
| Comptes rendus | Participants, ordre du jour, décisions, actions → tâche en un geste. Lien avec un rendez-vous. |
| Fiche contexte | Avant chaque rendez-vous : notes liées, même série, mêmes personnes, même sujet, actions ouvertes, dernières décisions. Notification N minutes avant. |
| Conflits | Détection à la saisie et badge dans les listes. |
| Créneaux libres | Suggestion de placement des tâches dans les trous de la journée de travail. |
| Bilan du jour | Terminer / reporter à demain / retirer la date / supprimer. |
| Hégirien | Double affichage, vue Mois hégirienne, saisie hégirienne, ajustement ±2 jours (dates officielles marocaines). Chiffres latins ou arabes. |
| Recherche | Plein texte FR/AR, insensible aux accents et aux harakat. |
| Partage | Rendez-vous en `.ics`, notes en texte, PDF (arabe correctement rendu) ou fichier `.trame` importable par un autre utilisateur. |
| Sauvegarde | Export JSON chiffré (AES-256, mot de passe) et restauration. |
| Mises à jour | Vérification automatique au démarrage (bandeau « Installer ») + bouton « Vérifier maintenant » en tête des Réglages. |
| Dictée vocale | Bouton micro : rendez-vous, tâche, rappel ou note dictés en FR ou AR, puis carte de confirmation. |
| WhatsApp | Envoi d'un rendez-vous ou d'une tâche à un collègue (numéro mémorisé), invitation .ics en option. |
| Widget | Rendez-vous et tâches du jour sur l'écran d'accueil, navigation jour par jour. |
| Mode sombre | Automatique, clair ou sombre. |

## Arborescence

```
src/core/      logique pure et testée : analyseur, hégirien, conflits, recherche, fiche contexte, .ics, sauvegarde
src/app.js     interface (vues, feuilles, actions)
src/platform.js agendas, notifications, fichiers, partage, mises à jour (Capacitor)
src/export.js  export texte / PDF des notes
public/        index.html, styles.css
tests/         tests automatiques (npm test)
android/ ios/  projets natifs Capacitor (permissions, icônes, signature déjà configurées)
.github/workflows/build.yml  compilation APK + vérification iOS sur GitHub
```

## 1. Mettre le projet sur GitHub

1. Décompressez le zip. **Le contenu du dossier `trame` doit être à la racine du dépôt** (`package.json` au premier niveau).
2. Sur github.com → **New repository** → nom `trame`.
   - **Public** si vous voulez la mise à jour intégrée (l'appli lit `version.json` et télécharge l'APK sans identifiant).
   - **Private** sinon : tout fonctionne, mais les mises à jour se font en envoyant le nouvel APK à la main.
3. Depuis le dossier décompressé :
   ```
   git init
   git add .
   git commit -m "Trame 0.1.0"
   git branch -M main
   git remote add origin https://github.com/Mrani-hub/trame.git
   git push -u origin main
   ```
4. Onglet **Actions** : la compilation démarre (~6 min). À la fin, l'artefact **Trame-0.1.0-N** contient `Trame.apk`.

> Si votre compte GitHub ou le nom du dépôt diffèrent, modifiez l'adresse dans `version.json` et dans `src/app.js` (`updateUrl`), ou directement dans les Réglages de l'appli.

## 2. Clé de signature (déjà créée)

La clé permanente est dans `android/signing/trame-release.jks.enc`, **chiffrée** (AES-256). GitHub la déchiffre avec le secret
**`TRAME_SIGNING_KEY`** (Settings → Secrets and variables → Actions). Sans ce secret, GitHub produit un APK de test signé avec une clé temporaire.

Gardez précieusement une copie de `trame-release.jks` et de sa phrase secrète : la même clé sera exigée pour chaque mise à jour et pour le Play Store.

## 3. Installer sur un téléphone

1. Téléchargez `Trame.apk` (artefact Actions ou Release).
2. Ouvrez-le ; Android demande d'autoriser l'installation depuis cette source (navigateur ou gestionnaire de fichiers).
3. Play Protect peut afficher « appli non reconnue » : **Plus de détails → Installer quand même**.
4. Au premier lancement : langue, accès aux agendas, notifications.
5. Android 12 : Réglages Trame → « Autoriser les rappels à l'heure exacte ».

## 4. Publier une mise à jour

```
npm run release 0.3.0 "Corrections et nouvelles fonctions"
git commit -am "Version 0.3.0"
git push
```

Quand `version.json` change sur `main`, GitHub compile l'APK signé et publie la **Release v0.3.0** avec `Trame.apk`.
Les téléphones la détectent au prochain lancement (bandeau « Installer ») ou via Réglages → Vérifier maintenant.

## 5. Développer en local (facultatif)

```
npm install
npm test             # tests de l'analyseur, de l'hégirien, des conflits, de la recherche…
npm run build:web    # produit www/
npx http-server www  # aperçu dans le navigateur (sans agendas ni notifications natives)
```

Pour compiler sur votre PC : Android Studio + `npx cap sync android` puis `npx cap open android`.

## 6. Version iOS (plus tard)

Le projet `ios/` est prêt (textes d'autorisation agenda, icône). GitHub vérifie déjà qu'il compile.
Pour distribuer : compte **Apple Developer** (payant), puis ajout d'une étape TestFlight au workflow.

## Limites connues de la v0.1.0

- Les récurrences hégiriennes (« chaque 1er Ramadan ») ne sont pas encore générées : prévu en v1.
- Le partage est un envoi (fichier / texte), pas une collaboration en temps réel.
- Les fichiers `.trame` s'importent depuis Réglages → Restaurer / importer (ouverture directe depuis WhatsApp : v1).
- L'analyseur ne comprend pas la darija écrite en lettres latines ; il faut toujours vérifier la carte de confirmation.
- Vérification développeur Google : obligatoire hors Play Store dans certains pays depuis le 30/09/2026, extension mondiale annoncée pour 2027. Inscrivez-vous sur l'Android Developer Console et enregistrez `ma.trame.app` avec la clé ci-dessus.
