// Key Holder – hält eine Taste dauerhaft gedrückt, solange aktiv.
// Start/Stop: Button oder F8 (global).
// Build: x86_64-w64-mingw32-gcc -O2 -mwindows key_holder.c -o KeyHolder.exe
#include <windows.h>
#include <string.h>
#include <ctype.h>

#define ID_EDIT 1
#define ID_BTN 2
#define ID_HOTKEY 3
#define ID_TIMER 4
#define REPEAT_MS 30

static HWND hEdit, hBtn, hStatus;
static WORD vk;
static BOOL active;

static const struct { const char *name; WORD vk; } NAMES[] = {
    {"space", VK_SPACE}, {"shift", VK_LSHIFT}, {"ctrl", VK_LCONTROL}, {"alt", VK_LMENU},
    {"enter", VK_RETURN}, {"tab", VK_TAB}, {"esc", VK_ESCAPE}, {"up", VK_UP},
    {"down", VK_DOWN}, {"left", VK_LEFT}, {"right", VK_RIGHT},
    {"lmb", VK_LBUTTON}, {"rmb", VK_RBUTTON},
};

static WORD parse_key(char *s) {
    for (char *p = s; *p; p++) *p = (char)tolower((unsigned char)*p);
    if (strlen(s) == 1) { SHORT r = VkKeyScanA(s[0]); return r == -1 ? 0 : LOBYTE(r); }
    if (s[0] == 'f' && s[1]) { int n = atoi(s + 1); if (n >= 1 && n <= 24) return (WORD)(VK_F1 + n - 1); }
    for (size_t i = 0; i < sizeof NAMES / sizeof *NAMES; i++)
        if (!strcmp(s, NAMES[i].name)) return NAMES[i].vk;
    return 0;
}

static void send_key(BOOL up) {
    INPUT in = {0};
    if (vk == VK_LBUTTON || vk == VK_RBUTTON) {
        in.type = INPUT_MOUSE;
        in.mi.dwFlags = vk == VK_LBUTTON ? (up ? MOUSEEVENTF_LEFTUP : MOUSEEVENTF_LEFTDOWN)
                                         : (up ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_RIGHTDOWN);
        if (up || !(GetAsyncKeyState(vk) & 0x8000)) SendInput(1, &in, sizeof in);
        return;
    }
    in.type = INPUT_KEYBOARD;
    in.ki.wScan = (WORD)MapVirtualKeyA(vk, MAPVK_VK_TO_VSC);
    in.ki.dwFlags = KEYEVENTF_SCANCODE | (up ? KEYEVENTF_KEYUP : 0);
    if (vk == VK_UP || vk == VK_DOWN || vk == VK_LEFT || vk == VK_RIGHT)
        in.ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
    SendInput(1, &in, sizeof in);
}

static void stop(HWND w) {
    if (!active) return;
    active = FALSE;
    KillTimer(w, ID_TIMER);
    send_key(TRUE);
    SetWindowTextA(hBtn, "Start (F8)");
    SetWindowTextA(hStatus, "Inaktiv");
}

static void start(HWND w) {
    char buf[32];
    GetWindowTextA(hEdit, buf, sizeof buf);
    if (!(vk = parse_key(buf))) { SetWindowTextA(hStatus, "Unbekannte Taste"); return; }
    active = TRUE;
    send_key(FALSE);
    SetTimer(w, ID_TIMER, REPEAT_MS, NULL);
    SetWindowTextA(hBtn, "Stop (F8)");
    SetWindowTextA(hStatus, "AKTIV - Taste gedrueckt");
}

static LRESULT CALLBACK WndProc(HWND w, UINT m, WPARAM wp, LPARAM lp) {
    switch (m) {
    case WM_CREATE: {
        HFONT f = (HFONT)GetStockObject(DEFAULT_GUI_FONT);
        HWND l = CreateWindowA("STATIC", "Taste (w, space, shift, f1, lmb...):", WS_CHILD | WS_VISIBLE | SS_CENTER, 10, 10, 220, 18, w, 0, 0, 0);
        hEdit = CreateWindowA("EDIT", "w", WS_CHILD | WS_VISIBLE | WS_BORDER | ES_CENTER, 70, 32, 100, 22, w, (HMENU)ID_EDIT, 0, 0);
        hBtn = CreateWindowA("BUTTON", "Start (F8)", WS_CHILD | WS_VISIBLE, 60, 62, 120, 28, w, (HMENU)ID_BTN, 0, 0);
        hStatus = CreateWindowA("STATIC", "Inaktiv", WS_CHILD | WS_VISIBLE | SS_CENTER, 10, 98, 220, 18, w, 0, 0, 0);
        HWND all[] = {l, hEdit, hBtn, hStatus};
        for (int i = 0; i < 4; i++) SendMessageA(all[i], WM_SETFONT, (WPARAM)f, TRUE);
        RegisterHotKey(w, ID_HOTKEY, MOD_NOREPEAT, VK_F8);
        return 0;
    }
    case WM_COMMAND:
        if (LOWORD(wp) == ID_BTN) active ? stop(w) : start(w);
        return 0;
    case WM_HOTKEY:
        active ? stop(w) : start(w);
        return 0;
    case WM_TIMER:
        if (active) send_key(FALSE);
        return 0;
    case WM_DESTROY:
        stop(w);
        UnregisterHotKey(w, ID_HOTKEY);
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcA(w, m, wp, lp);
}

int WINAPI WinMain(HINSTANCE hi, HINSTANCE prev, LPSTR cmd, int show) {
    WNDCLASSA wc = {0};
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hi;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_BTNFACE + 1);
    wc.lpszClassName = "KeyHolder";
    RegisterClassA(&wc);
    RECT r = {0, 0, 240, 126};
    DWORD style = WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX;
    AdjustWindowRect(&r, style, FALSE);
    CreateWindowExA(WS_EX_TOPMOST, "KeyHolder", "Key Holder", style | WS_VISIBLE,
                    CW_USEDEFAULT, CW_USEDEFAULT, r.right - r.left, r.bottom - r.top, 0, 0, hi, 0);
    MSG msg;
    while (GetMessageA(&msg, 0, 0, 0) > 0) {
        if (!IsDialogMessageA(GetActiveWindow(), &msg)) { TranslateMessage(&msg); DispatchMessageA(&msg); }
    }
    return 0;
}
