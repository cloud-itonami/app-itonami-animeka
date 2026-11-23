<script lang="ts">
  import { onMount } from 'svelte';
  import Dashboard from './views/Dashboard.svelte';
  import PipelineBoard from './views/PipelineBoard.svelte';
  import CutDetail from './views/CutDetail.svelte';
  import CutList from './views/CutList.svelte';
  import Gallery from './views/Gallery.svelte';
  import ScriptView from './views/ScriptView.svelte';
  import ReviewRoom from './views/ReviewRoom.svelte';
  import {
    DEFAULT_XRPC_BASE_URL,
    normalizeXrpcBase,
    readStoredXrpcBase,
    storeXrpcBase,
    xrpcBase,
  } from './xrpc';

  type View = 'dashboard' | 'pipeline' | 'cut' | 'cuts' | 'gallery' | 'script' | 'review';
  let view: View = $state('dashboard');
  let context: Record<string, string> = $state({});

  // ── Connection (XRPC base) settings ──────────────────────────────────
  let showSettings = $state(false);
  let baseInput = $state('');
  let baseError = $state('');
  let effectiveBase = $state(xrpcBase());

  function refreshBase() {
    effectiveBase = xrpcBase();
    baseInput = readStoredXrpcBase() ?? '';
  }

  function applyBase() {
    baseError = '';
    if (!baseInput.trim()) {
      storeXrpcBase('');
      refreshBase();
      return;
    }
    if (!normalizeXrpcBase(baseInput)) {
      baseError = 'https://… または http://… の URL を入れてください。';
      return;
    }
    storeXrpcBase(baseInput);
    refreshBase();
  }

  function resetBase() {
    storeXrpcBase('');
    baseError = '';
    refreshBase();
  }

  function parsePath() {
    const { pathname } = window.location;
    // /at/{authority}/com.etzhayyim.animeka.cut/{rkey} → cut detail
    const atMatch = pathname.match(/^\/at\/([^/]+)\/com\.etzhayyim\.apps\.animeka\.([^/]+)\/([^/]+)$/);
    if (atMatch) {
      const [, authority, collection, rkey] = atMatch;
      if (collection === 'cut') {
        view = 'cut';
        context = { authority, rkey };
        return;
      }
    }
    if (pathname.startsWith('/episodes/') && pathname.endsWith('/script')) {
      view = 'script';
      context = { episodeId: pathname.split('/')[2] };
      return;
    }
    if (pathname.startsWith('/episodes/') && pathname.endsWith('/review')) {
      view = 'review';
      context = { episodeId: pathname.split('/')[2] };
      return;
    }
    if (pathname.startsWith('/episodes/')) {
      view = 'pipeline';
      context = { episodeId: pathname.split('/')[2] };
      return;
    }
    if (pathname === '/cuts' || pathname.startsWith('/cuts/')) {
      view = 'cuts';
      context = {};
      return;
    }
    if (pathname === '/gallery' || pathname.startsWith('/gallery/')) {
      view = 'gallery';
      context = {};
      return;
    }
    if (pathname === '/script' || pathname.startsWith('/script/')) {
      view = 'script';
      context = { episodeId: 'latest' };
      return;
    }
    if (pathname === '/review' || pathname.startsWith('/review/')) {
      view = 'review';
      context = { episodeId: 'latest' };
      return;
    }
    if (pathname.startsWith('/works/')) {
      view = 'dashboard';
      context = { workId: pathname.split('/')[2] };
      return;
    }
    view = 'dashboard';
    context = {};
  }

  function go(path: string) {
    window.history.pushState({}, '', path);
    parsePath();
  }

  onMount(() => {
    parsePath();
    refreshBase();
    window.addEventListener('popstate', parsePath);
  });
</script>

<svelte:head>
  <title>Animeka — Team Anime Production</title>
  <meta
    name="description"
    content="Animeka — 12-stage anime production progress viewer (cut list, pipeline board, episode timeline). Read-only board; graph execution stays on the Worker / local server."
  />
</svelte:head>

<div class="shell">
  <header class="topbar">
    <button class="brand" onclick={() => go('/')}>🎬 Animeka</button>
    <span class="topbar-title" aria-hidden="true">制作進行</span>
    <button
      class="gear"
      class:active={showSettings}
      onclick={() => { showSettings = !showSettings; if (showSettings) refreshBase(); }}
      aria-expanded={showSettings}
      title="サーバー接続設定"
    >⚙️</button>
  </header>

  {#if showSettings}
    <section class="settings" aria-label="サーバー接続設定">
      <div class="settings-row">
        <span class="muted">API</span>
        <code>{effectiveBase}</code>
      </div>
      <div class="settings-row">
        <span class="muted">既定</span>
        <code>{DEFAULT_XRPC_BASE_URL}</code>
      </div>
      <label class="settings-edit">
        <span class="muted">上書き（空＝既定）</span>
        <input
          bind:value={baseInput}
          inputmode="url"
          placeholder="https://animeka.etzhayyim.com/xrpc"
          aria-label="XRPC ベース URL"
        />
      </label>
      {#if baseError}<p class="err">{baseError}</p>{/if}
      <div class="settings-actions">
        <button class="ctrl" onclick={applyBase}>保存</button>
        <button class="ctrl" onclick={resetBase}>既定に戻す</button>
      </div>
      <p class="muted xs hint">
        開発用: ローカルの <code>lg-clj</code>（<code>http://127.0.0.1:2027</code>）等は
        Tauri / WebView の cleartext 制限でブロックされる場合があります。
        既定の Worker（HTTPS）で動作確認してください。
      </p>
    </section>
  {/if}

  <main class="stage">
    {#if view === 'dashboard'}
      <Dashboard workId={context.workId} {go} />
    {:else if view === 'pipeline'}
      <PipelineBoard episodeId={context.episodeId} {go} />
    {:else if view === 'cut'}
      <CutDetail authority={context.authority} rkey={context.rkey} />
    {:else if view === 'cuts'}
      <CutList {go} />
    {:else if view === 'gallery'}
      <Gallery />
    {:else if view === 'script'}
      <ScriptView episodeId={context.episodeId} />
    {:else if view === 'review'}
      <ReviewRoom episodeId={context.episodeId} />
    {/if}
  </main>

  <nav class="tabbar" aria-label="制作進行">
    <button class:active={view === 'dashboard'} onclick={() => go('/')}>
      <span class="tab-ico">📚</span><span>作品</span>
    </button>
    <button class:active={view === 'pipeline'} onclick={() => go('/episodes/latest')}>
      <span class="tab-ico">▦</span><span>工程</span>
    </button>
    <button class:active={view === 'cut' || view === 'cuts'} onclick={() => go('/cuts')}>
      <span class="tab-ico">✂</span><span>カット</span>
    </button>
    <button class:active={view === 'gallery'} onclick={() => go('/gallery')}>
      <span class="tab-ico">🖼</span><span>画廊</span>
    </button>
    <button class:active={view === 'script'} onclick={() => go('/episodes/latest/script')}>
      <span class="tab-ico">📝</span><span>脚本</span>
    </button>
    <button class:active={view === 'review'} onclick={() => go('/episodes/latest/review')}>
      <span class="tab-ico">⏳</span><span>試写</span>
    </button>
  </nav>

  <footer class="footbar">did:web:animeka.etzhayyim.com · 読み物面（Worker / lg-clj 側で実行）</footer>
</div>

<style>
  :global(html, body, #app) {
    margin: 0;
    width: 100%;
    height: 100%;
    background: #0c0e14;
    color: #e6e8ee;
    font: 14px/1.4 -apple-system, 'Hiragino Sans', system-ui, sans-serif;
  }
  .shell {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    max-width: 560px;
    margin: 0 auto;
    background: #0c0e14;
    border-left: 1px solid #22252d;
    border-right: 1px solid #22252d;
  }
  @media (min-width: 561px) {
    .shell { box-shadow: 0 0 40px rgba(0, 0, 0, .35); }
  }
  .topbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px calc(8px);
    background: #111318;
    border-bottom: 1px solid #22252d;
    padding-top: max(8px, env(safe-area-inset-top));
  }
  .brand {
    font-size: 16px;
    font-weight: 700;
    background: none;
    border: 0;
    color: #e6e8ee;
    cursor: pointer;
    padding: 4px 2px;
    white-space: nowrap;
  }
  .topbar-title { color: #8a8f9c; font-size: 12px; }
  .gear {
    margin-left: auto;
    background: #1a1d26;
    border: 1px solid #2a2e3a;
    color: #d0d4e0;
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 15px;
  }
  .gear.active { border-color: #5ab0ff; color: #fff; }
  .settings {
    flex-shrink: 0;
    background: #15181f;
    border-bottom: 1px solid #22252d;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 40dvh;
    overflow: auto;
  }
  .settings-row { display: flex; gap: 8px; align-items: baseline; font-size: 12px; min-width: 0; }
  .settings-row code { overflow-wrap: anywhere; color: #a0d8ff; font-size: 11px; }
  .muted { color: #6a6e7a; }
  .xs { font-size: 11px; }
  .settings-edit { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .settings-edit input {
    background: #0c0e14;
    border: 1px solid #2a2e3a;
    border-radius: 6px;
    color: #e6e8ee;
    padding: 8px;
    font: inherit;
    font-size: 12px;
  }
  .err { color: #ff8a8a; font-size: 12px; margin: 0; }
  .hint { margin: 0; line-height: 1.5; }
  .hint code { color: #a0a4b0; }
  .settings-actions { display: flex; gap: 8px; }
  .ctrl {
    background: #1d2430;
    border: 1px solid #2a2e3a;
    color: #d0d4e0;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }
  .ctrl:hover { border-color: #5ab0ff; color: #fff; }
  .stage {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
  }
  .tabbar {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    background: #111318;
    border-top: 1px solid #22252d;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .tabbar button {
    background: none;
    border: 0;
    color: #8a8f9c;
    padding: 7px 2px 5px;
    cursor: pointer;
    font-size: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    min-height: 48px;
  }
  .tabbar button.active { color: #fff; }
  .tabbar button.active .tab-ico { color: #5ab0ff; }
  .tab-ico { font-size: 18px; line-height: 1.2; }
  .footbar {
    flex-shrink: 0;
    text-align: center;
    padding: 4px 8px calc(4px + env(safe-area-inset-bottom));
    font-size: 10px;
    color: #555866;
    background: #111318;
    border-top: 1px solid #1c1f28;
  }
</style>
