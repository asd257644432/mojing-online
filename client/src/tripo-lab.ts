import { TRIPO_WARRIOR_DIRECTORY, TRIPO_WARRIOR_MODEL, TRIPO_WARRIOR_TIMEOUT_MS } from './tripo-warrior-asset';

const message = document.querySelector<HTMLDivElement>('#message')!;
const status = document.querySelector<HTMLHeadingElement>('#status')!;
const detail = document.querySelector<HTMLParagraphElement>('#status-detail')!;
const retry = document.querySelector<HTMLButtonElement>('#retry')!;
const lifetime = new AbortController();
let loading = false;
let loaded = false;

async function loadModel() {
  if (loading || loaded || lifetime.signal.aborted) return;
  loading = true;
  retry.hidden = true;
  status.textContent = '正在检查试样';
  detail.textContent = '等待读取 Tripo 导出的 GLB 文件。';
  try {
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(TRIPO_WARRIOR_TIMEOUT_MS)]);
    const response = await fetch(TRIPO_WARRIOR_MODEL, { signal, cache: 'no-cache' });
    if (response.status === 404 || response.ok && response.headers.get('content-type')?.includes('text/html')) {
      status.textContent = '尚未生成模型';
      detail.textContent = '模型准备好后，点击重新加载即可查看。';
      return;
    }
    if (!response.ok) throw new Error(`文件请求失败（HTTP ${response.status}）。`);
    const data = await response.arrayBuffer();
    if (data.byteLength < 12 || new DataView(data).getUint32(0, true) !== 0x46546c67) {
      throw new Error('试样文件不是有效的 GLB。');
    }
    if (lifetime.signal.aborted) return;
    const { mountTripoViewer } = await import('./tripo-viewer');
    if (lifetime.signal.aborted) return;
    await mountTripoViewer(data, TRIPO_WARRIOR_DIRECTORY, lifetime.signal);
    if (lifetime.signal.aborted) return;
    loaded = true;
    message.hidden = true;
  } catch (error) {
    if (lifetime.signal.aborted) return;
    status.textContent = '模型加载失败';
    detail.textContent = error instanceof Error
      ? error.name === 'TimeoutError' ? '读取模型超时，请重新加载。' : error.message
      : '暂时无法读取试样。';
  } finally {
    loading = false;
    retry.hidden = loaded;
  }
}

retry.addEventListener('click', () => void loadModel(), { signal: lifetime.signal });
window.addEventListener('pagehide', event => {
  if (!event.persisted) lifetime.abort();
}, { signal: lifetime.signal });
void loadModel();
