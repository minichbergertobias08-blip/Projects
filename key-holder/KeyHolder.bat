<# : batch
@echo off
powershell -NoProfile -Command "iex (Get-Content -LiteralPath '%~f0' -Raw)"
exit /b
: #>
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class K {
  [StructLayout(LayoutKind.Sequential)] struct KI { public ushort vk, scan; public uint flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MI { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit, Size=40)] struct IN { [FieldOffset(0)] public uint type; [FieldOffset(8)] public KI ki; [FieldOffset(8)] public MI mi; }
  [DllImport("user32.dll")] static extern uint SendInput(uint n, IN[] i, int size);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint c, uint t);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] public static extern short VkKeyScan(char c);
  public static void Send(int vk, bool up) {
    var i = new IN[1];
    if (vk == 1 || vk == 2) {
      if (!up && (GetAsyncKeyState(vk) & 0x8000) != 0) return;
      i[0].type = 0;
      i[0].mi.flags = vk == 1 ? (up ? 4u : 2u) : (up ? 16u : 8u);
    } else {
      i[0].type = 1;
      i[0].ki.scan = (ushort)MapVirtualKey((uint)vk, 0);
      i[0].ki.flags = 8u | (up ? 2u : 0u) | (vk >= 0x25 && vk <= 0x28 ? 1u : 0u);
    }
    SendInput(1, i, 40);
  }
}
"@
$names = @{space=0x20; shift=0xA0; ctrl=0xA2; alt=0xA4; enter=0x0D; tab=0x09; left=0x25; up=0x26; right=0x27; down=0x28; lmb=1; rmb=2}
$k = (Read-Host "Taste (w, space, shift, ctrl, f1, lmb...) [w]").Trim().ToLower()
if (!$k) { $k = "w" }
if ($names.ContainsKey($k)) { $vk = $names[$k] }
elseif ($k -match '^f(\d+)$') { $vk = 0x6F + [int]$matches[1] }
elseif ($k.Length -eq 1) { $vk = [K]::VkKeyScan($k[0]) -band 0xFF }
else { Write-Host "Unbekannte Taste"; pause; exit }
Write-Host "F8 = Start/Stop. Zum Beenden Fenster schliessen."
$on = $false; $prev = $false
try {
  while ($true) {
    $f8 = ([K]::GetAsyncKeyState(0x77) -band 0x8000) -ne 0
    if ($f8 -and -not $prev) {
      $on = -not $on
      if ($on) { Write-Host "AKTIV - '$k' gedrueckt" -ForegroundColor Green }
      else { [K]::Send($vk, $true); Write-Host "Inaktiv" -ForegroundColor Gray }
    }
    $prev = $f8
    if ($on) { [K]::Send($vk, $false) }
    Start-Sleep -Milliseconds 30
  }
} finally { [K]::Send($vk, $true) }
