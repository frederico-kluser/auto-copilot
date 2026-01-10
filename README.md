# auto-copilot

CLI que cria uma worktree Git temporária, guia o GitHub Copilot CLI em dois fluxos (execução principal e finalização automática) e sai com branch e commit consistentes.

## Requisitos

- Node.js **>= 22**
- Git com suporte a `worktree`
- GitHub Copilot CLI (`copilot`) instalado e autenticado (npm `@github/copilot`, Homebrew ou outro canal)
- Token de acesso (ex.: `GH_TOKEN`) configurado para permitir chamadas não interativas — o Copilot CLI também aceita diretórios confiáveis pré-configurados em `~/.copilot/config.json`

## Instalação

```bash
npm install -g auto-copilot
```

Durante o desenvolvimento local você também pode executar via `npx` a partir do diretório do projeto.

## Uso

```bash
auto-copilot [opções]
```

### Opções principais

| Opção | Descrição |
| --- | --- |
| `--path <caminho>` | Repositório Git que servirá como origem. Caso omitido, o CLI usa o repositório atual. |
| `--prompt "texto"` | Prompt enviado ao Copilot no primeiro fluxo. Se omitido e houver TTY, o CLI pergunta interativamente. |
| `--base <ref>` | Referência usada como base do novo worktree (default: `HEAD`). |
| `--timeout <ms>` | Tempo limite por execução do Copilot CLI (default: 15 minutos). |
| `--verbose` | Ativa logs detalhados. |

### Exemplo rápido

```bash
GH_TOKEN=ghp_xxx auto-copilot \
  --path ~/projetos/minha-api \
  --prompt "Adicionar endpoint /health e cobrir com testes" \
  --base main \
  --timeout 600000
```

1. O utilitário descobre o repositório raiz e cria `minha-api.worktree/20260110-020657` com branch homônima.
2. O primeiro fluxo do Copilot executa o prompt informado enquanto transmite stdout/stderr em tempo real.
3. O segundo fluxo reorganiza o resultado: sugere um branch final (ex.: `feat/add-health-endpoint`), renomeia a branch, adiciona arquivos e gera o commit final antes de exibir `git status -sb` limpo.

## Fluxo automatizado

1. **Descoberta do repositório** — usa `--path` ou detecta o Git root atual.
2. **Criação da worktree** — gera diretório `NomeDoProjeto.worktree/<timestamp>` e branch homônima para garantir unicidade, mudando o `cwd` do processo para a nova worktree.
3. **Primeiro prompt do Copilot** — envia o prompt informado (ou coletado interativamente) com flags `--allow-all-tools`, `--allow-all-paths` e `--allow-all-urls` para evitar travas interativas. Todo stdout/stderr é retransmitido em tempo real e o processo é encerrado se o Copilot retornar erro ou exceder o timeout.
4. **Fluxo automático de finalização** — dispara um segundo prompt sem intervenção humana que:
   - analisa o status/diff do repositório;
   - sugere um branch descritivo e renomeia a branch atual;
   - adiciona todos os arquivos e cria um commit coerente;
   - mostra `git status -sb` ao final.
5. **Saída** — logs claros indicam sucesso ou falha e o processo retorna o código apropriado.

## Autenticação e permissões do Copilot CLI

- Configure `GH_TOKEN` (ou `GITHUB_TOKEN`) com um Fine-Grained PAT contendo o escopo **Copilot Requests**. Esse token é repassado ao processo do Copilot CLI automaticamente.
- Execute `copilot trust <path>` previamente ou mantenha o diretório listado em `~/.copilot/config.json` para que não ocorram prompts de confiança.
- O CLI força as flags `--allow-all-tools`, `--allow-all-paths` e `--allow-all-urls` para impedir bloqueios de TTY; ajuste o comportamento por meio do código caso precise de uma política mais rígida.
- Defina `CI=true` (já definido internamente) para sinalizar execução não interativa e evitar prompts extras.

## Tratamento de erros

O CLI distingue problemas operacionais (Git ausente, Copilot indisponível, worktree já existente, timeout) e retorna códigos específicos (`10` para Git, `11` para Copilot, etc.). Mensagens adicionais aparecem com `--verbose` e o processo sempre encerra a worktree com estado consistente.

### Códigos de saída

| Código | Significado |
| --- | --- |
| `0` | Execução bem-sucedida. |
| `1` | Erro genérico não tratado. |
| `2` | Argumentos inválidos / parâmetros ausentes. |
| `10` | Falhas relacionadas ao Git (worktree, branch, permissões). |
| `11` | Erros vindos do Copilot CLI (timeout, falta de instalação, quota). |
| `12` | Problemas de autenticação com o Copilot. |
| `130` | Usuário cancelou a execução (Ctrl+C ou prompt interativo cancelado). |

## Dicas

- Execute `copilot trust <path>` antecipadamente para evitar prompts inesperados.
- Combine com scripts shell, por exemplo: `auto-copilot --path ~/repo --prompt "Implementar feature X"`.
- Use `--base main` para garantir que o worktree nasça a partir da branch principal.

## Estrutura do projeto

```
auto-copilot/
├── package.json        # Configuração do pacote, bin e scripts
├── src/index.js        # Implementação principal do CLI
├── test/smoke.test.js  # Teste básico de smoke
└── README.md           # Este documento
```

## Desenvolvimento

1. Instale dependências: `npm install`.
2. Execute os testes: `npm test`.
3. Valide o CLI localmente com `npm start -- --prompt "..."` (o `--` extra encaminha flags para o binário).
4. Antes de publicar, teste o fluxo completo em um repositório de exemplo e confirme que o Copilot CLI está autenticado e confia no diretório alvo.
