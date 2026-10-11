# PIXY CameraControl diagnostic

Sonde Windows DirectShow strictement en lecture seule pour la caméra EMEET PIXY.

Sans argument, elle sélectionne le périphérique dont le chemin contient `VID_328F&PID_00C0`, puis appelle uniquement `QueryInterface(IAMCameraControl)`, `GetRange` et `Get` sur Pan, Tilt et Zoom.

## Compilation sur cette machine

```powershell
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:exe `
  /out:bin\PixyCameraControlDiagnostic.exe Program.cs
```

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
