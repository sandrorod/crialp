import { describe, expect, it } from 'vitest';
import { parseRapidSnippet } from './rapidSnippet';

const KEY = `${'a'.repeat(20)}0123456789abcdefghij`;

describe('parseRapidSnippet', () => {
  it('cURL do Playground no formato OpenAI: host, chave, caminho, modelo e extras do corpo', () => {
    const curl = `curl --request POST \\
  --url https://gemini-1-5-flash.p.rapidapi.com/v1/chat \\
  --header 'Content-Type: application/json' \\
  --header 'x-rapidapi-host: gemini-1-5-flash.p.rapidapi.com' \\
  --header 'x-rapidapi-key: ${KEY}' \\
  --data '{"model":"gemini-1.5-flash","messages":[{"role":"user","content":"Olá"}],"temperature":0.7}'`;
    const info = parseRapidSnippet(curl);
    expect(info.host).toBe('gemini-1-5-flash.p.rapidapi.com');
    expect(info.key).toBe(KEY);
    expect(info.config).toMatchObject({ host: 'gemini-1-5-flash.p.rapidapi.com', path: '/v1/chat', format: 'openai', model: 'gemini-1.5-flash' });
    expect(JSON.parse(info.config!.template!)).toEqual({ temperature: 0.7 });
  });

  it('corpo no formato do Google (contents)', () => {
    const info = parseRapidSnippet(`fetch('https://x.p.rapidapi.com/', { body: JSON.stringify({"contents":[{"parts":[{"text":"oi"}]}]}) })`);
    expect(info.config?.format).toBe('google');
  });

  it('texto sem host do RapidAPI não devolve configuração', () => {
    expect(parseRapidSnippet('qualquer coisa')).toEqual({ key: undefined, host: undefined });
  });
});
