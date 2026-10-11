# pixy-controller

Contrôleur minimal et indépendant d'Ulanzi pour la EMEET PIXY 4K (Phase 2).

Utilise l'API Windows `IAMCameraControl` via DirectShow (même approche que la sonde `pixy-camera-control-diagnostic`, validée sur cette machine).

## Compilation

```powershell
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe `
  /out:bin\PixyController.exe Program.cs
```

## Commandes

```powershell
PixyController.exe info
PixyController.exe get
PixyController.exe center
PixyController.exe pan <signed-delta>
PixyController.exe tilt <signed-delta>
PixyController.exe zoom <signed-delta>
PixyController.exe set <pan|tilt|zoom> <absolute-value>
PixyController.exe preset-save <name>
PixyController.exe preset-load <name>
PixyController.exe preset-list
PixyController.exe preset-set-start <name>
PixyController.exe preset-delete <name>
PixyController.exe start
PixyController.exe mode <standard|tracking|privacy>
```

- `info` : plages, pas, valeurs par défaut et courantes (lecture seule).
- `get` : valeurs courantes Pan/Tilt/Zoom (lecture seule).
- `center` : rétablit les valeurs par défaut (Pan=0, Tilt=0, Zoom=100).
- `pan/tilt/zoom <delta>` : déplacement relatif, borné aux limites du matériel.
- `set <contrôle> <valeur>` : position absolue, bornée.
- `preset-save <name>` : enregistre la position courante dans `%APPDATA%\PixyController\presets.json`.
- `preset-load <name>` : rappelle un preset (positions absolues bornées).
- `preset-list` : liste les presets ; marque `(start)` celui de démarrage.
- `preset-set-start <name>` : désigne le preset appliqué automatiquement au démarrage de `serve`.
- `preset-delete <name>` : supprime un preset.
- `start` : rappelle la position de démarrage.
- `mode <standard|tracking|privacy>` : mode caméra via le canal HID propriétaire (délègue à `PixyHidProbe.exe`, à placer dans le même dossier). Le readback groupe 01 n'est pas un écho du SET (03 = non-privacy) : le succès repose sur l'acceptation de l'écriture.

En mode `serve` (bridge NDJSON pour le plugin), la position de démarrage est appliquée automatiquement dès le démarrage du processus. Couvre aussi `{"cmd":"mode","value":"privacy"}`.

Les mouvements sont signés : `pan 10` vs `pan -10`. Le sens positif/négatif par rapport au monde réel doit être confirmé par test visuel (Voir PROJECT_CONTEXT.md, statut non encore établi avec mouvement observable).

## Tests effectués

- `info` / `get` : S_OK, valeurs conformes au diagnostic.
- `pan 5` puis `pan -5` : retour à la position initiale (PASS).
- `pan/tilt/zoom` positifs : positions persistées et lues.
- `center` : retour de Pan=30/Tilt=20/Zoom=105 vers 0/0/100 (PASS).
- `preset-save` / `preset-load` : enregistrement puis rappel exact (PASS, test réversible).
- `preset-set-start` + start automatique au `serve` : caméra replacée avant la première réponse (PASS).
- `preset-list` / `preset-delete` : listage et suppression sans caméra (PASS).
- `mode privacy` / `mode tracking` / `mode standard` : écriture HID acceptée, readbacks 02/01/00 (PASS, caméra restaurée Standard).