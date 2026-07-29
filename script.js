/* ============================================================
   PAINEL DE FECHAMENTO MENSAL — script.js
   Aplicação Kanban (estilo Microsoft Planner) para acompanhar
   o fechamento contábil mensal de filiais.
   ============================================================ */

/* ---------- Configuração de etapas e checklist ---------- */

// Cada etapa define a coluna do Kanban e os itens de checklist
// que precisam estar 100% concluídos para o cartão avançar.
const STAGES = [
  {
    id: "suprimentos",
    label: "Suprimentos",
    items: [
      { key: "pedidosCompra", title: "Finalizar abertura dos Pedidos de Compra",
        desc: "Garantir que todos os pedidos de compra da competência estejam criados e aprovados." },
      { key: "notasDisponiveis", title: "Disponibilizar Notas Fiscais",
        desc: "Disponibilizar todas as notas fiscais para lançamento dentro da competência." }
    ]
  },
  {
    id: "fiscal",
    label: "Fiscal / Central de Notas",
    items: [
      { key: "pendenciasFiscais", title: "Atender pendências fiscais",
        desc: "Resolver chamados e inconsistências relacionadas às notas fiscais." },
      { key: "notasLancadas", title: "Lançar Notas Fiscais",
        desc: "Registrar todas as notas fiscais da competência no ERP." }
    ]
  },
  {
    id: "planejamento",
    label: "Planejamento Financeiro",
    items: [
      { key: "reclassificacao", title: "Reclassificação de benefícios", desc: "" },
      { key: "conferencia", title: "Conferência dos lançamentos contábeis", desc: "" },
      { key: "provisoes", title: "Registro das provisões contábeis", desc: "" }
    ]
  },
  {
    id: "contabilidade",
    label: "Contabilidade",
    items: [
      { key: "impostos", title: "Apuração dos impostos", desc: "" },
      { key: "contabilizacaoFinal", title: "Contabilizações finais", desc: "" }
    ]
  },
  {
    id: "concluido",
    label: "Fechamento Concluído",
    items: []
  }
];

const ALL_CHECK_KEYS = STAGES.flatMap(s => s.items.map(i => i.key));
const TOTAL_ITEMS = ALL_CHECK_KEYS.length;

// Filiais de referência (código + nome), usadas para autocompletar/validar import
const FILIAIS_REF = [
  { codigo: "101", nome: "Corporativo" },
  { codigo: "103", nome: "CD - Itajaí (Salseiros)" },
  { codigo: "105", nome: "CD - Curitiba" },
  { codigo: "107", nome: "CD - Itajaí (Itaipava)" },
  { codigo: "107", nome: "TR - Itajaí (Itaipava)" },
  { codigo: "108", nome: "CD - Navegantes" },
  { codigo: "109", nome: "CD - Cajamar" },
  { codigo: "110", nome: "TR - Paranaguá" },
  { codigo: "111", nome: "TR - Santa Cruz" },
  { codigo: "112", nome: "TR - Rio Grande" },
  { codigo: "113", nome: "TR - Santos" },
  { codigo: "115", nome: "CD - Fazenda Rio Grande" },
  { codigo: "116", nome: "CD - Garuva" },
  { codigo: "116", nome: "TR - Garuva" },
  { codigo: "117", nome: "CD - Navegantes 2" }
];

const STORAGE_KEY = "fechamento_kanban_state_v1";
const USER_STORAGE_KEY = "fechamento_usuario_atual";

const STAGE_COLORS = {
  suprimentos: "#2563EB", fiscal: "#F59E0B", planejamento: "#7C3AED",
  contabilidade: "#DC2626", concluido: "#16A34A"
};

// Ordem sequencial das etapas que possuem checklist (usada no cálculo de SLA)
const ORDEM_ETAPAS_SLA = ["suprimentos", "fiscal", "planejamento", "contabilidade"];

const SLA_META_PADRAO = { suprimentos: 48, fiscal: 48, planejamento: 72, contabilidade: 48 }; // horas

// Rótulos amigáveis usados no histórico de alterações
const CAMPO_LABELS = { codigo: "Código", filial: "Filial", competencia: "Competência", responsavel: "Responsável" };
const CHECKLIST_LABELS = Object.fromEntries(STAGES.flatMap(s => s.items.map(i => [i.key, i.title])));

// Ordem das colunas focáveis (editáveis) na tabela — usada na navegação por teclado
const TABLE_COLUMNS = [
  "codigo", "filial", "competencia", "responsavel",
  "pedidosCompra", "notasDisponiveis", "pendenciasFiscais", "notasLancadas",
  "reclassificacao", "conferencia", "provisoes", "impostos", "contabilizacaoFinal"
];

/* ---------- Usuário atual (identificação simples, por navegador) ---------- */

let USUARIO_ATUAL = null;

function obterUsuarioSalvo() {
  try { return localStorage.getItem(USER_STORAGE_KEY) || null; }
  catch (e) { return null; }
}

function salvarUsuario(nome) {
  USUARIO_ATUAL = nome;
  try { localStorage.setItem(USER_STORAGE_KEY, nome); }
  catch (e) { console.warn("Não foi possível salvar o usuário:", e); }
  const badge = document.getElementById("userBadgeName");
  if (badge) badge.textContent = nome;
}

/* ---------- Estado da aplicação ---------- */

let state = {
  cards: [],
  filters: { search: "", competencia: "", filial: "", responsavel: "", etapa: "" },
  sort: "codigo",
  view: "kanban",
  slaTargets: { ...SLA_META_PADRAO }
};

let chartGeral = null;
let chartSla = null;
let activeModalCardId = null;

/* ============================================================
   PERSISTÊNCIA (LocalStorage)
   ============================================================ */

function salvarDados() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cards: state.cards,
      sort: state.sort,
      view: state.view,
      slaTargets: state.slaTargets
    }));
  } catch (e) {
    console.warn("Não foi possível salvar no LocalStorage:", e);
  }
}

function carregarDados() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.cards)) state.cards = parsed.cards;
    if (parsed.sort) state.sort = parsed.sort;
    if (parsed.view) state.view = parsed.view;
    if (parsed.slaTargets) state.slaTargets = { ...SLA_META_PADRAO, ...parsed.slaTargets };
  } catch (e) {
    console.warn("Não foi possível carregar do LocalStorage:", e);
  }
}

/* ============================================================
   LÓGICA DE NEGÓCIO (checklist, etapa, progresso)
   ============================================================ */

// Calcula automaticamente em qual etapa o cartão deve estar,
// com base nos itens de checklist concluídos (fluxo sequencial).
function calcularEtapaAutomatica(card) {
  for (const stage of STAGES) {
    if (stage.items.length === 0) continue; // "concluido" não tem itens
    const pendente = stage.items.some(item => !card.checklist[item.key]);
    if (pendente) return stage.id;
  }
  return "concluido";
}

// Etapa exibida: respeita um override manual (drag-and-drop) até
// que o checklist seja alterado novamente.
function etapaAtual(card) {
  return card.manualStage || calcularEtapaAutomatica(card);
}

function calcularProgresso(card) {
  const feitos = ALL_CHECK_KEYS.filter(k => card.checklist[k]).length;
  return Math.round((feitos / TOTAL_ITEMS) * 100);
}

// Garante a estrutura de stageLog (início/conclusão/quem concluiu) de cada etapa
function garantirStageLog(card) {
  if (!card.stageLog) card.stageLog = {};
  ORDEM_ETAPAS_SLA.forEach(id => {
    if (!card.stageLog[id]) card.stageLog[id] = { iniciadoEm: null, concluidoEm: null, concluidoPor: null };
  });
  if (card.dataConclusaoFinal === undefined) card.dataConclusaoFinal = null;
  if (card.concluidoPor === undefined) card.concluidoPor = null;
  if (!Array.isArray(card.historico)) card.historico = [];
}

// Atualiza os carimbos de início/conclusão de cada etapa com base no checklist atual.
// É isso que alimenta o painel de SLA com data/hora reais de cada etapa.
function atualizarProgressaoEtapas(card) {
  garantirStageLog(card);
  const agora = new Date().toISOString();
  const etapaAtualCalc = calcularEtapaAutomatica(card);

  if (etapaAtualCalc !== "concluido" && !card.stageLog[etapaAtualCalc].iniciadoEm) {
    card.stageLog[etapaAtualCalc].iniciadoEm = agora;
  }

  ORDEM_ETAPAS_SLA.forEach((stageId, idx) => {
    const stageDef = STAGES.find(s => s.id === stageId);
    const completo = stageDef.items.every(item => card.checklist[item.key]);
    const log = card.stageLog[stageId];

    if (completo) {
      if (!log.iniciadoEm) log.iniciadoEm = agora;
      if (!log.concluidoEm) { log.concluidoEm = agora; log.concluidoPor = USUARIO_ATUAL; }
      const proximo = ORDEM_ETAPAS_SLA[idx + 1];
      if (proximo && !card.stageLog[proximo].iniciadoEm) card.stageLog[proximo].iniciadoEm = agora;
    } else if (log.concluidoEm) {
      log.concluidoEm = null; // etapa foi reaberta (item desmarcado)
      log.concluidoPor = null;
    }
  });

  if (etapaAtualCalc === "concluido") {
    if (!card.dataConclusaoFinal) { card.dataConclusaoFinal = agora; card.concluidoPor = USUARIO_ATUAL; }
  } else {
    card.dataConclusaoFinal = null;
    card.concluidoPor = null;
  }
}

function registrarHistorico(card, acao) {
  garantirStageLog(card);
  card.historico.unshift({ usuario: USUARIO_ATUAL || "Desconhecido", quando: new Date().toISOString(), acao });
  if (card.historico.length > 25) card.historico.length = 25;
}

// Ponto central chamado sempre que um cartão é editado: marca quem/quando
// alterou, atualiza a progressão de etapas (para o SLA) e registra o histórico.
function marcarAtualizacaoAgora(card, acao) {
  card.ultimaAtualizacao = new Date().toISOString();
  card.ultimoUsuario = USUARIO_ATUAL || "Desconhecido";
  atualizarProgressaoEtapas(card);
  if (acao) registrarHistorico(card, acao);
}

/* ============================================================
   IMPORTAÇÃO DE EXCEL (SheetJS)
   ============================================================ */

function valorVerdadeiro(v) {
  if (v === true) return true;
  if (v === false || v === undefined || v === null || v === "") return false;
  const s = String(v).trim().toLowerCase();
  return ["1", "x", "sim", "s", "ok", "concluído", "concluido", "true", "yes"].includes(s);
}

function normalizarDataHora(v) {
  if (!v) return new Date().toISOString();
  if (v instanceof Date && !isNaN(v)) return v.toISOString();
  // tenta formato dd/mm/aaaa (assume meia-noite, sem informação de hora na planilha)
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? "20" + y : y;
    return new Date(`${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00`).toISOString();
  }
  const d2 = new Date(v);
  if (!isNaN(d2)) return d2.toISOString();
  return new Date().toISOString();
}

function normalizarCompetencia(v) {
  if (!v) return "";
  if (v instanceof Date && !isNaN(v)) {
    return `${String(v.getMonth() + 1).padStart(2, "0")}/${v.getFullYear()}`;
  }
  return String(v).trim();
}

function importarExcel(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows.length) {
        alert("A planilha está vazia ou não pôde ser lida.");
        return;
      }

      const novosCards = rows.map(criarCardApartirDaLinha).filter(Boolean);

      if (!novosCards.length) {
        alert("Nenhuma linha válida foi encontrada. Verifique as colunas 'Código' e 'Filial'.");
        return;
      }

      state.cards = novosCards;
      salvarDados();
      popularFiltros();
      renderizarTudo();
      alert(`${novosCards.length} filial(is) importada(s) com sucesso.`);
    } catch (err) {
      console.error(err);
      alert("Erro ao ler o arquivo Excel. Verifique se o formato segue o modelo esperado.");
    }
  };
  reader.readAsArrayBuffer(file);
}

// Converte uma linha da planilha em um objeto "card"
function criarCardApartirDaLinha(row) {
  const codigo = String(row["Código"] ?? row["Codigo"] ?? "").trim();
  const filial = String(row["Filial"] ?? "").trim();
  if (!codigo || !filial) return null;

  const card = {
    id: `${codigo}-${filial}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    codigo,
    filial,
    competencia: normalizarCompetencia(row["Competência"] ?? row["Competencia"]),
    responsavel: String(row["Responsável"] ?? row["Responsavel"] ?? "").trim() || "Não definido",
    ultimaAtualizacao: normalizarDataHora(row["Última Atualização"] ?? row["Ultima Atualizacao"]),
    ultimoUsuario: USUARIO_ATUAL || "Importação",
    manualStage: null,
    historico: [],
    checklist: {
      pedidosCompra: valorVerdadeiro(row["Pedidos Compra"]),
      notasDisponiveis: valorVerdadeiro(row["Notas Disponíveis"] ?? row["Notas Disponiveis"]),
      pendenciasFiscais: valorVerdadeiro(row["Pendências Fiscais"] ?? row["Pendencias Fiscais"]),
      notasLancadas: valorVerdadeiro(row["Notas Lançadas"] ?? row["Notas Lancadas"]),
      reclassificacao: valorVerdadeiro(row["Reclassificação"] ?? row["Reclassificacao"]),
      conferencia: valorVerdadeiro(row["Conferência"] ?? row["Conferencia"]),
      provisoes: valorVerdadeiro(row["Provisões"] ?? row["Provisoes"]),
      impostos: valorVerdadeiro(row["Impostos"]),
      contabilizacaoFinal: valorVerdadeiro(row["Contabilização Final"] ?? row["Contabilizacao Final"])
    }
  };
  garantirStageLog(card);
  atualizarProgressaoEtapas(card);
  registrarHistorico(card, "Importado via planilha Excel");
  return card;
}

// Gera e baixa um modelo de planilha (.xlsx) pronto para preenchimento
function baixarModelo() {
  const header = [
    "Competência", "Código", "Filial", "Responsável", "Etapa Atual",
    "Pedidos Compra", "Notas Disponíveis", "Pendências Fiscais", "Notas Lançadas",
    "Reclassificação", "Conferência", "Provisões", "Impostos", "Contabilização Final",
    "Última Atualização"
  ];
  const linhas = FILIAIS_REF.map(f => ({
    "Competência": "07/2026",
    "Código": f.codigo,
    "Filial": f.nome,
    "Responsável": "",
    "Etapa Atual": "Suprimentos",
    "Pedidos Compra": "", "Notas Disponíveis": "",
    "Pendências Fiscais": "", "Notas Lançadas": "",
    "Reclassificação": "", "Conferência": "", "Provisões": "",
    "Impostos": "", "Contabilização Final": "",
    "Última Atualização": ""
  }));
  const ws = XLSX.utils.json_to_sheet(linhas, { header });
  ws["!cols"] = header.map(h => ({ wch: Math.max(14, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Fechamento");
  XLSX.writeFile(wb, "modelo_fechamento_filiais.xlsx");
}

/* ============================================================
   RENDERIZAÇÃO — CARTÕES E COLUNAS
   ============================================================ */

function aplicarFiltrosOrdenacao(cards) {
  const f = state.filters;
  let resultado = cards.filter(card => {
    if (f.competencia && card.competencia !== f.competencia) return false;
    if (f.filial && card.filial !== f.filial) return false;
    if (f.responsavel && card.responsavel !== f.responsavel) return false;
    if (f.etapa && etapaAtual(card) !== f.etapa) return false;
    if (f.search) {
      const s = f.search.toLowerCase();
      if (!card.codigo.toLowerCase().includes(s) && !card.filial.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  resultado.sort((a, b) => {
    switch (state.sort) {
      case "nome": return a.filial.localeCompare(b.filial);
      case "responsavel": return a.responsavel.localeCompare(b.responsavel);
      case "atualizacao": return b.ultimaAtualizacao.localeCompare(a.ultimaAtualizacao);
      case "codigo":
      default: return a.codigo.localeCompare(b.codigo, undefined, { numeric: true });
    }
  });

  return resultado;
}

function diasDesdeAtualizacao(dataStr) {
  const d = new Date(dataStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function criarElementoCard(card) {
  const stage = etapaAtual(card);
  const progresso = calcularProgresso(card);
  const dias = diasDesdeAtualizacao(card.ultimaAtualizacao);
  const atrasado = dias !== null && dias > 5 && stage !== "concluido";

  const el = document.createElement("div");
  el.className = `card border-${stage}`;
  el.draggable = true;
  el.dataset.id = card.id;

  el.innerHTML = `
    <div class="card-top">
      <span class="card-code">#${escapeHtml(card.codigo)}</span>
      ${atrasado ? `<span class="card-alert" title="${dias} dias sem atualização"><i class="fa-solid fa-triangle-exclamation"></i></span>` : ""}
    </div>
    <p class="card-name">${escapeHtml(card.filial)}</p>
    <div class="card-meta">
      <span><i class="fa-regular fa-calendar"></i> ${escapeHtml(card.competencia || "—")}</span>
      <span><i class="fa-regular fa-user"></i> ${escapeHtml(card.responsavel)}</span>
    </div>
    <div class="progress-bar-track">
      <div class="progress-bar-fill ${progresso === 100 ? "done" : ""}" style="width:${progresso}%"></div>
    </div>
    <div class="progress-label">${progresso}% concluído</div>
    <div class="card-footer"><i class="fa-regular fa-pen-to-square"></i> ${escapeHtml(card.ultimoUsuario || "—")} · ${formatarDataHora(card.ultimaAtualizacao)}</div>
  `;

  el.addEventListener("click", () => abrirModal(card.id));
  el.addEventListener("dragstart", () => {
    el.classList.add("dragging");
    el.dataset.dragging = "1";
  });
  el.addEventListener("dragend", () => {
    el.classList.remove("dragging");
  });

  return el;
}

function renderizarBoard() {
  const cardsFiltrados = aplicarFiltrosOrdenacao(state.cards);
  const porEtapa = {};
  STAGES.forEach(s => (porEtapa[s.id] = []));
  cardsFiltrados.forEach(card => porEtapa[etapaAtual(card)].push(card));

  STAGES.forEach(stage => {
    const container = document.getElementById(`col-${stage.id}`);
    const countEl = document.getElementById(`count-${stage.id}`);
    container.innerHTML = "";
    porEtapa[stage.id].forEach(card => container.appendChild(criarElementoCard(card)));
    countEl.textContent = porEtapa[stage.id].length;
  });

  if (state.view === "kanban") {
    document.getElementById("emptyState").classList.toggle("visible", state.cards.length === 0);
    document.getElementById("board").style.display = state.cards.length === 0 ? "none" : "grid";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatarDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatarDuracao(ms) {
  if (ms == null || isNaN(ms) || ms < 0) return "—";
  const horasTotais = ms / (1000 * 60 * 60);
  if (horasTotais < 24) {
    const h = Math.floor(horasTotais);
    const m = Math.round((horasTotais - h) * 60);
    return `${h}h ${m}min`;
  }
  const dias = Math.floor(horasTotais / 24);
  const horasRestantes = Math.round(horasTotais % 24);
  return `${dias}d ${horasRestantes}h`;
}

/* ============================================================
   VISUALIZAÇÃO EM TABELA (editável, estilo planilha/Excel)
   ============================================================ */

function alternarView(view) {
  state.view = view;
  salvarDados();

  document.getElementById("viewKanbanBtn").classList.toggle("active", view === "kanban");
  document.getElementById("viewTableBtn").classList.toggle("active", view === "tabela");
  document.getElementById("viewSlaBtn").classList.toggle("active", view === "sla");

  const board = document.getElementById("board");
  const tableWrap = document.getElementById("tableViewWrap");
  const slaWrap = document.getElementById("slaViewWrap");
  const empty = document.getElementById("emptyState");

  tableWrap.classList.remove("visible");
  slaWrap.classList.remove("visible");
  board.style.display = "none";
  empty.classList.remove("visible");

  if (view === "kanban") {
    board.style.display = state.cards.length === 0 ? "none" : "grid";
    empty.classList.toggle("visible", state.cards.length === 0);
  } else if (view === "tabela") {
    tableWrap.classList.add("visible");
    renderizarTabela();
  } else if (view === "sla") {
    slaWrap.classList.add("visible");
    renderizarSLA();
  }
}

function renderizarTabela() {
  const cards = aplicarFiltrosOrdenacao(state.cards);
  const tbody = document.getElementById("dataTableBody");
  tbody.innerHTML = "";

  cards.forEach((card, rowIndex) => {
    tbody.appendChild(criarLinhaTabela(card, rowIndex));
  });

  if (cards.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="17" style="text-align:center;color:var(--gray-400);padding:26px;">
      Nenhuma filial encontrada. Ajuste os filtros, importe uma planilha ou clique em "Nova linha".
    </td>`;
    tbody.appendChild(tr);
  }
}

function celulaTexto(card, field, colIndex, placeholder) {
  const valor = card[field] || "";
  return `<td><div class="cell-editable ${valor ? "" : "cell-empty"}" contenteditable="true"
      data-id="${card.id}" data-field="${field}" data-row-index="__ROW__" data-col-index="${colIndex}"
      data-placeholder="${escapeHtml(placeholder)}" tabindex="0">${escapeHtml(valor)}</div></td>`;
}

function celulaChecklist(card, field, colIndex) {
  const checked = !!card.checklist[field];
  return `<td><div class="cell-check"><input type="checkbox" data-id="${card.id}" data-field="${field}"
      data-row-index="__ROW__" data-col-index="${colIndex}" ${checked ? "checked" : ""}></div></td>`;
}

function criarLinhaTabela(card, rowIndex) {
  const tr = document.createElement("tr");
  const stage = etapaAtual(card);
  const stageLabel = STAGES.find(s => s.id === stage).label;
  const progresso = calcularProgresso(card);

  let html =
    celulaTexto(card, "codigo", 0, "Código") +
    celulaTexto(card, "filial", 1, "Nome da filial") +
    celulaTexto(card, "competencia", 2, "MM/AAAA") +
    celulaTexto(card, "responsavel", 3, "Responsável") +
    celulaChecklist(card, "pedidosCompra", 4) +
    celulaChecklist(card, "notasDisponiveis", 5) +
    celulaChecklist(card, "pendenciasFiscais", 6) +
    celulaChecklist(card, "notasLancadas", 7) +
    celulaChecklist(card, "reclassificacao", 8) +
    celulaChecklist(card, "conferencia", 9) +
    celulaChecklist(card, "provisoes", 10) +
    celulaChecklist(card, "impostos", 11) +
    celulaChecklist(card, "contabilizacaoFinal", 12) +
    `<td><span class="cell-stage-badge" data-id="${card.id}" data-role="stage">
        <span class="dot" style="background:${STAGE_COLORS[stage]}"></span>${escapeHtml(stageLabel)}
     </span></td>` +
    `<td><div class="cell-progress" data-id="${card.id}" data-role="progress">
        <div class="progress-bar-track"><div class="progress-bar-fill ${progresso === 100 ? "done" : ""}" style="width:${progresso}%"></div></div>
        <div class="progress-label">${progresso}%</div>
     </div></td>` +
    `<td><div class="updated-by-cell" title="Última alteração">
        ${formatarDataHora(card.ultimaAtualizacao)}<br><span class="who">${escapeHtml(card.ultimoUsuario || "—")}</span>
     </div></td>` +
    `<td><div class="cell-delete"><button type="button" class="btn-delete-row" data-id="${card.id}" title="Excluir linha">
        <i class="fa-solid fa-trash"></i></button></div></td>`;

  tr.innerHTML = html.replaceAll("__ROW__", rowIndex);
  return tr;
}

// Atualiza apenas as células calculadas (etapa/progresso/data) de uma linha,
// sem redesenhar a tabela inteira — evita perder o foco durante a digitação.
function atualizarLinhaComputada(id) {
  const card = state.cards.find(c => c.id === id);
  if (!card) return;
  const stage = etapaAtual(card);
  const stageLabel = STAGES.find(s => s.id === stage).label;
  const progresso = calcularProgresso(card);

  const stageEl = document.querySelector(`.cell-stage-badge[data-id="${id}"]`);
  if (stageEl) {
    stageEl.innerHTML = `<span class="dot" style="background:${STAGE_COLORS[stage]}"></span>${escapeHtml(stageLabel)}`;
  }
  const progEl = document.querySelector(`.cell-progress[data-id="${id}"]`);
  if (progEl) {
    progEl.innerHTML = `<div class="progress-bar-track"><div class="progress-bar-fill ${progresso === 100 ? "done" : ""}" style="width:${progresso}%"></div></div>
      <div class="progress-label">${progresso}%</div>`;
  }
  const linha = document.querySelector(`.btn-delete-row[data-id="${id}"]`)?.closest("tr");
  if (linha) {
    const cellUpdated = linha.querySelector(".updated-by-cell");
    if (cellUpdated) {
      cellUpdated.innerHTML = `${formatarDataHora(card.ultimaAtualizacao)}<br><span class="who">${escapeHtml(card.ultimoUsuario || "—")}</span>`;
    }
  }
}

function commitTextField(id, field, valorBruto) {
  const card = state.cards.find(c => c.id === id);
  if (!card) return;
  const valor = valorBruto.trim();
  if (field === "responsavel") card.responsavel = valor || "Não definido";
  else card[field] = valor;
  const label = CAMPO_LABELS[field] || field;
  marcarAtualizacaoAgora(card, `Alterou "${label}" para "${valor || "(vazio)"}"`);
  salvarDados();
  popularFiltros();
  renderizarBoard();
  atualizarDashboard();
  atualizarLinhaComputada(id);
}

function commitChecklistField(id, field, checked) {
  const card = state.cards.find(c => c.id === id);
  if (!card) return;
  card.checklist[field] = checked;
  card.manualStage = null; // volta ao fluxo automático
  const label = CHECKLIST_LABELS[field] || field;
  marcarAtualizacaoAgora(card, `${checked ? "Marcou" : "Desmarcou"} "${label}"`);
  salvarDados();
  renderizarBoard();
  atualizarDashboard();
  atualizarLinhaComputada(id);
}

function adicionarLinha() {
  const novoCard = {
    id: `novo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    codigo: "",
    filial: "",
    competencia: "",
    responsavel: "Não definido",
    ultimaAtualizacao: new Date().toISOString(),
    ultimoUsuario: USUARIO_ATUAL || "Desconhecido",
    manualStage: null,
    historico: [],
    checklist: Object.fromEntries(ALL_CHECK_KEYS.map(k => [k, false]))
  };
  garantirStageLog(novoCard);
  atualizarProgressaoEtapas(novoCard);
  registrarHistorico(novoCard, "Linha criada manualmente na tabela");
  state.cards.push(novoCard);
  salvarDados();
  popularFiltros();
  renderizarTabela();
  atualizarDashboard();

  const primeiraCelula = document.querySelector(`.cell-editable[data-id="${novoCard.id}"][data-field="codigo"]`);
  if (primeiraCelula) primeiraCelula.focus();
}

function excluirLinha(id) {
  const card = state.cards.find(c => c.id === id);
  if (!card) return;
  if (!confirm(`Excluir a linha da filial "${card.filial || card.codigo || "sem nome"}"?`)) return;
  state.cards = state.cards.filter(c => c.id !== id);
  salvarDados();
  popularFiltros();
  renderizarTabela();
  renderizarBoard();
  atualizarDashboard();
}

function getCaretOffset(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}

function irParaCelula(rowIndex, colIndex) {
  if (rowIndex < 0 || colIndex < 0 || colIndex >= TABLE_COLUMNS.length) return;
  const el = document.querySelector(
    `#dataTableBody [data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`
  );
  if (el) el.focus();
}

function configurarEventosTabela() {
  const tbody = document.getElementById("dataTableBody");

  tbody.addEventListener("input", e => {
    const el = e.target;
    if (!el.classList || !el.classList.contains("cell-editable")) return;
    el.classList.toggle("cell-empty", el.textContent.trim() === "");
    commitTextField(el.dataset.id, el.dataset.field, el.textContent);
  });

  tbody.addEventListener("change", e => {
    const el = e.target;
    if (el.matches('input[type="checkbox"]')) {
      commitChecklistField(el.dataset.id, el.dataset.field, el.checked);
    }
  });

  tbody.addEventListener("click", e => {
    const btn = e.target.closest(".btn-delete-row");
    if (btn) excluirLinha(btn.dataset.id);
  });

  tbody.addEventListener("keydown", e => {
    const el = e.target.closest("[data-row-index]");
    if (!el) return;
    const row = parseInt(el.dataset.rowIndex, 10);
    const col = parseInt(el.dataset.colIndex, 10);
    const isText = el.classList.contains("cell-editable");
    const isDate = el.matches('input[type="date"]');

    if (e.key === "Enter") {
      e.preventDefault();
      if (isText) el.blur();
      irParaCelula(row + 1, col);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (col < TABLE_COLUMNS.length - 1) irParaCelula(row, col + 1);
      else irParaCelula(row + 1, 0);
    } else if (e.key === "ArrowUp" && !isDate) {
      e.preventDefault();
      irParaCelula(row - 1, col);
    } else if (e.key === "ArrowDown" && !isDate) {
      e.preventDefault();
      irParaCelula(row + 1, col);
    } else if (e.key === "ArrowLeft" && isText) {
      if (getCaretOffset(el) === 0) { e.preventDefault(); irParaCelula(row, col - 1); }
    } else if (e.key === "ArrowRight" && isText) {
      if (getCaretOffset(el) >= el.textContent.length) { e.preventDefault(); irParaCelula(row, col + 1); }
    } else if (e.key === "Escape" && isText) {
      el.blur();
    }
  });
}

/* ============================================================
   SLA — prazos por etapa, gráfico e exportação
   ============================================================ */

const SLA_LABELS = { suprimentos: "Suprimentos", fiscal: "Fiscal / Central de Notas", planejamento: "Planejamento Financeiro", contabilidade: "Contabilidade" };

// Calcula status/duração de uma etapa específica de um cartão para fins de SLA
function calcularInfoEtapaSLA(card, stageId) {
  garantirStageLog(card);
  const log = card.stageLog[stageId];
  const metaMs = (state.slaTargets[stageId] || SLA_META_PADRAO[stageId]) * 60 * 60 * 1000;

  if (!log.iniciadoEm) return { status: "pending", iniciadoEm: null, concluidoEm: null, duracaoMs: null, metaMs };

  if (log.concluidoEm) {
    const duracaoMs = new Date(log.concluidoEm) - new Date(log.iniciadoEm);
    return { status: duracaoMs <= metaMs ? "ok" : "late", iniciadoEm: log.iniciadoEm, concluidoEm: log.concluidoEm, duracaoMs, metaMs, concluidoPor: log.concluidoPor };
  }

  const duracaoMs = Date.now() - new Date(log.iniciadoEm);
  return { status: duracaoMs > metaMs ? "late" : "progress", iniciadoEm: log.iniciadoEm, concluidoEm: null, duracaoMs, metaMs };
}

function renderizarSLA() {
  document.getElementById("slaMetaSuprimentos").value = state.slaTargets.suprimentos;
  document.getElementById("slaMetaFiscal").value = state.slaTargets.fiscal;
  document.getElementById("slaMetaPlanejamento").value = state.slaTargets.planejamento;
  document.getElementById("slaMetaContabilidade").value = state.slaTargets.contabilidade;
  document.getElementById("slaPrintDate").textContent = `Gerado em ${formatarDataHora(new Date().toISOString())}`;

  const cards = aplicarFiltrosOrdenacao(state.cards);

  // -------- KPIs --------
  let concluidasNoPrazo = 0, concluidasTotal = 0, emAtraso = 0, emAndamento = 0;
  cards.forEach(card => {
    ORDEM_ETAPAS_SLA.forEach(stageId => {
      const info = calcularInfoEtapaSLA(card, stageId);
      if (info.status === "ok") { concluidasNoPrazo++; concluidasTotal++; }
      else if (info.status === "late") { emAtraso++; if (info.concluidoEm) concluidasTotal++; }
      else if (info.status === "progress") emAndamento++;
    });
  });
  const percentualNoPrazo = concluidasTotal ? Math.round((concluidasNoPrazo / concluidasTotal) * 100) : 0;

  const kpiEl = document.getElementById("slaKpis");
  kpiEl.innerHTML = `
    <div class="sla-kpi neutral">
      <span class="sla-kpi-value">${cards.length}</span>
      <span class="sla-kpi-label">Filiais no relatório</span>
    </div>
    <div class="sla-kpi ok">
      <span class="sla-kpi-value">${percentualNoPrazo}%</span>
      <span class="sla-kpi-label">Etapas concluídas dentro do prazo</span>
    </div>
    <div class="sla-kpi warn">
      <span class="sla-kpi-value">${emAtraso}</span>
      <span class="sla-kpi-label">Etapas em atraso (concluídas ou em andamento)</span>
    </div>
    <div class="sla-kpi neutral">
      <span class="sla-kpi-value">${emAndamento}</span>
      <span class="sla-kpi-label">Etapas em andamento, dentro do prazo</span>
    </div>
  `;

  // -------- Gráfico: duração média x meta --------
  const mediasPorEtapa = ORDEM_ETAPAS_SLA.map(stageId => {
    const duracoes = cards
      .map(card => calcularInfoEtapaSLA(card, stageId))
      .filter(info => info.concluidoEm)
      .map(info => info.duracaoMs / (1000 * 60 * 60));
    const media = duracoes.length ? duracoes.reduce((a, b) => a + b, 0) / duracoes.length : 0;
    return Math.round(media * 10) / 10;
  });
  const metasPorEtapa = ORDEM_ETAPAS_SLA.map(id => state.slaTargets[id] || SLA_META_PADRAO[id]);

  const ctx = document.getElementById("chartSla");
  const dadosChart = {
    labels: ORDEM_ETAPAS_SLA.map(id => SLA_LABELS[id]),
    datasets: [
      { label: "Duração média real (h)", data: mediasPorEtapa, backgroundColor: "#2563EB", borderRadius: 5 },
      { label: "Meta de SLA (h)", data: metasPorEtapa, backgroundColor: "#E5E7EB", borderRadius: 5 }
    ]
  };
  if (chartSla) {
    chartSla.data = dadosChart;
    chartSla.update();
  } else {
    chartSla = new Chart(ctx, {
      type: "bar",
      data: dadosChart,
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11.5 } } } },
        scales: { y: { beginAtZero: true, title: { display: true, text: "Horas" } } }
      }
    });
  }

  // -------- Tabela detalhada --------
  const tbody = document.getElementById("slaTableBody");
  tbody.innerHTML = "";

  if (cards.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--gray-400);padding:26px;">Nenhuma filial encontrada.</td></tr>`;
    return;
  }

  cards.forEach(card => {
    const tr = document.createElement("tr");
    const celulasEtapas = ORDEM_ETAPAS_SLA.map(stageId => celulaSLA(calcularInfoEtapaSLA(card, stageId))).join("");

    tr.innerHTML = `
      <td>#${escapeHtml(card.codigo)}</td>
      <td>${escapeHtml(card.filial)}</td>
      <td>${escapeHtml(card.responsavel)}</td>
      ${celulasEtapas}
      <td>${card.dataConclusaoFinal
          ? `<div class="sla-cell"><span class="sla-time">${formatarDataHora(card.dataConclusaoFinal)}</span><span class="updated-by-cell"><span class="who">${escapeHtml(card.concluidoPor || "—")}</span></span></div>`
          : `<span class="sla-status pending">Em aberto</span>`}
      </td>
      <td><div class="updated-by-cell">${formatarDataHora(card.ultimaAtualizacao)}<br><span class="who">${escapeHtml(card.ultimoUsuario || "—")}</span></div></td>
    `;
    tbody.appendChild(tr);
  });
}

function celulaSLA(info) {
  const statusMap = {
    pending: { texto: "Não iniciado", classe: "pending" },
    progress: { texto: "Em andamento", classe: "progress" },
    ok: { texto: "No prazo", classe: "ok" },
    late: { texto: info.concluidoEm ? "Concluído com atraso" : "Em atraso", classe: "late" }
  };
  const s = statusMap[info.status];
  return `<td>
    <div class="sla-cell">
      <span class="sla-status ${s.classe}">${s.texto}</span>
      <span class="sla-time">Início: ${formatarDataHora(info.iniciadoEm)}</span>
      ${info.concluidoEm ? `<span class="sla-time">Fim: ${formatarDataHora(info.concluidoEm)}</span>` : ""}
      ${info.duracaoMs != null ? `<span class="sla-duration">${formatarDuracao(info.duracaoMs)}</span>` : ""}
    </div>
  </td>`;
}

function configurarEventosSLA() {
  const salvarMetas = () => {
    state.slaTargets.suprimentos = Number(document.getElementById("slaMetaSuprimentos").value) || SLA_META_PADRAO.suprimentos;
    state.slaTargets.fiscal = Number(document.getElementById("slaMetaFiscal").value) || SLA_META_PADRAO.fiscal;
    state.slaTargets.planejamento = Number(document.getElementById("slaMetaPlanejamento").value) || SLA_META_PADRAO.planejamento;
    state.slaTargets.contabilidade = Number(document.getElementById("slaMetaContabilidade").value) || SLA_META_PADRAO.contabilidade;
    salvarDados();
    renderizarSLA();
  };
  ["slaMetaSuprimentos", "slaMetaFiscal", "slaMetaPlanejamento", "slaMetaContabilidade"].forEach(id => {
    document.getElementById(id).addEventListener("change", salvarMetas);
  });

  document.getElementById("btnExportarSla").addEventListener("click", () => window.print());
}

/* ============================================================
   DASHBOARD / INDICADORES / GRÁFICO
   ============================================================ */

function atualizarDashboard() {
  const cards = state.cards;
  const contagem = { suprimentos: 0, fiscal: 0, planejamento: 0, contabilidade: 0, concluido: 0 };
  let somaProgresso = 0;

  cards.forEach(card => {
    contagem[etapaAtual(card)]++;
    somaProgresso += calcularProgresso(card);
  });

  const percentualGeral = cards.length ? Math.round(somaProgresso / cards.length) : 0;

  document.getElementById("kpiTotal").textContent = cards.length;
  document.getElementById("kpiConcluidas").textContent = contagem.concluido;
  document.getElementById("kpiSuprimentos").textContent = contagem.suprimentos;
  document.getElementById("kpiFiscal").textContent = contagem.fiscal;
  document.getElementById("kpiPlanejamento").textContent = contagem.planejamento;
  document.getElementById("kpiContabilidade").textContent = contagem.contabilidade;
  document.getElementById("kpiPercentual").textContent = `${percentualGeral}%`;

  atualizarGrafico(percentualGeral);
}

function atualizarGrafico(percentual) {
  const ctx = document.getElementById("chartGeral");
  const dados = {
    datasets: [{
      data: [percentual, 100 - percentual],
      backgroundColor: ["#2563EB", "#E5E7EB"],
      borderWidth: 0
    }]
  };
  if (chartGeral) {
    chartGeral.data = dados;
    chartGeral.update();
  } else {
    chartGeral = new Chart(ctx, {
      type: "doughnut",
      data: dados,
      options: {
        cutout: "72%",
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { duration: 400 }
      }
    });
  }
}

/* ============================================================
   FILTROS (popular selects dinamicamente)
   ============================================================ */

function popularFiltros() {
  popularSelect("filterCompetencia", [...new Set(state.cards.map(c => c.competencia))].filter(Boolean).sort(), "Competência (todas)");
  popularSelect("filterFilial", [...new Set(state.cards.map(c => c.filial))].filter(Boolean).sort(), "Filial (todas)");
  popularSelect("filterResponsavel", [...new Set(state.cards.map(c => c.responsavel))].filter(Boolean).sort(), "Responsável (todos)");
}

function popularSelect(id, valores, placeholder) {
  const select = document.getElementById(id);
  const atual = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>` +
    valores.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if (valores.includes(atual)) select.value = atual;
}

/* ============================================================
   MODAL DE DETALHES DO CARTÃO
   ============================================================ */

function abrirModal(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;
  garantirStageLog(card);
  activeModalCardId = cardId;

  document.getElementById("modalCode").textContent = `#${card.codigo}`;
  document.getElementById("modalTitle").textContent = card.filial;

  const progresso = calcularProgresso(card);

  let html = `
    <div class="card-updated-by">
      <i class="fa-regular fa-clock"></i>
      Última alteração em <strong>${formatarDataHora(card.ultimaAtualizacao)}</strong> por <strong>${escapeHtml(card.ultimoUsuario || "—")}</strong>
    </div>

    <div class="modal-meta-grid">
      <div>
        <label>Competência</label>
        <input type="text" id="editCompetencia" value="${escapeHtml(card.competencia)}">
      </div>
      <div>
        <label>Responsável</label>
        <input type="text" id="editResponsavel" value="${escapeHtml(card.responsavel)}">
      </div>
      <div>
        <label>Etapa atual</label>
        <select id="editEtapa">
          ${STAGES.map(s => `<option value="${s.id}" ${etapaAtual(card) === s.id ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="modal-progress">
      <div class="progress-bar-track">
        <div class="progress-bar-fill ${progresso === 100 ? "done" : ""}" style="width:${progresso}%"></div>
      </div>
      <div class="progress-label">${progresso}% concluído</div>
    </div>
  `;

  STAGES.filter(s => s.items.length).forEach(stage => {
    html += `<div class="checklist-group">
      <h3><span class="dot" style="background:${STAGE_COLORS[stage.id]}"></span>${stage.label}</h3>`;
    stage.items.forEach(item => {
      const checked = card.checklist[item.key];
      html += `
        <div class="checklist-item ${checked ? "checked" : ""}">
          <input type="checkbox" id="chk-${item.key}" data-key="${item.key}" ${checked ? "checked" : ""}>
          <label for="chk-${item.key}">
            <span class="item-title">${escapeHtml(item.title)}</span>
            ${item.desc ? `<span class="item-desc">${escapeHtml(item.desc)}</span>` : ""}
          </label>
        </div>`;
    });
    html += `</div>`;
  });

  html += `<div class="historico-section">
    <h3><i class="fa-solid fa-clock-rotate-left"></i> Histórico de alterações</h3>
    <div class="historico-list">
      ${(card.historico && card.historico.length)
        ? card.historico.slice(0, 10).map(h => `
          <div class="historico-item">
            <span class="h-acao">${escapeHtml(h.acao)}</span>
            <span class="h-meta">${escapeHtml(h.usuario)} · ${formatarDataHora(h.quando)}</span>
          </div>`).join("")
        : `<div class="historico-empty">Nenhuma alteração registrada ainda.</div>`}
    </div>
  </div>`;

  document.getElementById("modalBody").innerHTML = html;

  // eventos do checklist (reaproveita a mesma lógica da tabela/kanban)
  document.querySelectorAll("#modalBody input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", () => {
      commitChecklistField(card.id, cb.dataset.key, cb.checked);
      popularFiltros();
      abrirModal(cardId); // re-renderiza modal com novo progresso/etapa/histórico
    });
  });

  // eventos dos campos editáveis
  document.getElementById("editCompetencia").addEventListener("change", e => {
    commitTextField(card.id, "competencia", e.target.value);
  });
  document.getElementById("editResponsavel").addEventListener("change", e => {
    commitTextField(card.id, "responsavel", e.target.value);
  });
  document.getElementById("editEtapa").addEventListener("change", e => {
    card.manualStage = e.target.value;
    const label = STAGES.find(s => s.id === e.target.value).label;
    marcarAtualizacaoAgora(card, `Moveu manualmente para "${label}"`);
    salvarDados();
    renderizarTudo(false);
  });

  document.getElementById("modalOverlay").classList.add("visible");
}

function fecharModal() {
  document.getElementById("modalOverlay").classList.remove("visible");
  activeModalCardId = null;
}

/* ============================================================
   DRAG AND DROP entre colunas
   ============================================================ */

function configurarDragAndDrop() {
  document.querySelectorAll(".column-body").forEach(coluna => {
    coluna.addEventListener("dragover", e => {
      e.preventDefault();
      coluna.classList.add("drag-over");
    });
    coluna.addEventListener("dragleave", () => coluna.classList.remove("drag-over"));
    coluna.addEventListener("drop", e => {
      e.preventDefault();
      coluna.classList.remove("drag-over");
      const dragging = document.querySelector(".card.dragging");
      if (!dragging) return;
      const card = state.cards.find(c => c.id === dragging.dataset.id);
      if (!card) return;
      card.manualStage = coluna.dataset.stage;
      const label = STAGES.find(s => s.id === coluna.dataset.stage).label;
      marcarAtualizacaoAgora(card, `Moveu (arrastar) para "${label}"`);
      salvarDados();
      renderizarTudo(false);
    });
  });
}

/* ============================================================
   RENDER GERAL
   ============================================================ */

function renderizarTudo(atualizarFiltros = true) {
  if (atualizarFiltros) popularFiltros();
  renderizarBoard();
  if (state.view === "tabela") renderizarTabela();
  if (state.view === "sla") renderizarSLA();
  atualizarDashboard();
}

/* ============================================================
   EVENTOS DE INTERFACE
   ============================================================ */

function configurarEventos() {
  const fileInput = document.getElementById("fileInput");

  document.getElementById("btnImport").addEventListener("click", () => fileInput.click());
  document.getElementById("btnImportEmpty").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", e => {
    if (e.target.files.length) importarExcel(e.target.files[0]);
    fileInput.value = "";
  });

  document.getElementById("btnTemplate").addEventListener("click", baixarModelo);

  document.getElementById("btnReset").addEventListener("click", () => {
    if (confirm("Isso apagará todos os dados salvos localmente. Deseja continuar?")) {
      state.cards = [];
      salvarDados();
      renderizarTudo();
    }
  });

  document.getElementById("searchInput").addEventListener("input", e => {
    state.filters.search = e.target.value;
    renderizarBoard();
  });

  document.getElementById("filterCompetencia").addEventListener("change", e => {
    state.filters.competencia = e.target.value; renderizarBoard();
  });
  document.getElementById("filterFilial").addEventListener("change", e => {
    state.filters.filial = e.target.value; renderizarBoard();
  });
  document.getElementById("filterResponsavel").addEventListener("change", e => {
    state.filters.responsavel = e.target.value; renderizarBoard();
  });
  document.getElementById("filterEtapa").addEventListener("change", e => {
    state.filters.etapa = e.target.value; renderizarBoard();
  });
  document.getElementById("sortSelect").addEventListener("change", e => {
    state.sort = e.target.value; salvarDados(); renderizarBoard();
  });

  document.getElementById("btnClearFilters").addEventListener("click", () => {
    state.filters = { search: "", competencia: "", filial: "", responsavel: "", etapa: "" };
    document.getElementById("searchInput").value = "";
    document.getElementById("filterCompetencia").value = "";
    document.getElementById("filterFilial").value = "";
    document.getElementById("filterResponsavel").value = "";
    document.getElementById("filterEtapa").value = "";
    renderizarBoard();
  });

  document.getElementById("viewKanbanBtn").addEventListener("click", () => alternarView("kanban"));
  document.getElementById("viewTableBtn").addEventListener("click", () => alternarView("tabela"));
  document.getElementById("viewSlaBtn").addEventListener("click", () => alternarView("sla"));
  document.getElementById("btnAddRow").addEventListener("click", adicionarLinha);
  configurarEventosTabela();
  configurarEventosSLA();

  document.getElementById("modalClose").addEventListener("click", fecharModal);
  document.getElementById("modalOverlay").addEventListener("click", e => {
    if (e.target.id === "modalOverlay") fecharModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") fecharModal();
  });

  configurarDragAndDrop();
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

/* ============================================================
   LOGIN / IDENTIFICAÇÃO DO USUÁRIO
   ============================================================ */

function abrirLogin(bloqueante) {
  const overlay = document.getElementById("loginOverlay");
  const input = document.getElementById("loginNomeInput");
  input.value = bloqueante ? "" : (USUARIO_ATUAL || "");
  overlay.classList.add("visible");
  overlay.dataset.bloqueante = bloqueante ? "1" : "0";
  setTimeout(() => input.focus(), 50);
}

function confirmarLogin() {
  const input = document.getElementById("loginNomeInput");
  const nome = input.value.trim();
  if (!nome) { input.focus(); return; }
  const primeiroAcesso = !USUARIO_ATUAL;
  salvarUsuario(nome);
  document.getElementById("loginOverlay").classList.remove("visible");
  if (primeiroAcesso) {
    renderizarTudo();
    alternarView(state.view);
  }
}

function configurarEventosLogin() {
  document.getElementById("btnLoginEntrar").addEventListener("click", confirmarLogin);
  document.getElementById("loginNomeInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); confirmarLogin(); }
  });
  document.getElementById("btnTrocarUsuario").addEventListener("click", () => abrirLogin(false));
  document.getElementById("loginOverlay").addEventListener("click", e => {
    if (e.target.id === "loginOverlay" && document.getElementById("loginOverlay").dataset.bloqueante !== "1") {
      document.getElementById("loginOverlay").classList.remove("visible");
    }
  });
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

function iniciar() {
  carregarDados();
  document.getElementById("sortSelect").value = state.sort;
  configurarEventos();
  configurarEventosLogin();

  if (typeof GRAPH_CONFIG !== "undefined" && GRAPH_CONFIG.GRAPH_SYNC_ENABLED && typeof iniciarComMicrosoft === "function") {
    iniciarComMicrosoft();
    return;
  }

  const usuarioSalvo = obterUsuarioSalvo();
  if (usuarioSalvo) {
    salvarUsuario(usuarioSalvo);
    renderizarTudo();
    alternarView(state.view);
  } else {
    abrirLogin(true);
  }
}

document.addEventListener("DOMContentLoaded", iniciar);
