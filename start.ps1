$ErrorActionPreference = 'Stop'
$flightRoot = $PSScriptRoot
$flightUrl = 'http://localhost:8748'
$flightRunning = $false
try {
    $response = Invoke-WebRequest -Uri $flightUrl -TimeoutSec 2 -UseBasicParsing
    $flightRunning = $response.Content -match '747 Flight Lab'
} catch { }
if (-not $flightRunning) {
    $flightNode = (Get-Command node.exe -ErrorAction Stop).Source
    $flightServer = Join-Path $flightRoot 'server.mjs'
    Start-Process -FilePath $flightNode -ArgumentList ('"{0}"' -f $flightServer) -WorkingDirectory $flightRoot -WindowStyle Hidden
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 200
        try { $response = Invoke-WebRequest -Uri $flightUrl -TimeoutSec 1 -UseBasicParsing; if ($response.Content -match '747 Flight Lab') { $flightRunning = $true; break } } catch { }
    }
}
if (-not $flightRunning) { throw 'The simulator could not start. Check whether port 8748 is already in use.' }
Start-Process $flightUrl
