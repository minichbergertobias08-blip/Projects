"""Key Holder – hält eine Taste dauerhaft gedrückt, solange aktiv.

Start/Stop: Button oder F8 (global). Benötigt: pip install pynput
"""
import threading
import time
import tkinter as tk

from pynput import keyboard

TOGGLE_HOTKEY = keyboard.Key.f8
REPEAT_INTERVAL = 0.03  # Sekunden – simuliert Auto-Repeat (wichtig für Spiele)

ctrl = keyboard.Controller()


def parse_key(text):
    text = text.strip().lower()
    if len(text) == 1:
        return keyboard.KeyCode.from_char(text)
    try:
        return keyboard.Key[text]  # z.B. space, shift, ctrl, up, enter
    except KeyError:
        raise ValueError(f"Unbekannte Taste: {text}")


class App:
    def __init__(self, root):
        self.root = root
        self.active = False
        self.key = None
        root.title("Key Holder")
        root.resizable(False, False)
        root.attributes("-topmost", True)

        tk.Label(root, text="Taste (z.B. w, space, shift):").pack(padx=12, pady=(12, 2))
        self.entry = tk.Entry(root, justify="center", width=16)
        self.entry.insert(0, "w")
        self.entry.pack(padx=12)

        self.btn = tk.Button(root, text="Start (F8)", width=18, command=self.toggle)
        self.btn.pack(padx=12, pady=8)
        self.status = tk.Label(root, text="Inaktiv", fg="gray")
        self.status.pack(pady=(0, 12))

        keyboard.Listener(on_press=self.on_hotkey, daemon=True).start()
        root.protocol("WM_DELETE_WINDOW", self.quit)

    def on_hotkey(self, key):
        if key == TOGGLE_HOTKEY:
            self.root.after(0, self.toggle)

    def toggle(self):
        self.stop() if self.active else self.start()

    def start(self):
        try:
            self.key = parse_key(self.entry.get())
        except ValueError as e:
            self.status.config(text=str(e), fg="red")
            return
        self.active = True
        self.btn.config(text="Stop (F8)")
        self.status.config(text=f"Hält '{self.entry.get()}' gedrückt", fg="green")
        threading.Thread(target=self.hold_loop, daemon=True).start()

    def hold_loop(self):
        key = self.key
        while self.active:
            ctrl.press(key)
            time.sleep(REPEAT_INTERVAL)
        ctrl.release(key)

    def stop(self):
        self.active = False
        self.btn.config(text="Start (F8)")
        self.status.config(text="Inaktiv", fg="gray")

    def quit(self):
        self.active = False
        time.sleep(REPEAT_INTERVAL * 2)
        self.root.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
