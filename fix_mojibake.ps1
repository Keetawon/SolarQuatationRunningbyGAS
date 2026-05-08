$path = 'd:\Personal\workspace\SolarQuatationRunningbyGAS\Index.html'
# Read the file as UTF-8 (it currently contains UTF-8 bytes of the mojibake characters)
$brokenText = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# Convert the broken text back to bytes using Windows-1252
# This maps 'à' (0xE0 in 1252) back to 0xE0, which is the first byte of Thai 'ร' in UTF-8.
try {
    $correctBytes = [System.Text.Encoding]::GetEncoding(1252).GetBytes($brokenText)
    
    # Save the bytes as a clean UTF-8 file (without BOM)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllBytes($path, $correctBytes)
    Write-Host "Encoding fix applied successfully."
} catch {
    Write-Error "Failed to apply encoding fix: $_"
}
