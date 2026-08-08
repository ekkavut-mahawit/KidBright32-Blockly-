"use strict";

// KidBright32 Studio — Web application and Blockly generators
// ใช้ร่วมกับ main.py Runtime Protocol v2.0.4 ขึ้นไป

window.KB32_STUDIO_LOADED = true;

const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // Browser -> Board
const UART_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // Board -> Browser
const FRAME_MAGIC = new Uint8Array([0x4b, 0x42, 0x33, 0x32]); // "KB32"
const MAX_CODE_BYTES = 48 * 1024;
const STUDIO_VERSION = "2.0.4";
const MIN_RUNTIME_VERSION = "2.0.4";
const BLE_CHUNK_SIZE = 20;
const BLE_UPLOAD_BLOCK_SIZE = 384;

let workspace = null;
let isSimMode = false;
let isUploading = false;

let serialPort = null;
let serialReader = null;
let serialWriter = null;
let serialReadTask = null;

let bleDevice = null;
let bleRx = null;
let bleTx = null;

const decoders = {
  usb: new TextDecoder("utf-8"),
  ble: new TextDecoder("utf-8")
};
const incomingText = { usb: "", ble: "" };
const ackWaiters = [];

function byId(id) { return document.getElementById(id); }

function setStatus(state, message) {
  const dot = byId("statusDot");
  if (dot) dot.className = state || "";
  if (message) logMessage(message);
}

function logMessage(message, source = "ระบบ") {
  const box = byId("consoleBox");
  if (!box) return;
  const stamp = new Date().toLocaleTimeString("th-TH", { hour12: false });
  const line = `[${stamp}] ${source}: ${String(message).trimEnd()}`;
  if (box.textContent.startsWith("พร้อมเริ่มต้น")) box.textContent = "";
  box.textContent += (box.textContent ? "\n" : "") + line;
  box.scrollTop = box.scrollHeight;
}

function reportError(context, error) {
  console.error(context, error);
  setStatus("error", `${context}: ${error && error.message ? error.message : error}`);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function clearIncomingBuffer(source) {
  if (source && incomingText[source] !== undefined) {
    incomingText[source] = "";
  }
}

// ---------------------------------------------------------------------------
// LED Matrix field 16 x 8
// ---------------------------------------------------------------------------
class FieldMatrix16x8 extends Blockly.Field {
  constructor(value) {
    super(FieldMatrix16x8.normalise(value));
    this.SERIALIZABLE = true;
    this.CURSOR = "pointer";
    this.isDrawing_ = false;
    this.drawMode_ = true;
    this.size_ = new Blockly.utils.Size(217, 137);
    this.documentMoveHandler_ = null;
    this.documentUpHandler_ = null;
  }

  static normalise(value) {
    let values;
    if (Array.isArray(value)) values = value;
    else values = String(value || "").split(",");
    values = values.slice(0, 16).map(v => Math.max(0, Math.min(255, Number(v) || 0)) | 0);
    while (values.length < 16) values.push(0);
    return values.join(",");
  }

  static fromJson(options) { return new FieldMatrix16x8(options.matrix); }
  getSize() { return new Blockly.utils.Size(217, 137); }

  doClassValidation_(newValue) { return FieldMatrix16x8.normalise(newValue); }

  initView() {
    this.matrixGroup_ = Blockly.utils.dom.createSvgElement("g", { class: "blocklyMatrixField" }, this.fieldGroup_);
    this.dots_ = [];
    const cols = 16, rows = 8, size = 10, gap = 3, pad = 6;
    Blockly.utils.dom.createSvgElement("rect", {
      width: 217, height: 137, rx: 8, ry: 8, fill: "#141416",
      stroke: "#ff6b00", "stroke-width": 1.5
    }, this.matrixGroup_);
    const midX = pad + 8 * (size + gap) - gap / 2;
    Blockly.utils.dom.createSvgElement("line", {
      x1: midX, y1: pad, x2: midX, y2: pad + rows * (size + gap) - gap,
      stroke: "#ff6b00", "stroke-width": 1.5, "stroke-dasharray": "2,2", opacity: .5
    }, this.matrixGroup_);

    const values = this.getValueArray_();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const lit = (values[col] & (1 << row)) !== 0;
        const dot = Blockly.utils.dom.createSvgElement("circle", {
          cx: pad + col * (size + gap) + size / 2,
          cy: pad + row * (size + gap) + size / 2,
          r: size / 2,
          fill: lit ? "#ff2d55" : "#2a2a2e",
          cursor: "pointer",
          "data-kb-col": col,
          "data-kb-row": row
        }, this.matrixGroup_);
        this.dots_.push(dot);
      }
    }
    const y = pad + rows * (size + gap) + 2;
    this.createButton_(pad, y, 60, "ล้าง", () => this.setAll_(0));
    this.createButton_(pad + 65, y, 65, "ติดหมด", () => this.setAll_(255));
    this.createButton_(pad + 135, y, 65, "กลับสี", () => {
      this.setValue(this.getValueArray_().map(v => (~v) & 255).join(","));
      this.updateDisplay_();
    });
  }

  createButton_(x, y, width, label, action) {
    const group = Blockly.utils.dom.createSvgElement("g", { cursor: "pointer" }, this.matrixGroup_);
    Blockly.utils.dom.createSvgElement("rect", {
      x, y, width, height: 18, rx: 4, fill: "#2d2d30", stroke: "#555"
    }, group);
    const text = Blockly.utils.dom.createSvgElement("text", {
      x: x + width / 2, y: y + 12, fill: "white", "font-size": 10,
      "text-anchor": "middle", "pointer-events": "none"
    }, group);
    text.textContent = label;
    group.addEventListener("pointerdown", event => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
  }

  bindEvents_() {
    super.bindEvents_();
    this.matrixGroup_.addEventListener("pointerdown", event => {
      const target = event.target;
      if (!target || target.getAttribute("data-kb-col") === null) return;
      const col = Number(target.getAttribute("data-kb-col"));
      const row = Number(target.getAttribute("data-kb-row"));
      this.isDrawing_ = true;
      this.drawMode_ = (this.getValueArray_()[col] & (1 << row)) === 0;
      this.setDot_(col, row, this.drawMode_);
      event.preventDefault();
      event.stopPropagation();
    });
    this.documentMoveHandler_ = event => {
      if (!this.isDrawing_) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!target || target.getAttribute("data-kb-col") === null) return;
      this.setDot_(Number(target.getAttribute("data-kb-col")), Number(target.getAttribute("data-kb-row")), this.drawMode_);
    };
    this.documentUpHandler_ = () => { this.isDrawing_ = false; };
    document.addEventListener("pointermove", this.documentMoveHandler_);
    document.addEventListener("pointerup", this.documentUpHandler_);
  }

  dispose() {
    if (this.documentMoveHandler_) document.removeEventListener("pointermove", this.documentMoveHandler_);
    if (this.documentUpHandler_) document.removeEventListener("pointerup", this.documentUpHandler_);
    super.dispose();
  }

  getValueArray_() { return FieldMatrix16x8.normalise(this.getValue()).split(",").map(Number); }
  setAll_(value) { this.setValue(new Array(16).fill(value).join(",")); this.updateDisplay_(); }
  setDot_(col, row, on) {
    if (col < 0 || col > 15 || row < 0 || row > 7) return;
    const values = this.getValueArray_();
    values[col] = on ? values[col] | (1 << row) : values[col] & ~(1 << row);
    this.setValue(values.join(","));
    this.updateDisplay_();
  }
  updateDisplay_() {
    if (!this.dots_) return;
    const values = this.getValueArray_();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 16; col++) {
        const dot = this.dots_[row * 16 + col];
        const lit = (values[col] & (1 << row)) !== 0;
        dot.setAttribute("fill", lit ? "#ff2d55" : "#2a2a2e");
      }
    }
  }
}

Blockly.fieldRegistry.register("field_matrix16x8", FieldMatrix16x8);

// ---------------------------------------------------------------------------
// Blockly blocks and MicroPython generators
// ---------------------------------------------------------------------------
function registerKidBrightBlocks() {
  const P = Blockly.Python;
  P.addReservedWords("display,btn1,btn2,adc_light,buzzer_pwm,usb_out,ble_uart,wlan,wifi_connect,http_get,read_analog,digital_write,set_servo_angle,sync_ntp_thailand");

  Blockly.Blocks.kb_forever = { init() {
    this.appendDummyInput().appendField("ทำซ้ำตลอดเวลา");
    this.appendStatementInput("DO").appendField("ทำ");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#ef4444");
  }};
  P.kb_forever = block => {
    const body = P.statementToCode(block, "DO") || "    pass\n";
    return `while True:\n${body}    time.sleep_ms(1)\n`;
  };

  Blockly.Blocks.kb_matrix_text = { init() {
    this.appendValueInput("TEXT").appendField("แสดงข้อความบน LED");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#ff6b00");
  }};
  P.kb_matrix_text = block => `display.scroll(${P.valueToCode(block, "TEXT", P.ORDER_NONE) || "''"})\n`;

  Blockly.Blocks.kb_matrix_draw = { init() {
    this.appendDummyInput().appendField("วาดรูป LED 16×8");
    this.appendDummyInput().appendField(new FieldMatrix16x8(), "MATRIX");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#ff6b00");
  }};
  P.kb_matrix_draw = block => {
    const field = block.getField("MATRIX");
    const value = FieldMatrix16x8.normalise(field ? field.getValue() : "");
    return `display.show_custom([${value}])\n`;
  };

  Blockly.Blocks.kb_matrix_clear = { init() {
    this.appendDummyInput().appendField("ล้างหน้าจอ LED");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#ff6b00");
  }};
  P.kb_matrix_clear = () => "display.clear()\n";

  Blockly.Blocks.kb_read_button = { init() {
    this.appendDummyInput().appendField("สวิตช์").appendField(new Blockly.FieldDropdown([["SW1", "1"], ["SW2", "2"]]), "BTN").appendField("ถูกกด");
    this.setOutput(true, "Boolean"); this.setColour("#f97316");
  }};
  P.kb_read_button = block => [`btn${block.getFieldValue("BTN")}.value() == 0`, P.ORDER_RELATIONAL];

  Blockly.Blocks.kb_read_light = { init() {
    this.appendDummyInput().appendField("ค่าแสง 0–100 (%)"); this.setOutput(true, "Number"); this.setColour("#f97316");
  }};
  P.kb_read_light = () => ["read_light_percent()", P.ORDER_FUNCTION_CALL];

  Blockly.Blocks.kb_buzzer = { init() {
    this.appendDummyInput().appendField("Buzzer").appendField(new Blockly.FieldDropdown([["เปิด", "512"], ["ปิด", "0"]]), "DUTY");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#eab308");
  }};
  P.kb_buzzer = block => `buzzer_pwm.duty(${block.getFieldValue("DUTY")})\n`;

  Blockly.Blocks.kb_buzzer_volume = { init() {
    this.appendValueInput("VOLUME").setCheck("Number").appendField("ความดัง Buzzer (%)");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#eab308");
  }};
  P.kb_buzzer_volume = block => `buzzer_pwm.duty(int(max(0, min(100, ${P.valueToCode(block, "VOLUME", P.ORDER_NONE) || 50})) * 10.23))\n`;

  Blockly.Blocks.kb_buzzer_freq = { init() {
    this.appendValueInput("FREQ").setCheck("Number").appendField("ความถี่ Buzzer (Hz)");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#eab308");
  }};
  P.kb_buzzer_freq = block => `buzzer_pwm.freq(max(20, min(20000, int(${P.valueToCode(block, "FREQ", P.ORDER_NONE) || 1000}))))\n`;

  Blockly.Blocks.kb_usb_output = { init() {
    this.appendDummyInput().appendField("USB Out").appendField(new Blockly.FieldDropdown([["เปิด", "1"], ["ปิด", "0"]]), "STATE");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#eab308");
  }};
  P.kb_usb_output = block => `usb_out.value(${block.getFieldValue("STATE")})\n`;

  Blockly.Blocks.time_delay = { init() {
    this.appendValueInput("DELAY_TIME").setCheck("Number").appendField("หน่วงเวลา (วินาที)");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#5b80a5");
  }};
  P.time_delay = block => `time.sleep(max(0, ${P.valueToCode(block, "DELAY_TIME", P.ORDER_NONE) || 1}))\n`;

  Blockly.Blocks.kb_rtc_sync_ntp = { init() {
    this.appendDummyInput().appendField("ซิงค์เวลา NTP ประเทศไทย (UTC+7)");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#0284c7");
  }};
  P.kb_rtc_sync_ntp = () => "sync_ntp_thailand()\n";

  Blockly.Blocks.kb_rtc_get_time = { init() {
    this.appendDummyInput().appendField("อ่านเวลา").appendField(new Blockly.FieldDropdown([
      ["ชั่วโมง", "4"], ["นาที", "5"], ["วินาที", "6"], ["ปี", "0"], ["เดือน", "1"], ["วัน", "2"]
    ]), "UNIT");
    this.setOutput(true, "Number"); this.setColour("#0284c7");
  }};
  P.kb_rtc_get_time = block => [`machine.RTC().datetime()[${block.getFieldValue("UNIT")}]`, P.ORDER_ATOMIC];

  Blockly.Blocks.kb_rtc_set_time = { init() {
    this.appendDummyInput().appendField("ตั้งนาฬิกา RTC");
    for (const [name, label] of [["YEAR", "ปี"], ["MONTH", "เดือน"], ["DAY", "วัน"], ["HOUR", "ชั่วโมง"], ["MINUTE", "นาที"], ["SECOND", "วินาที"]]) {
      this.appendValueInput(name).setCheck("Number").appendField(label);
    }
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#0284c7");
  }};
  P.kb_rtc_set_time = block => {
    const v = (name, fallback) => P.valueToCode(block, name, P.ORDER_NONE) || fallback;
    return `machine.RTC().datetime((${v("YEAR", 2026)}, ${v("MONTH", 1)}, ${v("DAY", 1)}, 0, ${v("HOUR", 12)}, ${v("MINUTE", 0)}, ${v("SECOND", 0)}, 0))\n`;
  };

  Blockly.Blocks.kb_ble_init = { init() {
    this.appendValueInput("NAME").appendField("ตั้งชื่อ BLE");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#8b5cf6");
  }};
  P.kb_ble_init = block => `ble_uart.set_name(str(${P.valueToCode(block, "NAME", P.ORDER_NONE) || "'KidBright32-BLE'"}))\n`;

  Blockly.Blocks.kb_ble_send = { init() {
    this.appendValueInput("TEXT").appendField("ส่งข้อความ BLE");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#8b5cf6");
  }};
  P.kb_ble_send = block => `ble_uart.send(str(${P.valueToCode(block, "TEXT", P.ORDER_NONE) || "''"}))\n`;

  Blockly.Blocks.kb_ble_read = { init() {
    this.appendDummyInput().appendField("อ่านข้อความ BLE"); this.setOutput(true, "String"); this.setColour("#8b5cf6");
  }};
  P.kb_ble_read = () => ["ble_uart.read()", P.ORDER_FUNCTION_CALL];

  Blockly.Blocks.kb_ble_is_connected = { init() {
    this.appendDummyInput().appendField("BLE เชื่อมต่ออยู่"); this.setOutput(true, "Boolean"); this.setColour("#8b5cf6");
  }};
  P.kb_ble_is_connected = () => ["ble_uart.is_connected()", P.ORDER_FUNCTION_CALL];

  Blockly.Blocks.kb_wifi_connect = { init() {
    this.appendValueInput("SSID").appendField("เชื่อมต่อ Wi-Fi ชื่อ");
    this.appendValueInput("PASSWORD").appendField("รหัสผ่าน");
    this.appendValueInput("TIMEOUT").setCheck("Number").appendField("หมดเวลา (วินาที)");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#059669");
  }};
  P.kb_wifi_connect = block => `wlan = wifi_connect(${P.valueToCode(block, "SSID", P.ORDER_NONE) || "''"}, ${P.valueToCode(block, "PASSWORD", P.ORDER_NONE) || "''"}, ${P.valueToCode(block, "TIMEOUT", P.ORDER_NONE) || 15})\n`;

  Blockly.Blocks.kb_wifi_is_connected = { init() {
    this.appendDummyInput().appendField("Wi-Fi เชื่อมต่อสำเร็จ"); this.setOutput(true, "Boolean"); this.setColour("#059669");
  }};
  P.kb_wifi_is_connected = () => ["wlan.isconnected() if 'wlan' in globals() else False", P.ORDER_CONDITIONAL];

  Blockly.Blocks.kb_wifi_get_ip = { init() {
    this.appendDummyInput().appendField("IP Address"); this.setOutput(true, "String"); this.setColour("#059669");
  }};
  P.kb_wifi_get_ip = () => ["wlan.ifconfig()[0] if ('wlan' in globals() and wlan.isconnected()) else '0.0.0.0'", P.ORDER_CONDITIONAL];

  Blockly.Blocks.kb_http_get = { init() {
    this.appendValueInput("URL").appendField("HTTP GET URL"); this.setOutput(true, "String"); this.setColour("#059669");
  }};
  P.kb_http_get = block => [`http_get(${P.valueToCode(block, "URL", P.ORDER_NONE) || "''"})`, P.ORDER_FUNCTION_CALL];

  Blockly.Blocks.digital_write = { init() {
    this.appendDummyInput().appendField("Digital ขา").appendField(new Blockly.FieldDropdown([["OUT1 (18)", "18"], ["OUT2 (19)", "19"], ["OUT3 (23)", "23"]]), "PIN")
      .appendField("เป็น").appendField(new Blockly.FieldDropdown([["HIGH", "1"], ["LOW", "0"]]), "STATE");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#a16207");
  }};
  P.digital_write = block => `digital_write(${block.getFieldValue("PIN")}, ${block.getFieldValue("STATE")})\n`;

  Blockly.Blocks.analog_read = { init() {
    this.appendDummyInput().appendField("Analog ขา").appendField(new Blockly.FieldDropdown([["IN1 (32)", "32"], ["IN2 (33)", "33"], ["IN3 (34)", "34"], ["IN4 (35)", "35"]]), "PIN");
    this.setOutput(true, "Number"); this.setColour("#a16207");
  }};
  P.analog_read = block => [`read_analog(${block.getFieldValue("PIN")})`, P.ORDER_FUNCTION_CALL];

  Blockly.Blocks.servo_move = { init() {
    this.appendDummyInput().appendField("Servo ขา").appendField(new Blockly.FieldDropdown([["SV1 (15)", "15"], ["SV2 (17)", "17"]]), "PIN")
      .appendField("มุม").appendField(new Blockly.FieldAngle(90), "ANGLE");
    this.setPreviousStatement(true); this.setNextStatement(true); this.setColour("#a16207");
  }};
  P.servo_move = block => `set_servo_angle(${block.getFieldValue("PIN")}, ${block.getFieldValue("ANGLE")})\n`;
}

function updatePythonCode() {
  if (!workspace) return;
  try {
    const generated = Blockly.Python.workspaceToCode(workspace);
    const header = [
      `# KidBright32 user program — generated by Studio v${STUDIO_VERSION}`,
      `# Requires main.py Runtime Protocol v${MIN_RUNTIME_VERSION} or newer`,
      "import machine, time",
      "from machine import Pin, ADC, PWM, RTC",
      ""
    ].join("\n");
    const box = byId("pythonCodeBox");
    if (box) box.value = header + generated;
  } catch (error) {
    reportError("สร้างโค้ดไม่สำเร็จ", error);
  }
}

// ---------------------------------------------------------------------------
// Workspace save/load and clipboard
// ---------------------------------------------------------------------------
async function copyPythonCode(showMessage = true) {
  const codeBox = byId("pythonCodeBox");
  if (!codeBox) return;
  const code = codeBox.value;
  try {
    await navigator.clipboard.writeText(code);
  } catch (_) {
    codeBox.removeAttribute("readonly"); codeBox.select();
    document.execCommand("copy"); codeBox.setAttribute("readonly", "readonly");
  }
  if (showMessage) setStatus("ok", "คัดลอกโค้ดแล้ว");
}

function saveWorkspace() {
  const dom = Blockly.Xml.workspaceToDom(workspace);
  const xml = Blockly.Xml.domToPrettyText(dom);
  const url = URL.createObjectURL(new Blob([xml], { type: "text/xml;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "kidbright32-blocks.xml"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  localStorage.setItem("kidbright32-workspace", xml);
  setStatus("ok", "บันทึกบล็อกเป็นไฟล์ XML แล้ว");
}

async function loadWorkspaceFile(file) {
  const xmlText = await file.text();
  const dom = Blockly.Xml.textToDom(xmlText);
  workspace.clear();
  Blockly.Xml.domToWorkspace(dom, workspace);
  localStorage.setItem("kidbright32-workspace", xmlText);
  setStatus("ok", `เปิดไฟล์ ${file.name} แล้ว`);
}

// ---------------------------------------------------------------------------
// Runtime Protocol v2 — frame = "KB32" + uint32 length + uint32 CRC32 + bytes
// ---------------------------------------------------------------------------
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildFrame(code) {
  const payload = new TextEncoder().encode(code);
  if (payload.length > MAX_CODE_BYTES) throw new Error(`โค้ดมีขนาด ${payload.length} ไบต์ เกินขีดจำกัด ${MAX_CODE_BYTES} ไบต์`);
  const frame = new Uint8Array(12 + payload.length);
  frame.set(FRAME_MAGIC, 0);
  const view = new DataView(frame.buffer);
  view.setUint32(4, payload.length, true);
  view.setUint32(8, crc32(payload), true);
  frame.set(payload, 12);
  return frame;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function receiveBoardBytes(source, value) {
  let bytes;
  if (value instanceof Uint8Array) bytes = value;
  else if (value instanceof DataView) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else bytes = new Uint8Array(value.buffer || value);
  const text = decoders[source].decode(bytes, { stream: true });
  if (!text) return;
  incomingText[source] = (incomingText[source] + text).slice(-8192);

  const visibleText = text.replace(/@KB32:(?:ACK|READY):\d+\r?\n?/g, "");
  if (visibleText.trim()) logMessage(visibleText, source.toUpperCase());

  for (let i = ackWaiters.length - 1; i >= 0; i--) {
    const waiter = ackWaiters[i];
    if (waiter.source !== source) continue;
    if (incomingText[source].includes("@KB32:ERROR:")) {
      const match = incomingText[source].match(/@KB32:ERROR:[^\r\n]*/);
      ackWaiters.splice(i, 1); clearTimeout(waiter.timer);
      waiter.reject(new Error(match ? match[0] : "บอร์ดรายงานข้อผิดพลาด"));
    } else if (incomingText[source].includes(waiter.marker)) {
      ackWaiters.splice(i, 1); clearTimeout(waiter.timer); waiter.resolve(incomingText[source]);
    }
  }
}

function waitForAck(source, marker, timeoutMs) {
  if (incomingText[source].includes(marker)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const waiter = { source, marker, resolve, reject, timer: null };
    waiter.timer = setTimeout(() => {
      const index = ackWaiters.indexOf(waiter);
      if (index >= 0) ackWaiters.splice(index, 1);
      reject(new Error(`ไม่ได้รับการตอบกลับ ${marker} ภายในเวลาที่กำหนด`));
    }, timeoutMs);
    ackWaiters.push(waiter);
  });
}

function compareVersions(left, right) {
  const a = String(left).split(".").map(value => Number(value) || 0);
  const b = String(right).split(".").map(value => Number(value) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function detectedRuntimeVersion() {
  const matches = [...incomingText.ble.matchAll(/@KB32:PONG:([0-9]+(?:\.[0-9]+){1,3})/g)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

async function readBLEStatus() {
  if (!bleTx || typeof bleTx.readValue !== "function") return;
  try {
    const value = await bleTx.readValue();
    if (value && value.byteLength) receiveBoardBytes("ble", value);
  } catch (_) {}
}

async function verifyBLERuntime() {
  const ping = new TextEncoder().encode("@KB32:PING\n");
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      clearIncomingBuffer("ble");
      await writeBLEChunk(ping, attempt === 1);
      try {
        await waitForAck("ble", "@KB32:PONG:", 1200);
      } catch (error) {
        lastError = error;
        await readBLEStatus();
        if (!detectedRuntimeVersion()) await sleep(180);
      }
      const version = detectedRuntimeVersion();
      if (version) {
        if (compareVersions(version, MIN_RUNTIME_VERSION) < 0) {
          throw new Error(`Runtime v${version} เก่าเกินไป ต้องใช้ v${MIN_RUNTIME_VERSION} ขึ้นไป`);
        }
        return version;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(180);
  }
  throw lastError || new Error("ไม่ได้รับ @KB32:PONG ผ่าน notification หรือ TX read");
}

async function connectUSB() {
  if (serialPort) { await disconnectUSB(); return; }
  if (!navigator.serial) return reportError("Web Serial ใช้งานไม่ได้", new Error("กรุณาเปิดด้วย Chrome/Edge ผ่าน HTTPS หรือ localhost"));
  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 115200, bufferSize: 65536 });
    serialWriter = serialPort.writable.getWriter();
    serialReadTask = readSerialLoop();
    const btn = byId("usbBtn");
    if (btn) { btn.textContent = "✅ USB เชื่อมต่อแล้ว"; btn.style.background = "#16a34a"; }
    setStatus("ok", "เชื่อมต่อ KidBright32 ผ่าน USB แล้ว");
  } catch (error) {
    serialPort = null; serialWriter = null;
    reportError("เชื่อมต่อ USB ไม่สำเร็จ", error);
  }
}

async function readSerialLoop() {
  try {
    while (serialPort && serialPort.readable) {
      serialReader = serialPort.readable.getReader();
      try {
        while (true) {
          const { value, done } = await serialReader.read();
          if (done) break;
          if (value) receiveBoardBytes("usb", value);
        }
      } finally {
        serialReader.releaseLock(); serialReader = null;
      }
    }
  } catch (error) {
    if (serialPort) reportError("การอ่าน USB หยุดทำงาน", error);
  }
}

async function disconnectUSB() {
  const port = serialPort;
  serialPort = null;
  try { if (serialReader) await serialReader.cancel(); } catch (_) {}
  try { if (serialReadTask) await serialReadTask; } catch (_) {}
  try { if (serialWriter) { serialWriter.releaseLock(); serialWriter = null; } } catch (_) {}
  try { if (port) await port.close(); } catch (_) {}
  const btn = byId("usbBtn");
  if (btn) { btn.textContent = "🔌 เชื่อมต่อ USB"; btn.style.background = "#2563eb"; }
  setStatus("", "ยกเลิกการเชื่อมต่อ USB แล้ว");
}

async function connectBLE() {
  if (bleDevice && bleDevice.gatt.connected) { bleDevice.gatt.disconnect(); return; }
  if (!navigator.bluetooth) return reportError("Web Bluetooth ใช้งานไม่ได้", new Error("กรุณาเปิดด้วย Chrome/Edge ผ่าน HTTPS"));
  try {
    bleDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "KidBright32" }], optionalServices: [UART_SERVICE_UUID]
    });
    bleDevice.addEventListener("gattserverdisconnected", onBLEDisconnected);
    const server = await bleDevice.gatt.connect();
    const service = await server.getPrimaryService(UART_SERVICE_UUID);
    bleRx = await service.getCharacteristic(UART_RX_UUID);
    bleTx = await service.getCharacteristic(UART_TX_UUID);
    clearIncomingBuffer("ble");
    await bleTx.startNotifications();
    bleTx.addEventListener("characteristicvaluechanged", event => receiveBoardBytes("ble", event.target.value));
    await sleep(250);
    await readBLEStatus();
    const runtimeVersion = detectedRuntimeVersion() || await verifyBLERuntime();
    const btn = byId("bleBtn");
    if (btn) { btn.textContent = "✅ BLE เชื่อมต่อแล้ว"; btn.style.background = "#16a34a"; }
    setStatus("ok", `เชื่อมต่อ ${bleDevice.name || "KidBright32"} ผ่าน BLE แล้ว (Runtime v${runtimeVersion})`);
  } catch (error) {
    try { if (bleDevice && bleDevice.gatt.connected) bleDevice.gatt.disconnect(); } catch (_) {}
    bleRx = null; bleTx = null;
    const detail = error && /PONG|Runtime/.test(error.message || "")
      ? new Error(`เชื่อมต่อ GATT ได้ แต่ไม่พบ Runtime v${MIN_RUNTIME_VERSION} ขึ้นไป กรุณาแทน /main.py แล้วกด Reset; หากยังเหมือนเดิมให้ดูข้อความเริ่มระบบผ่าน Thonny Shell`)
      : error;
    reportError("เชื่อมต่อ BLE ไม่สำเร็จ", detail);
  }
}

function onBLEDisconnected() {
  bleRx = null; bleTx = null;
  const btn = byId("bleBtn");
  if (btn) { btn.textContent = "📶 เชื่อมต่อ BLE"; btn.style.background = "#9333ea"; }
  setStatus("", "การเชื่อมต่อ BLE สิ้นสุดลง");
}

async function writeBLEChunk(chunk, preferWithoutResponse = false) {
  if (!bleRx) throw new Error("ยังไม่ได้เชื่อมต่อ BLE");
  try {
    if (preferWithoutResponse && bleRx.properties && bleRx.properties.writeWithoutResponse && typeof bleRx.writeValueWithoutResponse === "function") {
      await bleRx.writeValueWithoutResponse(chunk);
      await sleep(20);
      return;
    }
    if (bleRx.properties && bleRx.properties.write && typeof bleRx.writeValueWithResponse === "function") {
      await bleRx.writeValueWithResponse(chunk);
      await sleep(15);
    } else if (bleRx.properties && bleRx.properties.write && typeof bleRx.writeValue === "function") {
      await bleRx.writeValue(chunk);
      await sleep(15);
    } else if (typeof bleRx.writeValueWithoutResponse === "function") {
      await bleRx.writeValueWithoutResponse(chunk);
      await sleep(20);
    } else {
      throw new Error("BLE characteristic ไม่รองรับการเขียนข้อมูล");
    }
  } catch (err) {
    await sleep(40);
    if (typeof bleRx.writeValueWithoutResponse === "function") {
      await bleRx.writeValueWithoutResponse(chunk);
      await sleep(20);
    } else {
      throw err;
    }
  }
}

async function sendFrameBLE(frame) {
  if (!bleRx) throw new Error("ยังไม่ได้เชื่อมต่อ BLE");
  for (let offset = 0; offset < frame.length; offset += BLE_CHUNK_SIZE) {
    const chunk = frame.slice(offset, offset + BLE_CHUNK_SIZE);
    await writeBLEChunk(chunk);
    if (offset && offset % 400 === 0) {
      setStatus("busy", `ส่งผ่าน BLE แล้ว ${Math.min(offset, frame.length)}/${frame.length} ไบต์`);
    }
  }
}

async function sendBLEControlAndWait(line, marker, timeoutMs = 3500, attempts = 4) {
  const encoded = new TextEncoder().encode(line);
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    clearIncomingBuffer("ble");
    try {
      await sendFrameBLE(encoded);
      await waitForAck("ble", marker, timeoutMs);
      return;
    } catch (error) {
      lastError = error;
      if (incomingText.ble.includes("@KB32:ERROR:")) throw error;
      await readBLEStatus();
      if (incomingText.ble.includes(marker)) return;
      await sleep(150 * attempt);
    }
  }
  throw lastError || new Error(`ไม่ได้รับการตอบกลับ ${marker}`);
}

async function sendReliableBLEProgram(code) {
  const payload = new TextEncoder().encode(code);
  if (payload.length > MAX_CODE_BYTES) {
    throw new Error(`โค้ดมีขนาด ${payload.length} ไบต์ เกินขีดจำกัด ${MAX_CODE_BYTES} ไบต์`);
  }

  const expectedCRC = crc32(payload);
  await sendBLEControlAndWait(
    `@KB32:BEGIN:${payload.length}:${expectedCRC}\n`,
    "@KB32:READY:0",
    4500
  );

  for (let offset = 0; offset < payload.length; offset += BLE_UPLOAD_BLOCK_SIZE) {
    const block = payload.slice(offset, offset + BLE_UPLOAD_BLOCK_SIZE);
    const nextOffset = offset + block.length;
    const line = `@KB32:DATA:${offset}:${bytesToBase64(block)}\n`;
    await sendBLEControlAndWait(line, `@KB32:ACK:${nextOffset}`, 4500);
    setStatus("busy", `ส่งผ่าน BLE แล้ว ${nextOffset}/${payload.length} ไบต์`);
  }

  await sendBLEControlAndWait("@KB32:END\n", "@KB32:SAVED", 12000, 3);
}

async function executeCode() {
  if (isUploading) return;
  const codeBox = byId("pythonCodeBox");
  if (!codeBox) return;
  const code = codeBox.value;
  if (!code.trim()) return setStatus("error", "ยังไม่มีบล็อกคำสั่งสำหรับส่งไปยังบอร์ด");
  if (isSimMode) {
    await copyPythonCode(false);
    window.open("https://wokwi.com/projects/new/esp32", "_blank", "noopener");
    return setStatus("ok", "คัดลอกโค้ดและเปิด Wokwi แล้ว (ฮาร์ดแวร์ KidBright32 ต้องจำลองแยก)");
  }

  const source = bleRx ? "ble" : serialWriter ? "usb" : null;
  if (!source) return setStatus("error", "กรุณาเชื่อมต่อ USB หรือ BLE ก่อนส่งโค้ด");

  isUploading = true;
  const runBtn = byId("runBtn");
  if (runBtn) runBtn.disabled = true;
  setStatus("busy", `กำลังส่งโค้ดผ่าน ${source.toUpperCase()}...`);
  try {
    clearIncomingBuffer(source);
    if (source === "ble") {
      await sendReliableBLEProgram(code);
    } else {
      const frame = buildFrame(code);
      await serialWriter.write(frame);
      await waitForAck(source, "@KB32:SAVED", 20000);
    }
    setStatus("ok", "บอร์ดตรวจสอบ CRC บันทึกโปรแกรม และกำลังรีสตาร์ตเพื่อรันโค้ดใหม่");
  } catch (error) {
    reportError("ส่งโปรแกรมไม่สำเร็จ", error);
  } finally {
    isUploading = false;
    if (runBtn) runBtn.disabled = false;
  }
}

function toggleMode() {
  isSimMode = !isSimMode;
  const btn = byId("modeBtn");
  if (btn) {
    btn.textContent = isSimMode ? "🧪 โหมด: Wokwi" : "🧪 โหมด: บอร์ดจริง";
    btn.style.background = isSimMode ? "#ea580c" : "#d97706";
  }
  setStatus("", isSimMode ? "โหมด Wokwi จะคัดลอกโค้ดและเปิดโปรเจกต์ ESP32 ใหม่" : "กลับสู่โหมดส่งโปรแกรมไปยังบอร์ดจริง");
}

// ---------------------------------------------------------------------------
// App Initialization & DOM Binding
// ---------------------------------------------------------------------------
function initStudio() {
  registerKidBrightBlocks();

  // แก้ไข ID ให้ตรงกับ index.html (blocklyDiv)
  const blocklyArea = byId("blocklyDiv") || byId("blocklyArea") || document.body;
  const toolbox = byId("toolbox");

  if (window.Blockly) {
    workspace = Blockly.inject(blocklyArea, {
      toolbox: toolbox,
      scrollbars: true,
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 }
    });

    workspace.addChangeListener(updatePythonCode);

    const savedXml = localStorage.getItem("kidbright32-workspace");
    if (savedXml) {
      try {
        const dom = Blockly.Xml.textToDom(savedXml);
        Blockly.Xml.domToWorkspace(dom, workspace);
      } catch (e) {
        console.warn("ไม่สามารถโหลด Workspace เดิมได้", e);
      }
    }
    updatePythonCode();
  }

  const usbBtn = byId("usbBtn");
  if (usbBtn) usbBtn.addEventListener("click", connectUSB);

  const bleBtn = byId("bleBtn");
  if (bleBtn) bleBtn.addEventListener("click", connectBLE);

  const runBtn = byId("runBtn");
  if (runBtn) runBtn.addEventListener("click", executeCode);

  const modeBtn = byId("modeBtn");
  if (modeBtn) modeBtn.addEventListener("click", toggleMode);

  const saveBtn = byId("saveBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveWorkspace);

  const copyBtn = byId("copyBtn");
  if (copyBtn) copyBtn.addEventListener("click", () => copyPythonCode(true));

  // ผูกปุ่มเปิดบล็อกกับ Input File
  const loadBtn = byId("loadBtn");
  const loadInput = byId("workspaceFile") || byId("loadFileInput");

  if (loadBtn && loadInput) {
    loadBtn.addEventListener("click", () => loadInput.click());
  }

  if (loadInput) {
    loadInput.addEventListener("change", e => {
      if (e.target.files && e.target.files[0]) {
        loadWorkspaceFile(e.target.files[0]);
      }
    });
  }

  setStatus("ok", "ระบบพร้อมใช้งาน");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initStudio);
} else {
  initStudio();
}