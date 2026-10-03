export interface MainAgent {
  version: string;
  run(): Promise<Record<string, string>>;
  abort(): Promise<void>;
}
