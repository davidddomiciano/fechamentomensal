# Painel de Fechamento Mensal — Filiais

Aplicação web (HTML + CSS + JavaScript puro) para acompanhar o fluxo de fechamento contábil mensal das filiais, em um Kanban inspirado no Microsoft Planner.

## Arquivos

| Arquivo | Descrição |
|---|---|
| `index.html` | Estrutura da página (cabeçalho, dashboard, filtros, board, tabela, SLA e modais) |
| `style.css` | Estilo visual (Segoe UI, paleta azul/verde/laranja/vermelho, cantos arredondados, sombras) |
| `script.js` | Lógica principal: checklist, Kanban, tabela editável, SLA, histórico e persistência local |
| `graph-config.js` | Configuração da integração com Microsoft 365 (edite aqui depois do cadastro no Azure AD) |
| `graph-sync.js` | Login com conta Microsoft e sincronização com o Excel no OneDrive/SharePoint via Graph |
| `dados.xlsx` | Planilha modelo para importação manual (botão "Importar Excel"), com exemplos de progresso |
| `dados-onedrive.xlsx` | Planilha modelo específica para a sincronização via Microsoft 365 (ver seção correspondente) |
| `README.md` | Este arquivo |

## Como usar

1. Abra `index.html` em qualquer navegador moderno (Chrome, Edge ou Firefox). Não é necessário servidor — funciona localmente, com conexão à internet apenas para carregar as bibliotecas (Font Awesome, SheetJS e Chart.js via CDN).
2. Clique em **Importar Excel** e selecione uma planilha `.xlsx` no formato do modelo (ou use o `dados.xlsx` incluso para ver o Kanban populado).
3. Ou clique em **Baixar modelo** para gerar uma planilha em branco já com as 15 filiais e as colunas corretas para preencher.
4. Os cartões são posicionados automaticamente na coluna certa, de acordo com o checklist marcado em cada linha.

## Planilha de importação — colunas esperadas

`Competência | Código | Filial | Responsável | Etapa Atual | Pedidos Compra | Notas Disponíveis | Pendências Fiscais | Notas Lançadas | Reclassificação | Conferência | Provisões | Impostos | Contabilização Final | Última Atualização`

- As colunas de checklist aceitam `Sim`/`Não`, `1`/`0`, `TRUE`/`FALSE` ou `X`.
- A coluna **Etapa Atual** é apenas informativa no import — a etapa exibida no Kanban é **sempre recalculada automaticamente** a partir do checklist, garantindo consistência com o fluxo real.

## Fluxo automático

```
Suprimentos → Fiscal / Central de Notas → Planejamento Financeiro → Contabilidade → Fechamento Concluído
```

Quando todos os itens de uma etapa são marcados, o cartão avança sozinho para a próxima coluna. Também é possível arrastar (drag-and-drop) um cartão manualmente entre colunas; nesse caso a posição manual é mantida até o próximo item de checklist ser alterado, quando o fluxo automático volta a valer.

## Responsável automático (quem fez o check)

A coluna/campo **Responsável** não é mais digitado manualmente — ele é definido automaticamente pela pessoa que marcar qualquer item do checklist daquela filial (usando o nome de quem fez login, seja o simples ou a conta Microsoft). Isso vale no Kanban, na Tabela e no modal de detalhes.

Além disso, cada item do checklist guarda individualmente **quem marcou e quando** — visível no modal do cartão, logo abaixo de cada item concluído (ex: "Marcado por Ana Souza · 29/07/2026 14:32"). Isso permite saber exatamente quem executou cada etapa, não só quem é o "responsável geral" da filial no momento.

Ao importar uma planilha, a coluna "Responsável" continua sendo usada como valor inicial (útil para pré-atribuir antes de qualquer check ser feito) — mas assim que alguém marcar um item, o campo passa a refletir automaticamente quem está com a mão na massa.

## Histórico entre meses e comparativo de SLA

Na aba **SLA**, o botão **"Encerrar mês e arquivar"** fecha o ciclo do mês atual:

1. Pergunta qual competência encerrar (já sugere a mais comum entre as filiais atuais).
2. Salva uma cópia completa daquelas filiais (checklist, horários de cada etapa, quem marcou o quê) no histórico — isso não pode ser desfeito pela interface, então uma cópia de segurança do navegador (exportando o LocalStorage) é recomendável antes de grandes operações, se for um mês crítico.
3. Pergunta a nova competência e reinicia o checklist dessas filiais para o novo ciclo (o código/filial continuam os mesmos; o histórico de alterações e o campo Responsável são reiniciados).

Depois de arquivar pelo menos um mês, a aba SLA passa a mostrar automaticamente um **gráfico comparativo** (% de etapas concluídas dentro do prazo, mês a mês) e uma **tabela** com os números de cada competência arquivada, incluindo o mês atual em andamento como referência — dá para acompanhar se o time está melhorando ou piorando o cumprimento de prazos ao longo do tempo. Esse comparativo também entra no PDF exportado.

> **Limitações:** o histórico arquivado fica salvo apenas localmente (no `localStorage` do navegador) — se você ativou a sincronização via Microsoft 365, os meses arquivados **não** são sincronizados entre pessoas/dispositivos (só os dados do mês corrente são). Os comparativos usam sempre a meta de SLA **atual** configurada, mesmo para meses arquivados com metas antigas — ou seja, é uma comparação sob a régua de hoje, não a de cada época.

## Publicar para várias pessoas (Microsoft 365)

Por padrão, os dados ficam só no navegador de cada pessoa (`localStorage`) — ótimo para uso individual, mas cada um vê seu próprio Kanban. Para todo mundo compartilhar os **mesmos dados**, o painel pode ler e gravar num arquivo Excel do OneDrive ou de uma biblioteca do SharePoint, através do Microsoft Graph, usando login com a conta Microsoft 365 da empresa.

Isso já vem implementado (arquivos `graph-config.js` e `graph-sync.js`), mas **desligado por padrão** — o app continua funcionando 100% local até você configurar e ativar. A combinação recomendada é: **app hospedado no GitHub Pages** (fora do SharePoint, por causa das restrições de CSP explicadas na Etapa 3) + **dados no OneDrive/SharePoint** via Microsoft Graph. São quatro etapas: cadastrar o aplicativo no Azure AD, preencher a configuração, publicar no GitHub Pages e enviar o arquivo modelo.

### Etapa 1 — Cadastrar o aplicativo no Azure AD (Entra ID)

Precisa de alguém com permissão de administrador no Microsoft 365 / Azure da empresa (ou permissão para registrar apps, dependendo da política do tenant).

1. Acesse **portal.azure.com** → **Microsoft Entra ID** (antigo Azure Active Directory) → **Registros de aplicativo** (*App registrations*) → **Novo registro**.
2. Nome: algo como "Painel de Fechamento Mensal".
3. Tipos de conta com suporte: **Somente contas neste diretório organizacional** (single tenant) — recomendado para uso interno.
4. Em **URI de redirecionamento**, escolha o tipo **SPA (Single-page application)**. Se você ainda não publicou o app no GitHub Pages (Etapa 3), pode voltar aqui depois para preencher — mas o formato final será algo como `https://SEU-USUARIO.github.io/painel-fechamento/`. **Precisa ser o endereço exato** — se mudar depois, adicione a nova URL aqui também (dá para cadastrar mais de uma).
5. Clique em **Registrar**.
6. Na tela de visão geral do app, anote:
   - **Application (client) ID**
   - **Directory (tenant) ID**
7. Vá em **Permissões de API** (*API permissions*) → **Adicionar uma permissão** → **Microsoft Graph** → **Permissões delegadas** e adicione:
   - `User.Read`
   - `Files.ReadWrite`
   - `Sites.ReadWrite.All` (só necessário se for usar uma biblioteca do SharePoint em vez do OneDrive pessoal)
8. Clique em **Conceder consentimento do administrador** para o tenant (obrigatório para `Sites.ReadWrite.All`; para as demais, cada usuário pode consentir individualmente no primeiro login, mas conceder de uma vez só evita telas extras).
9. Em **Autenticação** (*Authentication*), confirme que o tipo de URI de redirecionamento é **SPA** e que os fluxos implícitos (*ID tokens*, *Access tokens*) **não** precisam estar marcados — o app usa o fluxo moderno com PKCE.

### Etapa 2 — Preencher `graph-config.js`

Abra o arquivo `graph-config.js` e edite:

```js
GRAPH_SYNC_ENABLED: true,
clientId: "cole aqui o Application (client) ID",
tenantId: "cole aqui o Directory (tenant) ID",
sharePointSiteUrl: "", // ou a URL do site do SharePoint, ex: "https://minhaempresa.sharepoint.com/sites/Financeiro"
filePath: "/Fechamento Mensal/dados-fechamento.xlsx",
```

- Deixe `sharePointSiteUrl` em branco para salvar no **OneDrive pessoal** de quem faz login (simples, bom para times pequenos, mas o arquivo mora no OneDrive de uma pessoa específica — se ela sair da empresa, o acesso precisa ser reorganizado).
- Preencha `sharePointSiteUrl` para salvar numa **biblioteca de documentos do SharePoint** — mais indicado para um time, pois o arquivo pertence ao site, não a uma pessoa.
- `filePath` é o caminho do arquivo dentro do OneDrive/biblioteca (pode incluir uma pasta, como no exemplo).

### Etapa 3 — Hospedar no GitHub Pages, enviar o modelo e "preparar" a planilha

> **Por que não direto no SharePoint/OneDrive:** desde a aplicação total do CSP do SharePoint Online em 1º de junho de 2026, páginas modernas do SharePoint bloqueiam a execução de scripts que não venham de uma origem confiável pré-cadastrada — subir estes arquivos numa biblioteca de documentos não faz o painel funcionar como um app interativo (o navegador só baixa o arquivo ou bloqueia o JavaScript). Por isso o app fica hospedado no GitHub Pages, e só os **dados** (o Excel) ficam no OneDrive/SharePoint via Graph — são duas coisas independentes.

**3.1 — Criar o repositório**
1. Entre em [github.com](https://github.com) (crie uma conta gratuita se ainda não tiver) → botão **New** (novo repositório).
2. Nome sugerido: `painel-fechamento`. Marque como **Public** (o GitHub Pages gratuito exige repositório público — o código do painel não contém nenhum dado sensível da empresa, só a lógica do app; os dados reais ficam no Excel, fora do repositório).
3. Clique em **Create repository**.

**3.2 — Enviar os arquivos**
1. No repositório recém-criado, clique em **Add file → Upload files**.
2. Arraste os arquivos: `index.html`, `style.css`, `script.js`, `graph-config.js`, `graph-sync.js` (direto na raiz do repositório, sem colocar em subpasta).
3. Clique em **Commit changes**.

**3.3 — Ativar o GitHub Pages**
1. No repositório, vá em **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**.
3. Em **Branch**, escolha `main` e a pasta `/ (root)` → **Save**.
4. Aguarde cerca de 1 minuto. A URL do seu painel vai aparecer nessa mesma tela, algo como:
   `https://SEU-USUARIO.github.io/painel-fechamento/`

**3.4 — Registrar essa URL no Azure AD**
Volte ao registro do aplicativo (Etapa 1) → **Autenticação** → adicione **as duas variações** da URL como URI de redirecionamento do tipo SPA, para evitar erro de "redirect mismatch" independentemente de como a pessoa abrir o link:
- `https://SEU-USUARIO.github.io/painel-fechamento/`
- `https://SEU-USUARIO.github.io/painel-fechamento/index.html`

**3.5 — Enviar o modelo e preparar a planilha**
1. Suba o arquivo **`dados-onedrive.xlsx`** (incluso) para o caminho exato configurado em `filePath` (OneDrive ou SharePoint).
2. Abra a URL do GitHub Pages → **Entrar com Microsoft** → login com a conta da empresa.
3. Clique em **Preparar planilha** (aparece na primeira vez) — transforma a aba em Tabela do Excel que o Graph consegue ler/gravar.
4. Pronto — compartilhe o link do GitHub Pages no Teams/e-mail/SharePoint. Qualquer pessoa que abrir esse link e entrar com a conta Microsoft vai ver e editar os mesmos dados.

**Atualizando o app depois:** se você editar `graph-config.js` (por exemplo, trocar o `filePath`), é só repetir o passo 3.2 (Upload files) substituindo o arquivo — o GitHub Pages publica a nova versão automaticamente em menos de um minuto.

### Como funciona no dia a dia

- O nome usado nas alterações passa a ser o nome da conta Microsoft (não pede mais para digitar).
- A cada alteração, o painel salva no Excel automaticamente (com um pequeno atraso para agrupar edições rápidas), e mostra o status no cabeçalho ("Salvando...", "Sincronizado às HH:mm").
- A cada 45 segundos (configurável em `autoRefreshSeconds`), o painel busca sozinho alterações feitas por outras pessoas. Também dá para forçar com o botão de sincronizar.
- **Limitação importante:** se duas pessoas editarem a mesma filial ao mesmo tempo, vale a última gravação (não há mesclagem automática de conflitos). Para equipes pequenas isso raramente é um problema, mas é bom avisar o time.
- A coluna "Dados Internos" do Excel guarda o histórico e os horários de cada etapa em formato JSON — não edite essa coluna manualmente diretamente no Excel, ela é só para o aplicativo.

### Se algo não funcionar

- **Tela de login não abre / erro de redirect URI:** a URL onde o app está hospedado precisa ser *idêntica* (protocolo, domínio, caminho) à cadastrada no Azure AD.
- **Erro 403 / permissão negada:** confirme se o consentimento do administrador foi concedido para as permissões da Etapa 1.
- **"Planilha ainda não preparada" não some:** confirme se o `dados-onedrive.xlsx` foi enviado exatamente ao caminho de `filePath`, e clique em "Preparar planilha" novamente.
- Esta integração depende do ambiente Microsoft 365 específico da sua empresa — recomendo testar primeiro com um arquivo e um grupo pequeno de usuários antes de liberar para todo o time.

## Identificação do usuário (modo local, sem Microsoft 365)

> Esta seção descreve o comportamento padrão, com `GRAPH_SYNC_ENABLED: false`. Se você ativou a integração com Microsoft 365 (seção acima), o login passa a ser feito com a conta Microsoft, e essa identificação por nome digitado não é usada.

Ao abrir o painel pela primeira vez (naquele navegador), é pedido um nome antes de liberar o acesso. Esse nome fica salvo localmente e é usado para registrar **quem** fez cada alteração — em qualquer célula da tabela, checklist do Kanban ou modal do cartão. Para trocar de usuário (por exemplo, se outra pessoa for usar o mesmo computador), clique no ícone ao lado do nome no cabeçalho.

Cada cartão guarda um pequeno histórico de alterações (usuário + data/hora + o que mudou), visível no modal de detalhes ao clicar em um cartão do Kanban.

> Como tudo roda no navegador sem servidor, essa é uma identificação simples (não é uma autenticação com senha) — serve para rastreabilidade de quem mexeu em cada informação, não como controle de acesso seguro.

## Aba SLA

Terceira aba no cabeçalho, ao lado de Kanban e Tabela. Mostra:

- **Metas de SLA editáveis** (em horas) para cada etapa — Suprimentos, Fiscal, Planejamento Financeiro e Contabilidade.
- **Indicadores**: quantidade de filiais no relatório, % de etapas concluídas dentro do prazo, quantidade em atraso e em andamento.
- **Gráfico** comparando a duração média real de cada etapa com a meta definida.
- **Tabela detalhada por filial**, com data/hora de início e conclusão de cada etapa, duração, status (no prazo / atrasado / em andamento / não iniciado), data/hora do fechamento completo e da última atualização — sempre com o nome de quem realizou a ação.
- **Botão "Exportar / Imprimir PDF"**: abre a caixa de impressão do navegador já formatada só com o relatório de SLA. Basta escolher "Salvar como PDF" como destino.

O início/fim de cada etapa é calculado automaticamente a partir do checklist: quando todos os itens de uma etapa são marcados, ela é considerada concluída naquele instante; se um item for desmarcado depois, a conclusão daquela etapa é reaberta. Como o carimbo de tempo só existe a partir do momento em que a informação é registrada no navegador, filiais importadas de uma planilha (já com itens marcados) recebem o horário da importação como referência — não é possível recuperar retroativamente um horário que não foi registrado por este sistema.

## Visualização em Tabela (estilo Excel)

Além do Kanban, o painel tem um botão **Tabela** no cabeçalho que alterna para uma grade editável, no mesmo espírito do Excel:

- Clique em qualquer célula (código, filial, competência, responsável, checklist ou data) e edite diretamente.
- Navegue com **Tab** (próxima célula), **Enter** (célula abaixo) ou as **setas do teclado**.
- As colunas de checklist são checkboxes; a etapa e o percentual de conclusão são calculados automaticamente e aparecem em colunas somente leitura.
- **Nova linha** adiciona uma filial em branco direto na tabela, sem precisar de planilha.
- O ícone de lixeira no fim de cada linha exclui aquela filial.
- Qualquer edição na tabela atualiza o Kanban (e vice-versa) em tempo real — os dois modos compartilham o mesmo estado salvo em `localStorage`.

## Funcionalidades

- **Importação de Excel** (biblioteca SheetJS) com criação automática dos cartões e marcação do checklist.
- **Drag-and-drop** entre colunas.
- **Checklist interativo** dentro do modal de detalhes de cada cartão (clique no cartão para abrir), com atualização automática de progresso e etapa.
- **Barra de progresso** e percentual de conclusão por filial (baseado nos 9 itens do checklist).
- **Filtros** por Competência, Filial, Responsável e Etapa.
- **Pesquisa** por código ou nome da filial.
- **Ordenação** por Código, Nome, Responsável ou Última atualização.
- **Dashboard** no topo com: total de filiais, concluídas, quantidade em cada etapa e percentual geral do fechamento (com gráfico de rosca).
- **Alerta visual** (ícone vermelho) em cartões sem atualização há mais de 5 dias.
- **Persistência automática** em `localStorage` — ao reabrir a página, o último estado é restaurado.
- **Botão "Baixar modelo"** para gerar uma planilha em branco pronta para preenchimento.

## Personalização

- Cores das colunas e paleta geral: variáveis CSS no topo de `style.css` (`--blue`, `--green`, `--orange`, `--red`, `--purple`).
- Itens do checklist e nomes das etapas: array `STAGES` no início de `script.js`.
- Lista de filiais usada no modelo de planilha: array `FILIAIS_REF` em `script.js`.

## Evolução sugerida

Para eliminar a necessidade de reimportar a planilha a cada atualização, o próximo passo natural é substituir a importação manual por integração direta com o **Excel Online (OneDrive/SharePoint)** via **Microsoft Graph API**, lendo e gravando as mesmas colunas descritas acima. Isso aproximaria a experiência da própria dinâmica do Microsoft Planner, com atualização em tempo real.

## Compatibilidade

Testado para funcionar em Chrome, Edge e Firefox nas versões atuais. Layout responsivo (o board empilha em uma coluna em telas estreitas).
