export interface DeleteAccountUseCase {
  execute(userId: string): Promise<import('./output-port.js').DeleteAccountOutput>
}
