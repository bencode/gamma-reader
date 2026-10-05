// A square canvas with a pendulum you can drag. Drop it from any angle and
// watch it settle: each swing loses a little energy to friction.
const length = 150
let angle = Math.PI / 4
let velocity = 0
let dragging = false

function setup() {
  createCanvas(400, 400)
}

function draw() {
  background(250, 246, 238)
  const origin = createVector(width / 2, 70)
  if (dragging) {
    angle = atan2(mouseX - origin.x, mouseY - origin.y)
    velocity = 0
  } else {
    velocity = (velocity - 0.004 * sin(angle)) * 0.995
    angle += velocity
  }
  const bob = createVector(origin.x + length * sin(angle), origin.y + length * cos(angle))
  stroke(70)
  strokeWeight(2)
  line(origin.x, origin.y, bob.x, bob.y)
  noStroke()
  fill(dragging ? '#c0504d' : '#8f315f')
  circle(bob.x, bob.y, 40)
  fill(70)
  textSize(13)
  text(`Drag the bob · ${degrees(angle).toFixed(0)}°`, 14, height - 16)
}

function mousePressed() {
  const origin = createVector(width / 2, 70)
  const bob = createVector(origin.x + length * sin(angle), origin.y + length * cos(angle))
  dragging = dist(mouseX, mouseY, bob.x, bob.y) < 30
}

function mouseReleased() {
  dragging = false
}
