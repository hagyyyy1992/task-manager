export class Password {
  private constructor(private readonly value: string) {}

  static of(value: string): Password {
    if (!value || typeof value !== 'string') {
      throw new Error('password must be a non-empty string')
    }
    if (value.length < 8) {
      throw new Error('password must be at least 8 characters')
    }
    return new Password(value)
  }

  toString(): string {
    return this.value
  }
}
