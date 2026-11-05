/**
 * Codex CLI settings shared by every server-side model call. The CLI is used only as a
 * model client: no shell, browser, MCP, image viewing, web search or inherited shell
 * environment. Callers still pass an empty working directory and an allowlisted env.
 */
export const CODEX_DISABLED_FEATURES = ['shell_tool', 'shell_snapshot', 'apps', 'plugins', 'remote_plugin', 'hooks', 'memories',
  'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'in_app_browser', 'computer_use',
  'image_generation', 'multi_agent', 'goals', 'code_mode_host', 'skill_mcp_dependency_install', 'tool_suggest'] as const;

export function codexIsolationArgs(): string[] {
  const args = ['-c', 'web_search="disabled"', '-c', 'tools.view_image=false', '-c', 'shell_environment_policy.inherit="none"'];
  for (const feature of CODEX_DISABLED_FEATURES) args.push('-c', 'features.' + feature + '=false');
  return args;
}
