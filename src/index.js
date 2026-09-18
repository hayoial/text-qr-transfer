export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API: 存储加密密文 (5分钟硬过期)
    if (url.pathname === "/api/store" && request.method === "POST") {
      try {
        if (!env.TEXT_KV) {
          return new Response(JSON.stringify({ error: "Storage not configured" }), {
            status: 500,
            headers: { "content-type": "application/json" }
          });
        }
        const body = await request.json();
        const { cipherText } = body;
        if (!cipherText || cipherText.length > 5 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: "Payload exceeds size limit" }), { status: 400 });
        }

        const id = Math.random().toString(36).substring(2, 8);
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
    /* 默认跟随系统亮色/暗色，或由 data-theme 覆盖 */
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

    /* 顶部紧凑工具条 */
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding: 0 4px;
    }

    .brand-title {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--ink);
    }

    .top-actions {
      display: flex;
      align-items: center;
      gap: 12px;
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
      padding: 3px 8px;
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

    /* 输入框 */
    textarea {
      width: 100%;
      height: 220px;
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

    /* 二维码展示区 */
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
  <!-- 发送端 -->
  <div id="view-sender">
    <div class="top-bar">
      <span class="brand-title">中继至 iPhone</span>
      <div class="top-actions">
        <span class="brand-meta" id="char-counter">0 字符</span>
        <button class="theme-toggle" id="theme-btn" onclick="cycleTheme()">自动</button>
      </div>
    </div>

    <div class="panel">
      <textarea id="input-payload" placeholder="在此粘贴长文本..."></textarea>
      
      <div class="control-row">
        <button class="btn btn-subtle" onclick="clearInput()">清空</button>
        <button class="btn btn-action" id="btn-submit" onclick="submitPayload()">生成扫码识别码</button>
      </div>

      <div class="qr-region" id="qr-block">
        <div class="qr-frame" id="qr-target"></div>
        <div class="qr-caption" id="qr-status">低密度短码 · 屏幕扫码已就绪</div>
      </div>
    </div>

    <div class="footnote">
      <span>端到端 AES-256 加密</span>
      <span>5 分钟后自动销毁</span>
    </div>
  </div>

  <!-- 接收端 -->
  <div id="view-receiver" class="receiver-deck">
    <div class="top-bar">
      <span class="brand-title">文本接收就绪</span>
      <div class="top-actions">
        <span class="brand-meta" id="rx-meta">—</span>
        <button class="theme-toggle" id="theme-btn-rx" onclick="cycleTheme()">自动</button>
      </div>
    </div>

    <div class="panel">
      <button class="btn btn-huge-copy" id="btn-copy" onclick="triggerCopy()">
        <span id="copy-text">复制全文</span>
      </button>

      <div class="content-viewport" id="rx-content">正在载入解密...</div>

      <div style="margin-top: 14px; text-align: right;">
        <button class="btn btn-subtle" style="font-size: 12px;" onclick="location.href='/'">发送新文本</button>
      </div>
    </div>

    <div class="footnote">
      <span>云端密文已阅后即焚</span>
      <span>仅留存当前页面</span>
    </div>
  </div>
</div>

<script>
  // 主题模式控制：auto -> dark -> light -> auto
  const THEME_KEY = 'relay_theme_pref';
  function getPreferredTheme() {
    return localStorage.getItem(THEME_KEY) || 'auto';
  }

  function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', mode);
    }
    const label = mode === 'auto' ? '自动' : (mode === 'dark' ? '夜间' : '日间');
    const b1 = document.getElementById('theme-btn');
    const b2 = document.getElementById('theme-btn-rx');
    if (b1) b1.innerText = label;
    if (b2) b2.innerText = label;
  }

  function cycleTheme() {
    const current = getPreferredTheme();
    let next = 'dark';
    if (current === 'auto') next = 'dark';
    else if (current === 'dark') next = 'light';
    else next = 'auto';

    if (next === 'auto') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);

    applyTheme(next);
  }

  // 初始化主题
  applyTheme(getPreferredTheme());

  // 字符计数实时更新
  const inputEl = document.getElementById('input-payload');
  const counterEl = document.getElementById('char-counter');
  inputEl.addEventListener('input', () => {
    counterEl.innerText = inputEl.value.length + ' 字符';
  });

  function clearInput() {
    inputEl.value = '';
    counterEl.innerText = '0 字符';
    document.getElementById('qr-block').style.display = 'none';
    inputEl.focus();
  }

  // Web Crypto AES-256-GCM
  async function generateKey() {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const raw = await crypto.subtle.exportKey("raw", key);
    return {
      key,
      rawStr: btoa(String.fromCharCode(...new Uint8Array(raw))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
    };
  }

  async function restoreKey(str) {
    let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) normalized += '=';
    const bytes = Uint8Array.from(atob(normalized), c => c.charCodeAt(0));
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

  async function submitPayload() {
    const val = inputEl.value.trim();
    if (!val) return;

    const btn = document.getElementById('btn-submit');
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
      if (!res.ok) throw new Error(data.error || '传输请求未完成');

      const accessUrl = window.location.origin + '/#i=' + data.id + '&k=' + rawStr;

      const qrBlock = document.getElementById('qr-block');
      const qrTarget = document.getElementById('qr-target');
      qrTarget.innerHTML = '';

      new QRCode(qrTarget, {
        text: accessUrl,
        width: 180,
        height: 180,
        correctLevel: QRCode.CorrectLevel.M
      });

      document.getElementById('qr-status').innerText = '载荷已加密 · 有效期 5 分钟';
      qrBlock.style.display = 'block';
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.innerText = '生成扫码识别码';
    }
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

  // 接收端解析
  window.addEventListener('DOMContentLoaded', async () => {
    const hash = window.location.hash.substring(1);
    if (!hash) return;

    const query = new URLSearchParams(hash);
    const id = query.get('i');
    const keyStr = query.get('k');

    if (id && keyStr) {
      document.getElementById('view-sender').style.display = 'none';
      document.getElementById('view-receiver').style.display = 'block';
      const rxContent = document.getElementById('rx-content');

      try {
        const res = await fetch('/api/get/' + id);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '已失效');

        const key = await restoreKey(keyStr);
        const text = await decryptText(data.cipherText, key);

        rxContent.innerText = text;
        document.getElementById('rx-meta').innerText = text.length + ' 字符';
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
