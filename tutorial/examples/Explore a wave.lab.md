# Explore a wave

A wave repeats a shape. Change one number, run the code, and see what happens.

$$
y(t) = A\sin(2\pi f t)
$$

Here, $A$ is the height (amplitude), $f$ is the number of cycles per second (frequency), and $t$ is time in seconds.

## Sample it

Choose **Run**. Then change `frequency` from `1` to `2` and run again. Each number is the wave's height at one of nine evenly spaced moments between 0 and 1 second.

```typescript run id=wave-samples
const amplitude = 1
const frequency = 1
const samples = Array.from({ length: 9 }, (_, i) =>
  Number((amplitude * Math.sin(2 * Math.PI * frequency * i / 8)).toFixed(2))
)
samples
```

Double the amplitude next. Which changes: the height, the number of cycles, or both?

## Draw it

This Python cell is independent of the one above. Set its own `frequency` and **Run** to see a smooth curve. The first run downloads Python and plotting packages; it may take a little while and needs an internet connection.

```python run id=wave-plot
import numpy as np
import matplotlib.pyplot as plt

amplitude = 1
frequency = 1
t = np.linspace(0, 1, 240)

fig, ax = plt.subplots(figsize=(6, 3))
ax.plot(t, amplitude * np.sin(2 * np.pi * frequency * t), color="#8f315f")
ax.set(xlabel="Time (seconds)", ylabel="Height", title="One second of a wave")
ax.grid(alpha=0.2)
```

## Keep exploring

Try a frequency of `8` in both cells. The nine samples suggest a flat line, but the curve does not. What information did sampling lose?

Ask the assistant to explain the difference, or to edit this experiment with another example. It can read and edit the source; use **Run** yourself to evaluate the changes.

Cell edits and **Source** share the same draft. Choose **Save** (⌘/Ctrl+S) to keep the code in this browser, then **Save as…** in Files to export it. Run results are temporary and are not saved in the Markdown file.
