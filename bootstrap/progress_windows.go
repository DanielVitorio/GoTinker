//go:build windows

package main

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

const (
	wmDestroy     = 0x0002
	wmClose       = 0x0010
	wmPaint       = 0x000F
	wmApp         = 0x8000
	wmProgress    = wmApp + 1
	wmSetupDone   = wmApp + 2
	swShow        = 5
	wsCaption     = 0x00C00000
	wsSysMenu     = 0x00080000
	wsMinimizeBox = 0x00020000
	dtLeft        = 0x00000000
	dtRight       = 0x00000002
	dtVCenter     = 0x00000004
	dtSingleLine  = 0x00000020
	dtEndEllipsis = 0x00008000
	transparent   = 1
	fwNormal      = 400
	fwSemiBold    = 600
)

type point struct {
	X int32
	Y int32
}

type rect struct {
	Left   int32
	Top    int32
	Right  int32
	Bottom int32
}

type paintStruct struct {
	Hdc       uintptr
	Erase     int32
	Paint     rect
	Restore   int32
	IncUpdate int32
	Reserved  [32]byte
}

type message struct {
	Hwnd     uintptr
	Message  uint32
	WParam   uintptr
	LParam   uintptr
	Time     uint32
	Point    point
	LPrivate uint32
}

type windowClassEx struct {
	Size       uint32
	Style      uint32
	WindowProc uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   uintptr
	Icon       uintptr
	Cursor     uintptr
	Background uintptr
	MenuName   *uint16
	ClassName  *uint16
	IconSmall  uintptr
}

type progressWindow struct {
	hwnd      uintptr
	titleFont uintptr
	bodyFont  uintptr
	smallFont uintptr
	mu        sync.RWMutex
	state     transferProgress
	setupErr  error
}

var (
	activeProgress       *progressWindow
	user32               = syscall.NewLazyDLL("user32.dll")
	gdi32                = syscall.NewLazyDLL("gdi32.dll")
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	procRegisterClassExW = user32.NewProc("RegisterClassExW")
	procCreateWindowExW  = user32.NewProc("CreateWindowExW")
	procDefWindowProcW   = user32.NewProc("DefWindowProcW")
	procShowWindow       = user32.NewProc("ShowWindow")
	procUpdateWindow     = user32.NewProc("UpdateWindow")
	procGetMessageW      = user32.NewProc("GetMessageW")
	procTranslateMessage = user32.NewProc("TranslateMessage")
	procDispatchMessageW = user32.NewProc("DispatchMessageW")
	procPostQuitMessage  = user32.NewProc("PostQuitMessage")
	procPostMessageW     = user32.NewProc("PostMessageW")
	procDestroyWindow    = user32.NewProc("DestroyWindow")
	procInvalidateRect   = user32.NewProc("InvalidateRect")
	procBeginPaint       = user32.NewProc("BeginPaint")
	procEndPaint         = user32.NewProc("EndPaint")
	procGetClientRect    = user32.NewProc("GetClientRect")
	procGetSystemMetrics = user32.NewProc("GetSystemMetrics")
	procLoadCursorW      = user32.NewProc("LoadCursorW")
	procFillRect         = user32.NewProc("FillRect")
	procDrawTextW        = user32.NewProc("DrawTextW")
	procSetBkMode        = gdi32.NewProc("SetBkMode")
	procSetTextColor     = gdi32.NewProc("SetTextColor")
	procCreateSolidBrush = gdi32.NewProc("CreateSolidBrush")
	procDeleteObject     = gdi32.NewProc("DeleteObject")
	procCreateFontW      = gdi32.NewProc("CreateFontW")
	procSelectObject     = gdi32.NewProc("SelectObject")
	procGetModuleHandleW = kernel32.NewProc("GetModuleHandleW")
)

func newProgressWindow() (*progressWindow, error) {
	className, _ := syscall.UTF16PtrFromString("GoTinkerSetupWindow")
	title, _ := syscall.UTF16PtrFromString("Go Tinker")
	face, _ := syscall.UTF16PtrFromString("Segoe UI")

	instance, _, _ := procGetModuleHandleW.Call(0)
	cursor, _, _ := procLoadCursorW.Call(0, 32512)

	class := windowClassEx{
		Size:       uint32(unsafe.Sizeof(windowClassEx{})),
		WindowProc: syscall.NewCallback(progressWindowProc),
		Instance:   instance,
		Cursor:     cursor,
		ClassName:  className,
	}

	atom, _, registerErr := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&class)))
	if atom == 0 && registerErr != syscall.Errno(1410) {
		return nil, fmt.Errorf("não foi possível registrar a janela de instalação")
	}

	width := int32(590)
	height := int32(310)
	screenWidth, _, _ := procGetSystemMetrics.Call(0)
	screenHeight, _, _ := procGetSystemMetrics.Call(1)
	x := int32(screenWidth)/2 - width/2
	y := int32(screenHeight)/2 - height/2

	hwnd, _, createErr := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(title)),
		wsCaption|wsSysMenu|wsMinimizeBox,
		uintptr(x),
		uintptr(y),
		uintptr(width),
		uintptr(height),
		0,
		0,
		instance,
		0,
	)
	if hwnd == 0 {
		return nil, fmt.Errorf("não foi possível criar a janela de instalação: %v", createErr)
	}

	titleFont, _, _ := procCreateFontW.Call(^uintptr(21), 0, 0, 0, fwSemiBold, 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(face)))
	bodyFont, _, _ := procCreateFontW.Call(^uintptr(15), 0, 0, 0, fwNormal, 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(face)))
	smallFont, _, _ := procCreateFontW.Call(^uintptr(13), 0, 0, 0, fwNormal, 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(face)))

	window := &progressWindow{
		hwnd:      hwnd,
		titleFont: titleFont,
		bodyFont:  bodyFont,
		smallFont: smallFont,
		state: transferProgress{
			Status: "Preparando o Go Tinker",
			Detail: "Configurando o runtime desktop pela primeira vez",
		},
	}

	activeProgress = window
	procShowWindow.Call(hwnd, swShow)
	procUpdateWindow.Call(hwnd)
	return window, nil
}

func (window *progressWindow) update(state transferProgress) {
	window.mu.Lock()
	window.state = state
	window.mu.Unlock()
	procPostMessageW.Call(window.hwnd, wmProgress, 0, 0)
}

func (window *progressWindow) finish(err error) {
	window.mu.Lock()
	window.setupErr = err
	window.mu.Unlock()
	procPostMessageW.Call(window.hwnd, wmSetupDone, 0, 0)
}

func (window *progressWindow) result() error {
	window.mu.RLock()
	defer window.mu.RUnlock()
	return window.setupErr
}

func (window *progressWindow) run() {
	var msg message
	for {
		result, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if int32(result) <= 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
	}

	if window.titleFont != 0 {
		procDeleteObject.Call(window.titleFont)
	}
	if window.bodyFont != 0 {
		procDeleteObject.Call(window.bodyFont)
	}
	if window.smallFont != 0 {
		procDeleteObject.Call(window.smallFont)
	}
	activeProgress = nil
}

func progressWindowProc(hwnd uintptr, msg uint32, wParam, lParam uintptr) uintptr {
	switch msg {
	case wmPaint:
		if activeProgress != nil {
			activeProgress.paint(hwnd)
		}
		return 0
	case wmProgress:
		procInvalidateRect.Call(hwnd, 0, 0)
		return 0
	case wmSetupDone:
		procDestroyWindow.Call(hwnd)
		return 0
	case wmClose:
		os.Exit(0)
		return 0
	case wmDestroy:
		procPostQuitMessage.Call(0)
		return 0
	}

	result, _, _ := procDefWindowProcW.Call(hwnd, uintptr(msg), wParam, lParam)
	return result
}

func (window *progressWindow) paint(hwnd uintptr) {
	var paint paintStruct
	hdc, _, _ := procBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&paint)))
	if hdc == 0 {
		return
	}
	defer procEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&paint)))

	var client rect
	procGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&client)))

	background := solidBrush(rgb(9, 9, 11))
	panel := solidBrush(rgb(24, 24, 27))
	track := solidBrush(rgb(39, 39, 42))
	accent := solidBrush(rgb(239, 68, 68))
	defer procDeleteObject.Call(background)
	defer procDeleteObject.Call(panel)
	defer procDeleteObject.Call(track)
	defer procDeleteObject.Call(accent)

	procFillRect.Call(hdc, uintptr(unsafe.Pointer(&client)), background)

	window.mu.RLock()
	state := window.state
	window.mu.RUnlock()

	procSetBkMode.Call(hdc, transparent)

	drawText(hdc, "GO TINKER", rect{Left: 36, Top: 28, Right: client.Right - 36, Bottom: 56}, window.smallFont, rgb(161, 161, 170), dtLeft|dtSingleLine|dtVCenter)
	drawText(hdc, state.Status, rect{Left: 36, Top: 56, Right: client.Right - 120, Bottom: 92}, window.titleFont, rgb(250, 250, 250), dtLeft|dtSingleLine|dtVCenter|dtEndEllipsis)

	percentText := ""
	if state.Total > 0 || state.Percent > 0 {
		percentText = fmt.Sprintf("%d%%", state.Percent)
	}
	drawText(hdc, percentText, rect{Left: client.Right - 120, Top: 56, Right: client.Right - 36, Bottom: 92}, window.bodyFont, rgb(244, 244, 245), dtRight|dtSingleLine|dtVCenter)

	drawText(hdc, state.Detail, rect{Left: 36, Top: 96, Right: client.Right - 36, Bottom: 124}, window.bodyFont, rgb(161, 161, 170), dtLeft|dtSingleLine|dtVCenter|dtEndEllipsis)

	progressTrack := rect{Left: 36, Top: 148, Right: client.Right - 36, Bottom: 158}
	procFillRect.Call(hdc, uintptr(unsafe.Pointer(&progressTrack)), track)

	progressWidth := int32(0)
	if state.Percent > 0 {
		progressWidth = (progressTrack.Right - progressTrack.Left) * int32(state.Percent) / 100
	}
	if progressWidth > 0 {
		progressFill := rect{Left: progressTrack.Left, Top: progressTrack.Top, Right: progressTrack.Left + progressWidth, Bottom: progressTrack.Bottom}
		procFillRect.Call(hdc, uintptr(unsafe.Pointer(&progressFill)), accent)
	}

	detail := transferDetail(state)
	drawText(hdc, detail, rect{Left: 36, Top: 174, Right: client.Right - 36, Bottom: 204}, window.smallFont, rgb(212, 212, 216), dtLeft|dtSingleLine|dtVCenter|dtEndEllipsis)

	source := strings.TrimSpace(state.Source)
	if source != "" {
		drawText(hdc, source, rect{Left: 36, Top: 208, Right: client.Right - 36, Bottom: 236}, window.smallFont, rgb(113, 113, 122), dtLeft|dtSingleLine|dtVCenter|dtEndEllipsis)
	}

	footer := rect{Left: 36, Top: client.Bottom - 44, Right: client.Right - 36, Bottom: client.Bottom - 20}
	drawText(hdc, "O runtime é baixado apenas uma vez e fica salvo neste computador.", footer, window.smallFont, rgb(113, 113, 122), dtLeft|dtSingleLine|dtVCenter|dtEndEllipsis)

	_ = panel
}

func transferDetail(state transferProgress) string {
	if state.Downloaded <= 0 {
		return ""
	}

	downloaded := formatBytes(state.Downloaded)
	speed := ""
	if state.Speed > 0 {
		speed = formatBytes(int64(state.Speed)) + "/s"
	}

	if state.Total > 0 {
		total := formatBytes(state.Total)
		if speed != "" {
			return fmt.Sprintf("%s de %s  •  %s", downloaded, total, speed)
		}
		return fmt.Sprintf("%s de %s", downloaded, total)
	}

	if speed != "" {
		return fmt.Sprintf("%s  •  %s", downloaded, speed)
	}
	return downloaded
}

func formatBytes(value int64) string {
	const unit = 1024
	if value < unit {
		return fmt.Sprintf("%d B", value)
	}

	divisor := int64(unit)
	exponent := 0
	for n := value / unit; n >= unit && exponent < 4; n /= unit {
		divisor *= unit
		exponent++
	}

	suffixes := []string{"KB", "MB", "GB", "TB", "PB"}
	return fmt.Sprintf("%.1f %s", float64(value)/float64(divisor), suffixes[exponent])
}

func drawText(hdc uintptr, value string, bounds rect, font uintptr, color uint32, flags uintptr) {
	if strings.TrimSpace(value) == "" {
		return
	}

	text, _ := syscall.UTF16PtrFromString(value)
	oldFont, _, _ := procSelectObject.Call(hdc, font)
	procSetTextColor.Call(hdc, uintptr(color))
	procDrawTextW.Call(hdc, uintptr(unsafe.Pointer(text)), ^uintptr(0), uintptr(unsafe.Pointer(&bounds)), flags)
	procSelectObject.Call(hdc, oldFont)
}

func solidBrush(color uint32) uintptr {
	brush, _, _ := procCreateSolidBrush.Call(uintptr(color))
	return brush
}

func rgb(red, green, blue uint32) uint32 {
	return red | green<<8 | blue<<16
}
