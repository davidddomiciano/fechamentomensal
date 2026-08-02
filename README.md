# Painel de Fechamento Mensal — Filiais

Aplicação web (HTML + CSS + JavaScript puro) para acompanhar o fluxo de fechamento contábil mensal das filiais, em um Kanban inspirado no Microsoft Planner.

## Arquivos

| Arquivo | Descrição |
|---|---|
| `index.html` | Estrutura da página (cabeçalho, dashboard, filtros, board, tabela, SLA e modais) |
| `style.css` | Estilo visual (Segoe UI, paleta azul/verde/laranja/vermelho, cantos arredondados, sombras) |
| `script.js` | Lógica principal: checklist, Kanban, tabela editável, SLA, histórico e persistência local |
| `pasta-compartilhada.js` | Sincronização simples via pasta do OneDrive/SharePoint, sem precisar de TI (ver seção correspondente) |
| `graph-config.js` | Configuração da integração com Microsoft 365 — só é usada se você ativar esse modo (ver seção correspondente) |
| `graph-sync.js` | Login com conta Microsoft e sincronização com o Excel no OneDrive/SharePoint via Graph — idem |
| `dados-onedrive.xlsx` | Planilha usada **apenas** pelo modo de sincronização via Microsoft 365/Graph — não é necessária se você não for usar esse modo |
| `README.md` | Este arquivo |

> Não existe mais importação de planilha Excel para popular o Kanban — as filiais são adicionadas direto pela interface (aba Tabela), escolhendo de uma lista fixa. Isso evita erro de digitação e mantém os dados consistentes. O `dados-onedrive.xlsx` continua existindo só porque é a "fonte de dados" do modo Microsoft 365/Graph, que é opcional.

## Como usar

1. Abra `index.html` em qualquer navegador moderno (Chrome, Edge ou Firefox). Não é necessário servidor — funciona localmente, com conexão à internet apenas para carregar as bibliotecas (Font Awesome, SheetJS e Chart.js via CDN).
2. Digite seu nome quando pedido (ou entre com a conta Microsoft, se o modo 365 estiver ativo).
3. Vá até a aba **Tabela** → **Adicionar filial** → escolha uma filial na lista e clique em Adicionar.
4. Marque os itens do checklist conforme o trabalho avança — o cartão se move sozinho entre as colunas do Kanban.

## Fluxo automático

```
Suprimentos → Fiscal / Central de Notas → Planejamento Financeiro → Contabilidade → Fechamento Concluído
```

Quando todos os itens de uma etapa são marcados, o cartão avança sozinho para a próxima coluna. Também é possível arrastar (drag-and-drop) um cartão manualmente entre colunas; nesse caso a posição manual é mantida até o próximo item de checklist ser alterado, quando o fluxo automático volta a valer.

## Código e Filial — campo único, não editável livremente

Código e nome da filial agora aparecem sempre juntos (ex: "101 - Corporativo"), em vez de duas colunas separadas — no Kanban, na Tabela, no SLA e no modal de detalhes.

Esse campo **não pode mais ser digitado livremente** na Tabela: para adicionar uma filial nova, use o seletor **"Adicionar filial"** no rodapé da Tabela, que lista as filiais já cadastradas em `FILIAIS_REF` (topo de `script.js`). Isso evita erro de digitação e duplicidade de código.

Se você precisar adicionar uma filial que ainda não está na lista, edite o array `FILIAIS_REF` em `script.js` (mesmo formato usado para gerar o modelo de planilha) e ela passa a aparecer no seletor.

Para "trocar" a filial de uma linha já criada por engano, a forma mais simples é excluir aquela linha (ícone de lixeira) e adicionar de novo com a filial certa — o código e a filial não são editáveis depois de criados, propositalmente.

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

## Compartilhar dados sem passar pela TI (pasta do OneDrive)

Se você não quer (ou não pode, por ora) passar pelo cadastro no Azure AD, tem uma alternativa bem mais simples: o painel consegue ler e gravar direto num arquivo dentro de uma **pasta do OneDrive/SharePoint sincronizada localmente** no computador de cada pessoa. Quem sincroniza os dados entre o time continua sendo o próprio OneDrive — o app só lê e escreve num arquivo local, como um editor de texto faria.

### Comparativo rápido

| | Pasta compartilhada (este modo) | Microsoft 365 / Graph (seção seguinte) |
|---|---|---|
| Precisa de TI / Azure AD | **Não** | Sim (cadastro do app + consentimento de admin) |
| Login | Nome digitado (como já era) | Conta Microsoft corporativa |
| Navegadores compatíveis | Só Chrome/Edge/Opera | Qualquer navegador moderno |
| Onde ficam os dados | Arquivo dentro de uma pasta OneDrive sincronizada | Arquivo Excel no OneDrive/SharePoint, via API |
| Como sincroniza | O próprio OneDrive (sync de arquivo local) | Chamadas diretas à API do Graph |
| Setup | ~2 minutos, sem aprovação de ninguém | ~30-60 min, precisa de administrador |

### Como usar

> O painel ainda precisa estar hospedado em algum lugar com HTTPS (o GitHub Pages continua sendo a opção mais simples e gratuita) — os passos de hospedagem são os mesmos descritos na **Etapa 3** da seção "Publicar para várias pessoas (Microsoft 365)" logo abaixo; a diferença é que, neste modo, você **não precisa** fazer a Etapa 1 (Azure AD) nem a Etapa 2 (graph-config.js).

1. Crie (ou peça pra alguém criar) uma pasta dentro do OneDrive ou de um site do SharePoint e **compartilhe com o time** — igual você compartilharia qualquer pasta normalmente.
2. Garanta que essa pasta está **sincronizada localmente** no computador de cada pessoa que vai usar o painel (ícone do OneDrive na barra de tarefas → a pasta aparece no Explorer/Finder como se fosse local).
3. Abra o painel (hospedado no GitHub Pages, como já configuramos) → no cabeçalho, clique em **"Criar novo"** dentro do bloco "Pasta compartilhada" → navegue até aquela pasta sincronizada e salve como `dados-fechamento.json`.
4. As próximas pessoas, ao abrir o painel, clicam em **"Abrir arquivo"** e selecionam esse mesmo `dados-fechamento.json` dentro da pasta sincronizada no computador delas.
5. Pronto — a partir daí, toda alteração feita por qualquer pessoa é salva nesse arquivo, o OneDrive sincroniza sozinho, e o painel busca atualizações a cada 30 segundos (ou na hora, pelo botão de atualizar).

### Limitações importantes

- **Só funciona no Chrome, Edge ou Opera.** Firefox e Safari não suportam essa funcionalidade do navegador (o bloco "Pasta compartilhada" simplesmente não aparece nesses casos).
- **Precisa que o site esteja em HTTPS** (o GitHub Pages já atende isso) — não funciona abrindo o `index.html` direto do disco por duplo clique.
- Cada pessoa precisa ter a pasta **de fato sincronizada localmente** (não só acessível pela web) — se alguém só usa o OneDrive pelo navegador, sem o app de sincronização instalado, esse modo não funciona para ela.
- O navegador pode pedir para "reconectar" ao arquivo de tempos em tempos (é uma proteção de segurança do próprio navegador, não um bug) — é só clicar em "Reconectar" quando aparecer.
- Mesma identificação simples de antes (nome digitado) — sem o rastreamento pela conta Microsoft que o modo Graph oferece.
- Mesma limitação de conflito: duas pessoas editando ao mesmo tempo, vale a última gravação.

Este modo e o modo Microsoft 365/Graph são **alternativos, não simultâneos** — se você ativar `GRAPH_SYNC_ENABLED` em `graph-config.js`, o bloco "Pasta compartilhada" fica desativado automaticamente.

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
2. Arraste os arquivos: `index.html`, `style.css`, `script.js`, `pasta-compartilhada.js`, `graph-config.js`, `graph-sync.js` (direto na raiz do repositório, sem colocar em subpasta).
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

- Clique em qualquer célula editável (competência ou checklist) e edite diretamente. Código+Filial e Responsável são somente leitura (ver seção acima).
- Navegue com **Tab** (próxima célula), **Enter** (célula abaixo) ou as **setas do teclado**.
- As colunas de checklist são checkboxes; a etapa e o percentual de conclusão são calculados automaticamente e aparecem em colunas somente leitura.
- **Adicionar filial** escolhe uma das filiais cadastradas em `FILIAIS_REF` numa lista suspensa — não dá mais para digitar código/nome livremente.
- O ícone de lixeira no fim de cada linha exclui aquela filial.
- Qualquer edição na tabela atualiza o Kanban (e vice-versa) em tempo real — os dois modos compartilham o mesmo estado salvo em `localStorage`.

## Funcionalidades

- **Adicionar filial** a partir de uma lista fixa (sem digitação livre de código/nome).
- **Drag-and-drop** entre colunas.
- **Checklist interativo** dentro do modal de detalhes de cada cartão (clique no cartão para abrir), com atualização automática de progresso e etapa, e registro de quem marcou cada item.
- **Barra de progresso** e percentual de conclusão por filial (baseado nos 9 itens do checklist).
- **Filtros** por Competência, Filial, Responsável e Etapa.
- **Pesquisa** por código ou nome da filial.
- **Ordenação** por Código, Nome, Responsável ou Última atualização.
- **Dashboard** no topo com: total de filiais, concluídas, quantidade em cada etapa e percentual geral do fechamento (com gráfico de rosca).
- **Alerta visual** (ícone vermelho) em cartões sem atualização há mais de 5 dias.
- **Persistência automática** em `localStorage` — ao reabrir a página, o último estado é restaurado.
- **Exportar dados atuais** para Excel, útil como backup antes de limpar/reiniciar.

## Manutenção — como adicionar filiais e tarefas

Duas operações do dia a dia foram desenhadas para serem simples e seguras: adicionar uma filial nova, e adicionar/remover um item de checklist numa etapa existente. Ambas envolvem editar **um único array** no topo de `script.js` — o resto do app (Kanban, Tabela, SLA, dashboard, navegação por teclado) se ajusta sozinho, sem precisar tocar em mais nada.

### Adicionar uma filial nova

Edite o array `FILIAIS_REF`, no topo de `script.js`:

```js
const FILIAIS_REF = [
  { codigo: "101", nome: "Corporativo" },
  { codigo: "103", nome: "CD - Itajaí (Salseiros)" },
  // ...
  { codigo: "118", nome: "CD - Nova Filial" }, // ← adicione assim
];
```

Salve, recarregue a página — a nova filial já aparece no seletor "Adicionar filial" da aba Tabela. Não precisa mexer em mais nada.

### Adicionar (ou remover) um item de checklist numa etapa existente

Edite o array `STAGES`, um pouco acima de `FILIAIS_REF` em `script.js`. Cada etapa tem uma lista `items`:

```js
{
  id: "planejamento",
  label: "Planejamento Financeiro",
  items: [
    { key: "reclassificacao", title: "Reclassificação de benefícios", desc: "" },
    { key: "conferencia", title: "Conferência dos lançamentos contábeis", desc: "" },
    { key: "provisoes", title: "Registro das provisões contábeis", desc: "" },
    { key: "novoItem", title: "Nome da nova tarefa", desc: "Descrição opcional" }, // ← adicione assim
  ]
}
```

Regras para o `key`: precisa ser único entre **todos** os itens de **todas** as etapas (não só dentro da mesma etapa), sem espaços ou acentos — use algo tipo `camelCase`. Depois de salvar e recarregar a página:

- A coluna aparece sozinha na Tabela (cabeçalho e checkbox).
- Entra automaticamente na conta do percentual de conclusão e no cálculo de etapa concluída (Kanban e dashboard).
- Aparece no modal de detalhes do cartão, dentro da etapa certa.
- Se você usa o modo Microsoft 365/Graph, a coluna correspondente no Excel também é considerada automaticamente pelo código — mas **filiais que já tinham dados salvos no Excel antes da mudança não têm essa coluna preenchida** (fica em branco/"Não" até alguém marcar). Isso não quebra nada, só significa que o item começa "pendente" para todo mundo a partir da mudança.

Cartões (filiais) que já existiam antes de você adicionar o item também recebem esse item automaticamente com o valor "não marcado" — ninguém precisa recriar nada.

### Adicionar uma etapa inteiramente nova (ex: uma 6ª coluna no Kanban)

Essa é uma mudança maior — envolve mexer em várias partes do código ao mesmo tempo (cores da coluna no Kanban, meta de SLA, tabela de comparativo, HTML do board) e não está preparada para ser "só editar uma lista". Se chegar a precisar disso, me chame — é mais rápido eu ajustar diretamente do que tentar replicar manualmente o padrão usado nas etapas atuais.

### Personalização visual

- Cores das colunas e paleta geral: variáveis CSS no topo de `style.css` (`--blue`, `--green`, `--orange`, `--red`, `--purple`).

## Compatibilidade

Testado para funcionar em Chrome, Edge e Firefox nas versões atuais. Layout responsivo (o board empilha em uma coluna em telas estreitas).
