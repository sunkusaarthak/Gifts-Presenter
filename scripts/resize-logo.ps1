Add-Type -AssemblyName System.Drawing
$srcPath = Join-Path $PSScriptRoot "..\public\logo.png"
$destPath = Join-Path $PSScriptRoot "..\public\logo.png"
$tempPath = Join-Path $PSScriptRoot "..\public\logo_512.png"

$src = [System.Drawing.Bitmap]::FromFile($srcPath)
$targetSize = 512
$dest = New-Object System.Drawing.Bitmap($targetSize, $targetSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($dest)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.DrawImage($src, 0, 0, $targetSize, $targetSize)

$dest.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)

$src.Dispose()
$dest.Dispose()
$graphics.Dispose()

# Replace original logo.png with 512x512 version
Move-Item -Path $tempPath -Destination $destPath -Force
Write-Host "Successfully resized public/logo.png to 512x512."
