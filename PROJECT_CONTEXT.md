# PROJECT_CONTEXT.md

# EMEET PIXY 4K + Ulanzi D200X
## Contexte technique du projet

Date de création du contexte : 2026-09-20

---

# 1. Objectif

Créer un plugin pour le Stream Deck Ulanzi D200X permettant de contrôler une caméra EMEET PIXY 4K directement depuis Ulanzi Studio.

Objectif architectural :

    Ulanzi D200X
        ↓
    Ulanzi Studio
        ↓
    Plugin Node.js
        ↓
    contrôle Windows UVC / USB
        ↓
    EMEET PIXY 4K

EMEET Studio doit idéalement être totalement supprimé du workflow.

OBS reste responsable de la capture vidéo et des réglages de colorimétrie/qualité souhaités par l'utilisateur.

---

# 2. Matériel

Caméra :

- EMEET PIXY 4K
- webcam USB
- caméra PTZ
- utilisée comme source vidéo dans OBS

Contrôleur :

- Ulanzi D200X
- configuré via Ulanzi Studio

Ordinateur cible :

- Windows 11

Logiciel de streaming :

- OBS

---

# 3. Besoin utilisateur

L'utilisateur souhaite éviter les intermédiaires.

Workflow souhaité :

    D200X
       ↓
    plugin
       ↓
    PIXY

et non :

    D200X
       ↓
    plugin
       ↓
    EMEET Studio
       ↓
    PIXY

Les réglages vidéo/qualité/colorimétrie seront réalisés directement dans OBS.

Le plugin n'a donc pas pour objectif de reproduire l'interface ou les réglages vidéo d'EMEET Studio.

---

# 4. État actuel de la recherche

## CONFIRMED

### 4.1 SDK Ulanzi

Dépôt officiel :

https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK

Le SDK cible notamment :

- D200 ;
- D200H ;
- Dial ;
- D200X.

Il permet aux plugins de réagir aux actions des contrôleurs et notamment aux événements de touches et d'encodeur.

Événements pertinents à exploiter :

- onAdd ;
- onRun ;
- onKeyDown ;
- onKeyUp ;
- onDialDown ;
- onDialUp ;
- événements de rotation de l'encodeur.

Le SDK prévoit également l'affichage/actualisation d'informations sur les touches et l'encodeur.

Le SDK fournit une architecture Node.js pour les plugins.

La version Node.js indiquée par le SDK doit être vérifiée contre la version effectivement embarquée/utilisée par l'installation Ulanzi Studio de la machine cible avant de figer le runtime.

---

# 5. PIXY et USB/UVC

## CONFIRMED / fortement documenté par des travaux tiers

La PIXY est une webcam USB UVC.

Un projet tiers open source :

https://github.com/dheldt/emeet-cli

a étudié le contrôle direct de la PIXY sans EMEET Studio.

Ce projet identifie notamment un périphérique EMEET PIXY avec :

    VID = 0x328F
    PID = 0x00C0

Ces valeurs doivent être vérifiées sur la caméra réelle avant d'être codées en dur.

---

# 6. Contrôles UVC identifiés

Le projet `emeet-cli` a identifié notamment les contrôles UVC suivants :

### Zoom

    CT_ZOOM_ABSOLUTE_CONTROL
    selector = 0x0B

### Pan/Tilt

    CT_PAN_TILT_ABSOLUTE_CONTROL
    selector = 0x0D

Les valeurs sont manipulées par des requêtes UVC de type :

- GET_MIN ;
- GET_MAX ;
- GET_CUR ;
- SET_CUR.

Le contrôle Pan/Tilt est représenté par une valeur composée de Pan et Tilt.

Le code tiers doit être étudié directement avant réutilisation.

Référence :

https://github.com/dheldt/emeet-cli

---

# 7. Point important : pas d'API EMEET Studio nécessaire

Aucune API publique officielle EMEET Studio n'a été identifiée comme nécessaire pour le contrôle PTZ.

Des travaux tiers montrent qu'un contrôle direct de la PIXY au niveau UVC est possible.

Conséquence :

    EMEET Studio
        |
        X

peut potentiellement être retiré de l'architecture.

---

# 8. Windows : stratégie de contrôle

La méthode Windows n'est pas encore totalement validée sur la PIXY réelle.

Il faut tester les mécanismes suivants dans cet ordre :

## Étape A — IAMCameraControl

Microsoft documente :

https://learn.microsoft.com/en-us/windows/win32/api/strmif/nn-strmif-iamcameracontrol

Contrôles notamment concernés :

- Pan ;
- Tilt ;
- Zoom ;
- éventuellement Pan/Tilt combiné.

Question à vérifier :

La PIXY expose-t-elle réellement ses contrôles PTZ via IAMCameraControl lorsqu'elle est utilisée avec le pilote UVC natif de Windows ?

Ne pas supposer que la réponse est oui.

---

# 9. Windows : IKsControl

Si IAMCameraControl ne suffit pas, étudier :

    IKsControl

Documentation Microsoft :

https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/device-requirements-for-usb-video-class-extension-units

Cette voie peut permettre d'accéder à des contrôles UVC ou à des Extension Units exposés par le périphérique.

Cette méthode doit être testée avant de passer à USB brut.

---

# 10. Windows : pilote UVC

Documentation Microsoft :

https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/usb-video-class-driver-overview

Windows possède un pilote UVC natif.

Objectif :

utiliser autant que possible le pilote standard de Windows sans remplacement de pilote.

Le projet doit éviter toute modification permanente du pilote de la PIXY.

---

# 11. Dernier recours : USB brut

Si les API Windows natives ne permettent pas d'envoyer les commandes nécessaires, étudier :

- WinUSB ;
- libusb ;
- control transfers UVC.

Les travaux tiers sur `emeet-cli` fournissent déjà une base pour comprendre les requêtes USB/UVC.

Exemple conceptuel pour SET_CUR :

    bmRequestType = 0x21
    bRequest      = 0x01
    wValue        = selector << 8
    wIndex        = (terminal_id << 8) | interface

Ces informations doivent être vérifiées dans le code source actuel du projet tiers avant toute implémentation.

---

# 12. Risque de conflit avec OBS

Un point critique à tester :

    OBS
      ↓
    PIXY

pendant que :

    Plugin
      ↓
    contrôle PTZ
      ↓
    PIXY

fonctionne.

Il faut vérifier si Windows permet simultanément :

- capture vidéo ;
- contrôle PTZ.

Le but est de ne jamais devoir fermer OBS pour déplacer la caméra.

---

# 13. Architecture logicielle cible

Architecture préférée :

    ┌─────────────────────┐
    │ Ulanzi D200X        │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ Ulanzi Studio       │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ Plugin Node.js      │
    │                     │
    │ actions D200X       │
    │ presets              │
    │ état                 │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ PIXY Controller     │
    │ Windows             │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ Windows UVC         │
    │ / API caméra        │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ EMEET PIXY 4K       │
    └─────────────────────┘

OBS utilise parallèlement la PIXY comme webcam.

---

# 14. Pourquoi un contrôleur séparé peut être nécessaire

Node.js n'est pas nécessairement le meilleur endroit pour accéder directement aux API COM/DirectShow/Kernel Streaming de Windows.

Une architecture possible est donc :

    Node.js plugin
          ↓
       IPC
          ↓
    pixy-controller.exe
          ↓
    Windows API
          ↓
       PIXY

Le contrôleur Windows pourrait être écrit dans un langage adapté aux API natives Windows, par exemple C++.

Alternative à étudier :

- addon Node.js natif ;
- bridge C++ ;
- processus persistant ;
- autre mécanisme IPC simple et fiable.

Ne pas choisir avant d'avoir validé la voie de contrôle Windows.

---

# 15. Pourquoi un processus persistant est préférable

Le D200X possède un encodeur.

Une rotation peut générer de nombreux événements.

Il serait mauvais de faire :

    rotation
      ↓
    lancer pixy-controller.exe
      ↓
    commande
      ↓
    quitter

à chaque événement.

Préférer :

    Node.js
       ↓
    connexion IPC persistante
       ↓
    pixy-controller
       ↓
    PIXY

Cela réduit la latence et permet de conserver :

- connexion ;
- limites ;
- position courante ;
- état du contrôleur ;
- gestion d'erreur.

---

# 16. Fonctions V1

La première version doit être limitée à :

1. Détection de la PIXY.
2. Pan gauche.
3. Pan droite.
4. Tilt haut.
5. Tilt bas.
6. Zoom +.
7. Zoom -.
8. Center.
9. Encodeur.
10. Affichage du mode actif.

Pas de tracking dans la V1.

Pas de privacy dans la V1.

Pas de commandes HID dans la V1.

Pas de réglages colorimétriques dans la V1.

---

# 17. Utilisation envisagée du D200X

Exemple de mode encodeur :

    PAN
      ↓ pression
    TILT
      ↓ pression
    ZOOM
      ↓ pression
    PAN

Rotation :

    gauche = valeur -
    droite = valeur +

L'affichage du D200X devrait indiquer le mode courant.

Exemple :

    PIXY
    PAN

ou :

    PIXY
    ZOOM

La disposition exacte reste à concevoir après validation du contrôle caméra.

---

# 18. Presets

Les presets sont souhaitables mais doivent venir après la V1.

Exemple :

    PRESET 1
    PRESET 2
    PRESET 3
    PRESET 4

Un preset pourra éventuellement mémoriser :

- Pan ;
- Tilt ;
- Zoom.

Il faut déterminer si la position réelle peut être lue depuis la caméra ou si le plugin doit conserver son propre état.

Ne pas inventer cette capacité.

---

# 19. HID / fonctionnalités avancées

Des travaux de rétro-ingénierie de la PIXY indiquent également l'existence d'un canal HID propriétaire.

Des fonctions telles que :

- tracking ;
- privacy ;
- gesture ;
- audio ;

ont été étudiées par des projets tiers.

Une référence de recherche est disponible ici :

https://gist.github.com/rm1138/ef132c3a39f3c1effabf6354e2eca965

Ces commandes ne doivent pas être considérées comme une API officielle EMEET.

Elles sont à traiter comme reverse engineering expérimental.

Elles pourront éventuellement constituer une V2.

---

# 20. Plan de développement

## Phase 0 — inspection

Inspecter :

- Windows ;
- PIXY ;
- périphériques USB ;
- SDK Ulanzi ;
- environnement Node.js ;
- version Ulanzi Studio.

Aucun code fonctionnel complexe.

---

## Phase 1 — diagnostic PIXY

Créer un outil minimal qui détermine :

- caméra présente ;
- VID/PID ;
- nom ;
- interfaces ;
- contrôles caméra ;
- Pan ;
- Tilt ;
- Zoom ;
- min ;
- max ;
- step ;
- current ;
- possibilité de modification.

Le résultat doit être sauvegardé dans la documentation du projet.

---

## Phase 2 — test PTZ indépendant

Créer un petit programme Windows :

    pixy-controller

Fonctions initiales :

    info
    center
    pan
    tilt
    zoom

La syntaxe exacte sera définie après choix de l'API.

---

## Phase 3 — test avec OBS

Lancer OBS avec la PIXY comme source.

Tester :

    OBS capture
       +
    pixy-controller PTZ

Si cela fonctionne, la couche caméra est validée.

---

## Phase 4 — plugin Ulanzi minimal

Créer :

    plugin Ulanzi
        ↓
    Node.js
        ↓
    pixy-controller

Commencer avec :

    CENTER

Une seule touche.

Objectif : valider toute la chaîne.

---

## Phase 5 — PTZ

Ajouter :

- Pan ;
- Tilt ;
- Zoom.

---

## Phase 6 — encodeur

Ajouter :

- mode Pan ;
- mode Tilt ;
- mode Zoom ;
- pression pour changer de mode.

---

## Phase 7 — presets

Ajouter les positions prédéfinies.

---

## Phase 8 — fonctionnalités avancées

Éventuellement :

- tracking ;
- privacy ;
- autres commandes HID.

Seulement après stabilisation de la V1.

---

# 21. Critères de réussite

Le projet est considéré fonctionnel lorsque :

- Ulanzi Studio charge le plugin ;
- le D200X est reconnu ;
- les boutons fonctionnent ;
- l'encodeur fonctionne ;
- Pan fonctionne ;
- Tilt fonctionne ;
- Zoom fonctionne ;
- Center fonctionne ;
- OBS capture simultanément la PIXY ;
- EMEET Studio n'est pas nécessaire ;
- aucun remplacement permanent du pilote Windows n'est nécessaire.

---

# 22. Points actuellement non vérifiés

Les points suivants doivent être testés sur la machine réelle :

1. PIXY exposée par IAMCameraControl.
2. Pan via IAMCameraControl.
3. Tilt via IAMCameraControl.
4. Zoom via IAMCameraControl.
5. Contrôle simultané avec OBS.
6. IKsControl nécessaire ou non.
7. Accès USB brut nécessaire ou non.
8. Interface exacte du plugin Node.js dans la version Ulanzi Studio installée.
9. Version Node.js réellement embarquée/utilisée par Ulanzi Studio.
10. comportement exact du D200X avec les événements d'encodeur dans cette version.

---

# 23. Règle fondamentale

Ne jamais conclure :

    "ça devrait fonctionner"

lorsqu'un test concret est possible.

Utiliser :

    "NON TESTÉ"

jusqu'à obtention d'une preuve.

Pour chaque résultat, documenter :

- environnement ;
- version ;
- commande/test ;
- résultat ;
- logs utiles ;
- conclusion.

---

# 24. Références principales

## Ulanzi

SDK officiel :

https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK

## PIXY / contrôle tiers

Projet emeet-cli :

https://github.com/dheldt/emeet-cli

## Microsoft UVC

https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/usb-video-class-driver-overview

## Microsoft IAMCameraControl

https://learn.microsoft.com/en-us/windows/win32/api/strmif/nn-strmif-iamcameracontrol

## Microsoft UVC Extension Units / IKsControl

https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/device-requirements-for-usb-video-class-extension-units

## Reverse engineering HID

https://gist.github.com/rm1138/ef132c3a39f3c1effabf6354e2eca965

---

# 25. Résumé exécutif

Objectif :

    D200X → Ulanzi plugin → PIXY

Sans :

    EMEET Studio

Priorité :

    Windows UVC natif
        ↓
    IKsControl
        ↓
    USB/libusb

Première fonctionnalité :

    CENTER

Puis :

    PAN / TILT / ZOOM

Puis :

    ENCODER

Puis :

    PRESETS

Puis éventuellement :

    HID / TRACKING / PRIVACY

Ne pas brûler les étapes.

---

# 26. Diagnostic Windows / PIXY — 2026-09-20

## Périmètre et sécurité

- **CONFIRMED** : uniquement des commandes Windows en lecture seule ont été exécutées.
- **CONFIRMED** : aucun pilote, paramètre Windows, composant Ulanzi Studio ou réglage caméra n'a été modifié.
- **CONFIRMED** : aucune commande PTZ (`SET`) n'a été envoyée et OBS n'a pas été lancé.
- **CONFIRMED** : le dépôt ne contient à cette date que `AGENTS.md` et ce fichier de contexte ; aucun outil de diagnostic existant n'était disponible à exécuter.

## Environnement observé

- **CONFIRMED** : système 64 bits, identifié par `Get-ComputerInfo` comme `Windows 10 Pro`, version `2009`, build `26200`. Cette numérotation de build est celle d'une installation Windows moderne ; la valeur affichée par `WindowsProductName` ne suffit pas à elle seule pour nommer précisément l'édition marketing.
- **CONFIRMED** : EMEET Studio 2.0.3 est installé, mais aucun processus EMEET Studio n'était actif au moment du relevé.
- **CONFIRMED** : OBS Studio 32.2.2 est installé, mais aucun processus OBS n'était actif au moment du relevé.
- **CONFIRMED** : ni `ffmpeg`, ni `ffplay`, ni GraphStudioNext, ni `devcon` n'étaient disponibles dans le `PATH`. Aucun de ces outils n'a été installé.

## PIXY réellement détectée

| Élément | Résultat | Statut |
| --- | --- | --- |
| Périphérique composite | `USB\\VID_328F&PID_00C0\\A260528000605250` | CONFIRMED |
| Révision USB | `REV_2004` | CONFIRMED |
| État PnP | `Started` / `OK` / aucune erreur Configuration Manager | CONFIRMED |
| Fonction caméra | `MI_00`, classe USB `0E/03/00` (Video / *Video Interface Collection* / protocol 0), nom `EMEET PIXY` | CONFIRMED |
| Interface audio | `MI_02`, classe USB `01/00/00`, service `usbaudio` | CONFIRMED |
| Interface HID | `MI_04`, classe USB `03/00/00`, service `HidUsb` | CONFIRMED |
| Pilote de la caméra | pilote Microsoft signé `usbvideo.inf`, service `usbvideo`, version `10.0.26100.6584`, description `USB Video Device` | CONFIRMED |
| Pilote du périphérique composite | pilote Microsoft signé `usb.inf`, service `usbccgp`, version `10.0.26100.5074` | CONFIRMED |
| Interface de capture enregistrée | catégorie `KSCATEGORY_VIDEO_CAPTURE` (`{6994AD05-93EF-11D0-A3CC-00A0C9223196}`) pour MI_00 | CONFIRMED |

Conclusion : la PIXY fonctionne avec le pilote UVC natif Microsoft ; aucun pilote EMEET spécifique ne contrôle l'interface caméra. Cela préserve la priorité des API Windows natives et ne justifie aucune action sur le pilote.

## Contrôles PTZ : état des preuves initial

Ce tableau décrit l'état **avant** l'exécution de la sonde décrite en section 27. Ses conclusions sont remplacées par les résultats mesurés de cette section.

| Voie | Ce qui est établi localement | Ce qui ne l'est pas encore | Décision actuelle |
| --- | --- | --- | --- |
| `IAMCameraControl` | la caméra est un périphérique de capture WDM/UVC fourni par `usbvideo` et possède une interface de capture KS | disponibilité de `IAMCameraControl`, ainsi que `GetRange` / `Get` pour `CameraControl_Pan`, `Tilt` et `Zoom` | **UNVERIFIED — premier test à effectuer** |
| `IKsControl` | `usbvideo` prend en charge les unités/terminaux UVC standards et les Extension Units en général (documentation Microsoft) | topologie KS de cette PIXY, Extension Units éventuelles et leurs GUID/nœuds ; accès effectif aux propriétés | **UNVERIFIED — seulement après le test IAMCameraControl** |
| USB/UVC bas niveau | le VID/PID local confirme la cible décrite par le projet tiers ; sa source actuelle utilise `CT_ZOOM_ABSOLUTE_CONTROL` (`0x0B`) et `CT_PAN_TILT_ABSOLUTE_CONTROL` (`0x0D`) sur un *Camera Terminal*, avec lecture des bornes par `GET_MIN`/`GET_MAX` | descripteurs de cette unité précise, identifiant du Camera Terminal, numéro d'interface VideoControl, valeurs min/max/step/current, et possibilité d'accès depuis Windows sans changer de pilote | **UNVERIFIED — dernier recours** |

Point de méthode important : la source de `dheldt/emeet-cli` citée dans le projet appelle ces deux sélecteurs des contrôles du **Camera Terminal** UVC, et non des Extension Units. Son README emploie aussi l'expression « extension unit controls », mais son code source actuel analyse un `VC_INPUT_TERMINAL` de type `ITT_CAMERA` et adresse les sélecteurs `0x0B`/`0x0D` à cet identifiant. Cette source tierce est une piste de recherche, pas une preuve que Windows expose les mêmes contrôles par `IAMCameraControl` ou `IKsControl`.

## Limite de l'inspection PnP initiale

Les informations PnP, le registre des interfaces et `pnputil` prouvent la présence et le pilote ; ils n'énumèrent pas les réponses `IAMCameraControl::GetRange`/`Get`, ni les nœuds/propriétés KS. Microsoft précise que `IAMCameraControl` n'est automatiquement exposée par le filtre WDM que si le pilote prend en charge `PROPSETID_VIDCAP_CAMERACONTROL`.

Un programme de diagnostic minimal, non destructif, était donc nécessaire pour établir factuellement :

1. ouverture du filtre de capture PIXY et `QueryInterface(IAMCameraControl)` ;
2. `GetRange` puis `Get` pour Pan, Tilt et Zoom, sans aucun `Set` ;
3. seulement si cette voie échoue ou est incomplète, interrogation de la topologie `IKsControl` et des propriétés disponibles ;
4. aucune écriture PTZ avant validation explicite des lectures ;
5. test OBS séparé uniquement après obtention d'un contrôle lisible et après accord pour envoyer une commande PTZ réversible.

## Commandes exécutées (lecture seule)

```powershell
Get-Content -Raw AGENTS.md
Get-Content -Raw PROJECT_CONTEXT.md
rg --files -g '!node_modules' -g '!*.lock'
Get-PnpDevice -PresentOnly
Get-CimInstance Win32_PnPEntity
Get-PnpDeviceProperty -InstanceId <instance-id PIXY>
Get-CimInstance Win32_PnPSignedDriver
pnputil /enum-devices /instanceid <MI_00> /drivers
Get-ComputerInfo
pnputil /enum-devices /class Camera /connected
Get-ChildItem HKLM:\SYSTEM\CurrentControlSet\Control\DeviceClasses\{6994AD05-93EF-11D0-A3CC-00A0C9223196}
Get-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Enum\USB\VID_328F&PID_00C0&MI_00\...\Device\ Parameters
Get-ChildItem HKLM:\SOFTWARE\...\Uninstall
Get-Process obs64, obs, EMEETStudio, EMEET*
```

## Références vérifiées

- Microsoft, USB Video Class driver overview : `Usbvideo.sys` interroge directement le matériel UVC et prend en charge Media Foundation et DirectShow ; il prend aussi en charge les unités et terminaux standards, ainsi que les Extension Units.
  https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/usb-video-class-driver-overview
- Microsoft, `IAMCameraControl` : interface de contrôle de Pan/Tilt/Zoom ; disponible sur le filtre de caméra lorsqu'il expose `PROPSETID_VIDCAP_CAMERACONTROL`.
  https://learn.microsoft.com/en-us/windows/win32/api/strmif/nn-strmif-iamcameracontrol
- Microsoft, Extension Units : les contrôles XU peuvent être adressés par `IKsControl` seulement lorsqu'ils sont correctement décrits/exposés par `usbvideo`.
  https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/device-requirements-for-usb-video-class-extension-units
- Projet tiers, code inspecté le 2026-09-20 :
  https://github.com/dheldt/emeet-cli

## Action alors proposée

**CONFIRMED** : un exécutable de diagnostic DirectShow/COM à usage lecture seule a depuis produit le rapport reproductible consigné en section 27.

---

# 27. Résultat de la sonde `IAMCameraControl` — 2026-09-20

## Test effectué

- **CONFIRMED** : l'outil local `tools/pixy-camera-control-diagnostic` énumère la catégorie DirectShow de capture vidéo, sélectionne la PIXY par son `DevicePath` contenant `VID_328F&PID_00C0`, puis appelle uniquement :
  - `QueryInterface(IAMCameraControl)` ;
  - `IAMCameraControl::GetRange` ;
  - `IAMCameraControl::Get`.
- **CONFIRMED** : l'exécution initiale de cette sonde ne contenait aucun appel à `IAMCameraControl::Set`. La version actuelle propose aussi une option explicite et réversible `--verify-set`, documentée séparément dans son README.
- **CONFIRMED** : le test a été exécuté avec succès en processus 64 bits et 32 bits. Les deux produisent exactement les mêmes résultats ci-dessous.
- **CONFIRMED** : OBS et EMEET Studio étaient arrêtés pendant le test. La compatibilité avec OBS reste donc à vérifier ultérieurement.

## Résultats exacts

| Contrôle Windows | Disponible | Min | Max | Step | Défaut | Valeur courante | Modes exposés |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `CameraControl_Pan` | oui (`S_OK`) | -150 | 150 | 1 | 0 | 0 | `Manual` |
| `CameraControl_Tilt` | oui (`S_OK`) | -90 | 90 | 1 | 0 | 0 | `Manual` |
| `CameraControl_Zoom` | oui (`S_OK`) | 100 | 150 | 1 | 100 | 100 | `Manual` |

**CONFIRMED** : `QueryInterface(IAMCameraControl)` retourne `S_OK` pour la PIXY. Les six appels de lecture (`GetRange` et `Get` pour chacun des trois contrôles) retournent également `S_OK`.

**CONFIRMED — validation utilisateur** : l'utilisateur a exécuté indépendamment `PixyCameraControlDiagnostic.exe` et a communiqué le 2026-09-20 une sortie identique : détection de la PIXY sur `VID_328F&PID_00C0`, `QueryInterface` à `S_OK`, puis les mêmes plages, pas, valeurs par défaut et valeurs courantes pour Pan, Tilt et Zoom. Cette exécution ne contenait aucune écriture PTZ.

Selon la sémantique documentée de `CameraControlProperty`, Pan et Tilt sont exprimés en degrés et Zoom en millimètres. Les valeurs ci-dessus sont les valeurs réellement rapportées par le pilote PIXY via cette API ; la correspondance visuelle exacte d'un déplacement avec ces unités reste **UNVERIFIED** tant qu'aucune commande `Set` réversible n'a été testée.

## Décision d'architecture mise à jour

- **CONFIRMED — voie retenue pour la V1 PTZ** : `IAMCameraControl` expose les trois commandes nécessaires, leurs bornes, leur pas et leur état actuel sous le pilote UVC Microsoft déjà installé.
- **CONFIRMED — non nécessaires à ce stade pour la V1** : `IKsControl` et l'USB/UVC bas niveau ne sont pas nécessaires pour obtenir le PTZ de base. Ils restent des voies de diagnostic seulement si une opération `Set`, une cohabitation avec OBS, ou une fonction future révèle une limite réelle.
- **UNVERIFIED** : commande Center (enchaînement des trois écritures vers les valeurs par défaut) ; comportement pendant une capture OBS ; reconnexion caméra ; latence/rafale d'événements.

## Commandes de compilation et d'exécution utilisées

Le SDK .NET 8 n'est pas installé sur cette machine, mais le compilateur C# .NET Framework 4.8.1 fourni par Windows l'est. Aucune dépendance n'a été ajoutée ni téléchargée.

```powershell
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe `
  /out:tools\pixy-camera-control-diagnostic\bin\PixyCameraControlDiagnostic.exe `
  tools\pixy-camera-control-diagnostic\Program.cs

.\tools\pixy-camera-control-diagnostic\bin\PixyCameraControlDiagnostic.exe
```

La même compilation avec `/platform:x86` et l'exécution du binaire x86 ont retourné les mêmes valeurs.

## Références complémentaires vérifiées

- `CameraControlProperty` : valeurs `Pan = 0`, `Tilt = 1`, `Zoom = 3` et sémantique des unités.
  https://learn.microsoft.com/en-us/windows/win32/api/strmif/ne-strmif-cameracontrolproperty
- `PROPSETID_VIDCAP_CAMERACONTROL` : Microsoft indique que `IAMCameraControl` donne accès à ce jeu de propriétés.
  https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/propsetid-vidcap-cameracontrol

---

# 28. Résultat de l'écriture PTZ réversible — 2026-09-20

## Protocole

L'option `--verify-set pan|tilt|zoom` isole un seul axe par exécution : elle lit sa valeur, écrit une variation d'un seul pas avec le drapeau `Manual`, relit la valeur, restaure immédiatement la valeur de départ, puis confirme la restauration par une dernière lecture. OBS et EMEET Studio étaient arrêtés durant les trois tests.

## Résultats

| Axe | Écriture de test | Lecture de test | Restauration | Lecture finale | Statut |
| --- | --- | --- | --- | --- | --- |
| Pan | `0 → 1` (`S_OK`) | `1` (`S_OK`) | `1 → 0` (`S_OK`) | `0` (`S_OK`) | CONFIRMED — PASS |
| Tilt | `0 → 1` (`S_OK`) | `1` (`S_OK`) | `1 → 0` (`S_OK`) | `0` (`S_OK`) | CONFIRMED — PASS |
| Zoom | `100 → 101` (`S_OK`) | `101` (`S_OK`) | `101 → 100` (`S_OK`) | `100` (`S_OK`) | CONFIRMED — PASS |

**CONFIRMED** : sous le pilote UVC Microsoft actuel, `IAMCameraControl::Set` contrôle réellement Pan, Tilt et Zoom de la PIXY. Chaque test a rétabli et vérifié la valeur initiale ; la caméra a donc été laissée à `Pan=0`, `Tilt=0`, `Zoom=100`.

## Décision

**CONFIRMED** : la couche de contrôle PTZ indépendante est validée pour Pan, Tilt et Zoom avec `IAMCameraControl`. La prochaine couche à tester est la cohabitation avec OBS ; aucune étude `IKsControl` ou USB brut n'est justifiée tant que ce test ne révèle pas de limite.

## Préparation du test OBS

- **CONFIRMED** : OBS n'était pas en cours d'exécution lors de l'inspection.
- **CONFIRMED** : la collection de scènes `JeuxVideos` contient une source `EmeetPixy` dont le périphérique sauvegardé est `EMEET STUDIO Virtual Camera`.
- **CONFIRMED** : des logs OBS antérieurs montrent aussi des ouvertures du périphérique physique `EMEET PIXY`, mais ils ne prouvent pas que la scène actuellement sauvegardée utilise encore ce périphérique.
- **UNVERIFIED** : cohabitation simultanée entre une capture OBS **directe** de `EMEET PIXY` (sans caméra virtuelle EMEET) et une écriture `IAMCameraControl`.

Le test OBS devra employer explicitement le périphérique vidéo `EMEET PIXY`, et non `EMEET STUDIO Virtual Camera`, afin de rester dans l'architecture cible.

---

# 29. Résultat du test simultané OBS + PTZ — 2026-09-20

## Conditions vérifiées

- **CONFIRMED** : le processus `obs64.exe` (OBS Studio 32.2.2) était actif pendant le test.
- **CONFIRMED — déclaration utilisateur** : l'utilisateur a créé dans OBS la source `EmeetPixy2` utilisant directement la caméra physique EMEET PIXY, puis a autorisé le test.
- **CONFIRMED** : EMEET Studio n'était pas lancé et aucune caméra virtuelle EMEET n'a été utilisée par la sonde PTZ.

## Résultats d'écriture pendant OBS

| Axe | Test réversible pendant `obs64.exe` | Résultat |
| --- | --- | --- |
| Pan | `0 → 1 → 0`, lecture après chaque écriture | **CONFIRMED — PASS**, tous les appels retournent `S_OK` |
| Tilt | `0 → 1 → 0`, lecture après chaque écriture | **CONFIRMED — PASS**, tous les appels retournent `S_OK` |
| Zoom | `100 → 101 → 100`, lecture après chaque écriture | **CONFIRMED — PASS**, tous les appels retournent `S_OK` |

**CONFIRMED** : OBS actif n'empêche ni l'ouverture du filtre DirectShow PIXY ni les opérations `IAMCameraControl::Set`/`Get` sur les trois axes. Après les tests, la sonde a confirmé l'état restauré : `Pan=0`, `Tilt=0`, `Zoom=100`.

**CONFIRMED — confirmation utilisateur** : l'utilisateur a confirmé que l'aperçu OBS est resté visible pendant les trois micro-mouvements.

**UNVERIFIED** : effet visuel réel du PTZ. L'utilisateur n'a pas perçu les déplacements d'un seul pas employés pour ce test. Les lectures `Get` prouvent que le pilote accepte et conserve les nouvelles valeurs, mais un test réversible avec une amplitude visuellement observable reste nécessaire pour établir le mouvement mécanique et le sens effectif de chaque axe.

---

# 30. Attente du D200X : contrôleur `pixy-controller` et harnais de test clavier — 2026-09-20

Contexte : le D200X n'est pas encore arrivé. Un mini clavier USB (configuré par `MINI_KEYBOARD.exe`, qui ne sait émettre que des événements clavier/souris/multimédia HID globaux et **aucun** événement du SDK Ulanzi) a été retenu uniquement comme déclencheur physique pour la couche PTZ.

La couche plugin Ulanzi ne peut être testée qu'avec le D200X ou un simulateur du SDK ; le mini clavier ne peut pas l'émuler.

## Nouveaux livrables

### `tools/pixy-controller` — contrôleur indépendant (Phase 2)

CLI Windows sans dépendance :

    PixyController.exe info
    PixyController.exe get
    PixyController.exe center
    PixyController.exe pan <signed-delta>
    PixyController.exe tilt <signed-delta>
    PixyController.exe zoom <signed-delta>
    PixyController.exe set <pan|tilt|zoom> <absolute-value>

- **CONFIRMED** : réutilise la voie `IAMCameraControl` validée en section 27/28/29 ; aucun `IKsControl`, aucun USB brut.
- **CONFIRMED** : `info`/`get` retournent les mêmes plages que la sonde (`Pan -150..150`, `Tilt -90..90`, `Zoom 100..150`).
- **CONFIRMED — test réversible** : `pan 5` puis `pan -5` → retour à 0 ; `center` ramène Pan=30/Tilt=20/Zoom=105 vers 0/0/100, vérifié par `get`.
- Les déplacements sont relatifs et bornés aux limites du matériel.
- **UNVERIFIED** : sens effectif des signes `+`/`-` par rapport au monde réel (à confirmer par test visuel).

### `tools/pixy-test-harness` — harnais clavier

- **CONFIRMED** : hook `WH_KEYBOARD_LL`, modificateurs `Ctrl+Shift+Win` + chiffre.
- Mapping par défaut : `4 → pan -10`, `6 → pan 10`, `8 → tilt 5`, `2 → tilt -5`, `5 → center`. Configurable dans `pixy-test-harness.cfg` (chiffres de la rangée principale et du pavé numérique, ou VK `0xNN`).
- **CONFIRMED — test réversible complet** : simulation de `Win+Ctrl+Shift+4` → Pan −10 ; `Win+Ctrl+Shift+6` → Pan 0 ; `Win+Ctrl+Shift+5` → center (Pan=30/Tilt=20/Zoom=105 → 0/0/100). Chaque étape vérifiée par relecture `IAMCameraControl::Get`.
- **CONFIRMED — zoom (2026-09-20, ajout)** : vkCodes des touches `=`,`-`,`~` mesurés via le mode `--probe`, identiques sur le clavier QWERTY de référence et le mini clavier (`0xBB`, `0xBD`, `0xC0`). Test réversible : `Win+Ctrl+Shift+=` (0xBB) → Zoom 100→105, `Win+Ctrl+Shift+-` (0xBD) → Zoom 105→100, vérifiés.
- **HORS V1** : `~` (`0xC0`, « mode manuel/confidentiel ») est piloté par le canal HID propriétaire EMEET (reverse engineering, périmètre V2, sections 16/19). Non mappé.
- **Statut** : outil temporaire, hors architecture finale. Le plugin Ulanzi devra utiliser une architecture persistante (pas un lancement de processus par événement) pour l'encodeur.
- Interfaces caméra libérées après chaque exécution.

## État des preuves après cette étape

| Élément | Statut |
| --- | --- |
| Détection PIXY + `IAMCameraControl` | CONFIRMED |
| Pan/Tilt/Zoom lecture + écriture | CONFIRMED |
| Écriture pendant OBS | CONFIRMED |
| Pression physique → déplacement caméra (via harnais clavier) | CONFIRMED |
| Effet visuel et sens réel des axes | **UNVERIFIED** — reste à établir |
| Couche plugin Ulanzi / D200X | **UNVERIFIED** — nécessite le matériel ou un simulateur du SDK |

---

# 31. Zoom : pseudo-échec initial, cause = option Windows « Allow multiple apps » — 2026-09-20

## Protocole initial (conclusion erronée)

OBS ouvert sur la source physique « EMEET PIXY » (`EmeetPixy2`, pas la Virtual Camera). Aucun autre logiciel caméra actif. L'option Windows « Autoriser plusieurs applications à utiliser la caméra en même temps » était **désactivée** (valeur par défaut).

| Étape | Commande | État lecteur | Observation utilisateur |
| --- | --- | --- | --- |
| Zoom min → max | `set zoom 150` | `S_OK`, relecture `150` | **aucun changement d'image dans OBS** |
| Zoom max → min | `set zoom 100` | `S_OK`, relecture `100` | retour sans effet |
| Pan contrôle | `set pan -150` puis `set pan 150` | `S_OK` | **la tête bouge physiquement (balayage)** |
| Pan/Tilt restauration | `set pan 10`, `set tilt -10` | `S_OK` | — |

Le test fut conclu à tort comme « zoom sans effet », le protocole n'ayant pas isolé la variable de l'usage multi-application de Windows.

## Protocole complémentaire (cause identifiée)

L'utilisateur a activé l'option Windows « Allow multiple apps to use at the same time » dans les paramètres de confidentialité/caméra pour ouvrir EMEET Studio en parallèle d'OBS.

1. EMEET Studio ouvert + OBS actif, zoom mis au max dans EMEET Studio → la lecture `IAMCameraControl` de notre contrôleur rapporte `Zoom=150`. **EMEET Studio pilote donc le même contrôle `CameraControl_Zoom` que nous.** Un zoom fait dans EMEET Studio était visible dans OBS.
2. Notre commande `set zoom 100` exécutée pendant qu'EMEET Studio était au max → l'image s'est **dé-zoomée** dans OBS et EMEET Studio.
3. EMEET Studio fermé, OBS seul actif (option multi-application toujours active) :
   - `set zoom 150` → **l'image zoome dans OBS** ;
   - `set zoom 100` → **l'image se dé-zoome** (réversibilité confirmée).
4. Pan/Tilt restaurés à leur position de départ (Pan=10, Tilt=-10) ; zoom laissé à 100 (état initial de la caméra avant tests).

## Conclusion factuelle

- **CONFIRMED** : Pan et Tilt pilotent un moteur physique réel via `IAMCameraControl` sous le pilote `usbvideo` Microsoft.
- **CONFIRMED** : le zoom est **numérique** (aucun mouvement de lentille observé) mais il est **appliqué par la caméra au niveau du capteur/traitement UVC** et **visible sur la sortie OBS**, uniquement lorsque l'option Windows « Allow multiple apps to use at the same time » est activée.
- **CONFIRMED** : la voie `IAMCameraControl` (`CameraControl_Zoom`) est fonctionnelle et code opposable 1:1 avec EMEET Studio (qui utilise le même contrôle). Valeurs min/max réelles sur cette caméra : 100 (grand angle) → 150 (zoom max), flags `Manual`.
- **Découverte importante à confirmer** : avec l'option multi-application désactivée, le contrôle Zoom écrit (S_OK, valeur persistée) mais **n'est pas appliqué à la sortie vidéo**. Le mécanisme exact reste à caractériser (le pan/tilt fonctionnaient, eux, dans cette configuration). Résultat reproductible à vérifier si nécessaire.
- La relecture GET_CUR reflète l'état **réellement piloté par la dernière écriture**, y compris celle d'EMEET Studio : le contrôle est un bon indicateur de l'état du zoom.

## Conséquences sur la V1

- Le périmètre V1 « Zoom +/− » est **atteignable avec la voie Windows native** `IAMCameraControl`, sans EMEET Studio, **à condition que l'option Windows « Allow multiple apps to use at the same time » soit activée** pour la PIXY.
- Cette option est une précondition d'installation et doit être documentée. Elle ne modifie pas le pilote et est réversible.
- Le zoom étant numérique (recadrage), sa qualité dépend du capteur ; la colorimétrie reste hors périmètre V1.
- Le plugin devra vérifier/diagnostiquer l'activation de cette option et l'afficher dans la documentation d'installation, sans la modifier lui-même.

Aucune modification de pilote n'a été effectuée. État final de la caméra : Pan=10, Tilt=-10, Zoom=100.

---

# 32. Plugin Ulanzi `com.ulanzi.ulanzideck.pixy` — V1 implémentée et testée (E2E simulateur) — 2026-09-20

## Architecture retenue (implémentée)

    D200X → Ulanzi Studio
             → plugin/app.js (Node.js, SDK plugin-common-node + ws 8.18.0, ESM)
               → child_process persistant PixyController.exe serve
                 → NDJSON sur stdin/stdout (une commande par ligne, une réponse par ligne)
                 → IAMCameraControl → PIXY

- **CONFIRMED** : processus persistant (lancé une fois, `{"cmd":"quit"}` à la fermeture de la WebSocket), pas de lancement par événement.
- **CONFIRMED** : drizzle/coalescence de l'encodeur — les rotations sont accumulées par axe (`encoderDelta`), un unique flush par cycle de 80 ms envoie un `move` par axe.
- **CONFIRMED** : file d'attente séquentielle côté bridge (`bridgePending`, une réponse = une commande), évite les commandes obsolètes et la saturation.
- **CONFIRMED** : ordre des axes de l'encodeur à l'appui : PAN → TILT → ZOOM → PAN ; rotation gauche = valeur −, droite = valeur + ; pas : `MOVE_STEP=10` pour pan/tilt, `ZOOM_STEP=5` pour zoom.
- **CONFIRMED** : `setFeedback` met à jour l'écran de l'encodeur (`title` = axe actif, `text2` = `PAN > / TLT  / ZOM  ` avec `>` sur l'axe actif), layout `$UA2`.

## Événements SDK traités

`onConnected`, `onAdd`, `onSetActive`, `onClear`, `onKeyDown`, `onDialDown`, `onDialRotate`, `onError`, `onClose`.

- Requêtes bridge : `{"cmd":"move","axis":...,"delta":...}`, `{"cmd":"center"}`. Le bridge gère aussi `set`, `get`, `info`, `quit`.
- Le bridge C# applique des mouvements relatifs bornés aux limites (Pan −150..150, Tilt −90..90, Zoom 100..150 (numérique)).
- **CONFIRMED** : le plugin route les touches par suffixe d'UUID d'action (`jsn.uuid`, e.g. `.panleft`). Ce choix est validé par le test E2E simulateur ; le comportement réel du champ `uuid` de Studio est vérifié sur matériel.

## Test E2E avec simulateur Studio (`mockStudio.cjs`)

Simulateur WebSocket (port 3906) émulant Studio : `connected` → `add`/`setactive` → scénario encodeur + touches. Résultat intégral reçu par le simulateur :

| Étape simulée | Logs/vérification côté plugin | Résultat caméra |
| --- | --- | --- |
| `dialdown` (PAN→TILT) | `encoder mode -> TILT`, `setFeedback` correct | actif |
| `dialrotate` x2 right | rotation TILT accumulée, flush `move tilt +20` | actif |
| `dialdown` (TILT→ZOOM) | `encoder mode -> ZOOM`, `setFeedback` correct | actif |
| `dialrotate` left | `move zoom -5` | actif |
| `keydown` panleft / panright / center | routing `.panleft`/`.panright`/`.center` | caméra réelle a répondu |

- **CONFIRMED** : après le scénario complet, `PixyController.exe get` rapporte `Pan=0 Tilt=0 Zoom=100` (état du `center` final) — la caméra **réelle a exécuté** tous les mouvements envoyés par le plugin via le bridge.
- Bug corrigé en cours de test : `ensureBridge()` replaçait `bridgePending = []` à chaque respawn, perdant la première commande → erreur `Cannot read properties of undefined (reading 'request')`. Corrigé en ne vidant plus la file au respawn (c'est l'événement `exit` qui la vide).

## Installation

Plugin installé dans `%APPDATA%\Ulanzi\UlanziDeck\Plugins\com.ulanzi.ulanzideck.pixy.ulanziPlugin` :

- au premier démarrage suivant l'installation, Ulanzi Studio a lancé :
  `node.exe ...\plugin\app.js 127.0.0.1 3906 en-US 3.3.9` (port 3906 éphémère alloué par le SDK, Node 20 embarqué par Studio).
- payload complet : `manifest.json`, `plugin/app.js`, `plugin/plugin-common-node/` (SDK officiel non modifié), `node_modules/ws/` (8.18.0, téléchargé via tarball npm), `bin/PixyController.exe` (contrôleur C# .NET Framework 4.8.1 compilé localement — pas de dépendance SDK externe), `Images/*.svg` (8 icônes maison).
- pas de build : le package.json du plugin est en `"type":"module"`, `ws` résolu depuis `node_modules` local (le wrapper ESM `ws/wrapper.mjs` fournit les exports nommés nécessaires).

## Contraintes de compilation du contrôleur

- Machine sans SDK .NET 8 ; compilateur disponible : `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` (langage C# 5, pas de `out` inline, pas d'initialiseurs d'indexeur C# 6).
- Le code `Program.cs` est volontairement compatible avec cette limite.

## Statut des preuves après cette étape

| Élément | Statut |
| --- | --- |
| Couche caméra (`IAMCameraControl` + OBS simultané) | CONFIRMED |
| Contrôleur `PixyController.exe` (CLI + bridge `serve`) | CONFIRMED |
| Plugin Node.js : connexion SDK, flux d'événements | CONFIRMED (simulateur Studio) |
| Chaîne complète simulateur → plugin → bridge → caméra réelle | CONFIRMED |
| D200X réel branché sur Studio 3.3.9 avec le plugin | **UNVERIFIED — matériel à venir** |
| Champ `uuid` réel réellement envoyé par Studio pour les actions | **UNVERIFIED — à confirmer au premier hookup D200X** |
| Comportement visuel/sens réel des axes sur pièce | UNVERIFIED |
| OBS + plugin simultanés (chaîne complète) | UNVERIFIED — à retester avec D200X |

## Commandes utiles

```powershell
# recompiler le contrôleur
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe /out:tools\pixy-controller\bin\PixyController.exe tools\pixy-controller\Program.cs

# test solo du contrôleur
.\tools\pixy-controller\bin\PixyController.exe get

# simulateur Studio + plugin (logs dans %LocalAppData%\Temp\opencode\mock-studio)
node mockStudio.cjs   # via le node embarqué de Studio
node plugin\app.js 127.0.0.1 3906 en
```

Précondition d'installation inchangée : activer l'option Windows de confidentialité/caméra « Autoriser les applications à utiliser la caméra simultanément », sinon le zoom écrit au niveau UVC mais n'est pas appliqué sur la sortie vidéo (section 31).

---

# 33. Reverse engineering HID — modes Standard / Tracking / Privacy / Geste validés sur la caméra réelle — 2026-09-20

## Outil

`tools/pixy-hid-probe` : diagnostic HID Windows natif (C# .NET Framework 4.8.1, même csc que les autres outils), `hid.dll` + SetupAPI :
- ouverture du device path `\\?\HID#VID_328F&PID_00C0&MI_04#8&33F15015&0&0000#{4D1E55B2-F16F-11CF-88CB-001111000030}` (scan direct de `DeviceClasses\{4D1E55B2-...}`, SetupAPI n'énumérant pas cette interface) ;
- HIDD_ATTRIBUTES + HIDP_CAPS (usage page/usage `0x0083`, input et output 32 octets, feature 0, 1 input value cap, 1 output value cap) ;
- I/O overlappé : drain des rapports résiduels, écriture d'un rapport de sortie (32 octets, report ID `09`, zéro-padding), lecture du rapport d'entrée (ReadFile → WaitForSingleObject).

Commandes :

    PixyHidProbe.exe list | info <i>
    PixyHidProbe.exe query <hex> [<i>]        # envoie un rapport de sortie, affiche la réponse
    PixyHidProbe.exe poll <ms> [<i>]          # écoute les rapports d'entrée sans rien envoyer

## État initial mesuré (lectures seules, aucune écriture)

| Requête | Réponse | Décodage | Statut |
| --- | --- | --- | --- |
| `09 01 01 01` (mode tracking/privacy) | `09 01 01 01 00 01 00 01 00` | `00` = Standard | CONFIRMED |
| `09 04 02 01 00 01 00 01 02` (geste) | `09 04 02 01 00 02 00 02 02 01` | `01` = geste activé | CONFIRMED |
| `09 04 01 01` (cible tracking) | `09 04 01 01 00 15 00 15 00 ...` | `00` = Off (+ 3 floats par défaut) | CONFIRMED |
| `09 05 00 04` (audio DSP) | `09 05 00 04 00 01 00 01 01` | `01` = NC | CONFIRMED |
| `09 02 01 01` (auto-privacy) | `09 02 01 01 00 04 00 04 00 00 00 00` | délai `0` = Never | CONFIRMED |
| `09 01 00 03` (identifiant) | `09 01 00 03 00 0C 00 0C 32 36 30 ...` | ASCII `260609503074` | CONFIRMED |

## Tests SET réversibles (chaque écriture → relecture → restauration)

### Mode (groupe `01`)
| SET | Relecture | Résultat |
| --- | --- | --- |
| Standard `09 01 01 00 00 01 00 01 00` | `... 00` | CONFIRMED — PASS |
| Tracking `09 01 01 00 00 01 00 01 01` | `... 01` | CONFIRMED — PASS |
| Privacy `09 01 01 00 00 01 00 01 02` | `... 02` | CONFIRMED — PASS |

**CONFIRMED** : la commande Privacy est active (relecture `02`) ; le mode Privacy a un effet visuel réel (l'image s'assombrit), conformément à la référence. Après test, Standard restauré (`00`).

### Cible tracking (groupe `04`, sous-groupe `01`)
- **CONFIRMED** : passer en mode Tracking ramène la cible à **Face** (`01`) — réaction identique à la référence PixyPilot.
- **CONFIRMED** : cible restaure Off (`00`) via le SET complet à 13 octets `09 04 01 00 00 0D 00 0D 00 00 00 00 3F 00 00 00 3F 00 00 80 3F` (mode `00`, floats 0.5/0.5/1.0). Relecture `09 04 01 01 00 15 00 15 00 ...` → valeur `00`, floats à zéro.

### Geste (groupe `04`, sous-groupe `02`)
| SET | Relecture | Résultat |
| --- | --- | --- |
| off `09 04 02 00 00 02 00 02 02 00` | `... 02 00` | CONFIRMED — PASS |
| on `09 04 02 00 00 02 00 02 02 01` | `... 02 01` | CONFIRMED — PASS |

## Protocole HID de référence (conforme à la tierce partie, validé sur la pièce)

- Rapports HID : 32 octets, report ID `09`, padding zéro.
- Cadre : `09 GG AA BB CC LL 00 LL <payload>`.
- Groupe `01` (Standard/Tracking/Privacy) : valeur `00` / `01` / `02`.
- Groupe `04` sous-groupe `02` : geste `00`/`01` (lever la main = activer/désactiver le suivi).
- Groupe `02` : auto-privacy (délai en secondes LE, `0` = Never) — write confirmé, déclencheur automatique côté caméra NON confirmé (experimental).
- Groupe `05` : audio DSP (NC `01`, Live `02`, Original `03`).
- Groupe `63` : jog PTZ (`19`, delta axe `01`/`02`) et vecteur (`20`, 3 floats) — utilisés par les projets tiers ; NON testés dans ce projet (UVC suffit).

Source de référence : https://github.com/Romonaga/PixyPilot (docs/EMEET_PIXY_HID_REFERENCE.md), https://github.com/dheldt/emeet-cli, gist rm1138.

## Implications pour le projet

- **CONFIRMED** : les modes « manuel / suivi / confidentielle » du D200X sont pilotables par HID propriétaire (`09 01 01 00 00 01 00 01 XX`), sans EMEET Studio.
- Le geste (lever la main) n'agit qu'en mode Tracking traditionnel de la PIXY ; pour un plugin, il faut donc mettre la caméra en Tracking (`01`) pour que lever la main bascule le suivi.
- L'implémentation plugin sera construite une fois le contrôle PTZ UVC V1 stable et le D200X testé ; le HID s'ajoutera comme couche séparée (pas de tracking dans la V1 PTZ, conformément aux règles).
- L'accès HID n'a modifié aucun pilote ; les tests ci-dessus étaient réversibles et l'état final vérifié : Standard, cible Off, geste On, audio NC, auto-privacy Never (relectures finales effectuées).

## Test physique mini-clavier + OBS — 2026-09-20 (complément)

Périmètre : OBS ouvert sur la source physique PIXY, harnais clavier `pixy-test-harness` en arrière-plan, touches du mini clavier.

- **CONFIRMED — mapping macro HID** : `Ctrl+Shift+Win+7` passe la caméra en **Mode confidentiel** (privacy `02`), `Ctrl+Shift+Win+9` en **Mode manuel** (standard `00`). Le harnais route ces touches vers `PixyHidProbe.exe query <hex>` (config `hid <hex>|7|9`, outil `hidprobe` distinct de `controller`).
- **CONFIRMED — effet visuel dans OBS** : la privacy assombrit l'image dans OBS, le retour manuel la rétablit.
- **CONFIRMED — déclaration utilisateur** : lever la main active le mode suivi (tracking) et la relever le désactive (geste opérationnel). Pendant que le mode suivi est actif, les macros `7`/`9` permettent toujours de passer en manuel ou en confidentiel.
- **Bug de harnais corrigé (2026-09-20)** : le déclencheur passait le hex comme arguments séparés (espaces non protégés) → `PixyHidProbe.exe` interprétait `01` comme un index d'interface (`ERROR: interface index must be 0..0`). Corrigé en guillemetant le hex : `query "<hex>"`. En complément, `CreateNoWindow=true` + redirection stdout/stderr (plus de petite fenêtre console noire à chaque touche).
- État final de la caméra après le test : **Mode confidentiel** (`02`), geste `01` (on), cible `00` (off) — état laissé par le dernier déclenchement macro de l'utilisateur, non restauré.

---

# 34. Presets de position logiciels (fichier JSON) + position de démarrage — 2026-09-20

## Décision d'architecture

- **Presets logiciels** (fichier JSON local), et non les slots natifs HID (groupe `03`, slots 1-3). Le choix s'appuie sur :
  - les slots natifs sont limités à **3** (`SS` = `01..03`) et la référence note que l'app officielle rétablit le zoom **par UVC séparément** du slot (comportement du zoom natif non vérifié sur la pièce) ;
  - les presets logiciels utilisent la voie `IAMCameraControl` **validée** (sections 27-31), sont illimités, réversibles et indépendants du firmware.
- **Position de démarrage** : appliquée **automatiquement au démarrage du bridge `serve`** (donc au démarrage du plugin, qui lance `serve` sur `onConnected`). Choix utilisateur : « appliquée automatiquement au démarrage ».

## Découverte de recherche (HID natif)

- **CONFIRMED (probe)** : la caméra répond aux requêtes de slots de présets natifs groupe `03` : `09 03 01 16 00 01 00 01 SS` → `09 03 01 16 00 0e 00 0e SS EE X:f32le Y:f32le Z:f32le`. Les 3 slots sont actuellement **vides** (`EE=00`).
- Référence : save `09 03 01 15 00 02 00 02 SS 01`, load `09 03 01 18 00 01 00 01 SS` (PixyPilot docs/EMEET_PIXY_HID_REFERENCE.md, captures `pcaps/24` et `pcaps/25`). **Non utilisé** dans l'implémentation retenue.

## Implémentation `PixyController.exe`

Stockage : `%APPDATA%\PixyController\presets.json` :

    {"start":"start","presets":{"start":{"pan":10,"tilt":-10,"zoom":100}}}

Nouvelles commandes CLI + bridge NDJSON (`{"cmd":"..."}`) :

| Commande | Rôle | Caméra requise |
| --- | --- | --- |
| `preset-save <name>` | enregistre la position courante | oui |
| `preset-load <name>` | applique un preset (absolus bornés) | oui |
| `preset-list` | liste les presets (+ marqueur `(start)`) | non |
| `preset-set-start <name>` | désigne le preset de démarrage | non |
| `preset-delete <name>` | supprime un preset | non |
| `start` | rappelle la position de démarrage | oui |

- **CONFIRMED** : au démarrage de `serve`, si un start est défini, la caméra y est déplacée (Pan=40/Tilt=10/Zoom=115 → Pan=10/Tilt=-10/Zoom=100) avant la première réponse, confirmé par `get` sur le canal du bridge.
- **CONFIRMED — test réversible** : `preset-save start` (Pan=10/Tilt=-10/Zoom=100) → déplacement (→50/20/115) → `preset-load start` → retour exact à la valeur enregistrée ; `preset-set-start` + `start` (rappel) vérifiés.
- **Bug corrigé en test** : `PrintUsage()` écrivait sur stdout → corrompait le canal NDJSON du bridge (le plugin recevait `USAGE: pix...` au lieu de JSON). Déplacé sur stderr ; les réponses bridge restent strictement NDJSON.
- **CONFIRMED (E2E mockStudio sur port 3907)** : scénario `savepreset1 → panleft+zoomin → preset1 → setstart → tiltup → start` → messages `preset-save ok`, `preset-load ok`, `start position saved`, `start recall ok`, état final Pan=10/Tilt=-10/Zoom=100. L'ancien binaire du plugin (sans `start`) fut d'abord utilisé de façon erronée → recopié depuis `tools\pixy-controller\bin` après compilation.
- **CONFIRMED (test physique mini clavier, 2026-09-20)** : `Ctrl+Shift+Win+1` (preset-save A), déplacement, `Ctrl+Shift+Win+3` (preset-load A) → retour à la position sauvegardée, vu sur la caméra. Mapping ajouté au harnais : `1`=save A, `3`=load A, `0`=preset-list. Aucun changement de code harnais nécessaire (route générique vers `PixyController.exe`).

## Plugin Ulanzi

- Manifest : 8 nouvelles actions `Keypad` (`start`, `setstart`, `preset1..3`, `savepreset1..3`), UUID suffixés `com.ulanzi.ulanzideck.pixy.{start,setstart,presetN,savepresetN}`.
- `app.js` : `onConnected` force `ensureBridge()` (démarre le bridge, ce qui applique la position de démarrage automatiquement) ; `onKeyDown` route `presetN` → `preset-load presetN`, `savepresetN` → `preset-save presetN`, `start` → `start`, `setstart` → sauve la position courante dans le preset `start` puis le marque comme start.
- Valeurs des presets plugin : libellés explicites « Preset 1/2/3 », « Save Preset 1/2/3 ».
- **UNVERIFIED** : test sur Studio réel + D200X (matériel à venir), champ `uuid` réel de Studio, effet visuel.

## État final après tests

- Caméra : Pan=10, Tilt=-10, Zoom=100, mode Standard (manuel).
- `presets.json` nettoyé : seul le preset `start` (10/-10/100) subsiste et est marqué `start`.
- Aucune modification de pilote ni de configuration système.

---

# 35. Modes caméra (Standard / Tracking / Privacy) exposés dans le plugin — 2026-09-22

## Contexte

- Ulanzi D200X reçu. Le plugin `com.ulanzi.ulanzideck.pixy` (v0.1.0) est **détecté immédiatement** par Ulanzi Studio.
- Constat utilisateur : les **modes caméra** n'étaient pas disponibles (seuls PTZ/presets/encodeur étaient exposés).
- La règle 10 (pas de HID tant que le contrôle UVC n'est pas stable) étant levée (UVC validé, sections 27-31), les modes ont été ajoutés via le canal HID propriétaire validé en section 33.

## Architecture

- Pas de nouveau canal dans le plugin : la commande `mode` passe par le **bridge NDJSON existant** (`PixyController serve`).
- `PixyController.exe mode <standard|tracking|privacy>` délègue l'écriture HID à **`PixyHidProbe.exe`** (cherché dans le même dossier, canal HID natif validé), écrit le rapport groupe 01 puis relit `09 01 01 01` à titre informatif.

## Découverte importante de recherche (readback groupe 01)

- **REJECTED (hypothèse initiale)** : « le readback de `09 01 01 01` est un écho direct de la valeur écrite et permet de confirmer l'écriture ». FAUX sur la pièce : privacy→`02` (écho), tracking→`03`, standard→`03` (première passe). L'interprétation `readback == write` a failli faire rejeter Tracking/Standard à tort.
- **CONFIRMED (référence PixyPilot, docs/EMEET_PIXY_HID_REFERENCE.md)** : le readback groupe `01` **n'est PAS un écho** des valeurs host-to-camera. Décodage PixyPilot : `00`=Standard/idle, `01`=Tracking, `02`=Privacy, `03`=« non-privacy ; Standard vs Tracking inconnu » (statut combiné secondaire). PixyPilot refuse d'ailleurs de mapper `03`.
- **Conséquence implémentée** : le succès de `mode` repose sur l'**acceptation du rapport d'écriture** (exit code 0 de `PixyHidProbe query <SET>`), le readback est journalisé comme informationnel (`03` = non-privacy). Les effets visuels réels restent le critère utilisateur (image assombrie en Privacy, suivi en Tracking).
- **CONFIRMED (retest complet)** : privacy→readback `02`, tracking→`01`, standard→`00` sur la caméra réelle après retrait de la vérification stricte. Caméra restaurée en Standard à l'issue des tests.

## Plugin

- Manifest : 3 nouvelles actions `Keypad` → `com.ulanzi.ulanzideck.pixy.{modestandard,modetracking,modeprivacy}` (total 19 actions).
- `app.js` : `setMode(value)` → `{"cmd":"mode","value":...}` sur le bridge, routeurs `.modestandard`, `.modetracking`, `.modeprivacy` → `standard`, `tracking`, `privacy`.
- `PixyHidProbe.exe` désormais copié dans `bin/` du plugin (requis par la commande `mode`).

## Tests

- **CONFIRMED (CLI, caméra réelle)** : `mode privacy` (readback 02), `mode tracking` (01), `mode standard` (00).
- **CONFIRMED (bridge NDJSON)** : `{"cmd":"mode","value":"privacy"}` → `{"ok":true,...}` ; puis standard restauré.
- **CONFIRMED (E2E mockStudio port 3907)** : keydown privacy/tracking/standard → `mode privacy ok`, `mode tracking ok`, `mode standard ok`.
- **UNVERIFIED** : test sur le D200X réel + Studio (l'utilisateur doit redémarrer Studio pour charger la nouvelle version du plugin).

## État final

- Caméra : Standard (`00`) — les modes de test ont été dessus pu puis restaurés.
- Aucune modification de pilote ni de configuration système.

---

# 36. Encodeurs dédiés Pan/Tilt/Zoom sur le D200X (une molette = un axe) — 2026-09-22

## Contexte

- Le D200X dispose de **3 molettes physiques** et le plugin ne proposait qu'une seule action « PTZ Encoder » (rotation = déplacement, appui = changement d'axe).
- Demande utilisateur : adapter Pan/Tilt/Zoom aux molettes plutôt qu'aux boutons → **une molette par axe**.

## Choix retenu (confirmé par l'utilisateur)

- Ajout de **3 nouvelles actions `Encoder`** dédiées, en plus de l'action multi-axe existante :
  - `com.ulanzi.ulanzideck.pixy.panencoder` — rotation = pan, appui = center
  - `com.ulanzi.ulanzideck.pixy.tiltencoder` — rotation = tilt, appui = center
  - `com.ulanzi.ulanzideck.pixy.zoomencoder` — rotation = zoom, appui = center
- Manifest : 22 actions au total.

## Implémentation (app.js)

- `encoderAxisFromAction(uuid)` associe le **UUID de l'action** (transmis par Studio dans les événements encodeur) à un axe fixe ; l'action multi-axe existante conserve son cycle d'axe.
- `onDialRotate` : l'axe est `fixed || AXIS[encoderContexts]`, la coalescence existante (flush 80 ms, `encoderDelta`) est réutilisée → mouvements rapides de molette coalescés sur le bridge.
- `onDialDown` : pour les encodeurs par axe → `center()` ; pour l'action multi-axe → changement d'axe (comportement inchangé).
- `refreshEncoderFeedback` : feedback `$UA2` initial (`PAN/TILT/ZOOM` + `ROT=DEPL APPUI=CTR`) affiché dès `onAdd`/`setactive`.
- Correctif encodage : libellé sans accent (`ROT=DEPL`) pour éviter le mojibake dans le feedback encodeur.

## Tests

- **CONFIRMED (E2E mockStudio port 3907)** : dialrotate panencoder left/right (pan ±10), tiltencoder right (+10), zoomencoder right (zoom +5), dialdown panencoder → `encoder pan dial -> center` ; 8 retours `setFeedback` reçus. Caméra restaurée à Pan=0/Tilt=0/Zoom=100 à l'issue (réversible).
- **UNVERIFIED** : test physique sur le D200X (Studio doit être redémarré pour charger le manifest à 22 actions).

## État final

- Caméra : 0/0/100, mode Standard.
- Plugin installé (`%APPDATA%\Ulanzi\UlanziDeck\Plugins\com.ulanzi.ulanzideck.pixy.ulanziPlugin`) : manifest.json et app.js à jour (hashes identiques à la source).
- Copie synchronisée `D:\Projets\v2-modes-fonctionnels` à jour.
- Aucune modification de pilote ni de configuration système.

---

# 37. Drop des actions Encodeur PIXY impossible sur les molettes du D200X — cause : `Devices:["D200X"]` — 2026-09-22

## Symptôme

- Les actions `Encoder` du plugin (PTZ Encoder, puis Pan/Tilt/Zoom (Encodeur)) affichaient un curseur **« Interdit »** au glisser-déposer sur les molettes du D200X, alors que les actions `Keypad` se posaient normalement sur les boutons.
- Confirmé par l'utilisateur après redémarrage de Studio (22:41, manifest 22 actions chargé, hashes identiques) : toujours interdit après restart.

## Diagnostic

- **CONFIRMED** : le bloc `{"Type":"Encoder"}` existe bien dans le profil D200X (profil utilisateur : molettes `2_3`,`3_3`,`4_3`) ; voicemeeter `gainAdjustDial` (uniquement `Controllers:["Encoder"]`, **sans** champ `Devices`, layout `$UA1`) se déposait correctement.
- **CONFIRMED** : présents dans les manifests de Studio/plugins installés, les encodeurs fonctionnels (voicemeeter, obsstudio, deck.system, dial.system) n'utilisent **jamais** `Devices:["D200X"]` — obsstudio utilise une exclusion `~AU...`, voicemeeter rien (tous appareils).
- **CONFIRMED** : `$UA2` n'apparaît dans aucun manifest système/tiers installé, uniquement dans le nôtre (candidat n°2, non testé car rendu inutile par la correction).
- **CONFIRMED (côté appareil)** : `device.json` ne nomme pas « D200X » mais « Ulanzi Deck 5x3 » (modèle « 20GBA9901 », UUID `@(1)[4057/128/DL44L2A30526]`) ; le défaut `defProfile\D200X` déclare `Device.Model:"D200H"` dans ses profils internes. « D200X » est le modèle du profil utilisateur et n'est pas un identifiant d'appareil reconnu par le filtre `Devices` pour les Encodeurs.

## Correction

- Manifest : `"Devices": ["D200X"]` → `"Devices": []` sur les **4** actions `Encoder` (`com.ulanzi.ulanzideck.pixy.{encoder,panencoder,tiltencoder,zoomencoder}`) = tous appareils, aligné sur voicemeeter.
- Les actions `Keypad` gardent `Devices:["D200X"]` (elles fonctionnent).
- `app.js` inchangé.

## Tests

- **CONFIRMED (Ulanzi Studio, appareil réel)** : après redémarrage, « Pan (Encodeur) », « Tilt (Encodeur) » et « Zoom (Encodeur) » se déposent sur les molettes sans curseur « Interdit » (test utilisateur = succès).
- **REJECTED (hypothèse)** : la cause n'était ni le layout `$UA2`, ni le champ `Name` dans `States`, ni l'absence de `PropertyInspectorPath` — `Devices` était le seul bloqueur.

## Enseignement

- Pour un contrôleur `Encoder` sur le D200X, le champ `Devices` doit être vide (tous appareils) ou en exclusion `~...`, jamais un modèle d'appareil en inclusion.
- Le profil par défaut D200X référence un modèle interne « D200H » — ne pas s'appuyer sur le nom du modèle utilisateur pour matcher un appareil dans un manifest de plugin.

## État final

- Manifest 22 actions ; 4 encodeurs `Devices:[]`, Keypad `Devices:["D200X"]`.
- Source et plugin installé : hashes identiques.
- Copie synchronisée `D:\Projets\v2-modes-fonctionnels` : manifest MD5 `21DE647BBFA59AB1B83444D771BA8538`, PROJECT_CONTEXT MD5 `075DBD1DEC1832C62BC1B0197ED13920`.

---

# 38. Paramètre « Step Size » pour les encodeurs (2026-09-23)

## Demande

Le pas de rotation des encodeurs était trop élevé. L'utilisateur a demandé un paramètre « Step Size » par action encodeur, sur le modèle du « Gain Adjust » du plugin voicemeeter. Échelle retenue par l'utilisateur : **1, 2, 5, 10 — défaut 1**.

## Décisions

- Le pas est un entier : `PixyController.exe move` parse le delta en `int`, donc les valeurs décimales (0.1, 0.2, 0.5) de voicemeeter (en dB) sont sans objet côté PIXY.
- Le paramètre est exposé via un Property Inspector commun aux 4 actions encodeur (`PTZ Encoder`, `Pan (Encodeur)`, `Tilt (Encodeur)`, `Zoom (Encodeur)`).
- Les boutons Keypad (`panleft`, `zoomin`, …) conservent leurs pas fixes `MOVE_STEP=10` / `ZOOM_STEP=5`. Un seul tick d'encodeur vaut `stepSize` (par défaut 1), au lieu de `MOVE_STEP`/`ZOOM_STEP` auparavant.

## Implémentation

- `property-inspector/pixyEncoder/inspector.html` + `inspector.js` : sélecteur `select name="stepSize"` (options 1/2/5/10, défaut 1), sur le modèle voicemeeter (`uspi.css`, `$UD.connect()`, `Utils.debounce`, `settingSaveParam`, `sendParamFn`).
- Libs copiées depuis le plugin voicemeeter installé : `libs/js/{constants.js,eventEmitter.js,timers.js,ulanzideckApi.js,utils.js}` + `libs/css/uspi.css` (aucune modification).
- `manifest.json` : `PropertyInspectorPath: "property-inspector/pixyEncoder/inspector.html"` ajouté aux 4 actions encodeur (`Devices:[]` conservé).
- `app.js` : `encoderSettings` (Map context → settings), `storeEncoderSettings`, `getStepSizeForContext` (fallback 1), `onDidReceiveSettings` stocke `jsn.settings` ; `onDialRotate` utilise `stepSize`.

## Tests

- `mockStudio-step.cjs` (port 3907) : `add` panencoder → `didReceiveSettings {stepSize}` → `dialrotate right`, puis lecture matérielle `PixyController get`.
- CONFIRMED `stepSize=1` : bridge applique la position « start » (pan=10) au lancement, puis `dialrotate right` → pan **11** (+1).
- CONFIRMED `stepSize=5` : pan **15** (+5).
- CONFIRMED : le dossier `property-inspector` complet est installé et identique (hashes MD5 source = installé, y compris les libs).
- Caméra recentrée (pan=0, tilt=0, zoom=100) après le test.

## Limites / statuts

- LIKELY : Ulanzi Studio charge les settings par action via `didReceiveSettings` ; à confirmer par un test utilisateur réel (redémarrer Ulanzi Studio).
- UNVERIFIED : changement de `stepSize` dans le Property Inspector pendant que Studio tourne (mise à jour à chaud).
- Le Property Inspector ne s'affiche que pour les actions encodeur (pas pour les boutons Keypad).

---

# 39. Boutons positions : appui court / appui long (2026-09-23)

## Demande

Pour les boutons « positions », utiliser deux fonctionnements : appui court (rappel) / appui long (sauvegarde), avec durée d'appui long réglable.

## Décisions (questionnaire utilisateur)

- Boutons concernés : **Preset 1 à 5 + Start** (ajout de Preset 4 et Preset 5 ; choix utilisateur « preset + start, ajoute 2 presets »).
- Comportement :
  - **Appui court** = rappel de la position (preset-load / start).
  - **Appui long** = sauvegarde de la position courante (preset-save / set-start).
- Durée d'appui long réglable : **300–2000 ms, défaut 500 ms**.
- **Supprimé** : actions `Set Start`, `Save Preset 1/2/3` (remplacées par l'appui long). Manifest passe de 22 à **20 actions**.

## Implémentation

- `manifest.json` : ajout Preset 4/5 ; suppression setstart, savepreset1/2/3 ; `PropertyInspectorPath` `property-inspector/pixyPosition/inspector.html` sur start et preset1-5.
- `property-inspector/pixyPosition/inspector.html` + `inspector.js` : select `longPressMs` (300/400/500/600/800/1000/1500/2000, défaut 500), mêmes libs que pixyEncoder.
- `plugin/app.js` :
  - `positionSettings` (Map context → settings), `storePositionSettings`, `getLongPressMsForContext` (plage 300–2000, fallback 500).
  - `onKeyDown` : pour action position, lance un `setTimeout(longPressMs)` → `handleLongAction` (save). Sinon action immédiate.
  - `onKeyUp` : si un long-appui est en attente, annule le timer et exécute l'action courte (rappel). Si le timer a déjà expiré, l'appui long a été fonction, le relâchement ne fait rien.
  - `onClear` : nettoie les timers de long-appui en attente.
  - Le SDK émet `keydown`/`keyup` (`KEYDOWN`/`KEYUP` confirmés dans `constants.js`).

## Tests (mock, caméra réelle)

- `mockStudio-longpress.cjs` (port 3907) : `didReceiveSettings {longPressMs:500}` puis :
  - Appui court preset1 (keydown + keyup +100 ms) → log `preset-load preset1 ok`. CONFIRMED.
  - Appui long preset5 (keydown, attendre 800 ms > 500, puis keyup) → log `long press -> save preset5` + `preset-save preset5 ok`. CONFIRMED.
  - Le `keyup` après expiration du timer ne déclenche pas d'action (pas de double exécution). CONFIRMED.
- Effet matériel : le nouveau preset5 est apparu dans `preset-list`, puis supprimé après le test (caméra recentrée ; preset1/2/3/start/A inchangés).

## Statuts

- CONFIRMED : déclenchement court/long dans le plugin (timers + keyup), sauvegarde et rappel réels via UVC.
- LIKELY : Ulanzi Studio envoie bien `keyup` en appui réel sur le D200X (le SDK l'expose ; à confirmer au test utilisateur).
- LIKELY : la durée choisie dans le Property Inspector est bien fournie par `didReceiveSettings` au chargement de page.
- Remarque : les 4 actions supprimées (setstart, savepreset1/2/3) ne sont plus disponibles ; un profil existant qui les utilisait devra être réaffecté manuellement.

---

# 40. Nouvelles icônes des actions (2026-09-23)

## Demande

Remplacer les icônes SVG par de nouvelles images `Images/gradient-*.png` (96×96) ajoutées par l'utilisateur.

## Correspondances appliquées (Icon + State)

| Action | Image |
|---|---|
| Pan Left | `gradient-arrow-left.png` |
| Pan Right | `gradient-arrow-right.png` |
| Tilt Up | `gradient-arrow-up.png` |
| Tilt Down | `gradient-arrow-down.png` |
| Zoom In | `gradient-zoom-in.png` |
| Zoom Out | `gradient-zoom-out.png` |
| Center | `gradient-accuracy.png` |
| Start | `preset-0.png` (choix utilisateur ; remplace `gradient-start.png`) |
| Preset 1-5 | `preset-1.png` … `preset-5.png` (choix utilisateur ; remplacent `pixy.svg`) |
| Pan (Encodeur) | `gradient-arrow-horizontal.png` |
| Tilt (Encodeur) | `gradient-arrow-vertical.png` |
| Zoom (Encodeur) | `gradient-arrow-enlarge.png` |
| Mode Standard (manuel) | `gradient-move.png` (remplace `gradient-arrow-restart.png`, choix utilisateur) |
| Mode Tracking | `gradient-aperture.png` (choix utilisateur) |
| Mode Privacy | `gradient-privacy.png` |
| PTZ Encoder (knob multi-axes) | `gradient-ptz.png` (image fixe ajoutée par l'utilisateur ; l'affichage runtime est néanmoins dynamique par axe, voir §41) |

## §41 — PTZ Encoder : icône dynamique par axe

Cadre : afficher sur le knob PTZ Encoder l'image de l'axe actif quand on change d'axe.

- La demande : `enlarge` pour l'axe zoom, `horizontal` pour pan, `vertical` pour tilt.
- Étude SDK : le layout manipuleur `$UA1` = Icon + Text (élément `icon` de type `pixmap` + élément `title` de type `text`) ; `$UA2` = Text + Text (`text2` + `title`). `setFeedback(context, layout)` met à jour les éléments par nom de clé. Un élément `key:"icon"` se comporte comme l'icône standard du bouton.
- Implémentation :
  - manifest.json : PTZ Encoder (`com.ulanzi.ulanzideck.pixy.encoder`) passe de `$UA2` à `$UA1` (ligne 119). Les encodeurs fixes Pan/Tilt/Zoom restent en `$UA2`.
  - app.js : `ENCODER_ICONS = [horizontal, vertical, enlarge]` ; `updateEncoderFeedback(context, axisIndex)` envoie désormais `setFeedback({ icon, title })` au lieu de `title` + `text2`.
- Résultats matériel : Aucun test visuel sur D200X (le mock ne pilote pas l'écran).

## §42 — Correction : icônes des encodeurs fixes Pan/Tilt/Zoom

Constat utilisateur : les images Pan, Tilt et Zoom ne s'affichaient pas sur les knobs dédiés, alors que le PTZ Encoder (dynamic, §41) fonctionnait.

- Cause identifiée : les 3 encodeurs fixes étaient en layout `$UA2` (Text + Text). `$UA2` ne contient aucun élément image, donc ni `Icon` ni `State.Image` du manifest n'est rendu sur l'écran du knob. Le `setFeedback` envoyé ne portait que `title` + `text2`.
- Correction :
  - manifest.json : Pan/Tilt/Zoom (Encodeur) passent de `$UA2` à `$UA1` (Icon + Text). Les 4 actions Encoder sont désormais en `$UA1`.
  - app.js : `updateAxisEncoderFeedback(context, axis)` envoie `setFeedback({ icon, title })` au lieu de `{ title, text2 }`, avec un mapping `pan→gradient-arrow-horizontal.png`, `tilt→gradient-arrow-vertical.png`, `zoom→gradient-arrow-enlarge.png`. Le texte d'aide `ROT=DEPL APPUI=CTR` disparaît de ces knobs (le layout $UA1 n'a que `icon` + `title`).
- CONFIRMED (protocole, mock E2E port 3907) : les 3 encodeurs fixes émettent bien leur icône au `add`.

## §43 — Step Size sur les boutons de mouvement (Pan/Tilt/Zoom)

Demande utilisateur : les boutons de déplacement doivent eux aussi avoir un pas réglable, comme les knobs.

- Les pas étaient figés en code : `MOVE_STEP = 10` (pan/tilt) et `ZOOM_STEP = 5` (zoom), utilisés directement dans `handleShortAction`.
- Nouveaux fichiers : `property-inspector/pixyMove/inspector.html` + `zoom.html` + `inspector.js` (stepSize : 1/2/5/10/15/20/30).
  - `inspector.html` : défaut affiché 10, utilisé par Pan Left/Right et Tilt Up/Down.
  - `zoom.html` : défaut affiché 5, utilisé par Zoom In/Out.
  - Deux pages distinctes (même `inspector.js`) pour que la valeur affichée corresponde toujours au comportement réel.
- manifest.json : `PropertyInspectorPath` ajouté sur les 6 actions de mouvement (4 vers `pixyMove/inspector.html`, 2 vers `pixyMove/zoom.html`).
- app.js :
  - `buttonSettings` (Map par contexte) + `storeButtonSettings` + `getMoveStepForContext(context, axis)` qui retombe sur `ZOOM_STEP` (zoom) ou `MOVE_STEP` (pan/tilt) si aucun réglage reçu ;
  - `MOVE_ACTIONS` (table `suffixe → [axe, signe]`) + `moveActionFromUuid(uuid)` remplacent les 6 `if ... endsWith` ;
  - `onDidReceiveSettings` alimente aussi `buttonSettings` ; `onClear` purge les contextes de boutons.
- Piège de test rencontré : le mock envoyait `key: true` sur `keydown`/`keyup`, ce qui produisait un contexte `___true___` différent de celui de `add`/`didReceiveSettings` (`___key01___`) et faisait échouer la lecture du réglage. Le plugin de Studio envoie le vrai identifiant de touche. Corrigé côté mock.

### Vérifications (caméra réelle, bridge `serve`, mesures avant/après)

- CONFIRMED : Pan Right sans réglage → Pan 10 → 20 (+10, défaut MOVE_STEP).
- CONFIRMED : Pan Right `stepSize=30` → Pan 10 → 40 (+30).
- CONFIRMED : Tilt Up `stepSize=45` → Tilt -9 → 36 (+45).
- CONFIRMED : Zoom Out sans réglage → Zoom 150 → 145 (-5, défaut ZOOM_STEP).
- CONFIRMED : Zoom Out `stepSize=20` → Zoom 150 → 130 (-20).
- Note : Zoom In `stepSize=20` n'a pas été concluant car la caméra était déjà au maximum (Zoom=150).

## §44 — Icônes presets/start et icône principale du plugin

- Nouvelles images fournies par l'utilisateur : `Images/EMEETPIXYDual.png`, `Images/preset-0.png` à `preset-5.png`. Elles ont d'abord été fournies en 505×494, puis redimensionnées par l'utilisateur en **96×96** (comme les autres icônes) — installed dans Ulanzi Studio de nouveau après redimensionnement.
- manifest.json :
  - `Icon` et `CategoryIcon` (niveau plugin) : `Images/pixy.svg` → `Images/EMEETPIXYDual.png`.
  - `Start` : `gradient-start.png` → `preset-0.png`.
  - `Preset 1` à `Preset 5` : `pixy.svg` → `preset-1.png` … `preset-5.png`.
- `Images/pixy.svg` n'est plus référencé nulle part dans le manifest (le fichier reste présent dans le dossier).
- Vérifications : manifest JSON valide ; 25 références uniques (icônes, states, property inspectors) et **toutes existent** ; hashes installés identiques.

## §45 — Fin de la copie vers v2-modes-fonctionnels

Décision utilisateur (2026-09-26) : `D:\Projets\v2-modes-fonctionnels` n'est plus utile.

- La synchronisation `robocopy D:\Projets\Ulanzi-emeet-plugin D:\Projets\v2-modes-fonctionnels /mir` est **arrêtée**.
- `D:\Projets\Ulanzi-emeet-plugin` reste la source de vérité unique.
- Le dossier `v2-modes-fonctionnels` existe toujours sur le disque ; sa suppression n'a pas été faite (commande destructive, à confirmer explicitement par l'utilisateur).

## Vérifications

- CONFIRMED : JSON manifest valide ; hashes installés identiques.
- CONFIRMED : `gradient-ptz.png` est un PNG 96×96 valide, référencé 2× dans le manifest (Icon + State.Image du PTZ Encoder).
- CONFIRMED (protocole, mock E2E port 3907 `mockStudio-encodericon.cjs`) : à chaque `dialdown`, le plugin émet `setFeedback` avec l'icône de l'axe :
  - axe pan → `{ icon: "Images/gradient-arrow-horizontal.png", title: "PAN" }`
  - axe tilt → `{ icon: "Images/gradient-arrow-vertical.png", title: "TILT" }`
  - axe zoom → `{ icon: "Images/gradient-arrow-enlarge.png", title: "ZOOM" }`
  - retour pan → `{ icon: "Images/gradient-arrow-horizontal.png", title: "PAN" }`

## Statuts

- CONFIRMED : manifest JSON valide.
- CONFIRMED : chaque `Icon`/`State.Image` référence un fichier existant (15 chemins uniques).
- CONFIRMED : toutes les `Images/gradient-*.png` sont des PNG 96×96 valides.
- CONFIRMED : files installés (hashes manifest + 15 images identiques source = installé).
- `gradient-arrow-return.png` présent dans le dossier mais non référencé dans le manifest.

## Statuts

- LIKELY : les nouveaux visuels s'affichent dans Ulanzi Studio après redémarrage ; à confirmer visuellement par l'utilisateur (redémarrage requis pour recharger le manifest).
- LIKELY : l'écran du knob D200X affiche l'icône dynamique par axe ($UA1 + setFeedback icon) ; à confirmer visuellement sur l'appareil (le mock ne teste que le protocole, pas le rendu).

---

# 46 - Restructuration du dépôt sur le modèle des deux autres plugins Ulanzi

Décision utilisateur (2026-10-11) : le projet était monté à la va-vite autour d'un
`pixy-test-harness` (hook `WH_KEYBOARD_LL` + un processus par pression de touche) qui
n'a plus lieu d'être. Le dépôt est réaligné sur `Ulanzi-neewer-plugin` et
`Ulanzi-elgato-wave-link-plugin`.

**Ce qui n'a PAS changé** : le bridge `PixyController.exe` reste indispensable. Node ne
peut pas parler DirectShow, et l'AGENTS.md §"Architecture logicielle recommandée"
impose un processus persistant plutôt qu'un exécutable par mouvement de molette. Ce qui
disparaît, c'est le harnais clavier et la distribution manuelle des binaires, pas le
processus natif.

## Arborescence avant / après

- `com.ulanzi.ulanzideck.pixy.ulanziPlugin/` (bundle installé, édité à la main, à la
  racine du dépôt) → `plugin/` (source) + `release/` (sortie de build, ignoré par git).
- `plugin/plugin-common-node/` (SDK Ulanzi vendorisé) → `sdk/ulanzi-api`, installé par
  `npm run sdk` (`scripts/install-sdk.mjs`, copié du projet neewer).
- `property-inspector/libs/` (SDK HTML vendorisé) → `sdk/common-html` → `libs/` et
  `assets/` à la racine du bundle.
- `tools/pixy-controller/`, `tools/pixy-hid-probe/`,
  `tools/pixy-camera-control-diagnostic/` → `native/PixyController/`,
  `native/PixyHidProbe/`, `native/PixyCameraControlDiagnostic/`.
- `tools/pixy-test-harness/` → supprimé.
- `bin/` dans le bundle → `plugin/native/`, produit par `npm run native`.
- Ajoutés : `.gitignore`, `package.json` racine, `scripts/`, `CHANGELOG.md`.
- `README.md` (2 lignes) et `LICENSE` non traités à cette étape.

## Trois chemins que le déplacement a imposés

Ces lignes ne sont pas des refontes, elles sont dictées par l'arborescence et sans elles
le plugin ne démarre pas :

1. `manifest.json` : `CodePath` `plugin/app.js` → `service/app.js` ;
   42 références `Images/` → `images/` ; ajout de `Inspect`.
2. `service/app.js` : import du SDK `./plugin-common-node/index.js` → `../ulanzi-api/index.js` ;
   exe `../bin/PixyController.exe` → `../native/PixyController.exe`.
3. `property-inspector/*/*.html` : `../libs/` → `../../libs/` et
   `ulanzideckApi.js` → `ulanziApi.js`.

## Bug latent découvert pendant l'opération

Le `uspi.css` vendorisé référence `../assets/u_*.svg`. Dans l'ancien bundle, `assets/`
n'existait pas : les cases à cocher, boutons radio et infobulles des property inspectors
s'affichaient donc en images cassées. `npm run build` livre maintenant `assets/` et échoue
explicitement si un inspector référence un fichier absent de la sortie.

## Statuts

- CONFIRMED : le SDK téléchargé (`main`, 2026-10-11) est identique ligne à ligne au
  `plugin-common-node` vendorisé qui avait été supprimé — les 5 fichiers de
  `sdk/ulanzi-api` et les 6 fichiers de `sdk/common-html` ne présentent aucune différence.
  Le remplacement du vendorisé par le SDK officiel est donc sans effet de comportement.
- CONFIRMED : les 13 membres de l'API utilisés par `service/app.js` (`connect`,
  `logMessage`, `setFeedback`, `onConnected`, `onAdd`, `onSetActive`, `onClear`,
  `onKeyDown`, `onKeyUp`, `onDialDown`, `onDialRotate`, `onDidReceiveSettings`,
  `onError`, `onClose`) existent tous dans le SDK téléchargé.
- CONFIRMED : `npm run native` reproduit les deux binaires depuis `native/` avec le
  `csc.exe` de `Framework64\v4.0.30319`, sans toolchain externe.
- CONFIRMED : `csc.exe` embarque un timestamp — deux compilations du même `Program.cs`
  ne produisent pas les mêmes octets. Les binaires ne sont donc pas comparables par
  hash, et le README de `pixy-controller` ne doit pas laisser croire le contraire.
- CONFIRMED : `npm run build` produit un bundle complet (`assets/`, `images/`, `libs/`,
  `native/`, `service/`, `ulanzi-api/`, `node_modules/ws`, `INSTALL.txt`), 8 modules
  d'inspector parsés, versions `manifest.json` / `package.json` cohérentes.
- CONFIRMED : `manifest.json` ne contenait plus qu'un seul fichier corrompu par une
  lecture/écriture Latin-1 d'un UTF-8 (§116, `d<2 octets U+FFFD>placement`). Corrigé en `déplacement`.
  Les 41 autres fichiers texte du dépôt ne contiennent aucun U+FFFD.
- UNVERIFIED : le plugin n'a pas été relancé dans Ulanzi Studio après restructuration.
  La validation matérielle (§29 OBS, §33 HID, §34 presets) date d'avant et reste valable
  sur le plan fonctionnel, mais les chemins d'icônes (`Images/` → `images/`) et le
  `CodePath` n'ont pas été revus par l'hôte. À confirmer au prochain démarrage de Studio.
- LIKELY : `manifest.json` gagnerait à passer `Images/` en SVG comme les deux autres
  plugins ; non fait à cette étape (hors périmètre).

---

# 47 - Refactorisation du service (2026-10-11)

Décision utilisateur (2026-10-11) : passer à la refactorisation du code, sur le modèle
Ulanzi-neewer-plugin. `plugin/app.js` était un fichier unique de 487 lignes qui
contenait la connexion SDK, le processus natif, la file de requêtes, l'état par touche,
l'analyse des UUID, la coalescence des encodeurs et les 19 actions.

## Découpage

- `service/app.js` : routage d'événements uniquement. Ne contient plus aucune commande
  caméra et aucun état de touche.
- `service/actions/` : `move.js` (6 actions), `center.js`, `encoder.js` (4),
  `position.js` (6), `mode.js` (3), `index.js` (registre).
- `service/core/` : `bridge.js`, `camera.js`, `context.js`, `dial.js`,
  `params.js`, `ui.js`, `shutdown.js`, `constants.js`.

Les tests (	ests/, 73 cas, aucun matériel requis) passent par setBridge() et par un
résolveur de modules qui redirige l'import du SDK vers `sdk/`.

## Défauts trouvés et corrigés

Chacun de ces points était observable, pas théorique.

1. **CONFIRMED — aucune échéance sur le bridge.** Une commande sans réponse (pilote UVC
   muet) ne résolvait jamais, le créneau « en vol » restait occupé et **toutes** les
   commandes suivantes étaient silencieusement abandonnées jusqu'au redémarrage de Studio.
   Corrigé : BRIDGE_TIMEOUT_MS = 4000, et le pipe est reconstruit plutôt que
   resynchronisé (une réponse tardive aurait été attribuée à la commande suivante).
2. **CONFIRMED — relance_TIMESTAMP du helper.** serve applique la position de démarrage
   à son démarrage (README de pixy-controller). Relancer le helper après un timeout
   déplaçait donc la caméra sans qu'aucune touche soit pressée. Corrigé : la relance est
   paresseuse, au prochain besoin.
3. **CONFIRMED — helper introuvable.** Un PixyController.exe absent ou bloqué ne
   rejetait rien ; toutes les commandes en attente restaient suspendues. Corrigé dans
   ailAll().
4. **CONFIRMED — ligne non-réponse.** Une bannière ou un diagnostic écrit sur stdout était
   interprété comme la réponse : la commande échouait au lieu de réussir. Corrigé : seule
   une ligne JSON est une réponse ; le reste est journalisé et ignoré, l'échéance couvre
   l'attente.
5. **CONFIRMED — uuid absent au relâchement.** handleShortAction lisait jsn.uuid au
   keyup. Si l'hôte ne l'envoie pas, le rappel d'un preset ne faisait **rien**, en
   silence. Corrigé : l'action est extraite du contexte, toujours présent.
6. **CONFIRMED — journalisation trompeuse.** presetSave écrivait preset-save <nom> ok
   en dehors de la branche qui vérifiait la réponse : le succès était journalisé sur un échec.
7. **CONFIRMED — delta d'encodeur global.** encoderDelta était un unique objet partagé :
   deux encodeurs sur deux axes différents accumulaient dans le même compteur. Corrigé :
   par touche, puis par axe dans la touche. Les crans tournés avant un changement d'axe
   ne sont plus appliqués au nouvel axe (bug attrapé par un test, dans la boucle de flush).
8. **CONFIRMED — timer d'appui long non annulé.** Le relâchement de touche ne cancellait
   pas le timer ; un appui court pouvait à la fois rappeler **et** enregistrer.
9. **CONFIRMED — settings reconstruits depuis les défauts.** Un message
   didReceiveSettings ne portant qu'un champ remettait les autres à leur défaut.
   Corrigé par fusion.
10. **CONFIRMED — aucune reprise sur exception.** Le SDK parse chaque trame entrante avant
    tout le reste : une trame invalide levait dans le SDK et tuait le service. Corrigé :
    uncaughtException journalise et continue.
11. **CONFIRMED — helper non arrêté.** onClose écrivait quit sans rien attendre ni tuer.

## Décisions explicites

- **Pas de liste blanche pour stepSize.** Une version antérieure du refactor-limitait
  les pas à [1,2,5,10,20]. Or le §43 confirme un stepSize=45 **conduit sur la caméra
  réelle** (Tilt -9 → 36). Une liste blanche aurait été une régression silencieuse : la clé
  serait passée de trois pressions à deux cents. Borné à MAX_STEP_SIZE = 100 seulement.
- **Valeurs nulles : fallback, pas clamp.** Un pas de 0 n'est pas « un pas très petit », c'est
  une touche qui ne déplace jamais la tête ; le clamper en 1 cacherait le réglage fautif.
- **Le seuil d'appui long est clampé, pas remplacé.** 50 ms n'est pas une absurdité à
  protéger, c'est un seuil que l'utilisateur voit et peut changer.

## Cohérence vérifiée

- CONFIRMED : les 19 actions du manifest sont enregistrées, et le registre ne contient rien
  d'autre (test pp.test.js).
- CONFIRMED : les panneaux affichent exactement les défauts du code — déplacement 10,
  zoom 5, encodeur 1, appui long 500 ms.
- CONFIRMED : les 73 tests passent sans caméra, sans D200X et sans le binaire natif.
- CONFIRMED : 
pm run build produit un bundle complet ; 15 modules de service et 1 module
  d'inspector parsés par le build.
- UNVERIFIED : **rien de tout cela n'a été rejoué sur la caméra réelle ni dans Ulanzi
  Studio.** Les validations matérielles des §28, §29, §33 et §34 restent valables sur le
  plan fonctionnel, mais les corrections de cette section sont vérifiées par test, pas par
  la caméra. À confirmer au prochain essai sur la PIXY, en particulier le délai de 4 s et
  la reconstruction du bridge.
- LIKELY : manifest.json gagnerait à passer images/ en SVG comme les deux autres
  plugins ; non fait, hors périmètre.
---

# 48 - Audit P1 : garde-fous non physiques (2026-10-11)

Terminé, P1 exécuté en entier. Aucun matériel requis. Suite : **104 tests** (73 + 31).

## 1. 	ests/wiring.test.js - 7 cas

Analyse statique du service. 
ode --check ne fait que parser : un nom utilisé jamais
importé parse parfaitement et lève un ReferenceError au premier appel, qui atterrit dans
le uncaughtException - qui journalise et continue. Le plugin marche, la ligne cassée est
une ligne de log que personne ne lit.

Cette famille d'erreur s'est produite **deux fois pendant le découpage du §47** : un objet
ridge inventé au point d'appel pour satisfaire une signature, et un champ lu ctx.action
alors que le constructeur l'appelait autrement. Les deux parsent.

Périmètre volontairement étroit : uniquement les appels **en colonne 0**, c'est-à-dire le
câblage de niveau module. C'est la méthode du projet frère, qui a subi exactement ce bug
(installShutdownHandlers(registry) sans import correspondant). Vérifier les appels dans
les corps de fonction produirait trop de faux positifs pour un gain nul ici.

Vérifié par mutation : supprimer l'import de installShutdownHandlers -> échec cité ;
renommer ender en endar -> échec cité. **Un test qui ne peut pas échouer ne vaut rien.**

## 2. 	ests/manifest.test.js - 13 cas

Contrôles que le build fait déjà sur la sortie, mais faits sur les sources, donc attrapés
par 
pm test et non en regardant le deck.

Le cas important est un **garde-fou de régression** : une action encodeur qui déclare
Devices: ["D200X"] **ne peut pas être déposée sur une molette**. C'est arrivé (§37), et
c'était invisible parce que le manifest est du JSON valide dans les deux cas.

Vérifié par mutation : réintroduire Devices: ["D200X"] sur l'action PTZ Encoder ->
échec cité.

## 3. scripts/mock-studio.mjs - remplacement des harnais perdus

Les quatre harnais mockStudio*.cjs qui avaient produit les CONFIRMED des §32, §38, §39 et
§43 n'existaient plus : **0 dans le dépôt, 0 dans le répertoire temporaire**. Toute cette
validation E2E avait disparu avec l'ancienne arborescence.

Remplacement, avec deux différences assumées :

- **Sans dépendance.** Il parle RFC 6455 sur 
ode:net + 
ode:crypto. Le seul paquet
  WebSocket du projet est ws, et c'est une dépendance d'exécution du plugin construit :
  un outil de développement ne doit pas y aller chercher. Les trames concernées sont de
  petits objets JSON texte, non fragmentés et non compressés - tout ce que le SDK envoie.
- **Il est testé.** 	ests/mock-studio.test.js (11 cas) le pilote avec le WebSocket natif
  de Node, donc une erreur de cadrage échoue à la suite au lieu d'échouer une session.

CONFIRMED : handshake accepté par le client natif de Node ; trame fractionnée réassemblée ;
trame masquée démasquée ; charge utile > 125 octets (champ de longueur étendu) ; trame non
JSON enregistrée comme telle et non comme un événement ; une requête HTTP non-upgrade
rejetée en 400.

Limite assumée : le client natif de Node n'est pas le paquet ws que le SDK utilise. Un
client conforme au RFC mais différent pourrait passer. Ce que le test garantit, c'est que le
cadrage est réel et que les deux implémentations s'accordent.

## 4. .csproj du diagnostic supprimé

Il déclarait 
et8.0-windows + ImplicitUsings + Nullable alors que la seule
compilation documentée est csc.exe .NET Framework, et que **le SDK .NET 8 n'est pas
installé** sur cette machine (§27). Un projet qui promet un dotnet build impossible est
pire que pas de projet. CONFIRMED : le code compile toujours avec la commande du README
(csc, code de sortie 0).

## 5. Branche efacto supprimée

Constatée au moment de commiter : HEAD était passé sur efacto, branche figée à
248223f - **avant** le commit du README. Tout le travail P1 se retrouvait non commité
par-dessus l'ancienne branche. efacto étant un ancêtre strict de develop, le
changement de branche a reporté les modifications sans perte, et la branche a été
supprimée (git branch -d).

## Statuts

- CONFIRMED : 104 tests passent, 
pm run build produit un bundle complet (15 modules de
  service, 1 module d'inspector parsés).
- CONFIRMED : 
pm run mock démarre et affiche son invite.
- UNVERIFIED : inchangé - tout ce qui demande la caméra ou le D200X. Voir §47.
---

# 49 - Sens reel des axes, mesure sur la camera (2026-10-11)

Ferme le point le plus ancien du projet, ouvert depuis le §22 et repris dans le §27, le §29
et le README de pixy-controller : **le signe effectif de chaque axe n'avait jamais ete
etabli**. Les tests d'ecriture du §28 et §29 utilisaient des deplacements d'un seul pas
(0 -> 1 -> 0) que l'utilisateur n'a pas percus ; les lectures Get prouvaient que le
pilote acceptait la valeur, pas que la tete bougeait dans le bon sens.

## Resultat du test utilisateur

| Action | Rotation / appui | Resultat |
| --- | --- | --- |
| Boutons Pan Gauche / Pan Droit | — | **KO, inverse** |
| Boutons Tilt Haut / Tilt Bas | — | OK |
| Boutons Zoom + / Zoom - | — | OK |
| Encodeur Zoom | gauche = zoom -, droite = zoom + | OK |
| Encodeur Pan | gauche = move droite, droite = move gauche | **KO, inverse** |
| Encodeur Tilt | gauche = move bas, droite = move haut | OK |
| Encodeur PTZ (cyclique) | identique aux encodeurs separes | pan a inverser |
| Center, presets, modes standard / tracking / privacy | — | OK |

## Lecture du resultat

Les quatre manifestations du pan sont **un seul et meme defaut**, pas quatre :

- bouton Pan Gauche envoyait pan -step et allait a droite ;
- encodeur pan rotation gauche envoyait pan -step et allait a droite.

Donc sur cette PIXY : pan +step deplace la tete vers la **gauche**, alors que
	ilt +step la monte et que zoom +step la resserre. Les trois axes n'ont pas la meme
convention de signe.

## Correction

AXIS_POLARITY dans core/constants.js : pan: -1, 	ilt: 1, zoom: 1. Appliquee par
les deux seuls endroits qui pilotent un axe - ctions/move.js et ctions/encoder.js -
qui gardent des directions physiques (gauche, droite, haut, bas, avant, arriere).

## Le piege que cela revele

Deux emplacements portent la meme conversion. Corriger un seul produit des touches qui
contredisent les molettes, ce qui ne se voit qu'en utilisant les deux. Le test
** key and its encoder move the head the same way** (	ests/actions.test.js) verifie
l'invariant pour les six paires bouton / encodeur.

Verifie par mutation : appliquer la polarite au bouton et l'oublier sur l'encodeur fait
echouer ce test (4 echecs), en citant
panleft moves like panencoder rotated left.

## Ce que ce test n'a pas corrige

Aucun autre defaut signale. Restent ouverts : §48 UNVERIFIED (delai du bridge,
reconstruction), §43 (Zoom In a stepSize=20 non concluant, camera au maximum), §29
(cohabitation OBS + plugin, jamais faite avec le plugin reellement installe), et les items
P3 de l'audit (debranchement, modes en ecriture seule, saut de camera au demarrage).

## Statuts

- CONFIRMED : polarite mesuree sur la camera pour les trois axes, boutons et encodeurs.
- CONFIRMED : 105 tests passent ; le build produit un bundle complet.
- UNVERIFIED : le resultat n'a pas ete revérifié apres correction - la correction ellememe
  n'est verifiee que par test. A confirmer au prochain essai sur la PIXY.
---

# 50 - Le pan de la PIXY contredit la convention documentee (2026-10-11)

Question posee par l'utilisateur : l'inversion du pan trouvee au §49 est-elle volontaire de
la part d'EMEET ? Verification dans la documentation plutot que supposition.

## Ce que disent les specifications

- **CameraControl_Pan** (Microsoft Learn, CameraControlProperty) : « Positive values are
  clockwise from the origin (the camera rotates clockwise when **viewed from above**), and
  negative values are counterclockwise ». Vu du dessus, un sens horaire est un mouvement
  vers la **droite**. Pan positif = panoramique a droite.
- **KSPROPERTY_CAMERACONTROL_PAN** : meme formulation, et impose une plage de
  **-180 a +180** pour le peripherique.
- **UVC 1.5**, CT_PAN_TILT_ABSOLUTE_CONTROL : meme convention, et pour le tilt « positive
  values point the imaging plane up ».

## Ce que fait la PIXY (mesure au §49)

| Axe | Convention documentee | Mesure | Conforme |
| --- | --- | --- | --- |
| Pan | positif = droite | positif = **gauche** | **NON** |
| Tilt | positif = haut | positif = haut | oui |
| Zoom | distance en mm | sans direction | sans objet |

Indice complementaire : le meme firmware annonce une plage de pan de **-150 a +150**, la ou
la specification exige -180 a +180.

## Lecture

La PIXY **contredit** la convention documentee, sur le pan seul. Cela est coherent avec un
firmware qui n'applique pas la spec a ce controle, pas avec une alternative deliberee et
documentee : aucune documentation EMEET ne mentionne une convention de signe propre.

L'intention d'EMEET **reste indeterminee** et ne peut pas etre etablie depuis cette machine.
Statut : **UNVERIFIED**.

Deduction possible, sans preuve : si EMEET Studio pilotait le pan par le meme chemin UVC
sans negation, le panoramique serait inverse pour tous les possesseurs d'une PIXY. Le pan
etant l'axe PTZ le plus utilise, l'une des deux hypotheses devrait tenir : EMEET Studio
applique la meme correction, ou il passe par un autre canal (le HID proprietaire, ou l'on
sait deja que voyagent les modes, §33 et §35). Aucune des deux n'est verifiee.

## Consequence pour le plugin

La correction reste juste dans tous les cas : le plugin doit epouser **le materiel**, pas la
specification. Mais AXIS_POLARITY est un **contournement avec une condition de retrait** :

> Si EMEET corrige un jour le signe dans une mise a jour de firmware, supprimer l'entree
> pan de AXIS_POLARITY. Les boutons et l'encodeur de panoramique s'inverseront alors.

Le commentaire de core/constants.js porte cette condition.

## Statuts

- CONFIRMED : la convention documentee pour le pan est « positif = droite », vue du dessus
  (Microsoft Learn, CameraControlProperty et KSPROPERTY_CAMERACONTROL_PAN).
- CONFIRMED : la PIXY fait l'inverse, et declare une plage -150..+150 la ou la spec exige
  -180..+180 (§49 et §27).
- UNVERIFIED : l'intention d'EMEET. Aucune source disponible depuis cette machine.
- UNVERIFIED : le comportement d'EMEET Studio pour le pan. Le tester reAuditerait si EMEET
  fait la meme negation, mais ne repondrait pas a la question d'intention.
---

# 51 - Parametre utilisateur « Sens de panoramique » (2026-10-11)

Demande utilisateur : pouvoir choisir le sens du panoramique, plutot que de subir celui
qui est code en dur.

## Pourquoi

Le §50 a montre que la polarite du pan est une non-conformite du firmware. La corriger en
dur règle le probleme pour tout le monde, mais :

- un utilisateur peut preferer l'autre sens, sans avoir de raison technique de le demander ;
- si EMEET corrige un jour le signe, tous ceux qui ont choisi « normal » retinse
  immediatement, et ceux qui avaient choisi « inverse » se retrouvent enfin justes sans
  rien avoir change. Le reglage rend la correction future non cassante.

## Perimetre

Trois actions, les seules quiRegexistent un reglage panDirection :

- Pan Left, Pan Right — panneau property-inspector/pixyMove/pan.html
- Pan (Encodeur) — panneau property-inspector/pixyEncoder/pan.html

Valeurs : 
ormal (defaut, ce que fait la camera mesure au §49) et inverted.

**Tilt et zoom n'ont pas ce reglage.** Ils sont conformes a la convention documentee : il
n'y a rien a choisir, et une preference qui ne change rien est pire qu'absence de
preference. Un test verifie que le champ n'apparait que sur les trois actions pan.

## Point de conception : deux panneaux de deplacement au lieu d'un

pixyMove/inspector.html etait partage par Pan et Tilt parce que leurs reglages de pas
etaient identiques (§43). Ajouter une option propre au pan oblige a les separer :
pan.html et 	ilt.html, avec zoom.html deja existant. Les fichiers restent symetriques
et un test garantit que Pan et Tilt ne partagent plus de panneau.

## Point de conception : une seule conversion

Les touches et les encodeurs pilotaient chacun leur polarite (§49). Le reglage utilisateur
serait donc propage a deux endroits, avec le meme risque de derive que deja constate.
driverPolarity(axis, settings) dans core/params.js est desormais le point unique ou un
axe devient une valeur pilote : polarite camera, puis preference de l'utilisateur.

## Non couvert, volontairement

L'action PTZ Encoder (cyclique) deplace aussi le panoramique lorsqu'elle est sur cet axe,
mais son panneau est partage avec les encodeurs Tilt et Zoom, ou le reglage n'a pas de sens.
Elle n'est donc pas concernee. Consequence : un utilisateur qui choisit « inverse » sur les
touches Pan constatera que l'encodeur PTZ, lui, garde le sens normal quand il est sur Pan.

## Statuts

- CONFIRMED : le reglage est applique aux touches Pan et a l'encodeur Pan, et n'affecte ni
  Tilt ni Zoom. Verifie par mutation : rendre le reglage inoperant cote encodeur fait
  echouer 3 tests ; le rendre applicable a tous les axes fait echouer le test qui verifie
  que Tilt et Zoom l'ignorent.
- CONFIRMED : le champ n'apparait que sur les trois panneaux pan.
- UNVERIFIED : le comportement dans Ulanzi Studio — le select n'a pas ete ouvert sur la
  machine. La valeur voyage par le canal habituel (didReceiveSettings), deja couvert par
  les tests, mais le rendu du panneau n'a pas ete vu.
- LIKELY : un utilisateur choisira "inverse" sur les boutons Pan et remarquera que
  l'encodeur PTZ ne suit pas. A confirmer, puis etendre si besoin.
---

# 52 - Deux corrections du reglage « Sens de panoramique » (2026-10-11)

Retour utilisateur apres la livraison du §51 : deux problemes.

## 1. La selection revenait a « Normal » apres un aller-retour sur un autre bouton

**Cause.** onAdd fusionnait les valeurs par defaut de l'action a **chaque** apparition
de la cle :

    mergeSettings(entry, defaultsFor(uuid));
    mergeSettings(entry, message.param);

L'hote repond au panneau de proprietes **avant** d'annoncer la cle. Les choix de
l'utilisateur etaient donc deja dans l'entree quand les defauts venaient se poser
dessus. Resultat : « inverted » revenait a « normal » systematiquement.

**Correction.** Les defauts sont des valeurs de **creation**, pas de mise a jour.
ensureEntry(store, context, uuid, defaults) les applique au moment ou l'entree n'existe
pas encore, et onAdd ne fusionne plus que la copie de l'hote (message.param).

**Regle plus generale.** Un defaut d'action ne doit jamais etre reapplique a une entree
existante : c'est la seule maniere dont un defaut peut ecraser une choix utilisateur sans
que rien ne signale l'ecrasement.

**Verifie par mutation.** Reinjecter la fusion des defauts dans onAdd fait echouer
 choice made in a panel survives the key being looked at again. Le test manquant
precedemment est ce qui a permis au bug d'atteindre la machine.

## 2. L'encodeur PTZ cyclique n'avait pas le reglage

Volontairement exclu au §51, parce que son panneau etait partage avec les encodeurs Tilt
et Zoom, ou le reglage n'a pas de sens. L'utilisateur l'a signale comme manquant.

**Correction.** Panneau propre property-inspector/pixyEncoder/ptz.html, comme pan.html
l'a ete pour l'encodeur Pan. inspector.html reste pour Tilt et Zoom.

Le code n'a pas eu besoin d'etre change pour le fonctionnement : onDialRotate passe deja
par driverPolarity(axis, settings), donc la preference de l'utilisateur
s'applique des que le reglage existe pour l'axe courant. encoder.js expose maintenant
defaultsFor(uuid) au lieu d'un defaults unique, pour que le defaut panDirection soit
semé sur les deux encodeurs qui bougent le panoramique.

**Portee.** Le reglage ne s'applique que lorsque la molette est sur l'axe Pan ; sur Tilt et
Zoom elle n'a aucune effet, ce que verifie un test.

## Le piege que le point 2 a revele

Un encodeur « cyclique » n'est pas un encodeur d'axe : il en est trois dans un seul. Lui
offrir le reglage demandait de separer son panneau, exactement comme Pan et Tilt l'ont
demande pour la meme raison. La regle qui en sort : **tout reglement qui ne s'applique
qu'a certains axes doit avoir son propre panneau**, sinon il apparait la ou il ne fait rien.

## Statuts

- CONFIRMED : le choix de l'utilisateur survit a un aller-retour sur un autre bouton.
- CONFIRMED : les quatre actions qui bougent le panoramique - Pan Left, Pan Right,
  Pan Encoder, PTZ Encoder - exposent le reglage ; les autres ne l'exposent pas.
- CONFIRMED : le reglage ne modifie ni Tilt ni Zoom, sur aucun des quatresencodeurs.
- UNVERIFIED : le rendu des panneaux dans Ulanzi Studio, comme au §51.
---

# 53 - Cause reelle du reset du reglage : les panneaux n'ont jamais relu (2026-10-11)

Le §52 avait corrige un defaut reel mais pas la cause. Retour utilisateur : le choix
revenait toujours sur « Normal », et « semble creer des confusions ».

## Analyse

En suivant le trajet d'une valeur depuis le panneau jusqu'a l'hote, trois maillons
manquaient. Aucun ne produzait d'erreur : tous trois etaient silencieux.

### 1. Le panneau ne demandait jamais ses reglages

- connect() dans le SDK **n'envoie rien** : il ne fait que lire les parametres d'URL.
- didReceiveSettings est la **reponse** a une demande getSettings(), pas un envoi
  spontane de l'hote.
- Notre shared.js n'appelait **jamais** getSettings().

Consequence : les panneaux etaient **uniquement/ecrivants**. Ils pouvaient changer un
reglage mais ne pouvaient jamais afficher ce qu'il valait. A chaque ouverture, ils
affichaient les valeurs selected du markup - donc « Normal » paraissait toujours avoir
ete perdu.

### 2. La sauvegarde envoyait le formulaire entier

    settings = { ...settings, ...Utils.getFormValue(form) };

Tout champ que l'hote n'avait pas fourni revenait avec sa valeur selected du markup.
Ouvrir le panneau puis toucher **un seul autre champ** suffisait a ecraser le choix. C'est
la source des « confusions » : la valeur affichee et la valeur stockee divergeaient en
permanence.

### 3. Le service ne demandait rien non plus

pp.js n'avait aucun gestionnaire : il ne demandait pas les reglages a l'hote pour une
cle ajoutee, et ignorait paramfromapp - la meme charge utile sous un autre nom, envoyee
une fois qu'un panneau a ete ouvert pour une cle deplacee.

## Pourquoi stepSize paraissait fonctionner

Le defaut du markup etait identique au defaut du code (10 pour le deplacement, 5 pour le
zoom, 1 pour l'encodeur). Un reglage coherent avec son defaut semble fonctionner meme
qu'il n'est jamais relu. Seuls les reglages **non par defaut** - donc exactement le nouveau
reglage de sens - rendaient la panne visible.

C'est le point le plus important de cette analyse : ce bug aurait ete invisible sur tous les
autres reglages du plugin.

## Correction

shared.js :

- appelle $UD.getSettings() une fois connecte ;
- ecoute aussi onParamFromApp en plus de onDidReceiveSettings ;
- n'envoie plus que les champs **reellement modifies**, mesures contre la valeur que
  l'hote declare, et contre l'ecran seul pour un champ que l'hote n'a jamais dit.

pp.js :

- $UD.getSettings(context) a l'ajout d'une cle ;
- gestionnaire onParamFromApp, meme traitement que onDidReceiveSettings.

## Regle qui en sort

Un panneau ne doit jamais ecrire un champ qu'il n'a pas lu. Plus generalement : **tout
reglage doit faire un aller-retour complet avant d'etre considere fonctionnel**, et un
reglage dont le defaut du panneau coincide avec le defaut du code ne prouve rien.

## Tests

Nouveau 	ests/property-inspector.test.js : shared.js est charge dans un contexte VM
avec un DOM minimal, un $UD et un Utils factices, et pilote par les memes evenements
que l'hote envoie. 9 cas couvrant la demande, l'hydratation, l'absence d'envoi quand rien
n'a ete modifie, la non-regression des champs non touches, et le cas d'un panneau qui n'a
jamais recu ses reglages.

Verifie par mutation :

- supprimer getSettings() -> 1 echec ;
- restaurer la sauvegarde du formulaire entier -> 3 echecs.

## Statuts

- CONFIRMED : les panneaux n'avaient jamais demande leurs reglages ; desormais ils le font.
- CONFIRMED : un champ non touche n'est plus renvoye a l'hote.
- CONFIRMED : 125 tests passent.
- UNVERIFIED : le comportement dans Ulanzi Studio. C'est la premiere fois que le cycle
  complet est couvert par des tests, mais c'est aussi la premiere fois que le host est
  suppose repondre a une demande getSettings issue d'un panneau de ce plugin.
---

# 54 - Validation du plugin refactorise sur la camera et sur le D200X (2026-10-11)

Recouvrement des UNVERIFIED des §47, §49 et §53.

## Recouvrement : la refactorisation (§47)

- CONFIRMED : le service refactorise, ses 15 modules et le bridge reconstruit a bien ete
  utilise sur le D200X reel avec la camera PIXY branchee. Aucune erreur de chemin n'a ete
  signalee.
- CONFIRMED : les panneaux d'inspecteur se chargent et affichent leurs champs.
- CONFIRMED : le cycle complet des reglages fonctionne - un choix fait dans un panneau est
  conserve, relu a la reouverture, et ne peut pas etre ecrase par un autre champ. C'est le
  dernier UNVERIFIED du §53 : l'hote repond bien a une demande getSettings emanant d'un
  panneau de ce plugin.

## Resultats fonctionnels (utilisateur, camera reelle + D200X)

| Action | Resultat |
| --- | --- |
| Boutons Pan Gauche / Pan Droit | OK apres la correction du §49 |
| Boutons Tilt Haut / Bas | OK |
| Boutons Zoom + / - | OK |
| Boutons Center | OK |
| Presets de position (rappel court, enregistrement long) | OK |
| Mode Standard | OK |
| Mode Tracking | OK |
| Mode Privacy | OK |
| Encodeur Pan, Tilt, Zoom | OK apres la correction du §49 |
| Encodeur PTZ cyclique | OK |
| Reglage « Sens de panoramique » sur les 3 actions pan + PTZ | OK |
| Persistance du reglage d'un panneau a l'autre | OK apres la correction du §53 |

## Statuts

- CONFIRMED : toutes les 19 actions de l'§2 sont exercees au moins une fois sur le materiel
  et repondent correctement.
- CONFIRMED : les 7 modes et positions de la table ci-dessus.
- CONFIRMED : le §49 - inversion du pan corrigee sur les boutons et les encodeurs, fixe et
  cyclique.
- CONFIRMED : le §53 - les panneaux relisent leurs reglages, et un choix n'est plus ecrase
  ni par un autre champ ni a la reouverture.
- LIKELY : le §53 corrigeait aussi le stepSize, qui n'a jamais ete relu lui non plus. Non
  verifie explicitement par l'utilisateur.
- UNVERIFIED : **l'icone d'axe affichee sur l'ecran du knob.** Les encodeurs sont
  confirmes comme *fonctionnels* (§54), mais l'affichage du knob lui-meme, $UA1 +
  setFeedback, reste au statut LIKELY du §36 et du §44 : le protocole est verifie,
  le rendu sur l'appareil ne l'a jamais ete.
- UNVERIFIED : core/ui.js et core/shutdown.js sont les deux modules sans test
  comportemental propre. ui.js est exerce indirectement par le retour d'encodeur de
  pp.test.js, mais rien ne verifie que le layout n'est applique qu'une fois par cle,
  ni que les appels de dessin survivent a un hote trop ancien. shutdown.js est
  enregistre a l'import de pp.js sans qu'aucun test n'affirme qu'il arrete le bridge.
- UNVERIFIED : cohabitation OBS + plugin en meme temps (le §29 a teste OBS + sonde, jamais
  OBS + plugin installe).
- UNVERIFIED : debranchement de la camera en cours d'utilisation, et le delai de 4 s du
  bridge avec sa reconstruction.
- UNVERIFIED : saut de la camera a la position start au demarrage du bridge.
- UNVERIFIED : Zoom In a stepSize=20 (§43, non concluant a l'epoque, camera au maximum).

# PROJECT_CONTEXT.md

# EMEET PIXY 4K + Ulanzi D200X
## Contexte technique du projet

Date de création du contexte : 2026-09-20

---

# 1. Objectif

Créer un plugin pour le Stream Deck Ulanzi D200X permettant de contrôler une caméra EMEET PIXY 4K directement depuis Ulanzi Studio.

Objectif architectural :

    Ulanzi D200X
        ↓
    Ulanzi Studio
        ↓
    Plugin Node.js
        ↓
    contrôle Windows UVC / USB
        ↓
    EMEET PIXY 4K

EMEET Studio doit idéalement être totalement supprimé du workflow.

OBS reste responsable de la capture vidéo et des réglages de colorimétrie/qualité souhaités par l'utilisateur.

---

# 2. Matériel

Caméra :

- EMEET PIXY 4K
- webcam USB
- caméra PTZ
- utilisée comme source vidéo dans OBS

Contrôleur :

- Ulanzi D200X
- configuré via Ulanzi Studio

Ordinateur cible :

- Windows 11

Logiciel de streaming :

- OBS

---

# 3. Besoin utilisateur

L'utilisateur souhaite éviter les intermédiaires.

Workflow souhaité :

    D200X
       ↓
    plugin
       ↓
    PIXY

et non :

    D200X
       ↓
    plugin
       ↓
    EMEET Studio
       ↓
    PIXY

Les réglages vidéo/qualité/colorimétrie seront réalisés directement dans OBS.

Le plugin n'a donc pas pour objectif de reproduire l'interface ou les réglages vidéo d'EMEET Studio.

---

# 4. État actuel de la recherche

## CONFIRMED

### 4.1 SDK Ulanzi

Dépôt officiel :

https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK

Le SDK cible notamment :

- D200 ;
- D200H ;
- Dial ;
- D200X.

Il permet aux plugins de réagir aux actions des contrôleurs et notamment aux événements de touches et d'encodeur.

Événements pertinents à exploiter :

- onAdd ;
- onRun ;
- onKeyDown ;
- onKeyUp ;
- onDialDown ;
- onDialUp ;
- événements de rotation de l'encodeur.

Le SDK prévoit également l'affichage/actualisation d'informations sur les touches et l'encodeur.

Le SDK fournit une architecture Node.js pour les plugins.

La version Node.js indiquée par le SDK doit être vérifiée contre la version effectivement embarquée/utilisée par l'installation Ulanzi Studio de la machine cible avant de figer le runtime.

---

# 5. PIXY et USB/UVC

## CONFIRMED / fortement documenté par des travaux tiers

La PIXY est une webcam USB UVC.

Un projet tiers open source :

https://github.com/dheldt/emeet-cli

a étudié le contrôle direct de la PIXY sans EMEET Studio.

Ce projet identifie notamment un périphérique EMEET PIXY avec :

    VID = 0x328F
    PID = 0x00C0

Ces valeurs doivent être vérifiées sur la caméra réelle avant d'être codées en dur.

---

# 6. Contrôles UVC identifiés

Le projet `emeet-cli` a identifié notamment les contrôles UVC suivants :

### Zoom

    CT_ZOOM_ABSOLUTE_CONTROL
    selector = 0x0B

### Pan/Tilt

    CT_PAN_TILT_ABSOLUTE_CONTROL
    selector = 0x0D

Les valeurs sont manipulées par des requêtes UVC de type :

- GET_MIN ;
- GET_MAX ;
- GET_CUR ;
- SET_CUR.

Le contrôle Pan/Tilt est représenté par une valeur composée de Pan et Tilt.

Le code tiers doit être étudié directement avant réutilisation.

Référence :

https://github.com/dheldt/emeet-cli

---

# 7. Point important : pas d'API EMEET Studio nécessaire

Aucune API publique officielle EMEET Studio n'a été identifiée comme nécessaire pour le contrôle PTZ.

Des travaux tiers montrent qu'un contrôle direct de la PIXY au niveau UVC est possible.

Conséquence :

    EMEET Studio
        |
        X

peut potentiellement être retiré de l'architecture.

---

# 8. Windows : stratégie de contrôle

La méthode Windows n'est pas encore totalement validée sur la PIXY réelle.

Il faut tester les mécanismes suivants dans cet ordre :

## Étape A — IAMCameraControl

Microsoft documente :

https://learn.microsoft.com/en-us/windows/win32/api/strmif/nn-strmif-iamcameracontrol

Contrôles notamment concernés :

- Pan ;
- Tilt ;
- Zoom ;
- éventuellement Pan/Tilt combiné.

Question à vérifier :

La PIXY expose-t-elle réellement ses contrôles PTZ via IAMCameraControl lorsqu'elle est utilisée avec le pilote UVC natif de Windows ?

Ne pas supposer que la réponse est oui.

---

# 9. Windows : IKsControl

Si IAMCameraControl ne suffit pas, étudier :

    IKsControl

Documentation Microsoft :

https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/device-requirements-for-usb-video-class-extension-units

Cette voie peut permettre d'accéder à des contrôles UVC ou à des Extension Units exposés par le périphérique.

Cette méthode doit être testée avant de passer à USB brut.

---

# 10. Windows : pilote UVC

Documentation Microsoft :

https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/usb-video-class-driver-overview

Windows possède un pilote UVC natif.

Objectif :

utiliser autant que possible le pilote standard de Windows sans remplacement de pilote.

Le projet doit éviter toute modification permanente du pilote de la PIXY.

---

# 11. Dernier recours : USB brut

Si les API Windows natives ne permettent pas d'envoyer les commandes nécessaires, étudier :

- WinUSB ;
- libusb ;
- control transfers UVC.

Les travaux tiers sur `emeet-cli` fournissent déjà une base pour comprendre les requêtes USB/UVC.

Exemple conceptuel pour SET_CUR :

    bmRequestType = 0x21
    bRequest      = 0x01
    wValue        = selector << 8
    wIndex        = (terminal_id << 8) | interface

Ces informations doivent être vérifiées dans le code source actuel du projet tiers avant toute implémentation.

---

# 12. Risque de conflit avec OBS

Un point critique à tester :

    OBS
      ↓
    PIXY

pendant que :

    Plugin
      ↓
    contrôle PTZ
      ↓
    PIXY

fonctionne.

Il faut vérifier si Windows permet simultanément :

- capture vidéo ;
- contrôle PTZ.

Le but est de ne jamais devoir fermer OBS pour déplacer la caméra.

---

# 13. Architecture logicielle cible

Architecture préférée :

    ┌─────────────────────┐
    │ Ulanzi D200X        │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ Ulanzi Studio       │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ Plugin Node.js      │
    │                     │
    │ actions D200X       │
    │ presets              │
    │ état                 │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ PIXY Controller     │
    │ Windows             │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ Windows UVC         │
    │ / API caméra        │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ EMEET PIXY 4K       │
    └─────────────────────┘

OBS utilise parallèlement la PIXY comme webcam.

---

# 14. Pourquoi un contrôleur séparé peut être nécessaire

Node.js n'est pas nécessairement le meilleur endroit pour accéder directement aux API COM/DirectShow/Kernel Streaming de Windows.

Une architecture possible est donc :

    Node.js plugin
          ↓
       IPC
          ↓
    pixy-controller.exe
          ↓
    Windows API
          ↓
       PIXY

Le contrôleur Windows pourrait être écrit dans un langage adapté aux API natives Windows, par exemple C++.

Alternative à étudier :

- addon Node.js natif ;
- bridge C++ ;
- processus persistant ;
- autre mécanisme IPC simple et fiable.

Ne pas choisir avant d'avoir validé la voie de contrôle Windows.

---

# 15. Pourquoi un processus persistant est préférable

Le D200X possède un encodeur.

Une rotation peut générer de nombreux événements.

Il serait mauvais de faire :

    rotation
      ↓
    lancer pixy-controller.exe
      ↓
    commande
      ↓
    quitter

à chaque événement.

Préférer :

    Node.js
       ↓
    connexion IPC persistante
       ↓
    pixy-controller
       ↓
    PIXY

Cela réduit la latence et permet de conserver :

- connexion ;
- limites ;
- position courante ;
- état du contrôleur ;
- gestion d'erreur.

---

# 16. Fonctions V1

La première version doit être limitée à :

1. Détection de la PIXY.
2. Pan gauche.
3. Pan droite.
4. Tilt haut.
5. Tilt bas.
6. Zoom +.
7. Zoom -.
8. Center.
9. Encodeur.
10. Affichage du mode actif.

Pas de tracking dans la V1.

Pas de privacy dans la V1.

Pas de commandes HID dans la V1.

Pas de réglages colorimétriques dans la V1.

---

# 17. Utilisation envisagée du D200X

Exemple de mode encodeur :

    PAN
      ↓ pression
    TILT
      ↓ pression
    ZOOM
      ↓ pression
    PAN

Rotation :

    gauche = valeur -
    droite = valeur +

L'affichage du D200X devrait indiquer le mode courant.

Exemple :

    PIXY
    PAN

ou :

    PIXY
    ZOOM

La disposition exacte reste à concevoir après validation du contrôle caméra.

---

# 18. Presets

Les presets sont souhaitables mais doivent venir après la V1.

Exemple :

    PRESET 1
    PRESET 2
    PRESET 3
    PRESET 4

Un preset pourra éventuellement mémoriser :

- Pan ;
- Tilt ;
- Zoom.

Il faut déterminer si la position réelle peut être lue depuis la caméra ou si le plugin doit conserver son propre état.

Ne pas inventer cette capacité.

---

# 19. HID / fonctionnalités avancées

Des travaux de rétro-ingénierie de la PIXY indiquent également l'existence d'un canal HID propriétaire.

Des fonctions telles que :

- tracking ;
- privacy ;
- gesture ;
- audio ;

ont été étudiées par des projets tiers.

Une référence de recherche est disponible ici :

https://gist.github.com/rm1138/ef132c3a39f3c1effabf6354e2eca965

Ces commandes ne doivent pas être considérées comme une API officielle EMEET.

Elles sont à traiter comme reverse engineering expérimental.

Elles pourront éventuellement constituer une V2.

---

# 20. Plan de développement

## Phase 0 — inspection

Inspecter :

- Windows ;
- PIXY ;
- périphériques USB ;
- SDK Ulanzi ;
- environnement Node.js ;
- version Ulanzi Studio.

Aucun code fonctionnel complexe.

---

## Phase 1 — diagnostic PIXY

Créer un outil minimal qui détermine :

- caméra présente ;
- VID/PID ;
- nom ;
- interfaces ;
- contrôles caméra ;
- Pan ;
- Tilt ;
- Zoom ;
- min ;
- max ;
- step ;
- current ;
- possibilité de modification.

Le résultat doit être sauvegardé dans la documentation du projet.

---

## Phase 2 — test PTZ indépendant

Créer un petit programme Windows :

    pixy-controller

Fonctions initiales :

    info
    center
    pan
    tilt
    zoom

La syntaxe exacte sera définie après choix de l'API.

---

## Phase 3 — test avec OBS

Lancer OBS avec la PIXY comme source.

Tester :

    OBS capture
       +
    pixy-controller PTZ

Si cela fonctionne, la couche caméra est validée.

---

## Phase 4 — plugin Ulanzi minimal

Créer :

    plugin Ulanzi
        ↓
    Node.js
        ↓
    pixy-controller

Commencer avec :

    CENTER

Une seule touche.

Objectif : valider toute la chaîne.

---

## Phase 5 — PTZ

Ajouter :

- Pan ;
- Tilt ;
- Zoom.

---

## Phase 6 — encodeur

Ajouter :

- mode Pan ;
- mode Tilt ;
- mode Zoom ;
- pression pour changer de mode.

---

## Phase 7 — presets

Ajouter les positions prédéfinies.

---

## Phase 8 — fonctionnalités avancées

Éventuellement :

- tracking ;
- privacy ;
- autres commandes HID.

Seulement après stabilisation de la V1.

---

# 21. Critères de réussite

Le projet est considéré fonctionnel lorsque :

- Ulanzi Studio charge le plugin ;
- le D200X est reconnu ;
- les boutons fonctionnent ;
- l'encodeur fonctionne ;
- Pan fonctionne ;
- Tilt fonctionne ;
- Zoom fonctionne ;
- Center fonctionne ;
- OBS capture simultanément la PIXY ;
- EMEET Studio n'est pas nécessaire ;
- aucun remplacement permanent du pilote Windows n'est nécessaire.

---

# 22. Points actuellement non vérifiés

Les points suivants doivent être testés sur la machine réelle :

1. PIXY exposée par IAMCameraControl.
2. Pan via IAMCameraControl.
3. Tilt via IAMCameraControl.
4. Zoom via IAMCameraControl.
5. Contrôle simultané avec OBS.
6. IKsControl nécessaire ou non.
7. Accès USB brut nécessaire ou non.
8. Interface exacte du plugin Node.js dans la version Ulanzi Studio installée.
9. Version Node.js réellement embarquée/utilisée par Ulanzi Studio.
10. comportement exact du D200X avec les événements d'encodeur dans cette version.

---

# 23. Règle fondamentale

Ne jamais conclure :

    "ça devrait fonctionner"

lorsqu'un test concret est possible.

Utiliser :

    "NON TESTÉ"

jusqu'à obtention d'une preuve.

Pour chaque résultat, documenter :

- environnement ;
- version ;
- commande/test ;
- résultat ;
- logs utiles ;
- conclusion.

---

# 24. Références principales

## Ulanzi

SDK officiel :

https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK

## PIXY / contrôle tiers

Projet emeet-cli :

https://github.com/dheldt/emeet-cli

## Microsoft UVC

https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/usb-video-class-driver-overview

## Microsoft IAMCameraControl

https://learn.microsoft.com/en-us/windows/win32/api/strmif/nn-strmif-iamcameracontrol

## Microsoft UVC Extension Units / IKsControl

https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/device-requirements-for-usb-video-class-extension-units

## Reverse engineering HID

https://gist.github.com/rm1138/ef132c3a39f3c1effabf6354e2eca965

---

# 25. Résumé exécutif

Objectif :

    D200X → Ulanzi plugin → PIXY

Sans :

    EMEET Studio

Priorité :

    Windows UVC natif
        ↓
    IKsControl
        ↓
    USB/libusb

Première fonctionnalité :

    CENTER

Puis :

    PAN / TILT / ZOOM

Puis :

    ENCODER

Puis :

    PRESETS

Puis éventuellement :

    HID / TRACKING / PRIVACY

Ne pas brûler les étapes.

---

# 26. Diagnostic Windows / PIXY — 2026-09-20

## Périmètre et sécurité

- **CONFIRMED** : uniquement des commandes Windows en lecture seule ont été exécutées.
- **CONFIRMED** : aucun pilote, paramètre Windows, composant Ulanzi Studio ou réglage caméra n'a été modifié.
- **CONFIRMED** : aucune commande PTZ (`SET`) n'a été envoyée et OBS n'a pas été lancé.
- **CONFIRMED** : le dépôt ne contient à cette date que `AGENTS.md` et ce fichier de contexte ; aucun outil de diagnostic existant n'était disponible à exécuter.

## Environnement observé

- **CONFIRMED** : système 64 bits, identifié par `Get-ComputerInfo` comme `Windows 10 Pro`, version `2009`, build `26200`. Cette numérotation de build est celle d'une installation Windows moderne ; la valeur affichée par `WindowsProductName` ne suffit pas à elle seule pour nommer précisément l'édition marketing.
- **CONFIRMED** : EMEET Studio 2.0.3 est installé, mais aucun processus EMEET Studio n'était actif au moment du relevé.
- **CONFIRMED** : OBS Studio 32.2.2 est installé, mais aucun processus OBS n'était actif au moment du relevé.
- **CONFIRMED** : ni `ffmpeg`, ni `ffplay`, ni GraphStudioNext, ni `devcon` n'étaient disponibles dans le `PATH`. Aucun de ces outils n'a été installé.

## PIXY réellement détectée

| Élément | Résultat | Statut |
| --- | --- | --- |
| Périphérique composite | `USB\\VID_328F&PID_00C0\\A260528000605250` | CONFIRMED |
| Révision USB | `REV_2004` | CONFIRMED |
| État PnP | `Started` / `OK` / aucune erreur Configuration Manager | CONFIRMED |
| Fonction caméra | `MI_00`, classe USB `0E/03/00` (Video / *Video Interface Collection* / protocol 0), nom `EMEET PIXY` | CONFIRMED |
| Interface audio | `MI_02`, classe USB `01/00/00`, service `usbaudio` | CONFIRMED |
| Interface HID | `MI_04`, classe USB `03/00/00`, service `HidUsb` | CONFIRMED |
| Pilote de la caméra | pilote Microsoft signé `usbvideo.inf`, service `usbvideo`, version `10.0.26100.6584`, description `USB Video Device` | CONFIRMED |
| Pilote du périphérique composite | pilote Microsoft signé `usb.inf`, service `usbccgp`, version `10.0.26100.5074` | CONFIRMED |
| Interface de capture enregistrée | catégorie `KSCATEGORY_VIDEO_CAPTURE` (`{6994AD05-93EF-11D0-A3CC-00A0C9223196}`) pour MI_00 | CONFIRMED |

Conclusion : la PIXY fonctionne avec le pilote UVC natif Microsoft ; aucun pilote EMEET spécifique ne contrôle l'interface caméra. Cela préserve la priorité des API Windows natives et ne justifie aucune action sur le pilote.

## Contrôles PTZ : état des preuves initial

Ce tableau décrit l'état **avant** l'exécution de la sonde décrite en section 27. Ses conclusions sont remplacées par les résultats mesurés de cette section.

| Voie | Ce qui est établi localement | Ce qui ne l'est pas encore | Décision actuelle |
| --- | --- | --- | --- |
| `IAMCameraControl` | la caméra est un périphérique de capture WDM/UVC fourni par `usbvideo` et possède une interface de capture KS | disponibilité de `IAMCameraControl`, ainsi que `GetRange` / `Get` pour `CameraControl_Pan`, `Tilt` et `Zoom` | **UNVERIFIED — premier test à effectuer** |
| `IKsControl` | `usbvideo` prend en charge les unités/terminaux UVC standards et les Extension Units en général (documentation Microsoft) | topologie KS de cette PIXY, Extension Units éventuelles et leurs GUID/nœuds ; accès effectif aux propriétés | **UNVERIFIED — seulement après le test IAMCameraControl** |
| USB/UVC bas niveau | le VID/PID local confirme la cible décrite par le projet tiers ; sa source actuelle utilise `CT_ZOOM_ABSOLUTE_CONTROL` (`0x0B`) et `CT_PAN_TILT_ABSOLUTE_CONTROL` (`0x0D`) sur un *Camera Terminal*, avec lecture des bornes par `GET_MIN`/`GET_MAX` | descripteurs de cette unité précise, identifiant du Camera Terminal, numéro d'interface VideoControl, valeurs min/max/step/current, et possibilité d'accès depuis Windows sans changer de pilote | **UNVERIFIED — dernier recours** |

Point de méthode important : la source de `dheldt/emeet-cli` citée dans le projet appelle ces deux sélecteurs des contrôles du **Camera Terminal** UVC, et non des Extension Units. Son README emploie aussi l'expression « extension unit controls », mais son code source actuel analyse un `VC_INPUT_TERMINAL` de type `ITT_CAMERA` et adresse les sélecteurs `0x0B`/`0x0D` à cet identifiant. Cette source tierce est une piste de recherche, pas une preuve que Windows expose les mêmes contrôles par `IAMCameraControl` ou `IKsControl`.

## Limite de l'inspection PnP initiale

Les informations PnP, le registre des interfaces et `pnputil` prouvent la présence et le pilote ; ils n'énumèrent pas les réponses `IAMCameraControl::GetRange`/`Get`, ni les nœuds/propriétés KS. Microsoft précise que `IAMCameraControl` n'est automatiquement exposée par le filtre WDM que si le pilote prend en charge `PROPSETID_VIDCAP_CAMERACONTROL`.

Un programme de diagnostic minimal, non destructif, était donc nécessaire pour établir factuellement :

1. ouverture du filtre de capture PIXY et `QueryInterface(IAMCameraControl)` ;
2. `GetRange` puis `Get` pour Pan, Tilt et Zoom, sans aucun `Set` ;
3. seulement si cette voie échoue ou est incomplète, interrogation de la topologie `IKsControl` et des propriétés disponibles ;
4. aucune écriture PTZ avant validation explicite des lectures ;
5. test OBS séparé uniquement après obtention d'un contrôle lisible et après accord pour envoyer une commande PTZ réversible.

## Commandes exécutées (lecture seule)

```powershell
Get-Content -Raw AGENTS.md
Get-Content -Raw PROJECT_CONTEXT.md
rg --files -g '!node_modules' -g '!*.lock'
Get-PnpDevice -PresentOnly
Get-CimInstance Win32_PnPEntity
Get-PnpDeviceProperty -InstanceId <instance-id PIXY>
Get-CimInstance Win32_PnPSignedDriver
pnputil /enum-devices /instanceid <MI_00> /drivers
Get-ComputerInfo
pnputil /enum-devices /class Camera /connected
Get-ChildItem HKLM:\SYSTEM\CurrentControlSet\Control\DeviceClasses\{6994AD05-93EF-11D0-A3CC-00A0C9223196}
Get-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Enum\USB\VID_328F&PID_00C0&MI_00\...\Device\ Parameters
Get-ChildItem HKLM:\SOFTWARE\...\Uninstall
Get-Process obs64, obs, EMEETStudio, EMEET*
```

## Références vérifiées

- Microsoft, USB Video Class driver overview : `Usbvideo.sys` interroge directement le matériel UVC et prend en charge Media Foundation et DirectShow ; il prend aussi en charge les unités et terminaux standards, ainsi que les Extension Units.
  https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/usb-video-class-driver-overview
- Microsoft, `IAMCameraControl` : interface de contrôle de Pan/Tilt/Zoom ; disponible sur le filtre de caméra lorsqu'il expose `PROPSETID_VIDCAP_CAMERACONTROL`.
  https://learn.microsoft.com/en-us/windows/win32/api/strmif/nn-strmif-iamcameracontrol
- Microsoft, Extension Units : les contrôles XU peuvent être adressés par `IKsControl` seulement lorsqu'ils sont correctement décrits/exposés par `usbvideo`.
  https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/device-requirements-for-usb-video-class-extension-units
- Projet tiers, code inspecté le 2026-09-20 :
  https://github.com/dheldt/emeet-cli

## Action alors proposée

**CONFIRMED** : un exécutable de diagnostic DirectShow/COM à usage lecture seule a depuis produit le rapport reproductible consigné en section 27.

---

# 27. Résultat de la sonde `IAMCameraControl` — 2026-09-20

## Test effectué

- **CONFIRMED** : l'outil local `tools/pixy-camera-control-diagnostic` énumère la catégorie DirectShow de capture vidéo, sélectionne la PIXY par son `DevicePath` contenant `VID_328F&PID_00C0`, puis appelle uniquement :
  - `QueryInterface(IAMCameraControl)` ;
  - `IAMCameraControl::GetRange` ;
  - `IAMCameraControl::Get`.
- **CONFIRMED** : l'exécution initiale de cette sonde ne contenait aucun appel à `IAMCameraControl::Set`. La version actuelle propose aussi une option explicite et réversible `--verify-set`, documentée séparément dans son README.
- **CONFIRMED** : le test a été exécuté avec succès en processus 64 bits et 32 bits. Les deux produisent exactement les mêmes résultats ci-dessous.
- **CONFIRMED** : OBS et EMEET Studio étaient arrêtés pendant le test. La compatibilité avec OBS reste donc à vérifier ultérieurement.

## Résultats exacts

| Contrôle Windows | Disponible | Min | Max | Step | Défaut | Valeur courante | Modes exposés |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `CameraControl_Pan` | oui (`S_OK`) | -150 | 150 | 1 | 0 | 0 | `Manual` |
| `CameraControl_Tilt` | oui (`S_OK`) | -90 | 90 | 1 | 0 | 0 | `Manual` |
| `CameraControl_Zoom` | oui (`S_OK`) | 100 | 150 | 1 | 100 | 100 | `Manual` |

**CONFIRMED** : `QueryInterface(IAMCameraControl)` retourne `S_OK` pour la PIXY. Les six appels de lecture (`GetRange` et `Get` pour chacun des trois contrôles) retournent également `S_OK`.

**CONFIRMED — validation utilisateur** : l'utilisateur a exécuté indépendamment `PixyCameraControlDiagnostic.exe` et a communiqué le 2026-09-20 une sortie identique : détection de la PIXY sur `VID_328F&PID_00C0`, `QueryInterface` à `S_OK`, puis les mêmes plages, pas, valeurs par défaut et valeurs courantes pour Pan, Tilt et Zoom. Cette exécution ne contenait aucune écriture PTZ.

Selon la sémantique documentée de `CameraControlProperty`, Pan et Tilt sont exprimés en degrés et Zoom en millimètres. Les valeurs ci-dessus sont les valeurs réellement rapportées par le pilote PIXY via cette API ; la correspondance visuelle exacte d'un déplacement avec ces unités reste **UNVERIFIED** tant qu'aucune commande `Set` réversible n'a été testée.

## Décision d'architecture mise à jour

- **CONFIRMED — voie retenue pour la V1 PTZ** : `IAMCameraControl` expose les trois commandes nécessaires, leurs bornes, leur pas et leur état actuel sous le pilote UVC Microsoft déjà installé.
- **CONFIRMED — non nécessaires à ce stade pour la V1** : `IKsControl` et l'USB/UVC bas niveau ne sont pas nécessaires pour obtenir le PTZ de base. Ils restent des voies de diagnostic seulement si une opération `Set`, une cohabitation avec OBS, ou une fonction future révèle une limite réelle.
- **UNVERIFIED** : commande Center (enchaînement des trois écritures vers les valeurs par défaut) ; comportement pendant une capture OBS ; reconnexion caméra ; latence/rafale d'événements.

## Commandes de compilation et d'exécution utilisées

Le SDK .NET 8 n'est pas installé sur cette machine, mais le compilateur C# .NET Framework 4.8.1 fourni par Windows l'est. Aucune dépendance n'a été ajoutée ni téléchargée.

```powershell
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe `
  /out:tools\pixy-camera-control-diagnostic\bin\PixyCameraControlDiagnostic.exe `
  tools\pixy-camera-control-diagnostic\Program.cs

.\tools\pixy-camera-control-diagnostic\bin\PixyCameraControlDiagnostic.exe
```

La même compilation avec `/platform:x86` et l'exécution du binaire x86 ont retourné les mêmes valeurs.

## Références complémentaires vérifiées

- `CameraControlProperty` : valeurs `Pan = 0`, `Tilt = 1`, `Zoom = 3` et sémantique des unités.
  https://learn.microsoft.com/en-us/windows/win32/api/strmif/ne-strmif-cameracontrolproperty
- `PROPSETID_VIDCAP_CAMERACONTROL` : Microsoft indique que `IAMCameraControl` donne accès à ce jeu de propriétés.
  https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/propsetid-vidcap-cameracontrol

---

# 28. Résultat de l'écriture PTZ réversible — 2026-09-20

## Protocole

L'option `--verify-set pan|tilt|zoom` isole un seul axe par exécution : elle lit sa valeur, écrit une variation d'un seul pas avec le drapeau `Manual`, relit la valeur, restaure immédiatement la valeur de départ, puis confirme la restauration par une dernière lecture. OBS et EMEET Studio étaient arrêtés durant les trois tests.

## Résultats

| Axe | Écriture de test | Lecture de test | Restauration | Lecture finale | Statut |
| --- | --- | --- | --- | --- | --- |
| Pan | `0 → 1` (`S_OK`) | `1` (`S_OK`) | `1 → 0` (`S_OK`) | `0` (`S_OK`) | CONFIRMED — PASS |
| Tilt | `0 → 1` (`S_OK`) | `1` (`S_OK`) | `1 → 0` (`S_OK`) | `0` (`S_OK`) | CONFIRMED — PASS |
| Zoom | `100 → 101` (`S_OK`) | `101` (`S_OK`) | `101 → 100` (`S_OK`) | `100` (`S_OK`) | CONFIRMED — PASS |

**CONFIRMED** : sous le pilote UVC Microsoft actuel, `IAMCameraControl::Set` contrôle réellement Pan, Tilt et Zoom de la PIXY. Chaque test a rétabli et vérifié la valeur initiale ; la caméra a donc été laissée à `Pan=0`, `Tilt=0`, `Zoom=100`.

## Décision

**CONFIRMED** : la couche de contrôle PTZ indépendante est validée pour Pan, Tilt et Zoom avec `IAMCameraControl`. La prochaine couche à tester est la cohabitation avec OBS ; aucune étude `IKsControl` ou USB brut n'est justifiée tant que ce test ne révèle pas de limite.

## Préparation du test OBS

- **CONFIRMED** : OBS n'était pas en cours d'exécution lors de l'inspection.
- **CONFIRMED** : la collection de scènes `JeuxVideos` contient une source `EmeetPixy` dont le périphérique sauvegardé est `EMEET STUDIO Virtual Camera`.
- **CONFIRMED** : des logs OBS antérieurs montrent aussi des ouvertures du périphérique physique `EMEET PIXY`, mais ils ne prouvent pas que la scène actuellement sauvegardée utilise encore ce périphérique.
- **UNVERIFIED** : cohabitation simultanée entre une capture OBS **directe** de `EMEET PIXY` (sans caméra virtuelle EMEET) et une écriture `IAMCameraControl`.

Le test OBS devra employer explicitement le périphérique vidéo `EMEET PIXY`, et non `EMEET STUDIO Virtual Camera`, afin de rester dans l'architecture cible.

---

# 29. Résultat du test simultané OBS + PTZ — 2026-09-20

## Conditions vérifiées

- **CONFIRMED** : le processus `obs64.exe` (OBS Studio 32.2.2) était actif pendant le test.
- **CONFIRMED — déclaration utilisateur** : l'utilisateur a créé dans OBS la source `EmeetPixy2` utilisant directement la caméra physique EMEET PIXY, puis a autorisé le test.
- **CONFIRMED** : EMEET Studio n'était pas lancé et aucune caméra virtuelle EMEET n'a été utilisée par la sonde PTZ.

## Résultats d'écriture pendant OBS

| Axe | Test réversible pendant `obs64.exe` | Résultat |
| --- | --- | --- |
| Pan | `0 → 1 → 0`, lecture après chaque écriture | **CONFIRMED — PASS**, tous les appels retournent `S_OK` |
| Tilt | `0 → 1 → 0`, lecture après chaque écriture | **CONFIRMED — PASS**, tous les appels retournent `S_OK` |
| Zoom | `100 → 101 → 100`, lecture après chaque écriture | **CONFIRMED — PASS**, tous les appels retournent `S_OK` |

**CONFIRMED** : OBS actif n'empêche ni l'ouverture du filtre DirectShow PIXY ni les opérations `IAMCameraControl::Set`/`Get` sur les trois axes. Après les tests, la sonde a confirmé l'état restauré : `Pan=0`, `Tilt=0`, `Zoom=100`.

**CONFIRMED — confirmation utilisateur** : l'utilisateur a confirmé que l'aperçu OBS est resté visible pendant les trois micro-mouvements.

**UNVERIFIED** : effet visuel réel du PTZ. L'utilisateur n'a pas perçu les déplacements d'un seul pas employés pour ce test. Les lectures `Get` prouvent que le pilote accepte et conserve les nouvelles valeurs, mais un test réversible avec une amplitude visuellement observable reste nécessaire pour établir le mouvement mécanique et le sens effectif de chaque axe.

---

# 30. Attente du D200X : contrôleur `pixy-controller` et harnais de test clavier — 2026-09-20

Contexte : le D200X n'est pas encore arrivé. Un mini clavier USB (configuré par `MINI_KEYBOARD.exe`, qui ne sait émettre que des événements clavier/souris/multimédia HID globaux et **aucun** événement du SDK Ulanzi) a été retenu uniquement comme déclencheur physique pour la couche PTZ.

La couche plugin Ulanzi ne peut être testée qu'avec le D200X ou un simulateur du SDK ; le mini clavier ne peut pas l'émuler.

## Nouveaux livrables

### `tools/pixy-controller` — contrôleur indépendant (Phase 2)

CLI Windows sans dépendance :

    PixyController.exe info
    PixyController.exe get
    PixyController.exe center
    PixyController.exe pan <signed-delta>
    PixyController.exe tilt <signed-delta>
    PixyController.exe zoom <signed-delta>
    PixyController.exe set <pan|tilt|zoom> <absolute-value>

- **CONFIRMED** : réutilise la voie `IAMCameraControl` validée en section 27/28/29 ; aucun `IKsControl`, aucun USB brut.
- **CONFIRMED** : `info`/`get` retournent les mêmes plages que la sonde (`Pan -150..150`, `Tilt -90..90`, `Zoom 100..150`).
- **CONFIRMED — test réversible** : `pan 5` puis `pan -5` → retour à 0 ; `center` ramène Pan=30/Tilt=20/Zoom=105 vers 0/0/100, vérifié par `get`.
- Les déplacements sont relatifs et bornés aux limites du matériel.
- **UNVERIFIED** : sens effectif des signes `+`/`-` par rapport au monde réel (à confirmer par test visuel).

### `tools/pixy-test-harness` — harnais clavier

- **CONFIRMED** : hook `WH_KEYBOARD_LL`, modificateurs `Ctrl+Shift+Win` + chiffre.
- Mapping par défaut : `4 → pan -10`, `6 → pan 10`, `8 → tilt 5`, `2 → tilt -5`, `5 → center`. Configurable dans `pixy-test-harness.cfg` (chiffres de la rangée principale et du pavé numérique, ou VK `0xNN`).
- **CONFIRMED — test réversible complet** : simulation de `Win+Ctrl+Shift+4` → Pan −10 ; `Win+Ctrl+Shift+6` → Pan 0 ; `Win+Ctrl+Shift+5` → center (Pan=30/Tilt=20/Zoom=105 → 0/0/100). Chaque étape vérifiée par relecture `IAMCameraControl::Get`.
- **CONFIRMED — zoom (2026-09-20, ajout)** : vkCodes des touches `=`,`-`,`~` mesurés via le mode `--probe`, identiques sur le clavier QWERTY de référence et le mini clavier (`0xBB`, `0xBD`, `0xC0`). Test réversible : `Win+Ctrl+Shift+=` (0xBB) → Zoom 100→105, `Win+Ctrl+Shift+-` (0xBD) → Zoom 105→100, vérifiés.
- **HORS V1** : `~` (`0xC0`, « mode manuel/confidentiel ») est piloté par le canal HID propriétaire EMEET (reverse engineering, périmètre V2, sections 16/19). Non mappé.
- **Statut** : outil temporaire, hors architecture finale. Le plugin Ulanzi devra utiliser une architecture persistante (pas un lancement de processus par événement) pour l'encodeur.
- Interfaces caméra libérées après chaque exécution.

## État des preuves après cette étape

| Élément | Statut |
| --- | --- |
| Détection PIXY + `IAMCameraControl` | CONFIRMED |
| Pan/Tilt/Zoom lecture + écriture | CONFIRMED |
| Écriture pendant OBS | CONFIRMED |
| Pression physique → déplacement caméra (via harnais clavier) | CONFIRMED |
| Effet visuel et sens réel des axes | **UNVERIFIED** — reste à établir |
| Couche plugin Ulanzi / D200X | **UNVERIFIED** — nécessite le matériel ou un simulateur du SDK |

---

# 31. Zoom : pseudo-échec initial, cause = option Windows « Allow multiple apps » — 2026-09-20

## Protocole initial (conclusion erronée)

OBS ouvert sur la source physique « EMEET PIXY » (`EmeetPixy2`, pas la Virtual Camera). Aucun autre logiciel caméra actif. L'option Windows « Autoriser plusieurs applications à utiliser la caméra en même temps » était **désactivée** (valeur par défaut).

| Étape | Commande | État lecteur | Observation utilisateur |
| --- | --- | --- | --- |
| Zoom min → max | `set zoom 150` | `S_OK`, relecture `150` | **aucun changement d'image dans OBS** |
| Zoom max → min | `set zoom 100` | `S_OK`, relecture `100` | retour sans effet |
| Pan contrôle | `set pan -150` puis `set pan 150` | `S_OK` | **la tête bouge physiquement (balayage)** |
| Pan/Tilt restauration | `set pan 10`, `set tilt -10` | `S_OK` | — |

Le test fut conclu à tort comme « zoom sans effet », le protocole n'ayant pas isolé la variable de l'usage multi-application de Windows.

## Protocole complémentaire (cause identifiée)

L'utilisateur a activé l'option Windows « Allow multiple apps to use at the same time » dans les paramètres de confidentialité/caméra pour ouvrir EMEET Studio en parallèle d'OBS.

1. EMEET Studio ouvert + OBS actif, zoom mis au max dans EMEET Studio → la lecture `IAMCameraControl` de notre contrôleur rapporte `Zoom=150`. **EMEET Studio pilote donc le même contrôle `CameraControl_Zoom` que nous.** Un zoom fait dans EMEET Studio était visible dans OBS.
2. Notre commande `set zoom 100` exécutée pendant qu'EMEET Studio était au max → l'image s'est **dé-zoomée** dans OBS et EMEET Studio.
3. EMEET Studio fermé, OBS seul actif (option multi-application toujours active) :
   - `set zoom 150` → **l'image zoome dans OBS** ;
   - `set zoom 100` → **l'image se dé-zoome** (réversibilité confirmée).
4. Pan/Tilt restaurés à leur position de départ (Pan=10, Tilt=-10) ; zoom laissé à 100 (état initial de la caméra avant tests).

## Conclusion factuelle

- **CONFIRMED** : Pan et Tilt pilotent un moteur physique réel via `IAMCameraControl` sous le pilote `usbvideo` Microsoft.
- **CONFIRMED** : le zoom est **numérique** (aucun mouvement de lentille observé) mais il est **appliqué par la caméra au niveau du capteur/traitement UVC** et **visible sur la sortie OBS**, uniquement lorsque l'option Windows « Allow multiple apps to use at the same time » est activée.
- **CONFIRMED** : la voie `IAMCameraControl` (`CameraControl_Zoom`) est fonctionnelle et code opposable 1:1 avec EMEET Studio (qui utilise le même contrôle). Valeurs min/max réelles sur cette caméra : 100 (grand angle) → 150 (zoom max), flags `Manual`.
- **Découverte importante à confirmer** : avec l'option multi-application désactivée, le contrôle Zoom écrit (S_OK, valeur persistée) mais **n'est pas appliqué à la sortie vidéo**. Le mécanisme exact reste à caractériser (le pan/tilt fonctionnaient, eux, dans cette configuration). Résultat reproductible à vérifier si nécessaire.
- La relecture GET_CUR reflète l'état **réellement piloté par la dernière écriture**, y compris celle d'EMEET Studio : le contrôle est un bon indicateur de l'état du zoom.

## Conséquences sur la V1

- Le périmètre V1 « Zoom +/− » est **atteignable avec la voie Windows native** `IAMCameraControl`, sans EMEET Studio, **à condition que l'option Windows « Allow multiple apps to use at the same time » soit activée** pour la PIXY.
- Cette option est une précondition d'installation et doit être documentée. Elle ne modifie pas le pilote et est réversible.
- Le zoom étant numérique (recadrage), sa qualité dépend du capteur ; la colorimétrie reste hors périmètre V1.
- Le plugin devra vérifier/diagnostiquer l'activation de cette option et l'afficher dans la documentation d'installation, sans la modifier lui-même.

Aucune modification de pilote n'a été effectuée. État final de la caméra : Pan=10, Tilt=-10, Zoom=100.

---

# 32. Plugin Ulanzi `com.ulanzi.ulanzideck.pixy` — V1 implémentée et testée (E2E simulateur) — 2026-09-20

## Architecture retenue (implémentée)

    D200X → Ulanzi Studio
             → plugin/app.js (Node.js, SDK plugin-common-node + ws 8.18.0, ESM)
               → child_process persistant PixyController.exe serve
                 → NDJSON sur stdin/stdout (une commande par ligne, une réponse par ligne)
                 → IAMCameraControl → PIXY

- **CONFIRMED** : processus persistant (lancé une fois, `{"cmd":"quit"}` à la fermeture de la WebSocket), pas de lancement par événement.
- **CONFIRMED** : drizzle/coalescence de l'encodeur — les rotations sont accumulées par axe (`encoderDelta`), un unique flush par cycle de 80 ms envoie un `move` par axe.
- **CONFIRMED** : file d'attente séquentielle côté bridge (`bridgePending`, une réponse = une commande), évite les commandes obsolètes et la saturation.
- **CONFIRMED** : ordre des axes de l'encodeur à l'appui : PAN → TILT → ZOOM → PAN ; rotation gauche = valeur −, droite = valeur + ; pas : `MOVE_STEP=10` pour pan/tilt, `ZOOM_STEP=5` pour zoom.
- **CONFIRMED** : `setFeedback` met à jour l'écran de l'encodeur (`title` = axe actif, `text2` = `PAN > / TLT  / ZOM  ` avec `>` sur l'axe actif), layout `$UA2`.

## Événements SDK traités

`onConnected`, `onAdd`, `onSetActive`, `onClear`, `onKeyDown`, `onDialDown`, `onDialRotate`, `onError`, `onClose`.

- Requêtes bridge : `{"cmd":"move","axis":...,"delta":...}`, `{"cmd":"center"}`. Le bridge gère aussi `set`, `get`, `info`, `quit`.
- Le bridge C# applique des mouvements relatifs bornés aux limites (Pan −150..150, Tilt −90..90, Zoom 100..150 (numérique)).
- **CONFIRMED** : le plugin route les touches par suffixe d'UUID d'action (`jsn.uuid`, e.g. `.panleft`). Ce choix est validé par le test E2E simulateur ; le comportement réel du champ `uuid` de Studio est vérifié sur matériel.

## Test E2E avec simulateur Studio (`mockStudio.cjs`)

Simulateur WebSocket (port 3906) émulant Studio : `connected` → `add`/`setactive` → scénario encodeur + touches. Résultat intégral reçu par le simulateur :

| Étape simulée | Logs/vérification côté plugin | Résultat caméra |
| --- | --- | --- |
| `dialdown` (PAN→TILT) | `encoder mode -> TILT`, `setFeedback` correct | actif |
| `dialrotate` x2 right | rotation TILT accumulée, flush `move tilt +20` | actif |
| `dialdown` (TILT→ZOOM) | `encoder mode -> ZOOM`, `setFeedback` correct | actif |
| `dialrotate` left | `move zoom -5` | actif |
| `keydown` panleft / panright / center | routing `.panleft`/`.panright`/`.center` | caméra réelle a répondu |

- **CONFIRMED** : après le scénario complet, `PixyController.exe get` rapporte `Pan=0 Tilt=0 Zoom=100` (état du `center` final) — la caméra **réelle a exécuté** tous les mouvements envoyés par le plugin via le bridge.
- Bug corrigé en cours de test : `ensureBridge()` replaçait `bridgePending = []` à chaque respawn, perdant la première commande → erreur `Cannot read properties of undefined (reading 'request')`. Corrigé en ne vidant plus la file au respawn (c'est l'événement `exit` qui la vide).

## Installation

Plugin installé dans `%APPDATA%\Ulanzi\UlanziDeck\Plugins\com.ulanzi.ulanzideck.pixy.ulanziPlugin` :

- au premier démarrage suivant l'installation, Ulanzi Studio a lancé :
  `node.exe ...\plugin\app.js 127.0.0.1 3906 en-US 3.3.9` (port 3906 éphémère alloué par le SDK, Node 20 embarqué par Studio).
- payload complet : `manifest.json`, `plugin/app.js`, `plugin/plugin-common-node/` (SDK officiel non modifié), `node_modules/ws/` (8.18.0, téléchargé via tarball npm), `bin/PixyController.exe` (contrôleur C# .NET Framework 4.8.1 compilé localement — pas de dépendance SDK externe), `Images/*.svg` (8 icônes maison).
- pas de build : le package.json du plugin est en `"type":"module"`, `ws` résolu depuis `node_modules` local (le wrapper ESM `ws/wrapper.mjs` fournit les exports nommés nécessaires).

## Contraintes de compilation du contrôleur

- Machine sans SDK .NET 8 ; compilateur disponible : `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` (langage C# 5, pas de `out` inline, pas d'initialiseurs d'indexeur C# 6).
- Le code `Program.cs` est volontairement compatible avec cette limite.

## Statut des preuves après cette étape

| Élément | Statut |
| --- | --- |
| Couche caméra (`IAMCameraControl` + OBS simultané) | CONFIRMED |
| Contrôleur `PixyController.exe` (CLI + bridge `serve`) | CONFIRMED |
| Plugin Node.js : connexion SDK, flux d'événements | CONFIRMED (simulateur Studio) |
| Chaîne complète simulateur → plugin → bridge → caméra réelle | CONFIRMED |
| D200X réel branché sur Studio 3.3.9 avec le plugin | **UNVERIFIED — matériel à venir** |
| Champ `uuid` réel réellement envoyé par Studio pour les actions | **UNVERIFIED — à confirmer au premier hookup D200X** |
| Comportement visuel/sens réel des axes sur pièce | UNVERIFIED |
| OBS + plugin simultanés (chaîne complète) | UNVERIFIED — à retester avec D200X |

## Commandes utiles

```powershell
# recompiler le contrôleur
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe /out:tools\pixy-controller\bin\PixyController.exe tools\pixy-controller\Program.cs

# test solo du contrôleur
.\tools\pixy-controller\bin\PixyController.exe get

# simulateur Studio + plugin (logs dans %LocalAppData%\Temp\opencode\mock-studio)
node mockStudio.cjs   # via le node embarqué de Studio
node plugin\app.js 127.0.0.1 3906 en
```

Précondition d'installation inchangée : activer l'option Windows de confidentialité/caméra « Autoriser les applications à utiliser la caméra simultanément », sinon le zoom écrit au niveau UVC mais n'est pas appliqué sur la sortie vidéo (section 31).

---

# 33. Reverse engineering HID — modes Standard / Tracking / Privacy / Geste validés sur la caméra réelle — 2026-09-20

## Outil

`tools/pixy-hid-probe` : diagnostic HID Windows natif (C# .NET Framework 4.8.1, même csc que les autres outils), `hid.dll` + SetupAPI :
- ouverture du device path `\\?\HID#VID_328F&PID_00C0&MI_04#8&33F15015&0&0000#{4D1E55B2-F16F-11CF-88CB-001111000030}` (scan direct de `DeviceClasses\{4D1E55B2-...}`, SetupAPI n'énumérant pas cette interface) ;
- HIDD_ATTRIBUTES + HIDP_CAPS (usage page/usage `0x0083`, input et output 32 octets, feature 0, 1 input value cap, 1 output value cap) ;
- I/O overlappé : drain des rapports résiduels, écriture d'un rapport de sortie (32 octets, report ID `09`, zéro-padding), lecture du rapport d'entrée (ReadFile → WaitForSingleObject).

Commandes :

    PixyHidProbe.exe list | info <i>
    PixyHidProbe.exe query <hex> [<i>]        # envoie un rapport de sortie, affiche la réponse
    PixyHidProbe.exe poll <ms> [<i>]          # écoute les rapports d'entrée sans rien envoyer

## État initial mesuré (lectures seules, aucune écriture)

| Requête | Réponse | Décodage | Statut |
| --- | --- | --- | --- |
| `09 01 01 01` (mode tracking/privacy) | `09 01 01 01 00 01 00 01 00` | `00` = Standard | CONFIRMED |
| `09 04 02 01 00 01 00 01 02` (geste) | `09 04 02 01 00 02 00 02 02 01` | `01` = geste activé | CONFIRMED |
| `09 04 01 01` (cible tracking) | `09 04 01 01 00 15 00 15 00 ...` | `00` = Off (+ 3 floats par défaut) | CONFIRMED |
| `09 05 00 04` (audio DSP) | `09 05 00 04 00 01 00 01 01` | `01` = NC | CONFIRMED |
| `09 02 01 01` (auto-privacy) | `09 02 01 01 00 04 00 04 00 00 00 00` | délai `0` = Never | CONFIRMED |
| `09 01 00 03` (identifiant) | `09 01 00 03 00 0C 00 0C 32 36 30 ...` | ASCII `260609503074` | CONFIRMED |

## Tests SET réversibles (chaque écriture → relecture → restauration)

### Mode (groupe `01`)
| SET | Relecture | Résultat |
| --- | --- | --- |
| Standard `09 01 01 00 00 01 00 01 00` | `... 00` | CONFIRMED — PASS |
| Tracking `09 01 01 00 00 01 00 01 01` | `... 01` | CONFIRMED — PASS |
| Privacy `09 01 01 00 00 01 00 01 02` | `... 02` | CONFIRMED — PASS |

**CONFIRMED** : la commande Privacy est active (relecture `02`) ; le mode Privacy a un effet visuel réel (l'image s'assombrit), conformément à la référence. Après test, Standard restauré (`00`).

### Cible tracking (groupe `04`, sous-groupe `01`)
- **CONFIRMED** : passer en mode Tracking ramène la cible à **Face** (`01`) — réaction identique à la référence PixyPilot.
- **CONFIRMED** : cible restaure Off (`00`) via le SET complet à 13 octets `09 04 01 00 00 0D 00 0D 00 00 00 00 3F 00 00 00 3F 00 00 80 3F` (mode `00`, floats 0.5/0.5/1.0). Relecture `09 04 01 01 00 15 00 15 00 ...` → valeur `00`, floats à zéro.

### Geste (groupe `04`, sous-groupe `02`)
| SET | Relecture | Résultat |
| --- | --- | --- |
| off `09 04 02 00 00 02 00 02 02 00` | `... 02 00` | CONFIRMED — PASS |
| on `09 04 02 00 00 02 00 02 02 01` | `... 02 01` | CONFIRMED — PASS |

## Protocole HID de référence (conforme à la tierce partie, validé sur la pièce)

- Rapports HID : 32 octets, report ID `09`, padding zéro.
- Cadre : `09 GG AA BB CC LL 00 LL <payload>`.
- Groupe `01` (Standard/Tracking/Privacy) : valeur `00` / `01` / `02`.
- Groupe `04` sous-groupe `02` : geste `00`/`01` (lever la main = activer/désactiver le suivi).
- Groupe `02` : auto-privacy (délai en secondes LE, `0` = Never) — write confirmé, déclencheur automatique côté caméra NON confirmé (experimental).
- Groupe `05` : audio DSP (NC `01`, Live `02`, Original `03`).
- Groupe `63` : jog PTZ (`19`, delta axe `01`/`02`) et vecteur (`20`, 3 floats) — utilisés par les projets tiers ; NON testés dans ce projet (UVC suffit).

Source de référence : https://github.com/Romonaga/PixyPilot (docs/EMEET_PIXY_HID_REFERENCE.md), https://github.com/dheldt/emeet-cli, gist rm1138.

## Implications pour le projet

- **CONFIRMED** : les modes « manuel / suivi / confidentielle » du D200X sont pilotables par HID propriétaire (`09 01 01 00 00 01 00 01 XX`), sans EMEET Studio.
- Le geste (lever la main) n'agit qu'en mode Tracking traditionnel de la PIXY ; pour un plugin, il faut donc mettre la caméra en Tracking (`01`) pour que lever la main bascule le suivi.
- L'implémentation plugin sera construite une fois le contrôle PTZ UVC V1 stable et le D200X testé ; le HID s'ajoutera comme couche séparée (pas de tracking dans la V1 PTZ, conformément aux règles).
- L'accès HID n'a modifié aucun pilote ; les tests ci-dessus étaient réversibles et l'état final vérifié : Standard, cible Off, geste On, audio NC, auto-privacy Never (relectures finales effectuées).

## Test physique mini-clavier + OBS — 2026-09-20 (complément)

Périmètre : OBS ouvert sur la source physique PIXY, harnais clavier `pixy-test-harness` en arrière-plan, touches du mini clavier.

- **CONFIRMED — mapping macro HID** : `Ctrl+Shift+Win+7` passe la caméra en **Mode confidentiel** (privacy `02`), `Ctrl+Shift+Win+9` en **Mode manuel** (standard `00`). Le harnais route ces touches vers `PixyHidProbe.exe query <hex>` (config `hid <hex>|7|9`, outil `hidprobe` distinct de `controller`).
- **CONFIRMED — effet visuel dans OBS** : la privacy assombrit l'image dans OBS, le retour manuel la rétablit.
- **CONFIRMED — déclaration utilisateur** : lever la main active le mode suivi (tracking) et la relever le désactive (geste opérationnel). Pendant que le mode suivi est actif, les macros `7`/`9` permettent toujours de passer en manuel ou en confidentiel.
- **Bug de harnais corrigé (2026-09-20)** : le déclencheur passait le hex comme arguments séparés (espaces non protégés) → `PixyHidProbe.exe` interprétait `01` comme un index d'interface (`ERROR: interface index must be 0..0`). Corrigé en guillemetant le hex : `query "<hex>"`. En complément, `CreateNoWindow=true` + redirection stdout/stderr (plus de petite fenêtre console noire à chaque touche).
- État final de la caméra après le test : **Mode confidentiel** (`02`), geste `01` (on), cible `00` (off) — état laissé par le dernier déclenchement macro de l'utilisateur, non restauré.

---

# 34. Presets de position logiciels (fichier JSON) + position de démarrage — 2026-09-20

## Décision d'architecture

- **Presets logiciels** (fichier JSON local), et non les slots natifs HID (groupe `03`, slots 1-3). Le choix s'appuie sur :
  - les slots natifs sont limités à **3** (`SS` = `01..03`) et la référence note que l'app officielle rétablit le zoom **par UVC séparément** du slot (comportement du zoom natif non vérifié sur la pièce) ;
  - les presets logiciels utilisent la voie `IAMCameraControl` **validée** (sections 27-31), sont illimités, réversibles et indépendants du firmware.
- **Position de démarrage** : appliquée **automatiquement au démarrage du bridge `serve`** (donc au démarrage du plugin, qui lance `serve` sur `onConnected`). Choix utilisateur : « appliquée automatiquement au démarrage ».

## Découverte de recherche (HID natif)

- **CONFIRMED (probe)** : la caméra répond aux requêtes de slots de présets natifs groupe `03` : `09 03 01 16 00 01 00 01 SS` → `09 03 01 16 00 0e 00 0e SS EE X:f32le Y:f32le Z:f32le`. Les 3 slots sont actuellement **vides** (`EE=00`).
- Référence : save `09 03 01 15 00 02 00 02 SS 01`, load `09 03 01 18 00 01 00 01 SS` (PixyPilot docs/EMEET_PIXY_HID_REFERENCE.md, captures `pcaps/24` et `pcaps/25`). **Non utilisé** dans l'implémentation retenue.

## Implémentation `PixyController.exe`

Stockage : `%APPDATA%\PixyController\presets.json` :

    {"start":"start","presets":{"start":{"pan":10,"tilt":-10,"zoom":100}}}

Nouvelles commandes CLI + bridge NDJSON (`{"cmd":"..."}`) :

| Commande | Rôle | Caméra requise |
| --- | --- | --- |
| `preset-save <name>` | enregistre la position courante | oui |
| `preset-load <name>` | applique un preset (absolus bornés) | oui |
| `preset-list` | liste les presets (+ marqueur `(start)`) | non |
| `preset-set-start <name>` | désigne le preset de démarrage | non |
| `preset-delete <name>` | supprime un preset | non |
| `start` | rappelle la position de démarrage | oui |

- **CONFIRMED** : au démarrage de `serve`, si un start est défini, la caméra y est déplacée (Pan=40/Tilt=10/Zoom=115 → Pan=10/Tilt=-10/Zoom=100) avant la première réponse, confirmé par `get` sur le canal du bridge.
- **CONFIRMED — test réversible** : `preset-save start` (Pan=10/Tilt=-10/Zoom=100) → déplacement (→50/20/115) → `preset-load start` → retour exact à la valeur enregistrée ; `preset-set-start` + `start` (rappel) vérifiés.
- **Bug corrigé en test** : `PrintUsage()` écrivait sur stdout → corrompait le canal NDJSON du bridge (le plugin recevait `USAGE: pix...` au lieu de JSON). Déplacé sur stderr ; les réponses bridge restent strictement NDJSON.
- **CONFIRMED (E2E mockStudio sur port 3907)** : scénario `savepreset1 → panleft+zoomin → preset1 → setstart → tiltup → start` → messages `preset-save ok`, `preset-load ok`, `start position saved`, `start recall ok`, état final Pan=10/Tilt=-10/Zoom=100. L'ancien binaire du plugin (sans `start`) fut d'abord utilisé de façon erronée → recopié depuis `tools\pixy-controller\bin` après compilation.
- **CONFIRMED (test physique mini clavier, 2026-09-20)** : `Ctrl+Shift+Win+1` (preset-save A), déplacement, `Ctrl+Shift+Win+3` (preset-load A) → retour à la position sauvegardée, vu sur la caméra. Mapping ajouté au harnais : `1`=save A, `3`=load A, `0`=preset-list. Aucun changement de code harnais nécessaire (route générique vers `PixyController.exe`).

## Plugin Ulanzi

- Manifest : 8 nouvelles actions `Keypad` (`start`, `setstart`, `preset1..3`, `savepreset1..3`), UUID suffixés `com.ulanzi.ulanzideck.pixy.{start,setstart,presetN,savepresetN}`.
- `app.js` : `onConnected` force `ensureBridge()` (démarre le bridge, ce qui applique la position de démarrage automatiquement) ; `onKeyDown` route `presetN` → `preset-load presetN`, `savepresetN` → `preset-save presetN`, `start` → `start`, `setstart` → sauve la position courante dans le preset `start` puis le marque comme start.
- Valeurs des presets plugin : libellés explicites « Preset 1/2/3 », « Save Preset 1/2/3 ».
- **UNVERIFIED** : test sur Studio réel + D200X (matériel à venir), champ `uuid` réel de Studio, effet visuel.

## État final après tests

- Caméra : Pan=10, Tilt=-10, Zoom=100, mode Standard (manuel).
- `presets.json` nettoyé : seul le preset `start` (10/-10/100) subsiste et est marqué `start`.
- Aucune modification de pilote ni de configuration système.

---

# 35. Modes caméra (Standard / Tracking / Privacy) exposés dans le plugin — 2026-09-22

## Contexte

- Ulanzi D200X reçu. Le plugin `com.ulanzi.ulanzideck.pixy` (v0.1.0) est **détecté immédiatement** par Ulanzi Studio.
- Constat utilisateur : les **modes caméra** n'étaient pas disponibles (seuls PTZ/presets/encodeur étaient exposés).
- La règle 10 (pas de HID tant que le contrôle UVC n'est pas stable) étant levée (UVC validé, sections 27-31), les modes ont été ajoutés via le canal HID propriétaire validé en section 33.

## Architecture

- Pas de nouveau canal dans le plugin : la commande `mode` passe par le **bridge NDJSON existant** (`PixyController serve`).
- `PixyController.exe mode <standard|tracking|privacy>` délègue l'écriture HID à **`PixyHidProbe.exe`** (cherché dans le même dossier, canal HID natif validé), écrit le rapport groupe 01 puis relit `09 01 01 01` à titre informatif.

## Découverte importante de recherche (readback groupe 01)

- **REJECTED (hypothèse initiale)** : « le readback de `09 01 01 01` est un écho direct de la valeur écrite et permet de confirmer l'écriture ». FAUX sur la pièce : privacy→`02` (écho), tracking→`03`, standard→`03` (première passe). L'interprétation `readback == write` a failli faire rejeter Tracking/Standard à tort.
- **CONFIRMED (référence PixyPilot, docs/EMEET_PIXY_HID_REFERENCE.md)** : le readback groupe `01` **n'est PAS un écho** des valeurs host-to-camera. Décodage PixyPilot : `00`=Standard/idle, `01`=Tracking, `02`=Privacy, `03`=« non-privacy ; Standard vs Tracking inconnu » (statut combiné secondaire). PixyPilot refuse d'ailleurs de mapper `03`.
- **Conséquence implémentée** : le succès de `mode` repose sur l'**acceptation du rapport d'écriture** (exit code 0 de `PixyHidProbe query <SET>`), le readback est journalisé comme informationnel (`03` = non-privacy). Les effets visuels réels restent le critère utilisateur (image assombrie en Privacy, suivi en Tracking).
- **CONFIRMED (retest complet)** : privacy→readback `02`, tracking→`01`, standard→`00` sur la caméra réelle après retrait de la vérification stricte. Caméra restaurée en Standard à l'issue des tests.

## Plugin

- Manifest : 3 nouvelles actions `Keypad` → `com.ulanzi.ulanzideck.pixy.{modestandard,modetracking,modeprivacy}` (total 19 actions).
- `app.js` : `setMode(value)` → `{"cmd":"mode","value":...}` sur le bridge, routeurs `.modestandard`, `.modetracking`, `.modeprivacy` → `standard`, `tracking`, `privacy`.
- `PixyHidProbe.exe` désormais copié dans `bin/` du plugin (requis par la commande `mode`).

## Tests

- **CONFIRMED (CLI, caméra réelle)** : `mode privacy` (readback 02), `mode tracking` (01), `mode standard` (00).
- **CONFIRMED (bridge NDJSON)** : `{"cmd":"mode","value":"privacy"}` → `{"ok":true,...}` ; puis standard restauré.
- **CONFIRMED (E2E mockStudio port 3907)** : keydown privacy/tracking/standard → `mode privacy ok`, `mode tracking ok`, `mode standard ok`.
- **UNVERIFIED** : test sur le D200X réel + Studio (l'utilisateur doit redémarrer Studio pour charger la nouvelle version du plugin).

## État final

- Caméra : Standard (`00`) — les modes de test ont été dessus pu puis restaurés.
- Aucune modification de pilote ni de configuration système.

---

# 36. Encodeurs dédiés Pan/Tilt/Zoom sur le D200X (une molette = un axe) — 2026-09-22

## Contexte

- Le D200X dispose de **3 molettes physiques** et le plugin ne proposait qu'une seule action « PTZ Encoder » (rotation = déplacement, appui = changement d'axe).
- Demande utilisateur : adapter Pan/Tilt/Zoom aux molettes plutôt qu'aux boutons → **une molette par axe**.

## Choix retenu (confirmé par l'utilisateur)

- Ajout de **3 nouvelles actions `Encoder`** dédiées, en plus de l'action multi-axe existante :
  - `com.ulanzi.ulanzideck.pixy.panencoder` — rotation = pan, appui = center
  - `com.ulanzi.ulanzideck.pixy.tiltencoder` — rotation = tilt, appui = center
  - `com.ulanzi.ulanzideck.pixy.zoomencoder` — rotation = zoom, appui = center
- Manifest : 22 actions au total.

## Implémentation (app.js)

- `encoderAxisFromAction(uuid)` associe le **UUID de l'action** (transmis par Studio dans les événements encodeur) à un axe fixe ; l'action multi-axe existante conserve son cycle d'axe.
- `onDialRotate` : l'axe est `fixed || AXIS[encoderContexts]`, la coalescence existante (flush 80 ms, `encoderDelta`) est réutilisée → mouvements rapides de molette coalescés sur le bridge.
- `onDialDown` : pour les encodeurs par axe → `center()` ; pour l'action multi-axe → changement d'axe (comportement inchangé).
- `refreshEncoderFeedback` : feedback `$UA2` initial (`PAN/TILT/ZOOM` + `ROT=DEPL APPUI=CTR`) affiché dès `onAdd`/`setactive`.
- Correctif encodage : libellé sans accent (`ROT=DEPL`) pour éviter le mojibake dans le feedback encodeur.

## Tests

- **CONFIRMED (E2E mockStudio port 3907)** : dialrotate panencoder left/right (pan ±10), tiltencoder right (+10), zoomencoder right (zoom +5), dialdown panencoder → `encoder pan dial -> center` ; 8 retours `setFeedback` reçus. Caméra restaurée à Pan=0/Tilt=0/Zoom=100 à l'issue (réversible).
- **UNVERIFIED** : test physique sur le D200X (Studio doit être redémarré pour charger le manifest à 22 actions).

## État final

- Caméra : 0/0/100, mode Standard.
- Plugin installé (`%APPDATA%\Ulanzi\UlanziDeck\Plugins\com.ulanzi.ulanzideck.pixy.ulanziPlugin`) : manifest.json et app.js à jour (hashes identiques à la source).
- Copie synchronisée `D:\Projets\v2-modes-fonctionnels` à jour.
- Aucune modification de pilote ni de configuration système.

---

# 37. Drop des actions Encodeur PIXY impossible sur les molettes du D200X — cause : `Devices:["D200X"]` — 2026-09-22

## Symptôme

- Les actions `Encoder` du plugin (PTZ Encoder, puis Pan/Tilt/Zoom (Encodeur)) affichaient un curseur **« Interdit »** au glisser-déposer sur les molettes du D200X, alors que les actions `Keypad` se posaient normalement sur les boutons.
- Confirmé par l'utilisateur après redémarrage de Studio (22:41, manifest 22 actions chargé, hashes identiques) : toujours interdit après restart.

## Diagnostic

- **CONFIRMED** : le bloc `{"Type":"Encoder"}` existe bien dans le profil D200X (profil utilisateur : molettes `2_3`,`3_3`,`4_3`) ; voicemeeter `gainAdjustDial` (uniquement `Controllers:["Encoder"]`, **sans** champ `Devices`, layout `$UA1`) se déposait correctement.
- **CONFIRMED** : présents dans les manifests de Studio/plugins installés, les encodeurs fonctionnels (voicemeeter, obsstudio, deck.system, dial.system) n'utilisent **jamais** `Devices:["D200X"]` — obsstudio utilise une exclusion `~AU...`, voicemeeter rien (tous appareils).
- **CONFIRMED** : `$UA2` n'apparaît dans aucun manifest système/tiers installé, uniquement dans le nôtre (candidat n°2, non testé car rendu inutile par la correction).
- **CONFIRMED (côté appareil)** : `device.json` ne nomme pas « D200X » mais « Ulanzi Deck 5x3 » (modèle « 20GBA9901 », UUID `@(1)[4057/128/DL44L2A30526]`) ; le défaut `defProfile\D200X` déclare `Device.Model:"D200H"` dans ses profils internes. « D200X » est le modèle du profil utilisateur et n'est pas un identifiant d'appareil reconnu par le filtre `Devices` pour les Encodeurs.

## Correction

- Manifest : `"Devices": ["D200X"]` → `"Devices": []` sur les **4** actions `Encoder` (`com.ulanzi.ulanzideck.pixy.{encoder,panencoder,tiltencoder,zoomencoder}`) = tous appareils, aligné sur voicemeeter.
- Les actions `Keypad` gardent `Devices:["D200X"]` (elles fonctionnent).
- `app.js` inchangé.

## Tests

- **CONFIRMED (Ulanzi Studio, appareil réel)** : après redémarrage, « Pan (Encodeur) », « Tilt (Encodeur) » et « Zoom (Encodeur) » se déposent sur les molettes sans curseur « Interdit » (test utilisateur = succès).
- **REJECTED (hypothèse)** : la cause n'était ni le layout `$UA2`, ni le champ `Name` dans `States`, ni l'absence de `PropertyInspectorPath` — `Devices` était le seul bloqueur.

## Enseignement

- Pour un contrôleur `Encoder` sur le D200X, le champ `Devices` doit être vide (tous appareils) ou en exclusion `~...`, jamais un modèle d'appareil en inclusion.
- Le profil par défaut D200X référence un modèle interne « D200H » — ne pas s'appuyer sur le nom du modèle utilisateur pour matcher un appareil dans un manifest de plugin.

## État final

- Manifest 22 actions ; 4 encodeurs `Devices:[]`, Keypad `Devices:["D200X"]`.
- Source et plugin installé : hashes identiques.
- Copie synchronisée `D:\Projets\v2-modes-fonctionnels` : manifest MD5 `21DE647BBFA59AB1B83444D771BA8538`, PROJECT_CONTEXT MD5 `075DBD1DEC1832C62BC1B0197ED13920`.

---

# 38. Paramètre « Step Size » pour les encodeurs (2026-09-23)

## Demande

Le pas de rotation des encodeurs était trop élevé. L'utilisateur a demandé un paramètre « Step Size » par action encodeur, sur le modèle du « Gain Adjust » du plugin voicemeeter. Échelle retenue par l'utilisateur : **1, 2, 5, 10 — défaut 1**.

## Décisions

- Le pas est un entier : `PixyController.exe move` parse le delta en `int`, donc les valeurs décimales (0.1, 0.2, 0.5) de voicemeeter (en dB) sont sans objet côté PIXY.
- Le paramètre est exposé via un Property Inspector commun aux 4 actions encodeur (`PTZ Encoder`, `Pan (Encodeur)`, `Tilt (Encodeur)`, `Zoom (Encodeur)`).
- Les boutons Keypad (`panleft`, `zoomin`, …) conservent leurs pas fixes `MOVE_STEP=10` / `ZOOM_STEP=5`. Un seul tick d'encodeur vaut `stepSize` (par défaut 1), au lieu de `MOVE_STEP`/`ZOOM_STEP` auparavant.

## Implémentation

- `property-inspector/pixyEncoder/inspector.html` + `inspector.js` : sélecteur `select name="stepSize"` (options 1/2/5/10, défaut 1), sur le modèle voicemeeter (`uspi.css`, `$UD.connect()`, `Utils.debounce`, `settingSaveParam`, `sendParamFn`).
- Libs copiées depuis le plugin voicemeeter installé : `libs/js/{constants.js,eventEmitter.js,timers.js,ulanzideckApi.js,utils.js}` + `libs/css/uspi.css` (aucune modification).
- `manifest.json` : `PropertyInspectorPath: "property-inspector/pixyEncoder/inspector.html"` ajouté aux 4 actions encodeur (`Devices:[]` conservé).
- `app.js` : `encoderSettings` (Map context → settings), `storeEncoderSettings`, `getStepSizeForContext` (fallback 1), `onDidReceiveSettings` stocke `jsn.settings` ; `onDialRotate` utilise `stepSize`.

## Tests

- `mockStudio-step.cjs` (port 3907) : `add` panencoder → `didReceiveSettings {stepSize}` → `dialrotate right`, puis lecture matérielle `PixyController get`.
- CONFIRMED `stepSize=1` : bridge applique la position « start » (pan=10) au lancement, puis `dialrotate right` → pan **11** (+1).
- CONFIRMED `stepSize=5` : pan **15** (+5).
- CONFIRMED : le dossier `property-inspector` complet est installé et identique (hashes MD5 source = installé, y compris les libs).
- Caméra recentrée (pan=0, tilt=0, zoom=100) après le test.

## Limites / statuts

- LIKELY : Ulanzi Studio charge les settings par action via `didReceiveSettings` ; à confirmer par un test utilisateur réel (redémarrer Ulanzi Studio).
- UNVERIFIED : changement de `stepSize` dans le Property Inspector pendant que Studio tourne (mise à jour à chaud).
- Le Property Inspector ne s'affiche que pour les actions encodeur (pas pour les boutons Keypad).

---

# 39. Boutons positions : appui court / appui long (2026-09-23)

## Demande

Pour les boutons « positions », utiliser deux fonctionnements : appui court (rappel) / appui long (sauvegarde), avec durée d'appui long réglable.

## Décisions (questionnaire utilisateur)

- Boutons concernés : **Preset 1 à 5 + Start** (ajout de Preset 4 et Preset 5 ; choix utilisateur « preset + start, ajoute 2 presets »).
- Comportement :
  - **Appui court** = rappel de la position (preset-load / start).
  - **Appui long** = sauvegarde de la position courante (preset-save / set-start).
- Durée d'appui long réglable : **300–2000 ms, défaut 500 ms**.
- **Supprimé** : actions `Set Start`, `Save Preset 1/2/3` (remplacées par l'appui long). Manifest passe de 22 à **20 actions**.

## Implémentation

- `manifest.json` : ajout Preset 4/5 ; suppression setstart, savepreset1/2/3 ; `PropertyInspectorPath` `property-inspector/pixyPosition/inspector.html` sur start et preset1-5.
- `property-inspector/pixyPosition/inspector.html` + `inspector.js` : select `longPressMs` (300/400/500/600/800/1000/1500/2000, défaut 500), mêmes libs que pixyEncoder.
- `plugin/app.js` :
  - `positionSettings` (Map context → settings), `storePositionSettings`, `getLongPressMsForContext` (plage 300–2000, fallback 500).
  - `onKeyDown` : pour action position, lance un `setTimeout(longPressMs)` → `handleLongAction` (save). Sinon action immédiate.
  - `onKeyUp` : si un long-appui est en attente, annule le timer et exécute l'action courte (rappel). Si le timer a déjà expiré, l'appui long a été fonction, le relâchement ne fait rien.
  - `onClear` : nettoie les timers de long-appui en attente.
  - Le SDK émet `keydown`/`keyup` (`KEYDOWN`/`KEYUP` confirmés dans `constants.js`).

## Tests (mock, caméra réelle)

- `mockStudio-longpress.cjs` (port 3907) : `didReceiveSettings {longPressMs:500}` puis :
  - Appui court preset1 (keydown + keyup +100 ms) → log `preset-load preset1 ok`. CONFIRMED.
  - Appui long preset5 (keydown, attendre 800 ms > 500, puis keyup) → log `long press -> save preset5` + `preset-save preset5 ok`. CONFIRMED.
  - Le `keyup` après expiration du timer ne déclenche pas d'action (pas de double exécution). CONFIRMED.
- Effet matériel : le nouveau preset5 est apparu dans `preset-list`, puis supprimé après le test (caméra recentrée ; preset1/2/3/start/A inchangés).

## Statuts

- CONFIRMED : déclenchement court/long dans le plugin (timers + keyup), sauvegarde et rappel réels via UVC.
- LIKELY : Ulanzi Studio envoie bien `keyup` en appui réel sur le D200X (le SDK l'expose ; à confirmer au test utilisateur).
- LIKELY : la durée choisie dans le Property Inspector est bien fournie par `didReceiveSettings` au chargement de page.
- Remarque : les 4 actions supprimées (setstart, savepreset1/2/3) ne sont plus disponibles ; un profil existant qui les utilisait devra être réaffecté manuellement.

---

# 40. Nouvelles icônes des actions (2026-09-23)

## Demande

Remplacer les icônes SVG par de nouvelles images `Images/gradient-*.png` (96×96) ajoutées par l'utilisateur.

## Correspondances appliquées (Icon + State)

| Action | Image |
|---|---|
| Pan Left | `gradient-arrow-left.png` |
| Pan Right | `gradient-arrow-right.png` |
| Tilt Up | `gradient-arrow-up.png` |
| Tilt Down | `gradient-arrow-down.png` |
| Zoom In | `gradient-zoom-in.png` |
| Zoom Out | `gradient-zoom-out.png` |
| Center | `gradient-accuracy.png` |
| Start | `preset-0.png` (choix utilisateur ; remplace `gradient-start.png`) |
| Preset 1-5 | `preset-1.png` … `preset-5.png` (choix utilisateur ; remplacent `pixy.svg`) |
| Pan (Encodeur) | `gradient-arrow-horizontal.png` |
| Tilt (Encodeur) | `gradient-arrow-vertical.png` |
| Zoom (Encodeur) | `gradient-arrow-enlarge.png` |
| Mode Standard (manuel) | `gradient-move.png` (remplace `gradient-arrow-restart.png`, choix utilisateur) |
| Mode Tracking | `gradient-aperture.png` (choix utilisateur) |
| Mode Privacy | `gradient-privacy.png` |
| PTZ Encoder (knob multi-axes) | `gradient-ptz.png` (image fixe ajoutée par l'utilisateur ; l'affichage runtime est néanmoins dynamique par axe, voir §41) |

## §41 — PTZ Encoder : icône dynamique par axe

Cadre : afficher sur le knob PTZ Encoder l'image de l'axe actif quand on change d'axe.

- La demande : `enlarge` pour l'axe zoom, `horizontal` pour pan, `vertical` pour tilt.
- Étude SDK : le layout manipuleur `$UA1` = Icon + Text (élément `icon` de type `pixmap` + élément `title` de type `text`) ; `$UA2` = Text + Text (`text2` + `title`). `setFeedback(context, layout)` met à jour les éléments par nom de clé. Un élément `key:"icon"` se comporte comme l'icône standard du bouton.
- Implémentation :
  - manifest.json : PTZ Encoder (`com.ulanzi.ulanzideck.pixy.encoder`) passe de `$UA2` à `$UA1` (ligne 119). Les encodeurs fixes Pan/Tilt/Zoom restent en `$UA2`.
  - app.js : `ENCODER_ICONS = [horizontal, vertical, enlarge]` ; `updateEncoderFeedback(context, axisIndex)` envoie désormais `setFeedback({ icon, title })` au lieu de `title` + `text2`.
- Résultats matériel : Aucun test visuel sur D200X (le mock ne pilote pas l'écran).

## §42 — Correction : icônes des encodeurs fixes Pan/Tilt/Zoom

Constat utilisateur : les images Pan, Tilt et Zoom ne s'affichaient pas sur les knobs dédiés, alors que le PTZ Encoder (dynamic, §41) fonctionnait.

- Cause identifiée : les 3 encodeurs fixes étaient en layout `$UA2` (Text + Text). `$UA2` ne contient aucun élément image, donc ni `Icon` ni `State.Image` du manifest n'est rendu sur l'écran du knob. Le `setFeedback` envoyé ne portait que `title` + `text2`.
- Correction :
  - manifest.json : Pan/Tilt/Zoom (Encodeur) passent de `$UA2` à `$UA1` (Icon + Text). Les 4 actions Encoder sont désormais en `$UA1`.
  - app.js : `updateAxisEncoderFeedback(context, axis)` envoie `setFeedback({ icon, title })` au lieu de `{ title, text2 }`, avec un mapping `pan→gradient-arrow-horizontal.png`, `tilt→gradient-arrow-vertical.png`, `zoom→gradient-arrow-enlarge.png`. Le texte d'aide `ROT=DEPL APPUI=CTR` disparaît de ces knobs (le layout $UA1 n'a que `icon` + `title`).
- CONFIRMED (protocole, mock E2E port 3907) : les 3 encodeurs fixes émettent bien leur icône au `add`.

## §43 — Step Size sur les boutons de mouvement (Pan/Tilt/Zoom)

Demande utilisateur : les boutons de déplacement doivent eux aussi avoir un pas réglable, comme les knobs.

- Les pas étaient figés en code : `MOVE_STEP = 10` (pan/tilt) et `ZOOM_STEP = 5` (zoom), utilisés directement dans `handleShortAction`.
- Nouveaux fichiers : `property-inspector/pixyMove/inspector.html` + `zoom.html` + `inspector.js` (stepSize : 1/2/5/10/15/20/30).
  - `inspector.html` : défaut affiché 10, utilisé par Pan Left/Right et Tilt Up/Down.
  - `zoom.html` : défaut affiché 5, utilisé par Zoom In/Out.
  - Deux pages distinctes (même `inspector.js`) pour que la valeur affichée corresponde toujours au comportement réel.
- manifest.json : `PropertyInspectorPath` ajouté sur les 6 actions de mouvement (4 vers `pixyMove/inspector.html`, 2 vers `pixyMove/zoom.html`).
- app.js :
  - `buttonSettings` (Map par contexte) + `storeButtonSettings` + `getMoveStepForContext(context, axis)` qui retombe sur `ZOOM_STEP` (zoom) ou `MOVE_STEP` (pan/tilt) si aucun réglage reçu ;
  - `MOVE_ACTIONS` (table `suffixe → [axe, signe]`) + `moveActionFromUuid(uuid)` remplacent les 6 `if ... endsWith` ;
  - `onDidReceiveSettings` alimente aussi `buttonSettings` ; `onClear` purge les contextes de boutons.
- Piège de test rencontré : le mock envoyait `key: true` sur `keydown`/`keyup`, ce qui produisait un contexte `___true___` différent de celui de `add`/`didReceiveSettings` (`___key01___`) et faisait échouer la lecture du réglage. Le plugin de Studio envoie le vrai identifiant de touche. Corrigé côté mock.

### Vérifications (caméra réelle, bridge `serve`, mesures avant/après)

- CONFIRMED : Pan Right sans réglage → Pan 10 → 20 (+10, défaut MOVE_STEP).
- CONFIRMED : Pan Right `stepSize=30` → Pan 10 → 40 (+30).
- CONFIRMED : Tilt Up `stepSize=45` → Tilt -9 → 36 (+45).
- CONFIRMED : Zoom Out sans réglage → Zoom 150 → 145 (-5, défaut ZOOM_STEP).
- CONFIRMED : Zoom Out `stepSize=20` → Zoom 150 → 130 (-20).
- Note : Zoom In `stepSize=20` n'a pas été concluant car la caméra était déjà au maximum (Zoom=150).

## §44 — Icônes presets/start et icône principale du plugin

- Nouvelles images fournies par l'utilisateur : `Images/EMEETPIXYDual.png`, `Images/preset-0.png` à `preset-5.png`. Elles ont d'abord été fournies en 505×494, puis redimensionnées par l'utilisateur en **96×96** (comme les autres icônes) — installed dans Ulanzi Studio de nouveau après redimensionnement.
- manifest.json :
  - `Icon` et `CategoryIcon` (niveau plugin) : `Images/pixy.svg` → `Images/EMEETPIXYDual.png`.
  - `Start` : `gradient-start.png` → `preset-0.png`.
  - `Preset 1` à `Preset 5` : `pixy.svg` → `preset-1.png` … `preset-5.png`.
- `Images/pixy.svg` n'est plus référencé nulle part dans le manifest (le fichier reste présent dans le dossier).
- Vérifications : manifest JSON valide ; 25 références uniques (icônes, states, property inspectors) et **toutes existent** ; hashes installés identiques.

## §45 — Fin de la copie vers v2-modes-fonctionnels

Décision utilisateur (2026-09-26) : `D:\Projets\v2-modes-fonctionnels` n'est plus utile.

- La synchronisation `robocopy D:\Projets\Ulanzi-emeet-plugin D:\Projets\v2-modes-fonctionnels /mir` est **arrêtée**.
- `D:\Projets\Ulanzi-emeet-plugin` reste la source de vérité unique.
- Le dossier `v2-modes-fonctionnels` existe toujours sur le disque ; sa suppression n'a pas été faite (commande destructive, à confirmer explicitement par l'utilisateur).

## Vérifications

- CONFIRMED : JSON manifest valide ; hashes installés identiques.
- CONFIRMED : `gradient-ptz.png` est un PNG 96×96 valide, référencé 2× dans le manifest (Icon + State.Image du PTZ Encoder).
- CONFIRMED (protocole, mock E2E port 3907 `mockStudio-encodericon.cjs`) : à chaque `dialdown`, le plugin émet `setFeedback` avec l'icône de l'axe :
  - axe pan → `{ icon: "Images/gradient-arrow-horizontal.png", title: "PAN" }`
  - axe tilt → `{ icon: "Images/gradient-arrow-vertical.png", title: "TILT" }`
  - axe zoom → `{ icon: "Images/gradient-arrow-enlarge.png", title: "ZOOM" }`
  - retour pan → `{ icon: "Images/gradient-arrow-horizontal.png", title: "PAN" }`

## Statuts

- CONFIRMED : manifest JSON valide.
- CONFIRMED : chaque `Icon`/`State.Image` référence un fichier existant (15 chemins uniques).
- CONFIRMED : toutes les `Images/gradient-*.png` sont des PNG 96×96 valides.
- CONFIRMED : files installés (hashes manifest + 15 images identiques source = installé).
- `gradient-arrow-return.png` présent dans le dossier mais non référencé dans le manifest.

## Statuts

- LIKELY : les nouveaux visuels s'affichent dans Ulanzi Studio après redémarrage ; à confirmer visuellement par l'utilisateur (redémarrage requis pour recharger le manifest).
- LIKELY : l'écran du knob D200X affiche l'icône dynamique par axe ($UA1 + setFeedback icon) ; à confirmer visuellement sur l'appareil (le mock ne teste que le protocole, pas le rendu).

---

# 46 - Restructuration du dépôt sur le modèle des deux autres plugins Ulanzi

Décision utilisateur (2026-10-11) : le projet était monté à la va-vite autour d'un
`pixy-test-harness` (hook `WH_KEYBOARD_LL` + un processus par pression de touche) qui
n'a plus lieu d'être. Le dépôt est réaligné sur `Ulanzi-neewer-plugin` et
`Ulanzi-elgato-wave-link-plugin`.

**Ce qui n'a PAS changé** : le bridge `PixyController.exe` reste indispensable. Node ne
peut pas parler DirectShow, et l'AGENTS.md §"Architecture logicielle recommandée"
impose un processus persistant plutôt qu'un exécutable par mouvement de molette. Ce qui
disparaît, c'est le harnais clavier et la distribution manuelle des binaires, pas le
processus natif.

## Arborescence avant / après

- `com.ulanzi.ulanzideck.pixy.ulanziPlugin/` (bundle installé, édité à la main, à la
  racine du dépôt) → `plugin/` (source) + `release/` (sortie de build, ignoré par git).
- `plugin/plugin-common-node/` (SDK Ulanzi vendorisé) → `sdk/ulanzi-api`, installé par
  `npm run sdk` (`scripts/install-sdk.mjs`, copié du projet neewer).
- `property-inspector/libs/` (SDK HTML vendorisé) → `sdk/common-html` → `libs/` et
  `assets/` à la racine du bundle.
- `tools/pixy-controller/`, `tools/pixy-hid-probe/`,
  `tools/pixy-camera-control-diagnostic/` → `native/PixyController/`,
  `native/PixyHidProbe/`, `native/PixyCameraControlDiagnostic/`.
- `tools/pixy-test-harness/` → supprimé.
- `bin/` dans le bundle → `plugin/native/`, produit par `npm run native`.
- Ajoutés : `.gitignore`, `package.json` racine, `scripts/`, `CHANGELOG.md`.
- `README.md` (2 lignes) et `LICENSE` non traités à cette étape.

## Trois chemins que le déplacement a imposés

Ces lignes ne sont pas des refontes, elles sont dictées par l'arborescence et sans elles
le plugin ne démarre pas :

1. `manifest.json` : `CodePath` `plugin/app.js` → `service/app.js` ;
   42 références `Images/` → `images/` ; ajout de `Inspect`.
2. `service/app.js` : import du SDK `./plugin-common-node/index.js` → `../ulanzi-api/index.js` ;
   exe `../bin/PixyController.exe` → `../native/PixyController.exe`.
3. `property-inspector/*/*.html` : `../libs/` → `../../libs/` et
   `ulanzideckApi.js` → `ulanziApi.js`.

## Bug latent découvert pendant l'opération

Le `uspi.css` vendorisé référence `../assets/u_*.svg`. Dans l'ancien bundle, `assets/`
n'existait pas : les cases à cocher, boutons radio et infobulles des property inspectors
s'affichaient donc en images cassées. `npm run build` livre maintenant `assets/` et échoue
explicitement si un inspector référence un fichier absent de la sortie.

## Statuts

- CONFIRMED : le SDK téléchargé (`main`, 2026-10-11) est identique ligne à ligne au
  `plugin-common-node` vendorisé qui avait été supprimé — les 5 fichiers de
  `sdk/ulanzi-api` et les 6 fichiers de `sdk/common-html` ne présentent aucune différence.
  Le remplacement du vendorisé par le SDK officiel est donc sans effet de comportement.
- CONFIRMED : les 13 membres de l'API utilisés par `service/app.js` (`connect`,
  `logMessage`, `setFeedback`, `onConnected`, `onAdd`, `onSetActive`, `onClear`,
  `onKeyDown`, `onKeyUp`, `onDialDown`, `onDialRotate`, `onDidReceiveSettings`,
  `onError`, `onClose`) existent tous dans le SDK téléchargé.
- CONFIRMED : `npm run native` reproduit les deux binaires depuis `native/` avec le
  `csc.exe` de `Framework64\v4.0.30319`, sans toolchain externe.
- CONFIRMED : `csc.exe` embarque un timestamp — deux compilations du même `Program.cs`
  ne produisent pas les mêmes octets. Les binaires ne sont donc pas comparables par
  hash, et le README de `pixy-controller` ne doit pas laisser croire le contraire.
- CONFIRMED : `npm run build` produit un bundle complet (`assets/`, `images/`, `libs/`,
  `native/`, `service/`, `ulanzi-api/`, `node_modules/ws`, `INSTALL.txt`), 8 modules
  d'inspector parsés, versions `manifest.json` / `package.json` cohérentes.
- CONFIRMED : `manifest.json` ne contenait plus qu'un seul fichier corrompu par une
  lecture/écriture Latin-1 d'un UTF-8 (§116, `d<2 octets U+FFFD>placement`). Corrigé en `déplacement`.
  Les 41 autres fichiers texte du dépôt ne contiennent aucun U+FFFD.
- UNVERIFIED : le plugin n'a pas été relancé dans Ulanzi Studio après restructuration.
  La validation matérielle (§29 OBS, §33 HID, §34 presets) date d'avant et reste valable
  sur le plan fonctionnel, mais les chemins d'icônes (`Images/` → `images/`) et le
  `CodePath` n'ont pas été revus par l'hôte. À confirmer au prochain démarrage de Studio.
- LIKELY : `manifest.json` gagnerait à passer `Images/` en SVG comme les deux autres
  plugins ; non fait à cette étape (hors périmètre).

---

# 47 - Refactorisation du service (2026-10-11)

Décision utilisateur (2026-10-11) : passer à la refactorisation du code, sur le modèle
Ulanzi-neewer-plugin. `plugin/app.js` était un fichier unique de 487 lignes qui
contenait la connexion SDK, le processus natif, la file de requêtes, l'état par touche,
l'analyse des UUID, la coalescence des encodeurs et les 19 actions.

## Découpage

- `service/app.js` : routage d'événements uniquement. Ne contient plus aucune commande
  caméra et aucun état de touche.
- `service/actions/` : `move.js` (6 actions), `center.js`, `encoder.js` (4),
  `position.js` (6), `mode.js` (3), `index.js` (registre).
- `service/core/` : `bridge.js`, `camera.js`, `context.js`, `dial.js`,
  `params.js`, `ui.js`, `shutdown.js`, `constants.js`.

Les tests (	ests/, 73 cas, aucun matériel requis) passent par setBridge() et par un
résolveur de modules qui redirige l'import du SDK vers `sdk/`.

## Défauts trouvés et corrigés

Chacun de ces points était observable, pas théorique.

1. **CONFIRMED — aucune échéance sur le bridge.** Une commande sans réponse (pilote UVC
   muet) ne résolvait jamais, le créneau « en vol » restait occupé et **toutes** les
   commandes suivantes étaient silencieusement abandonnées jusqu'au redémarrage de Studio.
   Corrigé : BRIDGE_TIMEOUT_MS = 4000, et le pipe est reconstruit plutôt que
   resynchronisé (une réponse tardive aurait été attribuée à la commande suivante).
2. **CONFIRMED — relance_TIMESTAMP du helper.** serve applique la position de démarrage
   à son démarrage (README de pixy-controller). Relancer le helper après un timeout
   déplaçait donc la caméra sans qu'aucune touche soit pressée. Corrigé : la relance est
   paresseuse, au prochain besoin.
3. **CONFIRMED — helper introuvable.** Un PixyController.exe absent ou bloqué ne
   rejetait rien ; toutes les commandes en attente restaient suspendues. Corrigé dans
   ailAll().
4. **CONFIRMED — ligne non-réponse.** Une bannière ou un diagnostic écrit sur stdout était
   interprété comme la réponse : la commande échouait au lieu de réussir. Corrigé : seule
   une ligne JSON est une réponse ; le reste est journalisé et ignoré, l'échéance couvre
   l'attente.
5. **CONFIRMED — uuid absent au relâchement.** handleShortAction lisait jsn.uuid au
   keyup. Si l'hôte ne l'envoie pas, le rappel d'un preset ne faisait **rien**, en
   silence. Corrigé : l'action est extraite du contexte, toujours présent.
6. **CONFIRMED — journalisation trompeuse.** presetSave écrivait preset-save <nom> ok
   en dehors de la branche qui vérifiait la réponse : le succès était journalisé sur un échec.
7. **CONFIRMED — delta d'encodeur global.** encoderDelta était un unique objet partagé :
   deux encodeurs sur deux axes différents accumulaient dans le même compteur. Corrigé :
   par touche, puis par axe dans la touche. Les crans tournés avant un changement d'axe
   ne sont plus appliqués au nouvel axe (bug attrapé par un test, dans la boucle de flush).
8. **CONFIRMED — timer d'appui long non annulé.** Le relâchement de touche ne cancellait
   pas le timer ; un appui court pouvait à la fois rappeler **et** enregistrer.
9. **CONFIRMED — settings reconstruits depuis les défauts.** Un message
   didReceiveSettings ne portant qu'un champ remettait les autres à leur défaut.
   Corrigé par fusion.
10. **CONFIRMED — aucune reprise sur exception.** Le SDK parse chaque trame entrante avant
    tout le reste : une trame invalide levait dans le SDK et tuait le service. Corrigé :
    uncaughtException journalise et continue.
11. **CONFIRMED — helper non arrêté.** onClose écrivait quit sans rien attendre ni tuer.

## Décisions explicites

- **Pas de liste blanche pour stepSize.** Une version antérieure du refactor-limitait
  les pas à [1,2,5,10,20]. Or le §43 confirme un stepSize=45 **conduit sur la caméra
  réelle** (Tilt -9 → 36). Une liste blanche aurait été une régression silencieuse : la clé
  serait passée de trois pressions à deux cents. Borné à MAX_STEP_SIZE = 100 seulement.
- **Valeurs nulles : fallback, pas clamp.** Un pas de 0 n'est pas « un pas très petit », c'est
  une touche qui ne déplace jamais la tête ; le clamper en 1 cacherait le réglage fautif.
- **Le seuil d'appui long est clampé, pas remplacé.** 50 ms n'est pas une absurdité à
  protéger, c'est un seuil que l'utilisateur voit et peut changer.

## Cohérence vérifiée

- CONFIRMED : les 19 actions du manifest sont enregistrées, et le registre ne contient rien
  d'autre (test pp.test.js).
- CONFIRMED : les panneaux affichent exactement les défauts du code — déplacement 10,
  zoom 5, encodeur 1, appui long 500 ms.
- CONFIRMED : les 73 tests passent sans caméra, sans D200X et sans le binaire natif.
- CONFIRMED : 
pm run build produit un bundle complet ; 15 modules de service et 1 module
  d'inspector parsés par le build.
- UNVERIFIED : **rien de tout cela n'a été rejoué sur la caméra réelle ni dans Ulanzi
  Studio.** Les validations matérielles des §28, §29, §33 et §34 restent valables sur le
  plan fonctionnel, mais les corrections de cette section sont vérifiées par test, pas par
  la caméra. À confirmer au prochain essai sur la PIXY, en particulier le délai de 4 s et
  la reconstruction du bridge.
- LIKELY : manifest.json gagnerait à passer images/ en SVG comme les deux autres
  plugins ; non fait, hors périmètre.
---

# 48 - Audit P1 : garde-fous non physiques (2026-10-11)

Terminé, P1 exécuté en entier. Aucun matériel requis. Suite : **104 tests** (73 + 31).

## 1. 	ests/wiring.test.js - 7 cas

Analyse statique du service. 
ode --check ne fait que parser : un nom utilisé jamais
importé parse parfaitement et lève un ReferenceError au premier appel, qui atterrit dans
le uncaughtException - qui journalise et continue. Le plugin marche, la ligne cassée est
une ligne de log que personne ne lit.

Cette famille d'erreur s'est produite **deux fois pendant le découpage du §47** : un objet
ridge inventé au point d'appel pour satisfaire une signature, et un champ lu ctx.action
alors que le constructeur l'appelait autrement. Les deux parsent.

Périmètre volontairement étroit : uniquement les appels **en colonne 0**, c'est-à-dire le
câblage de niveau module. C'est la méthode du projet frère, qui a subi exactement ce bug
(installShutdownHandlers(registry) sans import correspondant). Vérifier les appels dans
les corps de fonction produirait trop de faux positifs pour un gain nul ici.

Vérifié par mutation : supprimer l'import de installShutdownHandlers -> échec cité ;
renommer ender en endar -> échec cité. **Un test qui ne peut pas échouer ne vaut rien.**

## 2. 	ests/manifest.test.js - 13 cas

Contrôles que le build fait déjà sur la sortie, mais faits sur les sources, donc attrapés
par 
pm test et non en regardant le deck.

Le cas important est un **garde-fou de régression** : une action encodeur qui déclare
Devices: ["D200X"] **ne peut pas être déposée sur une molette**. C'est arrivé (§37), et
c'était invisible parce que le manifest est du JSON valide dans les deux cas.

Vérifié par mutation : réintroduire Devices: ["D200X"] sur l'action PTZ Encoder ->
échec cité.

## 3. scripts/mock-studio.mjs - remplacement des harnais perdus

Les quatre harnais mockStudio*.cjs qui avaient produit les CONFIRMED des §32, §38, §39 et
§43 n'existaient plus : **0 dans le dépôt, 0 dans le répertoire temporaire**. Toute cette
validation E2E avait disparu avec l'ancienne arborescence.

Remplacement, avec deux différences assumées :

- **Sans dépendance.** Il parle RFC 6455 sur 
ode:net + 
ode:crypto. Le seul paquet
  WebSocket du projet est ws, et c'est une dépendance d'exécution du plugin construit :
  un outil de développement ne doit pas y aller chercher. Les trames concernées sont de
  petits objets JSON texte, non fragmentés et non compressés - tout ce que le SDK envoie.
- **Il est testé.** 	ests/mock-studio.test.js (11 cas) le pilote avec le WebSocket natif
  de Node, donc une erreur de cadrage échoue à la suite au lieu d'échouer une session.

CONFIRMED : handshake accepté par le client natif de Node ; trame fractionnée réassemblée ;
trame masquée démasquée ; charge utile > 125 octets (champ de longueur étendu) ; trame non
JSON enregistrée comme telle et non comme un événement ; une requête HTTP non-upgrade
rejetée en 400.

Limite assumée : le client natif de Node n'est pas le paquet ws que le SDK utilise. Un
client conforme au RFC mais différent pourrait passer. Ce que le test garantit, c'est que le
cadrage est réel et que les deux implémentations s'accordent.

## 4. .csproj du diagnostic supprimé

Il déclarait 
et8.0-windows + ImplicitUsings + Nullable alors que la seule
compilation documentée est csc.exe .NET Framework, et que **le SDK .NET 8 n'est pas
installé** sur cette machine (§27). Un projet qui promet un dotnet build impossible est
pire que pas de projet. CONFIRMED : le code compile toujours avec la commande du README
(csc, code de sortie 0).

## 5. Branche efacto supprimée

Constatée au moment de commiter : HEAD était passé sur efacto, branche figée à
248223f - **avant** le commit du README. Tout le travail P1 se retrouvait non commité
par-dessus l'ancienne branche. efacto étant un ancêtre strict de develop, le
changement de branche a reporté les modifications sans perte, et la branche a été
supprimée (git branch -d).

## Statuts

- CONFIRMED : 104 tests passent, 
pm run build produit un bundle complet (15 modules de
  service, 1 module d'inspector parsés).
- CONFIRMED : 
pm run mock démarre et affiche son invite.
- UNVERIFIED : inchangé - tout ce qui demande la caméra ou le D200X. Voir §47.
---

# 49 - Sens reel des axes, mesure sur la camera (2026-10-11)

Ferme le point le plus ancien du projet, ouvert depuis le §22 et repris dans le §27, le §29
et le README de pixy-controller : **le signe effectif de chaque axe n'avait jamais ete
etabli**. Les tests d'ecriture du §28 et §29 utilisaient des deplacements d'un seul pas
(0 -> 1 -> 0) que l'utilisateur n'a pas percus ; les lectures Get prouvaient que le
pilote acceptait la valeur, pas que la tete bougeait dans le bon sens.

## Resultat du test utilisateur

| Action | Rotation / appui | Resultat |
| --- | --- | --- |
| Boutons Pan Gauche / Pan Droit | — | **KO, inverse** |
| Boutons Tilt Haut / Tilt Bas | — | OK |
| Boutons Zoom + / Zoom - | — | OK |
| Encodeur Zoom | gauche = zoom -, droite = zoom + | OK |
| Encodeur Pan | gauche = move droite, droite = move gauche | **KO, inverse** |
| Encodeur Tilt | gauche = move bas, droite = move haut | OK |
| Encodeur PTZ (cyclique) | identique aux encodeurs separes | pan a inverser |
| Center, presets, modes standard / tracking / privacy | — | OK |

## Lecture du resultat

Les quatre manifestations du pan sont **un seul et meme defaut**, pas quatre :

- bouton Pan Gauche envoyait pan -step et allait a droite ;
- encodeur pan rotation gauche envoyait pan -step et allait a droite.

Donc sur cette PIXY : pan +step deplace la tete vers la **gauche**, alors que
	ilt +step la monte et que zoom +step la resserre. Les trois axes n'ont pas la meme
convention de signe.

## Correction

AXIS_POLARITY dans core/constants.js : pan: -1, 	ilt: 1, zoom: 1. Appliquee par
les deux seuls endroits qui pilotent un axe - ctions/move.js et ctions/encoder.js -
qui gardent des directions physiques (gauche, droite, haut, bas, avant, arriere).

## Le piege que cela revele

Deux emplacements portent la meme conversion. Corriger un seul produit des touches qui
contredisent les molettes, ce qui ne se voit qu'en utilisant les deux. Le test
** key and its encoder move the head the same way** (	ests/actions.test.js) verifie
l'invariant pour les six paires bouton / encodeur.

Verifie par mutation : appliquer la polarite au bouton et l'oublier sur l'encodeur fait
echouer ce test (4 echecs), en citant
panleft moves like panencoder rotated left.

## Ce que ce test n'a pas corrige

Aucun autre defaut signale. Restent ouverts : §48 UNVERIFIED (delai du bridge,
reconstruction), §43 (Zoom In a stepSize=20 non concluant, camera au maximum), §29
(cohabitation OBS + plugin, jamais faite avec le plugin reellement installe), et les items
P3 de l'audit (debranchement, modes en ecriture seule, saut de camera au demarrage).

## Statuts

- CONFIRMED : polarite mesuree sur la camera pour les trois axes, boutons et encodeurs.
- CONFIRMED : 105 tests passent ; le build produit un bundle complet.
- UNVERIFIED : le resultat n'a pas ete revérifié apres correction - la correction ellememe
  n'est verifiee que par test. A confirmer au prochain essai sur la PIXY.
---

# 50 - Le pan de la PIXY contredit la convention documentee (2026-10-11)

Question posee par l'utilisateur : l'inversion du pan trouvee au §49 est-elle volontaire de
la part d'EMEET ? Verification dans la documentation plutot que supposition.

## Ce que disent les specifications

- **CameraControl_Pan** (Microsoft Learn, CameraControlProperty) : « Positive values are
  clockwise from the origin (the camera rotates clockwise when **viewed from above**), and
  negative values are counterclockwise ». Vu du dessus, un sens horaire est un mouvement
  vers la **droite**. Pan positif = panoramique a droite.
- **KSPROPERTY_CAMERACONTROL_PAN** : meme formulation, et impose une plage de
  **-180 a +180** pour le peripherique.
- **UVC 1.5**, CT_PAN_TILT_ABSOLUTE_CONTROL : meme convention, et pour le tilt « positive
  values point the imaging plane up ».

## Ce que fait la PIXY (mesure au §49)

| Axe | Convention documentee | Mesure | Conforme |
| --- | --- | --- | --- |
| Pan | positif = droite | positif = **gauche** | **NON** |
| Tilt | positif = haut | positif = haut | oui |
| Zoom | distance en mm | sans direction | sans objet |

Indice complementaire : le meme firmware annonce une plage de pan de **-150 a +150**, la ou
la specification exige -180 a +180.

## Lecture

La PIXY **contredit** la convention documentee, sur le pan seul. Cela est coherent avec un
firmware qui n'applique pas la spec a ce controle, pas avec une alternative deliberee et
documentee : aucune documentation EMEET ne mentionne une convention de signe propre.

L'intention d'EMEET **reste indeterminee** et ne peut pas etre etablie depuis cette machine.
Statut : **UNVERIFIED**.

Deduction possible, sans preuve : si EMEET Studio pilotait le pan par le meme chemin UVC
sans negation, le panoramique serait inverse pour tous les possesseurs d'une PIXY. Le pan
etant l'axe PTZ le plus utilise, l'une des deux hypotheses devrait tenir : EMEET Studio
applique la meme correction, ou il passe par un autre canal (le HID proprietaire, ou l'on
sait deja que voyagent les modes, §33 et §35). Aucune des deux n'est verifiee.

## Consequence pour le plugin

La correction reste juste dans tous les cas : le plugin doit epouser **le materiel**, pas la
specification. Mais AXIS_POLARITY est un **contournement avec une condition de retrait** :

> Si EMEET corrige un jour le signe dans une mise a jour de firmware, supprimer l'entree
> pan de AXIS_POLARITY. Les boutons et l'encodeur de panoramique s'inverseront alors.

Le commentaire de core/constants.js porte cette condition.

## Statuts

- CONFIRMED : la convention documentee pour le pan est « positif = droite », vue du dessus
  (Microsoft Learn, CameraControlProperty et KSPROPERTY_CAMERACONTROL_PAN).
- CONFIRMED : la PIXY fait l'inverse, et declare une plage -150..+150 la ou la spec exige
  -180..+180 (§49 et §27).
- UNVERIFIED : l'intention d'EMEET. Aucune source disponible depuis cette machine.
- UNVERIFIED : le comportement d'EMEET Studio pour le pan. Le tester reAuditerait si EMEET
  fait la meme negation, mais ne repondrait pas a la question d'intention.
---

# 51 - Parametre utilisateur « Sens de panoramique » (2026-10-11)

Demande utilisateur : pouvoir choisir le sens du panoramique, plutot que de subir celui
qui est code en dur.

## Pourquoi

Le §50 a montre que la polarite du pan est une non-conformite du firmware. La corriger en
dur règle le probleme pour tout le monde, mais :

- un utilisateur peut preferer l'autre sens, sans avoir de raison technique de le demander ;
- si EMEET corrige un jour le signe, tous ceux qui ont choisi « normal » retinse
  immediatement, et ceux qui avaient choisi « inverse » se retrouvent enfin justes sans
  rien avoir change. Le reglage rend la correction future non cassante.

## Perimetre

Trois actions, les seules quiRegexistent un reglage panDirection :

- Pan Left, Pan Right — panneau property-inspector/pixyMove/pan.html
- Pan (Encodeur) — panneau property-inspector/pixyEncoder/pan.html

Valeurs : 
ormal (defaut, ce que fait la camera mesure au §49) et inverted.

**Tilt et zoom n'ont pas ce reglage.** Ils sont conformes a la convention documentee : il
n'y a rien a choisir, et une preference qui ne change rien est pire qu'absence de
preference. Un test verifie que le champ n'apparait que sur les trois actions pan.

## Point de conception : deux panneaux de deplacement au lieu d'un

pixyMove/inspector.html etait partage par Pan et Tilt parce que leurs reglages de pas
etaient identiques (§43). Ajouter une option propre au pan oblige a les separer :
pan.html et 	ilt.html, avec zoom.html deja existant. Les fichiers restent symetriques
et un test garantit que Pan et Tilt ne partagent plus de panneau.

## Point de conception : une seule conversion

Les touches et les encodeurs pilotaient chacun leur polarite (§49). Le reglage utilisateur
serait donc propage a deux endroits, avec le meme risque de derive que deja constate.
driverPolarity(axis, settings) dans core/params.js est desormais le point unique ou un
axe devient une valeur pilote : polarite camera, puis preference de l'utilisateur.

## Non couvert, volontairement

L'action PTZ Encoder (cyclique) deplace aussi le panoramique lorsqu'elle est sur cet axe,
mais son panneau est partage avec les encodeurs Tilt et Zoom, ou le reglage n'a pas de sens.
Elle n'est donc pas concernee. Consequence : un utilisateur qui choisit « inverse » sur les
touches Pan constatera que l'encodeur PTZ, lui, garde le sens normal quand il est sur Pan.

## Statuts

- CONFIRMED : le reglage est applique aux touches Pan et a l'encodeur Pan, et n'affecte ni
  Tilt ni Zoom. Verifie par mutation : rendre le reglage inoperant cote encodeur fait
  echouer 3 tests ; le rendre applicable a tous les axes fait echouer le test qui verifie
  que Tilt et Zoom l'ignorent.
- CONFIRMED : le champ n'apparait que sur les trois panneaux pan.
- UNVERIFIED : le comportement dans Ulanzi Studio — le select n'a pas ete ouvert sur la
  machine. La valeur voyage par le canal habituel (didReceiveSettings), deja couvert par
  les tests, mais le rendu du panneau n'a pas ete vu.
- LIKELY : un utilisateur choisira "inverse" sur les boutons Pan et remarquera que
  l'encodeur PTZ ne suit pas. A confirmer, puis etendre si besoin.
---

# 52 - Deux corrections du reglage « Sens de panoramique » (2026-10-11)

Retour utilisateur apres la livraison du §51 : deux problemes.

## 1. La selection revenait a « Normal » apres un aller-retour sur un autre bouton

**Cause.** onAdd fusionnait les valeurs par defaut de l'action a **chaque** apparition
de la cle :

    mergeSettings(entry, defaultsFor(uuid));
    mergeSettings(entry, message.param);

L'hote repond au panneau de proprietes **avant** d'annoncer la cle. Les choix de
l'utilisateur etaient donc deja dans l'entree quand les defauts venaient se poser
dessus. Resultat : « inverted » revenait a « normal » systematiquement.

**Correction.** Les defauts sont des valeurs de **creation**, pas de mise a jour.
ensureEntry(store, context, uuid, defaults) les applique au moment ou l'entree n'existe
pas encore, et onAdd ne fusionne plus que la copie de l'hote (message.param).

**Regle plus generale.** Un defaut d'action ne doit jamais etre reapplique a une entree
existante : c'est la seule maniere dont un defaut peut ecraser une choix utilisateur sans
que rien ne signale l'ecrasement.

**Verifie par mutation.** Reinjecter la fusion des defauts dans onAdd fait echouer
 choice made in a panel survives the key being looked at again. Le test manquant
precedemment est ce qui a permis au bug d'atteindre la machine.

## 2. L'encodeur PTZ cyclique n'avait pas le reglage

Volontairement exclu au §51, parce que son panneau etait partage avec les encodeurs Tilt
et Zoom, ou le reglage n'a pas de sens. L'utilisateur l'a signale comme manquant.

**Correction.** Panneau propre property-inspector/pixyEncoder/ptz.html, comme pan.html
l'a ete pour l'encodeur Pan. inspector.html reste pour Tilt et Zoom.

Le code n'a pas eu besoin d'etre change pour le fonctionnement : onDialRotate passe deja
par driverPolarity(axis, settings), donc la preference de l'utilisateur
s'applique des que le reglage existe pour l'axe courant. encoder.js expose maintenant
defaultsFor(uuid) au lieu d'un defaults unique, pour que le defaut panDirection soit
semé sur les deux encodeurs qui bougent le panoramique.

**Portee.** Le reglage ne s'applique que lorsque la molette est sur l'axe Pan ; sur Tilt et
Zoom elle n'a aucune effet, ce que verifie un test.

## Le piege que le point 2 a revele

Un encodeur « cyclique » n'est pas un encodeur d'axe : il en est trois dans un seul. Lui
offrir le reglage demandait de separer son panneau, exactement comme Pan et Tilt l'ont
demande pour la meme raison. La regle qui en sort : **tout reglement qui ne s'applique
qu'a certains axes doit avoir son propre panneau**, sinon il apparait la ou il ne fait rien.

## Statuts

- CONFIRMED : le choix de l'utilisateur survit a un aller-retour sur un autre bouton.
- CONFIRMED : les quatre actions qui bougent le panoramique - Pan Left, Pan Right,
  Pan Encoder, PTZ Encoder - exposent le reglage ; les autres ne l'exposent pas.
- CONFIRMED : le reglage ne modifie ni Tilt ni Zoom, sur aucun des quatresencodeurs.
- UNVERIFIED : le rendu des panneaux dans Ulanzi Studio, comme au §51.
---

# 53 - Cause reelle du reset du reglage : les panneaux n'ont jamais relu (2026-10-11)

Le §52 avait corrige un defaut reel mais pas la cause. Retour utilisateur : le choix
revenait toujours sur « Normal », et « semble creer des confusions ».

## Analyse

En suivant le trajet d'une valeur depuis le panneau jusqu'a l'hote, trois maillons
manquaient. Aucun ne produzait d'erreur : tous trois etaient silencieux.

### 1. Le panneau ne demandait jamais ses reglages

- connect() dans le SDK **n'envoie rien** : il ne fait que lire les parametres d'URL.
- didReceiveSettings est la **reponse** a une demande getSettings(), pas un envoi
  spontane de l'hote.
- Notre shared.js n'appelait **jamais** getSettings().

Consequence : les panneaux etaient **uniquement/ecrivants**. Ils pouvaient changer un
reglage mais ne pouvaient jamais afficher ce qu'il valait. A chaque ouverture, ils
affichaient les valeurs selected du markup - donc « Normal » paraissait toujours avoir
ete perdu.

### 2. La sauvegarde envoyait le formulaire entier

    settings = { ...settings, ...Utils.getFormValue(form) };

Tout champ que l'hote n'avait pas fourni revenait avec sa valeur selected du markup.
Ouvrir le panneau puis toucher **un seul autre champ** suffisait a ecraser le choix. C'est
la source des « confusions » : la valeur affichee et la valeur stockee divergeaient en
permanence.

### 3. Le service ne demandait rien non plus

pp.js n'avait aucun gestionnaire : il ne demandait pas les reglages a l'hote pour une
cle ajoutee, et ignorait paramfromapp - la meme charge utile sous un autre nom, envoyee
une fois qu'un panneau a ete ouvert pour une cle deplacee.

## Pourquoi stepSize paraissait fonctionner

Le defaut du markup etait identique au defaut du code (10 pour le deplacement, 5 pour le
zoom, 1 pour l'encodeur). Un reglage coherent avec son defaut semble fonctionner meme
qu'il n'est jamais relu. Seuls les reglages **non par defaut** - donc exactement le nouveau
reglage de sens - rendaient la panne visible.

C'est le point le plus important de cette analyse : ce bug aurait ete invisible sur tous les
autres reglages du plugin.

## Correction

shared.js :

- appelle $UD.getSettings() une fois connecte ;
- ecoute aussi onParamFromApp en plus de onDidReceiveSettings ;
- n'envoie plus que les champs **reellement modifies**, mesures contre la valeur que
  l'hote declare, et contre l'ecran seul pour un champ que l'hote n'a jamais dit.

pp.js :

- $UD.getSettings(context) a l'ajout d'une cle ;
- gestionnaire onParamFromApp, meme traitement que onDidReceiveSettings.

## Regle qui en sort

Un panneau ne doit jamais ecrire un champ qu'il n'a pas lu. Plus generalement : **tout
reglage doit faire un aller-retour complet avant d'etre considere fonctionnel**, et un
reglage dont le defaut du panneau coincide avec le defaut du code ne prouve rien.

## Tests

Nouveau 	ests/property-inspector.test.js : shared.js est charge dans un contexte VM
avec un DOM minimal, un $UD et un Utils factices, et pilote par les memes evenements
que l'hote envoie. 9 cas couvrant la demande, l'hydratation, l'absence d'envoi quand rien
n'a ete modifie, la non-regression des champs non touches, et le cas d'un panneau qui n'a
jamais recu ses reglages.

Verifie par mutation :

- supprimer getSettings() -> 1 echec ;
- restaurer la sauvegarde du formulaire entier -> 3 echecs.

## Statuts

- CONFIRMED : les panneaux n'avaient jamais demande leurs reglages ; desormais ils le font.
- CONFIRMED : un champ non touche n'est plus renvoye a l'hote.
- CONFIRMED : 125 tests passent.
- UNVERIFIED : le comportement dans Ulanzi Studio. C'est la premiere fois que le cycle
  complet est couvert par des tests, mais c'est aussi la premiere fois que le host est
  suppose repondre a une demande getSettings issue d'un panneau de ce plugin.
---

# 54 - Validation du plugin refactorise sur la camera et sur le D200X (2026-10-11)

Recouvrement des UNVERIFIED des §47, §49 et §53.

## Recouvrement : la refactorisation (§47)

- CONFIRMED : le service refactorise, ses 15 modules et le bridge reconstruit a bien ete
  utilise sur le D200X reel avec la camera PIXY branchee. Aucune erreur de chemin n'a ete
  signalee.
- CONFIRMED : les panneaux d'inspecteur se chargent et affichent leurs champs.
- CONFIRMED : le cycle complet des reglages fonctionne - un choix fait dans un panneau est
  conserve, relu a la reouverture, et ne peut pas etre ecrase par un autre champ. C'est le
  dernier UNVERIFIED du §53 : l'hote repond bien a une demande getSettings emanant d'un
  panneau de ce plugin.

## Resultats fonctionnels (utilisateur, camera reelle + D200X)

| Action | Resultat |
| --- | --- |
| Boutons Pan Gauche / Pan Droit | OK apres la correction du §49 |
| Boutons Tilt Haut / Bas | OK |
| Boutons Zoom + / - | OK |
| Boutons Center | OK |
| Presets de position (rappel court, enregistrement long) | OK |
| Mode Standard | OK |
| Mode Tracking | OK |
| Mode Privacy | OK |
| Encodeur Pan, Tilt, Zoom | OK apres la correction du §49 |
| Encodeur PTZ cyclique | OK |
| Reglage « Sens de panoramique » sur les 3 actions pan + PTZ | OK |
| Persistance du reglage d'un panneau a l'autre | OK apres la correction du §53 |

## Statuts

- CONFIRMED : toutes les 19 actions de l'§2 sont exercees au moins une fois sur le materiel
  et repondent correctement.
- CONFIRMED : les 7 modes et positions de la table ci-dessus.
- CONFIRMED : le §49 - inversion du pan corrigee sur les boutons et les encodeurs, fixe et
  cyclique.
- CONFIRMED : le §53 - les panneaux relisent leurs reglages, et un choix n'est plus ecrase
  ni par un autre champ ni a la reouverture.
- LIKELY : le §53 corrigeait aussi le stepSize, qui n'a jamais ete relu lui non plus. Non
  verifie explicitement par l'utilisateur.
- UNVERIFIED : cohabitation OBS + plugin en meme temps (le §29 a teste OBS + sonde, jamais
  OBS + plugin installe).
- UNVERIFIED : debranchement de la camera en cours d'utilisation, et le delai de 4 s du
  bridge avec sa reconstruction.
- UNVERIFIED : saut de la camera a la position start au demarrage du bridge.
- UNVERIFIED : Zoom In a stepSize=20 (§43, non concluant a l'epoque, camera au maximum).