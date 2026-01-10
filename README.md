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
| `--base <ref>` | Referência usada como base do novo worktree (default: branch atual; fallback para `HEAD`). |
| `--timeout <min>` | Tempo limite (em minutos) para cada execução do Copilot CLI. Default: 60 min; caso a flag não seja fornecida e exista TTY, o CLI pergunta ao usuário após coletar o prompt. |
| `--verbose` | Ativa logs detalhados. |

### Exemplo rápido

```bash
GH_TOKEN=ghp_xxx auto-copilot \
  --path ~/projetos/minha-api \
  --prompt "Adicionar endpoint /health e cobrir com testes" \
  --base main \
  --timeout 20
```

1. O utilitário descobre o repositório raiz e cria `minha-api.worktree/20260110-020657` com branch homônima.
2. O primeiro fluxo do Copilot executa o prompt informado enquanto transmite stdout/stderr em tempo real.
3. O segundo fluxo reorganiza o resultado: sugere um branch final (ex.: `feat/add-health-endpoint`), renomeia a branch, adiciona arquivos e gera o commit final antes de exibir `git status -sb` limpo.

> Dica: se você não usar `--timeout`, o CLI pergunta "Quantos minutos?" logo após coletar o prompt e, se você pressionar Enter, assume 60 minutos.

## Fluxo automatizado

1. **Descoberta do repositório** — usa `--path` ou detecta o Git root atual.
2. **Criação da worktree** — gera diretório `NomeDoProjeto.worktree/<timestamp>` e branch homônima para garantir unicidade, mudando o `cwd` do processo para a nova worktree e usando, por padrão, a branch atual como base (fallback para `HEAD` ou para o valor de `--base`, se informado).
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

## Guia completo para debugging e wrapping do GitHub Copilot CLI em Node.js

O GitHub Copilot CLI (`gh copilot`) **foi deprecado em 25 de outubro de 2025** em favor do novo `copilot` CLI standalone. Este guia cobre ambas as ferramentas e fornece padrões práticos para construir wrappers robustos em Node.js usando execa.

### O mecanismo principal de debug: GH_DEBUG

A variável de ambiente `GH_DEBUG` é a ferramenta mais poderosa para debugging do `gh copilot`. Com `GH_DEBUG=api`, você obtém logs completos do tráfego HTTP, incluindo headers, payloads e tempos de resposta da API `api.githubcopilot.com`.

```javascript
import { execa } from 'execa';

const result = await execa('gh', ['copilot', 'suggest', '-t', 'shell', 'list files'], {
  env: { ...process.env, GH_DEBUG: 'api' },
  all: true  // Captura stdout + stderr intercalados
});

// Debug output vai para stderr
console.log('Debug logs:', result.stderr);
```

O valor `GH_DEBUG=1` ativa output verboso básico, enquanto `GH_DEBUG=api` adiciona logging completo do tráfego HTTP — essencial para diagnosticar problemas de autenticação, rate limiting e timeouts. Note que **não existem flags `--debug` ou `--verbose`** no comando `gh copilot` em si.

### Exit codes e detecção de erros

O `gh` CLI segue convenções Unix documentadas: **exit code 0** indica sucesso, **1** erro geral, **2** comando cancelado, e **4** autenticação necessária. Um problema conhecido é que erros HTTP 401 podem retornar código 1 ao invés de 4, complicando a detecção de problemas de auth.

```javascript
import { execa, ExecaError } from 'execa';

async function runCopilot(query, target = 'shell') {
  try {
    return await execa('gh', ['copilot', 'suggest', '-t', target, query], {
      timeout: 30000,
      env: { ...process.env, GH_PROMPT_DISABLED: '1' }
    });
  } catch (error) {
    if (!(error instanceof ExecaError)) throw error;
    
    // Classificação precisa do erro
    if (error.timedOut) {
      throw new CopilotTimeoutError(`Timeout após 30s: ${query}`);
    }
    if (error.exitCode === 4 || error.stderr?.includes('No valid OAuth token')) {
      throw new CopilotAuthError('Autenticação OAuth necessária');
    }
    if (error.stderr?.includes('rate limit') || error.stderr?.includes('HTTP 429')) {
      throw new CopilotRateLimitError('Rate limit atingido');
    }
    
    throw new CopilotError(error.shortMessage, { cause: error });
  }
}
```

### Modos de falha mais comuns

O **erro de autenticação mais frequente** ocorre quando `GH_TOKEN` ou `GITHUB_TOKEN` estão definidos — o `gh copilot` requer OAuth app authentication, não Personal Access Tokens. A solução é limpar essas variáveis e usar `gh auth login --web`.

| Erro | Causa | Solução |
|------|-------|---------|
| `No valid OAuth token detected` | PAT ao invés de OAuth | `unset GH_TOKEN && gh auth login --web` |
| `rate limit exceeded` / HTTP 429 | Muitas requisições | Implementar backoff exponencial |
| `Client.Timeout exceeded` | Query muito longa | Aumentar timeout ou quebrar query |
| `fetch failed` | Proxy corporativo | Verificar configurações de proxy |
| `spawn gh ENOENT` | gh não está no PATH | Instalar gh CLI ou ajustar PATH |

Falhas silenciosas (exit 0 mas sem output útil) podem ocorrer quando stdin não é um TTY ou quando há rate limiting parcial. A detecção requer validação do conteúdo da resposta além do exit code.

### Estrutura recomendada para logging

Para CLIs que wrappam processos externos, **consola** é ideal por seu output formatado com ícones e cores, enquanto o módulo **debug** permite debugging granular via namespaces.

```javascript
import { createConsola } from 'consola';
import debug from 'debug';

// Logger para output do usuário
const logger = createConsola({
  level: process.argv.includes('-v') ? 4 : 3  // 4=debug, 3=info
});

// Debug namespaces para desenvolvimento
const debugCopilot = debug('mycli:copilot');
const debugExec = debug('mycli:exec');

export async function executeCopilot(query, options = {}) {
  const startTime = Date.now();
  debugExec('Iniciando comando: %s', query);
  
  try {
    const result = await runCopilotWithRetry(query, options);
    const duration = Date.now() - startTime;
    
    debugCopilot('Sucesso em %dms: %s', duration, result.stdout.slice(0, 100));
    logger.success(`Comando executado em ${duration}ms`);
    
    return result;
  } catch (error) {
    debugCopilot('Falha: %O', error);
    logger.error(error.message);
    throw error;
  }
}
```

Ative os logs de debug com `DEBUG=mycli:* node cli.js` — isso não afeta o output do usuário mas fornece visibilidade total durante desenvolvimento e troubleshooting.

### Padrão robusto com retry e circuit breaker

O wrapper completo deve implementar **retry com backoff exponencial** para erros transientes e **circuit breaker** para proteger contra cascatas de falha quando o serviço está instável.

```javascript
import { execa, ExecaError } from 'execa';
import pRetry from 'p-retry';
import CircuitBreaker from 'opossum';

class CopilotCLIWrapper {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 3;
    this.debug = options.debug || false;
    
    // Circuit breaker: abre após 3 falhas em 10 requisições
    this.breaker = new CircuitBreaker(this._execute.bind(this), {
      timeout: this.timeout,
      errorThresholdPercentage: 30,
      resetTimeout: 60000,
      volumeThreshold: 10
    });
    
    this.breaker.fallback(() => ({
      failed: true,
      message: 'Copilot CLI temporariamente indisponível'
    }));
  }

  async _execute(query, target) {
    const env = {
      ...process.env,
      GH_PROMPT_DISABLED: '1',
      ...(this.debug && { GH_DEBUG: 'api' })
    };

    return execa('gh', ['copilot', 'suggest', '-t', target, query], {
      timeout: this.timeout,
      env,
      all: true
    });
  }

  async suggest(query, target = 'shell') {
    return pRetry(
      () => this.breaker.fire(query, target),
      {
        retries: this.maxRetries,
        minTimeout: 1000,
        maxTimeout: 10000,
        onFailedAttempt: ({ attemptNumber, retriesLeft, error }) => {
          console.warn(`Tentativa ${attemptNumber} falhou. ${retriesLeft} restantes.`);
          
          // Não fazer retry em erros de autenticação
          if (error.exitCode === 4 || error.stderr?.includes('OAuth')) {
            throw new pRetry.AbortError('Erro de autenticação - retry abortado');
          }
        }
      }
    );
  }
}
```

O **circuit breaker** previne que sua aplicação continue bombardeando um serviço que está falhando — após atingir o threshold de erros, ele "abre" e retorna o fallback imediatamente por 60 segundos antes de tentar novamente.

### Detecção de erros silenciosos em tempo real

Mesmo com exit code 0, o output pode indicar problemas. Use streaming para detectar erros durante a execução.

```javascript
async function suggestWithValidation(query, target = 'shell') {
  const subprocess = execa('gh', ['copilot', 'suggest', '-t', target, query], {
    timeout: 30000,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' }
  });

  const errorPatterns = [
    /error:/i,
    /failed to/i,
    /could not connect/i,
    /rate limit/i
  ];

  const lines = [];
  const detectedErrors = [];

  for await (const line of subprocess) {
    lines.push(line);
    
    for (const pattern of errorPatterns) {
      if (pattern.test(line)) {
        detectedErrors.push({ pattern: pattern.source, line });
      }
    }
  }

  const result = await subprocess;
  
  // Validar mesmo em sucesso
  if (detectedErrors.length > 0) {
    throw new Error(`Erros detectados no output: ${JSON.stringify(detectedErrors)}`);
  }
  
  if (!result.stdout.trim()) {
    throw new Error('Resposta vazia do Copilot CLI');
  }

  return result;
}
```

### Graceful shutdown e signal handling

Para aplicações de longa duração, implemente shutdown graceful que termina processos filhos corretamente.

```javascript
class ManagedCopilotWrapper {
  constructor() {
    this.activeProcesses = new Set();
    this.shuttingDown = false;
    
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }

  async shutdown(signal) {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    
    console.log(`Recebido ${signal}, finalizando processos...`);
    
    // Grace period de 5 segundos
    const forceKill = setTimeout(() => {
      for (const proc of this.activeProcesses) {
        proc.kill('SIGKILL');
      }
    }, 5000);

    for (const proc of this.activeProcesses) {
      proc.kill('SIGTERM');
    }

    await Promise.allSettled(
      [...this.activeProcesses].map(p => p.catch(() => {}))
    );
    
    clearTimeout(forceKill);
    process.exit(0);
  }

  async run(query, target) {
    if (this.shuttingDown) {
      throw new Error('Sistema em shutdown');
    }

    const subprocess = execa('gh', ['copilot', 'suggest', '-t', target, query], {
      timeout: 30000,
      cleanup: true,  // Mata processo filho quando parent termina
      forceKillAfterDelay: 5000  // SIGKILL após 5s se SIGTERM falhar
    });

    this.activeProcesses.add(subprocess);
    
    try {
      return await subprocess;
    } finally {
      this.activeProcesses.delete(subprocess);
    }
  }
}
```

### Variáveis de ambiente essenciais

| Variável | Propósito | Valor recomendado |
|----------|-----------|-------------------|
| `GH_DEBUG` | Ativa logging verboso | `api` para debug completo |
| `GH_PROMPT_DISABLED` | Desativa prompts interativos | `1` para automação |
| `GH_TOKEN` | **Não usar** com gh copilot | Deixar vazio (usar OAuth) |
| `NO_COLOR` | Desativa cores ANSI | `1` para parsing de output |
| `GH_HOST` | Hostname do GitHub | Para GitHub Enterprise |

Para o novo `copilot` CLI standalone (pós-deprecação), use `--log-level debug` e `COPILOT_GITHUB_TOKEN` para autenticação.

### Conclusão

Construir um wrapper robusto para o GitHub Copilot CLI requer atenção a três aspectos críticos: **debug via `GH_DEBUG=api`** para visibilidade do tráfego HTTP, **tratamento diferenciado de erros** usando as propriedades `timedOut`, `exitCode` e padrões no stderr do execa, e **resiliência via retry com backoff e circuit breaker**.

A migração para o novo `copilot` CLI standalone deve ser considerada dado o deprecation de outubro 2025 — ele oferece flags nativas como `--log-level debug` que simplificam significativamente o troubleshooting. Para projetos novos, implemente o wrapper com suporte a ambas as versões para facilitar a transição.

