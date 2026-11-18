#!/usr/bin/env bash
# App-Store-Screenshots (6,9" iPhone, 1320 × 2868 px) aus dem iOS-Simulator aufnehmen.
#
# Ablauf: Simulator starten, Statusleiste auf 9:41 / volles Netz / voller Akku setzen, helles
# Erscheinungsbild. Danach fragt das Skript jeden Bildschirm einzeln ab: In der App hinnavigieren,
# im Terminal Enter drücken – der Screenshot wird gespeichert. „s“ + Enter überspringt einen Bildschirm.
#
# Aufruf (im Ordner apps/ios oder irgendwo):  bash docs/app-store/screenshots.sh
# Die App muss vorher einmal aus Xcode auf genau diesem Simulator gestartet worden sein.

set -euo pipefail

OUT="${OUT:-$HOME/Desktop/Werkuno-Screenshots}"
mkdir -p "$OUT"

# Erstes verfügbares 6,9"-Gerät (Pro Max) wählen
DEVICE=""
for name in "iPhone 17 Pro Max" "iPhone 16 Pro Max"; do
  if xcrun simctl list devices available | grep -q "$name ("; then DEVICE="$name"; break; fi
done
if [ -z "$DEVICE" ]; then
  echo "Kein iPhone 17 Pro Max / 16 Pro Max Simulator gefunden."
  echo "Xcode → Window → Devices and Simulators → + → iPhone 17 Pro Max anlegen."
  exit 1
fi
echo "Simulator: $DEVICE"
xcrun simctl boot "$DEVICE" 2>/dev/null || true
open -a Simulator
sleep 3

# Saubere Statusleiste wie in Apples eigenen Bildern
xcrun simctl status_bar booted override \
  --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
xcrun simctl ui booted appearance light

SCREENS=(
  "01-werkbank|Werkbank (Startseite eingeloggt) mit Story-Kreisen oben"
  "02-entdecken|Entdecken"
  "03-projekt|Ein Projekt mit schönen Fotos und Fortschritt"
  "04-anleitung|Eine Anleitung (Schritt-Ansicht)"
  "05-markt|Markt"
  "06-produkt|Produktseite (am besten ein Produkt mit gutem Titelbild)"
  "07-profil|Profil (eigenes oder ein Maker-Profil mit vielen Projekten)"
  "08-nachrichten|Nachrichten (Unterhaltung)"
  "09-studio|Ich → Werkuno Studio"
  "10-pro|Ich → Werkuno Studio → Creator Pro"
  "11-ich|Ich (Reserve)"
  "12-einstellungen|Einstellungen (Reserve)"
)

for entry in "${SCREENS[@]}"; do
  file="${entry%%|*}"; label="${entry#*|}"
  echo
  echo "▶ $label"
  read -r -p "  In der App öffnen, dann Enter (s = überspringen): " ans
  if [ "$ans" = "s" ]; then continue; fi
  xcrun simctl io booted screenshot --type=png "$OUT/$file.png" >/dev/null
  size=$(sips -g pixelWidth -g pixelHeight "$OUT/$file.png" | awk '/pixel/ {print $2}' | paste -sd x -)
  echo "  ✓ gespeichert: $file.png ($size)"
done

xcrun simctl status_bar booted clear
echo
echo "Fertig. Bilder liegen in: $OUT"
open "$OUT"
