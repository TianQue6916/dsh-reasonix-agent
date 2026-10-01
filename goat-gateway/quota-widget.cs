// quota-widget.cs — 鲸鱼娘 · GOAT 额度小组件（自绘：圆角卡片 + 鲸鱼立绘 + 内嵌标签进度胶囊）
// 由 goat-tray.ps1 通过 Add-Type -Path 加载。文件需 UTF-8 with BOM（含中文字面量）。
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Windows.Forms;

public class QuotaWidget : Control
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

    private readonly List<Row> _rows = new List<Row>();
    private string _updated = "--:--";
    private Bitmap _whale;

    public Color CardBack = Color.FromArgb(24, 25, 31);
    public Color CardEdge = Color.FromArgb(40, 255, 255, 255);
    public Color BarBack = Color.FromArgb(20, 255, 255, 255);
    public Color TextMain = Color.FromArgb(238, 240, 246);
    public Color TextDim = Color.FromArgb(148, 152, 166);

    private static readonly Color[] NameColors = {
        Color.FromArgb(122, 202, 255),
        Color.FromArgb(190, 152, 255),
        Color.FromArgb(255, 186, 108)
    };

    public QuotaWidget()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint
               | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        BackColor = CardBack;
        Font = new Font("Microsoft YaHei UI", 9f, FontStyle.Regular, GraphicsUnit.Point);
    }

    public void SetWhale(Bitmap b) { _whale = b; Invalidate(); }

    public void SetData(IEnumerable<Row> rows, string updated)
    {
        _rows.Clear();
        if (rows != null) { foreach (var r in rows) _rows.Add(r); }
        _updated = updated ?? "--:--";
        Invalidate();
    }

    private static GraphicsPath RoundRect(Rectangle r, int radius)
    {
        var p = new GraphicsPath();
        int d = radius * 2;
        if (d <= 0 || r.Width <= 0 || r.Height <= 0) { p.AddRectangle(r); return p; }
        if (d > r.Height) d = r.Height;
        if (d > r.Width) d = r.Width;
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }

    private static Color LevelColor(int pct)
    {
        if (pct >= 90) return Color.FromArgb(242, 88, 96);
        if (pct >= 70) return Color.FromArgb(246, 180, 68);
        return Color.FromArgb(84, 208, 152);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        var full = new Rectangle(0, 0, Width - 1, Height - 1);
        using (var cardPath = RoundRect(full, 13))
        {
            using (var b = new SolidBrush(CardBack)) g.FillPath(b, cardPath);
            using (var hl = new LinearGradientBrush(new Rectangle(0, 0, Width, 46),
                       Color.FromArgb(20, 255, 255, 255), Color.FromArgb(0, 255, 255, 255), 90f))
            {
                g.FillPath(hl, cardPath);
            }
            using (var pen = new Pen(CardEdge, 1f)) g.DrawPath(pen, cardPath);
            g.SetClip(cardPath, CombineMode.Replace);

            int padX = 12, padY = 9;
            int whaleH = 38, whaleAdvance = 0;

            if (_whale != null)
            {
                int ww = (int)Math.Round(_whale.Width * (double)whaleH / _whale.Height);
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.DrawImage(_whale, new Rectangle(padX, padY, ww, whaleH));
                whaleAdvance = ww + 8;
            }

            using (var fTitle = new Font("Microsoft YaHei UI", 12f, FontStyle.Bold))
            using (var br = new SolidBrush(TextMain))
                g.DrawString("鲸鱼娘", fTitle, br, padX + whaleAdvance, padY + 1);

            using (var fSub = new Font("Microsoft YaHei UI", 7.5f))
            using (var br = new SolidBrush(TextDim))
                g.DrawString("GOAT 额度", fSub, br, padX + whaleAdvance, padY + 23);

            using (var fSmall = new Font("Microsoft YaHei UI", 8f))
            using (var br = new SolidBrush(TextDim))
            {
                var sz = g.MeasureString(_updated, fSmall);
                g.DrawString(_updated, fSmall, br, Width - padX - sz.Width, padY + 4);
            }

            int nameW = 46, colW = 94, gap = 6;
            int barW = colW - gap, barH = 21;
            int colStart = padX + nameW;
            int rowTop = padY + whaleH + 8, rowH = 28;

            var sfRight = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Center };
            var sfLeft = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Center };

            using (var fName = new Font("Microsoft YaHei UI", 9f, FontStyle.Bold))
            using (var fTag = new Font("Microsoft YaHei UI", 7.5f))
            using (var fPct = new Font("Microsoft YaHei UI", 9.5f, FontStyle.Bold))
            {
                string[] tags = { "5h", "周", "月" };
                for (int r = 0; r < _rows.Count; r++)
                {
                    var row = _rows[r];
                    int y = rowTop + r * rowH;
                    using (var br = new SolidBrush(NameColors[r % NameColors.Length]))
                        g.DrawString(row.Name, fName, br, new RectangleF(padX, y, nameW - 6, barH), sfLeft);

                    int[] vals = { row.FiveHour, row.Weekly, row.Monthly };
                    for (int i = 0; i < 3; i++)
                    {
                        int x = colStart + i * colW;
                        var rect = new Rectangle(x, y, barW, barH);
                        using (var bp = RoundRect(rect, barH / 2))
                        {
                            using (var bb = new SolidBrush(BarBack)) g.FillPath(bb, bp);

                            int v = Math.Max(0, Math.Min(100, vals[i]));
                            if (!row.Error && v > 0)
                            {
                                int fw = Math.Max(barH, (int)Math.Round(barW * v / 100.0));
                                var fill = new Rectangle(x, y, Math.Min(fw, barW), barH);
                                var c = LevelColor(v);
                                using (var fp = RoundRect(fill, barH / 2))
                                using (var lg = new LinearGradientBrush(fill, Color.FromArgb(238, c), Color.FromArgb(176, c), 0f))
                                    g.FillPath(lg, fp);
                            }
                        }
                        using (var tb = new SolidBrush(Color.FromArgb(215, 224, 230, 238)))
                            g.DrawString(tags[i], fTag, tb, new RectangleF(x + 9, y, 26, barH), sfLeft);
                        using (var pb = new SolidBrush(row.Error ? TextDim : TextMain))
                            g.DrawString(row.Error ? "—" : vals[i] + "%", fPct, pb, new RectangleF(x, y, barW - 9, barH), sfRight);
                    }
                }

                if (_rows.Count == 0)
                {
                    using (var br = new SolidBrush(TextDim))
                        g.DrawString("正在读取额度…", fTag, br, new RectangleF(colStart, rowTop + 4, 200, barH), sfLeft);
                }
            }
            g.ResetClip();
        }
    }
}