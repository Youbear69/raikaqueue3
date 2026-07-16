# Raika Card Queue & Widget 🐸🎮

ระบบจองคิวการ์ดเกมและแสดงผล Widget บน OBS สตรีมมิ่งแบบเรียลไทม์ผ่าน Socket.io ได้รับการดีไซน์มาเพื่อ Kerori Raika โดยเฉพาะ รองรับเกม **Cardfight Vanguard DD2** และ **Yu-Gi-Oh! Master Duel**

---

## ✨ ฟีเจอร์หลัก (Features)
- 👥 **หน้าลงทะเบียน (Queue Registration Page)**: ผู้ชมสามารถกรอกชื่อเข้าคิวได้ด้วยตนเองอย่างง่ายดาย
- 🔒 **สิทธิ์การลบคิวตัวเอง (Self-Delete)**: ปลอดภัยจากสแปม/การกลั่นแกล้ง ผู้ลงทะเบียนสามารถกดลบชื่อที่พิมพ์ผิดหรือต้องการแก้ไขของตัวเองได้เท่านั้น (ไม่สามารถลบของคนอื่นได้)
- ⚙️ **หน้าควบคุมแอดมิน (Control Panel)**: แอดมินหรือสตรีมเมอร์สามารถ:
  - สลับการแสดงผลชื่อเกมระหว่าง "Cardfight Vanguard DD2" และ "Yu-Gi-Oh! Master Duel"
  - กดปุ่มรีเซทคิวทั้งหมด `R` (พร้อมหน้าต่างยืนยันความปลอดภัยก่อนรีเซท)
  - กดปุ่มถัดไป `>` เพื่อเลื่อนคิวเล่นการ์ด
  - ลบชื่อคิวใด ๆ ก็ได้โดยตรงเพื่อดูแลความสงบเรียบร้อย
  - ตรวจสอบ Widget Preview แบบสดในหน้านั้น
- 🖥️ **OBS Widget (Widget Overlay)**: วิดเจตกรอบแคปซูลโปร่งใสสำหรับสตรีม แสดงผลเรียลไทม์
  - สีเขียวสะท้อนแสงสำหรับผู้เล่นปัจจุบัน (Playing With)
  - รายชื่อคิวรอที่ยังไม่เล่น (Next Queue) คั่นด้วย ` - `
  - มีการลดขนาดฟอนต์ของชื่ออัตโนมัติ (Dynamic Scaling) หากชื่อยาวเกินไปเพื่อไม่ให้ล้นกรอบ
  - แอนิเมชันตอนอัปเดตหรือเลื่อนคิวระดับพรีเมียม (Text slide-in + Border pulse glow)
  - **รองรับการเรียกผ่าน Local File (`file://`) และ URL เครือข่าย**
- 💾 **ระบบเซฟอัตโนมัติ (Queue Persistence)**: รายชื่อคิวจะไม่สูญหายแม้เซิร์ฟเวอร์จะปิดตัวหรือรีสตาร์ท (บันทึกลงไฟล์ `queue_db.json` ในเครื่อง) และชื่อจะค้างอยู่ในระบบเปลี่ยนสถานะเป็นสีเทาขีดฆ่าหลังเล่นเสร็จ จนกว่าจะกดรีเซทเอง

---

## 🚀 วิธีเปิดใช้งานโปรเจกต์ (Installation & Running)

1. ดาวน์โหลดหรือโคลนโปรเจกต์นี้ลงในเครื่อง
2. เปิดโปรแกรม Terminal และเข้ามายังโฟลเดอร์โปรเจกต์
3. รันคำสั่งต่อไปนี้เพื่อติดตั้ง Library และรันเซิร์ฟเวอร์:
   ```bash
   npm install
   node server.js
   ```
4. เปิดเบราว์เซอร์เพื่อเข้าใช้หน้าต่าง ๆ:
   - **หน้าลงคิว (ผู้ชม)**: `http://localhost:3000/`
   - **หน้าควบคุม (สตรีมเมอร์)**: `http://localhost:3000/control`
   - **หน้า Widget (OBS)**: `http://localhost:3000/widget`

---

## 📽️ วิธีตั้งค่าบน OBS Studio

มีวิธีตั้งค่า 2 ทางเลือก:
- **วิธีที่ 1: Browser URL (แนะนำ)**
  - เพิ่ม Source ใน OBS แบบ **Browser**
  - ตั้งชื่อเป็น `Raika Queue Widget`
  - กรอก URL: `http://localhost:3000/widget`
  - ตั้งค่า Width: `600`, Height: `350`
- **วิธีที่ 2: Local File**
  - เพิ่ม Source ใน OBS แบบ **Browser**
  - ติ๊กถูกที่ช่อง **Local file**
  - กดปุ่ม **Browse** เพื่อเลือกไฟล์ `public/widget.html` ในโฟลเดอร์นี้
  - ตั้งค่า Width: `600`, Height: `350`

---

## 📋 Widget แบบลิสต์ (List Widget)

Widget อีกแบบสำหรับ OBS แสดงเป็นกรอบรายชื่อคิว: หัวข้อ = ชื่อเกมปัจจุบัน, แต่ละแถวเป็น `ลำดับ) ชื่อ` พร้อมเวลาที่ลงคิว คนที่กำลังเล่นเป็นสีเขียวนีออน

- **URL**: `http://localhost:3000/widget-list` (มีปุ่ม **คัดลอก URL** ในหน้า `/control`)
- **ปรับความทึบพื้นหลัง**: ใช้สไลเดอร์ในหน้า `/control` (ข้างหัวข้อ list widget preview) เห็นผลทันทีทุกจอ ค่าถูกเซฟอัตโนมัติ
- **URL Parameters** (ไม่ใส่ = กลางจอ):

  | Param | ความหมาย | ตัวอย่าง |
  | ----- | -------- | -------- |
  | `x`, `y` | ตำแหน่งมุมซ้ายบนของกรอบ (พิกเซล) | `/widget-list?x=1300&y=80` |
  | `w` | ความกว้างสูงสุดของกรอบ (พิกเซล) | `/widget-list?w=450` |

---

## 🌫️ เบลอพื้นหลังหลัง Widget (Blur Behind)

`backdrop-filter` ของเว็บใช้ใน OBS ไม่ได้ (เบราว์เซอร์มองไม่เห็นฉากข้างหลัง) จึงมีสคริปต์ + shader ให้ในโฟลเดอร์ `obs-scripts/` ทำให้กรอบเบลอ **ลากตาม widget อัตโนมัติ**

### สิ่งที่ต้องติดตั้ง
- ปลั๊กอิน [obs-shaderfilter](https://obsproject.com/forum/resources/obs-shaderfilter.1736/)

### ขั้นตอน
1. **ใส่ filter ที่พื้นหลัง**: คลิกขวา Source พื้นหลัง > **Filters** > เพิ่ม **User-defined shader** ตั้งชื่อ `BlurBehind`
2. ติ๊ก **Load shader text from file** แล้วเลือกไฟล์ `obs-scripts/blur-behind.shader`
3. **เพิ่มสคริปต์**: เมนู **Tools > Scripts** > กด **+** เลือกไฟล์ `obs-scripts/blur-follow.lua` แล้วกรอก:
   - **Widget source name** = ชื่อ Browser source ของ widget (พิมพ์ให้ตรงเป๊ะ)
   - **Background source name** = ชื่อ Source พื้นหลัง
   - **Blur filter name** = `BlurBehind`
4. ลาก/ย่อ/ขยาย widget ในจอ preview ได้เลย กรอบเบลอจะตามเองภายใน ~0.2 วินาที
5. ปรับความแรงเบลอ มุมมน ขอบฟุ้ง ได้ในหน้า Filters (`Blur strength`, `Corner radius`, `Edge feather`)

### เคล็ดลับ
- ตั้ง Width/Height ของ Browser source ให้พอดีกับ widget (เช่น `620x220`) เพราะกรอบเบลอ = กรอบของ source ทั้งก้อน
- **พื้นหลังหลายชั้น** (ภาพ + มาสคอต ฯลฯ): สร้าง Scene ใหม่ (เช่น `BG`) ย้าย source พวกนั้นเข้าไป แล้วเอา scene `BG` มาวางเป็น source ใน scene หลัก ใส่ filter ที่ `BG` แทน — ทุกอย่างข้างในโดนเบลอพร้อมกัน (ใช้ Group ก็ได้ แต่ถ้ามี source ยื่นออกนอกจอ ตำแหน่งเบลอจะเพี้ยน แนะนำ Scene ซ้อนมากกว่า)
- สคริปต์ใช้กับปลั๊กอิน [Composite Blur](https://obsproject.com/forum/resources/composite-blur.1780/) ก็ได้: เพิ่ม filter Composite Blur ตั้ง Effect Mask = `Crop` แล้วชี้ Blur filter name ไปที่ชื่อ filter นั้น
- ถ้าลากแล้วเบลอไม่ตาม กดปุ่ม **Log filter settings (debug)** ในหน้า Scripts เพื่อดูชื่อ property จริงของปลั๊กอินเวอร์ชันที่ใช้

---

## 📂 โครงสร้างไฟล์ (Project Directory)
- `server.js` - โค้ด Backend จัดการระบบคิวและเชื่อมต่อ Socket.io
- `public/` - หน้าจอการทำงานหลักของเบราว์เซอร์
  - `index.html` - หน้าเพจลงคิวสำหรับผู้ชม
  - `control.html` - หน้าเพจแผงควบคุมสตรีมเมอร์
  - `widget.html` - หน้าเพจ Overlay แสดงบนสตรีมโปร่งใส
  - `style.css` - สไตล์การตกแต่ง สีสัน และแอนิเมชัน
  - `client.js` / `control.js` / `widget.js` - สคริปต์ความต้องการการอัปเดตเรียบลไทม์
  - `widget-list.html` / `widget-list.js` / `list-widget.js` - Widget แบบลิสต์และตัว render ที่ใช้ร่วมกัน
  - `assets/` - ไฟล์รูปประกอบฉากของ Kerori Raika
- `obs-scripts/` - สคริปต์และ shader สำหรับเบลอพื้นหลังใน OBS
  - `blur-follow.lua` - สคริปต์ OBS ให้กรอบเบลอลากตาม widget อัตโนมัติ
  - `blur-behind.shader` - Shader เบลอเฉพาะกรอบมุมมนสำหรับ obs-shaderfilter
