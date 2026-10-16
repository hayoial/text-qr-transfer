export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API: 存储加密密文 (通用: 支持自定义 key 或随机短 ID，5分钟硬过期)
    if (url.pathname === "/api/store" && request.method === "POST") {
      try {
        if (!env.TEXT_KV) {
          return new Response(JSON.stringify({ error: "Storage not configured" }), {
            status: 500,
            headers: { "content-type": "application/json" }
          });
        }
        const body = await request.json();
        const { cipherText, customId } = body;
        if (!cipherText || cipherText.length > 5 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: "Payload exceeds size limit" }), { status: 400 });
        }

        const id = customId ? customId : Math.random().toString(36).substring(2, 8);
        await env.TEXT_KV.put(id, cipherText, { expirationTtl: 300 });

        return new Response(JSON.stringify({ id }), {
          headers: { "content-type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }

    // API: 获取密文 (阅后即焚)
    if (url.pathname.startsWith("/api/get/") && request.method === "GET") {
      try {
        if (!env.TEXT_KV) {
          return new Response(JSON.stringify({ error: "Storage not configured" }), { status: 500 });
        }
        const id = url.pathname.split("/").pop();
        const cipherText = await env.TEXT_KV.get(id);
        if (!cipherText) {
          return new Response(JSON.stringify({ error: "已销毁或已过期" }), { status: 404 });
        }
        await env.TEXT_KV.delete(id);

        return new Response(JSON.stringify({ cipherText }), {
          headers: { "content-type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }

    // 页面交付
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>文本中继 · Text Relay</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js"></script>
  <style>
    :root {
      --bg: #f8fafc;
      --surface: #ffffff;
      --surface-raised: #f1f5f9;
      --border: #e2e8f0;
      --border-focus: #94a3b8;
      --ink: #0f172a;
      --ink-muted: #64748b;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --success: #16a34a;
      --warning: #d97706;
      --danger: #dc2626;
      --qr-border: #cbd5e1;
      --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }

    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --bg: #090a0f;
        --surface: #12151c;
        --surface-raised: #181d26;
        --border: #242b38;
        --border-focus: #3d4758;
        --ink: #eceff4;
        --ink-muted: #7e8b9b;
        --accent: #2563eb;
        --accent-hover: #1d4ed8;
        --success: #16a34a;
        --warning: #f59e0b;
        --danger: #ef4444;
        --qr-border: #334155;
      }
    }

    :root[data-theme="dark"] {
      --bg: #090a0f;
      --surface: #12151c;
      --surface-raised: #181d26;
      --border: #242b38;
      --border-focus: #3d4758;
      --ink: #eceff4;
      --ink-muted: #7e8b9b;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --success: #16a34a;
      --warning: #f59e0b;
      --danger: #ef4444;
      --qr-border: #334155;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--ink);
      font-family: var(--sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px 16px;
      -webkit-font-smoothing: antialiased;
      transition: background-color 0.2s ease, color 0.2s ease;
    }

    .shell {
      width: 100%;
      max-width: 520px;
    }

    /* 主标题区 */
    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 14px;
      padding: 0 4px;
    }

    .app-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--ink);
    }

    .app-sub {
      font-size: 12px;
      color: var(--ink-muted);
      font-family: var(--mono);
    }

    /* 顶部导航与标签 */
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding: 0 4px;
      gap: 8px;
      flex-wrap: wrap;
    }

    .tab-group {
      display: inline-flex;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 2px;
      flex-wrap: wrap;
      gap: 2px;
    }

    .tab-btn {
      background: transparent;
      border: none;
      color: var(--ink-muted);
      font-size: 13px;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .tab-btn.active {
      background: var(--surface);
      color: var(--ink);
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }

    .top-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-counter {
      font-family: var(--mono);
      font-size: 12px;
      color: var(--ink-muted);
      padding: 0 4px;
    }

    .mode-btn, .theme-toggle {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--ink-muted);
      font-family: var(--mono);
      font-size: 11px;
      padding: 4px 8px;
      cursor: pointer;
      line-height: 1.4;
      transition: background-color 0.15s ease, color 0.15s ease;
      white-space: nowrap;
    }

    .mode-btn:hover, .theme-toggle:hover {
      background: var(--surface-raised);
      color: var(--ink);
    }

    /* 面板容器 */
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }

    textarea {
      width: 100%;
      height: 180px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--ink);
      font-family: var(--mono);
      font-size: 13px;
      line-height: 1.6;
      padding: 12px;
      resize: vertical;
      outline: none;
      transition: border-color 0.15s ease, background-color 0.2s ease;
    }

    textarea:focus {
      border-color: var(--border-focus);
    }

    textarea::placeholder {
      color: var(--ink-muted);
      font-family: var(--sans);
    }

    .control-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 14px;
      gap: 8px;
      flex-wrap: wrap;
    }

    .btn {
      font-family: var(--sans);
      font-weight: 500;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: background-color 0.15s ease, opacity 0.15s ease;
      user-select: none;
      white-space: nowrap;
    }

    .btn-action {
      background: var(--accent);
      color: #fff;
      font-size: 14px;
      padding: 10px 16px;
      flex: 1;
      min-width: 120px;
    }

    .btn-action:hover {
      background: var(--accent-hover);
    }

    .btn-action:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-subtle {
      background: transparent;
      color: var(--ink-muted);
      border: 1px solid var(--border);
      font-size: 13px;
      padding: 9px 12px;
    }

    .btn-subtle:hover {
      background: var(--surface-raised);
      color: var(--ink);
    }

    .btn-danger {
      background: transparent;
      color: var(--danger);
      border: 1px solid var(--border);
      font-size: 13px;
      padding: 9px 12px;
    }

    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.08);
      border-color: var(--danger);
    }

    /* 二维码区域 */
    .qr-region {
      display: none;
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid var(--border);
      text-align: center;
    }

    .qr-frame {
      display: inline-block;
      background: #ffffff;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--qr-border);
    }

    .qr-caption {
      margin-top: 10px;
      font-family: var(--mono);
      font-size: 12px;
      color: var(--ink-muted);
    }

    /* 6 位提取码卡片 */
    .code-display-card {
      display: none;
      margin-top: 18px;
      padding: 18px;
      background: var(--surface-raised);
      border: 1px dashed var(--border-focus);
      border-radius: 10px;
      text-align: center;
    }

    .code-digits {
      font-family: var(--mono);
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 8px;
      color: var(--accent);
      margin: 8px 0;
    }

    .code-hint {
      font-size: 12px;
      color: var(--ink-muted);
    }

    /* 提取文本输入框 */
    .retrieve-box {
      display: flex;
      gap: 10px;
      margin-bottom: 14px;
    }

    .code-input {
      flex: 1;
      height: 46px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--ink);
      font-family: var(--mono);
      font-size: 20px;
      font-weight: 600;
      letter-spacing: 4px;
      text-align: center;
      outline: none;
    }

    .code-input:focus {
      border-color: var(--accent);
    }

    .btn-retrieve {
      height: 46px;
      padding: 0 18px;
      font-size: 14px;
      background: var(--accent);
      color: #fff;
    }

    /* 输入码界面的手机直达扫码区 */
    .phone-entry-guide {
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid var(--border);
      text-align: center;
    }

    .guide-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--ink);
      margin-bottom: 4px;
    }

    .guide-sub {
      font-size: 12px;
      color: var(--ink-muted);
      margin-bottom: 12px;
    }

    /* 手机端 URL 接收视图 */
    .receiver-deck {
      display: none;
    }

    .btn-huge-copy {
      width: 100%;
      background: var(--accent);
      color: #ffffff;
      font-size: 18px;
      font-weight: 600;
      padding: 16px 20px;
      border-radius: 10px;
      margin-bottom: 14px;
    }

    .btn-huge-copy:active {
      transform: scale(0.99);
    }

    .btn-huge-copy.copied {
      background: var(--success);
    }

    .content-viewport {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      max-height: 380px;
      overflow-y: auto;
      font-family: var(--sans);
      font-size: 14px;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--ink);
      transition: background-color 0.2s ease;
    }

    /* 文件传输专属样式 */
    .file-dropzone {
      border: 2px dashed var(--border);
      border-radius: 10px;
      padding: 24px 16px;
      text-align: center;
      background: var(--bg);
      cursor: pointer;
      transition: border-color 0.15s ease, background-color 0.15s ease;
    }

    .file-dropzone:hover {
      border-color: var(--accent);
      background: var(--surface-raised);
    }

    .file-meta-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      margin-top: 12px;
      font-family: var(--mono);
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }

    .privacy-notice {
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 11px;
      color: var(--ink-muted);
      margin-top: 12px;
      line-height: 1.5;
    }

    .progress-bar-bg {
      width: 100%;
      height: 8px;
      background: var(--surface-raised);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 10px;
      border: 1px solid var(--border);
    }

    .progress-bar-fill {
      height: 100%;
      background: var(--accent);
      width: 0%;
      transition: width 0.15s linear;
    }

    /* 扫码取景器容器 */
    .camera-viewport {
      position: relative;
      width: 100%;
      max-width: 360px;
      height: 270px;
      margin: 0 auto 12px auto;
      background: #000000;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .camera-viewport video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .camera-overlay {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 180px;
      height: 180px;
      border: 2px solid var(--accent);
      border-radius: 12px;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.4);
      pointer-events: none;
    }

    .notice-banner {
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 12px;
      display: none;
      line-height: 1.4;
    }

    .notice-banner.danger {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid var(--danger);
      color: var(--danger);
    }

    .notice-banner.success {
      background: rgba(22, 163, 74, 0.1);
      border: 1px solid var(--success);
      color: var(--success);
    }

    .footnote {
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--ink-muted);
      font-family: var(--mono);
      padding: 0 4px;
    }
  </style>
</head>
<body>

<div class="shell">
  <!-- 主标题区 -->
  <div class="app-header">
    <span class="app-title">文本中继 · Text Relay</span>
    <span class="app-sub" id="header-sub">私密传输 & 动态码互传</span>
  </div>

  <!-- 顶部导航栏 -->
  <div class="top-bar">
    <div class="tab-group" id="nav-tabs">
      <button class="tab-btn active" id="tab-send" onclick="switchTab('send')">发送文本</button>
      <button class="tab-btn" id="tab-send-file" onclick="switchTab('send-file')">发送文件</button>
      <button class="tab-btn" id="tab-recv" onclick="switchTab('recv')">提取文本</button>
      <button class="tab-btn" id="tab-recv-file" onclick="switchTab('recv-file')">扫码收文件</button>
    </div>

    <div class="top-actions">
      <span class="status-counter" id="status-counter">0 字符</span>
      <button class="mode-btn" id="device-btn" onclick="toggleDeviceMode()" title="切换设备偏好模式">桌面端</button>
      <button class="theme-toggle" id="theme-btn" onclick="cycleTheme()">自动</button>
    </div>
  </div>

  <!-- 面板 1: 发送文本 (支持生成静态二维码或 6 位提取码) -->
  <div class="panel" id="panel-sender">
    <textarea id="input-payload" placeholder="粘贴需要发送的长文本..."></textarea>
    
    <div class="control-row">
      <button class="btn btn-subtle" onclick="clearInput()">清空</button>
      <button class="btn btn-action" id="btn-qr" onclick="submitAsQR()">生成扫码识别码</button>
      <button class="btn btn-subtle" id="btn-code" onclick="submitAsCode()" title="适合手机发回电脑：生成 6 位提取码">生成提取码</button>
    </div>

    <!-- 二维码显示 -->
    <div class="qr-region" id="qr-block">
      <div class="qr-frame" id="qr-target"></div>
      <div class="qr-caption">低密度短码 · 屏幕扫码秒识别</div>
    </div>

    <!-- 6 位提取码显示 -->
    <div class="code-display-card" id="code-block">
      <div class="code-hint">在电脑上打开本页并输入以下提取码：</div>
      <div class="code-digits" id="digit-value">------</div>
      <div class="code-hint">5 分钟内有效 · 电脑输入后即刻物理销毁</div>
    </div>
  </div>

  <!-- 面板 2: 发送文件 (动态二维码循环轮播，纯前端本地处理，0 服务器上传) -->
  <div class="panel" id="panel-file-sender" style="display:none;">
    <div class="file-dropzone" onclick="document.getElementById('file-input').click()">
      <div style="font-size:14px; font-weight:600; color:var(--ink); margin-bottom:4px;">点击选择本地文件（限 5MB 以内）</div>
      <div style="font-size:12px; color:var(--ink-muted);">文件仅在浏览器本地分片编码播放，完全不上传至任何服务器</div>
      <input type="file" id="file-input" style="display:none;" onchange="handleFileSelected(event)" />
    </div>

    <div class="privacy-notice">
      ⚠️ 提示：动态二维码通过屏幕可视光传输，可能被旁人窥视或录屏，不具备文本传输模式的 AES 密钥隔离特性。
    </div>

    <div id="file-meta-section" style="display:none;">
      <div class="file-meta-card">
        <span id="file-name-label">未选择文件</span>
        <span id="file-size-label">0 KB</span>
      </div>

      <div class="control-row" style="margin-top:10px;">
        <button class="btn btn-action" id="btn-file-start" onclick="toggleFileBroadcast()">开始连续播放</button>
        <button class="btn btn-subtle" id="btn-file-cancel" onclick="cancelFileBroadcast()">取消重选</button>
      </div>

      <div class="qr-region" id="file-qr-block" style="display:none;">
        <div class="qr-frame" id="file-qr-target"></div>
        <div class="qr-caption" id="file-progress-label">准备就绪</div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" id="file-progress-bar"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- 面板 3: 提取文本接收端 (Mac 或手机输入 6 位提取码) -->
  <div class="panel" id="panel-retriever" style="display:none;">
    <div class="retrieve-box">
      <input type="text" class="code-input" id="input-code" maxlength="6" placeholder="6 位提取码" onkeydown="if(event.key==='Enter')fetchByCode()" />
      <button class="btn btn-retrieve" onclick="fetchByCode()">提取文本</button>
    </div>

    <div class="content-viewport" id="recv-preview" style="min-height: 120px; color: var(--ink-muted);">
      输入发送端显示的 6 位提取码，点击提取即可在本地解密...
    </div>

    <div style="margin-top: 14px; text-align: right;">
      <button class="btn btn-subtle" id="btn-copy-retrieved" onclick="copyRetrievedText()" style="display:none;">复制全文</button>
    </div>

    <!-- 手机扫码入口：自动获取当前鲁棒 URL 生成二维码 -->
    <div class="phone-entry-guide" id="entry-guide-block">
      <div class="guide-label">手机尚未打开本网页？</div>
      <div class="guide-sub">iPhone 扫码直达发送界面，粘贴文本点“生成提取码”</div>
      <div class="qr-frame" id="entry-qr-target"></div>
      <div class="qr-caption" id="entry-url-label"></div>
    </div>
  </div>

  <!-- 面板 4: 扫码接收文件 (手机端通过摄像头连续扫码重组下载) -->
  <div class="panel" id="panel-file-receiver" style="display:none;">
    <div class="notice-banner" id="rx-file-notice"></div>

    <div class="camera-viewport" id="camera-box" style="display:none;">
      <video id="camera-video" playsinline muted autoplay></video>
      <div class="camera-overlay"></div>
    </div>
    <canvas id="camera-canvas" style="display:none;"></canvas>

    <div id="rx-file-meta" style="margin-bottom:12px; display:none;">
      <div class="file-meta-card">
        <span id="rx-file-name">正在识别文件...</span>
        <span id="rx-file-status">0 / 0 片 (0%)</span>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" id="rx-file-progress-bar"></div>
      </div>
    </div>

    <div class="control-row">
      <button class="btn btn-action" id="btn-camera-toggle" onclick="toggleCameraReceiver()">开启摄像头扫码</button>
      <button class="btn btn-subtle" id="btn-rx-file-reset" onclick="resetFileReceiver()" style="display:none;">重置重试</button>
    </div>

    <div id="rx-file-download-box" style="display:none; margin-top:14px; text-align:center;">
      <a class="btn btn-action" id="rx-download-link" style="text-decoration:none; padding:12px 20px; font-size:15px;" download>
        📥 下载重组后的文件
      </a>
    </div>

    <div class="privacy-notice" style="margin-top:14px;">
      💡 扫码说明：将摄像头对准电脑屏幕上轮播的二维码。协议支持漏帧补全，即使某些帧错过，待发送端再次循环轮播到该帧时即可自动补齐。
    </div>
  </div>

  <!-- 面板 5: 手机端扫码直达接收视图 (通过文本二维码 URL 锚点进入) -->
  <div class="panel receiver-deck" id="panel-receiver">
    <button class="btn btn-huge-copy" id="btn-copy" onclick="triggerCopy()">
      <span id="copy-text">复制全文</span>
    </button>
    <div class="content-viewport" id="rx-content">正在载入解密...</div>
    <div style="margin-top: 14px; text-align: right;">
      <button class="btn btn-subtle" style="font-size: 12px;" onclick="location.href='/'">发送新文本</button>
    </div>
  </div>

  <div class="footnote">
    <span>端到端 AES-256 / 动态码</span>
    <span>本地分片 · 0 服务器留存</span>
  </div>
</div>

<script>
  // ==========================================
  // 1. 主题控制 (自动/夜间/日间)
  // ==========================================
  const THEME_KEY = 'relay_theme_pref';
  function getPreferredTheme() { return localStorage.getItem(THEME_KEY) || 'auto'; }
  function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    const label = mode === 'auto' ? '自动' : (mode === 'dark' ? '夜间' : '日间');
    const b = document.getElementById('theme-btn');
    if (b) b.innerText = label;
  }
  function cycleTheme() {
    const current = getPreferredTheme();
    let next = current === 'auto' ? 'dark' : (current === 'dark' ? 'light' : 'auto');
    if (next === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }
  applyTheme(getPreferredTheme());

  // ==========================================
  // 2. 设备模式判断与切换 (桌面端 / 手机端)
  // ==========================================
  const DEVICE_KEY = 'relay_device_pref';
  function detectDeviceType() {
    // 综合 User-Agent、触控特性与屏幕特征进行合理判定
    const ua = navigator.userAgent || '';
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
    const isTouch = navigator.maxTouchPoints > 1;
    const isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (isMobileUA || (isTouch && isCoarsePointer)) {
      return 'mobile';
    }
    return 'desktop';
  }

  function getActiveDeviceMode() {
    const manual = localStorage.getItem(DEVICE_KEY);
    if (manual === 'mobile' || manual === 'desktop') return manual;
    return detectDeviceType();
  }

  function updateDeviceButton(mode) {
    const btn = document.getElementById('device-btn');
    if (!btn) return;
    const isMobile = mode === 'mobile';
    btn.innerText = isMobile ? '手机端' : '桌面端';
  }

  function toggleDeviceMode() {
    const current = getActiveDeviceMode();
    const next = current === 'mobile' ? 'desktop' : 'mobile';
    localStorage.setItem(DEVICE_KEY, next);
    updateDeviceButton(next);
    // 切换模式后，重置默认选中的标签
    setDefaultTabForMode(next);
  }

  function setDefaultTabForMode(mode) {
    if (mode === 'mobile') {
      // 手机端优先展示接收功能：优先输入码提取（若有文件接收意图也可点收文件）
      switchTab('recv');
    } else {
      // 桌面端优先展示发送功能
      switchTab('send');
    }
  }

  // ==========================================
  // 3. 标签切换管理器
  // ==========================================
  let currentActiveTab = 'send';
  function switchTab(tab) {
    currentActiveTab = tab;
    const tabSend = document.getElementById('tab-send');
    const tabSendFile = document.getElementById('tab-send-file');
    const tabRecv = document.getElementById('tab-recv');
    const tabRecvFile = document.getElementById('tab-recv-file');

    const panelSend = document.getElementById('panel-sender');
    const panelSendFile = document.getElementById('panel-file-sender');
    const panelRecv = document.getElementById('panel-retriever');
    const panelRecvFile = document.getElementById('panel-file-receiver');

    tabSend.classList.toggle('active', tab === 'send');
    tabSendFile.classList.toggle('active', tab === 'send-file');
    tabRecv.classList.toggle('active', tab === 'recv');
    tabRecvFile.classList.toggle('active', tab === 'recv-file');

    panelSend.style.display = (tab === 'send') ? 'block' : 'none';
    panelSendFile.style.display = (tab === 'send-file') ? 'block' : 'none';
    panelRecv.style.display = (tab === 'recv') ? 'block' : 'none';
    panelRecvFile.style.display = (tab === 'recv-file') ? 'block' : 'none';

    // 离开文件接收页时停止摄像头
    if (tab !== 'recv-file') {
      stopCameraStream();
    }
    // 离开文件发送页时暂停广播
    if (tab !== 'send-file' && fileBroadcastRunning) {
      pauseFileBroadcast();
    }

    if (tab === 'recv') {
      renderEntryQR();
      const codeInput = document.getElementById('input-code');
      if (codeInput) codeInput.focus();
    }
  }

  // 字符计数
  const inputEl = document.getElementById('input-payload');
  const counterEl = document.getElementById('status-counter');
  inputEl.addEventListener('input', () => {
    counterEl.innerText = inputEl.value.length + ' 字符';
  });

  function clearInput() {
    inputEl.value = '';
    counterEl.innerText = '0 字符';
    document.getElementById('qr-block').style.display = 'none';
    document.getElementById('code-block').style.display = 'none';
    inputEl.focus();
  }

  // 规范化 URL
  function getRobustCleanUrl() {
    try {
      if (window.location && window.location.origin) {
        return window.location.origin + window.location.pathname;
      }
    } catch (e) {}
    try {
      return window.location.href.split('#')[0].split('?')[0];
    } catch (e) {}
    return '/';
  }

  // 渲染手机扫码直达二维码
  let entryQrRendered = false;
  function renderEntryQR() {
    if (entryQrRendered) return;
    const target = document.getElementById('entry-qr-target');
    if (!target) return;
    target.innerHTML = '';
    const cleanUrl = getRobustCleanUrl();

    new QRCode(target, {
      text: cleanUrl,
      width: 140,
      height: 140,
      correctLevel: QRCode.CorrectLevel.M
    });
    const label = document.getElementById('entry-url-label');
    if (label) {
      try {
        const u = new URL(cleanUrl);
        label.innerText = u.host + (u.pathname === '/' ? '' : u.pathname);
      } catch (err) {
        label.innerText = cleanUrl;
      }
    }
    entryQrRendered = true;
  }

  // ==========================================
  // 4. Web Crypto 原生加解密算法 (文本传输)
  // ==========================================
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function generateKey() {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = await crypto.subtle.exportKey("raw", key);
    return {
      key,
      rawStr: btoa(String.fromCharCode(...new Uint8Array(raw))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    };
  }

  async function deriveKeyFromCode(code) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode("TEXT_RELAY_SALT_" + code));
    return await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  async function restoreKey(str) {
    let norm = str.replaceAll('-', '+').replaceAll('_', '/');
    while (norm.length % 4) norm += '=';
    const bytes = Uint8Array.from(atob(norm), c => c.charCodeAt(0));
    return await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["decrypt"]);
  }

  async function encryptText(plain, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plain);
    const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuf), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  async function decryptText(payload, key) {
    const raw = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const cipher = raw.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return new TextDecoder().decode(decrypted);
  }

  // 4.1 文本生成扫码二维码
  async function submitAsQR() {
    const val = inputEl.value.trim();
    if (!val) return;

    const btn = document.getElementById('btn-qr');
    btn.disabled = true;
    btn.innerText = '正在加密...';

    try {
      const { key, rawStr } = await generateKey();
      const cipherText = await encryptText(val, key);

      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cipherText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传未完成');

      const accessUrl = getRobustCleanUrl() + '#i=' + data.id + '&k=' + rawStr;
      const qrBlock = document.getElementById('qr-block');
      const qrTarget = document.getElementById('qr-target');
      document.getElementById('code-block').style.display = 'none';
      qrTarget.innerHTML = '';

      new QRCode(qrTarget, {
        text: accessUrl,
        width: 180,
        height: 180,
        correctLevel: QRCode.CorrectLevel.M
      });
      qrBlock.style.display = 'block';
    } catch (e) {
      alert(e.message);
    } finally {
      btn.disabled = false;
      btn.innerText = '生成扫码识别码';
    }
  }

  // 4.2 文本生成 6 位提取码
  async function submitAsCode() {
    const val = inputEl.value.trim();
    if (!val) return alert('请先输入长文本');

    const btn = document.getElementById('btn-code');
    btn.disabled = true;
    btn.innerText = '正在处理...';

    try {
      const digits = Math.floor(100000 + Math.random() * 900000).toString();
      const key = await deriveKeyFromCode(digits);
      const cipherText = await encryptText(val, key);

      const storageId = "code_" + (await sha256(digits)).substring(0, 16);

      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cipherText, customId: storageId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');

      document.getElementById('qr-block').style.display = 'none';
      const codeBlock = document.getElementById('code-block');
      document.getElementById('digit-value').innerText = digits.slice(0, 3) + ' ' + digits.slice(3);
      codeBlock.style.display = 'block';
    } catch (e) {
      alert(e.message);
    } finally {
      btn.disabled = false;
      btn.innerText = '生成提取码';
    }
  }

  // 4.3 提取 6 位码对应的内容
  async function fetchByCode() {
    const code = document.getElementById('input-code').value.replaceAll(' ', '').trim();
    if (code.length !== 6 || !/^[0-9]+$/.test(code)) {
      return alert('请输入 6 位纯数字提取码');
    }

    const preview = document.getElementById('recv-preview');
    preview.style.color = 'var(--ink-muted)';
    preview.innerText = '正在请求并解密...';

    try {
      const storageId = "code_" + (await sha256(code)).substring(0, 16);
      const res = await fetch('/api/get/' + storageId);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提取失败或已销毁');

      const key = await deriveKeyFromCode(code);
      const text = await decryptText(data.cipherText, key);

      preview.style.color = 'var(--ink)';
      preview.innerText = text;
      counterEl.innerText = text.length + ' 字符';

      const copyBtn = document.getElementById('btn-copy-retrieved');
      copyBtn.style.display = 'inline-flex';
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.innerText = '已自动存入剪贴板';
        setTimeout(() => { copyBtn.innerText = '复制全文'; }, 2000);
      }).catch(() => {});
    } catch (e) {
      preview.style.color = '#ef4444';
      preview.innerText = '提取失败：' + e.message;
    }
  }

  function copyRetrievedText() {
    const text = document.getElementById('recv-preview').innerText;
    navigator.clipboard.writeText(text).then(() => {
      const b = document.getElementById('btn-copy-retrieved');
      b.innerText = '已复制全文';
      setTimeout(() => { b.innerText = '复制全文'; }, 2000);
    });
  }

  function triggerCopy() {
    const content = document.getElementById('rx-content').innerText;
    navigator.clipboard.writeText(content).then(() => {
      if (navigator.vibrate) navigator.vibrate(40);
      const btn = document.getElementById('btn-copy');
      const label = document.getElementById('copy-text');
      btn.classList.add('copied');
      label.innerText = '已复制全文';
      setTimeout(() => {
        btn.classList.remove('copied');
        label.innerText = '复制全文';
      }, 2000);
    });
  }

  // ==========================================
  // 5. 动态二维码文件发送 (桌面端纯前端本地分片轮播)
  // ==========================================
  let selectedFile = null;
  let fileChunks = []; // 存储各个二维码分片字符串
  let fileBroadcastTimer = null;
  let fileBroadcastRunning = false;
  let fileBroadcastIndex = 0;
  let fileQrInstance = null;

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB 限制
  const CHUNK_PAYLOAD_SIZE = 280; // 经基准验证：280 字节 base64 可保持二维码颗粒适中、手机极易识别
  const BROADCAST_INTERVAL_MS = 250; // 4 帧/秒循环播放，兼顾手机摄像头对焦与流畅度

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  // ArrayBuffer 转换为 Base64 (防止超大文件 stack overflow)
  function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
    }
    return btoa(binary);
  }

  function handleFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      alert('文件大小超过 5MB 限制（当前大小：' + formatBytes(file.size) + '），请选择更小的文件。');
      e.target.value = '';
      return;
    }

    // 重置已有播放状态并保留当前文件
    pauseFileBroadcast();
    fileChunks = [];
    fileBroadcastIndex = 0;
    fileQrInstance = null;
    selectedFile = file;

    document.getElementById('file-qr-block').style.display = 'none';
    const target = document.getElementById('file-qr-target');
    if (target) target.innerHTML = '';

    document.getElementById('file-meta-section').style.display = 'block';
    document.getElementById('file-name-label').innerText = file.name;
    document.getElementById('file-size-label').innerText = formatBytes(file.size);
    document.getElementById('btn-file-start').innerText = '开始连续播放';
  }

  async function prepareFileChunks() {
    if (!selectedFile) return false;
    const arrayBuffer = await selectedFile.arrayBuffer();
    const base64Data = bufferToBase64(arrayBuffer);
    
    // 生成一个 6 字符的传输任务唯一 ID
    const transferId = Math.random().toString(36).substring(2, 8);
    const totalChunks = Math.ceil(base64Data.length / CHUNK_PAYLOAD_SIZE);
    
    fileChunks = [];
    for (let i = 0; i < totalChunks; i++) {
      const slice = base64Data.substring(i * CHUNK_PAYLOAD_SIZE, (i + 1) * CHUNK_PAYLOAD_SIZE);
      const chunkObj = {
        v: 1, // 协议版本
        id: transferId, // 传输唯一标识
        n: selectedFile.name, // 文件名
        t: selectedFile.type || 'application/octet-stream', // MIME类型
        s: selectedFile.size, // 文件大小
        i: i + 1, // 当前分片序号 (1-indexed)
        total: totalChunks, // 总分片数
        d: slice // 当前切片 base64 数据
      };
      fileChunks.push(JSON.stringify(chunkObj));
    }
    return true;
  }

  async function toggleFileBroadcast() {
    if (!selectedFile) return;

    if (fileBroadcastRunning) {
      // 暂停广播
      pauseFileBroadcast();
    } else {
      // 开始/恢复广播
      if (fileChunks.length === 0) {
        document.getElementById('btn-file-start').disabled = true;
        document.getElementById('btn-file-start').innerText = '正在分片编码...';
        await prepareFileChunks();
        document.getElementById('btn-file-start').disabled = false;
      }
      startFileBroadcast();
    }
  }

  function startFileBroadcast() {
    fileBroadcastRunning = true;
    document.getElementById('btn-file-start').innerText = '暂停播放';
    document.getElementById('file-qr-block').style.display = 'block';

    const target = document.getElementById('file-qr-target');
    if (!fileQrInstance) {
      target.innerHTML = '';
      fileQrInstance = new QRCode(target, {
        text: fileChunks[fileBroadcastIndex] || 'ready',
        width: 200,
        height: 200,
        correctLevel: QRCode.CorrectLevel.L // 使用低纠错率保证稀疏易识别
      });
    }

    renderCurrentFileChunk();
    fileBroadcastTimer = setInterval(() => {
      fileBroadcastIndex = (fileBroadcastIndex + 1) % fileChunks.length;
      renderCurrentFileChunk();
    }, BROADCAST_INTERVAL_MS);
  }

  function renderCurrentFileChunk() {
    if (!fileChunks || fileChunks.length === 0) return;
    const chunkStr = fileChunks[fileBroadcastIndex];
    if (fileQrInstance) {
      fileQrInstance.makeCode(chunkStr);
    }
    const current = fileBroadcastIndex + 1;
    const total = fileChunks.length;
    const pct = Math.round((current / total) * 100);
    document.getElementById('file-progress-label').innerText = 
      '正在循环播放: 第 ' + current + ' / ' + total + ' 帧 (' + pct + '%) · 手机对准扫码';
    document.getElementById('file-progress-bar').style.width = pct + '%';
  }

  function pauseFileBroadcast() {
    fileBroadcastRunning = false;
    if (fileBroadcastTimer) {
      clearInterval(fileBroadcastTimer);
      fileBroadcastTimer = null;
    }
    const btn = document.getElementById('btn-file-start');
    if (btn) btn.innerText = '继续播放';
    const label = document.getElementById('file-progress-label');
    if (label) label.innerText = '播放已暂停 (第 ' + (fileBroadcastIndex + 1) + ' / ' + fileChunks.length + ' 帧)';
  }

  function cancelFileBroadcast() {
    pauseFileBroadcast();
    selectedFile = null;
    fileChunks = [];
    fileBroadcastIndex = 0;
    fileQrInstance = null;
    document.getElementById('file-input').value = '';
    document.getElementById('file-meta-section').style.display = 'none';
    document.getElementById('file-qr-block').style.display = 'none';
    const target = document.getElementById('file-qr-target');
    if (target) target.innerHTML = '';
  }

  // ==========================================
  // 6. 扫码接收文件 (手机端摄像头扫码收集重组)
  // ==========================================
  let cameraStream = null;
  let cameraScanning = false;
  let cameraScanAnimId = null;

  // 接收状态机
  let rxTransferId = null;
  let rxFileName = '';
  let rxFileType = '';
  let rxFileSize = 0;
  let rxTotalChunks = 0;
  let rxChunksMap = new Map(); // 存储已收到的分片 Map<index, base64Slice>

  function setRxFileNotice(msg, type) {
    const el = document.getElementById('rx-file-notice');
    if (!el) return;
    if (!msg) {
      el.style.display = 'none';
      return;
    }
    el.className = 'notice-banner ' + (type || 'danger');
    el.innerText = msg;
    el.style.display = 'block';
  }

  async function toggleCameraReceiver() {
    if (cameraScanning) {
      stopCameraReceiver();
    } else {
      await startCameraReceiver();
    }
  }

  async function startCameraReceiver() {
    setRxFileNotice('', '');
    document.getElementById('rx-file-download-box').style.display = 'none';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setRxFileNotice('当前浏览器环境不支持摄像头 API，或者未通过 HTTPS 访问。', 'danger');
      return;
    }

    try {
      // 优先启用手机后置环境摄像头
      const constraints = {
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      };
      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      const video = document.getElementById('camera-video');
      video.srcObject = cameraStream;
      video.setAttribute('playsinline', 'true');
      await video.play();

      document.getElementById('camera-box').style.display = 'block';
      document.getElementById('btn-camera-toggle').innerText = '停止扫描';
      document.getElementById('btn-rx-file-reset').style.display = 'inline-flex';
      cameraScanning = true;

      scanVideoFrame();
    } catch (err) {
      console.error(err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setRxFileNotice('摄像头权限被拒绝，请在浏览器权限设置中允许访问摄像头后重试。', 'danger');
      } else {
        setRxFileNotice('无法打开摄像头：' + (err.message || '未知错误'), 'danger');
      }
      stopCameraReceiver();
    }
  }

  function scanVideoFrame() {
    if (!cameraScanning) return;
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (window.jsQR) {
        const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });
        if (code && code.data) {
          processScannedQrData(code.data);
        }
      }
    }
    cameraScanAnimId = requestAnimationFrame(scanVideoFrame);
  }

  function processScannedQrData(dataStr) {
    try {
      const chunk = JSON.parse(dataStr);
      // 校验分片数据协议标识
      if (chunk.v !== 1 || !chunk.id || !chunk.total || !chunk.i || !chunk.d) {
        return;
      }

      // 如果扫描到了全新的传输任务，自动重置旧任务
      if (rxTransferId !== chunk.id) {
        rxTransferId = chunk.id;
        rxFileName = chunk.n || 'received_file';
        rxFileType = chunk.t || 'application/octet-stream';
        rxFileSize = chunk.s || 0;
        rxTotalChunks = chunk.total;
        rxChunksMap.clear();

        document.getElementById('rx-file-meta').style.display = 'block';
        document.getElementById('rx-file-name').innerText = rxFileName + ' (' + formatBytes(rxFileSize) + ')';
      }

      // 去重保存该分片
      const chunkIdx = chunk.i;
      if (!rxChunksMap.has(chunkIdx)) {
        rxChunksMap.set(chunkIdx, chunk.d);
        if (navigator.vibrate) navigator.vibrate(25); // 捕获新分片微弱震动反馈
      }

      // 更新接收进度
      const receivedCount = rxChunksMap.size;
      const pct = Math.round((receivedCount / rxTotalChunks) * 100);
      document.getElementById('rx-file-status').innerText = 
        receivedCount + ' / ' + rxTotalChunks + ' 片 (' + pct + '%)';
      document.getElementById('rx-file-progress-bar').style.width = pct + '%';

      // 检查是否所有切片已完整收齐
      if (receivedCount === rxTotalChunks) {
        assembleAndCompleteFile();
      }
    } catch (e) {
      // 忽略非文件协议的普通二维码
    }
  }

  function assembleAndCompleteFile() {
    stopCameraReceiver();

    try {
      // 按分片序号 1 ~ total 顺序重组 Base64
      let fullBase64 = '';
      for (let i = 1; i <= rxTotalChunks; i++) {
        const slice = rxChunksMap.get(i);
        if (!slice) {
          throw new Error('分片数据不完整，缺少第 ' + i + ' 片');
        }
        fullBase64 += slice;
      }

      // 将 Base64 还原为二进制 Uint8Array
      const binaryString = atob(fullBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: rxFileType });
      const downloadUrl = URL.createObjectURL(blob);

      const downloadLink = document.getElementById('rx-download-link');
      downloadLink.href = downloadUrl;
      downloadLink.download = rxFileName;
      downloadLink.innerText = '📥 点击保存文件：' + rxFileName + ' (' + formatBytes(blob.size) + ')';

      document.getElementById('rx-file-download-box').style.display = 'block';
      setRxFileNotice('🎉 文件已完整接收重组成功！请点击下方按钮保存。', 'success');
      if (navigator.vibrate) navigator.vibrate([60, 50, 60]);
    } catch (err) {
      console.error(err);
      setRxFileNotice('文件重组失败：' + (err.message || '数据解析错误'), 'danger');
    }
  }

  function stopCameraStream() {
    cameraScanning = false;
    if (cameraScanAnimId) {
      cancelAnimationFrame(cameraScanAnimId);
      cameraScanAnimId = null;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    const video = document.getElementById('camera-video');
    if (video) video.srcObject = null;
  }

  function stopCameraReceiver() {
    stopCameraStream();
    document.getElementById('camera-box').style.display = 'none';
    const btn = document.getElementById('btn-camera-toggle');
    if (btn) btn.innerText = '开启摄像头扫码';
  }

  function resetFileReceiver() {
    stopCameraReceiver();
    rxTransferId = null;
    rxFileName = '';
    rxFileType = '';
    rxFileSize = 0;
    rxTotalChunks = 0;
    rxChunksMap.clear();
    setRxFileNotice('', '');
    document.getElementById('rx-file-meta').style.display = 'none';
    document.getElementById('rx-file-download-box').style.display = 'none';
    document.getElementById('btn-rx-file-reset').style.display = 'none';
  }

  // ==========================================
  // 7. 页面初始化加载与路由检测
  // ==========================================
  window.addEventListener('DOMContentLoaded', async () => {
    // 初始化设备模式与默认展示面板
    const mode = getActiveDeviceMode();
    updateDeviceButton(mode);

    // 检查是否有文本二维码 URL Hash 直达
    const hash = window.location.hash.substring(1);
    if (hash) {
      const query = new URLSearchParams(hash);
      const id = query.get('i');
      const keyStr = query.get('k');

      if (id && keyStr) {
        document.getElementById('nav-tabs').style.display = 'none';
        document.getElementById('panel-sender').style.display = 'none';
        document.getElementById('panel-file-sender').style.display = 'none';
        document.getElementById('panel-retriever').style.display = 'none';
        document.getElementById('panel-file-receiver').style.display = 'none';
        document.getElementById('panel-receiver').style.display = 'block';
        const rxContent = document.getElementById('rx-content');

        try {
          const res = await fetch('/api/get/' + id);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '已失效');

          const key = await restoreKey(keyStr);
          const text = await decryptText(data.cipherText, key);

          rxContent.innerText = text;
          counterEl.innerText = text.length + ' 字符';
        } catch (err) {
          rxContent.innerText = '内容读取失败：' + err.message;
        }
        return;
      }
    }

    // 正常进入时根据设备类型设置默认面板
    setDefaultTabForMode(mode);
  });
</script>
</body>
</html>`;

    return new Response(html, {
      headers: { "content-type": "text/html;charset=UTF-8" }
    });
  }
};
