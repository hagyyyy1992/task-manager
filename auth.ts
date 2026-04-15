import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "task-app-dev-secret-change-in-production"
);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      resolve(`${salt}:${derived.toString("hex")}`);
    });
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      resolve(timingSafeEqual(Buffer.from(key, "hex"), derived));
    });
  });
}

export async function createToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}
