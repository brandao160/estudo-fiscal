/* ==========================================================
   profile-keys.js — fonte única da lista de chaves de dados "por perfil"
   usadas em qualquer página do app (Salvar/Carregar Progresso em core.js,
   e a limpeza ao excluir um perfil em resumo.html/planejamento.html, que
   não carregam core.js). Se uma página nova guardar algo por perfil,
   adicionar a chave aqui — é a única lista que precisa mudar.
   ========================================================== */

const PROFILE_DATA_KEYS = [
    'estudoFiscalData', 'estudoFiscalSyllabus', 'estudoFiscalStudyHistory',
    'estudoFiscalScheduleStructure', 'estudoFiscalModel', 'estudoFiscalReviews',
    'estudoFiscalRolloverMissed', 'estudoFiscalRolloverLastRun',
    'estudoFiscalPlanPhases', 'estudoFiscalWeeklyHours',
    'estudoFiscalActiveSession', 'ciclo_cards_v3',
    'estudoFiscalQuestoes'
];
