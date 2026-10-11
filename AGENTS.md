# AGENTS.md

## Mission

Développer un plugin Ulanzi D200X permettant de contrôler directement une caméra EMEET PIXY 4K depuis Ulanzi Studio, sous Windows 11, sans dépendre d'EMEET Studio.

Architecture cible :

D200X → Ulanzi Studio → plugin Node.js → contrôleur PIXY Windows/UVC → EMEET PIXY 4K

OBS doit continuer à utiliser la PIXY comme webcam UVC pour la capture vidéo.

## Règles impératives

1. Ne rien inventer.
2. Ne pas présenter une hypothèse comme un fait établi.
3. Vérifier les affirmations techniques dans la documentation, le code source ou par un test reproductible.
4. Distinguer systématiquement :
   - CONFIRMED : vérifié par documentation/source/test ;
   - LIKELY : fortement probable mais pas encore vérifié ;
   - UNVERIFIED : à tester ;
   - REJECTED : voie testée et non fonctionnelle.
5. Ne pas utiliser EMEET Studio dans l'architecture finale.
6. Ne pas modifier les pilotes Windows.
7. Ne pas demander à l'utilisateur de désinstaller ou modifier un composant système sans justification et procédure de retour arrière.
8. Préserver le fonctionnement d'OBS.
9. Ne pas remplacer une méthode Windows native par libusb si une API Windows appropriée fonctionne.
10. Ne pas implémenter le tracking/HID dans la première version PTZ tant que le contrôle UVC n'est pas validé.
11. Avant toute implémentation importante, inspecter le dépôt local et la documentation pertinente.
12. Toute dépendance externe ajoutée au projet doit être justifiée.
13. Toute commande destructive doit être explicitement signalée avant exécution.
14. Les tests doivent être réversibles et isoler une seule couche à la fois.

## Priorité des méthodes de contrôle PIXY

Tester dans cet ordre :

1. Windows IAMCameraControl / API caméra UVC standard.
2. Windows IKsControl / contrôles UVC ou Extension Units si nécessaire.
3. Accès USB/UVC bas niveau.
4. libusb/WinUSB seulement si les solutions Windows natives ne permettent pas le contrôle nécessaire.

Ne pas commencer directement par libusb.

## Première phase obligatoire

Avant de construire le plugin complet, créer un outil de diagnostic minimal capable de déterminer ce que Windows expose pour la PIXY.

Le diagnostic doit rechercher notamment :

- présence de la caméra ;
- nom du périphérique ;
- VID/PID si accessible ;
- interfaces pertinentes ;
- capacités Pan ;
- capacités Tilt ;
- capacités Zoom ;
- valeurs min/max/step/current lorsque disponibles ;
- possibilité de modifier les contrôles ;
- éventuels contrôles non standards.

Le diagnostic ne doit pas modifier durablement la configuration de Windows.

## Deuxième phase

Créer un contrôleur PIXY minimal indépendant d'Ulanzi.

Objectif :

- center ;
- pan ;
- tilt ;
- zoom ;
- lecture des limites ;
- lecture de la position courante si possible.

Le contrôleur doit être testable depuis le terminal.

Exemples conceptuels uniquement ; adapter à l'implémentation réellement retenue :

    pixy-controller info
    pixy-controller center
    pixy-controller pan ...
    pixy-controller tilt ...
    pixy-controller zoom ...

Ne pas figer ces commandes avant d'avoir choisi l'architecture technique.

## Troisième phase

Créer le plugin Ulanzi D200X.

Le plugin doit exploiter le SDK officiel UlanziDeckPlugin-SDK.

Fonctions envisagées :

- touches Pan gauche/droite ;
- touches Tilt haut/bas ;
- Zoom +/− ;
- Center ;
- encodeur pour Pan/Tilt/Zoom ;
- pression de l'encodeur pour changer de mode ;
- affichage du mode actif ;
- presets ultérieurement.

## Première version fonctionnelle

La V1 doit rester volontairement simple :

- détection PIXY ;
- Pan ;
- Tilt ;
- Zoom ;
- Center ;
- encodeur ;
- aucune dépendance à EMEET Studio.

Ne pas ajouter tracking, privacy, gesture ou autres commandes HID tant que la V1 UVC/PTZ n'est pas stable.

## Ulanzi

La documentation et le SDK officiels sont prioritaires :

https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK

Le plugin doit cibler explicitement le D200X et utiliser les mécanismes prévus par le SDK.

Le SDK indique une exécution Node.js 20 pour les plugins Node.js. Vérifier la version réellement utilisée par la version d'Ulanzi Studio installée avant de figer le runtime.

Le plugin doit gérer proprement :

- onAdd ;
- onRun ;
- onKeyDown/onKeyUp ;
- onDialDown/onDialUp ;
- événements de rotation de l'encodeur ;
- mise à jour de l'affichage ;
- nettoyage lors de l'arrêt.

## PIXY / UVC

Des travaux tiers ont identifié des contrôles UVC de la PIXY, notamment :

- CT_ZOOM_ABSOLUTE_CONTROL ;
- CT_PAN_TILT_ABSOLUTE_CONTROL.

Ces éléments doivent être considérés comme une base de recherche, pas comme une API EMEET officielle.

Référence de recherche :

https://github.com/dheldt/emeet-cli

Le projet tiers a notamment exploré :

- VID/PID ;
- descripteurs UVC ;
- Camera Terminal ;
- requêtes GET_MIN ;
- GET_MAX ;
- GET_CUR ;
- SET_CUR ;
- Pan/Tilt ;
- Zoom.

Avant de recopier une implémentation, vérifier la version actuelle du dépôt et comprendre le code.

## Windows

Explorer en priorité les API Windows documentées :

- IAMCameraControl ;
- IKsControl ;
- pilote USB Video Class de Windows ;
- éventuellement Media Foundation / DirectShow selon ce qui est nécessaire.

Documentation Microsoft à consulter :

https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/usb-video-class-driver-overview

https://learn.microsoft.com/en-us/windows/win32/api/strmif/nn-strmif-iamcameracontrol

https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/device-requirements-for-usb-video-class-extension-units

Ne pas supposer qu'un contrôle UVC identifié au niveau USB est automatiquement disponible via IAMCameraControl. Le vérifier sur la PIXY réelle.

## USB brut

Si les API Windows natives ne suffisent pas, étudier :

- WinUSB ;
- libusb ;
- control transfers UVC.

Ne jamais installer/remplacer le pilote de la caméra uniquement pour faciliter le développement sans avoir démontré que c'est nécessaire.

## OBS

OBS doit pouvoir continuer à capturer la PIXY.

L'objectif est :

- OBS = capture vidéo ;
- plugin = contrôle PTZ ;
- aucun besoin d'EMEET Studio.

Tester explicitement le contrôle PTZ pendant qu'OBS utilise la caméra.

## Qualité d'image

La colorimétrie et la qualité vidéo ne font pas partie du premier périmètre du plugin.

Elles seront réglées dans OBS.

Ne pas chercher à reproduire les réglages d'image d'EMEET Studio dans la V1.

## Architecture logicielle recommandée

Architecture souhaitée :

    Ulanzi D200X
          |
          v
    Ulanzi Studio
          |
          v
    Node.js plugin
          |
          v
    PIXY controller
          |
          v
    Windows UVC / camera API
          |
          v
    EMEET PIXY

Un processus natif Windows séparé est acceptable si Node.js ne permet pas proprement l'accès aux API Windows nécessaires.

Dans ce cas, préférer un processus persistant/bridge IPC plutôt que de lancer un exécutable à chaque mouvement de molette.

## Performance

Les mouvements de l'encodeur peuvent générer beaucoup d'événements.

Éviter :

- lancement d'un processus par événement ;
- accumulation de commandes obsolètes ;
- files de commandes infinies ;
- latence perceptible.

Préférer :

- contrôleur persistant ;
- coalescence des mouvements ;
- dernière valeur connue ;
- limitation raisonnable du débit si nécessaire.

## Sécurité / stabilité

Le plugin doit :

- gérer l'absence de caméra ;
- gérer le débranchement/rebranchement ;
- gérer les erreurs UVC ;
- ne pas planter Ulanzi Studio ;
- libérer correctement les ressources ;
- journaliser les erreurs utiles ;
- éviter les boucles de retry agressives.

## Documentation du projet

Maintenir une documentation courte et factuelle :

- architecture ;
- installation ;
- développement ;
- tests ;
- limitations ;
- commandes supportées ;
- résultats des tests matériels.

Toute découverte importante doit être ajoutée à PROJECT_CONTEXT.md avec son statut.

## Méthode de travail

Pour chaque étape :

1. rechercher ;
2. vérifier ;
3. implémenter le plus petit test possible ;
4. exécuter le test ;
5. enregistrer le résultat ;
6. seulement ensuite passer à la couche suivante.

Ne pas développer tout le plugin avant d'avoir validé le contrôle PIXY indépendant d'Ulanzi.

## Critère de réussite final

Le projet sera considéré fonctionnel lorsque :

1. Ulanzi Studio détecte le plugin ;
2. le D200X déclenche les actions ;
3. la PIXY répond au Pan/Tilt/Zoom ;
4. Center fonctionne ;
5. OBS continue de capturer la vidéo ;
6. EMEET Studio n'est pas nécessaire ;
7. aucune modification permanente du pilote Windows n'est nécessaire.
