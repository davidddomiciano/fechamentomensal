/* ============================================================
   graph-sync.js
   Login com conta Microsoft (MSAL.js) + leitura/gravação dos
   dados num arquivo Excel no OneDrive/SharePoint via Microsoft
   Graph, para que várias pessoas compartilhem o mesmo painel.

   Só entra em ação se GRAPH_CONFIG.GRAPH_SYNC_ENABLED = true
   (arquivo graph-config.js). Caso contrário este arquivo fica
   carregado mas inerte, e o app funciona 100% local, como antes.
   ============================================================ */

let msalApp = null;
let contaMsal = null;
let siteIdCache = null;
let ultimaEdicaoLocalEm = 0;
let timeoutSalvarGraph = null;
let intervaloAutoRefresh = null;
let sincronizando = false;

const GRAPH_COLUNAS = [
  "codigo", "filial", "competencia", "responsavel",
  "pedidosCompra", "notasDisponiveis", "pendenciasFiscais", "notasLancadas",
  "reclassificacao", "conferencia", "provisoes", "impostos", "contabilizacaoFinal",
  "manualStage", "ultimaAtualizacao", "ultimoUsuario", "dadosInternos"
];

/* ============================================================
   INICIALIZAÇÃO / LOGIN
   ============================================================ */

function graphSyncAtivo() {
  return typeof GRAPH_CONFIG !== "undefined" && GRAPH_CONFIG.GRAPH_SYNC_ENABLED;
}

async function iniciarComMicrosoft() {
  if (!window.msal) {
    console.error("Biblioteca MSAL não carregada. Verifique a tag <script> do msal-browser no index.html.");
    alert("Não foi possível carregar a biblioteca de login da Microsoft. Verifique sua conexão com a internet.");
    return;
  }

  msalApp = new msal.PublicClientApplication({
    auth: {
      clientId: GRAPH_CONFIG.clientId,
      authority: `https://login.microsoftonline.com/${GRAPH_CONFIG.tenantId}`,
      redirectUri: window.location.href.split("#")[0].split("?")[0]
    },
    cache: { cacheLocation: "localStorage" }
  });

  await msalApp.initialize();

  // trata o retorno de um eventual login por redirect
  const resposta = await msalApp.handleRedirectPromise().catch(err => {
    console.error("Erro ao finalizar login:", err);
    return null;
  });

  const contas = msalApp.getAllAccounts();
  if (resposta?.account) contaMsal = resposta.account;
  else if (contas.length) contaMsal = contas[0];

  document.getElementById("userBadge").style.display = "none";
  document.getElementById("btnLoginMicrosoft").style.display = "inline-flex";
  document.getElementById("btnLoginMicrosoft").addEventListener("click", loginMicrosoft);
  document.getElementById("btnGraphSync").addEventListener("click", () => carregarDeGraph(true));
  document.getElementById("btnLogoutMicrosoft").addEventListener("click", logoutMicrosoft);
  document.getElementById("btnPrepararPlanilha").addEventListener("click", prepararPlanilha);

  if (contaMsal) {
    await aposLoginMicrosoft();
  } else {
    // sem sessão ainda: mostra o app "vazio local" até a pessoa entrar
    renderizarTudo();
    alternarView(state.view);
  }
}

async function loginMicrosoft() {
  try {
    const resultado = await msalApp.loginPopup({
      scopes: ["User.Read", "Files.ReadWrite", "Sites.ReadWrite.All"]
    });
    contaMsal = resultado.account;
    await aposLoginMicrosoft();
  } catch (err) {
    console.error("Erro no login com Microsoft:", err);
    alert("Não foi possível entrar com a conta Microsoft. Veja o console para detalhes técnicos.");
  }
}

function logoutMicrosoft() {
  if (intervaloAutoRefresh) clearInterval(intervaloAutoRefresh);
  msalApp.logoutPopup({ account: contaMsal }).catch(() => {});
  contaMsal = null;
  document.getElementById("btnLoginMicrosoft").style.display = "inline-flex";
  document.getElementById("graphStatus").style.display = "none";
  document.getElementById("btnPrepararPlanilha").style.display = "none";
}

async function aposLoginMicrosoft() {
  document.getElementById("btnLoginMicrosoft").style.display = "none";
  document.getElementById("graphStatus").style.display = "flex";

  salvarUsuario(contaMsal.name || contaMsal.username || "Usuário Microsoft");
  document.getElementById("userBadgeName").textContent = "";

  atualizarStatusGraph("Conectando...");
  await carregarDeGraph(false);

  if (GRAPH_CONFIG.autoRefreshSeconds > 0) {
    intervaloAutoRefresh = setInterval(() => {
      // só busca automaticamente se a pessoa não estiver digitando algo agora mesmo
      if (Date.now() - ultimaEdicaoLocalEm > 4000) carregarDeGraph(false);
    }, GRAPH_CONFIG.autoRefreshSeconds * 1000);
  }
}

/* ============================================================
   CHAMADAS AO MICROSOFT GRAPH
   ============================================================ */

async function obterTokenGraph() {
  const escopos = ["User.Read", "Files.ReadWrite", "Sites.ReadWrite.All"];
  try {
    const resultado = await msalApp.acquireTokenSilent({ scopes: escopos, account: contaMsal });
    return resultado.accessToken;
  } catch (err) {
    const resultado = await msalApp.acquireTokenPopup({ scopes: escopos, account: contaMsal });
    return resultado.accessToken;
  }
}

async function graphFetch(url, options = {}) {
  const token = await obterTokenGraph();
  const resp = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!resp.ok) {
    const texto = await resp.text().catch(() => "");
    throw new Error(`Graph API ${resp.status}: ${texto}`);
  }
  return resp.status === 204 ? null : resp.json();
}

// Resolve o ID do site do SharePoint a partir da URL configurada (com cache)
async function resolverSiteId() {
  if (!GRAPH_CONFIG.sharePointSiteUrl) return null;
  if (siteIdCache) return siteIdCache;

  const url = new URL(GRAPH_CONFIG.sharePointSiteUrl);
  const hostname = url.hostname;
  const caminhoSite = url.pathname; // ex: /sites/Financeiro
  const dados = await graphFetch(`https://graph.microsoft.com/v1.0/sites/${hostname}:${caminhoSite}`);
  siteIdCache = dados.id;
  return siteIdCache;
}

async function baseWorkbookUrl() {
  const caminho = encodeURI(GRAPH_CONFIG.filePath);
  const siteId = await resolverSiteId();
  if (siteId) return `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:${caminho}:/workbook`;
  return `https://graph.microsoft.com/v1.0/me/drive/root:${caminho}:/workbook`;
}

/* ============================================================
   PREPARAR PLANILHA (passo único, feito uma vez pela equipe)
   ============================================================ */

// Transforma a linha de cabeçalho do arquivo (já enviado ao OneDrive/
// SharePoint a partir do modelo dados-onedrive.xlsx) numa Tabela do
// Excel, e formata as colunas de data como texto para evitar que o
// Excel "auto-corrija" os carimbos de data/hora.
async function prepararPlanilha() {
  try {
    atualizarStatusGraph("Preparando planilha...");
    const base = await baseWorkbookUrl();

    let tabelaExiste = false;
    try {
      await graphFetch(`${base}/tables/${GRAPH_CONFIG.tableName}`);
      tabelaExiste = true;
    } catch (e) { /* tabela ainda não existe, seguimos para criá-la */ }

    if (!tabelaExiste) {
      const ultimaColuna = String.fromCharCode(65 + GRAPH_COLUNAS.length - 1); // A=65
      await graphFetch(`${base}/worksheets('${GRAPH_CONFIG.sheetName}')/tables/add`, {
        method: "POST",
        body: JSON.stringify({ address: `A1:${ultimaColuna}1`, hasHeaders: true })
      });
      const tabelas = await graphFetch(`${base}/tables`);
      const tabelaCriada = tabelas.value[tabelas.value.length - 1];
      await graphFetch(`${base}/tables/${tabelaCriada.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: GRAPH_CONFIG.tableName })
      });
    }

    // Coluna "Última Atualização" (índice 14, 0-based) como texto — evita conversão automática de data
    const colunaData = String.fromCharCode(65 + 14);
    const linhasFormatadas = 300; // suficiente para o volume típico deste painel
    const matrizFormato = Array.from({ length: linhasFormatadas }, () => ["@"]);
    await graphFetch(`${base}/worksheets('${GRAPH_CONFIG.sheetName}')/range(address='${colunaData}2:${colunaData}${linhasFormatadas + 1}')`, {
      method: "PATCH",
      body: JSON.stringify({ numberFormat: matrizFormato })
    }).catch(() => {}); // best-effort; não trava o fluxo se a formatação falhar

    atualizarStatusGraph("Planilha pronta ✓");
    document.getElementById("btnPrepararPlanilha").style.display = "none";
    await carregarDeGraph(false);
  } catch (err) {
    console.error(err);
    atualizarStatusGraph("Erro ao preparar planilha");
    alert("Não foi possível preparar a planilha. Confirme se o arquivo já foi enviado ao caminho configurado em graph-config.js e se as permissões da API foram concedidas. Veja o console para detalhes.");
  }
}

/* ============================================================
   LEITURA / GRAVAÇÃO DOS DADOS
   ============================================================ */

function cardParaLinha(card) {
  const c = card.checklist;
  return [
    card.codigo || "", card.filial || "", card.competencia || "", card.responsavel || "",
    c.pedidosCompra ? "Sim" : "Não", c.notasDisponiveis ? "Sim" : "Não",
    c.pendenciasFiscais ? "Sim" : "Não", c.notasLancadas ? "Sim" : "Não",
    c.reclassificacao ? "Sim" : "Não", c.conferencia ? "Sim" : "Não", c.provisoes ? "Sim" : "Não",
    c.impostos ? "Sim" : "Não", c.contabilizacaoFinal ? "Sim" : "Não",
    card.manualStage || "",
    card.ultimaAtualizacao || "",
    card.ultimoUsuario || "",
    JSON.stringify({
      stageLog: card.stageLog, historico: card.historico,
      dataConclusaoFinal: card.dataConclusaoFinal, concluidoPor: card.concluidoPor
    })
  ];
}

function linhaParaCard(linha, idExistente) {
  const [codigo, filial, competencia, responsavel, pc, nd, pf, nl, rc, cf, pv, imp, cfn,
    manualStage, ultimaAtualizacao, ultimoUsuario, dadosInternosStr] = linha;

  let internos = {};
  try { internos = JSON.parse(dadosInternosStr || "{}"); } catch (e) { internos = {}; }

  const card = {
    id: idExistente || `${codigo}-${filial}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    codigo: String(codigo ?? "").trim(),
    filial: String(filial ?? "").trim(),
    competencia: String(competencia ?? "").trim(),
    responsavel: String(responsavel ?? "").trim() || "Não definido",
    manualStage: manualStage || null,
    ultimaAtualizacao: ultimaAtualizacao || new Date().toISOString(),
    ultimoUsuario: ultimoUsuario || "—",
    historico: Array.isArray(internos.historico) ? internos.historico : [],
    stageLog: internos.stageLog || null,
    dataConclusaoFinal: internos.dataConclusaoFinal || null,
    concluidoPor: internos.concluidoPor || null,
    checklist: {
      pedidosCompra: valorVerdadeiro(pc), notasDisponiveis: valorVerdadeiro(nd),
      pendenciasFiscais: valorVerdadeiro(pf), notasLancadas: valorVerdadeiro(nl),
      reclassificacao: valorVerdadeiro(rc), conferencia: valorVerdadeiro(cf),
      provisoes: valorVerdadeiro(pv), impostos: valorVerdadeiro(imp), contabilizacaoFinal: valorVerdadeiro(cfn)
    }
  };
  garantirStageLog(card);
  return card;
}

async function carregarDeGraph(manual) {
  if (sincronizando) return;
  sincronizando = true;
  atualizarStatusGraph(manual ? "Sincronizando..." : "Atualizando...");
  try {
    const base = await baseWorkbookUrl();
    const resultado = await graphFetch(`${base}/tables/${GRAPH_CONFIG.tableName}/rows`);
    const linhas = (resultado.value || []).map(r => r.values[0]);

    // preserva o "id" local de cartões já conhecidos (casando por código+filial)
    const idsAntigos = new Map(state.cards.map(c => [`${c.codigo}__${c.filial}`, c.id]));
    state.cards = linhas
      .filter(l => l[0] || l[1])
      .map(l => linhaParaCard(l, idsAntigos.get(`${l[0]}__${l[1]}`)));

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards: state.cards, sort: state.sort, view: state.view, slaTargets: state.slaTargets }));
    renderizarTudo();
    if (state.view === "kanban") alternarView("kanban");
    atualizarStatusGraph(`Sincronizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
    document.getElementById("btnPrepararPlanilha").style.display = "none";
  } catch (err) {
    console.error(err);
    const provavelSemTabela = String(err.message || "").includes("404") || String(err.message || "").includes("ItemNotFound");
    if (provavelSemTabela) {
      atualizarStatusGraph("Planilha ainda não preparada");
      document.getElementById("btnPrepararPlanilha").style.display = "inline-flex";
    } else {
      atualizarStatusGraph("Erro ao sincronizar");
    }
  } finally {
    sincronizando = false;
  }
}

// Sincroniza as linhas da tabela do Excel com o state.cards atual:
// atualiza as linhas existentes, adiciona as que faltam e remove as
// que sobraram (sempre a partir do final, para não desalinhar índices).
async function salvarNoGraph() {
  if (!graphSyncAtivo() || !contaMsal) return;
  atualizarStatusGraph("Salvando...");
  try {
    const base = await baseWorkbookUrl();
    const urlLinhas = `${base}/tables/${GRAPH_CONFIG.tableName}/rows`;

    const atual = await graphFetch(urlLinhas);
    const linhasAtuais = atual.value || [];
    const novasLinhas = state.cards.map(cardParaLinha);

    const emComum = Math.min(linhasAtuais.length, novasLinhas.length);
    for (let i = 0; i < emComum; i++) {
      await graphFetch(`${urlLinhas}/itemAt(index=${i})`, {
        method: "PATCH",
        body: JSON.stringify({ values: [novasLinhas[i]] })
      });
    }

    if (novasLinhas.length > linhasAtuais.length) {
      await graphFetch(`${urlLinhas}/add`, {
        method: "POST",
        body: JSON.stringify({ values: novasLinhas.slice(linhasAtuais.length) })
      });
    } else if (linhasAtuais.length > novasLinhas.length) {
      for (let i = linhasAtuais.length - 1; i >= novasLinhas.length; i--) {
        await graphFetch(`${urlLinhas}/itemAt(index=${i})/delete`, { method: "POST" });
      }
    }

    atualizarStatusGraph(`Sincronizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (err) {
    console.error(err);
    atualizarStatusGraph("Erro ao salvar — tentando de novo em breve");
    agendarSalvarNoGraph(15000);
  }
}

function agendarSalvarNoGraph(atrasoMs = 1800) {
  ultimaEdicaoLocalEm = Date.now();
  if (!graphSyncAtivo() || !contaMsal) return;
  if (timeoutSalvarGraph) clearTimeout(timeoutSalvarGraph);
  timeoutSalvarGraph = setTimeout(salvarNoGraph, atrasoMs);
}

function atualizarStatusGraph(texto) {
  const el = document.getElementById("graphStatusText");
  if (el) el.textContent = texto;
}

/* ============================================================
   GANCHO: intercepta salvarDados() do script.js para também
   sincronizar com o Graph quando estiver ativo e logado.
   ============================================================ */

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    if (!graphSyncAtivo()) return;
    const salvarDadosOriginal = salvarDados;
    salvarDados = function () {
      salvarDadosOriginal();
      agendarSalvarNoGraph();
    };
  });
}
