// =========================================================================
// 💡 1. JAVASCRIPT HOOK: สลับคลาสเพื่อแสดงผลจุดไฟ LED สีแดง (Dot Matrix)
// =========================================================================
if (typeof Blockly !== 'undefined' && Blockly.FieldCheckbox) {
    const originalSetValue = Blockly.FieldCheckbox.prototype.setValue;
    Blockly.FieldCheckbox.prototype.setValue = function(newValue) {
        originalSetValue.call(this, newValue);
        const rootNode = this.getSvgRoot ? this.getSvgRoot() : this.fieldGroup_;
        if (rootNode) {
            const isTrue = (this.getValue() === 'TRUE' || newValue === true || newValue === 'TRUE');
            if (isTrue) {
                rootNode.classList.add('led-on');
            } else {
                rootNode.classList.remove('led-on');
            }
        }
    };
}

// =========================================================================
// 🧩 2. นิยามบล็อกคำสั่ง (Block Definitions) สำหรับ KidBright32
// =========================================================================

Blockly.Blocks['kb_matrix_draw'] = {
    init: function() {
        this.appendDummyInput().appendField("🎨 วาดรูปบนจอ Matrix (16x8)");
        for (let row = 0; row < 8; row++) {
            let input = this.appendDummyInput();
            for (let col = 0; col < 16; col++) {
                input.appendField(new Blockly.FieldCheckbox("FALSE"), `LED_${row}_${col}`);
            }
        }
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(20);
        this.setTooltip("คลิกจุดไฟ LED เพื่อวาดรูป");
    }
};

Blockly.Blocks['kb_matrix_text'] = {
    init: function() {
        this.appendDummyInput().appendField("📺 แสดงข้อความบน Matrix");
        this.appendValueInput("TEXT").setCheck("String");
        this.setInputsInline(true);
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(20);
    }
};

Blockly.Blocks['kb_read_button'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("🔘 สถานะปุ่ม")
            .appendField(new Blockly.FieldDropdown([["Switch 1", "16"], ["Switch 2", "14"]]), "BTN");
        this.setOutput(true, "Boolean");
        this.setColour(45);
    }
};

Blockly.Blocks['kb_read_light'] = {
    init: function() {
        this.appendDummyInput().appendField("☀️ ความสว่างแสง (LDR)");
        this.setOutput(true, "Number");
        this.setColour(45);
    }
};

Blockly.Blocks['kb_buzzer'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("🔊 เสียง Buzzer ความถี่")
            .appendField(new Blockly.FieldDropdown([["ปิดเสียง", "0"], ["440 Hz (A4)", "440"], ["1000 Hz", "1000"], ["2000 Hz", "2000"]]), "FREQ");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(20);
    }
};

Blockly.Blocks['kb_usb_output'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("🔌 สวิตช์พอร์ต USB OUT")
            .appendField(new Blockly.FieldDropdown([["เปิด (ON)", "1"], ["ปิด (OFF)", "0"]]), "STATE");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(20);
    }
};

Blockly.Blocks['time_delay'] = {
    init: function() {
        this.appendValueInput("DELAY_TIME")
            .setCheck("Number")
            .appendField("⏱️ หน่วงเวลา (วินาที)");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(210);
    }
};

Blockly.Blocks['digital_write'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("⚡ ส่งสัญญาณออก (Digital)")
            .appendField("พอร์ต Pin")
            .appendField(new Blockly.FieldDropdown([["IN/OUT 1 (Pin 18)", "18"], ["IN/OUT 2 (Pin 19)", "19"], ["IN/OUT 3 (Pin 23)", "23"]]), "PIN")
            .appendField("สถานะ")
            .appendField(new Blockly.FieldDropdown([["เปิด (HIGH)", "1"], ["ปิด (LOW)", "0"]]), "STATE");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(120);
    }
};

Blockly.Blocks['analog_read'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("📈 อ่านค่าเซนเซอร์ (Analog)")
            .appendField(new Blockly.FieldDropdown([["IN 1 (Pin 36)", "36"], ["IN 2 (Pin 39)", "39"], ["IN 3 (Pin 34)", "34"]]), "PIN");
        this.setOutput(true, "Number");
        this.setColour(45);
    }
};

Blockly.Blocks['servo_move'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("🤖 หมุนเซอร์โว (Servo)")
            .appendField(new Blockly.FieldDropdown([["OUT 1 (Pin 18)", "18"], ["OUT 2 (Pin 19)", "19"]]), "PIN")
            .appendField("มุม (0-180°)")
            .appendField(new Blockly.FieldNumber(90, 0, 180), "ANGLE");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(120);
    }
};

// =========================================================================
// 🐍 3. ตัวแปลโค้ด MicroPython (Python Generators)
// =========================================================================

Blockly.Python['kb_matrix_draw'] = function(block) {
    let bytes = [];
    for (let col = 0; col < 16; col++) {
        let colVal = 0;
        for (let row = 0; row < 8; row++) {
            let isChecked = block.getFieldValue(`LED_${row}_${col}`) === 'TRUE';
            if (isChecked) {
                colVal |= (1 << row);
            }
        }
        bytes.push('0x' + colVal.toString(16).padStart(2, '0'));
    }
    return `display.draw_raw(bytes([${bytes.join(', ')}]))\n`;
};

Blockly.Python['kb_matrix_text'] = function(block) {
    let text = Blockly.Python.valueToCode(block, 'TEXT', Blockly.Python.ORDER_ATOMIC) || "''";
    return `display.scroll(${text})\n`;
};

Blockly.Python['kb_read_button'] = function(block) {
    let pin = block.getFieldValue('BTN');
    return [`(Pin(${pin}, Pin.IN).value() == 0)`, Blockly.Python.ORDER_RELATIONAL];
};

Blockly.Python['kb_read_light'] = function(block) {
    return [`ADC(Pin(36)).read()`, Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python['kb_buzzer'] = function(block) {
    let freq = block.getFieldValue('FREQ');
    if (freq === "0") {
        return `PWM(Pin(25), freq=1000, duty=0)\n`;
    }
    return `PWM(Pin(25), freq=${freq}, duty=512)\n`;
};

Blockly.Python['kb_usb_output'] = function(block) {
    let state = block.getFieldValue('STATE');
    return `Pin(27, Pin.OUT).value(${state})\n`;
};

Blockly.Python['time_delay'] = function(block) {
    let delayTime = Blockly.Python.valueToCode(block, 'DELAY_TIME', Blockly.Python.ORDER_ATOMIC) || '1';
    return `time.sleep(${delayTime})\n`;
};

Blockly.Python['digital_write'] = function(block) {
    let pin = block.getFieldValue('PIN');
    let state = block.getFieldValue('STATE');
    return `Pin(${pin}, Pin.OUT).value(${state})\n`;
};

Blockly.Python['analog_read'] = function(block) {
    let pin = block.getFieldValue('PIN');
    return [`ADC(Pin(${pin})).read()`, Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python['servo_move'] = function(block) {
    let pin = block.getFieldValue('PIN');
    let angle = Number(block.getFieldValue('ANGLE'));
    let duty = Math.floor(26 + (angle / 180) * 102);
    return `PWM(Pin(${pin}), freq=50, duty=${duty})\n`;
};

// =========================================================================
// 🚀 4. เริ่มต้นระบบ Blockly
// =========================================================================

let workspace = null;
let serialPort = null;
let bleDevice = null;
let bleCharacteristic = null;
let currentMode = 'board';

window.addEventListener('DOMContentLoaded', () => {
    workspace = Blockly.inject('blocklyDiv', {
        toolbox: document.getElementById('toolbox'),
        scrollbars: true,
        zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 2, minScale: 0.4 },
        grid: { spacing: 20, length: 3, colour: '#ccc', snap: true }
    });

    workspace.addChangeListener(() => {
        let code = Blockly.Python.workspaceToCode(workspace);
        document.getElementById('pythonCodeBox').value = code || "# ลากบล็อกมาวางเพื่อสร้างโค้ด...";
    });
});

// =========================================================================
// 🔌 5. ระบบเชื่อมต่อ USB & Bluetooth BLE (เสถียร ไม่หลุดง่าย)
// =========================================================================

async function connectUSB() {
    if (!('serial' in navigator)) {
        alert("เบราว์เซอร์นี้ไม่รองรับ Web Serial กรุณาใช้ Google Chrome หรือ Edge");
        return;
    }
    try {
        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: 115200 });
        const btn = document.getElementById('usbBtn');
        if (btn) {
            btn.style.backgroundColor = '#16a34a';
            btn.innerText = '🔌 USB: เชื่อมต่อแล้ว';
        }
        alert('เชื่อมต่อบอร์ด KidBright32 ผ่าน USB สำเร็จ!');
    } catch (err) {
        console.error("USB Error:", err);
    }
}

async function connectBLE() {
    if (!('bluetooth' in navigator)) {
        alert("เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth กรุณาใช้ Chrome หรือแอป Bluefy บน iOS");
        return;
    }
    try {
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'KidBright' }, { namePrefix: 'ESP32' }],
            optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e']
        });

        bleDevice.addEventListener('gattserverdisconnected', onBLEDisconnected);

        const server = await bleDevice.gatt.connect();
        const service = await server.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
        bleCharacteristic = await service.getCharacteristic('6e400002-b5a3-f393-e0a9-e50e24dcca9e');

        const btn = document.getElementById('bleBtn');
        if (btn) {
            btn.style.backgroundColor = '#16a34a';
            btn.innerText = '📶 BLE: เชื่อมต่อแล้ว';
        }
        alert('เชื่อมต่อ KidBright32 ผ่านบลูทูธไร้สายสำเร็จ!');
    } catch (err) {
        console.error("BLE Connect Error:", err);
        alert('❌ เชื่อมต่อ Bluetooth ล้มเหลว: ' + err.message);
    }
}

function onBLEDisconnected() {
    bleCharacteristic = null;
    const btn = document.getElementById('bleBtn');
    if (btn) {
        btn.style.backgroundColor = '#9333ea';
        btn.innerText = '📶 บลูทูธ (BLE)';
    }
    alert('⚠️ สัญญาณ Bluetooth หลุดการเชื่อมต่อ กรุณากดเชื่อมต่อใหม่อีกครั้ง');
}

async function sendBLEPayload(payload) {
    if (!bleCharacteristic) throw new Error("ไม่ได้เชื่อมต่อ BLE");

    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const chunkSize = 20;

    for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        if (bleCharacteristic.writeValueWithResponse) {
            await bleCharacteristic.writeValueWithResponse(chunk);
        } else if (bleCharacteristic.writeValueWithoutResponse) {
            await bleCharacteristic.writeValueWithoutResponse(chunk);
        } else {
            await bleCharacteristic.writeValue(chunk);
        }
        await new Promise(resolve => setTimeout(resolve, 40));
    }
}

async function executeCode() {
    let rawCode = Blockly.Python.workspaceToCode(workspace);
    if (!rawCode.trim()) {
        alert("กรุณาลากบล็อกคำสั่งวางบนพื้นที่ทำงานก่อนส่งโค้ด");
        return;
    }

    let header = "from machine import Pin, ADC, PWM\nimport time, display\n";
    let fullCode = header + rawCode;

    if (currentMode === 'sim') {
        alert("โหมดจำลอง (Wokwi): คัดลอกโค้ดไปวางเรียบร้อยแล้ว");
        copyPythonCode();
        return;
    }

    const replPayload = "\x03\x03\x01" + fullCode + "\x04";

    if (serialPort && serialPort.writable) {
        try {
            const writer = serialPort.writable.getWriter();
            const encoder = new TextEncoder();
            await writer.write(encoder.encode(replPayload));
            writer.releaseLock();
            alert("🚀 ส่งโค้ดผ่าน USB เรียบร้อย!");
            return;
        } catch (err) {
            alert("❌ ส่งข้อมูลผ่าน USB ล้มเหลว: " + err.message);
            return;
        }
    }

    if (bleCharacteristic) {
        try {
            await sendBLEPayload(replPayload);
            alert("🚀 ส่งโค้ดผ่าน Bluetooth ไร้สายเรียบร้อย!");
            return;
        } catch (err) {
            alert("❌ ส่งข้อมูลผ่าน BLE ล้มเหลว: " + err.message);
            return;
        }
    }

    alert("กรุณาเสียบสาย USB หรือเชื่อมต่อ Bluetooth BLE ก่อนส่งโค้ดครับ");
}

function toggleMode() {
    const sim = document.getElementById('simContainer');
    const btn = document.getElementById('modeBtn');
    
    if (currentMode === 'board') {
        currentMode = 'sim';
        sim.style.display = 'flex';
        btn.innerText = '🔄 โหมด: จำลอง (Wokwi)';
        btn.style.backgroundColor = '#8b5cf6';
    } else {
        currentMode = 'board';
        sim.style.display = 'none';
        btn.innerText = '🔄 โหมด: บอร์ดจริง';
        btn.style.backgroundColor = '#f59e0b';
    }
    window.dispatchEvent(new Event('resize'));
}

async function copyPythonCode() {
    const codeBox = document.getElementById('pythonCodeBox');
    try {
        await navigator.clipboard.writeText(codeBox.value);
        alert('คัดลอกโค้ด MicroPython เรียบร้อยแล้ว!');
    } catch (err) {
        codeBox.select();
        document.execCommand('copy');
        alert('คัดลอกโค้ดเรียบร้อยแล้ว!');
    }
}
