import type { PoolClient } from "pg";
export async function resolveTemplate(
  c: PoolClient,
  type?: string,
  id?: string,
) {
  const result = id
    ? await c.query(
        "SELECT id,type FROM layout_templates WHERE id=$1 FOR SHARE",
        [id],
      )
    : await c.query(
        "SELECT id,type FROM layout_templates ORDER BY (type=$1) DESC,is_builtin DESC,id LIMIT 1 FOR SHARE",
        [type || "董事会式"],
      );
  if (!result.rows[0])
    throw Object.assign(new Error("请选择有效布局"), { status: 400 });
  return result.rows[0] as { id: string; type: string };
}
