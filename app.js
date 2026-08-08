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
// 2. การเริ่มต้นระบบ Blockly Workspace
// ==========================================
document.addEventListener("DOMContentLoaded", function () {
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

    registerKidBrightBlocks();
    workspace.addChangeListener(updatePythonCode);
    
    window.addEventListener('resize', function() {
        Blockly.svgResize(workspace);
    });
});

// ==========================================
// 3. ตัวสร้างโค้ด MicroPython (Block Generators)
// ==========================================
function registerKidBrightBlocks() {
    
    // --- หมวดที่ 1: อุปกรณ์ในบอร์ด KidBright ---
    
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
            this.appendDummyInput().appendField("วาดรูปไฟ LED (16x8)");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour("#ff6b00");
        }
    };
    Blockly.Python['kb_matrix_draw'] = function(block) {
        return `display.show_custom()\n`;
    };

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
        return [`int((4095 - adc_light.read()) / 4095 * 100) if adc_light else 0`, Blockly.Python.ORDER_ATOMIC];
    };

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
        return `buzzer.value(${state})\n`;
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

    // --- หมวดที่ 2: เวลา & หน่วงเวลา ---
    
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

    // --- หมวดที่ 3: พอร์ตเชื่อมต่อภายนอก (GPIO) ---

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
        return [`ADC(Pin(${pin})).read()`, Blockly.Python.ORDER_ATOMIC];
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
// 4. การจัดการพรีวิวและคัดลอกโค้ด
// ==========================================
function updatePythonCode() {
    if (!workspace) return;
    var code = Blockly.Python.workspaceToCode(workspace);
    
    var headerCode = "# Code generated for KidBright32 (MicroPython)\n" +
                     "import machine, time\n" +
                     "from machine import Pin, ADC, PWM\n\n";
                     
    document.getElementById("pythonCodeBox").value = headerCode + code;
}

function copyPythonCode() {
    var codeBox = document.getElementById("pythonCodeBox");
    codeBox.select();
    document.execCommand("copy");
    alert("📋 คัดลอกโค้ด MicroPython เรียบร้อยแล้ว!");
}

// ==========================================
// 5. ระบบเชื่อมต่อพอร์ต Serial (USB)
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
        alert("❌ ไม่สามารถเชื่อมต่อ USB ได้: " + err.message);
    }
}

// ==========================================
// 6. ระบบเชื่อมต่อไร้สาย Bluetooth (BLE)
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
// 7. ฟังก์ชันส่งโค้ดประมวลผล (Execute / Run)
// ==========================================
async function executeCode() {
    var code = document.getElementById("pythonCodeBox").value;

    if (!code || code.trim() === "") {
        alert("⚠️ กรุณาลากวางบล็อกคำสั่งก่อนส่งโค้ด!");
        return;
    }

    // --- โหมดจำลอง Wokwi ---
    if (isSimMode) {
        copyPythonCode();
        alert("🚀 คัดลอกโค้ดเรียบร้อย! กรุณานำโค้ดไปวางในหน้าต่าง Wokwi เพื่อสั่งจำลองการทำงาน");
        return;
    }

    // --- โหมดการส่งผ่าน Bluetooth (BLE) ---
    if (bleCharacteristic) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(code + "\x04"); 
            const chunkSize = 20;

            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, i + chunkSize);
                await bleCharacteristic.writeValue(chunk);
                await new Promise(r => setTimeout(r, 40));
            }
            alert("🚀 ส่งโค้ดผ่าน Bluetooth ไร้สายสำเร็จ!");
            return;
        } catch (err) {
            alert("❌ ส่งโค้ดผ่าน Bluetooth ล้มเหลว: " + err.message);
            return;
        }
    }

    // --- โหมดการส่งผ่านสาย USB (Serial) ---
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
// 8. การสลับโหมดบอร์ดจริง / โหมดจำลอง (Wokwi)
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
