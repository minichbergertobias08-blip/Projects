# Key Holder (Windows)

Hält eine Taste dauerhaft gedrückt, solange aktiv. Kein Python nötig.

1. `KeyHolder.exe` starten
2. Taste eintragen (`w`, `space`, `shift`, `ctrl`, `f1`, `up`, `lmb` = linke Maustaste, …)
3. **F8** oder Button = Start/Stop

Neu bauen: `x86_64-w64-mingw32-gcc -O2 -s -mwindows key_holder.c -o KeyHolder.exe`
