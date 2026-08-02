/* ============================================================
   pasta-compartilhada.js
   Alternativa à integração via Microsoft Graph (graph-sync.js):
   em vez de login com conta Microsoft + Azure AD, este modo lê e
   grava direto num arquivo JSON dentro de uma pasta do OneDrive/
   SharePoint sincronizada localmente no computador de cada
   pessoa. Quem sincroniza os dados entre as pessoas é o próprio
   OneDrive (como sempre fez) — não precisa de nenhum cadastro,
   permissão de administrador, nem hospedar nada além do próprio
   app.

   Requisitos:
   - Navegador baseado em Chromium (Chrome, Edge, Opera). Não
     funciona no Firefox nem no Safari — o botão fica escondido
     automaticamente nesses casos.
   - Precisa rodar em HTTPS (ou localhost). Não funciona abrindo
     o index.html direto do disco (file://).
   - A pasta do OneDrive/SharePoint precisa estar sincronizada
     localmente (o app do OneDrive rodando no Windows/Mac).

   Este modo fica desativado automaticamente se a integração via
   Microsoft Graph (graph-config.js → GRAPH_SYNC_ENABLED) estiver
   ativa — são duas formas alternativas de compartilhar os dados,
   não usadas ao mesmo tempo.
   ============================================================ */

const FS_DB_NOME = "fechamento-file-handles";
const FS_STORE_NOME = "handles";
const FS_CHAVE_HANDLE = "arquivoDados";

let arquivoHandle = null;
let timeoutSalvarArquivo = null;
let intervaloRefreshArquivo = null;
let ultimaEdicaoLocalArquivo = 0;
let salvandoArquivo = false;

function suportaPastaCompartilhada() {
  return typeof window !== "undefined" && "showOpenFilePicker" in window && window.isSecureContext;
}

/* ---------- IndexedDB: guarda o "handle" do arquivo entre sessões ---------- */

function abrirFsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FS_DB_NOME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(FS_STORE_NOME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function salvarHandleNoIndexedDB(handle) {
  const db = await abrirFsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FS_STORE_NOME, "readwrite");
    tx.objectStore(FS_STORE_NOME).put(handle, FS_CHAVE_HANDLE);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function recuperarHandleDoIndexedDB() {
  const db = await abrirFsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FS_STORE_NOME, "readonly");
    const req = tx.objectStore(FS_STORE_NOME).get(FS_CHAVE_HANDLE);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function removerHandleDoIndexedDB() {
  const db = await abrirFsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FS_STORE_NOME, "readwrite");
    tx.objectStore(FS_STORE_NOME).delete(FS_CHAVE_HANDLE);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

async function iniciarPastaCompartilhada() {
  if (typeof GRAPH_CONFIG !== "undefined" && GRAPH_CONFIG.GRAPH_SYNC_ENABLED) return; // modos são alternativos

  const painel = document.getElementById("pastaCompartilhadaPainel");
  if (!painel) return;

  if (!suportaPastaCompartilhada()) {
    painel.style.display = "none";
    return; // navegador sem suporte (Firefox/Safari) ou página aberta sem HTTPS
  }
  painel.style.display = "flex";

  document.getElementById("btnAbrirArquivoExistente").addEventListener("click", conectarArquivoExistente);
  document.getElementById("btnCriarArquivoNovo").addEventListener("click", criarArquivoNovo);
  document.getElementById("btnDesconectarArquivo").addEventListener("click", desconectarArquivo);
  document.getElementById("btnAtualizarArquivo").addEventListener("click", () => carregarDoArquivo(true));

  const handleSalvo = await recuperarHandleDoIndexedDB().catch(() => null);
  if (!handleSalvo) return; // primeira vez: mostra só os botões de configurar (já visíveis por padrão)

  const permissao = await handleSalvo.queryPermission({ mode: "readwrite" }).catch(() => "denied");
  if (permissao === "granted") {
    arquivoHandle = handleSalvo;
    await aposConectarArquivo();
  } else {
    mostrarReconectar(handleSalvo);
  }
}

function mostrarReconectar(handle) {
  const btn = document.getElementById("btnReconectarArquivo");
  btn.style.display = "inline-flex";
  btn.onclick = async () => {
    try {
      const permissao = await handle.requestPermission({ mode: "readwrite" });
      if (permissao === "granted") {
        arquivoHandle = handle;
        btn.style.display = "none";
        await aposConectarArquivo();
      }
    } catch (err) {
      console.error(err);
    }
  };
}

/* ============================================================
   CONECTAR / DESCONECTAR
   ============================================================ */

async function conectarArquivoExistente() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "Dados do Painel (JSON)", accept: { "application/json": [".json"] } }],
      excludeAcceptAllOption: false
    });
    arquivoHandle = handle;
    await salvarHandleNoIndexedDB(handle);
    await aposConectarArquivo();
  } catch (err) {
    if (err.name !== "AbortError") console.error(err);
  }
}

async function criarArquivoNovo() {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "dados-fechamento.json",
      types: [{ description: "Dados do Painel (JSON)", accept: { "application/json": [".json"] } }]
    });
    arquivoHandle = handle;
    await salvarHandleNoIndexedDB(handle);
    await salvarNoArquivo(); // grava o estado atual como ponto de partida do arquivo compartilhado
    await aposConectarArquivo();
  } catch (err) {
    if (err.name !== "AbortError") console.error(err);
  }
}

async function desconectarArquivo() {
  if (intervaloRefreshArquivo) clearInterval(intervaloRefreshArquivo);
  arquivoHandle = null;
  await removerHandleDoIndexedDB().catch(() => {});
  document.getElementById("pastaCompartilhadaConectado").style.display = "none";
  document.getElementById("pastaCompartilhadaSetup").style.display = "flex";
  document.getElementById("btnReconectarArquivo").style.display = "none";
}

async function aposConectarArquivo() {
  document.getElementById("pastaCompartilhadaSetup").style.display = "none";
  document.getElementById("pastaCompartilhadaConectado").style.display = "flex";
  document.getElementById("nomeArquivoConectado").textContent = arquivoHandle.name;

  await carregarDoArquivo(false);

  if (intervaloRefreshArquivo) clearInterval(intervaloRefreshArquivo);
  intervaloRefreshArquivo = setInterval(() => {
    // só busca sozinho se ninguém estiver digitando algo agora mesmo
    if (Date.now() - ultimaEdicaoLocalArquivo > 4000) carregarDoArquivo(false);
  }, 30000);
}

/* ============================================================
   LER / GRAVAR O ARQUIVO
   ============================================================ */

async function carregarDoArquivo(manual) {
  if (!arquivoHandle || salvandoArquivo) return;
  atualizarStatusArquivo(manual ? "Atualizando..." : "Verificando...");
  try {
    const arquivo = await arquivoHandle.getFile();
    const texto = await arquivo.text();
    if (!texto.trim()) {
      atualizarStatusArquivo("Arquivo vazio — clique em Atualizar depois de salvar algo");
      return;
    }
    const dados = JSON.parse(texto);
    if (Array.isArray(dados.cards)) state.cards = dados.cards;
    if (dados.slaTargets) state.slaTargets = { ...SLA_META_PADRAO, ...dados.slaTargets };
    if (Array.isArray(dados.historicoMeses)) state.historicoMeses = dados.historicoMeses;

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cards: state.cards, sort: state.sort, view: state.view,
      slaTargets: state.slaTargets, historicoMeses: state.historicoMeses
    }));

    popularFiltros();
    renderizarTudo(false);
    atualizarStatusArquivo(`Sincronizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (err) {
    console.error(err);
    atualizarStatusArquivo("Erro ao ler o arquivo — verifique se ele ainda existe na pasta");
  }
}

async function salvarNoArquivo() {
  if (!arquivoHandle) return;
  salvandoArquivo = true;
  atualizarStatusArquivo("Salvando...");
  try {
    const writable = await arquivoHandle.createWritable();
    await writable.write(JSON.stringify({
      cards: state.cards,
      slaTargets: state.slaTargets,
      historicoMeses: state.historicoMeses,
      salvoEm: new Date().toISOString(),
      salvoPor: (typeof USUARIO_ATUAL !== "undefined" && USUARIO_ATUAL) || "Desconhecido"
    }, null, 2));
    await writable.close();
    atualizarStatusArquivo(`Sincronizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (err) {
    console.error(err);
    atualizarStatusArquivo("Erro ao salvar — tentando de novo em breve");
    agendarSalvarNoArquivo(15000);
  } finally {
    salvandoArquivo = false;
  }
}

function agendarSalvarNoArquivo(atraso = 1500) {
  ultimaEdicaoLocalArquivo = Date.now();
  if (!arquivoHandle) return;
  if (timeoutSalvarArquivo) clearTimeout(timeoutSalvarArquivo);
  timeoutSalvarArquivo = setTimeout(salvarNoArquivo, atraso);
}

function atualizarStatusArquivo(texto) {
  const el = document.getElementById("statusArquivoTexto");
  if (el) el.textContent = texto;
}

/* ============================================================
   GANCHO: intercepta salvarDados() do script.js para também
   gravar no arquivo compartilhado quando conectado.
   ============================================================ */

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    if (typeof GRAPH_CONFIG !== "undefined" && GRAPH_CONFIG.GRAPH_SYNC_ENABLED) return;
    const salvarDadosOriginal = salvarDados;
    salvarDados = function () {
      salvarDadosOriginal();
      agendarSalvarNoArquivo();
    };
    iniciarPastaCompartilhada();
  });
}
