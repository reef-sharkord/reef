Add-Type -AssemblyName System.Drawing

function New-UncordIcon {
  param([int]$Size, [string]$Path, [switch]$Round)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  # Shape (rounded square, or circle for round launcher icon)
  $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
  if ($Round) {
    $shape.AddEllipse(0, 0, $Size, $Size)
  } else {
    $r = [int]($Size * 0.22)
    $d = $r * 2
    $shape.AddArc(0, 0, $d, $d, 180, 90)
    $shape.AddArc($Size - $d, 0, $d, $d, 270, 90)
    $shape.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
    $shape.AddArc(0, $Size - $d, $d, $d, 90, 90)
    $shape.CloseFigure()
  }

  # Indigo -> violet diagonal gradient
  $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
  $c1 = [System.Drawing.Color]::FromArgb(255, 99, 102, 241)   # #6366F1
  $c2 = [System.Drawing.Color]::FromArgb(255, 139, 92, 246)   # #8B5CF6
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45.0)
  $g.FillPath($brush, $shape)

  # White "U"
  $font = New-Object System.Drawing.Font("Segoe UI", [single]($Size * 0.5), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textRect = New-Object System.Drawing.RectangleF(0, [single]($Size * -0.02), $Size, $Size)
  $g.DrawString("U", $font, [System.Drawing.Brushes]::White, $textRect, $sf)

  $g.Dispose()

  if ([System.IO.Path]::GetExtension($Path) -ieq ".ico") {
    $hicon = $bmp.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hicon)
    $fs = [System.IO.File]::Create($Path)
    $icon.Save($fs)
    $fs.Close()
    $icon.Dispose()
  } else {
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  $bmp.Dispose()
  Write-Output ("wrote " + $Path)
}

$repo = "C:\Users\btblu\Documents\Uncord\sharkord-development\sharkord-development"

# Desktop app icon (electron-builder makes the .ico from this)
New-UncordIcon -Size 1024 -Path "$repo\desktop\build\icon.png"

# Client PWA / favicon / desktop tray source
New-UncordIcon -Size 512 -Path "$repo\apps\client\public\icon-512.png"
New-UncordIcon -Size 192 -Path "$repo\apps\client\public\icon-192.png"
New-UncordIcon -Size 48  -Path "$repo\apps\client\public\favicon.ico"

# Android launcher icons (square + round) per density
$densities = @{ "mdpi" = 48; "hdpi" = 72; "xhdpi" = 96; "xxhdpi" = 144; "xxxhdpi" = 192 }
$resRoot = "$repo\mobile\android\app\src\main\res"
foreach ($d in $densities.Keys) {
  $dir = Join-Path $resRoot ("mipmap-" + $d)
  if (Test-Path $dir) {
    New-UncordIcon -Size $densities[$d] -Path (Join-Path $dir "ic_launcher.png")
    New-UncordIcon -Size $densities[$d] -Path (Join-Path $dir "ic_launcher_round.png") -Round
  }
}
Write-Output "DONE"
