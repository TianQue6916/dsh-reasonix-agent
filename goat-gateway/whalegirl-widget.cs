// whalegirl-widget.cs — AI 三人组额度挂件（透明背景 + 白色气泡 + 三个帧动画角色）
// 素材：AwesomeHou/openpet-ai-girls 的 spritesheet（deepseek / chatgpt / gemini），已由 Pillow 预缩放并硬化 alpha
// 由 goat-tray.ps1 通过 Add-Type -Path 加载（需 -ReferencedAssemblies）。文件需 UTF-8 with BOM。
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class WhalegirlWidget : Control
{
    public sealed class Row
    {
        public string Name = "";
        public int FiveHour;
        public int Weekly;
        public int Monthly;
        public bool Error;
        public string Detail = "";
    }

    private sealed class Seg
    {
        public string Text = "";
        public Color Color;
        public bool Bold;
    }

    private sealed class Actor
    {
        public Bitmap Image;
        public int FrameW;
        public int FrameH;
        public int Frames;
        public string Label = "";
    }

    private readonly List<Row> _rows = new List<Row>();
    private readonly List<Actor> _actors = new List<Actor>();
    private string _updated = "--:--";
    private readonly Timer _tick;
    private int _frame;
    private float _phase;
    private float _bounce;
    private double[] _shown = new double[0];
    private double[] _target = new double[0];
    private bool _haveTargets;

    public Color BubbleFill = Color.FromArgb(250, 251, 255);
    public Color BubbleInk = Color.FromArgb(44, 60, 102);
    public Color BubbleDim = Color.FromArgb(104, 120, 158);
    public Color LabelInk = Color.FromArgb(226, 234, 246);
    public Color LabelShadow = Color.FromArgb(120, 12, 20, 38);

    public WhalegirlWidget()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint
               | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw
               | ControlStyles.SupportsTransparentBackColor, true);
        _tick = new Timer();
        _tick.Interval = 130;
        _tick.Tick += delegate
        {
            _frame++;
            _phase += 0.26f;
            if (_phase > 1000f) _phase -= 1000f;
            _bounce *= 0.72f;
            for (int i = 0; i < _shown.Length; i++) _shown[i] += (_target[i] - _shown[i]) * 0.28;
            if (Host != null) Host.Redraw(); else Invalidate();
        };
        _tick.Start();
    }

    public void AddActor(Bitmap img, int frameW, int frameH, string label)
    {
        if (img == null || frameW <= 0 || frameH <= 0) return;
        int frames = Math.Max(1, img.Width / frameW);
        _actors.Add(new Actor { Image = img, FrameW = frameW, FrameH = frameH, Frames = frames, Label = label ?? "" });
        Invalidate();
    }

    public void Pulse() { _bounce = 1f; Invalidate(); }

    public void SetData(IEnumerable<Row> rows, string updated)
    {
        _rows.Clear();
        if (rows != null) { foreach (var r in rows) _rows.Add(r); }
        _updated = updated ?? "--:--";
        var t = new List<double>();
        foreach (var r in _rows)
        {
            if (r.Error) { t.Add(0); t.Add(0); t.Add(0); continue; }
            t.Add(r.FiveHour); t.Add(r.Weekly); t.Add(r.Monthly);
        }
        _target = t.ToArray();
        if (!_haveTargets || _shown.Length != _target.Length)
        {
            _shown = (double[])_target.Clone();
            _haveTargets = true;
        }
        Invalidate();
    }

    private static GraphicsPath RoundRect(Rectangle r, int radius)
    {
        var p = new GraphicsPath();
        int d = radius * 2;
        if (r.Width <= 0 || r.Height <= 0) { p.AddRectangle(r); return p; }
        if (d > r.Width) d = r.Width;
        if (d > r.Height) d = r.Height;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    private static Color LevelInk(int pct)
    {
        if (pct >= 90) return Color.FromArgb(196, 52, 52);
        if (pct >= 70) return Color.FromArgb(198, 126, 26);
        return Color.FromArgb(34, 138, 92);
    }

    private static float Measure(Graphics g, List<Seg> segs, Font fReg, Font fBold)
    {
        float w = 0;
        foreach (var s in segs) w += g.MeasureString(s.Text, s.Bold ? fBold : fReg).Width;
        return w;
    }

    private static void DrawSegs(Graphics g, List<Seg> segs, Font fReg, Font fBold, float centerX, float y)
    {
        float w = Measure(g, segs, fReg, fBold);
        float x = centerX - w / 2f;
        foreach (var s in segs)
        {
            var f = s.Bold ? fBold : fReg;
            using (var br = new SolidBrush(s.Color)) g.DrawString(s.Text, f, br, x, y);
            x += g.MeasureString(s.Text, f).Width;
        }
    }

    public LayeredForm Host;

    protected override void OnPaint(PaintEventArgs e) { RenderTo(e.Graphics, Width, Height); }

    public void RenderTo(Graphics g, int w, int h)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        // ---------- 白色气泡 ----------
        int bw = (int)(w * 0.74f);
        int bh = 54;
        int bx = (w - bw) / 2;
        int by = 2;
        using (var bp = RoundRect(new Rectangle(bx, by, bw, bh), 13))
        {
            using (var wb = new SolidBrush(BubbleFill)) g.FillPath(wb, bp);
            using (var pen = new Pen(Color.FromArgb(70, 92, 140), 1.5f)) g.DrawPath(pen, bp);
        }
        using (var tail = new GraphicsPath())
        {
            int tx = bx + (int)(bw * 0.42f);
            tail.AddPolygon(new Point[] {
                new Point(tx, by + bh - 2),
                new Point(tx + 16, by + bh - 2),
                new Point(tx + 5, by + bh + 12)
            });
            using (var wb = new SolidBrush(BubbleFill)) g.FillPath(wb, tail);
            using (var pen = new Pen(Color.FromArgb(70, 92, 140), 1.5f)) g.DrawPath(pen, tail);
            using (var cover = new SolidBrush(BubbleFill)) g.FillRectangle(cover, tx + 2, by + bh - 4, 12, 4);
        }

        // ---------- 气泡文字 ----------
        float centerX = bx + bw / 2f;
        float lineH = 15f;
        float textTop = by + 6f;
        string[] tips = { "5h ", "周 ", "月 " };
        using (var fReg = new Font("Microsoft YaHei UI", 8f))
        using (var fBold = new Font("Microsoft YaHei UI", 8f, FontStyle.Bold))
        using (var fSmall = new Font("Microsoft YaHei UI", 6.5f))
        {
            for (int r = 0; r < 2; r++)
            {
                var segs = new List<Seg>();
                if (r < _rows.Count)
                {
                    var row = _rows[r];
                    segs.Add(new Seg { Text = row.Name + " ", Color = BubbleInk, Bold = true });
                    if (row.Error) segs.Add(new Seg { Text = "查询失败", Color = LevelInk(95) });
                    else
                    {
                        for (int i = 0; i < 3; i++)
                        {
                            if (i > 0) segs.Add(new Seg { Text = " · ", Color = BubbleDim });
                            int v = (int)Math.Round(_shown[r * 3 + i]);
                            segs.Add(new Seg { Text = tips[i], Color = BubbleDim });
                            segs.Add(new Seg { Text = v + "%", Color = LevelInk(v), Bold = true });
                        }
                    }
                }
                else segs.Add(new Seg { Text = r == 0 ? "正在读取额度…" : "", Color = BubbleDim });
                DrawSegs(g, segs, fReg, fBold, centerX, textTop + r * lineH);
            }
            float w3 = g.MeasureString("更新 " + _updated, fSmall).Width;
            using (var br = new SolidBrush(BubbleDim))
                g.DrawString("更新 " + _updated, fSmall, br, centerX - w3 / 2f, textTop + 2 * lineH - 1f);
        }

        // ---------- 三个角色（素材已按目标尺寸预缩放，这里 1:1 绘制避免插值彩边）----------
        int n = Math.Max(1, _actors.Count);
        float slotW = (float)w / n;
        float baseY = by + bh + 22f;
        using (var fLabel = new Font("Microsoft YaHei UI", 7f))
        using (var fLabelB = new Font("Microsoft YaHei UI", 7f, FontStyle.Bold))
        {
            for (int i = 0; i < _actors.Count; i++)
            {
                var a = _actors[i];
                int fi = (a.Frames > 1) ? (_frame % a.Frames) : 0;
                var src = new Rectangle(fi * a.FrameW, 0, a.FrameW, a.FrameH);

                float cxs = slotW * i + slotW / 2f;
                float bobY = (float)Math.Sin(_phase + i * 1.1f) * 2f;
                float scale = 1f + 0.05f * _bounce;
                float dw = a.FrameW * scale, dh = a.FrameH * scale;
                var dst = new RectangleF(cxs - dw / 2f, baseY + bobY - (dh - a.FrameH), dw, dh);
                g.DrawImage(a.Image, dst, src, GraphicsUnit.Pixel);

                if (!string.IsNullOrEmpty(a.Label))
                {
                    float lw = g.MeasureString(a.Label, fLabelB).Width;
                    float lx = cxs - lw / 2f;
                    using (var sb = new SolidBrush(LabelShadow))
                        g.DrawString(a.Label, fLabelB, sb, lx + 1f, baseY + a.FrameH + 5f);
                    using (var br = new SolidBrush(LabelInk))
                        g.DrawString(a.Label, fLabelB, br, lx, baseY + a.FrameH + 4f);
                }
            }
        }
    }
}
/// <summary>逐像素透明的无边框窗体（WS_EX_LAYERED + UpdateLayeredWindow）。</summary>
public class LayeredForm : Form
{
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] private struct SIZE { public int cx, cy; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }

    [DllImport("user32.dll")] private static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr hdc, IntPtr h);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr h);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize,
        IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);

    private const int ULW_ALPHA = 2;
    private const byte AC_SRC_OVER = 0, AC_SRC_ALPHA = 1;

    private static int _logCount;
    private static void Log(string m)
    {
        if (_logCount++ > 40) return;
        try
        {
            string dir = @"D:\Toolbox\goat-gateway\logs";
            System.IO.Directory.CreateDirectory(dir);
            System.IO.File.AppendAllText(System.IO.Path.Combine(dir, "layered.log"),
                DateTime.Now.ToString("HH:mm:ss.fff") + " " + m + Environment.NewLine);
        }
        catch { }
    }

    public WhalegirlWidget Renderer;
    private Bitmap _buf;

    public LayeredForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        SetStyle(ControlStyles.Opaque, true);
    }

    protected override CreateParams CreateParams
    {
        get { var cp = base.CreateParams; cp.ExStyle |= 0x00080000; return cp; }
    }

    protected override void OnPaintBackground(PaintEventArgs e) { }
    protected override void OnPaint(PaintEventArgs e) { Redraw(); }

    public void Redraw()
    {
        if (Renderer == null || Width <= 0 || Height <= 0) return;
        if (_buf == null || _buf.Width != Width || _buf.Height != Height)
        {
            if (_buf != null) _buf.Dispose();
            _buf = new Bitmap(Width, Height, PixelFormat.Format32bppPArgb);
        }
        Log("Redraw " + Width + "x" + Height + " renderer=" + (Renderer != null));
        using (var g = Graphics.FromImage(_buf))
        {
            g.Clear(Color.Transparent);
            Renderer.RenderTo(g, Width, Height);
        }
        Apply(_buf);
    }

    private void Apply(Bitmap bmp)
    {
        IntPtr screenDc = GetDC(IntPtr.Zero);
        IntPtr memDc = CreateCompatibleDC(screenDc);
        IntPtr hBmp = IntPtr.Zero, oldBmp = IntPtr.Zero;
        try
        {
            hBmp = bmp.GetHbitmap(Color.FromArgb(0));
            oldBmp = SelectObject(memDc, hBmp);
            var size = new SIZE { cx = bmp.Width, cy = bmp.Height };
            var src = new POINT { X = 0, Y = 0 };
            var dst = new POINT { X = Left, Y = Top };
            var blend = new BLENDFUNCTION { BlendOp = AC_SRC_OVER, BlendFlags = 0, SourceConstantAlpha = 255, AlphaFormat = AC_SRC_ALPHA };
            bool ok = UpdateLayeredWindow(Handle, screenDc, ref dst, ref size, memDc, ref src, 0, ref blend, ULW_ALPHA);
            Log(string.Format("Apply ok={0} err={1} size={2}x{3} pos={4},{5} hwnd={6}", ok, Marshal.GetLastWin32Error(), bmp.Width, bmp.Height, Left, Top, Handle));
        }
        catch { }
        finally
        {
            if (oldBmp != IntPtr.Zero) SelectObject(memDc, oldBmp);
            if (hBmp != IntPtr.Zero) DeleteObject(hBmp);
            DeleteDC(memDc);
            ReleaseDC(IntPtr.Zero, screenDc);
        }
    }
}