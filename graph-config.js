/* ============================================================
   graph-config.js
   Configuração da integração com Microsoft Graph (OneDrive/
   SharePoint). Edite os valores abaixo depois de registrar o
   aplicativo no Azure AD — veja o passo a passo no README.md,
   seção "Publicar para várias pessoas (Microsoft 365)".

   Enquanto GRAPH_SYNC_ENABLED estiver "false", o painel continua
   funcionando 100% localmente (localStorage), como antes — nada
   quebra se você ainda não configurou o Azure AD.
   ============================================================ */

const GRAPH_CONFIG = {
  // Ative depois de preencher clientId, tenantId e filePath abaixo.
  GRAPH_SYNC_ENABLED: false,

  // ---- Dados do registro do aplicativo no Azure AD (Entra ID) ----
  // "Application (client) ID" da tela de visão geral do app registrado.
  clientId: "COLOQUE_AQUI_O_APPLICATION_CLIENT_ID",

  // "Directory (tenant) ID" da mesma tela. Use o ID do seu tenant
  // (recomendado para empresas) em vez de "common" — evita telas de
  // consentimento genéricas e restringe o login à sua organização.
  tenantId: "COLOQUE_AQUI_O_DIRECTORY_TENANT_ID",

  // ---- Onde o arquivo Excel compartilhado vai ficar ----
  // Deixe sharePointSiteUrl em branco ("") para usar o OneDrive
  // do usuário que fizer login. Preencha com a URL do site do
  // SharePoint (ex: "https://suaempresa.sharepoint.com/sites/Financeiro")
  // se preferir salvar numa biblioteca de documentos compartilhada
  // do time — isso é o mais indicado para uso em equipe.
  sharePointSiteUrl: "",

  // Caminho do arquivo dentro do OneDrive ou da biblioteca de
  // documentos do site acima. Comece com "/".
  filePath: "/Fechamento Mensal/dados-fechamento.xlsx",

  // Nome da planilha (aba) e da tabela dentro do arquivo Excel.
  // Já vêm prontos no modelo "dados-onedrive.xlsx" incluso — só
  // mude aqui se você renomear a aba/tabela no Excel.
  sheetName: "Fechamento",
  tableName: "TabelaFechamento",

  // Intervalo (em segundos) para buscar automaticamente alterações
  // feitas por outras pessoas. 0 desativa a atualização automática
  // (ainda dá para sincronizar manualmente pelo botão).
  autoRefreshSeconds: 45
};
