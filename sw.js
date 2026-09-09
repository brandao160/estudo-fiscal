/* ==========================================================
   sw.js — service worker do Ciclo de Estudo. Estratégia network-first:
   sempre tenta a rede primeiro (pra nunca servir uma versão desatualizada
   enquanto o app está em desenvolvimento) e só cai pro cache quando
   está offline. Só intercepta arquivos do próprio site (mesma origem);
   CDNs (fontes, ícones, xlsx/pdf.js) e a API local /api/* não passam por aqui.
   ========================================================== */

const CACHE_NAME = 'ciclo-estudo-v2';
const PRECACHE_URLS = [
    'index.html', 'cicloestudo.html', 'cicloestudolivre.html', 'materias.html',
    'planejamento.html', 'resumo.html', 'listacompleta.html', 'conteudoprogramatico.html',
    'questoes.html', 'tempoestudo.html', 'historico.html', 'core.css', 'core.js',
    'profile-keys.js', 'manifest.json', 'icon.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // CDNs (fontes, ícones, libs) ficam de fora
    if (url.pathname.startsWith('/api/')) return; // API local de dev nunca é cacheada

    event.respondWith(
        fetch(req)
            .then((res) => {
                // Só grava no cache respostas de verdade bem-sucedidas — uma resposta de erro
                // (404/500, ex.: durante a janela de um deploy) nunca deve "grudar" no cache e passar
                // a ser servida pra sempre no lugar do arquivo real assim que ele voltar a existir.
                if (res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
                }
                return res;
            })
            .catch(() => caches.match(req).then((cached) => cached || caches.match('index.html')))
    );
});
