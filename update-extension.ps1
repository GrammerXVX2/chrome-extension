<#!
.SYNOPSIS
  Обновление локально установленного unpacked Chrome расширения Auto Swagger Token Refresher.
.DESCRIPTION
  Скачивает свежий код из GitHub, сравнивает версии manifest.json и при наличии новой версии делает резервную копию
  текущей папки, затем копирует новые файлы поверх. Подходит для режима Developer (Load unpacked).
.PARAMETER TargetPath
  Явный путь к корню расширения (где лежит manifest.json). Если не указан — выполняется поиск.
.PARAMETER Silent
  Минимальный вывод (только результат / ошибки).
.NOTES
  Требует PowerShell 5.1+. Для создания .exe можно использовать модуль PS2EXE.
#>
param(
    [string]$TargetPath,
    [switch]$Silent
)

$RepoOwner = 'GrammerXVX2'
$RepoName  = 'chrome-extension'
$Branch    = 'main'
$RawManifestUrl = "https://raw.githubusercontent.com/$RepoOwner/$RepoName/$Branch/manifest.json"
$ZipUrl        = "https://github.com/$RepoOwner/$RepoName/archive/refs/heads/$Branch.zip"
$ExtensionNameExpected = 'Auto Swagger Token Refresher'

function Write-Info($msg) { if (-not $Silent) { Write-Host "[INFO] $msg" -ForegroundColor Cyan } }
function Write-Ok($msg)   { if (-not $Silent) { Write-Host "[OK]   $msg" -ForegroundColor Green } }
function Write-Warn($msg) { if (-not $Silent) { Write-Host "[WARN] $msg" -ForegroundColor Yellow } }
function Write-Err($msg)  { Write-Host "[ERR]  $msg" -ForegroundColor Red }

function Find-ExtensionFolder {
    param([string]$Hint)
    if ($Hint) {
        if (Test-Path $Hint) {
            $mf = Join-Path $Hint 'manifest.json'
            if (Test-Path $mf) {
                try {
                    $json = Get-Content $mf -Raw | ConvertFrom-Json
                    if ($json.name -eq $ExtensionNameExpected) { return (Get-Item $Hint).FullName }
                } catch { }
            }
        }
        Write-Warn "Переданный TargetPath не подходит: $Hint"
    }
    Write-Info 'Поиск расширения...'
    $candidates = @(
        "$env:USERPROFILE\Desktop",
        "$env:USERPROFILE\Desktop\Workish",
        "$env:USERPROFILE\Documents",
        "$env:USERPROFILE\Downloads"
    ) | Where-Object { Test-Path $_ }

    foreach ($base in $candidates) {
        try {
            Get-ChildItem -Path $base -Directory -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
                $mf = Join-Path $_.FullName 'manifest.json'
                if (Test-Path $mf) {
                    try {
                        $json = Get-Content $mf -Raw | ConvertFrom-Json
                        if ($json.name -eq $ExtensionNameExpected) { return $_.FullName }
                    } catch { }
                }
            }
        } catch { }
    }
    return $null
}

function Compare-Versions($local, $remote) {
    # Простое строковое сравнение: если разные и remote не пуст — считаем обновлением.
    if (-not $remote) { return $false }
    return ($local -ne $remote)
}

$folder = Find-ExtensionFolder -Hint $TargetPath
if (-not $folder) { Write-Err 'Не найдено расширение (manifest.json с ожидаемым name). Укажите -TargetPath вручную.'; exit 1 }
Write-Ok "Найдена папка: $folder"

$localManifestPath = Join-Path $folder 'manifest.json'
if (-not (Test-Path $localManifestPath)) { Write-Err 'manifest.json не найден в целевой папке.'; exit 1 }

try { $localVersion = (Get-Content $localManifestPath -Raw | ConvertFrom-Json).version } catch { Write-Err 'Не удалось прочитать локальный manifest.json'; exit 1 }
Write-Info "Локальная версия: $localVersion"

try { $remoteContent = (Invoke-WebRequest -Uri $RawManifestUrl -UseBasicParsing -ErrorAction Stop).Content } catch { Write-Err 'Не удалось скачать удалённый manifest.json'; exit 1 }
try { $remoteVersion = (ConvertFrom-Json $remoteContent).version } catch { Write-Err 'Ошибка разбора удалённого manifest.json'; exit 1 }
Write-Info "Удалённая версия: $remoteVersion"

if (-not (Compare-Versions $localVersion $remoteVersion)) {
    Write-Ok "У вас актуальная версия ($localVersion). Обновление не требуется."; exit 0
}
Write-Info "Доступно обновление → $remoteVersion"

$tempDir = Join-Path $env:TEMP "ext_update_$([Guid]::NewGuid().ToString('N'))"
$null = New-Item -ItemType Directory -Path $tempDir -Force
$zipPath = Join-Path $tempDir 'repo.zip'

Write-Info 'Скачивание архива...'
try { Invoke-WebRequest -Uri $ZipUrl -OutFile $zipPath -UseBasicParsing -ErrorAction Stop } catch { Write-Err 'Скачивание ZIP не удалось'; exit 1 }

Write-Info 'Распаковка...'
try { Expand-Archive -Path $zipPath -DestinationPath $tempDir -Force } catch { Write-Err 'Не удалось распаковать ZIP'; exit 1 }

$extractedRoot = Join-Path $tempDir "$RepoName-$Branch"
if (-not (Test-Path $extractedRoot)) { Write-Err 'Не найдена распакованная корневая папка'; exit 1 }

$backupDir = Join-Path $env:TEMP "$RepoName-backup-$(Get-Date -Format yyyyMMddHHmmss)"
Write-Info "Резервное копирование в $backupDir"
try { Copy-Item -Path $folder -Destination $backupDir -Recurse -Force } catch { Write-Warn 'Не удалось создать резервную копию (продолжаем)'}

Write-Info 'Копирование новых файлов...'
# Исключения (можно расширить): update-extension.ps1, .git* и .github
$exclude = @('update-extension.ps1', '.git', '.gitignore', '.gitattributes', '.github')
Get-ChildItem -Path $extractedRoot -Force | ForEach-Object {
    if ($exclude -contains $_.Name) { return }
    $dest = Join-Path $folder $_.Name
    try {
        if ($_.PSIsContainer) {
            if (Test-Path $dest) { Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue }
            Copy-Item $_.FullName -Destination $dest -Recurse -Force
        } else {
            Copy-Item $_.FullName -Destination $dest -Force
        }
    } catch {
        Write-Warn "Не удалось скопировать: $($_.Name)"
    }
}

Write-Ok "Обновление завершено. Новая версия: $remoteVersion"
Write-Info 'Откройте страницу chrome://extensions и нажмите Reload для папки расширения.'
Write-Info "Папка: $folder"

# Авто-открытие проводника для удобства (не обязательно)
try { Start-Process explorer.exe $folder } catch { }

exit 0
