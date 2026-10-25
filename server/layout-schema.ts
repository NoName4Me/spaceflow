import { z } from "zod";
export const elementsSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[\w-]{1,80}$/),
        type: z.enum([
          "table",
          "desk",
          "chair",
          "screen",
          "door",
          "window",
          "board",
        ]),
        x: z.number().min(0).max(600),
        y: z.number().min(0).max(390),
        r: z.number().min(-360).max(360),
        w: z.number().min(8).max(600).optional(),
        h: z.number().min(8).max(390).optional(),
      })
      .strict(),
  )
  .max(300)
  .refine((a) => new Set(a.map((e) => e.id)).size === a.length, "元素 ID 重复");
export const layoutSchema = z.object({
  version: z.number().int().positive(),
  elements: elementsSchema,
});
