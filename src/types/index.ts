export type KiipuCliConfig = {
  apiBaseUrl: string;
  apiKey?: string;
  keyPrefix?: string;
  authUserId?: string;
  authUsername?: string;
};

export type CliCommandResult = {
  ok: boolean;
  message: string;
  data?: unknown;
  json?: unknown;
};
