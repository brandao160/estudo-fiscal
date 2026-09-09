/* ==========================================================
   profile-keys.js — config leve compartilhada entre TODAS as páginas do
   app (carregado antes de core.js; inclusive em resumo.html/planejamento.html,
   que não carregam core.js):
   - PROFILE_DATA_KEYS: fonte única das chaves de dados "por perfil" (Salvar/
     Carregar Progresso em core.js, e a limpeza ao excluir um perfil). Se uma
     página nova guardar algo por perfil, adicionar a chave aqui.
   - SUBJECT_CONFLICT_GROUPS / subjectConflictsToday: matérias que o gerador
     de ciclo (generateSchedule em core.js, buildWeeklyScheduleDays em
     planejamento.html) evita colocar no mesmo dia.
   ========================================================== */

const PROFILE_DATA_KEYS = [
    'estudoFiscalData', 'estudoFiscalSyllabus', 'estudoFiscalStudyHistory',
    'estudoFiscalScheduleStructure', 'estudoFiscalModel', 'estudoFiscalReviews',
    'estudoFiscalRolloverMissed', 'estudoFiscalRolloverLastRun',
    'estudoFiscalPlanPhases', 'estudoFiscalWeeklyHours',
    'estudoFiscalActiveSession', 'ciclo_cards_v3',
    'estudoFiscalQuestoes'
];

/**
 * Grupos de matérias com conteúdo/raciocínio parecido demais pra estudar no mesmo dia sem
 * confundir (ex: Direito Constitucional e Direito Administrativo se misturam facilmente se
 * estudados seguidos). O gerador de ciclo trata isso como restrição "best-effort": nunca deixa
 * uma hora vazia por causa disso, só evita quando dá pra evitar.
 * Comparação é por nome normalizado (ver normalizeSubjectName) — funciona com qualquer matéria
 * importada cujo nome bata com um destes; matéria fora dessas listas nunca conflita com nada.
 */
const SUBJECT_CONFLICT_GROUPS = [
    ['Matemática Financeira', 'Estatística'],
    ['Direito Constitucional', 'Direito Administrativo'],
    ['Contabilidade Pública', 'Contabilidade Geral'],
    ['Administração Pública', 'Administração Geral']
];

function normalizeSubjectName(name) {
    return String(name || '')
        .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
        .trim().toLowerCase();
}

/**
 * true se `subjectName` está no mesmo SUBJECT_CONFLICT_GROUPS que alguma matéria DIFERENTE já
 * presente em `usedNamesNormalized` (Set de nomes já normalizados, tipicamente as matérias já
 * escaladas no dia em questão).
 */
function subjectConflictsToday(subjectName, usedNamesNormalized) {
    const norm = normalizeSubjectName(subjectName);
    const group = SUBJECT_CONFLICT_GROUPS.find(g => g.some(n => normalizeSubjectName(n) === norm));
    if (!group) return false;
    return group.some(n => {
        const gn = normalizeSubjectName(n);
        return gn !== norm && usedNamesNormalized.has(gn);
    });
}
