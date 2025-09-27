# Alte Datei löschen
Remove-Item "complete-dead-finder.ps1" -Force -ErrorAction SilentlyContinue

# Neue Version ohne Sonderzeichen
@'
# Dead Code Finder - ohne Emojis
Write-Host "Suche nach ungenutzten JavaScript-Dateien..." -ForegroundColor Yellow

$allJsFiles = Get-ChildItem -Path . -Recurse -Filter "*.js" | 
    Where-Object { $_.FullName -notlike "*node_modules*" }

$searchFiles = Get-ChildItem -Path . -Recurse -Include "*.js", "*.ts", "*.html", "*.json" | 
    Where-Object { $_.FullName -notlike "*node_modules*" }

Write-Host "JavaScript-Dateien: $($allJsFiles.Count)" -ForegroundColor Green
Write-Host "Durchsuchbare Dateien: $($searchFiles.Count)" -ForegroundColor Green
Write-Host ""

$deadFiles = @()
$activeFiles = @()

foreach ($jsFile in $allJsFiles) {
    $fileName = $jsFile.BaseName
    $fullFileName = $jsFile.Name
    $relativePath = $jsFile.FullName -replace [regex]::Escape($PWD.Path), "."
    
    Write-Host "Analysiere: $fullFileName" -ForegroundColor Cyan
    
    $isUsed = $false
    $foundIn = @()
    
    if ($fileName -in @("server", "index", "main", "app")) {
        $isUsed = $true
        $foundIn += "Entry Point"
        Write-Host "  [ENTRY] Entry Point erkannt" -ForegroundColor Green
    }
    
    if (-not $isUsed) {
        foreach ($searchFile in $searchFiles) {
            if ($searchFile.FullName -eq $jsFile.FullName) { continue }
            
            try {
                $content = Get-Content $searchFile.FullName -Raw -ErrorAction SilentlyContinue
                
                if ($content -and ($content -match [regex]::Escape($fileName))) {
                    $isUsed = $true
                    $foundIn += $searchFile.Name
                    Write-Host "  [USED] Referenziert in: $($searchFile.Name)" -ForegroundColor Green
                    break
                }
            }
            catch { continue }
        }
    }
    
    $fileInfo = [PSCustomObject]@{
        Name = $fullFileName
        Path = $relativePath
        Size = [math]::Round($jsFile.Length / 1KB, 1)
        LastModified = $jsFile.LastWriteTime.ToString("yyyy-MM-dd")
        IsUsed = $isUsed
        FoundIn = $foundIn -join "; "
    }
    
    if ($isUsed) {
        $activeFiles += $fileInfo
    } else {
        $deadFiles += $fileInfo
        Write-Host "  [DEAD] KEINE REFERENZ GEFUNDEN!" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== ERGEBNIS ===" -ForegroundColor Yellow
Write-Host "Gesamt analysiert: $($allJsFiles.Count) Dateien" -ForegroundColor White
Write-Host "Aktive Dateien: $($activeFiles.Count)" -ForegroundColor Green
Write-Host "Ungenutzte Dateien: $($deadFiles.Count)" -ForegroundColor Red

if ($deadFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "UNGENUTZTE DATEIEN:" -ForegroundColor Red
    Write-Host "-------------------" -ForegroundColor Red
    
    $deadFiles | Format-Table -Property Name, Size, LastModified, Path -AutoSize
    
    $totalSize = ($deadFiles | Measure-Object -Property Size -Sum).Sum
    Write-Host "Potenzielle Einsparung: $totalSize KB" -ForegroundColor Cyan
    
    Write-Host ""
    Write-Host "BACKUP & LOESCHKOMMANDOS:" -ForegroundColor Yellow
    Write-Host "------------------------" -ForegroundColor Yellow
    Write-Host "New-Item -ItemType Directory -Name 'backup_unused' -Force" -ForegroundColor White
    
    foreach ($file in $deadFiles) {
        Write-Host "Copy-Item '$($file.Path)' 'backup_unused/' -Force" -ForegroundColor White
    }
    
    Write-Host ""
    Write-Host "LOESCHEN NACH BACKUP:" -ForegroundColor Red
    Write-Host "--------------------" -ForegroundColor Red
    foreach ($file in $deadFiles) {
        Write-Host "Remove-Item '$($file.Path)' -Force" -ForegroundColor White
    }
} else {
    Write-Host ""
    Write-Host "PERFEKT! Keine ungenutzten Dateien gefunden!" -ForegroundColor Green
}

if ($activeFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "AKTIVE DATEIEN (Beispiele):" -ForegroundColor Green
    Write-Host "---------------------------" -ForegroundColor Green
    
    $activeFiles | Select-Object -First 5 | ForEach-Object {
        Write-Host "  $($_.Name) ($($_.Size) KB) <- $($_.FoundIn)" -ForegroundColor Green
    }
    
    if ($activeFiles.Count -gt 5) {
        Write-Host "  ... und $($activeFiles.Count - 5) weitere aktive Dateien" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "WICHTIG: Pruefe die Ergebnisse manuell bevor du Dateien loeschst!" -ForegroundColor Yellow
'@ | Out-File -Encoding ASCII -FilePath "simple-finder.ps1"