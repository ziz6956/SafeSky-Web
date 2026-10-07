// API-ошибка с машинным кодом: ответ { error, message, ...extra }.
// Фронт (js/api.js) различает состояния по полю error, а не по тексту.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}
