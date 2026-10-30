#!/bin/bash
# Permite que Illustrator cargue paneles propios (como SuperExport) que no vienen de Adobe Exchange.
for v in 9 10 11 12; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done
DESTINO="$HOME/Library/Application Support/Adobe/CEP/extensions"
mkdir -p "$DESTINO"
rm -rf "$DESTINO/com.estudio03.logopack"   # versión anterior (LogoPack)
rm -rf "$DESTINO/com.superexport"
cp -R "$(dirname "$0")/com.superexport" "$DESTINO/"
echo "Listo: SuperExport quedó instalado. Reinicia Illustrator y ábrelo en Ventana > Extensiones > Super Export."
