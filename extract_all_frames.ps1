Add-Type -AssemblyName System.Drawing
$gif = [System.Drawing.Image]::FromFile('d:\Personal\workspace\SolarQuatationRunningbyGAS\WR13I2.gif')
$dim = New-Object System.Drawing.Imaging.FrameDimension($gif.FrameDimensionsList[0])
$frameCount = $gif.GetFrameCount($dim)
Write-Host "Total frames: $frameCount"
for ($i = 0; $i -lt $frameCount; $i++) {
    $gif.SelectActiveFrame($dim, $i)
    $path = "d:\Personal\workspace\SolarQuatationRunningbyGAS\WR13I2_frame$i.png"
    $gif.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Saved frame $i"
}
$gif.Dispose()
