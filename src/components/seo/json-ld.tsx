/**
 * Emits one <script type="application/ld+json"> per schema node.
 * Google recommends separate tags per schema type over one combined
 * @graph blob, to make it easier for them to parse selectively.
 *
 * Uses dangerouslySetInnerHTML because React escapes the < / > in
 * script bodies otherwise, which breaks JSON-LD in subtle ways.
 * The input is JSON.stringify'd locally — no user input flows here.
 */
export function JsonLd({ data }: { data: Record<string, unknown>[] }) {
  return (
    <>
      {data.map((node, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
        />
      ))}
    </>
  )
}
