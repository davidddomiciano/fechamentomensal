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

// Ordem das colunas focáveis (editáveis) na tabela — usada na navegação por teclado.
// Gerada automaticamente a partir de ALL_CHECK_KEYS: ao adicionar/remover um item
// do checklist em STAGES, esta lista se ajusta sozinha (não precisa editar aqui).
const TABLE_COLUMNS = ["competencia", ...ALL_CHECK_KEYS];

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
  slaTargets: { ...SLA_META_PADRAO },
  historicoMeses: [] // meses encerrados/arquivados: [{ competencia, arquivadoEm, arquivadoPor, cards: [...] }]
};

let chartGeral = null;
let chartSla = null;
let chartSlaHistorico = null;
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
      slaTargets: state.slaTargets,
      historicoMeses: state.historicoMeses
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
    if (Array.isArray(parsed.historicoMeses)) state.historicoMeses = parsed.historicoMeses;
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
// e o itemLog (quem marcou cada item do checklist, e quando).
function garantirStageLog(card) {
  if (!card.stageLog) card.stageLog = {};
  ORDEM_ETAPAS_SLA.forEach(id => {
    if (!card.stageLog[id]) card.stageLog[id] = { iniciadoEm: null, concluidoEm: null, concluidoPor: null };
  });
  if (!card.itemLog) card.itemLog = {};
  ALL_CHECK_KEYS.forEach(key => {
    if (!card.itemLog[key]) card.itemLog[key] = { marcadoPor: null, marcadoEm: null };
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
   IMPORTAÇÃO/EXPORTAÇÃO DE EXCEL (SheetJS)
   ============================================================ */

// Usado também pelo modo de sincronização via Microsoft Graph (graph-sync.js)
// para interpretar os valores "Sim"/"Não" lidos da planilha do OneDrive/SharePoint.
function valorVerdadeiro(v) {
  if (v === true) return true;
  if (v === false || v === undefined || v === null || v === "") return false;
  const s = String(v).trim().toLowerCase();
  return ["1", "x", "sim", "s", "ok", "concluído", "concluido", "true", "yes"].includes(s);
}

// Exporta os dados ATUAIS (não um modelo em branco) — útil como backup
// antes de limpar/reiniciar, ou para levar um retrato do momento para fora do app.
function exportarDadosAtuais() {
  if (!state.cards.length) { alert("Não há dados para exportar."); return; }

  const header = [
    "Competência", "Código", "Filial", "Responsável", "Etapa Atual", "Progresso (%)",
    "Pedidos Compra", "Notas Disponíveis", "Pendências Fiscais", "Notas Lançadas",
    "Reclassificação", "Conferência", "Provisões", "Impostos", "Contabilização Final",
    "Última Atualização", "Último Usuário"
  ];
  const linhas = state.cards.map(card => ({
    "Competência": card.competencia,
    "Código": card.codigo,
    "Filial": card.filial,
    "Responsável": card.responsavel,
    "Etapa Atual": STAGES.find(s => s.id === etapaAtual(card))?.label || "",
    "Progresso (%)": calcularProgresso(card),
    "Pedidos Compra": card.checklist.pedidosCompra ? "Sim" : "Não",
    "Notas Disponíveis": card.checklist.notasDisponiveis ? "Sim" : "Não",
    "Pendências Fiscais": card.checklist.pendenciasFiscais ? "Sim" : "Não",
    "Notas Lançadas": card.checklist.notasLancadas ? "Sim" : "Não",
    "Reclassificação": card.checklist.reclassificacao ? "Sim" : "Não",
    "Conferência": card.checklist.conferencia ? "Sim" : "Não",
    "Provisões": card.checklist.provisoes ? "Sim" : "Não",
    "Impostos": card.checklist.impostos ? "Sim" : "Não",
    "Contabilização Final": card.checklist.contabilizacaoFinal ? "Sim" : "Não",
    "Última Atualização": formatarDataHora(card.ultimaAtualizacao),
    "Último Usuário": card.ultimoUsuario || ""
  }));
  const ws = XLSX.utils.json_to_sheet(linhas, { header });
  ws["!cols"] = header.map(h => ({ wch: Math.max(14, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Fechamento");
  const dataHoje = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `backup_fechamento_${dataHoje}.xlsx`);
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
      ${atrasado ? `<span class="card-alert" title="${dias} dias sem atualização"><i class="fa-solid fa-triangle-exclamation"></i></span>` : ""}
    </div>
    <p class="card-name">${escapeHtml(rotuloFilial(card))}</p>
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

// Exibe código + descrição da filial sempre juntos, ex: "101 - Corporativo"
function rotuloFilial(card) {
  const codigo = card.codigo || "—";
  const filial = card.filial || "(sem filial)";
  return `${codigo} - ${filial}`;
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

// Gera as colunas de checklist do cabeçalho da Tabela a partir de STAGES.
// Rodar uma vez basta: ao adicionar/remover um item em STAGES, só é
// preciso recarregar a página — não precisa editar HTML nenhum.
function renderizarCabecalhoTabela() {
  const placeholder = document.getElementById("checklistHeadersPlaceholder");
  if (!placeholder) return;
  const itens = STAGES.flatMap(s => s.items);
  const html = itens.map(item =>
    `<th class="col-check" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</th>`
  ).join("");
  placeholder.outerHTML = html;
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
    tr.innerHTML = `<td colspan="16" style="text-align:center;color:var(--gray-400);padding:26px;">
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
    `<td><div class="cell-readonly" data-role="filial" title="Para trocar a filial, exclua esta linha e adicione novamente">${escapeHtml(rotuloFilial(card))}</div></td>` +
    celulaTexto(card, "competencia", 0, "MM/AAAA") +
    `<td><div class="cell-readonly" data-role="responsavel" title="Definido automaticamente por quem marca o checklist">${escapeHtml(card.responsavel || "—")}</div></td>` +
    ALL_CHECK_KEYS.map((key, i) => celulaChecklist(card, key, i + 1)).join("") +
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
    const cellResponsavel = linha.querySelector('.cell-readonly[data-role="responsavel"]');
    if (cellResponsavel) cellResponsavel.textContent = card.responsavel || "—";
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
  card[field] = valor;
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
  garantirStageLog(card);
  card.checklist[field] = checked;
  card.manualStage = null; // volta ao fluxo automático

  if (checked) {
    card.itemLog[field] = { marcadoPor: USUARIO_ATUAL || "Desconhecido", marcadoEm: new Date().toISOString() };
    card.responsavel = USUARIO_ATUAL || card.responsavel || "Não definido"; // quem faz o check vira o responsável
  } else {
    card.itemLog[field] = { marcadoPor: null, marcadoEm: null };
  }

  const label = CHECKLIST_LABELS[field] || field;
  marcarAtualizacaoAgora(card, `${checked ? "Marcou" : "Desmarcou"} "${label}"`);
  salvarDados();
  popularFiltros();
  renderizarBoard();
  atualizarDashboard();
  atualizarLinhaComputada(id);
}

function adicionarLinha(codigo, filial) {
  if (!codigo || !filial) { alert("Selecione uma filial na lista antes de adicionar."); return; }

  const novoCard = {
    id: `novo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    codigo,
    filial,
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
  registrarHistorico(novoCard, "Linha adicionada manualmente na tabela");
  state.cards.push(novoCard);
  salvarDados();
  popularFiltros();
  renderizarTabela();
  atualizarDashboard();

  const primeiraCelula = document.querySelector(`.cell-editable[data-id="${novoCard.id}"][data-field="competencia"]`);
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
  renderizarCabecalhoTabela();
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

  renderizarComparativoMeses();

  if (cards.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--gray-400);padding:26px;">Nenhuma filial encontrada.</td></tr>`;
    return;
  }

  cards.forEach(card => {
    const tr = document.createElement("tr");
    const celulasEtapas = ORDEM_ETAPAS_SLA.map(stageId => celulaSLA(calcularInfoEtapaSLA(card, stageId))).join("");

    tr.innerHTML = `
      <td>${escapeHtml(rotuloFilial(card))}</td>
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

/* ---------- Arquivamento mensal (para comparativo histórico de SLA) ---------- */

function proximaCompetencia(competencia) {
  const m = String(competencia || "").match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  let [, mes, ano] = m.map(Number);
  mes += 1;
  if (mes > 12) { mes = 1; ano += 1; }
  return `${String(mes).padStart(2, "0")}/${ano}`;
}

function arquivarCompetenciaAtual() {
  if (!state.cards.length) { alert("Não há filiais para arquivar."); return; }

  const contagem = {};
  state.cards.forEach(c => { if (c.competencia) contagem[c.competencia] = (contagem[c.competencia] || 0) + 1; });
  const competencias = Object.keys(contagem);
  let competenciaAlvo = competencias.sort((a, b) => contagem[b] - contagem[a])[0] || "";

  const escolhida = prompt(
    "Encerrar e arquivar qual competência? (as filiais dessa competência serão salvas no histórico do SLA e terão o checklist reiniciado para o novo mês)",
    competenciaAlvo
  );
  if (!escolhida) return;
  competenciaAlvo = escolhida.trim();

  const cardsDoMes = state.cards.filter(c => c.competencia === competenciaAlvo);
  if (!cardsDoMes.length) { alert(`Nenhuma filial encontrada com a competência "${competenciaAlvo}".`); return; }

  const novaCompetencia = prompt("Qual é a nova competência para essas filiais?", proximaCompetencia(competenciaAlvo) || "");
  if (!novaCompetencia) return;

  if (!confirm(`Isso vai arquivar ${cardsDoMes.length} filial(is) da competência "${competenciaAlvo}" no histórico do SLA e reiniciar o checklist delas para "${novaCompetencia.trim()}". Continuar?`)) return;

  state.historicoMeses.push({
    id: `mes-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    competencia: competenciaAlvo,
    arquivadoEm: new Date().toISOString(),
    arquivadoPor: USUARIO_ATUAL || "Desconhecido",
    cards: JSON.parse(JSON.stringify(cardsDoMes))
  });

  cardsDoMes.forEach(card => {
    card.competencia = novaCompetencia.trim();
    card.checklist = Object.fromEntries(ALL_CHECK_KEYS.map(k => [k, false]));
    card.manualStage = null;
    card.stageLog = null;
    card.itemLog = null;
    card.dataConclusaoFinal = null;
    card.concluidoPor = null;
    card.responsavel = "Não definido";
    garantirStageLog(card);
    marcarAtualizacaoAgora(card, `Mês "${competenciaAlvo}" arquivado — novo ciclo iniciado ("${novaCompetencia.trim()}")`);
  });

  salvarDados();
  popularFiltros();
  renderizarTudo();
  alert(`Competência "${competenciaAlvo}" arquivada. As filiais foram reiniciadas para "${novaCompetencia.trim()}".`);
}

// Calcula % de etapas concluídas no prazo para um conjunto de cartões (mês atual ou arquivado)
function metricasDoMes(cards) {
  let noPrazo = 0, total = 0, concluidos = 0;
  cards.forEach(card => {
    garantirStageLog(card);
    if (card.dataConclusaoFinal) concluidos++;
    ORDEM_ETAPAS_SLA.forEach(stageId => {
      const info = calcularInfoEtapaSLA(card, stageId);
      if (info.concluidoEm) {
        total++;
        if (info.status === "ok") noPrazo++;
      }
    });
  });
  return { filiais: cards.length, percentualNoPrazo: total ? Math.round((noPrazo / total) * 100) : 0, concluidos };
}

function renderizarComparativoMeses() {
  const card = document.getElementById("slaHistoricoCard");
  if (!state.historicoMeses.length) { card.style.display = "none"; return; }
  card.style.display = "block";

  garantirIdsHistoricoMeses(); // meses arquivados antes desta versão ainda não tinham id

  const mesesOrdenados = [...state.historicoMeses].sort((a, b) => a.arquivadoEm.localeCompare(b.arquivadoEm));
  const rotulos = mesesOrdenados.map(m => m.competencia);
  const percentuais = mesesOrdenados.map(m => metricasDoMes(m.cards).percentualNoPrazo);

  // inclui o mês corrente (dados ao vivo) como última barra, para comparação imediata
  const competenciaAtual = [...new Set(state.cards.map(c => c.competencia).filter(Boolean))].join(", ") || "Atual";
  rotulos.push(`${competenciaAtual} (atual)`);
  percentuais.push(metricasDoMes(state.cards).percentualNoPrazo);

  const ctx = document.getElementById("chartSlaHistorico");
  const dados = { labels: rotulos, datasets: [{ label: "% de etapas concluídas no prazo", data: percentuais, backgroundColor: "#16A34A", borderRadius: 5 }] };
  if (chartSlaHistorico) { chartSlaHistorico.data = dados; chartSlaHistorico.update(); }
  else {
    chartSlaHistorico = new Chart(ctx, {
      type: "bar",
      data: dados,
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: "% no prazo" } } } }
    });
  }

  const tbody = document.getElementById("slaHistoricoTableBody");
  tbody.innerHTML = mesesOrdenados.map(m => {
    const metricas = metricasDoMes(m.cards);
    return `<tr>
      <td>${escapeHtml(m.competencia)}</td>
      <td>${metricas.filiais}</td>
      <td>${metricas.percentualNoPrazo}%</td>
      <td>${metricas.concluidos}</td>
      <td>${formatarDataHora(m.arquivadoEm)} <span class="who">(${escapeHtml(m.arquivadoPor)})</span></td>
      <td><div class="cell-delete"><button type="button" class="btn-delete-row" data-mes-id="${m.id}" title="Excluir este mês arquivado">
        <i class="fa-solid fa-trash"></i></button></div></td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("button[data-mes-id]").forEach(btn => {
    btn.addEventListener("click", () => excluirMesArquivado(btn.dataset.mesId));
  });
}

function garantirIdsHistoricoMeses() {
  let alterou = false;
  state.historicoMeses.forEach(m => {
    if (!m.id) { m.id = `mes-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; alterou = true; }
  });
  if (alterou) salvarDados();
}

function excluirMesArquivado(id) {
  const mes = state.historicoMeses.find(m => m.id === id);
  if (!mes) return;
  if (!confirm(`Excluir o mês arquivado "${mes.competencia}" (arquivado em ${formatarDataHora(mes.arquivadoEm)} por ${mes.arquivadoPor})?\n\nIsso remove só esse registro do histórico/comparativo de SLA — não afeta as filiais ativas no Kanban/Tabela agora. Não pode ser desfeito.`)) return;

  state.historicoMeses = state.historicoMeses.filter(m => m.id !== id);
  salvarDados();
  renderizarSLA();
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
  document.getElementById("btnArquivarMes").addEventListener("click", arquivarCompetenciaAtual);
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
        <label>Responsável (automático)</label>
        <div class="modal-readonly-value" title="Definido automaticamente por quem marca o checklist">${escapeHtml(card.responsavel || "—")}</div>
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
      const log = card.itemLog?.[item.key];
      html += `
        <div class="checklist-item ${checked ? "checked" : ""}">
          <input type="checkbox" id="chk-${item.key}" data-key="${item.key}" ${checked ? "checked" : ""}>
          <label for="chk-${item.key}">
            <span class="item-title">${escapeHtml(item.title)}</span>
            ${item.desc ? `<span class="item-desc">${escapeHtml(item.desc)}</span>` : ""}
            ${checked && log?.marcadoPor ? `<span class="item-checked-by"><i class="fa-regular fa-circle-check"></i> ${escapeHtml(log.marcadoPor)} · ${formatarDataHora(log.marcadoEm)}</span>` : ""}
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
  document.getElementById("btnExportarDados").addEventListener("click", exportarDadosAtuais);

  document.getElementById("btnReset").addEventListener("click", () => {
    if (!confirm("Isso vai apagar todas as filiais e o progresso do fechamento atual salvos neste navegador. Recomendamos clicar em \"Exportar dados atuais\" antes, para guardar um backup. Deseja continuar mesmo assim?")) return;
    state.cards = [];
    salvarDados();
    renderizarTudo();

    if (state.historicoMeses.length &&
        confirm("Deseja também apagar o histórico de meses já arquivados (usado no comparativo de SLA)? Essa ação não pode ser desfeita.")) {
      state.historicoMeses = [];
      salvarDados();
      if (state.view === "sla") renderizarSLA();
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
  document.getElementById("btnIrParaTabela").addEventListener("click", () => alternarView("tabela"));
  document.getElementById("viewSlaBtn").addEventListener("click", () => alternarView("sla"));
  const selectNovaFilial = document.getElementById("selectNovaFilial");
  selectNovaFilial.innerHTML = FILIAIS_REF
    .map(f => `<option value="${escapeHtml(f.codigo)}|||${escapeHtml(f.nome)}">${escapeHtml(f.codigo)} - ${escapeHtml(f.nome)}</option>`)
    .join("");

  document.getElementById("btnAddRow").addEventListener("click", () => {
    const [codigo, filial] = selectNovaFilial.value.split("|||");
    adicionarLinha(codigo, filial);
  });
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
