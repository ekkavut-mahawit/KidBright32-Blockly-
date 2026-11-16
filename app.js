// ==========================================
// 1. ตัวแปรระบบหลัก (Global Variables)
// ==========================================
let workspace = null;
let serialPort = null;
let serialWriter = null;
let bleDevice = null;
let bleCharacteristic = null;
let isSimMode = false;

const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX_CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

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
            return val.split(',').map(Number);
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
    
    window.addEventListener('resize', function() {
        Blockly.svgResize(workspace);
    });
});

// ==========================================
// 4. ตัวสร้างโค้ด MicroPython (Block Generators)
// ==========================================
function registerKidBrightBlocks() {
    
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
        return `display.scroll(${text})\n`;
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
        return [`(int((4095 - adc_light.read()) / 4095 * 100) if adc_light else 0)`, Blockly.Python.ORDER_ATOMIC];
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
        return `if 'buzzer_pwm' in globals(): buzzer_pwm.duty(${dutyVal})\n`;
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
        return `if 'buzzer_pwm' in globals(): buzzer_pwm.duty(int(max(0, min(100, ${volume})) * 10.23))\n`;
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
        return `if 'buzzer_pwm' in globals(): buzzer_pwm.freq(int(${freq}))\n`;
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
        return `print("BLE Configured:", ${name})\n`;
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
        return `if 'ble_uart' in globals() and ble_uart.is_connected(): ble_uart.send(str(${text}))\n`;
    };

    Blockly.Blocks['kb_ble_read'] = {
        init: function() {
            this.appendDummyInput().appendField("📶 อ่านข้อความจาก Bluetooth");
            this.setOutput(true, "String");
            this.setColour("#8e44ad");
        }
    };
    Blockly.Python['kb_ble_read'] = function(block) {
        return [`(ble_uart.read() if ('ble_uart' in globals() and ble_uart.any()) else "")`, Blockly.Python.ORDER_ATOMIC];
    };

    Blockly.Blocks['kb_ble_is_connected'] = {
        init: function() {
            this.appendDummyInput().appendField("📶 มีการเชื่อมต่อ Bluetooth อยู่หรือไม่");
            this.setOutput(true, "Boolean");
            this.setColour("#8e44ad");
        }
    };
    Blockly.Python['kb_ble_is_connected'] = function(block) {
        return [`(ble_uart.is_connected() if 'ble_uart' in globals() else False)`, Blockly.Python.ORDER_ATOMIC];
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
        return [`(urequests.get(${url}).text if 'urequests' in globals() else "")`, Blockly.Python.ORDER_ATOMIC];
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
// 5. การจัดการพรีวิวและคัดลอกโค้ด
// ==========================================
function updatePythonCode() {
    if (!workspace) return;
    var code = Blockly.Python.workspaceToCode(workspace);
    
    var headerCode = "# Code generated for KidBright32 (MicroPython)\n" +
                     "import machine, time, network\n" +
                     "from machine import Pin, ADC, PWM, RTC\n";
                     
    if (code.includes("urequests.")) {
        headerCode += "import urequests\n";
    }

    headerCode += "\n";
                     
    document.getElementById("pythonCodeBox").value = headerCode + code;
}

async function copyPythonCode() {
    var codeBox = document.getElementById("pythonCodeBox");
    try {
        await navigator.clipboard.writeText(codeBox.value);
        alert("📋 คัดลอกโค้ด MicroPython เรียบร้อยแล้ว!");
    } catch (err) {
        codeBox.select();
        document.execCommand("copy");
        alert("📋 คัดลอกโค้ดเรียบร้อย!");
    }
}

// ==========================================
// 6. ระบบเชื่อมต่อพอร์ต Serial (USB)
// ==========================================
async function connectUSB() {
    if (!("serial" in navigator)) {
        alert("⚠️ เบราว์เซอร์ของคุณไม่รองรับ Web Serial API กรุณาใช้ Google Chrome หรือ Microsoft Edge");
        return;
    }

    try {
        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: 115200 });
        
        const textEncoder = new TextEncoderStream();
        textEncoder.readable.pipeTo(serialPort.writable);
        serialWriter = textEncoder.writable.getWriter();

        document.getElementById("usbBtn").style.backgroundColor = "#16a34a";
        document.getElementById("usbBtn").innerText = "🔌 เชื่อมต่อ USB แล้ว";
        alert("🟢 เชื่อมต่อบอร์ด KidBright32 ผ่าน USB เรียบร้อย!");
    } catch (err) {
        console.error("Error connecting USB:", err);
        if (serialWriter) {
            try { serialWriter.releaseLock(); } catch(e){}
            serialWriter = null;
        }
        alert("❌ ไม่สามารถเชื่อมต่อ USB ได้: " + err.message);
    }
}

// ==========================================
// 7. ระบบเชื่อมต่อไร้สาย Bluetooth (BLE)
// ==========================================
async function connectBLE() {
    if (!("bluetooth" in navigator)) {
        alert("⚠️ เบราว์เซอร์ของคุณไม่รองรับ Web Bluetooth API");
        return;
    }

    try {
        console.log("กำลังค้นหาอุปกรณ์ BLE...");
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: "KidBright32" }],
            optionalServices: [UART_SERVICE_UUID]
        });

        bleDevice.addEventListener('gattserverdisconnected', onBLEDisconnected);

        const server = await bleDevice.gatt.connect();
        const service = await server.getPrimaryService(UART_SERVICE_UUID);
        bleCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);

        document.getElementById("bleBtn").style.backgroundColor = "#16a34a";
        document.getElementById("bleBtn").innerText = "📶 เชื่อมต่อ BLE แล้ว";
        alert("🟢 เชื่อมต่อ Bluetooth (BLE) สำเร็จ!");
    } catch (err) {
        console.error("Error connecting BLE:", err);
        alert("❌ ไม่สามารถเชื่อมต่อ Bluetooth ได้: " + err.message);
    }
}

function onBLEDisconnected() {
    document.getElementById("bleBtn").style.backgroundColor = "#9333ea";
    document.getElementById("bleBtn").innerText = "📶 บลูทูธ (BLE)";
    bleCharacteristic = null;
    alert("🔴 การเชื่อมต่อ Bluetooth หลุด!");
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
        alert("🚀 คัดลอกโค้ดเรียบร้อย! กรุณานำโค้ดไปวางในหน้าต่าง Wokwi เพื่อสั่งจำลองการทำงาน");
        return;
    }

    if (bleCharacteristic) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(code + "\x04"); 
            const chunkSize = 20;

            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                if (bleCharacteristic.writeValueWithoutResponse) {
                    await bleCharacteristic.writeValueWithoutResponse(chunk);
                } else {
                    await bleCharacteristic.writeValue(chunk);
                }
                await new Promise(r => setTimeout(r, 30));
            }
            alert("🚀 ส่งโค้ดผ่าน Bluetooth ไร้สายสำเร็จ!");
            return;
        } catch (err) {
            alert("❌ ส่งโค้ดผ่าน Bluetooth ล้มเหลว: " + err.message);
            return;
        }
    }

    if (serialWriter) {
        try {
            await serialWriter.write(code + "\x04");
            alert("🚀 ส่งโค้ดไปยังบอร์ดผ่าน USB เรียบร้อย!");
            return;
        } catch (err) {
            alert("❌ ส่งโค้ดผ่าน USB ล้มเหลว: " + err.message);
            return;
        }
    }

    alert("⚠️ กรุณาเชื่อมต่อ USB หรือ Bluetooth (BLE) ก่อนกดส่งโค้ด!");
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
