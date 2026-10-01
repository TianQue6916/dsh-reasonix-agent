/**
 * dsh-plugin-goat-quota — 把 Command Code GOAT 套餐额度（5 小时 / 周 / 月）注册为 dsh 工具 `goat_quota`。
 *
 * 数据来源：D:\Toolbox\goat-gateway\goat-usage.ps1（读 api.commandcode.ai 的 alpha 端点，
 * 属账户元数据查询，不产生 completion、不计 token/credits）。
 *
 * 环境变量：
 *   GOAT_USAGE_SCRIPT 覆盖脚本路径（默认 D:\Toolbox\goat-gateway\goat-usage.ps1）
 */
import { execFileSync } from "node:child_process";

export const name = "tool-goat-quota";
export const inject = ["tools"];

const SCRIPT = process.env.GOAT_USAGE_SCRIPT || "D:\\Toolbox\\goat-gateway\\goat-usage.ps1";

/** 调本地脚本拿额度（脚本内部有缓存，避免每次打网络）。 */
function readQuota(account) {
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, "-Json", "-CacheSeconds", "60"];
  if (account) { args.push("-Key", String(account)); }
  const raw = execFileSync("powershell", args, {
    encoding: "utf8",
    timeout: 60000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function pct(used, cap) {
  return cap > 0 ? Math.round((100 * used) / cap) : 0;
}

function resetText(epochMs) {
  if (!epochMs) { return ""; }
  const t = new Date(Number(epochMs));
  return t.toISOString().slice(5, 16).replace("T", " ") + "Z";
}

function lineFor(row) {
  if (row.error) { return `[${row.name}] 查询失败：${row.error}`; }
  return `[${row.name}] 5h ${row.fiveHourUsed.toFixed(2)}/${row.fiveHourCap} (${pct(row.fiveHourUsed, row.fiveHourCap)}%，重置 ${resetText(row.fiveHourReset)})`
    + ` · 周 ${row.weeklyUsed.toFixed(2)}/${row.weeklyCap} (${pct(row.weeklyUsed, row.weeklyCap)}%，重置 ${resetText(row.weeklyReset)})`
    + ` · 月 ${row.monthUsed.toFixed(2)}/${row.monthCap.toFixed(2)} (${pct(row.monthUsed, row.monthCap)}%，剩 ${row.monthLeft.toFixed(2)})`;
}

export function apply(ctx) {
  ctx.tools.register({
    name: "goat_quota",
    description:
      "查询 Command Code GOAT 套餐的额度使用情况：5 小时窗口、本周、本月三条限制的已用/上限/百分比/重置时间。"
      + "用于判断当前还能跑多少任务、或确认是否接近限流阈值。纯账户查询，不消耗套餐额度。",
    parameters: {
      account: {
        type: "string",
        required: false,
        description: "可选：只看某个账号（keys.json 里的 name，如 163 / qq）。省略则返回全部账号。"
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["text", "accounts"],
        properties: {
          text: { type: "string" },
          accounts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "fiveHour", "weekly", "month"],
              properties: {
                name: { type: "string" },
                fiveHour: { type: "string" },
                weekly: { type: "string" },
                month: { type: "string" }
              }
            }
          }
        }
      },
      render: (_args, value) => [{ type: "text", text: value.text }]
    },
    execute(args) {
      const rows = readQuota(args && args.account);
      const text = rows.map(lineFor).join("\n");
      const accounts = rows.map((row) => ({
        name: String(row.name),
        fiveHour: row.error ? "n/a" : `${row.fiveHourUsed.toFixed(2)}/${row.fiveHourCap} (${pct(row.fiveHourUsed, row.fiveHourCap)}%)`,
        weekly: row.error ? "n/a" : `${row.weeklyUsed.toFixed(2)}/${row.weeklyCap} (${pct(row.weeklyUsed, row.weeklyCap)}%)`,
        month: row.error ? "n/a" : `${row.monthUsed.toFixed(2)}/${row.monthCap.toFixed(2)} (${pct(row.monthUsed, row.monthCap)}%, left ${row.monthLeft.toFixed(2)})`
      }));
      return Promise.resolve({ text: text || "（没有启用的账号）", accounts });
    },
    presentCall: (args) => ({
      card: "generic",
      title: "查询 GOAT 额度",
      kind: "other",
      rawInput: args || {}
    })
  });
}
