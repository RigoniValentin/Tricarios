param(
  [string]$TricariosBaseUrl = $(if ($env:TRICARIOS_BASE_URL) { $env:TRICARIOS_BASE_URL } else { "https://tricariosgrowshop.com" }),
  [string]$RgBaseUrl = $env:RG_API_BASE_URL,
  [string]$ApiKey = $env:RG_API_KEY,
  [int]$TimeoutSec = 15,
  [switch]$Pull
)

$ErrorActionPreference = "Stop"

function Normalize-BaseUrl([string]$Url) {
  if ([string]::IsNullOrWhiteSpace($Url)) { return $null }
  return $Url.Trim().TrimEnd("/")
}

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail([string]$Message) {
  Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Get-ResponseBody($ErrorRecord) {
  try {
    $response = $ErrorRecord.Exception.Response
    if ($null -eq $response) { return $null }

    $stream = $response.GetResponseStream()
    if ($null -eq $stream) { return $null }

    $reader = New-Object System.IO.StreamReader($stream)
    return $reader.ReadToEnd()
  } catch {
    return $null
  }
}

function Invoke-Check {
  param(
    [string]$Name,
    [string]$Method = "GET",
    [string]$Url,
    [hashtable]$Headers = @{},
    [scriptblock]$Summary
  )

  try {
    $result = Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -TimeoutSec $TimeoutSec
    Write-Ok $Name
    if ($Summary) {
      & $Summary $result
    } else {
      $result | ConvertTo-Json -Depth 6
    }
    return $true
  } catch {
    Write-Fail $Name
    Write-Host "URL: $Url"
    Write-Host "Detalle: $($_.Exception.Message)"
    $body = Get-ResponseBody $_
    if ($body) { Write-Host "Respuesta: $body" }
    return $false
  }
}

$TricariosBaseUrl = Normalize-BaseUrl $TricariosBaseUrl
$RgBaseUrl = Normalize-BaseUrl $RgBaseUrl

Write-Host "Diagnostico integracion Rio Gestion <-> Tricarios" -ForegroundColor White
Write-Host "TricariosBaseUrl: $TricariosBaseUrl"
Write-Host "RgBaseUrl:       $(if ($RgBaseUrl) { $RgBaseUrl } else { '<no configurado>' })"
Write-Host "ApiKey:          $(if ($ApiKey) { 'configurada' } else { '<no configurada>' })"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  Write-Warn "No hay RG_API_KEY. Se omiten endpoints protegidos. Definila solo en esta terminal con: `$env:RG_API_KEY = '...'"
  exit 2
}

$headers = @{ "x-api-key" = $ApiKey }

Write-Step "TricariosBack"
Invoke-Check `
  -Name "Status modulo RG" `
  -Url "$TricariosBaseUrl/api/v1/external/rg/status" `
  -Headers $headers `
  -Summary {
    param($r)
    Write-Host "enabled:          $($r.config.enabled)"
    Write-Host "hasBaseUrl:       $($r.config.hasBaseUrl)"
    Write-Host "hasApiKey:        $($r.config.hasApiKey)"
    Write-Host "hasWebhookSecret: $($r.config.hasWebhookSecret)"
    Write-Host "timeoutMs:        $($r.timeoutMs)"
    if ($r.lastInbound) { Write-Host "lastInbound:      $($r.lastInbound.eventType) / $($r.lastInbound.status) / $($r.lastInbound.createdAt)" }
    if ($r.lastOutbound) { Write-Host "lastOutbound:     $($r.lastOutbound.eventType) / $($r.lastOutbound.status) / HTTP $($r.lastOutbound.httpStatus) / $($r.lastOutbound.createdAt)" }
  } | Out-Null

Invoke-Check `
  -Name "Ultimos logs RG en TricariosBack" `
  -Url "$TricariosBaseUrl/api/v1/external/rg/logs?limit=5" `
  -Headers $headers `
  -Summary {
    param($r)
    Write-Host "count: $($r.count)"
    foreach ($log in $r.logs) {
      Write-Host "- $($log.createdAt) $($log.direction) $($log.eventType) $($log.status) HTTP $($log.httpStatus) $($log.errorMessage)"
    }
  } | Out-Null

if ($Pull) {
  Invoke-Check `
    -Name "Pull manual catalogo desde Rio Gestion" `
    -Method "POST" `
    -Url "$TricariosBaseUrl/api/v1/external/rg/pull" `
    -Headers $headers `
    -Summary {
      param($r)
      $r | ConvertTo-Json -Depth 6
    } | Out-Null
}

Write-Step "Rio Gestion por Cloudflare Tunnel"
if ([string]::IsNullOrWhiteSpace($RgBaseUrl)) {
  Write-Warn "RG_API_BASE_URL no esta configurada. No se puede chequear el tunel."
} else {
  Invoke-Check `
    -Name "Health externo Rio Gestion" `
    -Url "$RgBaseUrl/api/external/health" `
    -Headers $headers `
    -Summary {
      param($r)
      Write-Host "status:    $($r.status)"
      Write-Host "auth:      $($r.auth)"
      Write-Host "timestamp: $($r.timestamp)"
    } | Out-Null

  Invoke-Check `
    -Name "Catalogo VENTA_WEB disponible" `
    -Url "$RgBaseUrl/api/external/sync-stock" `
    -Headers $headers `
    -Summary {
      param($r)
      Write-Host "count: $($r.count)"
      if ($r.count -eq 0) {
        Write-Warn "Rio Gestion respondio, pero no devolvio productos VENTA_WEB."
      }
    } | Out-Null
}

Write-Host ""
Write-Host "Diagnostico terminado." -ForegroundColor White