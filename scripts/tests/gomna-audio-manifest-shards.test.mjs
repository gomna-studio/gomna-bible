/**
 * Unit tests for book-level multilingual manifest shard loading.
 * Uses mock fetch + in-memory base manifest. Never touches ops audio/manifests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SHARD_JS = path.join(ROOT, 'js/gomna-audio-manifest-shards.js');
const FIXTURE_EN = path.join(
  __dirname,
  'fixtures/manifest-shards/en-US/genesis.json',
);
const FIXTURE_JA = path.join(
  __dirname,
  'fixtures/manifest-shards/ja-JP/genesis.json',
);

function loadShardApi(fetchImpl) {
  const config = {
    MANIFEST_PATH: '/audio/audio-manifest.json',
    MANIFEST_SHARD_ROOT: '/audio/manifests',
    manifestData: {
      totalAudios: 2,
      audios: {
        'genesis.001.021.bible': {
          id: 'genesis.001.021.bible',
          bookId: 'genesis',
          language: 'ko-KR',
          chapter: 1,
          verse: 21,
          type: 'bible',
          filePath: 'https://example.test/bible.mp3',
          duration: 10,
          fileSize: 1000,
          status: 'published',
        },
        'genesis.001.021.history': {
          id: 'genesis.001.021.history',
          bookId: 'genesis',
          language: 'ko-KR',
          chapter: 1,
          verse: 21,
          type: 'history',
          filePath: 'https://example.test/ko-history.mp3',
          duration: 20,
          fileSize: 2000,
          status: 'published',
        },
      },
    },
    manifestLoadStatus: 'loaded',
  };

  const sandbox = {
    window: {
      GOMNA_AUDIO_CONFIG: config,
      dispatchEvent() {},
      CustomEvent: function CustomEvent(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      },
    },
    fetch: fetchImpl,
    console,
  };
  sandbox.window.fetch = fetchImpl;
  sandbox.self = sandbox.window;
  sandbox.globalThis = sandbox;

  const code = fs.readFileSync(SHARD_JS, 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'gomna-audio-manifest-shards.js' });

  return {
    api: sandbox.window.GOMNA_AUDIO_MANIFEST_SHARDS,
    config: sandbox.window.GOMNA_AUDIO_CONFIG,
    window: sandbox.window,
  };
}

function makeFetchTracker(handler) {
  let calls = 0;
  const urls = [];
  const fetchImpl = async (url, init) => {
    calls += 1;
    urls.push(String(url));
    return handler(String(url), init, calls);
  };
  return {
    fetchImpl,
    get calls() {
      return calls;
    },
    get urls() {
      return urls.slice();
    },
  };
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      if (typeof data === 'string') {
        return JSON.parse(data);
      }
      return data;
    },
    async text() {
      return typeof data === 'string' ? data : JSON.stringify(data);
    },
  };
}

function loadFixture(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('KO requests never fetch shards', async () => {
  const tracker = makeFetchTracker(async () => {
    throw new Error('should not fetch');
  });
  const { api } = loadShardApi(tracker.fetchImpl);
  const ko = await api.ensureBookManifestShard('ko-KR', 'genesis');
  const koShort = await api.ensureBookManifestShard('ko', 'genesis');
  assert.equal(ko.skipped, true);
  assert.equal(koShort.skipped, true);
  assert.equal(tracker.calls, 0);
});

test('EN genesis loads shard once; JA genesis loads once', async () => {
  const enDoc = loadFixture(FIXTURE_EN);
  const jaDoc = loadFixture(FIXTURE_JA);
  const tracker = makeFetchTracker(async (url) => {
    if (url.endsWith('/audio/manifests/en-US/genesis.json')) {
      return jsonResponse(enDoc);
    }
    if (url.endsWith('/audio/manifests/ja-JP/genesis.json')) {
      return jsonResponse(jaDoc);
    }
    return jsonResponse({}, 404);
  });
  const { api, config } = loadShardApi(tracker.fetchImpl);

  const en1 = await api.ensureBookManifestShard('en-US', 'genesis');
  const en2 = await api.ensureBookManifestShard('en-US', 'genesis');
  assert.equal(en1.ok, true);
  assert.equal(en1.fetched, true);
  assert.equal(en1.ok, en2.ok);
  assert.equal(tracker.calls, 1);

  const ja1 = await api.ensureBookManifestShard('ja-JP', 'genesis');
  const ja2 = await api.ensureBookManifestShard('ja-JP', 'genesis');
  assert.equal(ja1.ok, true);
  assert.equal(tracker.calls, 2);
  assert.equal(ja1.ok, ja2.ok);

  assert.equal(Object.keys(enDoc.audios).length, 9);
  assert.equal(Object.keys(jaDoc.audios).length, 9);
  for (const id of Object.keys(enDoc.audios)) {
    assert.ok(config.manifestData.audios[id], `missing merged ${id}`);
  }
  for (const id of Object.keys(jaDoc.audios)) {
    assert.ok(config.manifestData.audios[id], `missing merged ${id}`);
  }
});

test('concurrent shard requests share one fetch', async () => {
  const enDoc = loadFixture(FIXTURE_EN);
  let resolveFetch;
  const gate = new Promise((resolve) => {
    resolveFetch = resolve;
  });
  const tracker = makeFetchTracker(async () => {
    await gate;
    return jsonResponse(enDoc);
  });
  const { api } = loadShardApi(tracker.fetchImpl);
  const p1 = api.ensureBookManifestShard('en-US', 'genesis');
  const p2 = api.ensureBookManifestShard('en-US', 'genesis');
  const p3 = api.ensureBookManifestShard('en-US', 'genesis');
  resolveFetch();
  const results = await Promise.all([p1, p2, p3]);
  assert.equal(tracker.calls, 1);
  assert.ok(results.every((item) => item.ok));
});

test('identical existing entries stay unchanged; conflicts are not overwritten', async () => {
  const enDoc = loadFixture(FIXTURE_EN);
  const sampleId = Object.keys(enDoc.audios)[0];
  const tracker = makeFetchTracker(async () => jsonResponse(enDoc));
  const { api, config } = loadShardApi(tracker.fetchImpl);

  // Seed identical entry before merge.
  config.manifestData.audios[sampleId] = structuredClone(enDoc.audios[sampleId]);
  const first = await api.ensureBookManifestShard('en-US', 'genesis');
  assert.equal(first.merge.unchanged >= 1, true);

  // Force conflict on reload.
  config._manifestShardState.cache = Object.create(null);
  const conflicting = structuredClone(enDoc);
  conflicting.audios[sampleId] = {
    ...conflicting.audios[sampleId],
    filePath: 'https://evil.example/conflict.mp3',
    fileSize: 1,
  };
  const conflictTracker = makeFetchTracker(async () => jsonResponse(conflicting));
  const conflictCtx = loadShardApi(conflictTracker.fetchImpl);
  conflictCtx.config.manifestData.audios[sampleId] = structuredClone(
    enDoc.audios[sampleId],
  );
  const conflicted = await conflictCtx.api.ensureBookManifestShard(
    'en-US',
    'genesis',
    { forceReload: true },
  );
  assert.ok(conflicted.merge.conflicts.length >= 1);
  assert.equal(
    conflictCtx.config.manifestData.audios[sampleId].filePath,
    enDoc.audios[sampleId].filePath,
  );
});

test('404 / corrupt JSON / network errors fallback without throwing', async () => {
  const cases = [
    {
      name: '404',
      fetchImpl: async () => jsonResponse({}, 404),
      reason: 'shard_404',
    },
    {
      name: 'corrupt',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          throw new SyntaxError('Unexpected token');
        },
      }),
      reason: 'shard_corrupt',
    },
    {
      name: 'network',
      fetchImpl: async () => {
        throw new Error('network down');
      },
      reason: 'shard_network_error',
    },
  ];

  for (const item of cases) {
    const { api, config } = loadShardApi(item.fetchImpl);
    const beforeKeys = Object.keys(config.manifestData.audios).sort();
    const result = await api.ensureBookManifestShard('en-US', 'genesis');
    assert.equal(result.ok, false, item.name);
    assert.equal(result.fallback, true, item.name);
    assert.equal(result.reason, item.reason, item.name);
    assert.deepEqual(
      Object.keys(config.manifestData.audios).sort(),
      beforeKeys,
      item.name,
    );
  }
});

test('language switch EN → JA and book switch fetch only the needed shard', async () => {
  const enDoc = loadFixture(FIXTURE_EN);
  const jaDoc = loadFixture(FIXTURE_JA);
  const tracker = makeFetchTracker(async (url) => {
    if (url.includes('/en-US/genesis.json')) return jsonResponse(enDoc);
    if (url.includes('/ja-JP/genesis.json')) return jsonResponse(jaDoc);
    if (url.includes('/en-US/exodus.json')) {
      return jsonResponse({
        schemaVersion: 1,
        locale: 'en-US',
        bookId: 'exodus',
        audios: {
          'exodus.001.001.history.en-US': {
            id: 'exodus.001.001.history.en-US',
            bookId: 'exodus',
            language: 'en-US',
            chapter: 1,
            verse: 1,
            type: 'history',
            filePath: 'https://example.test/exodus.mp3',
            duration: 1,
            fileSize: 10,
            status: 'published',
          },
        },
      });
    }
    return jsonResponse({}, 404);
  });
  const { api } = loadShardApi(tracker.fetchImpl);

  await api.ensureBookManifestShard('en-US', 'genesis');
  assert.equal(tracker.calls, 1);
  await api.ensureBookManifestShard('ja-JP', 'genesis');
  assert.equal(tracker.calls, 2);
  await api.ensureBookManifestShard('en-US', 'exodus');
  assert.equal(tracker.calls, 3);
  // Genesis EN already cached — no extra fetch.
  await api.ensureBookManifestShard('en-US', 'genesis');
  assert.equal(tracker.calls, 3);
});

test('fixture lookup: EN 9 + JA 9 commentary IDs; KO bible still present', async () => {
  const enDoc = loadFixture(FIXTURE_EN);
  const jaDoc = loadFixture(FIXTURE_JA);
  const tracker = makeFetchTracker(async (url) => {
    if (url.includes('/en-US/')) return jsonResponse(enDoc);
    if (url.includes('/ja-JP/')) return jsonResponse(jaDoc);
    throw new Error(`unexpected ${url}`);
  });
  const { api, config } = loadShardApi(tracker.fetchImpl);

  await api.ensureBookManifestShard('en-US', 'genesis');
  await api.ensureBookManifestShard('ja-JP', 'genesis');

  const enIds = Object.keys(enDoc.audios).sort();
  const jaIds = Object.keys(jaDoc.audios).sort();
  assert.equal(enIds.length, 9);
  assert.equal(jaIds.length, 9);

  for (const id of enIds) {
    const entry = api.getManifestEntry(id);
    assert.ok(entry, id);
    assert.equal(entry.status, 'published');
    assert.ok(entry.filePath);
  }
  for (const id of jaIds) {
    const entry = api.getManifestEntry(id);
    assert.ok(entry, id);
    assert.equal(entry.status, 'published');
  }

  // KO existing bible entry remains available without shard dependency.
  assert.ok(config.manifestData.audios['genesis.001.021.bible']);
  assert.equal(
    config.manifestData.audios['genesis.001.021.bible'].language,
    'ko-KR',
  );
});

test('shard failure does not wipe base manifest (reader-safe fallback)', async () => {
  const { api, config } = loadShardApi(async () => {
    throw new Error('boom');
  });
  const koHistory = config.manifestData.audios['genesis.001.021.history'];
  const result = await api.ensureBookManifestShard('en-US', 'genesis');
  assert.equal(result.fallback, true);
  assert.equal(
    config.manifestData.audios['genesis.001.021.history'].filePath,
    koHistory.filePath,
  );
  assert.equal(config.manifestLoadStatus, 'loaded');
});

test('single-manifest path helpers reject Korean shard paths', () => {
  const { api } = loadShardApi(async () => jsonResponse({ audios: {} }));
  assert.throws(() => api.buildBookManifestShardPath('ko-KR', 'genesis'));
  assert.equal(
    api.buildBookManifestShardPath('en-US', 'genesis'),
    '/audio/manifests/en-US/genesis.json',
  );
});

test('ops audio/manifests may exist for book-level EN/JA shards', () => {
  assert.equal(
    fs.existsSync(path.join(ROOT, 'audio/audio-manifest.json')),
    true,
  );
  // Book shards are optional until a publish range is applied; when present
  // they must only contain en-US / ja-JP paths under /audio/manifests.
  const manifestsRoot = path.join(ROOT, 'audio/manifests');
  if (!fs.existsSync(manifestsRoot)) return;
  for (const locale of fs.readdirSync(manifestsRoot)) {
    assert.ok(['en-US', 'ja-JP'].includes(locale), `unexpected locale ${locale}`);
  }
});
