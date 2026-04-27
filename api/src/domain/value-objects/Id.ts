export class Id {
  private constructor(private readonly value: string) {}

  static of(value: string): Id {
    if (!value || typeof value !== 'string') {
      throw new Error('Id must be a non-empty string')
    }
    return new Id(value)
  }

  toString(): string {
    return this.value
  }

  equals(other: Id): boolean {
    return this.value === other.value
  }
}
