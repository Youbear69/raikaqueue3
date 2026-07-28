# Kerori Raika Web

เว็บสำหรับ VTuber "Kerori Raika" — ระบบจองคิวเล่นการ์ดเกม + สถิติ Win Rate + OBS widget อัปเดตเรียลไทม์ด้วย Firebase Realtime Database

> เวอร์ชันปัจจุบันคือ Angular ในโฟลเดอร์ `web/` — โค้ด Node/Socket.io เดิมที่ root (`server.js`, `public/`) เป็นเวอร์ชันเก่า เก็บไว้อ้างอิงเท่านั้น

---

## Stack

- **Frontend:** Angular 22 (standalone, signals, zoneless) — โฟลเดอร์ `web/`
- **Backend:** ไม่มี server ของตัวเอง ใช้ Firebase Realtime Database + Firebase Auth (Google + Anonymous)
- **Deploy:** ยังไม่ตั้งค่า รันในเครื่องด้วย `ng serve` แล้วให้ OBS ชี้ localhost

## หน้าทั้งหมด

| หน้า | ใคร | มีอะไร |
| --- | --- | --- |
| `/` | ทุกคน | Landing: hero + ตัวละคร parallax 3 ชั้น, panel Schedule Week (ดึงจากโพสต์ YouTube), คลิปล่าสุด 8 ใบ, โพสต์ล่าสุด, ยอดผู้ติดตาม/วิว/คลิป |
| `/register` | ผู้ชม | ลงคิว (anonymous ได้ ไม่ต้อง login), card Win Rate สลับดูของ Raika/ของตัวเอง, popup ยืนยัน + ข้อตกลง + เลือกแสดงรูปโปรไฟล์ |
| `/control` | แอดมิน | จัดการคิว, เลือกเกม, จำกัดคิว, ปุ่ม W/L บันทึกผลต่อคน (popup ยืนยัน + เลื่อนคิวอัตโนมัติ), card Win Rate แก้เลขได้, preview widget ทั้งสอง |
| `/master` | แอดมิน | แท็บ: รายชื่อเกม / ตั้งค่า widget / ประวัติคิว / สถิติผู้เล่น / ข้อตกลง / แอดมิน |
| `/settings` | แอดมิน | แก้ชื่อหน้า home, tagline, ข้อความ About + preview หน้า home จริงแบบย่อส่วน |
| `/widget` | OBS | แคปซูล Playing With / Next Queue (พื้นโปร่งใส) |
| `/widget-list` | OBS | ลิสต์รายชื่อคิว รองรับ `?x=&y=&w=` สำหรับ blur-follow |

navbar ทุกหน้า: dropdown ฟีเจอร์/Admin/About/ภาษา (ไทย-อังกฤษ), สวิตช์การเคลื่อนไหว / ภาพพื้นหลัง / ธีมมืด-สว่าง, ลิงก์ X · YouTube · Twitch · EasyDonate (Discord ยังไม่เปิด), ปุ่ม login Google + avatar

## เริ่มใช้งาน

1. ตั้งค่า Firebase ตามไฟล์ **[FIREBASE-SETUP.md](FIREBASE-SETUP.md)** (สร้าง RTDB, วาง rules, เปิด Google + Anonymous auth)
2. วาง web config ลง `web/src/app/firebase-config.ts` (ไฟล์นี้ถูก gitignore — มี template ที่ `firebase-config.example.ts`)
3. รัน:
   ```bash
   cd web
   npm install
   npm start        # http://localhost:4200
   ```
4. login Google ครั้งแรกที่ `/control` — **คนแรกที่ login จะเป็นแอดมินอัตโนมัติ** แอดมินคนต่อไปเพิ่มในหน้า `/master` แท็บแอดมิน

## โครงสร้างข้อมูล (RTDB)

```
queue/{id}        name, time, uid, status(waiting|playing|played), photo?, hasAccount?
settings/         activeGame, queueLimit, listOpacity, wrHidden[], showHands,
                  siteTitle?, tagline?, aboutText?
games/{id}        name
history/{id}      name, game, playedAt
winrate/{game}    win, lose                       # สถิติรวมของ Raika ต่อเกม
userStats/{uid}   name, games/{game}/{win,lose}   # สถิติผู้เล่นแต่ละคน vs Raika
terms/{id}        ข้อความข้อตกลง (แสดงใน popup ลงคิว)
adminEmails/{email-จุดแทนด้วยลูกน้ำ}
```

**สำคัญ:** ทุกครั้งที่ `database.rules.json` เปลี่ยน ต้องวางใหม่ในแท็บ Rules ของ Firebase Console เอง (ยังไม่มี CI)

## การดึงข้อมูล YouTube (ไม่ใช้ API key)

- **คลิปล่าสุด:** RSS feed ของช่องผ่าน CORS proxy (`corsproxy.io` หลัก + fallback) — พังหมดจะแสดง playlist iframe แทน
- **ยอดผู้ติดตาม/วิว/คลิป:** `api.socialcounts.org` (CORS เปิด)
- **โพสต์ / Schedule Week:** scrape หน้า `/@keroriRaika/posts` ผ่าน proxy แล้วแกะ `backstagePostRenderer` — หาโพสต์ที่มีคำว่า "ScheduleWeek" ก่อน ไม่เจอใช้โพสต์ล่าสุด
- ทั้งหมดพึ่งบริการฟรีของบุคคลที่สาม — ถ้าล่มส่วนนั้นจะซ่อนตัวเอง ไม่พังทั้งหน้า
- channel id: `UCjnKbgxO0tCXzNlSsnYjdyg`

## ตั้งค่า OBS

- Browser source ชี้ `http://localhost:4200/widget` (แคปซูล) หรือ `/widget-list` (ลิสต์) — ปุ่มคัดลอก URL อยู่ในหน้า `/control`
- สคริปต์เบลอพื้นหลังตาม widget อยู่ใน `obs-scripts/` (ดูรายละเอียดท้ายไฟล์นี้ — ของเดิมใช้ได้กับเวอร์ชันใหม่)

## Deploy (GitHub Actions -> Firebase Hosting)

Push โค้ดใน `web/` ขึ้น branch `main` หรือ `feature/angular-firebase` แล้ว GitHub Actions (`.github/workflows/build.yml`) จะ build + deploy ขึ้น `https://raikaqueue.web.app` อัตโนมัติ

ต้องมี GitHub secrets 2 ตัว (Settings > Secrets and variables > Actions):

| Secret | ค่า |
| --- | --- |
| `FIREBASE_WEB_CONFIG` | เนื้อหาไฟล์ `web/src/app/firebase-config.ts` ทั้งไฟล์ (ไฟล์นี้ gitignore เลยต้องส่งผ่าน secret) |
| `FIREBASE_SERVICE_ACCOUNT_RAIKAQUEUE` | JSON จาก Firebase Console > Project settings > Service accounts > **Generate new private key** — วางใน secret แล้วลบไฟล์ที่โหลดมาทิ้ง |

หมายเหตุ: workflow นี้ deploy เฉพาะ hosting — ถ้าแก้ `database.rules.json` ยังต้องวางในแท็บ Rules ของ console เอง (หรือ deploy ด้วย CLI ในเครื่อง)

## Gotchas

- รูปจาก Google (`googleusercontent`/`ggpht`) ต้องใส่ `referrerpolicy="no-referrer"` ไม่งั้นโหลดไม่ขึ้น
- จำกัดจำนวนคิวเช็คฝั่ง client เท่านั้น (RTDB rules นับ children ไม่ได้)
- `web/public/assets/` บางส่วนไม่อยู่ใน git (ดู `.gitignore`) — ย้ายเครื่องต้อง copy ตาม
- ห้ามใช้ service-account JSON ใน `firebase-config.ts` — ใช้ web app config เท่านั้น

---

## OBS Blur Scripts (จากเวอร์ชันเดิม ยังใช้ได้)

ติดตั้งปลั๊กอิน [obs-shaderfilter](https://obsproject.com/forum/resources/obs-shaderfilter.1736/) แล้ว:

1. คลิกขวา Source พื้นหลัง > Filters > เพิ่ม **User-defined shader** ชื่อ `BlurBehind` > โหลดไฟล์ `obs-scripts/blur-behind.shader`
2. Tools > Scripts > เพิ่ม `obs-scripts/blur-follow.lua` แล้วกรอกชื่อ widget source / background source / ชื่อ filter
3. ลาก-ย่อ widget ได้เลย กรอบเบลอตามเองภายใน ~0.2 วิ
