---
id: mem-5aa39cd7dd8862378c28ae5ece2650d6
revision: 1
created_at: "2026-09-20T07:25:09.0706775Z"
updated_at: "2026-09-20T07:25:09.0706775Z"
name: share-file-with-user-via-wps
title: 给用户看文件：直接用 WPS 打开（2026-09-20 用户指示）
description: 用户指示：文件就绪后直接用 WPS 打开即可（WPS 自动云同步到手机），不要上传云盘/起 HTTP 服务；微信通道实测不支持发送文件消息
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 把文件给用户看 — 直接用 WPS 打开（2026-09-20 用户明确指示）

## 用户指示（原话）
> 「不用你上传，你直接打开就行了，这一步让bot记住」

即：文件生成/就绪后，**直接调用 WPS 打开它**即可 —— WPS 自带云同步，用户在**手机 WPS 的最近/云文档**里就能看到并打开。不需要任何“上传/推送”的中间步骤。

## 唯一要做的动作
```powershell
$wps = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\wps.exe").'(default)'
Start-Process -FilePath $wps -ArgumentList "<文件的绝对路径>"
```
当前 WPS：`D:\wps\WPS Office\12.1.0.28505\office6\wps.exe`（以注册表 App Paths 为准；旧版在 `D:\30-软件\wps\WPS Office\12.1.0.28043\office6\wps.exe`）。
已实测：2026-09-20 15:24 用此方式打开 `Eckart-Young-截断SVD最优低秩近似-详解.pdf`，WPS 窗口标题即为该 PDF。

## 明确【不需要】做（用户已否决）
- ❌ 不要复制到 WPS 云盘目录（`~\WPSDrive\<用户ID>\WPS云盘`）——曾做过，被用户要求去掉，已删除副本
- ❌ 不要起 HTTP 下载服务 / 发下载链接（`send-file-to-weixin.py`）—— 手机与电脑通常不同网，无效
- ❌ 不要试图用微信发文件消息（见下）

## 微信为什么发不了文件（已实测，避免重复踩坑）
- reasonix 的 **weixin 适配器只实现文本**：二进制符号仅 `reasonix/internal/bot/weixin.extractIlinkText` 等，**无任何 media/file/image/upload 函数**；只有 **feishu 适配器**支持文件（`feishu.outboundMedia` / `fileContent` / `imageContent`）。
- `bot.control` 的 `POST /send` 带 `media` 对 weixin **无效**：返回 `200`，但用户实际收到的是**文本**（文件名）—— 别被 HTTP 200 骗了。
- 直连 iLink `POST https://ilinkai.weixin.qq.com/ilink/bot/sendmessage` **外部无法注入**：`Authorization` / `iLink-App-Id` / `X-WECHAT-UIN` / `context_token` 各种组合均返回 `{"errcode":-14,"errmsg":"session timeout"}`（session 绑定在 bot 自己的 getupdates 长轮询上）；iLink 全部端点仅 getupdates / sendmessage / sendtyping / qrcode 两个，**无上传端点**。

## bot.control 仍可用于发【文本】
`POST http://127.0.0.1:37913/send`，`Authorization: Bearer $REASONIX_BOT_CONTROL_TOKEN`（token 在 bot 的 `.env`）；
`connection_id="weixin"`、`domain="weixin"`、`chat_type="dm"`，
**`chat_id` 必须是平台原始 ID `o9cq802gbUa4ccZXIxmu2hVNkvYc@im.wechat`**（用日志里的内部 id 会报 `502 sendmessage error ret=-3`）。

## 已同步到 bot 侧
写入 bot 自己的 memory：`%APPDATA%\reasonix-bot\memory\global\weixin-bot-send-file-methods.md`（同为“直接用 WPS 打开”）。
