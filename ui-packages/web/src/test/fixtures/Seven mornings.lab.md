# Seven mornings

**Observation log.xlsx** holds one bird count for each morning of a week:

```text
12  17  9  5  21  14  11
```

Below are two ways to ask a question of a short series. Each cell carries
the numbers itself, because code in a Lab runs in a sandbox and cannot
reach your files.

## Walk it, one step at a time

Scheme has no loop here. A function calls itself, compares two neighbours,
and hands the rest of the list back to itself until nothing is left.

Choose **Run**, then change a number in `counts` and run it again.

```scheme run id=rises
(define counts '(12 17 9 5 21 14 11))

(define (rises xs)
  (if (or (null? xs) (null? (cdr xs)))
      0
      (+ (if (< (car xs) (cadr xs)) 1 0)
         (rises (cdr xs)))))

(rises counts)
```

Two mornings were busier than the one before them. Scheme is small and
already part of the page, so this cell runs without downloading anything.

## Or reshape the whole series at once

Clojure describes the same walk as a transformation. Pair each morning
with the next, subtract, and read what comes out.

```clojure run id=swings
(def counts [12 17 9 5 21 14 11])

(def changes (map - (rest counts) counts))

{:changes      changes
 :biggest-rise (apply max changes)
 :biggest-drop (apply min changes)}
```

The largest rise, sixteen birds, is the morning after the quiet one. The
first run downloads the Clojure runtime and needs an internet connection.

## Keep going

Add a cell of your own. A fence becomes runnable when its info line says
`run` and names scheme, clojure, python or typescript:

````text
```scheme run
(apply + '(12 17 9 5 21 14 11))
```
````

Choose **Source** to edit this document, then **Save** (⌘/Ctrl+S) to keep
the change in this browser.
