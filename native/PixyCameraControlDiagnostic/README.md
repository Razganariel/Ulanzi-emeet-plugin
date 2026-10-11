# PIXY CameraControl diagnostic

Sonde Windows DirectShow strictement en lecture seule pour la caméra EMEET PIXY.

Sans argument, elle sélectionne le périphérique dont le chemin contient `VID_328F&PID_00C0`, puis appelle uniquement `QueryInterface(IAMCameraControl)`, `GetRange` et `Get` sur Pan, Tilt et Zoom.

Cet outil n'est **pas** construit par `npm run build` et ne fait pas partie du plugin. Il sert à revérifier une capacité sur la machine, quand un doute est levé. Ne pas le lancer pendant une capture OBS.

## Compilation sur cette machine

```powershell
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe `
  /out:bin\PixyCameraControlDiagnostic.exe Program.cs
```

Le compilateur .NET Framework 4 livré avec Windows est le seul requis : aucune
dépendance n'est installée ni téléchargée. Ajouter `/platform:x86` produit un binaire
32 bits ; les deux ont retourné les mêmes valeurs (PROJECT_CONTEXT.md §27).

Il n'y a volontairement **pas** de fichier `.csproj` : le SDK .NET 8 n'est pas installé sur
cette machine et un projet qui promet un `dotnet build` impossible est pire que pas de
projet du tout.

## Exécution

```powershell
.\bin\PixyCameraControlDiagnostic.exe
```

Sans argument, le binaire n'envoie aucune commande PTZ et ne modifie aucun pilote Windows.

## Vérification réversible d'une écriture

```powershell
.\bin\PixyCameraControlDiagnostic.exe --verify-set pan
```

Remplacer `pan` par `tilt` ou `zoom` pour n'éprouver qu'un axe à la fois. Cette commande lit la valeur initiale, écrit une variation d'un seul pas, la relit, puis restaure immédiatement la valeur initiale et vérifie la restauration. Elle ne doit pas être exécutée pendant une capture OBS et ne remplace ni ne modifie aucun pilote.
