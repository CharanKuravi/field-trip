# Firebase Service Account Setup Script
Write-Host "Firebase Service Account Setup" -ForegroundColor Cyan
Write-Host ""

# Check if file exists in Downloads
$downloadsPath = "$env:USERPROFILE\Downloads"
$serviceAccountFile = Get-ChildItem -Path $downloadsPath -Filter "*trail-b0f43*adminsdk*.json" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($serviceAccountFile) {
    Write-Host "Found service account file: $($serviceAccountFile.Name)" -ForegroundColor Green
    
    # Read and minify JSON
    Write-Host "Reading JSON file..." -ForegroundColor Yellow
    $json = Get-Content $serviceAccountFile.FullName -Raw
    $minified = $json -replace "`n","" -replace "`r","" -replace "\s+"," "
    
    # Update .env.local
    $envFile = "apps\api\.env.local"
    Write-Host "Updating $envFile..." -ForegroundColor Yellow
    
    $envContent = Get-Content $envFile -Raw
    $envContent = $envContent -replace "FIREBASE_SERVICE_ACCOUNT=.*","FIREBASE_SERVICE_ACCOUNT=$minified"
    $envContent | Set-Content $envFile -NoNewline
    
    Write-Host "Configuration updated!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Stop the API server (Ctrl+C)" -ForegroundColor White
    Write-Host "2. Restart: cd apps\api && npm run dev" -ForegroundColor White
    Write-Host "3. Open http://localhost:3000 and login" -ForegroundColor White
    
} else {
    Write-Host "No service account file found in Downloads folder" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please follow these steps:" -ForegroundColor Yellow
    Write-Host "1. Open Firebase Console" -ForegroundColor White
    Write-Host "2. Click Generate new private key" -ForegroundColor White
    Write-Host "3. Download the file" -ForegroundColor White
    Write-Host "4. Run this script again" -ForegroundColor White
    Write-Host ""
    
    Start-Process "https://console.firebase.google.com/project/trail-b0f43/settings/serviceaccounts/adminsdk"
    Write-Host "Browser opened! Generate the key and run this script again." -ForegroundColor Green
}
