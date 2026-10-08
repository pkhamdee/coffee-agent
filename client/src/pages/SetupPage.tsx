import { useState, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  getMcpSettings,
  getModelSettings,
  saveMcpSettings,
  saveModelSettings,
  testMcpSettings,
  testModelSettings,
} from '../api';
import type { McpSettingsInput, ModelSettingsInput } from '../types';

type Status = { kind: 'success' | 'error'; text: string } | null;

type Field = {
  key: string;
  label: string;
  type: 'url' | 'text' | 'password' | 'checkbox';
  placeholder: string;
  hint?: string;
};

type Values = Record<string, string | boolean>;

/** What every settings endpoint returns: plain values + whether the secret is set. */
type PublicSettings = Record<string, unknown> & {
  hasSecret: boolean;
  source: 'env' | 'setup-page';
};

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#00704A]/40 focus:border-[#00704A]';

const headerLinkClass =
  'text-xs px-3 py-1.5 rounded-full border border-white/30 text-white/70 hover:bg-white/10 transition-colors';

/**
 * One settings form: loads current values, tests them without applying, saves.
 * The secret field (last password field) is never pre-filled; blank = keep.
 */
function SettingsCard({
  title,
  description,
  fields,
  load,
  test,
  save,
}: {
  title: string;
  description: ReactNode;
  fields: Field[];
  load: () => Promise<PublicSettings>;
  test: (values: Values) => Promise<string>;
  save: (values: Values) => Promise<PublicSettings>;
}) {
  const [current, setCurrent] = useState<PublicSettings | null>(null);
  const [values, setValues] = useState<Values>({});
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const applyLoaded = (s: PublicSettings) => {
    setCurrent(s);
    setValues(
      Object.fromEntries(
        fields.map((f) => [
          f.key,
          f.type === 'checkbox'
            ? Boolean(s[f.key])
            : f.type === 'password'
              ? ''
              : String(s[f.key] ?? ''),
        ]),
      ),
    );
  };

  useEffect(() => {
    load()
      .then(applyLoaded)
      .catch(() =>
        setStatus({ kind: 'error', text: 'Failed to load settings. Is the backend running?' }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed: Values = Object.fromEntries(
    fields.map((f) => {
      const v = values[f.key];
      return [f.key, typeof v === 'boolean' ? v : (v ?? '').trim()];
    }),
  );
  const canSubmit =
    busy === null &&
    fields.every((f) => f.type === 'password' || f.type === 'checkbox' || trimmed[f.key]);

  const run = async (kind: 'test' | 'save') => {
    setBusy(kind);
    setStatus(null);
    try {
      if (kind === 'test') {
        setStatus({ kind: 'success', text: await test(trimmed) });
      } else {
        applyLoaded(await save(trimmed));
        setStatus({ kind: 'success', text: 'Saved. Applies to new chat messages right away.' });
      }
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) run('save');
      }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4"
    >
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-400 mt-1">
          {description}
          {current && (
            <>
              {' '}
              Currently using{' '}
              <span className="text-[#00704A] font-medium">
                {current.source === 'env' ? '.env values' : 'values saved here'}
              </span>
              .
            </>
          )}
        </p>
      </div>

      {fields.map((f) =>
        f.type === 'checkbox' ? (
          <label key={f.key} className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={values[f.key] === true}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-[#00704A]"
            />
            <span className="text-sm text-gray-600">
              {f.label}
              {f.hint && <span className="block text-xs text-gray-400 mt-0.5">{f.hint}</span>}
            </span>
          </label>
        ) : (
          <label key={f.key} className="flex flex-col gap-1.5">
            <span className="text-sm text-gray-600">{f.label}</span>
            <input
              type={f.type}
              required={f.type !== 'password'}
              autoComplete={f.type === 'password' ? 'off' : undefined}
              value={String(values[f.key] ?? '')}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={
                f.type === 'password'
                  ? current?.hasSecret
                    ? '•••••••• (set — leave blank to keep)'
                    : 'Not set'
                  : f.placeholder
              }
              className={inputClass}
            />
          </label>
        ),
      )}

      {status && (
        <div
          className={`text-sm rounded-xl px-4 py-3 border break-words ${
            status.kind === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {status.text}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => run('test')}
          disabled={!canSubmit}
          className="flex-1 border border-[#00704A] text-[#00704A] hover:bg-[#00704A]/5 disabled:opacity-60 font-semibold py-3 rounded-xl transition-colors"
        >
          {busy === 'test' ? 'Testing…' : 'Test connection'}
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 bg-[#00704A] hover:bg-[#005c3b] disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

const modelInput = (v: Values): ModelSettingsInput => ({
  baseUrl: String(v.baseUrl),
  modelName: String(v.modelName),
  token: String(v.token),
  skipTlsVerify: v.skipTlsVerify === true,
});

const mcpInput = (v: Values): McpSettingsInput => ({
  url: String(v.url),
  city: String(v.city),
  apiKey: String(v.apiKey),
  skipTlsVerify: v.skipTlsVerify === true,
});

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-[#F2F0EB]">
      {/* Header */}
      <header className="bg-[#1E3932] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#00704A] flex items-center justify-center font-bold text-lg">
            ⚙
          </div>
          <div>
            <h1 className="text-base font-semibold leading-none">Setup</h1>
            <p className="text-xs text-green-300 mt-0.5">Model and MCP connections</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/" className={headerLinkClass}>
            Chat
          </Link>
          <Link to="/barista" className={headerLinkClass}>
            Barista
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">
        <SettingsCard
          title="LLM endpoint"
          description={
            <>
              Any OpenAI-compatible API — OpenRouter, Ollama (<code>/v1</code>), vLLM…
            </>
          }
          fields={[
            {
              key: 'baseUrl',
              label: 'Model base URL',
              type: 'url',
              placeholder: 'https://openrouter.ai/api/v1',
            },
            {
              key: 'modelName',
              label: 'Model name',
              type: 'text',
              placeholder: 'qwen/qwen3.8-flash',
            },
            { key: 'token', label: 'Access token', type: 'password', placeholder: '' },
            {
              key: 'skipTlsVerify',
              label: 'Skip TLS certificate verification',
              type: 'checkbox',
              placeholder: '',
              hint: 'Like curl -k — only for trusted internal gateways with self-signed certificates.',
            },
          ]}
          load={async () => {
            const s = await getModelSettings();
            return { ...s, hasSecret: s.hasToken };
          }}
          test={async (v) => {
            await testModelSettings(modelInput(v));
            return 'Connection works — the model replied.';
          }}
          save={async (v) => {
            const s = await saveModelSettings(modelInput(v));
            return { ...s, hasSecret: s.hasToken };
          }}
        />

        <SettingsCard
          title="Weather MCP server"
          description="The agent calls this MCP server's get_current_weather tool to suggest iced or hot drinks."
          fields={[
            {
              key: 'url',
              label: 'MCP server URL',
              type: 'url',
              placeholder: 'https://weather.example.com/mcp',
            },
            { key: 'city', label: 'Shop city', type: 'text', placeholder: 'Bangkok' },
            { key: 'apiKey', label: 'API key', type: 'password', placeholder: '' },
            {
              key: 'skipTlsVerify',
              label: 'Skip TLS certificate verification',
              type: 'checkbox',
              placeholder: '',
              hint: 'Like curl -k — only for trusted internal gateways with self-signed certificates.',
            },
          ]}
          load={async () => {
            const s = await getMcpSettings();
            return { ...s, hasSecret: s.hasApiKey };
          }}
          test={async (v) => {
            const w = await testMcpSettings(mcpInput(v));
            return `Connection works — ${w.city}, ${w.country}: ${w.temperatureC}°C (feels like ${w.feelsLikeC}°C), ${w.condition}.`;
          }}
          save={async (v) => {
            const s = await saveMcpSettings(mcpInput(v));
            return { ...s, hasSecret: s.hasApiKey };
          }}
        />

        <p className="text-xs text-gray-400 text-center">
          Saved settings are kept in memory only. Restarting the backend goes back to the values in{' '}
          <code>.env</code>.
        </p>
      </main>
    </div>
  );
}
