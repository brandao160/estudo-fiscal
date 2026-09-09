/* ==========================================================
   core.js — lógica compartilhada entre todas as páginas do
   Ciclo de Estudo (perfis, tema, modelo, geração de ciclo,
   estatísticas, revisão espaçada). Carregado via <script src>
   antes do script específico de cada página.
   ========================================================== */

        // ── PWA: manifest + service worker (instalar como app, funcionar offline) ──
        // resumo.html e planejamento.html não carregam core.js, então têm o mesmo trecho
        // inline no próprio <script> delas.
        (function registerPWA() {
            if (!document.querySelector('link[rel="manifest"]')) {
                const link = document.createElement('link');
                link.rel = 'manifest';
                link.href = 'manifest.json';
                document.head.appendChild(link);
            }
            if (!document.querySelector('meta[name="theme-color"]')) {
                const meta = document.createElement('meta');
                meta.name = 'theme-color';
                meta.content = '#F97316';
                document.head.appendChild(meta);
            }
            if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                    navigator.serviceWorker.register('sw.js').catch(() => {});
                });
            }
        })();

        // ── showToast + alert override (index.html L1862-L1892) ──
        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            
            let icon = 'info-circle';
            if(type === 'success') icon = 'check-circle';
            if(type === 'error') icon = 'exclamation-circle';
            if(type === 'warning') icon = 'exclamation-triangle';

            toast.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-${icon}"></i>
                    <span>${message}</span>
                </div>
                <button onclick="this.parentElement.remove()" style="background:none; border:none; color:inherit; cursor:pointer;"><i class="fas fa-times"></i></button>
            `;

            container.appendChild(toast);

            // Auto remove
            setTimeout(() => {
                toast.style.animation = 'fadeOut 0.3s ease-out forwards';
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        }

        // Override default alert
        window.alert = function(msg) {
            showToast(msg, 'info');
        }

        // ── profile system (index.html L1894-L1981) ──
        // --- PERFIS (múltiplas pessoas no mesmo navegador) ---
        // Perfil "default" usa as chaves originais (sem sufixo) — dados antigos continuam
        // acessíveis sem migração. Perfis extras usam chaves com sufixo "__<id>".
        const PROFILE_REGISTRY_KEY = 'estudoFiscalProfiles';
        const ACTIVE_PROFILE_KEY = 'estudoFiscalActiveProfile';

        function activeProfileId() {
            return localStorage.getItem(ACTIVE_PROFILE_KEY) || 'default';
        }

        /** Namespaceia uma chave de dados de acordo com o perfil ativo. */
        function K(baseKey) {
            const pid = activeProfileId();
            return pid === 'default' ? baseKey : (baseKey + '__' + pid);
        }

        function getProfiles() {
            const custom = JSON.parse(localStorage.getItem(PROFILE_REGISTRY_KEY) || '[]');
            return [{ id: 'default', name: 'Principal' }, ...custom];
        }

        /**
         * Lista completa das chaves de dados "por perfil" usadas em qualquer página do app
         * (não só as que a própria página atual usa) — fonte única de verdade tanto pra limpar
         * um perfil excluído quanto pra montar/restaurar um backup completo (ver saveSelfContainedHTML
         * em index.html). Se uma página nova guardar algo por perfil, adicionar a chave aqui também.
         */
        function getProfileDataKeys() {
            return [
                'estudoFiscalData', 'estudoFiscalSyllabus', 'estudoFiscalStudyHistory',
                'estudoFiscalScheduleStructure', 'estudoFiscalModel', 'estudoFiscalReviews',
                'estudoFiscalRolloverMissed', 'estudoFiscalRolloverLastRun',
                'estudoFiscalPlanPhases', 'estudoFiscalWeeklyHours',
                'estudoFiscalActiveSession', 'ciclo_cards_v3',
                'estudoFiscalQuestoes'
            ];
        }

        /**
         * Aplica um payload de backup no localStorage — aceita tanto o formato novo (multi-perfil,
         * `{version:2, profiles, activeProfile, data:{[profileId]: {...chaves}}}`, gerado por
         * collectFullBackupPayload()) quanto o formato antigo (só as 5 chaves básicas de um único
         * perfil, sem `version`/`data`) pra continuar lendo backups salvos antes dessa mudança.
         * Usado tanto pela reidratação automática de um HTML autocontido salvo (window.HARDCODED_DATA,
         * ver hydrateFromDisk/initCoreData) quanto pelo "Carregar Progresso" (index.html).
         */
        function applyBackupPayload(payload) {
            const d = payload || {};
            if (d.version === 2 && d.data) {
                Object.keys(d.data).forEach(profileId => {
                    const bucket = d.data[profileId] || {};
                    Object.keys(bucket).forEach(base => {
                        const key = profileId === 'default' ? base : base + '__' + profileId;
                        if (bucket[base] !== undefined && bucket[base] !== null) {
                            localStorage.setItem(key, JSON.stringify(bucket[base]));
                        }
                    });
                });
                if (Array.isArray(d.profiles)) localStorage.setItem(PROFILE_REGISTRY_KEY, JSON.stringify(d.profiles));
                if (d.activeProfile) localStorage.setItem(ACTIVE_PROFILE_KEY, d.activeProfile);
                if (d.theme) localStorage.setItem('theme', d.theme);
                if (d.estudoFiscalTutorialSeen) localStorage.setItem('estudoFiscalTutorialSeen', d.estudoFiscalTutorialSeen);
                if (d.estudoFiscalOnboardingSeen) localStorage.setItem('estudoFiscalOnboardingSeen', d.estudoFiscalOnboardingSeen);
                if (d.estudoFiscalConcursoName) localStorage.setItem('estudoFiscalConcursoName', d.estudoFiscalConcursoName);
            } else {
                // Formato antigo: só os 5 dados básicos, do perfil ATIVO no momento da importação.
                const restore = (base, val) => { if (val !== undefined && val !== null) localStorage.setItem(K(base), JSON.stringify(val)); };
                restore('estudoFiscalData', d.estudoFiscalData);
                restore('estudoFiscalSyllabus', d.estudoFiscalSyllabus);
                restore('estudoFiscalStudyHistory', d.estudoFiscalStudyHistory);
                restore('estudoFiscalScheduleStructure', d.estudoFiscalScheduleStructure);
                restore('estudoFiscalModel', d.estudoFiscalModel);
            }
        }

        /**
         * Monta o payload completo de backup: TODOS os perfis (não só o ativo) + o registro de
         * perfis + algumas flags globais (tema, nome do concurso do wizard) — usado por
         * saveSelfContainedHTML() em index.html. Sem isso, "Salvar Progresso" perdia perfis extras,
         * revisão espaçada e preferências de planejamento ao levar os dados pra outro dispositivo.
         */
        function collectFullBackupPayload() {
            const profiles = getProfiles();
            const data = {};
            profiles.forEach(p => {
                const bucket = {};
                getProfileDataKeys().forEach(base => {
                    const key = p.id === 'default' ? base : base + '__' + p.id;
                    const raw = localStorage.getItem(key);
                    if (raw !== null) {
                        try { bucket[base] = JSON.parse(raw); } catch (e) { bucket[base] = raw; }
                    }
                });
                data[p.id] = bucket;
            });
            return {
                version: 2,
                profiles: JSON.parse(localStorage.getItem(PROFILE_REGISTRY_KEY) || '[]'),
                activeProfile: activeProfileId(),
                theme: localStorage.getItem('theme'),
                estudoFiscalTutorialSeen: localStorage.getItem('estudoFiscalTutorialSeen'),
                estudoFiscalOnboardingSeen: localStorage.getItem('estudoFiscalOnboardingSeen'),
                estudoFiscalConcursoName: localStorage.getItem('estudoFiscalConcursoName'),
                data
            };
        }

        /** Concurso salvo no modelo de um perfil específico, sem precisar trocar de perfil ativo. */
        function getProfileModelConcurso(profileId) {
            const key = profileId === 'default' ? 'estudoFiscalModel' : 'estudoFiscalModel__' + profileId;
            try {
                const model = JSON.parse(localStorage.getItem(key) || 'null');
                return (model && model.concurso) ? String(model.concurso).trim() : '';
            } catch (e) {
                return '';
            }
        }

        /** Nome exibido de um perfil: o concurso importado na planilha (aba Gerais), se houver; senão o nome do perfil. */
        function getProfileDisplayName(profile) {
            return getProfileModelConcurso(profile.id) || profile.name;
        }

        function getActiveProfileName() {
            const p = getProfiles().find(p => p.id === activeProfileId());
            return p ? getProfileDisplayName(p) : 'Principal';
        }

        function switchProfile(id) {
            localStorage.setItem(ACTIVE_PROFILE_KEY, id);
            location.reload();
        }

        function createProfile() {
            const custom = JSON.parse(localStorage.getItem(PROFILE_REGISTRY_KEY) || '[]');
            const id = 'p_' + Date.now();
            custom.push({ id, name: 'Novo perfil' });
            localStorage.setItem(PROFILE_REGISTRY_KEY, JSON.stringify(custom));
            switchProfile(id);
        }

        function renameActiveProfile() {
            const pid = activeProfileId();
            if (pid === 'default') {
                showToast('O perfil "Principal" não pode ser renomeado.', 'warning');
                return;
            }
            const custom = JSON.parse(localStorage.getItem(PROFILE_REGISTRY_KEY) || '[]');
            const profile = custom.find(p => p.id === pid);
            if (!profile) return;
            const name = prompt('Novo nome do perfil:', profile.name);
            if (!name || !name.trim()) return;
            profile.name = name.trim();
            localStorage.setItem(PROFILE_REGISTRY_KEY, JSON.stringify(custom));
            renderProfileSwitcher();
        }

        function deleteActiveProfile() {
            const pid = activeProfileId();
            if (pid === 'default') {
                showToast('O perfil "Principal" não pode ser excluído.', 'warning');
                return;
            }
            if (!confirm(`Excluir o perfil "${getActiveProfileName()}"? Todos os dados desse perfil (matérias, ciclo, histórico) serão apagados.`)) return;
            getProfileDataKeys().forEach(base => localStorage.removeItem(base + '__' + pid));
            const custom = JSON.parse(localStorage.getItem(PROFILE_REGISTRY_KEY) || '[]').filter(p => p.id !== pid);
            localStorage.setItem(PROFILE_REGISTRY_KEY, JSON.stringify(custom));
            switchProfile('default');
        }

        function renderProfileSwitcher() {
            const el = document.getElementById('profile-switcher');
            if (!el) return;
            const profiles = getProfiles();
            const active = activeProfileId();
            el.innerHTML = `
                <select id="profile-select" onchange="this.value === '__new__' ? createProfile() : switchProfile(this.value)">
                    ${profiles.map(p => `<option value="${p.id}" ${p.id === active ? 'selected' : ''}>${getProfileDisplayName(p)}</option>`).join('')}
                    <option value="__new__">+ Novo perfil…</option>
                </select>
                ${active !== 'default' ? `
                    <button class="profile-icon-btn" title="Renomear perfil" onclick="renameActiveProfile()"><i class="fas fa-pen"></i></button>
                    <button class="profile-icon-btn" title="Excluir perfil" onclick="deleteActiveProfile()"><i class="fas fa-trash"></i></button>
                ` : ''}
            `;
        }


        // ── disk sync (index.html L1982-L2078) ──
        // --- DATA & CONFIG ---
        const ENABLE_API = ['localhost', '127.0.0.1'].includes(window.location.hostname);

        /**
         * Salva dados do localStorage em disco via API do servidor.
         */
        async function syncToDisk() {
            if (!ENABLE_API) return;
            try {
                const payload = {
                    data: {
                        estudoFiscalData: JSON.parse(localStorage.getItem(K('estudoFiscalData')) || '{}'),
                        estudoFiscalSyllabus: JSON.parse(localStorage.getItem(K('estudoFiscalSyllabus')) || '{}'),
                        estudoFiscalStudyHistory: JSON.parse(localStorage.getItem(K('estudoFiscalStudyHistory')) || '[]'),
                        estudoFiscalScheduleStructure: JSON.parse(localStorage.getItem(K('estudoFiscalScheduleStructure')) || '[]'),
                        estudoFiscalModel: JSON.parse(localStorage.getItem(K('estudoFiscalModel')) || 'null')
                    }
                };
                await fetch('/api/save_bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } catch (e) {
                console.warn('Falha ao sincronizar com disco:', e);
            }
        }

        /**
         * Envia uma linha de log para o servidor.
         */
        async function logEvent(message) {
            if (!ENABLE_API) return;
            try {
                await fetch('/api/log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
            } catch (e) {
                // Silencioso para não interromper fluxo
            }
        }

        /**
         * Carrega dados do disco (se existirem) e injeta em localStorage.
         * Prioriza o ciclo persistido via /api/cycle.
         */
        async function hydrateFromDisk() {
            // 0) Verifica se há dados hardcoded (modo offline / arquivo salvo)
            if (window.HARDCODED_DATA) {
                console.log('Carregando dados embutidos (modo offline)...');
                applyBackupPayload(window.HARDCODED_DATA);
                showToast('Dados recuperados do arquivo salvo!', 'success');
                return;
            }

            if (!ENABLE_API) return;
            try {
                // 1) Tenta carregar ciclo dedicado
                const resCycle = await fetch('/api/cycle');
                const cycle = await resCycle.json();
                if (cycle && cycle.ok && cycle.schedule) {
                    localStorage.setItem(K('estudoFiscalScheduleStructure'), JSON.stringify(cycle.schedule));
                    await logEvent(`HYDRATE: ciclo carregado (${Array.isArray(cycle.schedule) ? cycle.schedule.length : 0} dias)`);
                }

                // 2) Carrega demais dados
                const res = await fetch('/api/load_all');
                const json = await res.json();
                if (json && json.ok && json.data) {
                    const d = json.data;
                    if (d.estudoFiscalData) localStorage.setItem(K('estudoFiscalData'), JSON.stringify(d.estudoFiscalData));
                    if (d.estudoFiscalSyllabus) localStorage.setItem(K('estudoFiscalSyllabus'), JSON.stringify(d.estudoFiscalSyllabus));
                    if (d.estudoFiscalStudyHistory) localStorage.setItem(K('estudoFiscalStudyHistory'), JSON.stringify(d.estudoFiscalStudyHistory));
                    // Só usa backup do schedule se /api/cycle não trouxe nada
                    if (!cycle.schedule && d.estudoFiscalScheduleStructure) {
                        localStorage.setItem(K('estudoFiscalScheduleStructure'), JSON.stringify(d.estudoFiscalScheduleStructure));
                    }
                    if (d.estudoFiscalModel) localStorage.setItem(K('estudoFiscalModel'), JSON.stringify(d.estudoFiscalModel));
                }
            } catch (e) {
                console.warn('Falha ao hidratar do disco:', e);
            }
        }

        // ── defaults (startDate/endDate/subjectsConfig/slotsPorDia) (index.html L2079-L2109) ──
        let startDate = new Date(2025, 11, 16);
        let endDate = new Date(2026, 11, 31);
        
        let subjectsConfig = [
            // Conhecimentos Básicos (Peso 1)
            { name: "Língua Portuguesa", type: "Básico", weight: 1, tickets: 1, dificuldade: 3, carga: 'pesada' },
            { name: "Exatas", type: "Básico", weight: 1, tickets: 1, dificuldade: 3, carga: 'pesada' }, // Substitui RLM, Mat. Fin, Estatística
            { name: "Direito Constitucional", type: "Básico", weight: 1, tickets: 1, dificuldade: 3, carga: 'leve' },
            { name: "Direito Administrativo", type: "Básico", weight: 1, tickets: 1, dificuldade: 3, carga: 'leve' },
            { name: "Direito Financeiro", type: "Básico", weight: 1, tickets: 1, dificuldade: 3, carga: 'leve' },
            { name: "Direito Civil", type: "Básico", weight: 1, tickets: 1, dificuldade: 3, carga: 'leve' },
            { name: "Empresarial", type: "Básico", weight: 1, tickets: 1, dificuldade: 3, carga: 'leve' },
            { name: "Penal", type: "Básico", weight: 1, tickets: 1, dificuldade: 3, carga: 'leve' },
            { name: "Economia", type: "Básico", weight: 1, tickets: 1, dificuldade: 3, carga: 'pesada' },
            { name: "Contabilidade Geral", type: "Básico", weight: 1, tickets: 1, dificuldade: 3, carga: 'pesada' },
            { name: "Realidade do Estado", type: "Básico", weight: 1, tickets: 1, dificuldade: 3, carga: 'leve' },

            // Conhecimentos Específicos
            { name: "Tecnologia da Informação", type: "Específico", weight: 2, tickets: 2, dificuldade: 3, carga: 'leve' },
            { name: "Auditoria", type: "Específico", weight: 3, tickets: 3, dificuldade: 3, carga: 'pesada' },
            { name: "Contabilidade Geral e Avançada", type: "Específico", weight: 3, tickets: 3, dificuldade: 3, carga: 'pesada' },
            { name: "Contabilidade Pública", type: "Específico", weight: 1, tickets: 1, dificuldade: 3, carga: 'pesada' },
            { name: "Contabilidade de Custos", type: "Específico", weight: 3, tickets: 3, dificuldade: 3, carga: 'pesada' },
            { name: "Direito Tributário I", type: "Específico", weight: 3, tickets: 3, dificuldade: 3, carga: 'leve' },
            { name: "Direito Tributário II – Reforma Tributária", type: "Específico", weight: 3, tickets: 3, dificuldade: 3, carga: 'leve' },
            { name: "Legislação Tributária Estadual", type: "Específico", weight: 3, tickets: 3, dificuldade: 3, carga: 'leve' }
        ];

        // Config padrão: matérias por dia (Seg..Dom)
        let slotsPorDia = [4,4,4,4,4,5,5]; // seg..dom: seg-sex 4h, sáb-dom 5h

        // Preferências do ciclo (ver planejamento.html "Preferências do ciclo").
        let temDiscursiva = false;
        let horasDiscursivaSemana = 0;


        // ── model loader (index.html L2110-L2218) ──
        // --- MODEL LOADER ---
        /**
         * Carrega um modelo salvo no localStorage e aplica em start/end/subjects.
         */
        function loadModelFromStorage() {
            const raw = localStorage.getItem(K('estudoFiscalModel'));
            if (!raw) return;
            try {
                const model = JSON.parse(raw);
                /**
                 * Converte string de data (ISO yyyy-mm-dd ou dd/mm/yyyy) para Date local sem deslocamento de fuso.
                 */
                function parseLocalDateString(s) {
                    const str = String(s || '').trim();
                    let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
                    m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
                    const d = new Date(str);
                    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
                }
                if (model.inicioCiclo) startDate = parseLocalDateString(model.inicioCiclo);
                if (model.fimCiclo) endDate = parseLocalDateString(model.fimCiclo);
                if (Array.isArray(model.materias)) {
                    subjectsConfig = model.materias.map(m => ({
                        name: m.nome,
                        type: m.tipo || 'Básico',
                        weight: m.peso !== undefined ? Number(m.peso) : 1,
                        tickets: Number(m.tickets || 1),
                        qtdePdf: Number(m.qtdePdf || 0),
                        qtdePaginas: Number(m.qtdePaginas || 0),
                        dificuldade: Number(m.dificuldade) || 3,
                        carga: m.carga || ''
                    }));
                }
                if (Array.isArray(model.slotsPorDia) && model.slotsPorDia.length === 7) {
                    slotsPorDia = model.slotsPorDia.map(n => Number(n) || 0);
                }
                temDiscursiva = !!model.temDiscursiva;
                horasDiscursivaSemana = temDiscursiva ? Math.max(0, Number(model.horasDiscursivaSemana) || 0) : 0;
                if (model.concurso) {
                    const subEl = document.getElementById('page-subtitle-text');
                    if (subEl) subEl.textContent = `Foco na meta: ${model.concurso}`;
                }
                if (Array.isArray(model.syllabus)) {
                    syllabusData = model.syllabus; // será definido abaixo como let
                }
                const savedScheduleJson = localStorage.getItem(K('estudoFiscalScheduleStructure'));
                if (savedScheduleJson) {
                    setGenerateButtonState('success');
                    try {
                        const rawSchedule = JSON.parse(savedScheduleJson);
                        fullSchedule = rawSchedule.map(day => {
                            const d = new Date(day.date);
                            const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                            return {
                                ...day,
                                date: local,
                                tasks: day.tasks.map(t => {
                                    const task = { ...t };
                                    delete task._inProgress;
                                    delete task._timerStart;
                                    return task;
                                })
                            };
                        });
                        let dirty = false;
                        fullSchedule.forEach(day => {
                            (day.tasks || []).forEach(t => {
                                if (t && Object.prototype.hasOwnProperty.call(t, '_inProgress')) { delete t._inProgress; dirty = true; }
                                if (t && Object.prototype.hasOwnProperty.call(t, '_timerStart')) { delete t._timerStart; dirty = true; }
                            });
                        });
                        if (dirty) {
                            localStorage.setItem(K('estudoFiscalScheduleStructure'), JSON.stringify(fullSchedule));
                        }
                    } catch(e) {
                        console.error('Falha ao reidratar cronograma salvo:', e);
                        fullSchedule = [];
                    }
                } else {
                    setGenerateButtonState('pending');
                    fullSchedule = [];
                }
                // Inicializa filtros da lista após carregar modelo
                setTimeout(initListFilters, 0);
            } catch (e) {
                console.error('Falha ao carregar modelo:', e);
            }
        }

        /**
         * Se o perfil ativo nunca teve um modelo salvo (nunca importou Excel/PDF), grava o modelo
         * padrão (matérias/syllabus/datas de exemplo já usados nesta página) em `estudoFiscalModel`.
         * Sem isso, outras páginas (ex: planejamento.html), que só leem localStorage e não têm os
         * dados de exemplo embutidos, veriam "nenhuma matéria" mesmo com o Ciclo de Estudo mostrando
         * as 19 matérias de exemplo — quebrando a promessa de que as páginas "conversam" entre si.
         */
        function persistDefaultModelIfMissing() {
            if (localStorage.getItem(K('estudoFiscalModel'))) return;
            const model = {
                concurso: '', orgao: '',
                inicioCiclo: startDate.toISOString().slice(0, 10),
                fimCiclo: endDate.toISOString().slice(0, 10),
                slotsPorDia,
                materias: subjectsConfig.map(s => ({ nome: s.name, tipo: s.type, peso: s.weight, tickets: s.tickets || s.weight, dificuldade: s.dificuldade || 3, carga: s.carga || '' })),
                syllabus: syllabusData
            };
            localStorage.setItem(K('estudoFiscalModel'), JSON.stringify(model));
        }


        // ── generate cycle (index.html L2219-L2423) ──
        // --- GENERATE CYCLE ---
        let fullSchedule = []; // Array of objects: { date, tasks: [] }
        
        /**
         * Espalha `totalBlocks` blocos de discursiva/redação pelos dias da semana que têm hora
         * disponível (`weekHoursByDay`), 1 por dia por rodada (round-robin), pra não empilhar tudo
         * num dia só — só faz uma 2ª rodada num dia se sobrar bloco depois de todo dia ativo já ter
         * recebido 1. Nunca passa da capacidade (`weekHoursByDay[i]`) de nenhum dia.
         */
        function distribuirDiscursivaPelaSemana(weekHoursByDay, totalBlocks) {
            const perDay = weekHoursByDay.map(() => 0);
            if (totalBlocks <= 0) return perDay;
            const activeIdxs = weekHoursByDay.map((h, i) => i).filter(i => weekHoursByDay[i] > 0);
            if (!activeIdxs.length) return perDay;
            let remaining = totalBlocks;
            let round = 0;
            while (remaining > 0) {
                let placedThisRound = false;
                for (let k = 0; k < activeIdxs.length && remaining > 0; k++) {
                    const idx = activeIdxs[(k + round) % activeIdxs.length];
                    if (perDay[idx] < weekHoursByDay[idx]) {
                        perDay[idx]++;
                        remaining--;
                        placedThisRound = true;
                    }
                }
                round++;
                if (!placedThisRound) break; // toda a semana já saturada
            }
            return perDay;
        }

        /**
         * Gera o cronograma usando o método de Ciclo de Estudos (Alexandre Meirelles), adaptado
         * pra recalcular a cota de blocos SEMANA A SEMANA (janelas de 7 dias corridos a partir de
         * `startDate`) em vez de uma lista mestre única pro período inteiro:
         * - `computeWeeklyBlocks` decide quantos blocos cada matéria recebe NESSA semana (peso ×
         *   dificuldade × modo revisão, com teto de ~25% da semana por matéria).
         * - Se "Meu concurso tem prova discursiva" estiver ativo, reserva os blocos de
         *   `horasDiscursivaSemana` primeiro, espalhados pelos dias da semana, e as matérias
         *   dividem o que resta.
         * - Blocos perdidos (rollover) são tratados separadamente em `rolloverMissedTasks`.
         */
        function generateSchedule() {
            // Check if we have a saved schedule structure
            const savedScheduleJson = localStorage.getItem(K('estudoFiscalScheduleStructure'));
            
            if (savedScheduleJson) {
                // Parse saved dates strings back to Date objects
                const rawSchedule = JSON.parse(savedScheduleJson);
                fullSchedule = rawSchedule.map(day => {
                    const d = new Date(day.date);
                    const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                    return {
                        ...day,
                        date: local,
                        tasks: day.tasks.map(t => {
                            const task = { ...t };
                            delete task._inProgress;
                            delete task._timerStart;
                            return task;
                        })
                    };
                });
                let dirty = false;
                fullSchedule.forEach(day => {
                    (day.tasks || []).forEach(t => {
                        if (t && Object.prototype.hasOwnProperty.call(t, '_inProgress')) { delete t._inProgress; dirty = true; }
                        if (t && Object.prototype.hasOwnProperty.call(t, '_timerStart')) { delete t._timerStart; dirty = true; }
                    });
                });
                if (dirty) {
                    localStorage.setItem(K('estudoFiscalScheduleStructure'), JSON.stringify(fullSchedule));
                }
                console.log("Loaded saved schedule structure.");
                return;
            }

            console.log("Generating new schedule structure (Method: Master Cycle)...");

            // 1. Validar e Limpar Configuração
            if (!subjectsConfig || subjectsConfig.length === 0) {
                alert("Nenhuma matéria configurada. Importe um Excel ou configure as matérias.");
                return;
            }

            // 2. Estatísticas pro resumo (peso efetivo médio/semana por matéria, só informativo —
            // a cota real de cada semana é recalculada em `computeWeeklyBlocks`, mais abaixo).
            let debugInfo = {
                peso3: { count: 0, blocks: 0, subjects: [] },
                peso2: { count: 0, blocks: 0, subjects: [] },
                peso1: { count: 0, blocks: 0, subjects: [] },
                totalSubjects: 0,
                totalBlocks: 0
            };

            subjectsConfig.forEach(s => {
                // Se peso for 0 ou menor, ignora a matéria (não entra no ciclo)
                const wRaw = Math.round(s.weight || 0);
                if (wRaw <= 0) return;

                const w = effectiveWeight(s);
                debugInfo.totalBlocks += w;

                // Stats
                debugInfo.totalSubjects++;
                if (w >= 3) {
                    debugInfo.peso3.count++;
                    debugInfo.peso3.blocks += w;
                    debugInfo.peso3.subjects.push(s.name);
                } else if (w === 2) {
                    debugInfo.peso2.count++;
                    debugInfo.peso2.blocks += w;
                    debugInfo.peso2.subjects.push(s.name);
                } else {
                    debugInfo.peso1.count++;
                    debugInfo.peso1.blocks += w;
                    debugInfo.peso1.subjects.push(s.name);
                }
            });

            const activeSubjects = subjectsConfig.filter(s => Math.round(s.weight || 0) > 0);
            if (activeSubjects.length === 0) {
                fullSchedule = [];
                return;
            }

            let validationMsg = `Ciclo Gerado!\n\n` +
                `Matérias Ativas: ${activeSubjects.length}\n` +
                `Cota recalculada a cada semana (peso × dificuldade, teto de ~25% da semana por matéria)\n\n` +
                `Distribuição (peso efetivo médio/semana):\n` +
                `- Peso 3 (3x): ${debugInfo.peso3.count} matérias = ${debugInfo.peso3.blocks} blocos\n` +
                `- Peso 2 (2x): ${debugInfo.peso2.count} matérias = ${debugInfo.peso2.blocks} blocos\n` +
                `- Peso 1 (1x): ${debugInfo.peso1.count} matérias = ${debugInfo.peso1.blocks} blocos\n`;
            if (temDiscursiva && horasDiscursivaSemana > 0) {
                validationMsg += `\nReservado ${horasDiscursivaSemana}h/semana pra Redação/Discursiva, espalhadas pelos dias.`;
            }

            // Show summary (User request: "Validar cálculo de blocos")
            alert(validationMsg);

            // 3. Preencher o Calendário — recalcula a cota a cada janela de 7 dias corridos
            // (em vez de uma lista mestre única pro período inteiro), pra o teto por matéria e o
            // "modo revisão" ficarem sempre alinhados à semana real.
            fullSchedule = [];
            let cursor = new Date(startDate);

            while (cursor <= endDate) {
                const weekDates = [];
                for (let i = 0; i < 7 && cursor <= endDate; i++) {
                    weekDates.push(new Date(cursor));
                    cursor.setDate(cursor.getDate() + 1);
                }
                const weekHoursByDay = weekDates.map(d => slotsPorDia[(d.getDay() + 6) % 7] || 0);
                const totalHoursThisWeek = weekHoursByDay.reduce((a, b) => a + b, 0);

                const discursivaTotal = temDiscursiva ? Math.min(Math.round(horasDiscursivaSemana), totalHoursThisWeek) : 0;
                const discursivaPerDay = distribuirDiscursivaPelaSemana(weekHoursByDay, discursivaTotal);
                const regularHoursByDay = weekHoursByDay.map((h, i) => Math.max(0, h - (discursivaPerDay[i] || 0)));
                const regularHoursThisWeek = regularHoursByDay.reduce((a, b) => a + b, 0);

                const weekCounts = computeWeeklyBlocks(activeSubjects, regularHoursThisWeek);
                let weekCycle = [];
                let lastSub = null, lastCarga = null;
                for (let i = 0; i < regularHoursThisWeek; i++) {
                    let candidates = activeSubjects.filter(s => weekCounts[s.name] > 0);
                    if (!candidates.length) break;
                    let valid = candidates.filter(s => s.name !== lastSub);
                    if (!valid.length) valid = candidates;
                    valid.sort((a, b) => weekCounts[b.name] - weekCounts[a.name]);
                    const pick = pickAlternatingCarga(valid, lastCarga, s => weekCounts[s.name]);
                    weekCycle.push(pick);
                    weekCounts[pick.name]--;
                    lastSub = pick.name;
                    lastCarga = pick.carga || lastCarga;
                }

                let weekCycleIdx = 0;
                weekDates.forEach((date, i) => {
                    const dayTasks = [];
                    for (let h = 0; h < (discursivaPerDay[i] || 0); h++) {
                        dayTasks.push({
                            id: `task-${date.getTime()}-d${h}`,
                            subject: 'Redação/Discursiva', type: 'Discursiva', weight: 0, completed: false
                        });
                    }
                    for (let h = 0; h < regularHoursByDay[i]; h++) {
                        const sub = weekCycle[weekCycleIdx % Math.max(1, weekCycle.length)];
                        weekCycleIdx++;
                        if (!sub) continue;
                        dayTasks.push({
                            id: `task-${date.getTime()}-${h}`,
                            subject: sub.name, type: sub.type, weight: sub.weight, completed: false
                        });
                    }
                    fullSchedule.push({ date, tasks: dayTasks });
                });
            }

            // Save the generated structure
            localStorage.setItem(K('estudoFiscalScheduleStructure'), JSON.stringify(fullSchedule));
            
            if (ENABLE_API) {
                try {
                    fetch('/api/cycle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ schedule: fullSchedule })
                    }).then(() => logEvent(`CYCLE: gerado (${fullSchedule.length} dias)`)).catch(()=>{});
                } catch(e) {}
            }
        }

        


        // ── state mgmt (applySavedStatusToSchedule) (index.html L2424-L2461) ──
        // --- STATE MANAGEMENT ---
        // Load status from localStorage
        // Keys: 'estudoFiscalData' (status), 'estudoFiscalSyllabus' (syllabus)
        
        // Migration: Check for old 'sefazGoData' and migrate if 'estudoFiscalData' is missing
        let savedData = JSON.parse(localStorage.getItem(K('estudoFiscalData'))) || {};
        const oldSefazData = JSON.parse(localStorage.getItem('sefazGoData'));
        
        if(oldSefazData && Object.keys(savedData).length === 0) {
            console.log("Migrating SEFAZ-GO status data to Estudo Fiscal...");
            savedData = oldSefazData;
            localStorage.setItem(K('estudoFiscalData'), JSON.stringify(savedData));
        }
        
        /**
         * Aplica dados salvos (tempo, meta, notas) no cronograma carregado.
         */
        function applySavedStatusToSchedule() {
            const saved = JSON.parse(localStorage.getItem(K('estudoFiscalData'))) || {};
            fullSchedule.forEach(day => {
                day.tasks.forEach(task => {
                    const data = saved[task.id];
                    if (data) {
                        task.note = data.note || '';
                        task.timeSpent = data.timeSpent || 0;
                        task.durationTarget = data.durationTarget || 3600;
                    } else {
                        task.note = task.note || '';
                        task.timeSpent = task.timeSpent || 0;
                        task.durationTarget = task.durationTarget || 3600;
                    }
                    const statusNow = deriveTaskStatus(task);
                    task.completed = (statusNow === 'concluido');
                });
            });
        }

        // Current Calendar View State

        // ── today-day-obj + persistSchedule + rolloverMissedTasks (index.html L2664-L2722) ──
        // --- CICLO DE ESTUDO (HOME VIEW) ---
        /**
         * Retorna (e cria se necessário) a entrada de hoje dentro do fullSchedule.
         */
        function getOrCreateTodayDayObj() {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            let dayObj = fullSchedule.find(d => {
                const a = new Date(d.date); a.setHours(0, 0, 0, 0);
                return a.getTime() === today.getTime();
            });
            if (!dayObj) {
                dayObj = { date: today, tasks: [] };
                fullSchedule.push(dayObj);
                fullSchedule.sort((a, b) => a.date.getTime() - b.date.getTime());
            }
            return dayObj;
        }

        function persistSchedule() {
            localStorage.setItem(K('estudoFiscalScheduleStructure'), JSON.stringify(fullSchedule));
            syncToDisk();
        }

        /**
         * Método clássico de ciclo de estudos: o ciclo não "reseta" — se sobrou tarefa não
         * concluída de um dia passado, ela é reencaixada nos dias seguintes em vez de ficar
         * perdida. Opt-in (preferência "Não pular blocos perdidos" em planejamento.html). Roda no
         * máximo 1x por dia e só recolhe backlog dos últimos 14 dias (evita empilhar tarefas
         * indefinidamente se o usuário sumir por meses).
         *
         * Reencaixe em CASCATA, respeitando a carga horária normal de cada dia (`slotsPorDia`):
         * o backlog tem prioridade sobre as tarefas que já estavam agendadas em cada dia; o que não
         * couber hoje empurra as tarefas de hoje pra amanhã, e assim por diante — em vez de
         * empilhar tudo de uma vez em "hoje" (o que podia fazer um dia de 4h virar um de 15h+ se o
         * usuário tivesse faltado vários dias). Nenhuma tarefa é descartada; o ciclo só "atrasa"
         * como um todo, continuando de onde parou.
         */
        function rolloverMissedTasks() {
            if (localStorage.getItem(K('estudoFiscalRolloverMissed')) !== 'true') return;
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const todayKey = today.toDateString();
            const lastRunKey = K('estudoFiscalRolloverLastRun');
            if (localStorage.getItem(lastRunKey) === todayKey) return;

            const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 14);
            getOrCreateTodayDayObj(); // garante que "hoje" existe no fullSchedule

            // 1. Recolhe o backlog dos últimos 14 dias (mais antigo primeiro), removendo-o dos
            // dias de origem — dia passado nunca mais volta a ser "atual".
            const pastDays = fullSchedule
                .filter(day => {
                    const d = new Date(day.date); d.setHours(0, 0, 0, 0);
                    return d.getTime() >= cutoff.getTime() && d.getTime() < today.getTime();
                })
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            let backlog = [];
            pastDays.forEach(day => {
                const pending = (day.tasks || []).filter(t => deriveTaskStatus(t) !== 'concluido');
                if (!pending.length) return;
                day.tasks = day.tasks.filter(t => deriveTaskStatus(t) === 'concluido');
                backlog = backlog.concat(pending);
            });

            localStorage.setItem(lastRunKey, todayKey);
            if (!backlog.length) return;

            // 2. Reinsere o backlog a partir de hoje, em cascata, respeitando a carga horária de
            // cada dia (o que não coube empurra as tarefas que já estavam ali pra frente).
            const futureDays = fullSchedule
                .filter(day => { const d = new Date(day.date); d.setHours(0, 0, 0, 0); return d.getTime() >= today.getTime(); })
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            let carry = backlog;
            futureDays.forEach(day => {
                if (!carry.length) return;
                const idx = (new Date(day.date).getDay() + 6) % 7;
                const hours = slotsPorDia[idx] || 0;
                const combined = carry.concat(day.tasks || []);
                day.tasks = combined.slice(0, hours);
                carry = combined.slice(hours);
            });
            if (carry.length && futureDays.length) {
                // Backlog não coube nem até o fim do ciclo configurado (bem atrasado) — não
                // descarta, só acumula no último dia como último recurso.
                futureDays[futureDays.length - 1].tasks.push(...carry);
            }

            persistSchedule();
            const n = backlog.length;
            showToast(`${n} tarefa${n > 1 ? 's' : ''} atrasada${n > 1 ? 's' : ''} reencaixada${n > 1 ? 's' : ''} no cronograma, sem sobrecarregar um único dia.`, 'info');
        }


        // ── countRecentDayAppearances (index.html L2938-L2959) ──
        /**
         * Monta o ciclo de HOJE (somente) a partir das matérias marcadas no construtor,
         * respeitando o peso de cada uma (peso = quantidade de blocos no ciclo do dia).
         */
        /**
         * Conta em quantos dos últimos `daysBack` dias (sem contar hoje) a matéria apareceu
         * no ciclo gerado — usado para evitar repetir demais a mesma matéria durante a semana.
         */
        function countRecentDayAppearances(subjectName, daysBack) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            let count = 0;
            for (let i = 1; i <= daysBack; i++) {
                const d = new Date(today); d.setDate(d.getDate() - i);
                const dayObj = fullSchedule.find(day => {
                    const a = new Date(day.date); a.setHours(0, 0, 0, 0);
                    return a.getTime() === d.getTime();
                });
                if (dayObj && dayObj.tasks.some(t => t.subject === subjectName)) count++;
            }
            return count;
        }


        // ── getSubjectPerformanceRate (index.html L2960-L2969) ──
        /** % de acerto em questões da matéria (null se não houver dado suficiente). */
        function getSubjectPerformanceRate(subjectName) {
            let qTotal = 0, qCorrect = 0;
            studyHistory.forEach(h => {
                if (h.subject === subjectName && h.questions) { qTotal += h.questions; qCorrect += (h.correct || 0); }
            });
            if (qTotal < 5) return null;
            return Math.round((qCorrect / qTotal) * 100);
        }


        // ── subjectSyllabusCompletionPct (index.html L2970-L2982) ──
        /** % do conteúdo programático já concluído pra uma matéria (0 se não houver tópicos cadastrados). */
        function subjectSyllabusCompletionPct(subjectName) {
            let topics = [];
            for (const section of syllabusData) {
                const found = (section.subjects || []).find(s => s.name === subjectName);
                if (found) { topics = found.topics || []; break; }
            }
            if (!topics.length) return 0;
            const saved = syllabusProgress[subjectName] || [];
            const done = topics.filter((_, i) => saved[i]).length;
            return done / topics.length;
        }


        // ── effectiveWeight (index.html L2983-L3000) ──
        /**
         * Peso efetivo usado no gerador de ciclo (frequência de blocos), combinando:
         * - peso do edital (importância na prova);
         * - dificuldade pessoal (1-5, padrão 3 = neutro, não altera o comportamento anterior);
         * - "modo revisão": matéria com 90%+ do conteúdo já concluído perde metade do peso,
         *   liberando espaço no ciclo pras matérias que ainda faltam mais (método clássico de
         *   ciclo de estudos: ao terminar uma matéria ela entra em modo revisão com carga reduzida).
         *
         * A dificuldade é um multiplicador BRANDO (±30% na faixa 1-5, antes era ±67%) — ela ajusta
         * o peso do edital, não deveria conseguir sozinha fazer uma matéria dominar o ciclo. Quem
         * limita isso de verdade é o teto de `computeWeeklyBlocks` (nenhuma matéria > ~25% da semana).
         */
        function effectiveWeight(s) {
            const raw = Math.max(1, Math.round(s.weight || 0));
            const dificuldade = Number(s.dificuldade) || 3;
            const dificuldadeMult = 1 + (dificuldade - 3) * 0.15; // 1..5 -> 0.7x..1.3x
            let w = Math.max(1, Math.round(raw * dificuldadeMult));
            if (subjectSyllabusCompletionPct(s.name) >= 0.9) {
                w = Math.max(1, Math.ceil(w / 2));
            }
            return w;
        }


        // ── computeWeeklyBlocks ──
        /**
         * Distribui `weeklyHours` blocos (1 bloco = 1h) entre `subjects` proporcionalmente ao
         * `effectiveWeight` de cada um, mas com um TETO por matéria (`WEEKLY_SHARE_CAP` = 25% da
         * semana) — sem isso, uma matéria com peso 3 + dificuldade 5 podia sozinha consumir metade
         * da semana e sufocar as outras (o problema original que motivou essa função). O excedente
         * de quem bate no teto é redistribuído entre as demais, proporcional ao score de cada uma
         * (water-filling). Arredondamento final por "maior resto" pra fechar exatamente em
         * `weeklyHours` blocos. Toda matéria ativa recebe pelo menos 1 bloco/semana quando há hora
         * suficiente pra isso (nunca "some" do ciclo).
         */
        function computeWeeklyBlocks(subjects, weeklyHours) {
            const WEEKLY_SHARE_CAP = 0.25;
            const active = subjects.filter(s => Math.round(s.weight || 0) > 0);
            const result = {};
            if (!active.length || weeklyHours <= 0) return result;

            const scores = {};
            active.forEach(s => { scores[s.name] = effectiveWeight(s); });

            const capBlocks = Math.max(1, Math.ceil(weeklyHours * WEEKLY_SHARE_CAP));
            let pool = active.slice();
            let poolHours = weeklyHours;

            // Water-filling: tira do pool (fixando no teto) quem excede o teto, até sobrar
            // só gente que cabe dentro do teto com o que resta do pool.
            for (;;) {
                if (pool.length <= 1) break;
                const totalScore = pool.reduce((a, s) => a + scores[s.name], 0);
                if (totalScore <= 0) break;
                let overCap = null;
                pool.forEach(s => {
                    const share = (scores[s.name] / totalScore) * poolHours;
                    if (share > capBlocks + 1e-9 && (!overCap || scores[s.name] > scores[overCap.name])) overCap = s;
                });
                if (!overCap) break;
                result[overCap.name] = capBlocks;
                poolHours -= capBlocks;
                pool = pool.filter(s => s !== overCap);
            }

            // Distribui o que resta do pool proporcionalmente, com arredondamento por maior resto.
            const totalScore = pool.reduce((a, s) => a + scores[s.name], 0);
            const fracs = [];
            let used = 0;
            pool.forEach(s => {
                const real = totalScore > 0 ? (scores[s.name] / totalScore) * poolHours : poolHours / pool.length;
                const base = Math.max(0, Math.floor(real));
                result[s.name] = base;
                used += base;
                fracs.push({ name: s.name, frac: real - base });
            });
            let remainder = Math.round(poolHours) - used;
            fracs.sort((a, b) => b.frac - a.frac);
            for (let i = 0; i < fracs.length && remainder > 0; i++, remainder--) result[fracs[i].name]++;

            // Piso: matéria ativa não pode ficar com 0 bloco/semana se houver hora sobrando pra isso
            // (pega 1 bloco de emprestado de quem tem mais, sem violar o mínimo de 1 do doador).
            if (weeklyHours >= active.length) {
                active.forEach(s => {
                    if (result[s.name] > 0) return;
                    const donor = active.reduce((best, x) => ((result[x.name] || 0) > (result[best.name] || 0) ? x : best), active[0]);
                    if ((result[donor.name] || 0) > 1) {
                        result[donor.name]--;
                        result[s.name] = 1;
                    }
                });
            }

            return result;
        }


        // ── pickAlternatingCarga (index.html L3001-L3016) ──
        /**
         * Tenta escolher, dentre `valid` (já ordenado por prioridade), um candidato com "carga"
         * cognitiva diferente da última escolhida — só troca a ordem entre opções de prioridade
         * equivalente (nunca troca a contagem de blocos de cada matéria, só a ordem de exibição).
         * Método clássico de ciclo de estudos: intercalar matéria pesada (raciocínio/cálculo) com
         * matéria leve (memorização/legislação) evita a fadiga de emendar duas pesadas seguidas.
         */
        function pickAlternatingCarga(valid, lastCarga, rankKey) {
            if (!lastCarga || valid.length < 2) return valid[0];
            const top = valid[0];
            if (top.carga !== lastCarga) return top;
            const topRank = rankKey(top);
            const alt = valid.find(s => s.carga && s.carga !== lastCarga && rankKey(s) === topRank);
            return alt || top;
        }


        // ── formatTime + formatHM (index.html L3531-L3549) ──
        function formatTime(seconds) {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        }

        /**
         * Formato compacto e legível para exibição de tempo (ex: "3h 20m").
         * Usado nos cards/resumos; formatTime() continua sendo o formato do cronômetro (00:00:00).
         */
        function formatHM(seconds) {
            seconds = Math.max(0, Math.round(seconds || 0));
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            if (h === 0 && m === 0) return '0m';
            return (h > 0 ? `${h}h ` : '') + `${m}m`;
        }


        // ── deriveTaskStatus (index.html L3550-L3558) ──
        function deriveTaskStatus(task) {
            const spent = Number(task.timeSpent || 0);
            const target = Number(task.durationTarget || 3600);
            if (task._inProgress) return 'nao_concluido';
            if (spent >= Math.max(0, target - 60)) return 'concluido';
            if (spent > 0) return 'nao_concluido';
            return 'nao_iniciado';
        }


        // ── studyHistory load + migration (index.html L3559-L3568) ──
        // --- SESSION & HISTORY LOGIC ---
        // Load history with migration
        let studyHistory = JSON.parse(localStorage.getItem(K('estudoFiscalStudyHistory'))) || [];
        const oldSefazHistory = JSON.parse(localStorage.getItem('sefazStudyHistory'));
        if (oldSefazHistory && studyHistory.length === 0) {
            console.log("Migrating SEFAZ-GO history to Estudo Fiscal...");
            studyHistory = oldSefazHistory;
            localStorage.setItem(K('estudoFiscalStudyHistory'), JSON.stringify(studyHistory));
        }


        // ── updateStats (index.html L4335-L4400) ──
        // --- GLOBAL STATS ---
        function updateStats() {
            const today = new Date();
            const diffTime = endDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const daysLeftEl = document.getElementById('days-left-stat');
            const daysLeftLabel = daysLeftEl && daysLeftEl.previousElementSibling;
            daysLeftEl.textContent = diffDays > 0 ? diffDays : 0;
            if (daysLeftLabel && daysLeftLabel.classList.contains('header-stat-label')) {
                daysLeftLabel.textContent = diffDays > 0 ? 'Dias até a Prova' : 'Prova Realizada';
            }

            let totalTasks = 0;
            let completedTasks = 0;
            fullSchedule.forEach(d => {
                totalTasks += d.tasks.length;
                completedTasks += d.tasks.filter(t => t.completed).length;
            });

            const percent = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
            document.getElementById('total-progress-stat').textContent = percent + '%';
            document.getElementById('total-progress-bar').style.width = percent + '%';

            // Calculate Streak
            let streak = 0;
            const todayDate = new Date();
            todayDate.setHours(0,0,0,0);
            
            // Check past days
            // We need to check if ANY task was done or history exists for the day
            // Let's iterate backwards
            for(let i = 0; i < 365; i++) { // Check up to a year back
                const d = new Date(todayDate);
                d.setDate(d.getDate() - i);
                
                // Check tasks
                const dayTasks = fullSchedule.find(day => 
                    day.date.getDate() === d.getDate() &&
                    day.date.getMonth() === d.getMonth() &&
                    day.date.getFullYear() === d.getFullYear()
                );
                
                let hasActivity = false;
                if(dayTasks) {
                    if(dayTasks.tasks.some(t => t.completed || t.timeSpent > 0)) hasActivity = true;
                }
                
                // Check history
                if(!hasActivity) {
                    // Check raw history array
                    const dayStart = d.getTime();
                    const dayEnd = dayStart + 86400000;
                    
                    const hasHistory = studyHistory.some(h => {
                        const hTime = new Date(h.date).getTime();
                        return hTime >= dayStart && hTime < dayEnd;
                    });
                    if(hasHistory) hasActivity = true;
                }

                if(hasActivity) {
                    streak++;
                } else {
                    // If it's today and we haven't done anything yet, don't break streak if yesterday was active
                    if (i === 0) continue; 
                    else break;
                }
            }
            document.getElementById('streak-stat').textContent = `${streak} dias`;
        }


        // ── syllabusData (index.html L4626-L4759) ──
        // --- SYLLABUS LOGIC ---
        let syllabusData = [
            {
                category: "Conhecimentos Básicos",
                subjects: [
                    {
                        name: "Língua Portuguesa",
                        topics: [
                            "Interpretação de textos", "Ortografia oficial", "Acentuação gráfica", "Classes de palavras", "Sintaxe da oração e do período", "Pontuação", "Concordância nominal e verbal", "Regência nominal e verbal", "Crase", "Significação das palavras"
                        ]
                    },
                    {
                        name: "Exatas",
                        topics: [
                            "Lógica proposicional", "Argumentação lógica", "Juros simples e compostos", "Descontos", "Sistemas de amortização", "Estatística descritiva (média, moda, mediana)", "Probabilidade", "Distribuições de probabilidade", "Amostragem", "Inferência estatística"
                        ]
                    },
                    {
                        name: "Direito Constitucional",
                        topics: [
                            "Direitos e garantias fundamentais", "Organização do Estado", "Administração Pública", "Organização dos Poderes", "Sistema Tributário Nacional", "Finanças Públicas", "Ordem Econômica e Financeira"
                        ]
                    },
                    {
                        name: "Direito Administrativo",
                        topics: [
                            "Princípios da Adm. Pública", "Organização administrativa", "Atos administrativos", "Poderes administrativos", "Licitações e Contratos (Lei 14.133/2021)", "Serviços públicos", "Responsabilidade civil do Estado", "Improbidade Administrativa", "Processo Administrativo"
                        ]
                    },
                    {
                        name: "Direito Financeiro",
                        topics: [
                            "Atividade financeira do Estado", "Lei 4.320/1964", "Lei de Responsabilidade Fiscal", "Orçamento Público (PPA, LDO, LOA)", "Receita Pública", "Despesa Pública", "Dívida Pública"
                        ]
                    },
                    {
                        name: "Direito Civil",
                        topics: [
                            "LINDB", "Pessoas naturais e jurídicas", "Bens", "Fatos jurídicos", "Negócio jurídico", "Prescrição e decadência", "Obrigações", "Contratos"
                        ]
                    },
                    {
                        name: "Empresarial",
                        topics: [
                            "Direito de Empresa", "Empresário", "Estabelecimento empresarial", "Nome empresarial", "Sociedades", "Títulos de crédito", "Falência e recuperação de empresas"
                        ]
                    },
                    {
                        name: "Penal",
                        topics: [
                            "Aplicação da lei penal", "Teoria do crime", "Crimes contra a pessoa", "Crimes contra o patrimônio", "Crimes contra a fé pública", "Crimes contra a Administração Pública", "Crimes contra a ordem tributária"
                        ]
                    },
                    {
                        name: "Economia",
                        topics: ["Microeconomia (Demanda, Oferta, Mercado)", "Macroeconomia (Contas Nacionais, Moeda, Inflação)"]
                    },
                    {
                        name: "Contabilidade Geral",
                        topics: [
                            "Estrutura Conceitual (CPC 00)", "Patrimônio", "Escrituração", "Demonstrações Contábeis (Balanço, DRE, DMPL, DFC)", "Ativo Circulante e Não Circulante", "Passivo e PL"
                        ]
                    },
                    {
                        name: "Realidade do Estado",
                        topics: ["Aspectos históricos, geográficos, econômicos, sociais e culturais do Estado"]
                    }
                ]
            },
            {
                category: "Conhecimentos Específicos",
                subjects: [
                    {
                        name: "Tecnologia da Informação",
                        topics: [
                            "Banco de Dados (Conceitos, SQL)", "Segurança da Informação", "Governança de TI (COBIT, ITIL)", "Análise de Dados (Big Data, BI)", "Lei Geral de Proteção de Dados (LGPD)"
                        ]
                    },
                    {
                        name: "Auditoria",
                        topics: [
                            "Normas Brasileiras de Contabilidade (NBC TA)", "Planejamento da auditoria", "Evidência de auditoria", "Procedimentos de auditoria", "Amostragem", "Relatórios de auditoria", "Auditoria interna x externa"
                        ]
                    },
                    {
                        name: "Contabilidade Geral e Avançada",
                        topics: [
                            "Consolidação de Demonstrações", "Investimentos (MEP)", "Combinação de Negócios", "CPC 01 (Redução ao Valor Recuperável)", "CPC 06 (Arrendamentos)", "CPC 27 (Imobilizado)"
                        ]
                    },
                    {
                        name: "Contabilidade Pública",
                        topics: [
                            "PCASP", "Demonstrações Contábeis Aplicadas ao Setor Público", "Receitas e Despesas sob o enfoque patrimonial", "MCASP"
                        ]
                    },
                    {
                        name: "Contabilidade de Custos",
                        topics: [
                            "Terminologia de Custos", "Custeio por Absorção e Variável", "Custeio Baseado em Atividades (ABC)", "Análise Custo-Volume-Lucro", "Margem de Contribuição"
                        ]
                    },
                    {
                        name: "Direito Tributário I",
                        topics: [
                            "Sistema Tributário Nacional (CF/88)", "Código Tributário Nacional (CTN)", "Obrigação tributária", "Crédito tributário", "Suspensão, Extinção e Exclusão do Crédito"
                        ]
                    },
                    {
                        name: "Direito Tributário II – Reforma Tributária",
                        topics: [
                            "Reforma Tributária (EC 132/2023)", "IBS e CBS", "Imposto Seletivo", "Regras de Transição", "Impactos na legislação vigente"
                        ]
                    },
                    {
                        name: "Legislação Tributária Estadual",
                        topics: [
                            "Código Tributário Estadual", "ICMS (Regras Estaduais)", "IPVA", "ITCD", "Processo Administrativo Tributário"
                        ]
                    }
                ]
            }
        ];

        (function(){
            const rawModel = localStorage.getItem(K('estudoFiscalModel'));
            if(rawModel){
                try{
                    const model = JSON.parse(rawModel);
                    if(Array.isArray(model.syllabus)) syllabusData = model.syllabus;
                }catch(e){}
            }
        })();


        // ── syllabusProgress + spaced review CRUD (index.html L4760-L4809) ──
        let syllabusProgress = JSON.parse(localStorage.getItem(K('estudoFiscalSyllabus'))) || {};

        // --- REVISÃO ESPAÇADA ---
        // Chave: "NomeDaMatéria||índiceDoTópico" -> data ISO (yyyy-mm-dd) da próxima revisão.
        let reviewSchedule = JSON.parse(localStorage.getItem(K('estudoFiscalReviews'))) || {};

        function reviewKey(subjectName, topicIndex) { return subjectName + '||' + topicIndex; }

        function todayISO() {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }

        function scheduleTopicReview(subjectName, topicIndex, days) {
            const d = new Date();
            d.setDate(d.getDate() + days);
            const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            reviewSchedule[reviewKey(subjectName, topicIndex)] = iso;
            localStorage.setItem(K('estudoFiscalReviews'), JSON.stringify(reviewSchedule));
            renderSyllabus();
            renderDailyCycle();
            showToast(`Revisão agendada para ${d.toLocaleDateString('pt-BR')}.`, 'success');
        }

        function clearTopicReview(subjectName, topicIndex) {
            delete reviewSchedule[reviewKey(subjectName, topicIndex)];
            localStorage.setItem(K('estudoFiscalReviews'), JSON.stringify(reviewSchedule));
            renderSyllabus();
            renderDailyCycle();
        }

        /** Retorna as revisões vencidas (data agendada <= hoje), com o texto do tópico. */
        function getDueReviews() {
            const today = todayISO();
            const due = [];
            Object.keys(reviewSchedule).forEach(key => {
                if (reviewSchedule[key] > today) return;
                const [subjectName, topicIndexStr] = key.split('||');
                const topicIndex = Number(topicIndexStr);
                let topicText = null;
                for (const section of syllabusData) {
                    const subj = section.subjects.find(s => s.name === subjectName);
                    if (subj && subj.topics[topicIndex] !== undefined) { topicText = subj.topics[topicIndex]; break; }
                }
                if (topicText === null) return; // matéria/tópico não existe mais no syllabus atual
                due.push({ subjectName, topicIndex, topicText, dueDate: reviewSchedule[key] });
            });
            return due;
        }
        

        // ── syllabus migration (index.html L4810-L4828) ──
        // Migrate Syllabus
        const oldSefazSyllabus = JSON.parse(localStorage.getItem('sefazCycle_syllabus'));
        if(oldSefazSyllabus && Object.keys(syllabusProgress).length === 0) {
            console.log("Migrating Syllabus data...");
            const mapping = {
                "Raciocínio Lógico, Mat. Financeira e Estatística": "Exatas",
                "Direito Empresarial": "Empresarial",
                "Direito Penal": "Penal",
                "Realidade de Goiás": "Realidade do Estado"
            };
            
            Object.keys(oldSefazSyllabus).forEach(oldKey => {
                const newKey = mapping[oldKey] || oldKey;
                syllabusProgress[newKey] = oldSefazSyllabus[oldKey];
            });
            
            localStorage.setItem(K('estudoFiscalSyllabus'), JSON.stringify(syllabusProgress));
        }


        // ── theme logic (index.html L6279-L6318) ──
        // --- THEME LOGIC ---
        function toggleTheme() {
            const html = document.documentElement;
            const current = html.getAttribute('data-theme');
            const next = current === 'light' ? 'dark' : 'light'; // padrão agora é light
            if (next === 'light') {
                html.setAttribute('data-theme', 'light');
            } else {
                html.removeAttribute('data-theme');
            }
            localStorage.setItem('theme', next);
            updateThemeIcon(next);
            window.dispatchEvent(new Event('themechange'));
        }

        function updateThemeIcon(theme) {
            const btn = document.getElementById('theme-toggle');
            if(!btn) return;
            const icon = btn.querySelector('i');
            if(theme === 'light') {
                icon.className = 'fas fa-moon';
                btn.title = "Modo Escuro";
            } else {
                icon.className = 'fas fa-sun';
                btn.title = "Modo Claro";
            }
        }

        function initTheme() {
            const saved = localStorage.getItem('theme');
            if (saved === 'dark') {
                document.documentElement.removeAttribute('data-theme');
                updateThemeIcon('dark');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                updateThemeIcon('light');
            }
        }

        // ── stubs de renderização (cada página sobrescreve as que usa de verdade) ──
        // Várias funções do núcleo (ex.: scheduleTopicReview, rolloverMissedTasks) chamam
        // funções de renderização de views que só existem em UMA página específica. Definir
        // um stub (no-op) aqui garante que chamá-las em qualquer outra página seja inofensivo;
        // a página dona da view redefine a função de verdade no seu próprio <script>,
        // carregado depois deste arquivo (a última declaração de function vence).
        function renderDailyCycle() {}
        function renderCalendar() { renderDailyCycle(); }
        function renderCalendarMonth() {}
        function renderCalendarDayModal() {}
        function renderSubjects() {}
        function renderList() {}
        function renderSyllabus() {}
        function renderTimeStats() {}
        function renderHistory() {}
        function renderHomeStatus() {}
        function setGenerateButtonState() {}
        function initListFilters() {}


        // ── sessão ativa de estudo (barra de cronômetro, modo foco, modal de nota) ──
        // Compartilhado entre cicloestudo.html e cicloestudolivre.html — as duas únicas páginas
        // com a barra de cronômetro. Cada uma só define o jeito de achar o dayObj do dia (hoje vs.
        // dia escolhido no calendário) e chama beginActiveSession() com ele; todo o resto (pausar,
        // modo foco, salvar nota, cancelar, atalhos de teclado, restaurar após F5) é idêntico e
        // fica só aqui, então um bug de timer se corrige uma vez só, não em dois arquivos.
        const OPEN_NOTE_ON_LOAD_KEY = 'estudoFiscalOpenNoteOnLoad';
        const CANCEL_SESSION_ON_LOAD_KEY = 'estudoFiscalCancelSessionOnLoad';

        let activeSession = null;

        function persistActiveSessionToStorage() {
            if (!activeSession) return;
            const payload = {
                dayDateMs: activeSession.dayDate ? activeSession.dayDate.getTime() : null,
                taskIndex: activeSession.taskIndex,
                subject: activeSession.subject,
                startTime: activeSession.startTime,
                elapsedAtStart: activeSession.elapsedAtStart,
                elapsedSession: activeSession.elapsedSession,
                paused: !!activeSession.paused,
                target: activeSession.target,
                alarmPlayed: !!activeSession.alarmPlayed,
                lastResumeEpochMs: activeSession.lastResumeEpochMs || null,
                quizQuestions: activeSession.quizQuestions || 0,
                quizCorrect: activeSession.quizCorrect || 0
            };
            localStorage.setItem(K('estudoFiscalActiveSession'), JSON.stringify(payload));
        }

        function clearActiveSessionStorage() {
            localStorage.removeItem(K('estudoFiscalActiveSession'));
        }

        function restoreActiveSessionFromStorage() {
            const raw = localStorage.getItem(K('estudoFiscalActiveSession'));
            if (!raw) return;
            let data;
            try { data = JSON.parse(raw); } catch (e) { return; }
            if (!data || !data.subject || data.taskIndex === null || data.taskIndex === undefined) return;

            activeSession = {
                dayDate: data.dayDateMs ? new Date(data.dayDateMs) : null,
                taskIndex: data.taskIndex,
                subject: data.subject,
                startTime: Number(data.startTime || Date.now()),
                elapsedAtStart: Number(data.elapsedAtStart || 0),
                elapsedSession: Number(data.elapsedSession || 0),
                paused: !!data.paused,
                interval: null,
                target: Number(data.target || 3600),
                alarmPlayed: !!data.alarmPlayed,
                lastResumeEpochMs: data.lastResumeEpochMs ? Number(data.lastResumeEpochMs) : null,
                quizQuestions: Number(data.quizQuestions || 0),
                quizCorrect: Number(data.quizCorrect || 0)
            };

            const bar = document.getElementById('active-study-bar');
            if (!bar) return;
            bar.classList.add('visible');
            document.getElementById('bar-subject-name').textContent = activeSession.subject;
            document.getElementById('bar-target-label').textContent = `/ Meta: ${Math.floor(activeSession.target/3600)}h ${Math.floor((activeSession.target%3600)/60)}m`;

            updateBarTimer();
            if (activeSession.paused) {
                clearInterval(activeSession.interval);
                document.getElementById('btn-pause-resume').innerHTML = '<i class="fas fa-play"></i> Continuar';
            } else {
                if (activeSession.lastResumeEpochMs) {
                    const delta = Math.floor((Date.now() - activeSession.lastResumeEpochMs) / 1000);
                    if (delta > 0) activeSession.elapsedSession += delta;
                }
                resumeTimer();
                document.getElementById('btn-pause-resume').innerHTML = '<i class="fas fa-pause"></i> Pausar';
            }
            window.addEventListener('keydown', barKeyHandler);
        }

        /**
         * Inicia a sessão ativa pra uma tarefa que já existe em `dayObj.tasks[index]`. Usado por
         * startCycleTask() (Ciclo Livre) e startCalendarTask() (Ciclo de Estudo) — a única diferença
         * entre as duas é como cada uma acha o dayObj, então isso fica de fora daqui.
         */
        function beginActiveSession(dayObj, index) {
            if (activeSession) {
                showToast('Já existe uma sessão ativa. Finalize-a primeiro.', 'warning');
                return false;
            }
            const task = dayObj.tasks[index];
            if (!task) return false;

            task._inProgress = true;
            const saved = JSON.parse(localStorage.getItem(K('estudoFiscalData'))) || {};
            if (!saved[task.id]) saved[task.id] = {};
            saved[task.id].status = 'nao_concluido';
            saved[task.id].note = task.note || '';
            saved[task.id].timeSpent = task.timeSpent || 0;
            saved[task.id].durationTarget = task.durationTarget || 3600;
            localStorage.setItem(K('estudoFiscalData'), JSON.stringify(saved));

            activeSession = {
                dayDate: dayObj.date,
                taskIndex: index,
                subject: task.subject,
                startTime: Date.now(),
                elapsedAtStart: task.timeSpent || 0,
                elapsedSession: 0,
                paused: false,
                interval: null,
                target: Number(task.durationTarget || 3600),
                alarmPlayed: false,
                lastResumeEpochMs: Date.now(),
                quizQuestions: 0,
                quizCorrect: 0
            };

            const bar = document.getElementById('active-study-bar');
            bar.classList.add('visible');
            document.getElementById('bar-subject-name').textContent = activeSession.subject;
            document.getElementById('bar-target-label').textContent = `/ Meta: ${Math.floor(activeSession.target/3600)}h ${Math.floor((activeSession.target%3600)/60)}m`;

            if ("Notification" in window && Notification.permission === "default") {
                Notification.requestPermission();
            }

            updateBarTimer();
            resumeTimer();
            window.addEventListener('keydown', barKeyHandler);
            return true;
        }

        function togglePauseResume() {
            if(!activeSession) return;
            let label;
            if(activeSession.paused) {
                resumeTimer();
                label = '<i class="fas fa-pause"></i> Pausar';
            } else {
                pauseTimer();
                label = '<i class="fas fa-play"></i> Continuar';
            }
            document.getElementById('btn-pause-resume').innerHTML = label;
            const focusBtn = document.getElementById('focus-pause-icon')?.closest('button');
            if (focusBtn) focusBtn.innerHTML = label;
        }

        function resumeTimer() {
            if(!activeSession) return;
            activeSession.paused = false;
            activeSession.lastResumeEpochMs = Date.now();
            clearInterval(activeSession.interval);
            activeSession.interval = setInterval(updateBarTimer, 1000);
            persistActiveSessionToStorage();
        }

        function playAlarm() {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;

                const ctx = new AudioContext();
                const now = ctx.currentTime;

                [0, 0.8, 1.6].forEach(offset => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();

                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(880, now + offset);
                    osc.frequency.exponentialRampToValueAtTime(440, now + offset + 0.4);

                    gain.gain.setValueAtTime(0.1, now + offset);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.4);

                    osc.start(now + offset);
                    osc.stop(now + offset + 0.5);
                });
            } catch(e) {
                console.error("Erro ao tocar alarme:", e);
            }
        }

        function pauseTimer() {
            if(!activeSession) return;
            activeSession.paused = true;
            clearInterval(activeSession.interval);
            const delta = activeSession.lastResumeEpochMs ? Math.floor((Date.now() - activeSession.lastResumeEpochMs) / 1000) : 0;
            if(delta > 0) activeSession.elapsedSession += delta;
            activeSession.lastResumeEpochMs = null;
            persistActiveSessionToStorage();
        }

        /** Pausa o cronômetro e manda pra Questões (IA) já filtrado na matéria da sessão ativa —
         *  ao voltar (link "Voltar para o Estudo" em questoes.html), a sessão continua pausada de
         *  onde parou, e o que foi resolvido lá já vem preenchido no modal de "Salvar" (ver
         *  finishSession / qzResponder). */
        function goToQuizForActiveSubject() {
            if (!activeSession) return;
            pauseTimer();
            const pauseBtn = document.getElementById('btn-pause-resume');
            if (pauseBtn) pauseBtn.innerHTML = '<i class="fas fa-play"></i> Continuar';
            const voltar = location.pathname.split('/').pop() || 'cicloestudo.html';
            location.href = 'questoes.html?materia=' + encodeURIComponent(activeSession.subject) + '&voltar=' + encodeURIComponent(voltar);
        }

        function openFocusMode() {
            if (!activeSession) return;
            const overlay = document.getElementById('focus-mode-overlay');
            if (!overlay) return;
            document.getElementById('focus-subject-name').textContent = activeSession.subject;
            overlay.classList.add('open');
            updateBarTimer();
        }

        function closeFocusMode() {
            const overlay = document.getElementById('focus-mode-overlay');
            if (overlay) overlay.classList.remove('open');
        }

        function isFocusModeOpen() {
            const overlay = document.getElementById('focus-mode-overlay');
            return !!(overlay && overlay.classList.contains('open'));
        }

        function updateBarTimer() {
            if(!activeSession) return;
            const liveDelta = activeSession.paused || !activeSession.lastResumeEpochMs ? 0 : Math.floor((Date.now() - activeSession.lastResumeEpochMs) / 1000);
            const total = activeSession.elapsedAtStart + activeSession.elapsedSession + liveDelta;
            document.getElementById('bar-timer-display').textContent = formatTime(total);
            const target = Math.max(1, Number(activeSession.target || 3600));
            const pct = Math.min(100, Math.round((total / target) * 100));
            const fill = document.getElementById('bar-progress-fill');
            if(fill) fill.style.width = pct + '%';
            const label = document.getElementById('bar-target-label');
            if(label) label.textContent = `/ Meta: ${Math.floor(target/3600)}h ${Math.floor((target%3600)/60)}m (${pct}%)`;
            if (isFocusModeOpen()) {
                const ft = document.getElementById('focus-timer-display');
                const ffill = document.getElementById('focus-progress-fill');
                const flabel = document.getElementById('focus-target-label');
                if (ft) ft.textContent = formatTime(total);
                if (ffill) ffill.style.width = pct + '%';
                if (flabel) flabel.textContent = `Meta: ${Math.floor(target/3600)}h ${Math.floor((target%3600)/60)}m (${pct}%)`;
            }
            if(!activeSession.alarmPlayed && total >= target) {
                activeSession.alarmPlayed = true;
                playAlarm();
                const timerEl = document.getElementById('bar-timer-display');
                if(timerEl) {
                    timerEl.style.color = '#10b981';
                    timerEl.style.textShadow = '0 0 10px #10b981';
                    setTimeout(() => {
                         timerEl.style.color = '#fff';
                         timerEl.style.textShadow = 'none';
                    }, 5000);
                }
                if("Notification" in window && Notification.permission === "granted") {
                    new Notification("Meta Batida!", { body: "Você completou sua meta de estudo!" });
                }
            }
        }

        function finishSession() {
            if(!activeSession) return;
            pauseTimer();
            closeFocusMode();
            document.getElementById('note-modal').classList.add('open');
            document.getElementById('note-textarea').value = '';
            // Se o usuário foi pra aba Questões (IA) resolver questões dessa matéria durante a
            // sessão, os campos já vêm preenchidos com o que foi resolvido de verdade — ainda dá
            // pra editar à mão se quiser ajustar.
            const qTotal = activeSession.quizQuestions || 0;
            document.getElementById('note-questions-total').value = qTotal ? qTotal : '';
            document.getElementById('note-questions-correct').value = qTotal ? (activeSession.quizCorrect || 0) : '';
            const hint = document.getElementById('note-questions-quiz-hint');
            if (hint) hint.style.display = qTotal ? 'flex' : 'none';
        }

        function cancelSession(skipConfirm) {
            if(skipConfirm || confirm('Deseja cancelar a sessão atual? O tempo não será salvo.')) {
                pauseTimer();
                closeFocusMode();
                document.getElementById('active-study-bar').classList.remove('visible');
                if(activeSession) {
                    const dayObj = fullSchedule.find(d => d.date.getTime() === activeSession.dayDate.getTime());
                    if(dayObj) {
                        const task = dayObj.tasks[activeSession.taskIndex];
                        delete task._inProgress;
                        const d = deriveTaskStatus(task);
                        const savedData = JSON.parse(localStorage.getItem(K('estudoFiscalData'))) || {};
                        if(!savedData[task.id]) savedData[task.id] = {};
                        savedData[task.id].status = d;
                        savedData[task.id].note = task.note || '';
                        savedData[task.id].timeSpent = task.timeSpent || 0;
                        savedData[task.id].durationTarget = task.durationTarget || 3600;
                        localStorage.setItem(K('estudoFiscalData'), JSON.stringify(savedData));
                    }
                }
                renderCalendar();
                renderList();
                renderCalendarMonth();
                renderCalendarDayModal();
                activeSession = null;
                clearActiveSessionStorage();
                window.removeEventListener('keydown', barKeyHandler);
            }
        }

        function cancelNote() {
            document.getElementById('note-modal').classList.remove('open');
        }

        function saveNote() {
            if(!activeSession) return;

            const note = document.getElementById('note-textarea').value;
            const qTotal = parseInt(document.getElementById('note-questions-total').value) || 0;
            const qCorrect = parseInt(document.getElementById('note-questions-correct').value) || 0;

            if (qCorrect > qTotal) {
                alert('O número de acertos não pode ser maior que o total de questões.');
                return;
            }

            const now = new Date();

            const historyItem = {
                id: Date.now().toString(),
                date: now.toISOString(),
                subject: activeSession.subject,
                duration: activeSession.elapsedSession,
                startTime: activeSession.startTime,
                note: note,
                questions: qTotal,
                correct: qCorrect
            };

            studyHistory.unshift(historyItem);
            localStorage.setItem(K('estudoFiscalStudyHistory'), JSON.stringify(studyHistory));

            const dayObj = fullSchedule.find(d => d.date.getTime() === activeSession.dayDate.getTime());
            if(dayObj) {
                const task = dayObj.tasks[activeSession.taskIndex];
                task.timeSpent = (task.timeSpent || 0) + activeSession.elapsedSession;
                delete task._inProgress;

                const derivedStatus = deriveTaskStatus(task);
                task.completed = (derivedStatus === 'concluido');

                if(note) {
                    const timeString = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
                    task.note = (task.note ? task.note + '\n' : '') + `[${timeString}] ${note}`;
                }

                const savedData = JSON.parse(localStorage.getItem(K('estudoFiscalData'))) || {};
                if(!savedData[task.id]) savedData[task.id] = {};
                savedData[task.id].status = derivedStatus;
                savedData[task.id].note = task.note;
                savedData[task.id].timeSpent = task.timeSpent;
                savedData[task.id].durationTarget = task.durationTarget || 3600;
                localStorage.setItem(K('estudoFiscalData'), JSON.stringify(savedData));
                localStorage.setItem(K('estudoFiscalScheduleStructure'), JSON.stringify(fullSchedule));
                syncToDisk();
            }

            document.getElementById('note-modal').classList.remove('open');
            document.getElementById('active-study-bar').classList.remove('visible');
            activeSession = null;
            clearActiveSessionStorage();

            renderHistory();
            renderCalendar();
            renderList();
            renderTimeStats();
            renderCalendarMonth();
            renderCalendarDayModal();
            updateStats();
            window.removeEventListener('keydown', barKeyHandler);
        }

        function barKeyHandler(e) {
            if(!activeSession) return;
            const target = e.target;
            if (
                target &&
                (
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.isContentEditable
                )
            ) {
                return;
            }
            if(e.key === ' ') {
                e.preventDefault();
                togglePauseResume();
            } else if(e.key === 'Enter') {
                e.preventDefault();
                finishSession();
            } else if(e.key === 'Escape') {
                e.preventDefault();
                if (isFocusModeOpen()) closeFocusMode();
                else cancelSession();
            }
        }

        /**
         * Sinalizadores deixados pela barrinha de cronômetro "espelho" do resumo.html (que não tem
         * o modal de nota) quando a pessoa clica em Finalizar/Cancelar por lá e é redirecionada de
         * volta pra uma página que tem o modal de verdade.
         */
        function checkPendingSessionActionOnLoad() {
            if (localStorage.getItem(OPEN_NOTE_ON_LOAD_KEY) === 'true') {
                localStorage.removeItem(OPEN_NOTE_ON_LOAD_KEY);
                if (activeSession) finishSession();
            } else if (localStorage.getItem(CANCEL_SESSION_ON_LOAD_KEY) === 'true') {
                localStorage.removeItem(CANCEL_SESSION_ON_LOAD_KEY);
                if (activeSession) cancelSession(true);
            }
        }
        function initCalibrationPanel() {}
        function setupOfflineFallbacks() {}
        function openOnboardingWizard() {}

        // ── bootstrap de dados compartilhado ──
        // Cada página chama initCoreData() no início do próprio init(), antes de rodar
        // sua renderização específica. Replica a parte de index.html/init() que é comum
        // a todas as páginas (perfil, modelo, cronograma, estatísticas do cabeçalho).
        function initCoreData() {
            renderProfileSwitcher();
            if (window.HARDCODED_DATA) {
                console.log('Carregando dados embutidos (Self-Contained Mode)...');
                applyBackupPayload(window.HARDCODED_DATA);
                showToast('Dados restaurados do arquivo salvo!', 'success');
            }

            const savedScheduleJson = localStorage.getItem(K('estudoFiscalScheduleStructure'));
            if (fullSchedule.length === 0 && savedScheduleJson) {
                generateSchedule();
            }

            const hasSchedule = !!localStorage.getItem(K('estudoFiscalScheduleStructure'));
            setGenerateButtonState(hasSchedule ? 'success' : 'pending');
            loadModelFromStorage();
            persistDefaultModelIfMissing();
            applySavedStatusToSchedule();
            rolloverMissedTasks();
            updateStats();
        }

