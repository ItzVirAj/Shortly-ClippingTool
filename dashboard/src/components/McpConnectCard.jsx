import React, { useState, useCallback } from 'react';
import { Plug, Copy, Check } from 'lucide-react';
import { getApiUrl } from '../config';

// "Connect an agent": the one place that tells a person how to drive
// Shortly from Claude, ChatGPT, Cursor or n8n. Cloud accounts connect by
// URL (claude.ai and ChatGPT run the OAuth flow themselves; CLI clients take
// an API key); a self-hosted install has no auth, so every snippet is the
// local URL and nothing else.

const CLOUD_MCP_URL = 'https://mcp.shortly.app/mcp';

function localMcpUrl() {
  const u = getApiUrl('/mcp');
  if (u.startsWith('http')) return u;
  try { return `${window.location.protocol}//${window.location.hostname}:8000/mcp`; } catch { return 'http://localhost:8000/mcp'; }
}

function buildClients({ cloud, url }) {
  const key = cloud ? 'osk_YOUR_KEY' : null;
  const header = key ? ` \\\n  --header "Authorization: Bearer ${key}"` : '';
  const desktopArgs = key
    ? `["-y", "mcp-remote", "${url}", "--header", "Authorization: Bearer ${key}"]`
    : `["-y", "mcp-remote", "${url}"]`;
  const cursorHeaders = key ? `,\n      "headers": { "Authorization": "Bearer ${key}" }` : '';
  return [
    cloud && {
      id: 'claude-ai', label: 'Claude (claude.ai)', kind: 'steps',
      steps: [
        'Open claude.ai → Settings → Connectors → Add custom connector.',
        `Paste this URL and save: ${url}`,
        'Click Connect: you will land on Shortly to approve the access, then the 8 tools appear in every chat.',
      ],
      snippet: url,
    },
    cloud && {
      id: 'chatgpt', label: 'ChatGPT', kind: 'steps',
      steps: [
        'Open ChatGPT → Settings → Connectors → Create (developer mode).',
        `Name it Shortly, paste this MCP server URL, choose OAuth: ${url}`,
        'Approve the access on Shortly when asked. Done: ask ChatGPT to clip a video.',
      ],
      snippet: url,
    },
    {
      id: 'claude-code', label: 'Claude Code', kind: 'code', lang: 'bash',
      snippet: `claude mcp add shortly ${url}${header}`,
      note: 'Installs in ~/.claude.json. Trigger tools by asking Claude Code to clip or recut a video.',
    },
    {
      id: 'claude-desktop', label: 'Claude Desktop', kind: 'code', lang: 'json',
      snippet: `{
  "mcpServers": {
    "shortly": {
      "command": "npx",
      "args": ${desktopArgs}
    }
  }
}`,
      note: 'Add to ~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or %APPDATA%/Claude/claude_desktop_config.json (Windows). Restart Claude Desktop.',
    },
    {
      id: 'cursor', label: 'Cursor', kind: 'code', lang: 'json',
      snippet: `{
  "mcpServers": {
    "shortly": {
      "url": "${url}"${cursorHeaders}
    }
  }
}`,
      note: 'Paste into Cursor Settings → Features → MCP → Add new MCP server.',
    },
    {
      id: 'n8n', label: 'n8n Workflow', kind: 'steps',
      steps: [
        'Add an "AI Agent" node to your workflow.',
        'Attach an "MCP Tool" sub-node.',
        `Set Server URL to: ${url}`,
        ...(cloud ? ['Add Header: Authorization = Bearer YOUR_KEY'] : []),
        'n8n now exposes all 8 Shortly tools inside the agent.',
      ],
      snippet: url,
    },
  ].filter(Boolean);
}

export default function McpConnectCard({ cloud = true, compact = false }) {
  const url = cloud ? CLOUD_MCP_URL : localMcpUrl();
  const clients = buildClients({ cloud, url });
  const [active, setActive] = useState(clients[0].id);
  const [copied, setCopied] = useState(false);
  const current = clients.find((c) => c.id === active) || clients[0];

  const copy = useCallback(() => {
    navigator.clipboard?.writeText(current.snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  }, [current]);

  return (
    <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)]" id="connect-agent">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#e31084]/20 to-white/[0.06] border border-[#e31084]/30 flex items-center justify-center text-[#ff66b2] shadow-sm">
          <Plug size={18} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white tracking-tight">Connect an Agent</h3>
          <p className="text-xs text-white/50">Built-in Model Context Protocol (MCP) server</p>
        </div>
      </div>
      <p className="text-white/60 text-xs sm:text-sm mb-4 leading-relaxed">
        Let Claude, ChatGPT, Cursor or n8n clip and publish for you through the built-in MCP server:
        8 tools (process a video or upload one, check a job, list clips, add subtitles, recut, publish, quota).
        {cloud
          ? ' claude.ai and ChatGPT connect with one URL and a sign-in; CLI clients use an API key.'
          : ' This install runs without accounts, so no key is needed.'}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-4" role="tablist" aria-label="client">
        {clients.map((c) => (
          <button
            key={c.id}
            role="tab"
            type="button"
            aria-selected={c.id === active}
            onClick={() => { setActive(c.id); setCopied(false); }}
            className={`px-3 py-1.5 rounded-xl text-xs border transition-all duration-150 cursor-pointer active:scale-95 ${
              c.id === active
                ? 'border-[#e31084]/60 bg-gradient-to-b from-[#e31084]/20 to-white/[0.04] text-white font-medium shadow-sm ring-1 ring-[#e31084]/30'
                : 'border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {current.kind === 'steps' && (
        <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm text-white/80 mb-3 leading-relaxed">
          {current.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}

      <div className="relative">
        <pre className={`font-mono text-white/90 whitespace-pre-wrap break-all rounded-2xl border border-white/[0.1] bg-black/45 backdrop-blur-xl p-3.5 pr-20 text-xs shadow-inner ${compact ? '' : 'leading-relaxed'}`}>
          {current.snippet}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="absolute top-2.5 right-2.5 px-3 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.1] text-white/80 hover:text-white text-xs font-medium transition-all active:scale-90 flex items-center gap-1.5 cursor-pointer"
          aria-label="copy"
        >
          {copied ? <Check size={12} className="text-emerald-400" strokeWidth={2.5} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      {current.note && <p className="text-white/45 text-xs mt-2.5 leading-relaxed">{current.note}</p>}
    </div>
  );
}
