param(
    [string]$RepoUrl = "https://github.com/GrammerXVX2/chrome-extension.git",
    [string]$ExtensionPath = "C:\Users\artem\Desktop\Workish\Расширения для моего удобства\chrome-extension",
    [string]$WorkDir = "$PSScriptRoot\repo"
)

Write-Host "== Auto update Swagger Token extension =="

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "git не найден в PATH. Установи Git и повтори." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $WorkDir)) {
    Write-Host "Клон репозитория не найден, делаю git clone..."
    git clone $RepoUrl $WorkDir
} else {
    Write-Host "Обновляю репозиторий (git pull)..."
    Push-Location $WorkDir
    git pull
    Pop-Location
}

# читаем manifest'ы
$remoteManifestPath  = Join-Path $WorkDir "manifest.json"
$localManifestPath   = Join-Path $ExtensionPath "manifest.json"

if (-not (Test-Path $remoteManifestPath) -or -not (Test-Path $localManifestPath)) {
    Write-Host "manifest.json не найден (локально или в репо)." -ForegroundColor Red
    exit 1
}

$remoteManifest = Get-Content $remoteManifestPath -Raw | ConvertFrom-Json
$localManifest  = Get-Content $localManifestPath  -Raw | ConvertFrom-Json

$remoteVer = $remoteManifest.version
$localVer  = $localManifest.version

Write-Host "Локальная версия: $localVer"
Write-Host "Удалённая версия: $remoteVer"

if ([version]$remoteVer -le [version]$localVer) {
    Write-Host "Новая версия не найдена. Обновление не требуется."
    exit 0
}

$answer = Read-Host "Найдена новая версия. Обновить файлы в `$ExtensionPath ? (Y/N)"
if ($answer -notin @("Y","y","Д","д")) {
    Write-Host "Отменено пользователем."
    exit 0
}

# Бэкап
$backupRoot = Join-Path $PSScriptRoot "backups"
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $backupRoot "chrome-extension-$localVer-$timestamp"
Write-Host "Создаю бэкап в $backupDir ..."
Copy-Item -Path $ExtensionPath -Destination $backupDir -Recurse

# Копируем файлы из репо в папку расширения (кроме .git и backup/скрипта)
Write-Host "Копирую новые файлы в $ExtensionPath ..."
$exclude = @(".git", "backups")
Get-ChildItem $WorkDir -Recurse | Where-Object {
    $rel = $_.FullName.Substring($WorkDir.Length)
    -not ($rel -match '\\\.git(\\|$)') -and
    -not ($rel -match '\\backups(\\|$)')
} | ForEach-Object {
    $target = $_.FullName.Replace($WorkDir, $ExtensionPath)
    if ($_.PSIsContainer) {
        New-Item -ItemType Directory -Force -Path $target | Out-Null
    } else {
        Copy-Item $_.FullName -Destination $target -Force
    }
}

Write-Host "Готово. В chrome://extensions нажми 'Обновить' для перезагрузки расширения." -ForegroundColor Green