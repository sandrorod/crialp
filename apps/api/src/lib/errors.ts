/** Erro com mensagem segura para exibir ao usuário final. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'APP_ERROR',
  ) {
    super(message);
  }
}

export const Messages = {
  invalidUrl: 'Informe uma URL válida.',
  unreachable: 'Não foi possível acessar este endereço.',
  insufficient: 'Não foi possível obter informações suficientes deste endereço.',
  aiFailed: 'Não foi possível gerar a Landing Page. Tente novamente.',
  aiNotConfigured: 'O serviço de IA não está configurado. Defina a chave do provedor (ANTHROPIC_API_KEY ou GEMINI_API_KEY) no servidor.',
  notFound: 'Registro não encontrado.',
  unauthorized: 'Sessão expirada. Faça login novamente.',
} as const;

export const notFound = (msg: string = Messages.notFound) => new AppError(404, msg, 'NOT_FOUND');
export const badRequest = (msg: string) => new AppError(400, msg, 'BAD_REQUEST');
