const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const os = require("os");
const path = require("path");

const execFileAsync = promisify(execFile);

/**
 * Pull calendars + events from classic Outlook desktop via COM.
 * Same date window as Mac Calendar sync: past 30 days → next 60 days.
 */
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  $outlook = New-Object -ComObject Outlook.Application
} catch {
  Write-Output (@{ ok = $false; error = 'Outlook desktop is not installed (or COM is unavailable). Install classic Outlook, or use Import .ics.' } | ConvertTo-Json -Compress)
  exit 0
}

try {
  $ns = $outlook.GetNamespace('MAPI')
} catch {
  Write-Output (@{ ok = $false; error = 'Could not open Outlook mail data. Sign in to Outlook, then try Sync again.' } | ConvertTo-Json -Compress)
  exit 0
}

$startRange = (Get-Date).AddDays(-30)
$endRange = (Get-Date).AddDays(60)
$calendars = New-Object System.Collections.Generic.List[object]
$events = New-Object System.Collections.Generic.List[object]
$seenFolder = @{}

function Add-CalFolder($folder, $label) {
  if (-not $folder) { return }
  try {
    $eid = [string]$folder.EntryID
  } catch { return }
  if (-not $eid -or $seenFolder.ContainsKey($eid)) { return }
  $seenFolder[$eid] = $true
  $name = $label
  try { if ($folder.Name) { $name = [string]$folder.Name } } catch {}
  if ($label -and $label -ne $name) { $name = "$label · $name" }
  $calendars.Add(@{ id = $eid; name = $name; color = '#0078D4' }) | Out-Null

  try {
    $items = $folder.Items
    $items.Sort('[Start]')
    $items.IncludeRecurrences = $true
  } catch { return }

  $count = 0
  try { $count = [int]$items.Count } catch { $count = 0 }
  # Cap per folder so a huge archive cannot hang the sync.
  $max = [Math]::Min($count, 2500)
  for ($i = 1; $i -le $max; $i++) {
    try {
      $it = $items.Item($i)
    } catch { continue }
    try {
      $class = [int]$it.Class
      if ($class -ne 26) { continue } # olAppointment = 26
    } catch { continue }

    $start = $null
    $end = $null
    try { $start = [datetime]$it.Start } catch { continue }
    try { $end = [datetime]$it.End } catch { $end = $start }
    if ($start -lt $startRange -or $start -gt $endRange) { continue }

    $id = $null
    # EntryID is unique per occurrence when IncludeRecurrences is on.
    # GlobalAppointmentID is the same for every instance of a series.
    try { $id = [string]$it.EntryID } catch {}
    if (-not $id) { try { $id = [string]$it.GlobalAppointmentID } catch {} }
    if (-not $id) { $id = "$eid-$i-$($start.ToString('o'))" }
    elseif ($start) {
      # Guard against duplicate EntryIDs across weird stores.
      $id = "$id|$($start.ToString('yyyyMMddHHmmss'))"
    }

    $title = 'Untitled'
    try { if ($it.Subject) { $title = [string]$it.Subject } } catch {}
    $location = ''
    try { if ($it.Location) { $location = [string]$it.Location } } catch {}
    $notes = ''
    try { if ($it.Body) { $notes = [string]$it.Body } } catch {}
    $allDay = $false
    try { $allDay = [bool]$it.AllDayEvent } catch { $allDay = $false }
    # Outlook often puts Teams join URLs in Body / Location — keep them for Envision.

    $events.Add(@{
      id = $id
      title = $title
      start = $start.ToUniversalTime().ToString('o')
      end = $end.ToUniversalTime().ToString('o')
      calendarId = $eid
      location = $location
      notes = $notes
      allDay = $allDay
    }) | Out-Null
  }
}

try {
  $defaultCal = $ns.GetDefaultFolder(9) # olFolderCalendar
  Add-CalFolder $defaultCal 'Outlook'
} catch {}

try {
  foreach ($store in $ns.Stores) {
    try {
      $storeCal = $store.GetDefaultFolder(9)
      $label = $null
      try { $label = [string]$store.DisplayName } catch { $label = 'Outlook' }
      Add-CalFolder $storeCal $label
    } catch {}
  }
} catch {}

Write-Output (@{ ok = $true; calendars = $calendars; events = $events } | ConvertTo-Json -Depth 6 -Compress)
`;

async function syncWindowsOutlookCalendars() {
  if (process.platform !== "win32") {
    return { ok: false, error: "Outlook calendar sync is only available on Windows." };
  }

  const scriptPath = path.join(os.tmpdir(), `envision-mail-outlook-cal-${process.pid}.ps1`);
  try {
    fs.writeFileSync(scriptPath, PS_SCRIPT, "utf8");
    const { stdout, stderr } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      {
        timeout: 120_000,
        maxBuffer: 20 * 1024 * 1024,
        encoding: "utf8",
        windowsHide: true,
      },
    );

    const raw = String(stdout || "").trim();
    if (!raw) {
      const err = String(stderr || "").trim();
      return {
        ok: false,
        error: err || "Outlook returned no calendar data. Open Outlook once, then try Sync again.",
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: "Could not read Outlook's calendar response. Is classic Outlook installed and signed in?",
      };
    }

    if (!parsed || parsed.ok === false) {
      return { ok: false, error: parsed?.error || "Outlook calendar sync failed." };
    }

    return {
      ok: true,
      calendars: Array.isArray(parsed.calendars)
        ? parsed.calendars
        : parsed.calendars
          ? [parsed.calendars]
          : [],
      events: Array.isArray(parsed.events) ? parsed.events : parsed.events ? [parsed.events] : [],
      provider: "outlook",
    };
  } catch (err) {
    const message = err?.stderr || err?.message || String(err);
    return {
      ok: false,
      error: `Outlook calendar sync failed: ${String(message).slice(0, 400)}`,
    };
  } finally {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
  }
}

module.exports = { syncWindowsOutlookCalendars };
