const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class Email {
  private constructor(private readonly value: string) {}

  static of(value: string): Email {
    if (!value || !EMAIL_RE.test(value)) {
      throw new Error(`invalid email: ${value}`)
    }
    return new Email(value.toLowerCase())
  }

  toString(): string {
    return this.value
  }

  equals(other: Email): boolean {
    return this.value === other.value
  }
}
