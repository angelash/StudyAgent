import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { loadApiEnv } from '@study-agent/config';
import { randomUUID } from 'crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import readline from 'node:readline';

type CodexSearchResultItem = {
  title: string;
  url: string;
  content: string;
  publishedDate: string | null;
};

export type CodexSearchResult = {
  query: string;
  answer: string | null;
  results: CodexSearchResultItem[];
  requestId: string | null;
};

const outputSchema = {
  type: 'object',
  properties: {
    answer: {
      type: ['string', 'null'],
    },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          content: { type: 'string' },
          publishedDate: { type: ['string', 'null'] },
        },
        required: ['title', 'url', 'content', 'publishedDate'],
        additionalProperties: false,
      },
    },
  },
  required: ['answer', 'results'],
  additionalProperties: false,
} as const;

@Injectable()
export class CodexSearchService {
  private readonly env = loadApiEnv();

  async search(query: string): Promise<CodexSearchResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      throw new ServiceUnavailableException('Codex websearch query is empty');
    }

    const schemaDirectory = mkdtempSync(join(tmpdir(), 'study-agent-codex-'));
    const schemaPath = join(schemaDirectory, `${randomUUID()}.schema.json`);
    writeFileSync(schemaPath, `${JSON.stringify(outputSchema, null, 2)}\n`, 'utf8');

    try {
      return await new Promise<CodexSearchResult>((resolve, reject) => {
        const args = [
          '--search',
          'exec',
          '--json',
          '--color',
          'never',
          '--sandbox',
          'read-only',
          '-C',
          process.cwd(),
        ];

        if (this.env.CODEX_MODEL?.trim()) {
          args.push('-m', this.env.CODEX_MODEL.trim());
        }

        args.push('--output-schema', schemaPath, '-');

        const child = spawn(this.env.CODEX_COMMAND, args, {
          cwd: process.cwd(),
          env: process.env,
          windowsHide: true,
        });

        const stderrLines: string[] = [];
        let requestId: string | null = null;
        let finalMessage: string | null = null;
        let structuredError: string | null = null;

        const timeout = setTimeout(() => {
          child.kill();
          reject(new ServiceUnavailableException('Codex websearch timed out'));
        }, this.env.CODEX_TIMEOUT_MS);

        child.once('error', (error) => {
          clearTimeout(timeout);
          reject(
            new ServiceUnavailableException(
              `Codex websearch is unavailable: ${error instanceof Error ? error.message : 'unknown process error'}`,
            ),
          );
        });

        child.stdin.write(this.buildPrompt(normalizedQuery), 'utf8');
        child.stdin.end();

        const stdoutReader = readline.createInterface({
          input: child.stdout,
        });
        stdoutReader.on('line', (line) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return;
          }

          try {
            const payload = JSON.parse(trimmed) as Record<string, unknown>;
            const type = typeof payload.type === 'string' ? payload.type : null;

            if (type === 'thread.started') {
              requestId =
                typeof payload.thread_id === 'string' && payload.thread_id.trim()
                  ? payload.thread_id.trim()
                  : null;
              return;
            }

            if (type === 'item.completed') {
              const item =
                payload.item && typeof payload.item === 'object'
                  ? (payload.item as Record<string, unknown>)
                  : null;
              if (item?.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) {
                finalMessage = item.text.trim();
              }
              return;
            }

            if (type === 'error' || type === 'turn.failed') {
              structuredError = this.extractStructuredError(payload) ?? structuredError;
            }
          } catch {
            // Ignore non-JSON stdout lines from the CLI.
          }
        });

        const stderrReader = readline.createInterface({
          input: child.stderr,
        });
        stderrReader.on('line', (line) => {
          const trimmed = line.trim();
          if (trimmed) {
            stderrLines.push(trimmed);
          }
        });

        child.once('close', (code) => {
          clearTimeout(timeout);
          stdoutReader.close();
          stderrReader.close();

          if (code !== 0) {
            const stderrSummary = stderrLines.filter(Boolean).slice(-5).join(' | ');
            reject(
              new ServiceUnavailableException(
                structuredError ||
                  stderrSummary ||
                  `Codex websearch failed with exit code ${code ?? 'unknown'}`,
              ),
            );
            return;
          }

          if (!finalMessage?.trim()) {
            reject(
              new ServiceUnavailableException(
                structuredError || 'Codex websearch finished without returning a structured result',
              ),
            );
            return;
          }

          try {
            const parsed = this.parseStructuredJson(finalMessage);
            resolve({
              query: normalizedQuery,
              answer: parsed.answer?.trim() || null,
              results: parsed.results
                .map((item) => ({
                  title: item.title.trim() || 'Untitled result',
                  url: item.url.trim(),
                  content: item.content.trim(),
                  publishedDate: item.publishedDate?.trim() || null,
                }))
                .filter((item) => item.url),
              requestId,
            });
          } catch (error) {
            reject(
              new ServiceUnavailableException(
                error instanceof Error ? error.message : 'Codex websearch returned invalid JSON',
              ),
            );
          }
        });
      });
    } finally {
      rmSync(schemaDirectory, { recursive: true, force: true });
    }
  }

  private buildPrompt(query: string) {
    return [
      'You are a web research assistant for a K12 learning platform.',
      'Use Codex live web search and return only structured JSON.',
      'Prefer official, educational, or authoritative sources when available.',
      'Do not invent sources or URLs.',
      'Keep snippets short and useful for a downstream tutoring assistant.',
      'Return exactly this JSON shape: {"answer": string|null, "results": Array<{title:string,url:string,content:string,publishedDate:string|null}>}.',
      `Query: ${query}`,
    ].join('\n\n');
  }

  private parseStructuredJson(rawValue: string) {
    const trimmed = this.extractStructuredContent(rawValue);

    try {
      return JSON.parse(trimmed) as {
        answer: string | null;
        results: CodexSearchResultItem[];
      };
    } catch {
      const jsonStart = trimmed.indexOf('{');
      const jsonEnd = trimmed.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as {
          answer: string | null;
          results: CodexSearchResultItem[];
        };
      }

      throw new Error('Codex websearch returned invalid structured JSON');
    }
  }

  private extractStructuredContent(content: string) {
    const trimmed = content.trim();
    const fencedMatch = trimmed.match(/```(?:json|markdown|md)?\s*([\s\S]+?)```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    return trimmed;
  }

  private extractStructuredError(payload: Record<string, unknown>) {
    const directMessage =
      typeof payload.message === 'string' && payload.message.trim() ? payload.message.trim() : null;
    if (directMessage) {
      return directMessage;
    }

    const error =
      payload.error && typeof payload.error === 'object' && !Array.isArray(payload.error)
        ? (payload.error as Record<string, unknown>)
        : null;
    if (!error) {
      return null;
    }

    const code = typeof error.code === 'string' ? error.code.trim() : null;
    const message = typeof error.message === 'string' ? error.message.trim() : null;
    if (code && message) {
      return `${code}: ${message}`;
    }

    return message || code;
  }
}
