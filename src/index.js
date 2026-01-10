#!/usr/bin/env node
import { Command } from 'commander';
import {
  intro,
  outro,
  spinner,
  text,
  note,
  isCancel
} from '@clack/prompts';
import chalk from 'chalk';
import { simpleGit } from 'simple-git';
import { execa } from 'execa';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import { AbortController } from 'node:abort_controller';
import pkg from '../package.json' assert { type: 'json' };

const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_ARGUMENT: 2,
  GIT_ERROR: 10,
  COPILOT_ERROR: 11,
  AUTH_ERROR: 12,
  USER_CANCELLED: 130
};

const DEFAULT_TIMEOUT = 15 * 60 * 1000; // 15 minutos

class OperationalError extends Error {
  constructor(message, code = EXIT_CODES.GENERAL_ERROR, meta = {}) {
    super(message);
    this.name = 'OperationalError';
    this.code = code;
    this.meta = meta;
  }
}

const logVerbose = (enabled, message) => {
  if (enabled) {
    console.log(chalk.dim(`[auto-copilot] ${message}`));
  }
};

async function main() {
  const program = new Command();
  program
    .name('auto-copilot')
    .description('Cria um worktree Git e executa fluxos do GitHub Copilot CLI de ponta a ponta.')
    .version(pkg.version)
    .option('--path <path>', 'Caminho para um repositório Git existente')
    .option('--prompt <prompt>', 'Prompt a ser enviado ao Copilot no primeiro fluxo')
    .option('--base <ref>', 'Referência base para a nova branch', 'HEAD')
    .option('--timeout <ms>', 'Tempo limite (ms) por execução do Copilot CLI', (value) => Number(value), DEFAULT_TIMEOUT)
    .option('--verbose', 'Ativa logs detalhados', false);

  program.parse(process.argv);
  const options = program.opts();
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  const verbose = Boolean(options.verbose);
  const timeout = Number.isFinite(options.timeout) && options.timeout > 0 ? options.timeout : DEFAULT_TIMEOUT;

  if (interactive) {
    intro('🌳  auto-copilot');
  }

  try {
    const repoPath = await resolveRepoPath(options.path);
    logVerbose(verbose, `Usando repositório: ${repoPath}`);

    const { worktreePath, branchName } = await createWorktree({
      repoPath,
      baseRef: options.base,
      verbose
    });

    process.chdir(worktreePath);
    note(`Worktree pronta em ${worktreePath}`, 'Ambiente');

    const userPrompt = await resolvePrompt(options.prompt, interactive);
    const firstPrompt = buildFirstPrompt({
      userPrompt,
      repoName: path.basename(repoPath),
      branchName
    });

    await runCopilotFlow({
      prompt: firstPrompt,
      cwd: worktreePath,
      label: 'Fluxo principal do Copilot',
      verbose,
      timeout
    });

    const secondPrompt = await buildSecondPrompt({
      worktreePath,
      originalPrompt: userPrompt,
      initialBranch: branchName
    });

    await runCopilotFlow({
      prompt: secondPrompt,
      cwd: worktreePath,
      label: 'Fluxo automático de finalização',
      verbose,
      timeout
    });

    if (interactive) {
      outro('✅ Processo concluído com sucesso.');
    } else {
      console.log('✅ Processo concluído com sucesso.');
    }
    process.exit(EXIT_CODES.SUCCESS);
  } catch (error) {
    handleError(error, interactive);
  }
}

async function resolveRepoPath(customPath) {
  const candidate = customPath ? path.resolve(customPath) : process.cwd();

  try {
    await fs.access(candidate);
  } catch (error) {
    throw new OperationalError(
      `O caminho informado não existe: ${candidate}`,
      EXIT_CODES.INVALID_ARGUMENT,
      { cause: error }
    );
  }

  const git = simpleGit({ baseDir: candidate, binary: 'git' });

  try {
    const root = await git.revparse(['--show-toplevel']);
    return root.trim();
  } catch (error) {
    if (customPath) {
      throw new OperationalError(
        `O caminho informado não contém um repositório Git válido: ${candidate}`,
        EXIT_CODES.INVALID_ARGUMENT,
        { cause: error }
      );
    }

    throw new OperationalError(
      'Diretório atual não faz parte de um repositório Git. Informe um caminho com --path.',
      EXIT_CODES.INVALID_ARGUMENT,
      { cause: error }
    );
  }
}

function buildTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function ensurePathAbsent(targetPath) {
  try {
    await fs.access(targetPath);
    throw new OperationalError(
      `Já existe um diretório no caminho planejado para o worktree: ${targetPath}`,
      EXIT_CODES.INVALID_ARGUMENT
    );
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}

async function createWorktree({ repoPath, baseRef, verbose }) {
  const repoName = path.basename(repoPath);
  const timestamp = buildTimestamp();
  const worktreeRoot = path.resolve(path.dirname(repoPath), `${repoName}.worktree`);
  const worktreePath = path.join(worktreeRoot, timestamp);
  const git = simpleGit({ baseDir: repoPath, binary: 'git' });

  await fs.mkdir(worktreeRoot, { recursive: true });
  await ensurePathAbsent(worktreePath);

  const spin = spinner();
  spin.start('Criando worktree');

  try {
    await git.raw(['worktree', 'add', '-b', timestamp, worktreePath, baseRef]);
    spin.stop('Worktree criada com sucesso');
    logVerbose(verbose, `Branch temporária: ${timestamp}`);
    return { worktreePath, branchName: timestamp };
  } catch (error) {
    spin.stop('Falha ao criar worktree');
    throw new OperationalError(`Erro ao criar worktree: ${error.message}`, EXIT_CODES.GIT_ERROR, { cause: error });
  }
}

async function resolvePrompt(providedPrompt, interactive) {
  if (providedPrompt && providedPrompt.trim()) {
    return providedPrompt.trim();
  }

  if (!interactive) {
    throw new OperationalError(
      'Nenhum prompt foi informado. Use --prompt quando rodar em modo não interativo.',
      EXIT_CODES.INVALID_ARGUMENT
    );
  }

  const response = await text({
    message: 'Descreva o trabalho que o Copilot deve executar:',
    placeholder: 'Ex: refatorar o módulo de autenticação e adicionar testes'
  });

  if (isCancel(response) || !response?.trim()) {
    throw new OperationalError('Execução cancelada pelo usuário.', EXIT_CODES.USER_CANCELLED);
  }

  return response.trim();
}

function buildFirstPrompt({ userPrompt, repoName, branchName }) {
  return [
    'Você está trabalhando em um worktree Git isolado criado exclusivamente para este fluxo.',
    `Repositório: ${repoName}`,
    `Branch temporário: ${branchName}`,
    'Objetivo: execute o trabalho descrito abaixo de ponta a ponta, usando testes e commits locais quando fizer sentido.',
    'Restrições: não execute git push nem deixe alterações sem commit no final.',
    'Prompt do usuário:',
    userPrompt
  ].join('\n\n');
}

async function buildSecondPrompt({ worktreePath, originalPrompt, initialBranch }) {
  const snapshot = await collectGitSnapshot(worktreePath);
  return [
    'Finalize o trabalho automático de pós-processamento.',
    `Prompt original fornecido ao Copilot: ${originalPrompt}`,
    `Branch atual antes da renomeação: ${snapshot.branch || initialBranch}`,
    'Mudanças pendentes:',
    snapshot.statusSummary,
    'Resumo do diff:',
    snapshot.diffSummary,
    'Tarefas obrigatórias:',
    '1. Proponha um nome de branch descritivo (formato tipo/descricao-curta) que reflita o trabalho realizado.',
    '2. Renomeie a branch atual para o novo nome usando "git branch -m <novo-nome>".',
    '3. Execute "git add -A" para preparar todas as alterações.',
    '4. Crie um commit único com mensagem coerente com o novo nome da branch ("git commit -m ...").',
    '5. Mostre "git status -sb" ao final para comprovar que o diretório está limpo.',
    '6. Não execute git push nem altere remotes.',
    'Finalize somente após renomear a branch e criar o commit.'
  ].join('\n\n');
}

async function collectGitSnapshot(cwd) {
  try {
    const git = simpleGit({ baseDir: cwd, binary: 'git' });
    const status = await git.status();
    const diffSummary = await git.diffSummary();

    const files = status.files.map((file) => `${file.index}${file.working_tree} ${file.path}`);
    const statusSummary = files.length ? files.join('\n') : 'Nenhum arquivo pendente';
    const diffLines = diffSummary.files.map((file) => `${file.file}: +${file.insertions} -${file.deletions}`);
    const diffText = diffLines.length ? diffLines.join('\n') : 'Sem diff registrado';

    return {
      branch: status.current,
      statusSummary,
      diffSummary: diffText
    };
  } catch (error) {
    return {
      branch: null,
      statusSummary: 'Não foi possível coletar git status automaticamente.',
      diffSummary: error.message
    };
  }
}

function buildCopilotArgs(prompt) {
  return [
    '-p',
    prompt,
    '--allow-all-tools',
    '--allow-all-paths',
    '--allow-all-urls',
    '--output-format',
    'text'
  ];
}

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (typeof timer.unref === 'function') timer.unref();
  return controller.signal;
}

async function runCopilotFlow({ prompt, cwd, label, verbose, timeout }) {
  console.log(chalk.cyan(`▶ ${label}`));

  const env = { ...process.env, CI: 'true' };
  const args = buildCopilotArgs(prompt);

  const child = execa('copilot', args, {
    cwd,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
    signal: timeoutSignal(timeout),
    timed: true
  });

  child.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr?.on('data', (chunk) => process.stderr.write(chunk));

  try {
    const result = await child;
    const elapsed = result.timed?.elapsedMilliseconds;
    logVerbose(
      verbose,
      elapsed ? `Copilot finalizou ${label} em ${elapsed}ms` : `Copilot finalizou ${label}.`
    );
    console.log(chalk.green(`✔ ${label} concluído`));
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new OperationalError(
        `Copilot excedeu o tempo limite (${timeout}ms) durante ${label}.`,
        EXIT_CODES.COPILOT_ERROR
      );
    }

    if (error.code === 'ENOENT') {
      throw new OperationalError(
        'Copilot CLI não encontrado no PATH. Instale-o com "npm install -g @github/copilot".',
        EXIT_CODES.COPILOT_ERROR
      );
    }

    const stderr = error.stderr || error.shortMessage || error.message;
    throw new OperationalError(
      `Copilot falhou durante ${label}: ${stderr}`,
      EXIT_CODES.COPILOT_ERROR,
      { cause: error }
    );
  }
}

function handleError(error, interactive) {
  const message = error instanceof OperationalError ? error.message : 'Erro inesperado';
  if (interactive) {
    outro(`❌ ${message}`);
  } else {
    console.error(`❌ ${message}`);
  }

  if (!(error instanceof OperationalError)) {
    console.error(error);
  } else if (error.meta?.cause && process.env.DEBUG) {
    console.error(error.meta.cause);
  }

  process.exit(error instanceof OperationalError ? error.code : EXIT_CODES.GENERAL_ERROR);
}

main();
