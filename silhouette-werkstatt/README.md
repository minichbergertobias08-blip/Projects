# Silhouette Werkstatt

Foto rein → saubere Auto-Linienzeichnung (Wandbild) raus. Läuft komplett offline in Chrome/Edge.

- **Benutzen:** `dist/silhouette-werkstatt.html` herunterladen und im Browser öffnen, Foto reinziehen.
- **Beste Fotos:** genaue Seitenansicht, ganzes Auto im Bild, etwas Rand drumherum.
- **Speichern:** Marke + Modell oben eintragen, „Speichern“ → legt die Dateien in
  `\\mnas01\Shop\Shop\3D Dateien\2D Auto Wandbild\<Marke>\<Modell>.*` ab (Ordner einmal wählen).

## Wandbild-Standard (automatisch)
Außenkontur mit offenen Radhäusern (Kreisbögen bis zum Boden, keine Räder), Fenster mit Säulen,
Türfugen bis zum Schweller, Türgriffe, Spiegel, Scheinwerfer/Rückleuchte, Schwellerlinie, Charakterlinien.
Front immer rechts (wird automatisch gespiegelt), Linienbreite fest 2,0 mm bei 250 mm Breite.

## Selbst anpassen
Panel **„Was soll drauf?“** – Häkchen weg = Bauteil verschwindet sofort (Fenster, Türlinien, Türgriffe,
Schwellerlinie, Räder statt offener Radhäuser, Lichter, Spiegel, Zusatzlinien, Antenne weglassen).

Werkzeuge links: **V** jede Linie anklicken und ziehen = verschieben, Punkte ziehen = Form ändern,
Doppelklick = Punkt einfügen, Alt+Klick = Punkt löschen, Entf = Linie löschen ·
**D** Linie löschen · **N** Punkte setzen = neue glatte Linie · **G** Gerade · **K** Kreis · **R** Radierer · Strg+Z zurück.

Regeln, die immer gelten: alles ist ein zusammenhängendes Teil, Linien berühren sich nur, nichts steht über.

## Claude (optional)
Mit eigenem API-Schlüssel (console.anthropic.com) erkennt Claude Marke/Modell und entfernt störende Linien.

## Entwickeln
- Quellcode: `src/index.html`, `src/app.js`; KI-Modelle in `assets/`.
- Bauen: `python3 tools/build.py` → `dist/silhouette-werkstatt.html` (alles eingebettet).
- Stil „Minimal“ wird in `composeMin()` konstruiert (Umriss, Reifen, Radläufe, Fenster, Spiegel/Lichter, Türen).

## Eingebettete Modelle
- Informative Drawings „anime style“ (MIT, Chan/Durand/Isola 2022) – zeichnet die Linien
- U²-Net-P (Apache-2.0) – stellt das Auto frei
- NanoDet-Plus (Apache-2.0) – findet das Auto
- YOLOv8n-seg Car-Damage-Parts (M. Nisar) – findet Räder, Scheiben, Türen, Lichter, Spiegel
- TEED (MIT) – Kanten für Umriss/Räder
- onnxruntime-web 1.20.1 (MIT), earcut (ISC), Anthropic TypeScript SDK (MIT)
