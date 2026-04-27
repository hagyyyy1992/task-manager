export interface MeUseCase {
  execute(userId: string): Promise<import('./output-port.js').MeOutput>
}
