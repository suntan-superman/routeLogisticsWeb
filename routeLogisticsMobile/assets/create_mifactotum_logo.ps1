# ==============================
# Create mi Factotum Logo (PNG)
# ==============================

# Explicitly load System.Drawing (needed in some PowerShell versions)
Add-Type -AssemblyName System.Drawing

# Output path
$outputPath = "C:\Users\$env:USERNAME\Desktop\routeLogistics_logo.png"

# Image settings
$width = 1024
$height = 1024
$bgColor = [System.Drawing.Color]::FromArgb(0,153,76)  # Green
$text = "Route Logistics"
$fontName = "Segoe UI"
$fontSize = 96

# Create bitmap
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = "AntiAlias"
$graphics.Clear($bgColor)

# Font and brush
$fontStyle = [System.Drawing.FontStyle]::Bold
$font = New-Object System.Drawing.Font($fontName, $fontSize, $fontStyle)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

# Center text
$textSize = $graphics.MeasureString($text, $font)
$x = ($width - $textSize.Width) / 2
$y = ($height - $textSize.Height) / 2

# Draw and save
$graphics.DrawString($text, $font, $brush, $x, $y)
$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$graphics.Dispose()
$bitmap.Dispose()
$font.Dispose()
$brush.Dispose()

Write-Host "✅ Route Logistics logo created at: $outputPath"
