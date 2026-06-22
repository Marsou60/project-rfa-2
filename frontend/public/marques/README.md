# Logos des marques (Dashboard Pure Data)

Le dashboard cherche automatiquement le logo d'une marque ici :

```
/marques/<SLUG>.png
```

## Convention de nommage (SLUG)
Le SLUG est calculé depuis le libellé de la marque :
- mise en MAJUSCULES
- suppression des accents
- suppression de tout caractère non alphanumérique (espaces, tirets, points, etc.)

Exemples :
- `TRW`            -> `TRW.png`
- `Bosch`          -> `BOSCH.png`
- `Valeo`          -> `VALEO.png`
- `Delphi France`  -> `DELPHIFRANCE.png`
- `K&N`            -> `KN.png`

## Format
- Fichiers **.png** (fond transparent recommandé).
- Si un logo est absent, le dashboard affiche une pastille colorée avec les initiales (repli automatique).

## Astuce
Si tes fichiers ont des noms quelconques, demande le script de normalisation :
il copie/renomme automatiquement un dossier source vers ce dossier au bon format.
