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
      padding: 24px 16px;
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
      margin-bottom: 16px;
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
    }

    .tab-group {
      display: inline-flex;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 2px;
    }

    .tab-btn {
      background: transparent;
      border: none;
      color: var(--ink-muted);
      font-size: 13px;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
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
      gap: 10px;
    }

    .brand-meta {
      font-family: var(--mono);
      font-size: 12px;
      color: var(--ink-muted);
    }

    .theme-toggle {
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
    }

    .theme-toggle:hover {
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
      height: 200px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--ink);
      font-family: var(--mono);
      font-size: 13px;
      line-height: 1.6;
      padding: 14px;
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
      gap: 12px;
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
    }

    .btn-action {
      background: var(--accent);
      color: #fff;
      font-size: 14px;
      padding: 10px 18px;
      flex: 1;
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
      padding: 9px 14px;
    }

    .btn-subtle:hover {
      background: var(--surface-raised);
      color: var(--ink);
    }

    /* 二维码区域 */
    .qr-region {
      display: none;
      margin-top: 20px;
      padding-top: 20px;
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
      margin-top: 12px;
      font-family: var(--mono);
      font-size: 12px;
      color: var(--ink-muted);
    }

    /* 6 位提取码卡片 */
    .code-display-card {
      display: none;
      margin-top: 20px;
      padding: 20px;
      background: var(--surface-raised);
      border: 1px dashed var(--border-focus);
      border-radius: 10px;
      text-align: center;
    }

    .code-digits {
      font-family: var(--mono);
      font-size: 38px;
      font-weight: 700;
      letter-spacing: 8px;
      color: var(--accent);
      margin: 10px 0;
    }

    .code-hint {
      font-size: 12px;
      color: var(--ink-muted);
    }

    /* 接收输入框与扫码引导 */
    .retrieve-box {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
    }

    .code-input {
      flex: 1;
      height: 48px;
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
      height: 48px;
      padding: 0 20px;
      font-size: 15px;
      background: var(--accent);
      color: #fff;
    }

    /* 输入码界面的手机直达扫码区 */
    .phone-entry-guide {
      margin-top: 20px;
      padding-top: 20px;
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

    /* 手机端接收视图 */
    .receiver-deck {
      display: none;
    }

    .btn-huge-copy {
      width: 100%;
      background: var(--accent);
      color: #ffffff;
      font-size: 18px;
      font-weight: 600;
      padding: 18px 24px;
      border-radius: 10px;
      margin-bottom: 16px;
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
      padding: 16px;
      max-height: 420px;
      overflow-y: auto;
      font-family: var(--sans);
      font-size: 14px;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--ink);
      transition: background-color 0.2s ease;
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
  <!-- 顶部导航栏 -->
  <div class="top-bar">
    <div class="tab-group" id="nav-tabs">
      <button class="tab-btn active" id="tab-send" onclick="switchTab('send')">发送文本</button>
      <button class="tab-btn" id="tab-recv" onclick="switchTab('recv')">输入码提取</button>
    </div>

    <div class="top-actions">
      <span class="brand-meta" id="status-counter">0 字符</span>
      <button class="theme-toggle" id="theme-btn" onclick="cycleTheme()">自动</button>
    </div>
  </div>

  <!-- 面板 1: 发送端 (支持生成二维码或生成 6 位提取码) -->
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

  <!-- 面板 2: 输入提取码接收端 (Mac 接收手机发送过来的长文本) -->
  <div class="panel" id="panel-retriever" style="display:none;">
    <div class="retrieve-box">
      <input type="text" class="code-input" id="input-code" maxlength="6" placeholder="6 位提取码" onkeydown="if(event.key==='Enter')fetchByCode()" />
      <button class="btn btn-retrieve" onclick="fetchByCode()">提取文本</button>
    </div>

    <div class="content-viewport" id="recv-preview" style="min-height: 120px; color: var(--ink-muted);">
      输入手机上显示的 6 位提取码，点击提取即可在本地解密...
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

  <!-- 面板 3: 手机端扫码直达接收视图 (通过二维码 URL 锚点进入) -->
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
    <span>端到端 AES-256 加密</span>
    <span>阅后即焚 · 5 分钟硬过期</span>
  </div>
</div>

<script>
  // 主题模式控制
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

  // 鲁棒获取当前页面的规范入口 URL
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

  // 渲染输入码面板底部的“手机扫码直达入口”二维码
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

  // 标签切换
  function switchTab(tab) {
    const isSend = tab === 'send';
    document.getElementById('tab-send').classList.toggle('active', isSend);
    document.getElementById('tab-recv').classList.toggle('active', !isSend);
    document.getElementById('panel-sender').style.display = isSend ? 'block' : 'none';
    document.getElementById('panel-retriever').style.display = isSend ? 'none' : 'block';
    if (!isSend) {
      renderEntryQR();
      document.getElementById('input-code').focus();
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

  // Web Crypto 原生加解密算法
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

  // 1. 方式 A：生成扫码二维码 (Mac -> iPhone)
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

  // 2. 方式 B：生成 6 位提取码 (iPhone -> Mac)
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

  // 3. 提取 6 位码对应的内容 (Mac 端执行)
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

  // 扫码页面自动加载
  window.addEventListener('DOMContentLoaded', async () => {
    const hash = window.location.hash.substring(1);
    if (!hash) return;

    const query = new URLSearchParams(hash);
    const id = query.get('i');
    const keyStr = query.get('k');

    if (id && keyStr) {
      document.getElementById('nav-tabs').style.display = 'none';
      document.getElementById('panel-sender').style.display = 'none';
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
    }
  });
</script>
</body>
</html>`;

    return new Response(html, {
      headers: { "content-type": "text/html;charset=UTF-8" }
    });
  }
};
