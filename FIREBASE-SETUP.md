# Firebase Setup (ทำครั้งเดียว)

เวอร์ชัน Angular อยู่ใน `web/` — ใช้ Firebase Realtime Database แทน server.js/Socket.io

## 1. สร้างโปรเจกต์
1. เข้า https://console.firebase.google.com > **Add project** (ปิด Analytics ได้)
2. เมนู **Build > Realtime Database > Create Database** — เลือก region `asia-southeast1` (Singapore), เริ่มแบบ locked mode
3. แท็บ **Rules** ของ Realtime Database — วางเนื้อหาไฟล์ `database.rules.json` ทั้งไฟล์ แล้ว **Publish**

## 2. เปิด Authentication
เมนู **Build > Authentication > Sign-in method** เปิด 2 ตัว:
- **Google** (สำหรับแอดมินเข้า /control และ /master)
- **Anonymous** (สำหรับผู้ชมลงคิว — จำเป็น ไม่งั้นลงคิวไม่ได้)

## 3. แอดมินคนแรก
ไม่ต้องทำอะไรใน console — **คนแรกที่ Sign in with Google ในหน้า `/control` หรือ `/master`
จะกลายเป็นแอดมินอัตโนมัติ** (rules เปิดให้เขียน `adminEmails` เฉพาะตอนที่ยังว่างเปล่า)
ฉะนั้นหลังวาง rules แล้ว ให้ login ด้วยบัญชีที่ต้องการเป็นแอดมินทันที
แอดมินคนถัดไปเพิ่มผ่านหน้า `/master` แท็บแอดมิน

## 4. ใส่ config ในแอป
1. Project settings (ไอคอนเฟือง) > **General** > Your apps > **Add app** เลือก Web (`</>`)
2. คัดลอกค่า `firebaseConfig` มาวางใน `web/src/app/firebase-config.ts`
   (ต้องมี `databaseURL` ด้วย — ถ้าไม่มีในหน้านั้น ดู URL จากหน้า Realtime Database)

## 5. รัน
```bash
cd web
npm install
npm start        # เปิด http://localhost:4200
```

- หน้าลงคิว: `http://localhost:4200/`
- หน้าควบคุม: `http://localhost:4200/control`
- Master Data: `http://localhost:4200/master`
- OBS widget: `http://localhost:4200/widget` และ `http://localhost:4200/widget-list`
