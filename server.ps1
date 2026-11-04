$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

$port = 8765
$prefix = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host "서버를 열지 못했습니다. $port 포트를 이미 쓰고 있을 수 있습니다."
  Write-Host $_.Exception.Message
  exit 1
}

Write-Host "해양대 GIF 생성기  $prefix"
Write-Host "이 창을 닫으면 페이지가 멈춥니다."
Start-Process $prefix

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".gif"  = "image/gif"
  ".svg"  = "image/svg+xml"
  ".ttf"  = "font/ttf"
  ".wasm" = "application/wasm"
  ".ico"  = "image/x-icon"
  ".map"  = "application/json"
  ".mp4"  = "video/mp4"
  ".webm" = "video/webm"
}

$rootFull = [System.IO.Path]::GetFullPath($root)

while ($listener.IsListening) {
  $context = $null
  try {
    $context = $listener.GetContext()
    $reqPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)
    if ([string]::IsNullOrWhiteSpace($reqPath) -or $reqPath -eq "/") { $reqPath = "/index.html" }

    $rel = $reqPath.TrimStart("/") -replace "/", [System.IO.Path]::DirectorySeparatorChar
    $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))

    $response = $context.Response
    $response.Headers.Add("Cache-Control", "no-cache")

    if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
      $response.StatusCode = 404
      $missing = [System.Text.Encoding]::UTF8.GetBytes("404")
      $response.ContentType = "text/plain; charset=utf-8"
      $response.ContentLength64 = $missing.Length
      $response.OutputStream.Write($missing, 0, $missing.Length)
      $response.Close()
      continue
    }

    $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
    $type = $mime[$ext]
    if (-not $type) { $type = "application/octet-stream" }
    $bytes = [System.IO.File]::ReadAllBytes($full)
    $response.StatusCode = 200
    $response.ContentType = $type
    $response.ContentLength64 = $bytes.LongLength
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
  } catch {
    if ($context) {
      try { $context.Response.Abort() } catch {}
    }
  }
}
