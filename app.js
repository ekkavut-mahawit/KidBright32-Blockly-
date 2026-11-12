// ==========================================
// 1. ตัวแปรระบบหลัก (Global Variables)
// ==========================================
let workspace = null;
let serialPort = null;
let serialWriter = null;
let serialReader = null;
let serialReadLoopActive = false;

let bleDevice = null;
let bleRxCharacteristic = null;
let bleTxCharacteristic = null;
let isSimMode = false;

// ตัวแปรระบบคำสั่งเสียง (Voice Recognition & TTS)
let recognition = null;
let isVoiceListening = false;
let serialLineBuffer = "";

const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHARACTERISTIC_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

// ==========================================
// 2. Custom Field: ตารางไฟ LED Matrix 16x8
// ==========================================
class FieldMatrix16x8 extends Blockly.Field {
    constructor(value) {
        super(value || "0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0");
        this.SERIALIZABLE = true;
        this.CURSOR = 'pointer';
        this.isDrawing_ = false;
        this.drawMode_ = true;
        this.size_ = new Blockly.utils.Size(217, 137);
        this.boundEvents_ = false;
    }

    static fromJson(options) {
        return new FieldMatrix16x8(options['matrix']);
    }

    getSize() {
        return new Blockly.utils.Size(217, 137);
    }

    initView() {
        this.matrixGroup_ = Blockly.utils.dom.createSvgElement('g', {
            'class': 'blocklyMatrixField'
        }, this.fieldGroup_);

        this.dots_ = [];
        const cols = 16, rows = 8;
        const size = 10, gap = 3;
        const pad = 6;

        const width = 217;
        const height = 137;

        Blockly.utils.dom.createSvgElement('rect', {
            'width': width,
            'height': height,
            'rx': 8, 'ry': 8,
            'fill': '#141416',
            'stroke': '#ff6b00',
            'stroke-width': '1.5'
        }, this.matrixGroup_);

        const midX = pad + 8 * (size + gap) - (gap / 2);
        Blockly.utils.dom.createSvgElement('line', {
            'x1': midX, 'y1': pad,
            'x2': midX, 'y2': pad + rows * (size + gap) - gap,
            'stroke': '#ff6b00',
            'stroke-width': '1.5',
            'stroke-dasharray': '2,2',
            'opacity': '0.5'
        }, this.matrixGroup_);

        const valArray = this.getValueArray();

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = pad + c * (size + gap);
                const y = pad + r * (size + gap);
                const isLit = (valArray[c] & (1 << r)) !== 0;

                const circle = Blockly.utils.dom.createSvgElement('circle', {
                    'cx': x + size / 2,
                    'cy': y + size / 2,
                    'r': size / 2,
                    'fill': isLit ? '#ff2d55' : '#2a2a2e',
                    'cursor': 'pointer',
                    'data-col': c,
                    'data-row': r,
                    'style': isLit ? 'filter: drop-shadow(0px 0px 2px #ff2d55);' : ''
                }, this.matrixGroup_);

                this.dots_.push(circle);
            }
        }

        const btnY = pad + rows * (size + gap) + 2;
        this.createButton_(pad, btnY, 60, 18, "🧹 ล้าง", "#2d2d30", () => this.clearAll());
        this.createButton_(pad + 65, btnY, 65, 18, "🌕 ติดหมด", "#2d2d30", () => this.fillAll());
        this.createButton_(pad + 135, btnY, 65, 18, "🔄 กลับสี", "#2d2d30", () => this.invertAll());
    }

    createButton_(x, y, w, h, text, color, onClick) {
        const btnGroup = Blockly.utils.dom.createSvgElement('g', {
            'cursor': 'pointer'
        }, this.matrixGroup_);

        Blockly.utils.dom.createSvgElement('rect', {
            'x': x, 'y': y, 'width': w, 'height': h,
            'rx': 4, 'fill': color, 'stroke': '#444', 'stroke-width': '1'
        }, btnGroup);

        const txt = Blockly.utils.dom.createSvgElement('text', {
            'x': x + w / 2, 'y': y + 12,
            'fill': '#ffffff', 'font-size': '10px',
            'text-anchor': 'middle', 'font-weight': 'bold', 'pointer-events': 'none'
        }, btnGroup);
        txt.textContent = text;

        btnGroup.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            onClick();
        });
    }

    getValueArray() {
        let val = this.getValue();
        if (typeof val === 'string') {
            const arr = val.split(',').map(Number);
            while (arr.length < 16) arr.push(0);
            return arr.slice(0, 16);
        } else if (Array.isArray(val)) {
            return val;
        }
        return new Array(16).fill(0);
    }

    bindEvents_() {
        super.bindEvents_();
        if (this.boundEvents_) return;

        this.onPointerMove_ = (e) => {
            if (!this.isDrawing_) return;
            const target = document.elementFromPoint(e.clientX, e.clientY);
            if (target && target.tagName === 'circle' && target.getAttribute('data-col') !== null) {
                const c = parseInt(target.getAttribute('data-col'));
                const r = parseInt(target.getAttribute('data-row'));
                this.setDot(c, r, this.drawMode_);
            }
        };

        this.onPointerUp_ = () => {
            this.isDrawing_ = false;
        };

        this.matrixGroup_.addEventListener('pointerdown', (e) => {
            const target = e.target;
            if (target && target.tagName === 'circle') {
                this.isDrawing_ = true;
                const c = parseInt(target.getAttribute('data-col'));
                const r = parseInt(target.getAttribute('data-row'));
                const arr = this.getValueArray();
                this.drawMode_ = (arr[c] & (1 << r)) === 0;
                this.setDot(c, r, this.drawMode_);
                e.stopPropagation();
            }
        });

        document.addEventListener('pointermove', this.onPointerMove_);
        document.addEventListener('pointerup', this.onPointerUp_);
        this.boundEvents_ = true;
    }

    dispose() {
        if (this.onPointerMove_) document.removeEventListener('pointermove', this.onPointerMove_);
        if (this.onPointerUp_) document.removeEventListener('pointerup', this.onPointerUp_);
        super.dispose();
    }

    setDot(col, row, state) {
        const arr = this.getValueArray();
        if (state) arr[col] |= (1 << row);
        else arr[col] &= ~(1 << row);
        this.setValue(arr.join(','));
        this.updateDisplay_();
    }

    clearAll() {
        this.setValue("0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0");
        this.updateDisplay_();
    }

    fillAll() {
        this.setValue("255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255");
        this.updateDisplay_();
    }

    invertAll() {
        const arr = this.getValueArray().map(v => (~v) & 0xFF);
        this.setValue(arr.join(','));
        this.updateDisplay_();
    }

    updateDisplay_() {
        if (!this.dots_) return;
        const arr = this.getValueArray();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 16; c++) {
                const idx = r * 16 + c;
                const isLit = (arr[c] & (1 << r)) !== 0;
                if (this.dots_[idx]) {
                    this.dots_[idx].setAttribute('fill', isLit ? '#ff2d55' : '#2a2a2e');
                    this.dots_[idx].setAttribute('style', isLit ? 'filter: drop-shadow(0px 0px 2px #ff2d55);' : '');
                }
            }
        }
    }
}

Blockly.fieldRegistry.register('field_matrix16x8', FieldMatrix16x8);

// ==========================================
// 3. การเริ่มต้นระบบ Blockly Workspace
// ==========================================
document.addEventListener("DOMContentLoaded", function () {
    registerKidBrightBlocks();

    workspace = Blockly.inject('blocklyDiv', {
        toolbox: document.getElementById('toolbox'),
        scrollbars: true,
        trashcan: true,
        zoom: {
            controls: true,
            wheel: true,
            startScale: 1.0,
            maxScale: 3,
            minScale: 0.3,
            scaleSpeed: 1.2
        },
        grid: {
            spacing: 20,
            length: 3,
            colour: '#ccc',
            snap: true
        }
    });

    workspace.addChangeListener(updatePythonCode);
    updatePythonCode();
    initSpeechRecognition();

    window.addEventListener('resize', function() {
        Blockly.svgResize(workspace);
    });
});

// ==========================================
// 4. ตัวสร้างโค้ด MicroPython (Block Generators)
// ==========================================
function registerKidBrightBlocks() {

    // --- 4.0 Voice Command Blocks (ระบบคำสั่งเสียง) ---
    Blockly.Blocks['kb_voice_listen'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("🎤 รับค่าคำสั่งเสียงล่าสุด (อัปเดต)");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#e11d48");
        }
    };
    Blockly.Python['kb_voice_listen'] = function(block) {
        return `voice_update()\n`;
    };

    Blockly.Blocks['kb_voice_if_heard'] = {
        init: function() {
            this.appendValueInput("KEYWORD")
                .setCheck("String")
                .appendField("🎤 ถ้าได้ยินคำว่า");
            this.appendDummyInput()
                .appendField(new Blockly.FieldDropdown([
                    ["(ล้างคำสั่งหลังทำงาน)", "True"],
                    ["(เก็บคำสั่งไว้)", "False"]
                ]), "CLEAR");
            this.setInputsInline(true);
            this.setOutput(true, "Boolean");
            this.setColour("#e11d48");
        }
    };
    Blockly.Python['kb_voice_if_heard'] = function(block) {
        var kw = Blockly.Python.valueToCode(block, 'KEYWORD', Blockly.Python.ORDER_ATOMIC) || "''";
        var autoClear = block.getFieldValue('CLEAR');
        return [`voice_match(${kw}, ${autoClear})`, Blockly.Python.ORDER_FUNCTION_CALL];
    };

    Blockly.Blocks['kb_voice_get_text'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("🎤 ข้อความเสียงล่าสุด");
            this.setOutput(true, "String");
            this.setColour("#e11d48");
        }
    };
    Blockly.Python['kb_voice_get_text'] = function(block) {
        return [`voice_get()`, Blockly.Python.ORDER_FUNCTION_CALL];
    };

    Blockly.Blocks['kb_voice_clear'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("🎤 ล้างค่าคำสั่งเสียงล่าสุด");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#e11d48");
        }
    };
    Blockly.Python['kb_voice_clear'] = function(block) {
        return `voice_clear()\n`;
    };

    Blockly.Blocks['kb_voice_speak'] = {
        init: function() {
            this.appendValueInput("TEXT")
                .setCheck("String")
                .appendField("🔊 พูดออกเสียงข้อความ");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#e11d48");
        }
    };
    Blockly.Python['kb_voice_speak'] = function(block) {
        var text = Blockly.Python.valueToCode(block, 'TEXT', Blockly.Python.ORDER_ATOMIC) || "''";
        return `voice_speak(${text})\n`;
    };

    // --- 4.1 LED & Display Blocks ---
    Blockly.Blocks['kb_matrix_text'] = {
        init: function() {
            this.appendValueInput("TEXT")
                .setCheck("String")
                .appendField("แสดงข้อความบนหน้าจอ");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#ff6b00");
        }
    };
    Blockly.Python['kb_matrix_text'] = function(block) {
        var text = Blockly.Python.valueToCode(block, 'TEXT', Blockly.Python.ORDER_ATOMIC) || "''";
        return `display.scroll(str(${text}))\n`;
    };

    Blockly.Blocks['kb_matrix_draw'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("วาดรูปไฟ LED (16x8)");
            this.appendDummyInput()
                .appendField(new FieldMatrix16x8("0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"), "MATRIX");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#ff6b00");
        }
    };
    Blockly.Python['kb_matrix_draw'] = function(block) {
        var matrixField = block.getField("MATRIX");
        var matrixVal = matrixField ? matrixField.getValue() : "0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0";
        return `display.show_custom([${matrixVal}])\n`;
    };

    Blockly.Blocks['kb_matrix_clear'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("ล้างหน้าจอ LED");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#ff6b00");
        }
    };
    Blockly.Python['kb_matrix_clear'] = function(block) {
        return `display.clear()\n`;
    };

    // --- 4.2 Sensors & Switches ---
    Blockly.Blocks['kb_read_button'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("อ่านค่าสวิตช์")
                .appendField(new Blockly.FieldDropdown([["SW1", "1"], ["SW2", "2"]]), "BTN");
            this.setOutput(true, "Boolean");
            this.setColour("#ff6b00");
        }
    };
    Blockly.Python['kb_read_button'] = function(block) {
        var btn = block.getFieldValue('BTN');
        return [`btn${btn}.value() == 0`, Blockly.Python.ORDER_RELATIONAL];
    };

    Blockly.Blocks['kb_read_light'] = {
        init: function() {
            this.appendDummyInput().appendField("อ่านค่าเซนเซอร์วัดแสง (%)");
            this.setOutput(true, "Number");
            this.setColour("#ff6b00");
        }
    };
    Blockly.Python['kb_read_light'] = function(block) {
        return [`int((4095 - adc_light.read()) / 4095 * 100)`, Blockly.Python.ORDER_ATOMIC];
    };

    // --- 4.3 Buzzer & Accessories ---
    Blockly.Blocks['kb_buzzer'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("เสียง Buzzer")
                .appendField(new Blockly.FieldDropdown([["เปิด (ON)", "1"], ["ปิด (OFF)", "0"]]), "STATE");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#ff6b00");
        }
    };
    Blockly.Python['kb_buzzer'] = function(block) {
        var state = block.getFieldValue('STATE');
        var dutyVal = (state === "1") ? "512" : "0";
        return `buzzer_pwm.duty(${dutyVal})\n`;
    };

    Blockly.Blocks['kb_buzzer_volume'] = {
        init: function() {
            this.appendValueInput("VOLUME")
                .setCheck("Number")
                .appendField("ปรับความดัง Buzzer (0-100%)");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#ff6b00");
        }
    };
    Blockly.Python['kb_buzzer_volume'] = function(block) {
        var volume = Blockly.Python.valueToCode(block, 'VOLUME', Blockly.Python.ORDER_ATOMIC) || "50";
        return `buzzer_pwm.duty(int(max(0, min(100, ${volume})) * 10.23))\n`;
    };

    Blockly.Blocks['kb_buzzer_freq'] = {
        init: function() {
            this.appendValueInput("FREQ")
                .setCheck("Number")
                .appendField("ปรับความถี่เสียง Buzzer (Hz)");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#ff6b00");
        }
    };
    Blockly.Python['kb_buzzer_freq'] = function(block) {
        var freq = Blockly.Python.valueToCode(block, 'FREQ', Blockly.Python.ORDER_ATOMIC) || "1000";
        return `buzzer_pwm.freq(int(${freq}))\n`;
    };

    Blockly.Blocks['kb_usb_output'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("ช่อง USB Out")
                .appendField(new Blockly.FieldDropdown([["เปิด (ON)", "1"], ["ปิด (OFF)", "0"]]), "STATE");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#ff6b00");
        }
    };
    Blockly.Python['kb_usb_output'] = function(block) {
        var state = block.getFieldValue('STATE');
        return `usb_out.value(${state})\n`;
    };

    // --- 4.4 Delay & Timing ---
    Blockly.Blocks['time_delay'] = {
        init: function() {
            this.appendValueInput("DELAY_TIME")
                .setCheck("Number")
                .appendField("หน่วงเวลา (วินาที)");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#5b80a5");
        }
    };
    Blockly.Python['time_delay'] = function(block) {
        var delayTime = Blockly.Python.valueToCode(block, 'DELAY_TIME', Blockly.Python.ORDER_ATOMIC) || "1";
        return `time.sleep(${delayTime})\n`;
    };

    // --- 4.5 RTC / Clock Blocks ---
    Blockly.Blocks['kb_rtc_sync_ntp'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("⏰ ซิงค์เวลาจากอินเทอร์เน็ต (NTP Sync)");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#2b8cbe");
        }
    };
    Blockly.Python['kb_rtc_sync_ntp'] = function(block) {
        return `try:\n    import ntptime; ntptime.settime()\nexcept Exception as e:\n    print("NTP Sync Failed:", e)\n`;
    };

    Blockly.Blocks['kb_rtc_get_time'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("⏰ อ่านค่าเวลา")
                .appendField(new Blockly.FieldDropdown([
                    ["ชั่วโมง (Hour)", "4"],
                    ["นาที (Minute)", "5"],
                    ["วินาที (Second)", "6"],
                    ["ปี (Year)", "0"],
                    ["เดือน (Month)", "1"],
                    ["วัน (Day)", "2"]
                ]), "UNIT");
            this.setOutput(true, "Number");
            this.setColour("#2b8cbe");
        }
    };
    Blockly.Python['kb_rtc_get_time'] = function(block) {
        var unit = block.getFieldValue('UNIT');
        return [`machine.RTC().datetime()[${unit}]`, Blockly.Python.ORDER_MEMBER];
    };

    Blockly.Blocks['kb_rtc_set_time'] = {
        init: function() {
            this.appendDummyInput().appendField("⏰ ตั้งค่านาฬิกา RTC");
            this.appendValueInput("YEAR").setCheck("Number").appendField("ปี");
            this.appendValueInput("MONTH").setCheck("Number").appendField("เดือน");
            this.appendValueInput("DAY").setCheck("Number").appendField("วัน");
            this.appendValueInput("HOUR").setCheck("Number").appendField("ชั่วโมง");
            this.appendValueInput("MINUTE").setCheck("Number").appendField("นาที");
            this.appendValueInput("SECOND").setCheck("Number").appendField("วินาที");
            this.setInputsInline(true);
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#2b8cbe");
        }
    };
    Blockly.Python['kb_rtc_set_time'] = function(block) {
        var y = Blockly.Python.valueToCode(block, 'YEAR', Blockly.Python.ORDER_ATOMIC) || "2026";
        var m = Blockly.Python.valueToCode(block, 'MONTH', Blockly.Python.ORDER_ATOMIC) || "1";
        var d = Blockly.Python.valueToCode(block, 'DAY', Blockly.Python.ORDER_ATOMIC) || "1";
        var h = Blockly.Python.valueToCode(block, 'HOUR', Blockly.Python.ORDER_ATOMIC) || "12";
        var min = Blockly.Python.valueToCode(block, 'MINUTE', Blockly.Python.ORDER_ATOMIC) || "0";
        var s = Blockly.Python.valueToCode(block, 'SECOND', Blockly.Python.ORDER_ATOMIC) || "0";
        return `machine.RTC().datetime((${y}, ${m}, ${d}, 0, ${h}, ${min}, ${s}, 0))\n`;
    };

    // --- 4.6 Bluetooth (BLE) Blocks ---
    Blockly.Blocks['kb_ble_init'] = {
        init: function() {
            this.appendValueInput("NAME")
                .setCheck("String")
                .appendField("📶 เริ่มต้น Bluetooth BLE ชื่อ");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#8e44ad");
        }
    };
    Blockly.Python['kb_ble_init'] = function(block) {
        var name = Blockly.Python.valueToCode(block, 'NAME', Blockly.Python.ORDER_ATOMIC) || "'KidBright32'";
        return `ble_uart = BLEUART(${name})\n`;
    };

    Blockly.Blocks['kb_ble_send'] = {
        init: function() {
            this.appendValueInput("TEXT")
                .setCheck("String")
                .appendField("📶 ส่งข้อความผ่าน Bluetooth");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#8e44ad");
        }
    };
    Blockly.Python['kb_ble_send'] = function(block) {
        var text = Blockly.Python.valueToCode(block, 'TEXT', Blockly.Python.ORDER_ATOMIC) || "''";
        return `if ble_uart and ble_uart.is_connected(): ble_uart.send(str(${text}) + "\\n")\n`;
    };

    Blockly.Blocks['kb_ble_read'] = {
        init: function() {
            this.appendDummyInput().appendField("📶 อ่านข้อความจาก Bluetooth");
            this.setOutput(true, "String");
            this.setColour("#8e44ad");
        }
    };
    Blockly.Python['kb_ble_read'] = function(block) {
        return [`(ble_uart.read() if (ble_uart and ble_uart.any()) else "")`, Blockly.Python.ORDER_ATOMIC];
    };

    Blockly.Blocks['kb_ble_is_connected'] = {
        init: function() {
            this.appendDummyInput().appendField("📶 มีการเชื่อมต่อ Bluetooth อยู่หรือไม่");
            this.setOutput(true, "Boolean");
            this.setColour("#8e44ad");
        }
    };
    Blockly.Python['kb_ble_is_connected'] = function(block) {
        return [`(ble_uart.is_connected() if ble_uart else False)`, Blockly.Python.ORDER_ATOMIC];
    };

    // --- 4.7 WiFi Networking & HTTP Blocks ---
    Blockly.Blocks['kb_wifi_connect'] = {
        init: function() {
            this.appendValueInput("SSID")
                .setCheck("String")
                .appendField("🌐 เชื่อมต่อ WiFi SSID");
            this.appendValueInput("PASSWORD")
                .setCheck("String")
                .appendField("รหัสผ่าน");
            this.setInputsInline(true);
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#16a085");
        }
    };
    Blockly.Python['kb_wifi_connect'] = function(block) {
        var ssid = Blockly.Python.valueToCode(block, 'SSID', Blockly.Python.ORDER_ATOMIC) || "''";
        var pass = Blockly.Python.valueToCode(block, 'PASSWORD', Blockly.Python.ORDER_ATOMIC) || "''";
        return `wlan = network.WLAN(network.STA_IF)\nwlan.active(True)\nwlan.connect(${ssid}, ${pass})\nwhile not wlan.isconnected(): time.sleep(0.5)\n`;
    };

    Blockly.Blocks['kb_wifi_is_connected'] = {
        init: function() {
            this.appendDummyInput().appendField("🌐 WiFi เชื่อมต่อสำเร็จหรือไม่");
            this.setOutput(true, "Boolean");
            this.setColour("#16a085");
        }
    };
    Blockly.Python['kb_wifi_is_connected'] = function(block) {
        return [`(wlan.isconnected() if 'wlan' in globals() else False)`, Blockly.Python.ORDER_ATOMIC];
    };

    Blockly.Blocks['kb_wifi_get_ip'] = {
        init: function() {
            this.appendDummyInput().appendField("🌐 อ่านค่า IP Address ของ WiFi");
            this.setOutput(true, "String");
            this.setColour("#16a085");
        }
    };
    Blockly.Python['kb_wifi_get_ip'] = function(block) {
        return [`(wlan.ifconfig()[0] if ('wlan' in globals() and wlan.isconnected()) else "0.0.0.0")`, Blockly.Python.ORDER_ATOMIC];
    };

    Blockly.Blocks['kb_http_get'] = {
        init: function() {
            this.appendValueInput("URL")
                .setCheck("String")
                .appendField("🌐 ดึงข้อมูลเว็บ (HTTP GET)");
            this.setOutput(true, "String");
            this.setColour("#16a085");
        }
    };
    Blockly.Python['kb_http_get'] = function(block) {
        var url = Blockly.Python.valueToCode(block, 'URL', Blockly.Python.ORDER_ATOMIC) || "''";
        return [`urequests.get(${url}).text`, Blockly.Python.ORDER_ATOMIC];
    };

    // --- 4.8 GPIO / Analog / Servo Blocks ---
    Blockly.Blocks['digital_write'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("ส่งสัญญาณ Digital ขา")
                .appendField(new Blockly.FieldDropdown([["OUT1 (Pin 18)", "18"], ["OUT2 (Pin 19)", "19"], ["OUT3 (Pin 23)", "23"]]), "PIN")
                .appendField("สถานะ")
                .appendField(new Blockly.FieldDropdown([["HIGH (1)", "1"], ["LOW (0)", "0"]]), "STATE");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#a5805b");
        }
    };
    Blockly.Python['digital_write'] = function(block) {
        var pin = block.getFieldValue('PIN');
        var state = block.getFieldValue('STATE');
        return `Pin(${pin}, Pin.OUT).value(${state})\n`;
    };

    Blockly.Blocks['analog_read'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("อ่านค่า Analog ขา")
                .appendField(new Blockly.FieldDropdown([["IN1 (Pin 32)", "32"], ["IN2 (Pin 33)", "33"], ["IN3 (Pin 34)", "34"], ["IN4 (Pin 35)", "35"]]), "PIN");
            this.setOutput(true, "Number");
            this.setColour("#a5805b");
        }
    };
    Blockly.Python['analog_read'] = function(block) {
        var pin = block.getFieldValue('PIN');
        return [`ADC(Pin(${pin})).read()`, Blockly.Python.ORDER_FUNCTION_CALL];
    };

    Blockly.Blocks['servo_move'] = {
        init: function() {
            this.appendDummyInput()
                .appendField("สั่งงาน Servo ขา")
                .appendField(new Blockly.FieldDropdown([["SV1 (Pin 15)", "15"], ["SV2 (Pin 17)", "17"]]), "PIN")
                .appendField("องศา (0-180)")
                .appendField(new Blockly.FieldAngle("90"), "ANGLE");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#a5805b");
        }
    };
    Blockly.Python['servo_move'] = function(block) {
        var pin = block.getFieldValue('PIN');
        var angle = block.getFieldValue('ANGLE');
        return `set_servo_angle(${pin}, ${angle})\n`;
    };
}

// ==========================================
// 5. การสร้างโค้ด MicroPython ฉบับสมบูรณ์สำหรับ KidBright32
// ==========================================
function updatePythonCode() {
    if (!workspace) return;
    var userCode = Blockly.Python.workspaceToCode(workspace);

    var headerCode = `# Code generated for KidBright32 (MicroPython)
import machine, time, network, sys, uselect
from machine import Pin, ADC, PWM, RTC, I2C
`;

    if (userCode.includes("urequests.")) {
        headerCode += `import urequests\n`;
    }

    // ประกาศฮาร์ดแวร์มาตรฐานของ KidBright32 ให้สอดคล้องกับบล็อกทั้งหมด
    headerCode += `
# --- KidBright32 Hardware Setup ---
btn1 = Pin(16, Pin.IN, Pin.PULL_UP)
btn2 = Pin(14, Pin.IN, Pin.PULL_UP)
usb_out = Pin(25, Pin.OUT)
buzzer_pwm = PWM(Pin(13), freq=1000, duty=0)
adc_light = ADC(Pin(36))
adc_light.atten(ADC.ATTN_11DB)

def set_servo_angle(pin_num, angle):
    pwm = PWM(Pin(pin_num), freq=50)
    duty = int(((max(0, min(180, angle)) / 180.0) * 2.0 + 0.5) / 20.0 * 1023)
    pwm.duty(duty)

class KidBrightDisplay:
    def __init__(self):
        self.addr = 0x70
        self.i2c = None
        for bus, scl, sda in [(0, 22, 21), (1, 5, 4)]:
            try:
                _i2c = I2C(bus, scl=Pin(scl), sda=Pin(sda), freq=400000)
                if self.addr in _i2c.scan():
                    self.i2c = _i2c
                    self.i2c.writeto(self.addr, b'\\x21')
                    self.i2c.writeto(self.addr, b'\\x81')
                    self.i2c.writeto(self.addr, b'\\xef')
                    break
            except Exception:
                pass
        self.clear()

    def show_custom(self, cols):
        if not self.i2c:
            print("[LED Matrix]:", cols)
            return
        buf = bytearray(16)
        for i in range(min(16, len(cols))):
            buf[i] = cols[i] & 0xFF
        self.i2c.writeto_mem(self.addr, 0x00, buf)

    def clear(self):
        self.show_custom([0]*16)

    def scroll(self, text):
        print("[LED Scroll]:", text)
        if self.i2c:
            # แสดงไฟวิ่งสถานะบน Matrix
            for c in range(16):
                arr = [0]*16
                arr[c] = 0x3C
                self.show_custom(arr)
                time.sleep(0.05)
            self.clear()

display = KidBrightDisplay()
ble_uart = None
`;

    // เพิ่มคลาส BLEUART เมื่อมีการใช้งานบล็อก BLE
    if (userCode.includes("BLEUART")) {
        headerCode += `
import ubluetooth
from micropython import const
_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)

class BLEUART:
    def __init__(self, name="KidBright32"):
        self._ble = ubluetooth.BLE()
        self._ble.active(True)
        self._ble.irq(self._irq)
        UART_UUID = ubluetooth.UUID("${UART_SERVICE_UUID}")
        UART_TX = (ubluetooth.UUID("${UART_TX_CHARACTERISTIC_UUID}"), ubluetooth.FLAG_NOTIFY)
        UART_RX = (ubluetooth.UUID("${UART_RX_CHARACTERISTIC_UUID}"), ubluetooth.FLAG_WRITE | ubluetooth.FLAG_WRITE_NO_RESPONSE)
        ((self._tx_handle, self._rx_handle),) = self._ble.gatts_register_services(((UART_UUID, (UART_TX, UART_RX)),))
        self._connections = set()
        self._rx_buffer = bytearray()
        adv = bytearray(b'\\x02\\x01\\x06') + bytearray((len(name)+1, 0x09)) + name.encode()
        self._ble.gap_advertise(100000, adv_data=adv)

    def _irq(self, event, data):
        if event == _IRQ_CENTRAL_CONNECT:
            self._connections.add(data[0])
        elif event == _IRQ_CENTRAL_DISCONNECT:
            self._connections.discard(data[0])
            self._ble.gap_advertise(100000)
        elif event == _IRQ_GATTS_WRITE:
            if data[1] == self._rx_handle:
                self._rx_buffer += self._ble.gatts_read(self._rx_handle)

    def is_connected(self):
        return len(self._connections) > 0

    def any(self):
        return len(self._rx_buffer)

    def read(self):
        data = bytes(self._rx_buffer).decode('utf-8', 'ignore')
        self._rx_buffer = bytearray()
        return data

    def send(self, data):
        for conn in self._connections:
            self._ble.gatts_notify(conn, self._tx_handle, data.encode())
`;
    }

    // เพิ่มระบบรับ-ส่งคำสั่งเสียง (Voice Command Runtime)
    headerCode += `
# --- Voice Command & TTS Runtime ---
_voice_last_cmd = ""
_serial_poll = uselect.poll()
_serial_poll.register(sys.stdin, uselect.POLLIN)

def voice_update():
    global _voice_last_cmd
    # 1. อ่านคำสั่งเสียงจาก USB Serial (รูปแบบ VOICE:ข้อความ)
    while _serial_poll.poll(0):
        line = sys.stdin.readline()
        if line:
            line = line.strip()
            if line.startswith("VOICE:"):
                _voice_last_cmd = line[6:].strip()
    # 2. อ่านคำสั่งเสียงจาก Bluetooth BLE
    if ble_uart and ble_uart.any():
        raw = ble_uart.read().strip()
        if raw.startswith("VOICE:"):
            _voice_last_cmd = raw[6:].strip()
        elif raw:
            _voice_last_cmd = raw

def voice_match(keyword, auto_clear=True):
    global _voice_last_cmd
    voice_update()
    kw = str(keyword).strip().lower()
    if kw and kw in _voice_last_cmd.lower():
        if auto_clear:
            _voice_last_cmd = ""
        return True
    return False

def voice_get():
    voice_update()
    return _voice_last_cmd

def voice_clear():
    global _voice_last_cmd
    _voice_last_cmd = ""

def voice_speak(text):
    msg = "TTS:" + str(text)
    print(msg)
    if ble_uart and ble_uart.is_connected():
        ble_uart.send(msg + "\\n")

# ==========================================
# โปรแกรมหลักของผู้เรียน (User Main Program)
# ==========================================
`;

    document.getElementById("pythonCodeBox").value = headerCode + userCode;
}

async function copyPythonCode() {
    var codeBox = document.getElementById("pythonCodeBox");
    try {
        await navigator.clipboard.writeText(codeBox.value);
        showVoiceBannerMessage("📋 คัดลอกโค้ด MicroPython เรียบร้อยแล้ว!");
    } catch (err) {
        codeBox.select();
        document.execCommand("copy");
        showVoiceBannerMessage("📋 คัดลอกโค้ดเรียบร้อย!");
    }
}

// ==========================================
// 6. ระบบเชื่อมต่อพอร์ต Serial (USB) แบบ 2 ทาง
// ==========================================
async function toggleUSB() {
    if (serialPort) {
        await disconnectUSB();
    } else {
        await connectUSB();
    }
}

async function connectUSB() {
    if (!("serial" in navigator)) {
        alert("⚠️ เบราว์เซอร์ของคุณไม่รองรับ Web Serial API กรุณาใช้ Google Chrome หรือ Microsoft Edge");
        return;
    }

    try {
        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: 115200 });

        serialWriter = serialPort.writable.getWriter();
        startSerialReadLoop();

        document.getElementById("usbBtn").style.backgroundColor = "#16a34a";
        document.getElementById("usbBtn").innerText = "🔌 เชื่อมต่อ USB แล้ว (คลิกตัด)";
        showVoiceBannerMessage("🟢 เชื่อมต่อบอร์ด KidBright32 ผ่าน USB เรียบร้อย!");
    } catch (err) {
        console.error("Error connecting USB:", err);
        serialPort = null;
        serialWriter = null;
        alert("❌ ไม่สามารถเชื่อมต่อ USB ได้: " + err.message);
    }
}

async function disconnectUSB() {
    serialReadLoopActive = false;
    try {
        if (serialReader) {
            await serialReader.cancel();
            serialReader.releaseLock();
            serialReader = null;
        }
        if (serialWriter) {
            serialWriter.releaseLock();
            serialWriter = null;
        }
        if (serialPort) {
            await serialPort.close();
            serialPort = null;
        }
    } catch (e) {
        console.warn("USB disconnect warning:", e);
    }
    document.getElementById("usbBtn").style.backgroundColor = "#0284c7";
    document.getElementById("usbBtn").innerText = "🔌 เสียบสาย USB";
    showVoiceBannerMessage("🔴 ตัดการเชื่อมต่อ USB แล้ว");
}

async function startSerialReadLoop() {
    if (!serialPort || !serialPort.readable) return;
    serialReadLoopActive = true;
    const decoder = new TextDecoder();

    while (serialPort && serialPort.readable && serialReadLoopActive) {
        serialReader = serialPort.readable.getReader();
        try {
            while (true) {
                const { value, done } = await serialReader.read();
                if (done) break;
                if (value) {
                    serialLineBuffer += decoder.decode(value, { stream: true });
                    let lines = serialLineBuffer.split(/\r?\n/);
                    serialLineBuffer = lines.pop();
                    for (const line of lines) {
                        handleIncomingBoardMessage(line.trim());
                    }
                }
            }
        } catch (err) {
            console.error("Serial read error:", err);
        } finally {
            try { serialReader.releaseLock(); } catch (e) {}
            serialReader = null;
        }
    }
}

// ==========================================
// 7. ระบบเชื่อมต่อไร้สาย Bluetooth (BLE) แบบ 2 ทาง
// ==========================================
async function toggleBLE() {
    if (bleDevice && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
    } else {
        await connectBLE();
    }
}

async function connectBLE() {
    if (!("bluetooth" in navigator)) {
        alert("⚠️ เบราว์เซอร์ของคุณไม่รองรับ Web Bluetooth API");
        return;
    }

    try {
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: "KidBright" }],
            optionalServices: [UART_SERVICE_UUID]
        });

        bleDevice.addEventListener('gattserverdisconnected', onBLEDisconnected);

        const server = await bleDevice.gatt.connect();
        const service = await server.getPrimaryService(UART_SERVICE_UUID);
        bleRxCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);

        // เชื่อมต่อช่องรับข้อมูลจากบอร์ด (TX Notify) สำหรับ TTS
        try {
            bleTxCharacteristic = await service.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
            await bleTxCharacteristic.startNotifications();
            bleTxCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                const text = new TextDecoder().decode(event.target.value).trim();
                handleIncomingBoardMessage(text);
            });
        } catch (e) {
            console.warn("BLE TX Notify not available:", e);
        }

        document.getElementById("bleBtn").style.backgroundColor = "#16a34a";
        document.getElementById("bleBtn").innerText = "📶 เชื่อมต่อ BLE แล้ว";
        showVoiceBannerMessage("🟢 เชื่อมต่อ Bluetooth (BLE) สำเร็จ!");
    } catch (err) {
        console.error("Error connecting BLE:", err);
        alert("❌ ไม่สามารถเชื่อมต่อ Bluetooth ได้: " + err.message);
    }
}

function onBLEDisconnected() {
    document.getElementById("bleBtn").style.backgroundColor = "#9333ea";
    document.getElementById("bleBtn").innerText = "📶 บลูทูธ (BLE)";
    bleRxCharacteristic = null;
    bleTxCharacteristic = null;
    showVoiceBannerMessage("🔴 การเชื่อมต่อ Bluetooth หลุด!");
}

// จัดการข้อความที่บอร์ดส่งกลับมา (เช่น สั่งให้เว็บพูด TTS)
function handleIncomingBoardMessage(line) {
    if (!line) return;
    console.log("[KidBright32]:", line);
    if (line.startsWith("TTS:")) {
        const textToSpeak = line.substring(4).trim();
        speakThai(textToSpeak);
        showVoiceBannerMessage(`🔊 บอร์ดพูดว่า: "${textToSpeak}"`);
    }
}

// ==========================================
// 8. ฟังก์ชันส่งโค้ดประมวลผล (Execute / Run)
// ==========================================
async function executeCode() {
    var code = document.getElementById("pythonCodeBox").value;

    if (!code || code.trim() === "") {
        alert("⚠️ กรุณาลากวางบล็อกคำสั่งก่อนส่งโค้ด!");
        return;
    }

    if (isSimMode) {
        await copyPythonCode();
        alert("🚀 คัดลอกโค้ดเรียบร้อย! กรุณานำโค้ดไปวางในหน้าต่าง Wokwi (main.py) แล้วกดปุ่ม Play สีเขียว");
        return;
    }

    if (bleRxCharacteristic) {
        try {
            await sendTextOverBLE(code + "\x04");
            showVoiceBannerMessage("🚀 ส่งโค้ดผ่าน Bluetooth ไร้สายสำเร็จ!");
            return;
        } catch (err) {
            alert("❌ ส่งโค้ดผ่าน Bluetooth ล้มเหลว: " + err.message);
            return;
        }
    }

    if (serialWriter) {
        try {
            const encoder = new TextEncoder();
            // เข้าสู่โหมด Raw REPL (\x03\x03\x01) -> ส่งโค้ด -> รัน (\x04) -> กลับ Normal REPL (\x02)
            await serialWriter.write(encoder.encode("\x03\x03"));
            await new Promise(r => setTimeout(r, 80));
            await serialWriter.write(encoder.encode("\x01"));
            await new Promise(r => setTimeout(r, 80));
            await serialWriter.write(encoder.encode(code));
            await serialWriter.write(encoder.encode("\x04"));
            await new Promise(r => setTimeout(r, 80));
            await serialWriter.write(encoder.encode("\x02"));

            showVoiceBannerMessage("🚀 ส่งโค้ดไปยังบอร์ดผ่าน USB เรียบร้อย!");
            return;
        } catch (err) {
            alert("❌ ส่งโค้ดผ่าน USB ล้มเหลว: " + err.message);
            return;
        }
    }

    alert("⚠️ กรุณาเชื่อมต่อ USB หรือ Bluetooth (BLE) ก่อนกดส่งโค้ด!");
}

async function sendTextOverBLE(text) {
    if (!bleRxCharacteristic) return;
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const chunkSize = 20;

    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        if (bleRxCharacteristic.writeValueWithoutResponse) {
            await bleRxCharacteristic.writeValueWithoutResponse(chunk);
        } else {
            await bleRxCharacteristic.writeValue(chunk);
        }
        await new Promise(r => setTimeout(r, 25));
    }
}

// ==========================================
// 9. การสลับโหมดบอร์ดจริง / โหมดจำลอง (Wokwi)
// ==========================================
function toggleMode() {
    isSimMode = !isSimMode;
    const modeBtn = document.getElementById("modeBtn");
    const simContainer = document.getElementById("simContainer");

    if (isSimMode) {
        modeBtn.innerText = "🔄 โหมด: จำลอง (Wokwi)";
        modeBtn.style.backgroundColor = "#ea580c";
        simContainer.style.display = "flex";
    } else {
        modeBtn.innerText = "🔄 โหมด: บอร์ดจริง";
        modeBtn.style.backgroundColor = "#f59e0b";
        simContainer.style.display = "none";
    }
    
    setTimeout(() => {
        Blockly.svgResize(workspace);
    }, 100);
}

// ==========================================
// 10. ระบบคำสั่งเสียง (Web Speech API & Voice Builder)
// ==========================================
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("เบราว์เซอร์นี้ไม่รองรับ SpeechRecognition");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'th-TH';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
        isVoiceListening = true;
        updateVoiceUI(true);
    };

    recognition.onresult = async (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        const displayStr = (finalTranscript || interimTranscript).trim();
        if (displayStr) {
            document.getElementById("voiceTranscriptText").innerText = `"${displayStr}"`;
        }

        if (finalTranscript.trim() !== "") {
            await processVoiceCommand(finalTranscript.trim());
        }
    };

    recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
            isVoiceListening = false;
            updateVoiceUI(false);
            alert("⚠️ กรุณาอนุญาตการใช้งานไมโครโฟนในเบราว์เซอร์เพื่อใช้ระบบคำสั่งเสียง");
        }
    };

    recognition.onend = () => {
        // เปิดการฟังต่อเนื่องอัตโนมัติหากผู้ใช้ยังไม่ได้กดปิด
        if (isVoiceListening) {
            try {
                recognition.start();
            } catch (e) {}
        } else {
            updateVoiceUI(false);
        }
    };
}

function toggleVoiceRecognition() {
    if (!recognition) {
        alert("⚠️ เบราว์เซอร์ของคุณไม่รองรับระบบรู้จำเสียงพูด กรุณาใช้ Google Chrome หรือ Microsoft Edge");
        return;
    }

    if (isVoiceListening) {
        isVoiceListening = false;
        recognition.stop();
        updateVoiceUI(false);
    } else {
        isVoiceListening = true;
        try {
            recognition.start();
        } catch (e) {
            console.warn(e);
        }
    }
}

function updateVoiceUI(active) {
    const btn = document.getElementById("voiceBtn");
    const bar = document.getElementById("voiceStatusBar");
    if (active) {
        btn.classList.add("listening");
        btn.innerText = "🎤 กำลังฟังเสียง...";
        bar.classList.add("active");
    } else {
        btn.classList.remove("listening");
        btn.innerText = "🎤 คำสั่งเสียง: ปิด";
        bar.classList.remove("active");
    }
}

function showVoiceBannerMessage(msg) {
    const bar = document.getElementById("voiceStatusBar");
    const txt = document.getElementById("voiceTranscriptText");
    bar.classList.add("active");
    txt.innerText = msg;
}

// ฟังก์ชันพูดออกเสียงภาษาไทย (Text-to-Speech)
function speakThai(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'th-TH';
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
}

// ประมวลผลคำสั่งเสียงตามโหมดที่เลือก
async function processVoiceCommand(command) {
    const mode = document.getElementById("voiceModeSelect").value;
    const cleanCmd = command.replace(/\s+/g, ' ').trim();

    if (mode === "bridge") {
        // โหมดที่ 1: ส่งคำสั่งเสียงตรงไปยังบอร์ด KidBright32
        await sendVoicePayloadToBoard(cleanCmd);
    } else {
        // โหมดที่ 2: สั่งควบคุมเว็บแอป & สร้างบล็อก Blockly อัตโนมัติ
        executeVoiceToBlockAndApp(cleanCmd);
    }
}

async function sendVoicePayloadToBoard(text) {
    const payload = `VOICE:${text}\n`;
    document.getElementById("voiceTranscriptText").innerText = `📤 ส่งคำสั่งเสียง: "${text}"`;

    if (serialWriter) {
        try {
            const encoder = new TextEncoder();
            await serialWriter.write(encoder.encode(payload));
            return;
        } catch (e) {
            console.error("Failed sending voice via USB:", e);
        }
    }

    if (bleRxCharacteristic) {
        try {
            await sendTextOverBLE(payload);
            return;
        } catch (e) {
            console.error("Failed sending voice via BLE:", e);
        }
    }

    document.getElementById("voiceTranscriptText").innerText =
        `⚠️ ได้ยินคำว่า "${text}" (กรุณาเชื่อมต่อ USB หรือ BLE เพื่อส่งเข้าบอร์ด)`;
}

// ปุ่มทดสอบส่งคำสั่งเสียง (กรณีไม่มีไมโครโฟน)
async function testVoiceCommand() {
    const sample = prompt("พิมพ์ข้อความจำลองคำสั่งเสียง (เช่น เปิดไฟ, ปิดไฟ, สวัสดี):", "เปิดไฟ");
    if (sample && sample.trim() !== "") {
        await processVoiceCommand(sample.trim());
    }
}

// สั่งสร้างบล็อกและควบคุมเว็บด้วยเสียง
function executeVoiceToBlockAndApp(cmd) {
    if (cmd.includes("ส่งโค้ด") || cmd.includes("รันโค้ด") || cmd.includes("ทำงาน")) {
        executeCode();
        speakThai("กำลังส่งโค้ดครับ");
        return;
    }
    if (cmd.includes("เชื่อมต่อยูเอสบี") || cmd.includes("เสียบสาย")) {
        connectUSB();
        return;
    }
    if (cmd.includes("เชื่อมต่อบลูทูธ")) {
        connectBLE();
        return;
    }
    if (cmd.includes("ล้างพื้นที่") || cmd.includes("ลบบล็อกทั้งหมด")) {
        workspace.clear();
        speakThai("ล้างพื้นที่ทำงานเรียบร้อยแล้ว");
        return;
    }
    if (cmd.includes("โหมดจำลอง")) {
        if (!isSimMode) toggleMode();
        speakThai("เปลี่ยนเป็นโหมดจำลองแล้วครับ");
        return;
    }
    if (cmd.includes("โหมดบอร์ดจริง")) {
        if (isSimMode) toggleMode();
        speakThai("เปลี่ยนเป็นโหมดบอร์ดจริงแล้วครับ");
        return;
    }

    // สร้างบล็อกลง Workspace อัตโนมัติ
    if (cmd.startsWith("แสดงข้อความ")) {
        const msg = cmd.replace("แสดงข้อความ", "").trim() || "Hello";
        const block = workspace.newBlock('kb_matrix_text');
        const textBlock = workspace.newBlock('text');
        textBlock.setFieldValue(msg, 'TEXT');
        textBlock.initSvg();
        textBlock.render();
        block.getInput('TEXT').connection.connect(textBlock.outputConnection);
        appendBlockToWorkspace(block);
        speakThai("เพิ่มบล็อกแสดงข้อความ " + msg);
        return;
    }

    if (cmd.includes("ล้างหน้าจอ")) {
        const block = workspace.newBlock('kb_matrix_clear');
        appendBlockToWorkspace(block);
        speakThai("เพิ่มบล็อกล้างหน้าจอ");
        return;
    }

    if (cmd.includes("เปิดเสียง")) {
        const block = workspace.newBlock('kb_buzzer');
        block.setFieldValue('1', 'STATE');
        appendBlockToWorkspace(block);
        speakThai("เพิ่มบล็อกเปิดเสียง");
        return;
    }

    if (cmd.includes("ปิดเสียง")) {
        const block = workspace.newBlock('kb_buzzer');
        block.setFieldValue('0', 'STATE');
        appendBlockToWorkspace(block);
        speakThai("เพิ่มบล็อกปิดเสียง");
        return;
    }

    if (cmd.includes("เปิดยูเอสบี") || cmd.includes("เปิดไฟ")) {
        const block = workspace.newBlock('kb_usb_output');
        block.setFieldValue('1', 'STATE');
        appendBlockToWorkspace(block);
        speakThai("เพิ่มบล็อกเปิดช่องยูเอสบี");
        return;
    }

    if (cmd.includes("ปิดยูเอสบี") || cmd.includes("ปิดไฟ")) {
        const block = workspace.newBlock('kb_usb_output');
        block.setFieldValue('0', 'STATE');
        appendBlockToWorkspace(block);
        speakThai("เพิ่มบล็อกปิดช่องยูเอสบี");
        return;
    }

    if (cmd.includes("หน่วงเวลา")) {
        const numMatch = cmd.match(/\d+/);
        const sec = numMatch ? numMatch[0] : "1";
        const block = workspace.newBlock('time_delay');
        const numBlock = workspace.newBlock('math_number');
        numBlock.setFieldValue(sec, 'NUM');
        numBlock.initSvg();
        numBlock.render();
        block.getInput('DELAY_TIME').connection.connect(numBlock.outputConnection);
        appendBlockToWorkspace(block);
        speakThai("เพิ่มบล็อกหน่วงเวลา " + sec + " วินาที");
        return;
    }

    document.getElementById("voiceTranscriptText").innerText =
        `❓ ไม่พบคำสั่งสร้างบล็อกสำหรับ "${cmd}" (ลองพูด: แสดงข้อความ..., เปิดเสียง, ปิดเสียง, หน่วงเวลา 2 วินาที)`;
}

// ฟังก์ชันต่อบล็อกใหม่เข้ากับบล็อกสุดท้ายบน Workspace
function appendBlockToWorkspace(newBlock) {
    newBlock.initSvg();
    newBlock.render();

    const topBlocks = workspace.getTopBlocks(true);
    if (topBlocks.length > 1) {
        // หาบล็อกสุดท้ายในสายโซ่แรก
        let lastBlock = topBlocks[0];
        if (lastBlock.id === newBlock.id) lastBlock = topBlocks[1];
        while (lastBlock.getNextBlock()) {
            lastBlock = lastBlock.getNextBlock();
        }
        if (lastBlock.nextConnection && newBlock.previousConnection) {
            lastBlock.nextConnection.connect(newBlock.previousConnection);
            return;
        }
    }
    newBlock.moveBy(40, 40);
}
