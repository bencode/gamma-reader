// Open Source, change these values, then choose Run changes.
const orbitCount = 7
const speed = 1
const ink = '#8f315f'

let startedAt = 0

globalThis.setup = () => {
  createCanvas(windowWidth, windowHeight)
  pixelDensity(1)
  startedAt = millis()
}

globalThis.draw = () => {
  background('#faf9f7')
  const radius = Math.max(20, Math.min(width - 48, height - 150) / 2)
  const elapsed = ((millis() - startedAt) / 1000) * speed

  push()
  translate(width / 2, height / 2)
  noFill()
  stroke('#e3dce0')
  for (let i = 1; i <= orbitCount; i++) {
    const distance = (radius * i) / orbitCount
    circle(0, 0, distance * 2)
  }

  noStroke()
  fill(ink)
  circle(0, 0, 12)
  for (let i = 1; i <= orbitCount; i++) {
    const distance = (radius * i) / orbitCount
    const angle = elapsed / Math.sqrt(i) - HALF_PI
    circle(Math.cos(angle) * distance, Math.sin(angle) * distance, 8)
  }
  pop()

  noStroke()
  fill('#302a2e')
  textAlign(CENTER)
  textSize(18)
  text('Small orbits', width / 2, 32)
  fill('#736a70')
  textSize(12)
  text('Click to align the dots again', width / 2, height - 36)
  text('A geometric sketch, not a gravity simulation', width / 2, height - 16)
}

globalThis.mousePressed = () => {
  startedAt = millis()
}

globalThis.windowResized = () => {
  resizeCanvas(windowWidth, windowHeight)
}
