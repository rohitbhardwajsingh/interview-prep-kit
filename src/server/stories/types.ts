import { z } from "zod";

/**
 * A real thing the user did, recorded once and reused across kits. This is the
 * raw material for the evidence check: a requirement with questions but no
 * story behind it is a gap in the candidate, not in the kit.
 */
export interface StoryRecord {
  _id: string;
  userId: string;
  title: string;
  situation: string;
  action: string;
  result: string;
  /** Free-text skills the user says this story demonstrates. */
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const storySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the story a name you will recognise")
    .max(200),
  situation: z.string().trim().max(4_000).default(""),
  action: z.string().trim().max(4_000).default(""),
  result: z.string().trim().max(4_000).default(""),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
});

export type StoryInput = z.infer<typeof storySchema>;

export interface PublicStory extends StoryInput {
  id: string;
}

export function toPublicStory(record: StoryRecord): PublicStory {
  return {
    id: record._id,
    title: record.title,
    situation: record.situation,
    action: record.action,
    result: record.result,
    tags: record.tags,
  };
}
