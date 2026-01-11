# Roadmap - auto-copilot

Este documento contém melhorias e funcionalidades planejadas para o auto-copilot.

## Funcionalidades Planejadas

_Nenhum item pendente no momento._

---

## 🐛 Bugs

_Nenhum bug conhecido no momento._

---

## Backlog

_Adicionar mais itens conforme necessário_

---

## Concluído

### 🔄 Criar worktree em cima da branch atual por padrão

- **Status:** Concluído na versão 0.2.0.
- **O que mudou:** detectamos automaticamente a branch atual (via `git rev-parse --abbrev-ref HEAD`) e a usamos como base padrão para novos worktrees, com fallback para `HEAD` quando o repositório está em detached HEAD ou quando a flag `--base` é fornecida.

### SyntaxError ao executar `auto-copilot --help` no Node.js v24+ (import assertions)

- **Status:** Corrigido na versão 0.2.0.
- **O que mudou:** substituímos Import Assertions pela sintaxe de Import Attributes (`with { type: 'json' }`), restaurando a compatibilidade com Node.js v24+ sem quebrar o requisito mínimo (>= 22).

### ERR_UNKNOWN_BUILTIN_MODULE: node:abort_controller no Node.js v24+

- **Status:** Corrigido na versão 0.2.1.
- **O que mudou:** removida a importação desnecessária de `AbortController` do módulo `node:abort_controller`. No Node.js v15+, `AbortController` está disponível globalmente e não precisa ser importado. Como o requisito mínimo é Node.js >= 22, podemos usar diretamente sem importação.
