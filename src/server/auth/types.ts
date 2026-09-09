import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "./passwords";

export interface UserRecord {
  _id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

/** What the client is told about a user. Never includes the hash. */
export interface PublicUser {
  id: string;
  email: string;
}

export function toPublicUser(record: UserRecord): PublicUser {
  return { id: record._id, email: record.email };
}

/**
 * Length is the only password rule. Composition rules push people towards
 * "Password1!" and OWASP advises against them, so a long passphrase is
 * accepted as-is.
 */
export const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("That does not look like an email address")
    .max(320),
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Use at least ${MIN_PASSWORD_LENGTH} characters; a passphrase is ideal`,
    )
    .max(1024),
});

export type Credentials = z.infer<typeof credentialsSchema>;
