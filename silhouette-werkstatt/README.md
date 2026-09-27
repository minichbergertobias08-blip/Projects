# Silhouette Werkstatt

Foto rein → saubere Auto-Linienzeichnung (Wandbild) raus. Läuft komplett offline in Chrome/Edge.

- **Benutzen:** `dist/silhouette-werkstatt.html` herunterladen und im Browser öffnen.
- **Speichern:** Marke + Modell oben eintragen, „Speichern“ → legt die Dateien in
  `\\mnas01\Shop\Shop\3D Dateien\2D Auto Wandbild\<Marke>\<Modell>.*` ab (Ordner einmal wählen).

## Entwickeln
- Quellcode: `src/index.html`, `src/app.js`; KI-Modelle in `assets/`.
- Bauen: `python3 tools/build.py` → `dist/silhouette-werkstatt.html` (alles eingebettet).

## Eingebettete Modelle
- Informative Drawings „anime style“ (MIT, Chan/Durand/Isola 2022) – zeichnet die Linien
- U²-Net-P (Apache-2.0) – stellt das Auto frei
- NanoDet-Plus (Apache-2.0) – findet das Auto
- YOLOv8n-seg Car-Damage-Parts (M. Nisar) – findet die Räder
- TEED (MIT) – Kanten für Umriss/Räder
- onnxruntime-web 1.20.1 (MIT), earcut (ISC)
