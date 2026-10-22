import { Fragment, type ReactNode } from "react";

/** Small markdown renderer for the gap summary: headings, lists, bold, tables. No dependency. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="rounded bg-sand px-1 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trimEnd();
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) {
        const cells = lines[i]!.trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <table key={i} className="my-3 w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-stone">
              {head?.map((c, j) => (
                <th key={j} className="py-1.5 pr-3 font-semibold">
                  {inline(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, k) => (
              <tr key={k} className="border-b border-line/60">
                {r.map((c, j) => (
                  <td key={j} className="py-1.5 pr-3 align-top">
                    {inline(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      out.push(
        <p
          key={i}
          className={
            level <= 2
              ? "mt-4 mb-1 font-display text-[16px] font-semibold text-ink first:mt-0"
              : "mt-3 mb-1 text-[14px] font-semibold text-ink first:mt-0"
          }
        >
          {inline(heading[2]!)}
        </p>,
      );
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      out.push(
        <ul key={i} className="my-2 space-y-1.5">
          {items.map((it, k) => (
            <li key={k} className="flex gap-2 text-[13.5px] leading-relaxed text-ink/85">
              <span className="mt-[9px] size-1 shrink-0 rounded-full bg-nova" />
              <span>{inline(it)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }
    out.push(
      <p key={i} className="my-2 text-[13.5px] leading-relaxed text-ink/85">
        {inline(line)}
      </p>,
    );
    i++;
  }
  return <div>{out}</div>;
}
