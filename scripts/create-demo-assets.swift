import AppKit
import Foundation

let fileManager = FileManager.default
let scriptURL = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
let projectURL = scriptURL.deletingLastPathComponent().deletingLastPathComponent()

func ensureDirectory(_ url: URL) throws {
    try fileManager.createDirectory(at: url, withIntermediateDirectories: true)
}

func roundedRect(_ rect: NSRect, radius: CGFloat, fill: NSColor, stroke: NSColor? = nil, lineWidth: CGFloat = 3) {
    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    fill.setFill()
    path.fill()
    if let stroke {
        stroke.setStroke()
        path.lineWidth = lineWidth
        path.stroke()
    }
}

func line(_ from: NSPoint, _ to: NSPoint, width: CGFloat = 5, color: NSColor = .black) {
    let path = NSBezierPath()
    path.move(to: from)
    path.line(to: to)
    path.lineWidth = width
    path.lineCapStyle = .round
    color.setStroke()
    path.stroke()
}

func circle(_ center: NSPoint, radius: CGFloat, fill: NSColor, stroke: NSColor = .black, lineWidth: CGFloat = 5) {
    let rect = NSRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)
    let path = NSBezierPath(ovalIn: rect)
    fill.setFill()
    path.fill()
    stroke.setStroke()
    path.lineWidth = lineWidth
    path.stroke()
}

func drawText(_ value: String, in rect: NSRect, size: CGFloat, weight: NSFont.Weight = .semibold, color: NSColor = .black, alignment: NSTextAlignment = .center) {
    let style = NSMutableParagraphStyle()
    style.alignment = alignment
    style.lineBreakMode = .byWordWrapping
    let attributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: size, weight: weight),
        .foregroundColor: color,
        .paragraphStyle: style,
    ]
    value.draw(in: rect, withAttributes: attributes)
}

func writePNG(size: NSSize, to url: URL, draw: () -> Void) throws {
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(size.width),
        pixelsHigh: Int(size.height),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else { throw NSError(domain: "assets", code: 1) }
    rep.size = size
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    draw()
    NSGraphicsContext.restoreGraphicsState()
    guard let png = rep.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "assets", code: 2)
    }
    try png.write(to: url)
}

let canvas = NSSize(width: 1400, height: 1900)
let demoURL = projectURL.appendingPathComponent("public/demo-manga.png")
let resourceURL = projectURL.appendingPathComponent("src-tauri/resources/demo-manga.png")
try ensureDirectory(demoURL.deletingLastPathComponent())
try ensureDirectory(resourceURL.deletingLastPathComponent())

try writePNG(size: canvas, to: demoURL) {
    NSColor(calibratedWhite: 0.96, alpha: 1).setFill()
    NSRect(origin: .zero, size: canvas).fill()

    let ink = NSColor(calibratedWhite: 0.08, alpha: 1)
    let coral = NSColor(calibratedRed: 0.95, green: 0.34, blue: 0.28, alpha: 1)
    let mint = NSColor(calibratedRed: 0.27, green: 0.69, blue: 0.59, alpha: 1)
    roundedRect(NSRect(x: 70, y: 1030, width: 1260, height: 790), radius: 10, fill: .white, stroke: ink, lineWidth: 12)
    roundedRect(NSRect(x: 70, y: 80, width: 1260, height: 880), radius: 10, fill: NSColor(calibratedWhite: 0.93, alpha: 1), stroke: ink, lineWidth: 12)

    // Upper panel: a clean city walk scene.
    for index in 0..<7 {
        let x = CGFloat(90 + index * 205)
        line(NSPoint(x: x, y: 1050), NSPoint(x: x + 170, y: 1500), width: 2, color: NSColor.lightGray)
    }
    roundedRect(NSRect(x: 770, y: 1230, width: 420, height: 330), radius: 22, fill: NSColor(calibratedWhite: 0.88, alpha: 1), stroke: ink, lineWidth: 7)
    line(NSPoint(x: 790, y: 1290), NSPoint(x: 1170, y: 1290), width: 6, color: ink)
    line(NSPoint(x: 920, y: 1240), NSPoint(x: 920, y: 1540), width: 6, color: ink)

    circle(NSPoint(x: 370, y: 1325), radius: 108, fill: NSColor(calibratedWhite: 0.98, alpha: 1), stroke: ink, lineWidth: 8)
    let hair = NSBezierPath()
    hair.move(to: NSPoint(x: 275, y: 1350))
    hair.curve(to: NSPoint(x: 455, y: 1410), controlPoint1: NSPoint(x: 300, y: 1460), controlPoint2: NSPoint(x: 430, y: 1460))
    hair.line(to: NSPoint(x: 470, y: 1350))
    coral.setFill(); hair.fill(); ink.setStroke(); hair.lineWidth = 7; hair.stroke()
    circle(NSPoint(x: 335, y: 1320), radius: 7, fill: ink, stroke: ink, lineWidth: 1)
    circle(NSPoint(x: 405, y: 1320), radius: 7, fill: ink, stroke: ink, lineWidth: 1)
    line(NSPoint(x: 350, y: 1275), NSPoint(x: 395, y: 1275), width: 5, color: ink)
    roundedRect(NSRect(x: 250, y: 1055, width: 250, height: 190), radius: 85, fill: mint, stroke: ink, lineWidth: 8)

    roundedRect(NSRect(x: 690, y: 1540, width: 520, height: 210), radius: 105, fill: .white, stroke: ink, lineWidth: 7)
    drawText("こんにちは！", in: NSRect(x: 735, y: 1600, width: 430, height: 85), size: 48)

    // Lower panel: close-up with a second speech bubble.
    circle(NSPoint(x: 770, y: 450), radius: 260, fill: NSColor(calibratedWhite: 0.98, alpha: 1), stroke: ink, lineWidth: 10)
    let lowerHair = NSBezierPath()
    lowerHair.move(to: NSPoint(x: 530, y: 500))
    lowerHair.curve(to: NSPoint(x: 990, y: 560), controlPoint1: NSPoint(x: 580, y: 780), controlPoint2: NSPoint(x: 930, y: 730))
    lowerHair.line(to: NSPoint(x: 1020, y: 475))
    mint.setFill(); lowerHair.fill(); ink.setStroke(); lowerHair.lineWidth = 9; lowerHair.stroke()
    circle(NSPoint(x: 690, y: 430), radius: 13, fill: ink, stroke: ink, lineWidth: 1)
    circle(NSPoint(x: 840, y: 430), radius: 13, fill: ink, stroke: ink, lineWidth: 1)
    line(NSPoint(x: 720, y: 355), NSPoint(x: 815, y: 355), width: 8, color: ink)

    roundedRect(NSRect(x: 120, y: 630, width: 520, height: 230), radius: 115, fill: .white, stroke: ink, lineWidth: 7)
    drawText("今日はいい天気だね", in: NSRect(x: 165, y: 690, width: 430, height: 100), size: 40)
    roundedRect(NSRect(x: 900, y: 130, width: 330, height: 175), radius: 88, fill: .white, stroke: ink, lineWidth: 7)
    drawText("行こう！", in: NSRect(x: 945, y: 175, width: 240, height: 75), size: 42)

    drawText("HANAMI  /  DEMO PAGE 01", in: NSRect(x: 90, y: 1830, width: 1220, height: 40), size: 22, weight: .medium, color: .darkGray, alignment: .left)
}
if fileManager.fileExists(atPath: resourceURL.path) {
    try fileManager.removeItem(at: resourceURL)
}
try fileManager.copyItem(at: demoURL, to: resourceURL)

let iconURL = projectURL.appendingPathComponent("public/app-icon.png")
try writePNG(size: NSSize(width: 1024, height: 1024), to: iconURL) {
    let background = NSBezierPath(roundedRect: NSRect(x: 56, y: 56, width: 912, height: 912), xRadius: 210, yRadius: 210)
    NSColor(calibratedRed: 0.95, green: 0.29, blue: 0.25, alpha: 1).setFill()
    background.fill()
    roundedRect(NSRect(x: 245, y: 205, width: 535, height: 650), radius: 76, fill: .white)
    roundedRect(NSRect(x: 315, y: 595, width: 395, height: 150), radius: 75, fill: NSColor(calibratedWhite: 0.94, alpha: 1))
    drawText("文", in: NSRect(x: 335, y: 600, width: 355, height: 125), size: 92, weight: .bold)
    drawText("A", in: NSRect(x: 305, y: 300, width: 415, height: 240), size: 190, weight: .bold, color: NSColor(calibratedRed: 0.95, green: 0.29, blue: 0.25, alpha: 1))
}

print("Created demo image and app icon")
