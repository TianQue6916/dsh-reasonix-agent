#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Insert the B/C + restart-handoff entries into ~/.dsh/PLAN.md.

Why a file instead of a bash heredoc: PLAN.md contains Windows paths like
C:\\Users\\... whose \U sequence makes python raise
`SyntaxError: (unicode error) 'unicodeescape' codec can't decode bytes`.
A raw string in a real file avoids that entirely.
"""
import io
import sys

P = "C:/Users/27063/.dsh/PLAN.md"
ANCHOR = "## \u8fdb\u884c\u4e2d"

ENTRY = r"""- [ ] **\u2605\u2605 \u91cd\u542f\u4ea4\u63a5\uff08\u7528\u6237 m08031\uff09**
      \u7528\u6237\u9010\u5b57\uff1a\u300c\u53ef\u4ee5,\u4e0d\u8fc7\u4f60\u5148\u628a\u8fd9\u4e9b\u76ee\u6807\u5b58\u5165,\u6211\u8981\u91cd\u542f\u7535\u8111,\u636e\u53e6\u5916\u4e00\u4e2a\u4f1a\u8bdd\u8bca\u65ad,d\u76d8\u65e0\u6cd5\u666e\u901a\u5199\u5165,\u5185\u6838\u6545\u969c\u300d
      **\u7528\u6237\u5df2\u6279\u51c6\u4e09\u4ef6\u4e8b**\uff1a\u2460 `--no-sandbox` \u4e0a\u751f\u4ea7\uff08Edge 154 \u8dd1 CDP \u7684\u552f\u4e00\u6761\u4ef6\uff09\uff1b
      \u2461 \u628a**\u7528\u6237\u7ea7** `TEMP`/`TMP` \u4ece `D:\Temp` \u6539\u5230 `C:\Users\27063\AppData\Local\Temp`\uff1b\u2462 computer-use \u63a8\u751f\u4ea7\u3002
      **\u2605 \u91cd\u542f\u524d\u65b0\u8bca\u65ad\uff08\u53e6\u4e00\u4e2a session \u7ed9\u51fa\uff09**\uff1a\u300cd \u76d8\u65e0\u6cd5\u666e\u901a\u5199\u5165\uff0c**\u5185\u6838\u6545\u969c**\u300d
      \u21d2 \u8fd9**\u63a8\u7ffb\u4e86\u6211\u5148\u524d\u57fa\u4e8e ACL \u7684\u63a8\u65ad**\uff08`BUILTIN\Users` \u53ea\u6709 (I)(RX)\uff09\u2014\u2014
      `Authenticated Users` \u5e26 Modify \u4ecd\u62d2\u5199\uff0c\u5185\u6838/\u6587\u4ef6\u7cfb\u7edf\u5c42\u6545\u969c\u66f4\u7b26\u5408\u5b9e\u6d4b\u3002
      **\u91cd\u542f\u540e\u7b2c\u4e00\u4ef6\u4e8b = \u91cd\u6d4b `D:\Temp`\uff1a**
      `node -e "console.log(require('os').tmpdir())"` + `node -e "require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'p-'))"`
      \u21d2 \u53ef\u5199\u5219\u65e0\u9700\u6539\u73af\u5883\u53d8\u91cf\uff1b\u4ecd EPERM \u5219\u6267\u884c\u2461\u3002
      **\u91cd\u542f\u540e\u7684\u63a5\u7ba1\u6e05\u5355**\uff1a
      1. \u91cd\u6d4b `D:\Temp`\uff1b
      2. \u4e24\u4fa7\uff08web + desktop\uff09\u5404\u4e00\u6b21\u91cd\u542f \u21d2 \u4f7f `tm-usage-first` plugin\u3001thinking-guard \u5173\u95ed\u3001session-title 512 \u751f\u6548\uff1b
         \u9a8c\u6536 `python ~/.dsh/storages/tools/compaction-audit.py --since <\u91cd\u542f\u65f6\u523b> --assert-usage-first`
         \u671f\u671b ratio \u2248 1.0\u3001\u89e6\u53d1\u70b9 \u2248 75\u201380% \u7a97\u53e3\uff08\u73b0\u5728\u662f 9.26 / 15.1%\uff09\uff1b
      3. B4\uff1a\u6a2a\u5411\u5bf9\u6bd4 `@wxg-prc-cpg/browser-skill-dsh-plugin`\uff08\u26057385\uff09\u4e0e `dsh-builtin-browser`\uff08dl 12583\uff09\uff0c\u518d\u51fa go/no-go + \u63a8\u751f\u4ea7\u65b9\u6848\uff08\u542b\u56de\u6eda\uff09\uff1b
      4. \u6309\u2460\u2461\u2462 \u63a8\u751f\u4ea7\uff08\u2460 \u662f\u5b89\u5168\u964d\u7ea7\uff0c\u63a8\u524d\u518d\u786e\u8ba4\u4e00\u6b21\u7206\u70b8\u534a\u5f84\uff09\u3002
- [x] **B\uff08computer-use\uff09+ C\uff08browser-use\uff09\u5747\u5df2\u7aef\u5230\u7aef\u8dd1\u901a\uff082026-10-04 18:2x\uff09**
      \u5168\u90e8\u5728\u9694\u79bb\u73af\u5883 `DSH_HOME='C:\Users\27063\.dsh-lab'` \u5b8c\u6210\uff1b**\u751f\u4ea7 `~/.dsh` \u7684 profile/patch \u5168\u7a0b\u672a\u52a8**\u3002
      **B**\uff1a`profiles/cu-lab` + `dsh-computer-use-win` v0.2.2\u3002\u4e24\u4e2a\u72ec\u7acb\u7f3a\u9677\u5fc5\u987b\u540c\u65f6\u4fee\uff1a
      \u2460 \u4e0d\u53ef\u5199 TEMP\uff08\u7ed9 MCP \u884c\u52a0 `env: {TEMP,TMP}`\uff0c\u4f9d\u636e `dsh-mcp-client/lib/index.js:26 ...scrubbedParentEnv(), ...extra`\uff09\uff1b
      \u2461 `Add-Type -OutputAssembly` + `LoadFrom` \u62a5 `0x80131515 Operation is not supported` \u21d2 \u6539**\u7eaf\u5185\u5b58** `Add-Type -TypeDefinition $script:WcuCs`\u3002
      **\u7aef\u5230\u7aef\u5224\u636e**\uff1a\u81ea\u5efa WinForms \u7a97\u53e3 `B3PROBE` \u21d2 `list_windows` \u5f97 HWND `10751278` \u21d2 `snapshot` \u5f97
      `probeBox=uia:rt:42-1511390` / `probeBtn=uia:rt:42-3084006` \u21d2 `set_value` `{ok:true,method:ValuePattern}` \u21d2 `invoke` `{ok:true,method:Invoke}`\uff1b
      **\u72ec\u7acb\u5224\u636e**\uff08pwsh \u8bfb\u6587\u4ef6\uff0c\u4e0d\u7ecf wincu \u81ea\u8bc1\uff09\uff1a`b3-out.txt` = `B3-PROBE-OK`\u3002\u6d4b\u8bd5\u7a97\u53e3\u5df2\u7528 `close_window` \u6e05\u7406\u3002
      **C**\uff1a`profiles/browser-lab` + `github:guo6x/dsh-pilot` v0.7.2\uff08\u96f6 runtime \u4f9d\u8d56\uff0craw CDP\uff0c17 \u4e2a `pilot_*` \u5de5\u5177\uff09\u3002\u4e09\u4e2a\u963b\u585e\uff1a
      \u2460 `--profile web` \u4e0d\u6536\u4f4d\u7f6e\u53c2\u6570\uff08`error: too many arguments`\uff09\u21d2 \u4e00\u6b21\u6027 prompt \u53ea\u80fd headless \u7c7b\uff1b
      \u2461 pilot \u58f0\u660e `inject = ["webServer","tools"]`\uff08`lib/index.js:9`\uff09\u21d2 \u624b\u63d2 `@deepseek-ai/dsh-host-webserver`\uff0c
         **config \u5fc5\u987b\u663e\u5f0f\u7ed9 `host`+`port`**\uff08schema `.required()`\uff0c\u5426\u5219 `ValidationError: $.host missing required value`\uff09\uff1b
      \u2462 **\u2605 Edge 154 `Page.enable` \u62a5 `Target crashed` \u2014\u2014 \u552f\u4e00\u51b3\u5b9a\u56e0\u7d20 = `--no-sandbox`**
         \uff08\u9010 flag \u77e9\u9635\uff1a\u65e0 / \u53ea `--disable-gpu` / `--headless=old` / \u6709\u5934 \u5168 FAIL `{"code":-32000,"message":"Target crashed"}`\uff0c\u53ea\u52a0 `--no-sandbox` \u5219 `{}` OK\uff09\uff1b
         \u4fee\u6cd5\u5df2\u843d\u76d8 lab\uff1a`profiles/browser-lab/node_modules/dsh-pilot/lib/index.js`\uff0860280 \u2192 **60468 B**\uff0c**CRLF**\uff0c\u5907\u4efd `.bak-20261004-pre-nosandbox`\uff09
         \u5728 `:241 const argv = [` \u7684 `"--headless=new",` \u4e4b\u540e\u63d2\u5165 `"--no-sandbox",`\uff1b\u4e0a\u6e38\u672a\u5e26\u8be5 flag\u3002
      **\u7aef\u5230\u7aef\u5224\u636e**\uff08\u670d\u52a1\u7aef\u65e5\u5fd7\uff0c\u4e0d\u7ecf pilot \u81ea\u8bc1\uff09\uff1a`c-server.log` \u9010\u5b57\u542b
      `2026-10-04T10:17:07.277Z GET /api/clicked?name=HELLO-PILOT`\u2014\u2014`HELLO-PILOT` \u662f `pilot_fill` \u5199\u8fdb input \u7684\u503c\uff0c
      \u8be5\u8bf7\u6c42\u662f `pilot_click` \u540e\u9875\u9762\u771f\u5b9e\u53d1\u7684 fetch \u21d2 **\u5b8c\u6574\u6d4f\u89c8\u5668\u95ed\u73af\u6210\u7acb**\u3002
      **\u8be6\u60c5\u5df2\u5b58 memory**\uff1a`dsh-pilot-browser-lab-e2e-20261004`\u3001`windows-temp-d-temp-unwritable-root-cause-20261004`\u3002
- [x] **\u2605 \u672c\u673a\u603b\u6839\u56e0\uff1a`D:\Temp` \u4e0d\u53ef\u5199\uff082026-10-04\uff09**
      \u7528\u6237\u7ea7 `TEMP`/`TMP` \u5747\u6307\u5411 `D:\Temp`\u3002\u4e00\u4e2a\u6839\u56e0\u957f\u51fa\u4e09\u4e2a\u770b\u4f3c\u6beb\u4e0d\u76f8\u5173\u7684\u6545\u969c\uff1a
      \u2460 dsh \u7684 pwsh/bash \u5de5\u5177 `EPERM ... mkdtemp 'D:\Temp\dsh-subprocess-XXXXXX'`\uff1b
      \u2461 computer-use \u540e\u7aef\uff08`Add-Type` \u7684**\u7f16\u8bd1\u8fc7\u7a0b**\u5fc5\u7136\u5199 `$env:TEMP` \u505a csc scratch\uff09\uff1b
      \u2462 dsh-pilot `mkdtemp(join(tmpdir(),\u2026))`\uff08`lib/index.js:238`\uff09\u3002
      \u2605 **\u4e24\u5c42 TEMP \u8bed\u4e49\u4e0d\u540c**\uff1a
      \u00b7 MCP \u884c\u5185 `env: TEMP` = \u4efb\u610f\u53ef\u5199\u76ee\u5f55\uff08**\u53ef\u5728 workspace \u5185**\uff0c\u5b9e\u6d4b `\.dsh-lab\tmp` \u53ef\u7528\uff09\uff1b
      \u00b7 **\u8fdb\u7a0b\u7ea7 `TEMP`\uff08dsh \u81ea\u5df1\u7684\u5de5\u5177\u6c99\u7bb1\u7528\uff09= \u5fc5\u987b\u5728 workspace \u4e4b\u5916**\uff0c
        \u5426\u5219\u62a5\u9010\u5b57 `Windows ACL temp root must be outside the workspace`\uff08\u6765\u6e90 `@deepseek-ai/dsh-sandbox-windows-acl/lib/types-Cl_DXjhk.js`\uff09\u3002
      **\u5b9e\u6d4b\u53ef\u7528\u5019\u9009\u53ea\u6709 `C:\Users\27063\AppData\Local\Temp`**\uff08`C:\Windows\Temp` EPERM\u3001`C:\dshlab-tmp` \u65e0\u6743\u5efa\u3001`D:\Temp` EPERM\uff09\u3002
      \u751f\u4ea7 host \u672a\u53d7\u5f71\u54cd\uff08\u5b83\u90a3\u6761\u542f\u52a8\u94fe\u7684 TEMP \u4e0e\u767b\u5f55 shell \u4e0d\u540c\uff09\u3002
"""


def main() -> int:
    raw = open(P, "rb").read()
    nl = "\r\n" if b"\r\n" in raw else "\n"
    s = raw.decode("utf-8")
    old = ANCHOR + nl + nl
    if s.count(old) != 1:
        print("FAIL: anchor count=%d" % s.count(old))
        return 1
    body = ENTRY.replace("\n", nl)
    if not body.endswith(nl):
        body += nl
    out = s.replace(old, old + body, 1)
    if out == s:
        print("FAIL: no change")
        return 1
    with io.open(P, "w", encoding="utf-8", newline="") as fh:
        fh.write(out)
    print("OK: %d -> %d bytes" % (len(raw), len(out.encode("utf-8"))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
