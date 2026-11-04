import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useDebouncedValue } from "../../hooks/useDebouncedValue";

/**
 * A text filter that types instantly but writes the URL only once the user pauses, so
 * a query runs per pause rather than per keystroke.
 *
 * The URL stays the source of truth: when it changes from outside — "Clear filters", a
 * pasted link — the box follows. Only a value this hook did not write counts as
 * outside, so text typed while a commit is landing is never overwritten.
 */
export function useDebouncedUrlText(
  urlValue: string,
  commit: (value: string) => void,
  delay = 300,
): [string, (value: string) => void] {
  const [text, setText] = useState(urlValue);
  const debounced = useDebouncedValue(text, delay);
  const written = useRef(urlValue);

  const latestCommit = useRef(commit);
  useLayoutEffect(() => {
    latestCommit.current = commit;
  });

  useEffect(() => {
    if (debounced === written.current) return;
    written.current = debounced;
    latestCommit.current(debounced);
  }, [debounced]);

  useEffect(() => {
    if (urlValue === written.current) return;
    written.current = urlValue;
    setText(urlValue);
  }, [urlValue]);

  return [text, setText];
}
