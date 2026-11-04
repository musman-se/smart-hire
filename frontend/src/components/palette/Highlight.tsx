import { highlightSegments, type MatchRange } from "./fuzzy";

/** The label with the characters the query matched drawn in a <mark>. */
export function Highlight({ text, ranges }: { text: string; ranges: readonly MatchRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  return (
    <>
      {highlightSegments(text, ranges).map((segment, index) =>
        segment.match ? (
          <mark key={index} className="palette-mark">
            {segment.text}
          </mark>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}
