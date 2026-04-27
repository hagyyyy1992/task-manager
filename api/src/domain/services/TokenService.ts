export interface TokenService {
  issue(userId: string): Promise<string>
  issueLongLived(userId: string): Promise<string>
  verify(token: string): Promise<string | null>
}
