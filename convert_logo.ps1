$bytes = [System.IO.File]::ReadAllBytes('d:\Personal\workspace\SolarQuatationRunningbyGAS\Sena_Solar_Logo.png')
$base64 = [Convert]::ToBase64String($bytes)
Write-Host "Length: $($base64.Length)"
[System.IO.File]::WriteAllText('d:\Personal\workspace\SolarQuatationRunningbyGAS\logo_base64.txt', $base64)
Write-Host "Done"
