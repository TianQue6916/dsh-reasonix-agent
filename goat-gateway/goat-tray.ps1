<#
  goat-tray.ps1 — GOAT 额度桌面小组件（鲸鱼娘版）
  ------------------------------------------------------------------
  * 自绘圆角卡片（whalegirl-widget.cs）：鲸鱼头像 + 每账号一行迷你进度条（5h / 本周 / 本月）
  * 数据只读 %TEMP%\goat-usage-cache.json（网关看门狗每 ~4 分钟预热），缓存过期才后台刷新
  * 百分比着色：<70% 绿 / 70-90% 橙 / >=90% 红
  * 左键拖动，位置记住；托盘图标双击显示/隐藏；右键菜单（刷新/隐藏/退出）

  用法：
    wscript start-goat-tray.vbs                     # 隐藏宿主启动（推荐）
    powershell -File goat-tray.ps1                  # 调试（有控制台）
    powershell -File goat-tray.ps1 -Snapshot x.png  # 自检：渲染成图片后退出
#>
[CmdletBinding()]
param(
  [int]$RefreshSeconds = 60,
  [bool]$AlwaysOnTop = $true,
  [string]$Snapshot = '',
  [int]$SnapDelay = 0
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$scriptRoot  = Split-Path -Parent $MyInvocation.MyCommand.Path
$usageScript = Join-Path $scriptRoot 'goat-usage.ps1'
$cacheFile   = Join-Path $env:TEMP 'goat-usage-cache.json'
$posFile     = Join-Path $env:LOCALAPPDATA 'goat-tray-pos.json'
$whaleFile   = Join-Path $scriptRoot 'assets\whalegirl.png'
$icoFile     = Join-Path $scriptRoot 'assets\whale.ico'
$cardColor   = [System.Drawing.Color]::FromArgb(26, 27, 33)

Add-Type -Path (Join-Path $scriptRoot 'whalegirl-widget.cs') -ReferencedAssemblies 'System.Drawing','System.Windows.Forms'

function Read-Cache {
  if (-not (Test-Path $cacheFile)) { return $null }
  try { return (Get-Content $cacheFile -Raw | ConvertFrom-Json) } catch { return $null }
}

function Start-BackgroundRefresh {
  try {
    Start-Process -FilePath 'powershell' -WindowStyle Hidden -ArgumentList @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $usageScript, '-Brief', '-Force'
    ) | Out-Null
  } catch {}
}

if (-not $Snapshot) {
  $script:mtx = New-Object System.Threading.Mutex($false, 'Local\GoatQuotaTray')
  if (-not $script:mtx.WaitOne(0, $false)) { exit 0 }   # 单实例：重复双击不再开第二个
}

# ---------- 窗体 ----------
$form = New-Object LayeredForm
$form.Text = '鲸鱼娘'
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.TopMost = $AlwaysOnTop
$form.BackColor = [System.Drawing.Color]::Magenta
$form.ShowInTaskbar = $false
$form.Width = 400
$form.Height = 228

$widget = New-Object WhalegirlWidget
$widget.Host = $form
$form.Renderer = $widget

$actorDir = Join-Path $scriptRoot 'assets\pets'
foreach ($a in @(
    @{ f = 'deepseek-small.png'; w = 82; h = 118; label = 'DeepSeek' },
    @{ f = 'chatgpt-small.png';  w = 60; h = 118; label = 'ChatGPT' },
    @{ f = 'gemini-small.png';   w = 69; h = 118; label = 'Gemini' }
  )) {
  $fp = Join-Path $actorDir $a.f
  if (Test-Path $fp) {
    try { $widget.AddActor([System.Drawing.Bitmap]::FromFile($fp), $a.w, $a.h, $a.label) } catch {}
  }
}

function Set-RoundRegion {
  try {
    $r = 18
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $w = $form.Width; $h = $form.Height; $d = $r * 2
    $p.AddArc(0, 0, $d, $d, 180, 90)
    $p.AddArc($w - $d - 1, 0, $d, $d, 270, 90)
    $p.AddArc($w - $d - 1, $h - $d - 1, $d, $d, 0, 90)
    $p.AddArc(0, $h - $d - 1, $d, $d, 90, 90)
    $p.CloseFigure()
    $form.Region = New-Object System.Drawing.Region($p)
  } catch {}
}

$tip = New-Object System.Windows.Forms.ToolTip
$tip.AutoPopDelay = 30000
$tip.InitialDelay = 150

# ---------- 数据 → 控件 ----------
function Update-Ui {
  $cache = Read-Cache
  if (-not $cache) {
    $widget.SetData(@(), '刷新中…')
    Start-BackgroundRefresh
    return
  }
  if (((Get-Date) - [datetime]$cache.ts).TotalSeconds -gt 240) { Start-BackgroundRefresh }

  $list = New-Object 'System.Collections.Generic.List[WhalegirlWidget+Row]'
  $details = @()
  foreach ($r in @($cache.rows)) {
    $row = New-Object WhalegirlWidget+Row
    $row.Name = [string]$r.name
    if ($r.error) {
      $row.Error = $true
      $row.Detail = "[$($r.name)] 查询失败: $($r.error)"
    } elseif ($r.kind -eq 'official') {
      # 官方 key 是余额不是套餐窗口：没有 5h/周/月 百分比，硬算只会得到 0
      $row.Detail = "[$($r.name)] 余额 $($r.currency) $([math]::Round($r.available,2))"
    } else {
      $row.FiveHour = if ($r.fiveHourCap -gt 0) { [int][math]::Round(100 * $r.fiveHourUsed / $r.fiveHourCap) } else { 0 }
      $row.Weekly   = if ($r.weeklyCap  -gt 0) { [int][math]::Round(100 * $r.weeklyUsed  / $r.weeklyCap)  } else { 0 }
      $row.Monthly  = if ($r.monthCap   -gt 0) { [int][math]::Round(100 * $r.monthUsed   / $r.monthCap)   } else { 0 }
      $row.Detail = "[$($r.name)] 5h {0:N2}/{1} · 周 {2:N2}/{3} · 月 {4:N2}/{5:N2}（剩 {6:N2}）" -f `
        $r.fiveHourUsed, $r.fiveHourCap, $r.weeklyUsed, $r.weeklyCap, $r.monthUsed, $r.monthCap, $r.monthLeft
    }
    $details += $row.Detail
    [void]$list.Add($row)
  }
  $widget.SetData($list, ([datetime]$cache.ts).ToString('HH:mm'))
  try {
    $rb = New-Object System.Drawing.Bitmap($form.Width, $form.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $rg = [System.Drawing.Graphics]::FromImage($rb)
    $rg.Clear([System.Drawing.Color]::FromArgb(32, 34, 40))
    $widget.RenderTo($rg, $form.Width, $form.Height)
    $rg.Dispose()
    $rb.Save((Join-Path (Join-Path $scriptRoot 'logs') 'tray-render2.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $rb.Dispose()
  } catch {}
  $tip.SetToolTip($widget, ($details -join "`n"))
}

# ---------- 托盘 ----------
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miRefresh = $menu.Items.Add('立即刷新')
$miTop = $menu.Items.Add('取消置顶')
$miSize = $menu.Items.Add('大小：大')
$miHome = $menu.Items.Add('回到右下角')
$miExit = $menu.Items.Add('退出')

$ni = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path $icoFile) { try { $ni.Icon = New-Object System.Drawing.Icon($icoFile) } catch { $ni.Icon = [System.Drawing.SystemIcons]::Information } } else { $ni.Icon = [System.Drawing.SystemIcons]::Information }
$ni.Text = 'GOAT 额度'
$ni.Visible = $true
$ni.ContextMenuStrip = $menu

# ---------- 位置 ----------
$pos = $null
if (Test-Path $posFile) { try { $pos = Get-Content $posFile -Raw | ConvertFrom-Json } catch {} }
$placed = $false
if ($pos) {
  try {
    # 位置合法性校验：窗口至少要有 60x60 落在某个屏幕工作区内，否则视为失效（防屏幕外/分辨率变化后失踪）
    $rect = New-Object System.Drawing.Rectangle([int]$pos.x, [int]$pos.y, $form.Width, $form.Height)
    foreach ($scr in [System.Windows.Forms.Screen]::AllScreens) {
      $inter = [System.Drawing.Rectangle]::Intersect($rect, $scr.Bounds)
      if (($inter.Width * $inter.Height) -ge (0.7 * $form.Width * $form.Height)) { $placed = $true; break }
    }
    if ($placed) { $form.Location = New-Object System.Drawing.Point([int]$pos.x, [int]$pos.y) }
  } catch { $placed = $false }
}
if (-not $placed) {
  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $form.Location = New-Object System.Drawing.Point(($wa.Right - $form.Width - 20), ($wa.Bottom - $form.Height - 60))
}

function Save-Position {
  try {
    [IO.File]::WriteAllText($posFile, (@{ x = $form.Left; y = $form.Top } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
  } catch {}
}

# ---------- 拖动 ----------
$script:dragging = $false
foreach ($c in @($form)) {
  $c.Add_MouseDown({
      param($s, $e)
      if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { $script:dragging = $true; $script:dragFrom = [System.Windows.Forms.Cursor]::Position }
    })
  $c.Add_MouseMove({
      param($s, $e)
      if ($script:dragging) {
        $cur = [System.Windows.Forms.Cursor]::Position
        $form.Location = New-Object System.Drawing.Point(($form.Left + ($cur.X - $script:dragFrom.X)), ($form.Top + ($cur.Y - $script:dragFrom.Y)))
        $script:dragFrom = $cur
        $s = [System.Windows.Forms.Screen]::FromPoint($cur); if ($s) { $b = $s.Bounds; $nx = [Math]::Min([Math]::Max($form.Left, $b.Left - $form.Width + 60), $b.Right - 60); $ny = [Math]::Min([Math]::Max($form.Top, $b.Top), $b.Bottom - 40); if ($nx -ne $form.Left -or $ny -ne $form.Top) { $form.Location = New-Object System.Drawing.Point($nx, $ny) } }
        $form.Redraw()   # 拖动跟手
      }
    })
  $c.Add_MouseUp({ param($s, $e) $script:dragging = $false; Save-Position })
}

# ---------- 菜单/托盘行为 ----------
$miRefresh.Add_Click({ Start-BackgroundRefresh; Start-Sleep -Milliseconds 600; Update-Ui })
$miTop.Add_Click({
    $form.TopMost = -not $form.TopMost
    $miTop.Text = if ($form.TopMost) { '取消置顶' } else { '窗口置顶' }
  })
$miHome.Add_Click({
    $wa = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $form.Location = New-Object System.Drawing.Point(($wa.Right - $form.Width - 20), ($wa.Bottom - $form.Height - 60))
    $form.Redraw(); Save-Position
  })
$miExit.Add_Click({ $form.Close() })
$script:sizes = @(400, 340, 280)
$script:sizeIdx = 0
$miSize.Add_Click({
    $script:sizeIdx = ($script:sizeIdx + 1) % 3
    $s = $script:sizes[$script:sizeIdx]
    $form.Size = New-Object System.Drawing.Size($s, [int]($s * 228 / 400))
    Save-Position
    $miSize.Text = @('大小：大', '大小：中', '大小：小')[$script:sizeIdx]
  })
$form.Add_MouseClick({ param($s, $e) if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { $widget.Pulse() } })
$form.Add_MouseDoubleClick({ param($s, $e) if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Start-BackgroundRefresh; Start-Sleep -Milliseconds 800; Update-Ui; $widget.Pulse() } })
$ni.Add_DoubleClick({ $form.Visible = -not $form.Visible })

$form.Add_FormClosing({
    Save-Position
    $ni.Visible = $false
    $ni.Dispose()
  })

# ---------- 定时器 ----------
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = [math]::Max(15, $RefreshSeconds) * 1000
$timer.Add_Tick({ Update-Ui })

if ($Snapshot) {
  $form.BackColor = [System.Drawing.Color]::FromArgb(24, 25, 31)
  $widget.BackColor = $form.BackColor
}

$form.Add_Shown({
    try {
      $logDir = Join-Path $scriptRoot 'logs'
      New-Item -ItemType Directory -Force -Path $logDir | Out-Null
      $info = "启动: {0} 位置={1},{2} 尺寸={3}x{4} Visible={5} TopMost={6} TransparencyKey={7} 控件BackColor={8} 角色数={9}" -f `
        (Get-Date -Format 'HH:mm:ss'), $form.Left, $form.Top, $form.Width, $form.Height, $form.Visible, $form.TopMost,
        0, $widget.BackColor.ToArgb(), $form.Controls.Count
      [IO.File]::AppendAllText((Join-Path $logDir 'tray.log'), $info + "`r`n")
      [IO.File]::AppendAllText((Join-Path $logDir 'tray.log'), ("绑定: Renderer为空=" + ($form.Renderer -eq $null) + " Host为空=" + ($widget.Host -eq $null) + "`r`n"))
      $form.Redraw()
      [IO.File]::AppendAllText((Join-Path $logDir 'tray.log'), ("主动Redraw后`r`n"))
      $bmp = New-Object System.Drawing.Bitmap($form.Width, $form.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $gr = [System.Drawing.Graphics]::FromImage($bmp)
      $gr.Clear([System.Drawing.Color]::FromArgb(32, 34, 40))
      $widget.RenderTo($gr, $form.Width, $form.Height)
      $gr.Dispose()
      $bmp.Save((Join-Path $logDir 'tray-render.png'), [System.Drawing.Imaging.ImageFormat]::Png)
      $bmp.Dispose()
    } catch {
      try { [IO.File]::AppendAllText((Join-Path $scriptRoot 'logs\tray.log'), "诊断异常: $($_.Exception.Message)`r`n") } catch {}
    }
    Update-Ui
    if ($Snapshot) {
      $form.Refresh()
      [System.Windows.Forms.Application]::DoEvents()
      Start-Sleep -Milliseconds $(if ($SnapDelay -gt 0) { $SnapDelay } else { 700 })
      [System.Windows.Forms.Application]::DoEvents()
      $bmp = New-Object System.Drawing.Bitmap($form.Width, $form.Height)
      $widget.DrawToBitmap($bmp, (New-Object System.Drawing.Rectangle(0, 0, $form.Width, $form.Height)))
      $bmp.Save($Snapshot, [System.Drawing.Imaging.ImageFormat]::Png)
      $bmp.Dispose()
      $ni.Visible = $false
      $form.Close()
      return
    }
    $timer.Start()
  })

[System.Windows.Forms.Application]::Run($form)
