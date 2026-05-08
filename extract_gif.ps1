Add-Type -AssemblyName System.Drawing
$gif = [System.Drawing.Image]::FromFile('d:\Personal\workspace\SolarQuatationRunningbyGAS\WR13I2.gif')
Write-Host "Width: $($gif.Width) Height: $($gif.Height)"
$dim = New-Object System.Drawing.Imaging.FrameDimension($gif.FrameDimensionsList[0])
$frameCount = $gif.GetFrameCount($dim)
Write-Host "Frame count: $frameCount"
$gif.SelectActiveFrame($dim, 0)
$gif.Save('d:\Personal\workspace\SolarQuatationRunningbyGAS\WR13I2_frame0.png', [System.Drawing.Imaging.ImageFormat]::Png)
if ($frameCount -gt 5) {
    $mid = [math]::Floor($frameCount / 2)
    $gif.SelectActiveFrame($dim, $mid)
    $gif.Save('d:\Personal\workspace\SolarQuatationRunningbyGAS\WR13I2_frame_mid.png', [System.Drawing.Imaging.ImageFormat]::Png)
}
$gif.Dispose()
Write-Host "Done"
