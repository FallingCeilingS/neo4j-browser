import { NodeCaptionLine, NodeModel } from '../models/Node'

import { GraphStyleModel } from '../models/GraphStyle'
import NodePairModel from '../models/NodePair'
import { RelationshipModel } from '../models/Relationship'
import { measureText } from '../utils/textMeasurement'

export const computeGeometryForNonLoopArrows = (
  nodePairs: NodePairModel[]
): void => {
  nodePairs.forEach(nodePair => {
    if (!nodePair.isLoop()) {
      const dx = nodePair.nodeA.x - nodePair.nodeB.x
      const dy = nodePair.nodeA.y - nodePair.nodeB.y
      const angle = ((Math.atan2(dy, dx) / Math.PI) * 180 + 360) % 360

      nodePair.relationships.forEach(relationship => {
        relationship.naturalAngle =
          relationship.target === nodePair.nodeA ? (angle + 180) % 360 : angle
        relationship.centreDistance = Math.sqrt(dx ** 2 + dy ** 2)
      })
    }
  })
}

export const distributeAnglesForLoopArrows = (
  nodePairs: NodePairModel[],
  relationships: RelationshipModel[]
): void => {
  for (const nodePair of nodePairs) {
    if (nodePair.isLoop()) {
      let angles = []
      const node = nodePair.nodeA
      for (const relationship of relationships) {
        if (!relationship.isLoop()) {
          if (relationship.source === node) {
            angles.push(relationship.naturalAngle)
          }
          if (relationship.target === node) {
            angles.push(relationship.naturalAngle + 180)
          }
        }
      }
      angles = angles.map(a => (a + 360) % 360).sort((a, b) => a - b)

      if (angles.length > 0) {
        let end, start
        const biggestGap = {
          start: 0,
          end: 0
        }

        for (let i = 0; i < angles.length; i++) {
          const angle = angles[i]
          start = angle
          end = i === angles.length - 1 ? angles[0] + 360 : angles[i + 1]
          if (end - start > biggestGap.end - biggestGap.start) {
            biggestGap.start = start
            biggestGap.end = end
          }
        }
        const separation =
          (biggestGap.end - biggestGap.start) /
          (nodePair.relationships.length + 1)
        for (let i = 0; i < nodePair.relationships.length; i++) {
          const relationship = nodePair.relationships[i]
          relationship.naturalAngle =
            (biggestGap.start + (i + 1) * separation - 90) % 360
        }
      } else {
        const separation = 360 / nodePair.relationships.length
        for (let i = 0; i < nodePair.relationships.length; i++) {
          const relationship = nodePair.relationships[i]
          relationship.naturalAngle = i * separation
        }
      }
    }
  }
}

type SegmentSchemas = {
  [key: string]: string[]
}
const segmentSchemas: SegmentSchemas = {
  m: ['x', 'y'],
  z: [],
  l: ['x', 'y'],
  h: ['x'],
  v: ['y'],
  c: ['x1', 'y1', 'x2', 'y2', 'x', 'y'],
  s: ['x2', 'y2', 'x', 'y'],
  q: ['x1', 'y1', 'x', 'y'],
  t: ['x', 'y'],
  a: ['rx', 'ry', 'xRotation', 'largeArc', 'sweep', 'x', 'y']
}

const getSegmentSchema = (type: string) => {
  return segmentSchemas[type.toLowerCase()]
}

const segmentExpr = /([mzlhvcsqta])([^mzlhvcsqta]*)/gi
const numberExpr = /-?[0-9]*\.?[0-9]+(?:e[-+]?\d+)?/gi

type SegmentData = {
  type: string
  relative: boolean
} & Partial<
  Record<'x' | 'y' | 'rx' | 'ry' | 'xRotation' | 'largeArc' | 'sweep', number>
>
export const svgPathParser = (pathString: string): SegmentData[] => {
  const pathData = []

  let segmentMatch
  segmentExpr.lastIndex = 0

  while ((segmentMatch = segmentExpr.exec(pathString))) {
    const type = segmentMatch[1].toLowerCase()
    const numbers = (segmentMatch[2].match(numberExpr) || []).map(parseFloat)
    const relative = type === segmentMatch[1]

    const schema = getSegmentSchema(type)

    if (numbers.length < schema.length) {
      throw new Error(
        `Malformed path data: type "${type}" has ${numbers.length} arguments, expected ${schema.length}`
      )
    }

    if (schema.length > 0) {
      if (numbers.length % schema.length !== 0) {
        throw new Error(
          `Malformed path data: type "${type}" has ${
            numbers.length
          } arguments, ${numbers.length % schema.length} too many`
        )
      }

      for (let i = 0; i < numbers.length / schema.length; i++) {
        const segmentData: SegmentData = { type, relative }

        for (let j = 0; j < schema.length; j++) {
          Object.assign(segmentData, {
            [schema[j]]: numbers[i * schema.length + j]
          })
          // segmentData[ schema[j] ] = numbers[i * schema.length + j]
        }

        pathData.push(segmentData)
      }
    } else {
      pathData.push({ type, relative })
    }
  }

  return pathData
}

const angleBetween = (ux: number, uy: number, vx: number, vy: number) => {
  const ta = Math.atan2(uy, ux)
  const tb = Math.atan2(vy, vx)

  if (tb >= ta) {
    return tb - ta
  }

  return Math.PI * 2 - (ta - tb)
}

export const arcToCurve = (
  sx: number,
  sy: number,
  rx: number,
  ry: number,
  angle: number,
  large: number,
  sweep: number,
  x: number,
  y: number
): {
  type: string
  x: number
  y: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
}[] => {
  if (sx === x && sy === y) {
    return []
  }

  if (!rx && !ry) {
    return [{ type: 'l', x, y }]
  }

  const sinPhi = Math.sin((angle * Math.PI) / 180)
  const cosPhi = Math.cos((angle * Math.PI) / 180)

  const xd = (cosPhi * (sx - x)) / 2 + (sinPhi * (sy - y)) / 2
  const yd = (-sinPhi * (sx - x)) / 2 + (cosPhi * (sy - y)) / 2

  const rx2 = rx * rx
  const ry2 = ry * ry

  const xd2 = xd * xd
  const yd2 = yd * yd

  let root = 0
  const numerator = rx2 * ry2 - rx2 * yd2 - ry2 * xd2

  if (numerator < 0) {
    const s = Math.sqrt(1 - numerator / (rx2 * ry2))

    rx *= s
    ry *= s
  } else {
    root =
      ((large && sweep) || (!large && !sweep) ? -1 : 1) *
      Math.sqrt(numerator / (rx2 * yd2 + ry2 * xd2))
  }

  const cxd = (root * rx * yd) / ry
  const cyd = (-root * ry * xd) / rx

  const cx = cosPhi * cxd - sinPhi * cyd + (sx + x) / 2
  const cy = sinPhi * cxd + cosPhi * cyd + (sy + y) / 2

  let theta1 = angleBetween(1, 0, (xd - cxd) / rx, (yd - cyd) / ry)
  let dtheta = angleBetween(
    (xd - cxd) / rx,
    (yd - cyd) / ry,
    (-xd - cxd) / rx,
    (-yd - cyd) / ry
  )

  if (!sweep && dtheta > 0) {
    dtheta -= Math.PI * 2
  } else if (sweep && dtheta < 0) {
    dtheta += Math.PI * 2
  }

  const segments = []
  const numSegs = Math.ceil(Math.abs(dtheta / (Math.PI / 2)))
  const delta = dtheta / numSegs
  const t =
    ((8 / 3) * Math.sin(delta / 4) * Math.sin(delta / 4)) / Math.sin(delta / 2)

  for (let i = 0; i < numSegs; i++) {
    const cosTheta1 = Math.cos(theta1)
    const sinTheta1 = Math.sin(theta1)
    const theta2 = theta1 + delta
    const cosTheta2 = Math.cos(theta2)
    const sinTheta2 = Math.sin(theta2)

    const epx = cosPhi * rx * cosTheta2 - sinPhi * ry * sinTheta2 + cx
    const epy = sinPhi * rx * cosTheta2 + cosPhi * ry * sinTheta2 + cy

    const dx = t * (-cosPhi * rx * sinTheta1 - sinPhi * ry * cosTheta1)
    const dy = t * (-sinPhi * rx * sinTheta1 + cosPhi * ry * cosTheta1)

    const dxe = t * (cosPhi * rx * sinTheta2 + sinPhi * ry * cosTheta2)
    const dye = t * (sinPhi * rx * sinTheta2 - cosPhi * ry * cosTheta2)

    segments.push({
      type: 'c',
      x: epx,
      y: epy,
      x1: sx + dx,
      y1: sy + dy,
      x2: epx + dxe,
      y2: epy + dye
    })

    theta1 = theta2
    sx = epx
    sy = epy
  }

  return segments
}

export const fitCaptionIntoCircle = (
  node: NodeModel,
  style: GraphStyleModel,
  canvas2DContext: CanvasRenderingContext2D
): NodeCaptionLine[] => {
  const fontFamily = 'sans-serif'
  const fontSize = parseFloat(style.forNode(node).get('font-size'))
  // Roughly calculate max text length the circle can fit by radius and font size
  const maxCaptionTextLength = Math.floor(
    (Math.pow(/* node.radius */ 25, 2) * Math.PI) / Math.pow(fontSize, 2)
  )
  const template = style.forNode(node).get('caption')
  const nodeText = style.interpolate(template, node)
  const captionText =
    nodeText.length > maxCaptionTextLength
      ? nodeText.substring(0, maxCaptionTextLength)
      : nodeText
  const measure = (text: string) =>
    measureText(text, fontFamily, fontSize, canvas2DContext)
  const whiteSpaceMeasureWidth = measure(' ')

  const words = captionText.split(' ')

  const emptyLine = (lineCount: number, lineIndex: number): NodeCaptionLine => {
    // Calculate baseline of the text
    const baseline = (1 + lineIndex - lineCount / 2) * fontSize

    // The furthest distance between chord (top or bottom of the line) and circle centre
    const chordCentreDistance =
      lineIndex < lineCount / 2
        ? baseline - fontSize / 2
        : baseline + fontSize / 2
    const maxLineWidth =
      Math.sqrt(
        Math.pow(/* node.radius */ 25, 2) - Math.pow(chordCentreDistance, 2)
      ) * 2
    return {
      node,
      text: '',
      baseline,
      remainingWidth: maxLineWidth
    }
  }

  const addShortenedNextWord = (
    line: NodeCaptionLine,
    word: string
  ): string => {
    while (word.length > 2) {
      const newWord = `${word.substring(0, word.length - 2)}\u2026`
      if (measure(newWord) < line.remainingWidth) {
        return `${line.text.split(' ').slice(0, -1).join(' ')} ${newWord}`
      }
      word = word.substring(0, word.length - 1)
    }
    return `${word}\u2026`
  }

  const fitOnFixedNumberOfLines = function (
    lineCount: number
  ): [NodeCaptionLine[], number] {
    const lines = []
    const wordMeasureWidthList: number[] = words.map((word: string) =>
      measure(`${word}`)
    )
    let wordIndex = 0
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
      const line = emptyLine(lineCount, lineIndex)
      while (
        wordIndex < words.length &&
        wordMeasureWidthList[wordIndex] <
          line.remainingWidth - whiteSpaceMeasureWidth
      ) {
        line.text = `${line.text} ${words[wordIndex]}`
        line.remainingWidth -=
          wordMeasureWidthList[wordIndex] + whiteSpaceMeasureWidth
        wordIndex++
      }
      lines.push(line)
    }
    if (wordIndex < words.length) {
      lines[lineCount - 1].text = addShortenedNextWord(
        lines[lineCount - 1],
        words[wordIndex]
      )
    }
    return [lines, wordIndex]
  }

  let consumedWords = 0
  const maxLines = /* node.radius */ (25 * 2) / fontSize

  let lines = [emptyLine(1, 0)]
  // Typesetting for finding suitable lines to fit words
  for (let lineCount = 1; lineCount <= maxLines; lineCount++) {
    const [candidateLines, candidateWords] = fitOnFixedNumberOfLines(lineCount)

    // If the lines don't have empty line(s), they're probably good fit for the typesetting
    if (!candidateLines.some((line: NodeCaptionLine) => !line.text)) {
      lines = candidateLines
      consumedWords = candidateWords
    }
    if (consumedWords >= words.length) {
      return lines
    }
  }
  return lines
}
