import type { PR, DiffResponse } from './types.ts';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed');
  return data;
}

export const api = {
  getPRs: ()                                        => request<PR[]>('GET', '/prs'),
  getPR:  (id: number)                              => request<PR>('GET', `/prs/${id}`),
  getDiff:(id: number)                              => request<DiffResponse>('GET', `/prs/${id}/diff`),
  getStatus: ()                                     => request<{ running: boolean; lastPollAt: string | null; pollCount: number }>('GET', '/status'),

  merge:           (id: number)                     => request<{ ok: boolean }>('POST', `/prs/${id}/merge`),
  comment:         (id: number, body: string)       => request<{ ok: boolean }>('POST', `/prs/${id}/comment`, { body }),
  close:           (id: number)                     => request<{ ok: boolean }>('POST', `/prs/${id}/close`),
  review:          (id: number, prompt?: string)    => request<{ ok: boolean }>('POST', `/prs/${id}/review`, { prompt }),
  approveCI:       (id: number)                     => request<{ ok: boolean }>('POST', `/prs/${id}/approve-ci`),
  generateComment: (id: number, instruction: string) => request<{ ok: boolean; body: string }>('POST', `/prs/${id}/generate-comment`, { instruction }),
  autofix:         (id: number)                     => request<{ ok: boolean }>('POST', `/prs/${id}/autofix`),
};
