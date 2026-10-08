import { Agent, fetch as undiciFetch } from 'undici';

// Like `curl -k`: accepts self-signed / mismatched TLS certificates. Only clients
// that explicitly opt in use this; everything else keeps normal TLS verification.
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

// undici's Response type differs from the DOM lib's only in declarations; same runtime API.
export const insecureFetch = ((
  url: Parameters<typeof undiciFetch>[0],
  init?: Parameters<typeof undiciFetch>[1],
) =>
  undiciFetch(url, {
    ...init,
    dispatcher: insecureAgent,
  })) as unknown as typeof fetch;

/** Finds a TLS certificate error code anywhere in an error's cause chain. */
export function tlsErrorCode(e: unknown): string | undefined {
  for (
    let cur: any = e, depth = 0;
    cur && depth < 5;
    cur = cur.cause, depth++
  ) {
    const code = cur.code;
    if (
      typeof code === 'string' &&
      /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/.test(code)
    ) {
      return code;
    }
  }
  return undefined;
}
