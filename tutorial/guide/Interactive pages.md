# Interactive pages

A `.p5.js` file is a [p5.js](https://p5js.org) sketch and an `.html` file is a web page. Both run in a sandbox: their scripts work, but they cannot reach your files or the rest of Gamma Reader. Each can be opened on its own or embedded in a note.

## On their own

Open [[Pendulum.p5.js]]. The toolbar has **Pause sketch**, **Restart sketch** and, after you edit **Source**, **Run changes**. An error in the sketch is shown over it as *Sketch error*, with the message.

Open [[Quadratic.html]]. After an edit to its **Source**, **Run changes** loads the new version.

## In a note

Write an embed, `![[Pendulum.p5.js]]`, alone in its paragraph:

![[Pendulum.p5.js]]

Drag the bob and let go. A sketch is shown at the size of its canvas, here 400 by 400, and never wider than the note. Hover over it for **Pause sketch** and **Restart sketch**.

A sketch scrolled out of view stops drawing, and starts again when you return. When its file is saved, every embed of it restarts with the new code.

## Choose a size

Add a size after the name: a width, or a width and a height.

| Write | Shows |
| --- | --- |
| `![[Pendulum.p5.js\|300]]` | 300 pixels wide, as tall as the canvas's shape needs |
| `![[Pendulum.p5.js\|500x250]]` | A 500 by 250 box, with the canvas scaled to fit inside it |
| `![[Quadratic.html\|520x300]]` | A page 520 by 300 pixels |
| `![[Quadratic.html\|A parabola\|520x300]]` | The same, titled *A parabola* |

A sketch keeps its shape when scaled, and the pointer still lands where you aim. A page lays itself out in the space it is given, as it would in a browser window of that size. Without a size, a page takes the full width of the note and 480 pixels of height.

Here is the pendulum at 300 pixels wide:

![[Pendulum.p5.js|300]]

And in a box of a different shape:

![[Pendulum.p5.js|500x250]]

And the page, with a title and a size:

![[Quadratic.html|A parabola|520x300]]

Images take the same sizes: `![[How Gamma Reader works.svg|320]]`.

## Resize by dragging

Hover over the bottom-right corner of an embed in this note until a handle appears, then drag it. Sketches and images keep their shape and change width; pages change width and height. When you let go, the new size is written into the note's source, so the next time it opens at that size.

The size is written only into the note you are reading. An embed inside an embedded note has no handle, since changing it would change another note. If you have unsaved edits in **Source**, the new size stays on screen and is not written.

## Try it

1. Drag the corner of the parabola page above, then open **Source** and find its new size.
2. Open [[Pendulum.p5.js]], choose **Source**, change `0.995` to `0.95`, and choose **Run changes**. The pendulum now stops much sooner.
3. **Save** that change and come back here: every pendulum on this page has restarted with it.
