param(
  [ValidateSet('ensure','read','reset')]
  [string]$Mode = 'ensure'
)

$ErrorActionPreference = 'Stop'
$DataDir = Join-Path $PSScriptRoot 'data'
$CredFile = Join-Path $DataDir 'm88-login.xml'
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

if ($Mode -eq 'reset') {
  if (Test-Path $CredFile) { Remove-Item -Force $CredFile }
  Write-Host 'Saved M88 login removed from this Windows user.'
  exit 0
}

if ($Mode -eq 'ensure' -and -not (Test-Path $CredFile)) {
  Write-Host ''
  Write-Host 'First-time M88 login setup'
  Write-Host 'Credentials stay on this PC and are encrypted by Windows for this Windows user.'
  $UserName = Read-Host 'M88 username'
  $Password = Read-Host 'M88 password' -AsSecureString
  $Credential = New-Object System.Management.Automation.PSCredential($UserName, $Password)
  $Credential | Export-Clixml -Path $CredFile
  Write-Host 'Encrypted M88 login saved locally.'
}

if ($Mode -eq 'read') {
  if (-not (Test-Path $CredFile)) { exit 2 }
  $Credential = Import-Clixml -Path $CredFile
  $Plain = $Credential.GetNetworkCredential().Password
  $Payload = [pscustomobject]@{ username = $Credential.UserName; password = $Plain } | ConvertTo-Json -Compress
  [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Payload))
}
