# Solar Sales ROI Helper — Design Doc (v2)

> **เป้าหมาย**: เครื่องมือช่วยเซลล์โทรคุยลูกค้า → ค้นหาความต้องการ → คำนวณ ROI → **เปรียบเทียบ** ระบบ Solar ที่มี → แนะนำสินเชื่อ → นำเสนอ "ยอดผ่อนสุทธิหลังหักประหยัดค่าไฟ" ให้ลูกค้าตัดสินใจ
> **สถานะ**: v2 — รับ feedback รอบที่ 1 แล้ว
> **Stack**: ต่อยอดจาก Google Apps Script + Google Sheets + Bootstrap (เดิม) — Font Krub
> **ไม่อยู่ใน scope รอบนี้**: Lead tab, Quotation prefill/linking, LINE OA

## Changelog v1 → v2

- ✂ **ตัด** การเชื่อมไปทำใบเสนอราคา (ทำแยกไปก่อน กันพัง)
- ✂ **ตัด** Lead tab — โปรไฟล์ลูกค้าเหลือแค่ "เลขที่ - ชื่อ" + เฟส (default 1 เฟส)
- ✂ **ตัด** การ enrich `solar_products` (รอ IT ดึงให้); ใช้เฉพาะ kw + price + battery_kwh + phase + self_consume
- ✂ **ตัด** Recommend rule แบบ rule-table → เปลี่ยนเป็น **System Comparison** คำนวณทุกระบบที่มี แล้ว highlight ตัวที่เหมาะที่สุด
- ✂ **ตัด** ค่าเปลี่ยนแบตปี 11 (เซลล์ไม่ทราบต้นทุน)
- ✂ **ตัด** Tornado/Sensitivity chart ในขั้น presentation (เข้าใจยาก)
- ➕ **เพิ่ม** ราคา Solar **แก้ไขได้** ในขั้นเปรียบเทียบระบบ (ลูกค้าขอเพิ่ม/ปรับราคากะทันหัน)
- ➕ **เพิ่ม** Wizard สลับขั้นไปมาได้ (non-linear) — คลิกที่ progress step ได้เลย
- ➕ **เพิ่ม** Financing rank แบบเลือกได้: Net monthly (default), ดอกถูก, ยอดผ่อนต่ำ, รวมดอกถูกสุด
- ➕ **เพิ่ม** Presentation นำด้วย **"ยอดผ่อนสุทธิ/เดือน หลังหักประหยัด"**
- ➕ **เพิ่ม** ดึง MRR/MLR จาก BOT Open API
- ➕ **เพิ่ม** PWA manifest + Add-to-Home-Screen สำหรับใช้บนมือถือ
- ➕ **เพิ่ม** ส่วนกลยุทธ์ลด GAS execution-timeout

---

## 0. ภาพรวม / สรุปข้อตัดสินใจสำคัญ

| หัวข้อ | ตัดสินใจ | เหตุผล |
|---|---|---|
| รูปแบบ UI | Wizard 7 ขั้น (มี progress bar) + **คลิกข้าม step ได้** + Tab ใหม่ใน Index.html | เซลล์ทำตามได้ขณะโทร แต่ถ้าลูกค้าโดดไปคุยขั้นอื่นก่อน เซลล์สลับได้ |
| Decision node การถามไฟ | "รู้สัดส่วน / ไม่รู้" → ถ้าไม่รู้ไปสายเครื่องใช้ไฟฟ้า | ลูกค้าจริงตอบไม่ได้บ่อย — Tip #1 ของคุณ |
| ตารางสินเชื่อ | แยก 2 ชีต `financing_plan` (parent) + `financing_rate_tier` (child) | รองรับ teaser rate (ปีแรก 0.99% ปีถัดไป 4.99%) |
| System "เลือกอย่างไร" | **คำนวณทุกระบบที่มี แสดงเป็นตารางเทียบกัน** + highlight ตัวที่เหมาะ | ตามที่คุณเสนอ — เซลล์เห็นภาพรวม ลูกค้าเลือกได้เอง; ไม่ต้องมี rule table maintenance |
| ROI math | ยกสูตรจาก `Solar_ROI_Calculator_v3.xlsx` มาเขียนใน JS, **ไม่บวกค่าเปลี่ยนแบต** | เซลล์ไม่ทราบต้นทุน ไม่ใส่ดีกว่ามั่ว |
| ขายไฟคืน FiT | เป็น checkbox optional (default = ปิด) | Tip #5 — เปิดเฉพาะบางพื้นที่ |
| ลดหย่อนภาษี 200k | เป็น flag ใน `financing_plan` (`tax_deduction_eligible`) + checkbox ในขั้นแนะนำสินเชื่อ | Tip #4 |
| Financing rank | เลือกได้: **Net (default)** / ดอกถูก / ยอดผ่อนต่ำ / ยอดดอกรวมต่ำ | ตามที่คุณเสนอ — เซลล์ปรับมุมขายตามลูกค้า |
| Presentation นำด้วย | **"ยอดผ่อน − ประหยัด − ขายคืน = สุทธิ/เดือน"** | ตัวเลขที่ขายได้จริง |
| ใบเสนอราคา | **ไม่เชื่อมในรอบนี้** | ทำแยกไปก่อน กันพัง |
| Mobile | PWA (manifest + add-to-home-screen) | GAS HtmlService ทำ native app ไม่ได้; PWA คือทางที่ใกล้สุด |

---

## 1. User Flow (Sales-rep journey)

> **Non-linear**: เซลล์คลิกที่ step บน progress bar กระโดดไปกลับได้ทุกขั้นที่กรอกข้อมูลแล้ว ค่าทุกอย่าง autosave

```
┌──────────────────────────────────────────────┐
│  ROI HELPER WIZARD   (Tab ใหม่ใน Index.html) │
│                                              │
│  1. โปรไฟล์ลูกค้า  (สั้น)                    │
│     • เลขที่บ้าน-ชื่อ                          │
│       เช่น "87/75 - ว่าที่ร้อยตรี ธนวัฒน์      │
│              ยุบลเขตร์"                        │
│     • เฟสไฟ: ⦿ 1 เฟส (default)  ○ 3 เฟส     │
│     • เขตการไฟฟ้า (auto จาก IP/ ค่าเริ่มต้น    │
│       MEA แก้ได้)                              │
│                                              │
│  2. ค่าไฟ Anchor                             │
│     • ค่าไฟ/เดือน (บาท)  ──▶ infer kWh จาก   │
│       ตาราง tariff อัตโนมัติ                  │
│     • หรือ ระบุ kWh/เดือนตรง ๆ               │
│                                              │
│  3. 🚦 Decision: รู้สัดส่วนกลางวัน/คืนไหม?    │
│     ├── รู้ ──▶ 3A. กรอกสัดส่วน (slider %    │
│     │           หรือ kWh กลางวัน/คืน)         │
│     └── ไม่รู้ ──▶ 3B. Appliance Picker      │
│                     - เลือกจาก preset        │
│                     - ใส่จำนวน + ชม.กลางวัน │
│                       /กลางคืน                │
│                     - ระบบรวมเป็น kWh        │
│                     - ⚠ เตือนถ้าต่างจากบิล   │
│                       เกิน 30%                │
│                                              │
│  4. Options การคำนวณ                         │
│     ☐ คิดรวมขายคืน FiT (2.2 ฿/หน่วย)         │
│     ☐ ลูกค้ามี Solar เดิมอยู่แล้ว             │
│        (→ ดูเฉพาะ Scale-Up)                  │
│     ▶ Assumption ขั้นสูง (collapsible):      │
│         PSH, PR, deg, escalation, etc.       │
│                                              │
│  5. 📊 System Comparison                     │
│     ตารางเทียบ "ทุกระบบที่มี" ในชั้น          │
│     solar_products พร้อมตัวเลขสำคัญ:         │
│                                              │
│     ┌─ ระบบ ─┬ kWp ┬ ราคา ┬ ผลิต ┬ ใช้เอง ┬─┐│
│     │ 5 kWp on-grid │ 5 │127k│7,391│2,880│  ││
│     │ 7 kWp + แบต   │ 7 │273k│10,3.│5,902│✅││
│     │ 3 kWp on-grid │ 3 │ 95k│4,435│2,400│  ││
│     │ 10 kWp + แบต  │10 │371k│ 14k │5,902│  ││
│     └────────────────┴───┴────┴─────┴─────┴─┘│
│                                              │
│     คอลัมน์: ผลิต/ปี, ใช้เอง/ปี, ขายคืน/ปี,    │
│              ค่าไฟสุทธิ/ปี, ประหยัด/ปี,         │
│              Payback, NPV 25 ปี                │
│     • highlight: ตัวที่ "ผลิต ≈ ใช้กลางวัน"    │
│       หรือ NPV สูงสุด                          │
│     • ⏷ ขยายแถวเห็น breakdown energy flow    │
│     • ✏ **ราคาแก้ไขได้ทันที** (กรณีลูกค้า     │
│       ขอเพิ่ม/ส่วนลด) — auto recompute        │
│     • ✏ ใส่ "ระบบ custom" ที่ไม่มีในชั้น      │
│       (kWp, ราคา, มี/ไม่มีแบต)                │
│     • เซลล์เลือก 1 ระบบ ──▶ ขั้น 6           │
│                                              │
│  6. 💳 Financing Guide                       │
│     ❓ ถามลูกค้า 3 คำถาม:                    │
│       • อยากลดหย่อนภาษีไหม?                  │
│       • มีบ้านเป็นชื่อตัวเอง พร้อมใช้ค้ำ?      │
│       • เงินดาวน์ที่จ่ายได้ (% หรือ ฿)         │
│                                              │
│     ▶ จัดอันดับด้วยตัวเลือก (เซลล์เลือก):     │
│       ⦿ ยอดผ่อนสุทธิต่ำสุด                    │
│         (= ผ่อน − ประหยัดค่าไฟ − ขายคืน)      │
│         (default)                              │
│       ○ ดอกเบี้ยถูกที่สุด (rate ปัจจุบัน)      │
│       ○ ยอดผ่อน/เดือนต่ำที่สุด (ยังไม่หัก)    │
│       ○ ยอดดอกเบี้ยรวมตลอดสัญญาต่ำสุด          │
│                                              │
│     ▶ ตารางผ่อน Top 5 แบบ:                   │
│       ผ่อน/ด • ประหยัด/ด • **สุทธิ/ด** •     │
│       ดอกรวม • ระยะ • หมายเหตุ                │
│                                              │
│  7. 📺 Presentation Mode (full-screen)       │
│     Hero ใหญ่สุด:                            │
│     ┌──────────────────────────────────┐   │
│     │  ผ่อนสุทธิเดือนละ                  │   │
│     │      ┏━━━━━━━━┓                    │   │
│     │      ┃  640 ฿  ┃    /เดือน          │   │
│     │      ┗━━━━━━━━┛                    │   │
│     │  (ค่าผ่อน 2,500 − ประหยัด 1,860)    │   │
│     └──────────────────────────────────┘   │
│     ตามด้วย:                                  │
│       • ประหยัด 25 ปี (รวม ฿)                │
│       • Payback (ปี)                          │
│       • กราฟ cumulative cashflow              │
│       • ตารางผ่อน 12 เดือนแรก                │
└──────────────────────────────────────────────┘
```

> **ไม่มีขั้น 8 (save & next)** อีกแล้ว — autosave ทุกขั้น; ปุ่ม "บันทึก/ปิด" อยู่บน sticky bar; ยังไม่ส่งต่อไป Quotation ในรอบนี้

### 1.1 หลักการ UX ที่ยึด (สำหรับผู้ใช้คนไทย)

1. **ภาษาคน ไม่ใช่ภาษาวิศวกร** — "ผลิตไฟได้กี่หน่วย" ไม่ใช่ "พลังงานที่ผลิต (kWh)"
2. **ตัวเลขใหญ่ ๆ ในผลลัพธ์** — เซลล์อ่านขณะคุยโทรศัพท์ต้องเห็นชัด
3. **ปุ่มสำคัญใต้นิ้วโป้ง** — mobile-first; "ถัดไป" / "บันทึก" อยู่ด้านล่างหน้าจอ
4. **บันทึกอัตโนมัติทุกขั้น** — เซลล์อาจวางสายแล้วกลับมาทำต่อ → ใช้ debounce 2 วินาที sync ไป Sheet
5. **เซลล์ไม่ต้องคำนวณเอง** — ทุกเลขโดยระบบ; เซลล์แค่ป้อนข้อเท็จจริง
6. **ฟอนต์ Krub** (Google Fonts, รองรับไทย/อังกฤษ) — สะอาดตา อ่านง่าย ใช้น้ำหนัก 400/500/700
   ```css
   @import url('https://fonts.googleapis.com/css2?family=Krub:wght@400;500;600;700&display=swap');
   body { font-family: 'Krub', sans-serif; }
   ```
7. **Color coding ที่คนไทยเข้าใจตรงกัน** — เขียว=ดี/คุ้ม, ส้ม=ปานกลาง, แดง=ระวัง
8. **สลับ step ไปมาได้** — progress bar เป็นคลิกได้; ทุก step ที่กรอกแล้วจะ "checked" และคลิกกลับไปแก้ได้ทันที
9. **โหมดนำเสนอ (presentation mode)** ขั้น 7 — ขยายตัวเลข ปิด UI เซลล์ ใช้แชร์หน้าจอกับลูกค้าได้

### 1.2 Decision Node ละเอียด (Tip #1)

```
Q: "คุณลูกค้าทราบไหมว่าใช้ไฟกลางวันคิดเป็นเท่าไหร่"

├── "ทราบสัดส่วน X%"     → กรอก % กลางวัน
├── "ทราบ kWh กลางวัน/คืน" → กรอก kWh ทั้งสองช่วง
├── "ไม่ทราบ ขอประเมินจากเครื่องใช้ไฟฟ้า"
│      → Appliance Picker:
│         เพิ่ม row: [แอร์ 12000 BTU] x [2] × [กลางวัน 8 ชม.] × [กลางคืน 10 ชม.]
│         เพิ่ม row: [ตู้เย็น 8.9 คิว] x [1] × [กลางวัน 12 ชม.] × [กลางคืน 12 ชม.]
│         ...
│         ระบบคำนวณ kWh กลางวัน, kWh กลางคืน, kWh รวม
│         เปรียบเทียบกับ kWh จากบิล:
│           • ภายใน ±30% → ใช้ % เฉลี่ย
│           • ต่างเกิน 30% → ⚠ แจ้งเซลล์ "ตรวจสอบอีกครั้ง" + ให้เลือกใช้ค่าไหน
└── "ขอใช้ค่ามาตรฐาน (40% กลางวัน)"  → fallback
```

---

## 2. Database Design (Google Sheets)

> ทุก sheet ใช้ Google Sheet ในไฟล์เดียวกับระบบเดิม (ไฟล์ที่ Code.gs ผูกอยู่)
> **Convention**: คอลัมน์ `*_id` คือ PK, `*_id_fk` คือ FK; วันเวลา ISO 8601; เปอร์เซ็นต์เก็บเป็นทศนิยม (0.05 = 5%)

### 2.1 sheet `solar_products` — **ใช้ schema เดิมจาก `package_ex.xlsx`** (ไม่ขยาย)

> รอ IT ดึงให้ในอนาคต — ไม่ต้องกรอกเพิ่ม

| column | type | example | note |
|---|---|---|---|
| product_id | string | SOLAR-0001 | PK |
| name | string | Solar Rooftop 5 kWp | |
| type | enum | on-grid / hybrid / scale-up | |
| kw | number | 5 | |
| price | number | 127000 | **รวม VAT แล้ว** (ตามคำตอบจาก feedback) |
| battery_kwh | number | 0 / 9.6 | |
| electric_phase | enum | 1 / 3 | |
| self_consume | number | 0.55 | hint การใช้เอง (engine จะคำนวณจริงจาก energy flow อยู่แล้ว — field นี้ใช้แค่ fallback) |
| status | enum | active / inactive | |

> **เปลี่ยนวิธีคิด**: เลิกพึ่ง recommend rule per product — ใช้ **System Comparison** (ข้อ 4) แทน
> สำหรับ "ระบบ custom" ที่ลูกค้าขอเฉพาะ → เซลล์เพิ่มเป็น ad-hoc ในขั้น 5 (ไม่บันทึกลง `solar_products`)

### 2.2 sheet `appliance_preset` — ใหม่

ใช้ใน Appliance Picker (Decision branch "ไม่รู้")

| column | type | example | note |
|---|---|---|---|
| appliance_id | string | APL-0001 | PK |
| name_th | string | แอร์ 12000 BTU | |
| name_en | string | AC 12000 BTU | |
| category | enum | cooling / refrigeration / kitchen / entertainment / pump / lighting / it / other | |
| default_watts | number | 1200 | กำลังไฟปกติ |
| watt_options | string | "900,1200,1500,1800" | ทางเลือกถ้ารุ่น/ขนาดต่างกัน |
| inverter | boolean | TRUE | แอร์ inverter ใช้ไฟน้อยกว่า — adjust factor |
| typical_day_hours | number | 4 | |
| typical_night_hours | number | 8 | |
| typical_duty_cycle | number | 0.6 | สำหรับเครื่องที่ on/off เป็นรอบ (ตู้เย็น/แอร์); kWh = W × hr × duty |
| notes | string | | |
| status | enum | active / inactive | |

**Seed list (ตัวอย่างเริ่มต้น ~25 รายการ):**
แอร์ 9000/12000/18000/24000 BTU (inverter/ปกติ), ตู้เย็น 6/8.9/12/15 คิว, ทีวี 32"/43"/55"/65" (LED/OLED), พัดลม, ไมโครเวฟ, เตาอบ, เครื่องซักผ้า ฝาบน/หน้า, เครื่องอบผ้า, เครื่องทำน้ำอุ่น, ปั๊มน้ำ, ตู้น้ำเย็น, คอมพิวเตอร์ตั้งโต๊ะ, โน้ตบุ๊ก, หลอด LED, เครื่องชาร์จ EV (ที่บ้าน)

### 2.3 sheet `electricity_tariff` — ใหม่

ตารางค่าไฟแบบขั้นบันได ใช้ infer kWh จากค่าไฟ และคำนวณค่าไฟเฉลี่ย

| column | type | example | note |
|---|---|---|---|
| tariff_id | string | MEA-1.1.1 | PK |
| authority | enum | MEA / PEA | |
| tariff_code | string | 1.1.1 / 1.1.2 / 1.2.1 / 1.3 | ประเภทผู้ใช้ |
| label_th | string | บ้านอยู่อาศัย (ไม่เกิน 150 หน่วย) | |
| from_kwh | number | 0 | ขั้น from (inclusive) |
| to_kwh | number | 15 | ขั้น to (inclusive) — 999999 = unlimited |
| rate_per_kwh | number | 2.3488 | ฿/หน่วย ที่ขั้นนี้ |
| ft_charge | number | 0.3672 | Ft ปัจจุบัน (เปลี่ยนทุก 4 เดือน) |
| service_charge | number | 8.19 | ค่าบริการรายเดือน |
| effective_date | date | 2025-01-01 | |
| status | enum | active / inactive | |

> **อัลกอริทึม "บิล → kWh"**: bisection หา kWh ที่ทำให้ progressive_bill(kWh, tariff) + service + Ft × kWh ≈ ค่าไฟที่ลูกค้าแจ้ง

### 2.4 sheet `financing_plan` — ออกแบบใหม่ (แทนของเดิม)

| column | type | example | note |
|---|---|---|---|
| plan_id | string | PLN-2025-001 | PK |
| bank_code | string | ICBC / BBL / KTC / CASH | |
| bank_label_th | string | ธนาคาร ICBC (ไทย) | |
| product_name_th | string | สินเชื่อ Solar 0.99% ปีแรก 5 ปี | ชื่อแผนที่เซลล์เห็น |
| campaign_code | string | SRI001 | ภายในของธนาคาร |
| financing_type | enum | cash / personal_loan / home_equity / credit_card_installment / green_loan | |
| rate_type | enum | flat / reducing | (flat = อัตราคงที่, reducing = ลดต้นลดดอก) |
| rate_basis | enum | fixed / reference | reference = ผูกกับ MRR/MLR/EIR |
| rate_reference | string | "MRR-1.00" | ใช้ตอน basis=reference; ระบบ resolve จาก `rate_benchmark` |
| term_min_months | number | 12 | ระยะผ่อนต่ำสุดที่ใช้ได้ |
| term_max_months | number | 240 | ระยะผ่อนสูงสุดที่ใช้ได้ |
| term_step_months | number | 12 | เพิ่มทีละ (12, 24, 36, 48, ...) |
| price_min | number | 0 | วงเงินกู้ขั้นต่ำ |
| price_max | number | 2000000 | วงเงินกู้ขั้นสูง |
| down_percent_options | string | "0,0.1,0.15,0.2,0.25" | CSV ของดาวน์ที่ยอมรับ |
| processing_fee | number | 0 | ค่าธรรมเนียม |
| monthly_fee | number | 0 | ค่าบริการรายเดือน (ถ้ามี) |
| tax_deduction_eligible | boolean | TRUE | เข้าเงื่อนไขลดหย่อน 200k หรือไม่ |
| requires_collateral | boolean | TRUE | ต้องใช้บ้านค้ำหรือไม่ |
| requires_fire_insurance | boolean | TRUE | บังคับทำประกันอัคคีภัย |
| requires_credit_card_of_bank | boolean | FALSE | สำหรับผ่อนบัตรเครดิต = ต้องมีบัตรของแบงค์นั้น |
| recommend_tags | string | "ดอกถูก,ลดหย่อนภาษี,ผ่อนยาว" | CSV — ใช้ rank ในขั้นแนะนำ |
| guide_question_hint_th | string | "ถามลูกค้าว่ามีบ้านเป็นชื่อตัวเอง พร้อมใช้ค้ำหรือไม่" | hint แสดงให้เซลล์ |
| note_th | string | ทำพร้อมประกันอัคคีภัย | หมายเหตุที่จะไปอยู่ใต้การ์ด |
| status | enum | active / inactive | |
| effective_from | date | | |
| effective_to | date | | |

### 2.5 sheet `financing_rate_tier` — ใหม่ (child ของ `financing_plan`)

หัวใจของการรองรับ **อัตราดอกเบี้ยไม่คงที่**

| column | type | example | note |
|---|---|---|---|
| tier_id | string | TIR-PLN-2025-001-01 | PK |
| plan_id | string | PLN-2025-001 | FK → financing_plan |
| applies_to_term_months | string | "60,72,84" / "*" | CSV ของ term หรือ `*` = ทุก term |
| applies_to_down_percent | string | "0.1,0.15" / "*" | CSV ของ down% หรือ `*` |
| from_month | number | 1 | เดือนที่เริ่มใช้ rate นี้ |
| to_month | number | 12 | เดือนที่สิ้นสุด rate นี้ (inclusive) |
| rate_type_override | enum | flat / reducing / null | ปกติ null = ตาม parent; ถ้าระบุจะ override |
| rate_value | number | 0.0099 | annual rate (decimal) |
| reference_offset | number | -0.01 | ใช้ตอน parent.rate_basis=reference (เช่น MRR-1.00 = MRR + (-0.01)) |
| sequence | number | 1 | ลำดับ tier ในแผน |
| note_th | string | "ปีที่ 1: 0.99%" | |

**ตัวอย่างที่ทำได้ทันที:**

```
[ค่าเดิม flat 7.39% 60 เดือน]
  plan_id=PLN-001 rate_type=flat rate_basis=fixed
  tier 1: term=60, month 1-60, rate=0.0739

[Teaser: 0.99% 12 เดือนแรก, 1.5% เดือนที่เหลือ]
  plan_id=PLN-NEW-01 rate_type=flat rate_basis=fixed
  tier 1: term=60, month 1-12, rate=0.0099
  tier 2: term=60, month 13-60, rate=0.015

[Teaser: 0.99% 3 เดือนแรก, 9.99% เดือนที่เหลือ — บัตรเครดิต]
  plan_id=PLN-NEW-02 rate_type=flat rate_basis=fixed
  tier 1: term=24, month 1-3, rate=0.0099
  tier 2: term=24, month 4-24, rate=0.0999

[Home Equity MRR-1.00 ทั้งสัญญา 20 ปี]
  plan_id=PLN-2025-BBL rate_type=reducing rate_basis=reference rate_reference=MRR-1.00
  tier 1: term=*, month 1-240, reference_offset=-0.01
  (คำนวณตอน runtime: rate = benchmark.MRR + (-0.01))

[Step rate: 3 ปีแรก fixed 4.5%, ปี 4+ MRR-0.50]
  plan_id=PLN-2025-HYBRID rate_type=reducing rate_basis=fixed
  tier 1: term=240, month 1-36, rate=0.045
  tier 2: term=240, month 37-240, reference_offset=-0.005
    (rate_type=reducing inherited; basis ผสมได้ผ่าน per-tier override ถ้าจำเป็น)
```

### 2.6 sheet `rate_benchmark` — ใหม่

| column | type | example | note |
|---|---|---|---|
| benchmark_code | string | MRR / MLR / MOR / EIR-BBL | PK |
| value | number | 0.0660 | annual decimal |
| effective_date | date | 2025-04-01 | |
| source | string | BOT / BBL website | |
| status | enum | active / archived | |

> เมื่อแก้ MRR ปรับครั้งเดียว แผนทั้งหมดที่อ้างอิงจะอัพเดททันที

### 2.7 sheet `roi_assumption` — ใหม่

ค่าตั้งต้นสำหรับ ROI engine — สามารถ override ต่อ region ได้

| column | type | example | note |
|---|---|---|---|
| assumption_id | string | DEFAULT | PK; "DEFAULT" หรือชื่อจังหวัด/ภาค |
| region | string | กลาง / เหนือ / อีสาน / ใต้ / DEFAULT | |
| peak_sun_hours | number | 4.5 | ชม./วัน |
| performance_ratio | number | 0.85 | (Excel ใช้ 0.9 — เราลดเป็น 0.85 ตามมาตรฐานวิจัย) |
| panel_degradation_yr | number | 0.005 | 0.5%/ปี |
| system_life_yr | number | 25 | |
| battery_dod | number | 0.9 | |
| battery_round_trip | number | 0.92 | |
| battery_life_yr | number | 10 | |
| battery_replacement_cost_factor | number | 0.7 | **ใหม่** — เปลี่ยนแบตปีที่ 11 ราคา = ราคาแบตปัจจุบัน × 0.7 (ราคาแบตจะถูกลง) |
| electricity_escalation_yr | number | 0.03 | |
| discount_rate | number | 0.05 | สำหรับ NPV |
| fit_price | number | 2.20 | ฿/kWh |
| maintenance_yr | number | 3500 | ฿/ปี |
| vat_rate | number | 0.07 | ใช้ในใบเสนอราคา |
| status | enum | active / inactive | |

### 2.8 ~~sheet `recommend_rule`~~ — **ตัดออก**

> เปลี่ยนเป็น System Comparison (ทุกระบบที่มี) + Financing rank (มี algorithm คงที่ในโค้ด) — ไม่ต้องมีตารางกฎให้ maintenance

### 2.9 sheet `roi_session` — ใหม่ (heart of the helper) — **simplified**

แต่ละครั้งที่เซลล์ใช้ Wizard = 1 row

| column | type | example | note |
|---|---|---|---|
| session_id | string | ROI-2025-0001 | PK |
| created_by | string | sales user email | |
| created_at | datetime | | |
| last_updated | datetime | | |
| status | enum | draft / presented / closed | autosave; เซลล์ปิดเองได้ |
| customer_label | string | "87/75 - ว่าที่ร้อยตรี ธนวัฒน์ ยุบลเขตร์" | "เลขที่ - ชื่อ" ตามที่กำหนด |
| phase | enum | 1 / 3 | default 1 |
| authority | enum | MEA / PEA | default MEA |
| tariff_id | string | MEA-1.1.2 | infer จาก kWh |
| monthly_bill | number | 4500 | บาท |
| monthly_kwh | number | 850 | infer หรือเซลล์ใส่ |
| day_fraction | number | 0.45 | infer หรือ จาก appliance |
| day_kwh | number | 382.5 | |
| night_kwh | number | 467.5 | |
| usage_source | enum | direct_fraction / direct_kwh / appliance_picker / default | |
| include_fit | boolean | FALSE | |
| existing_solar | boolean | FALSE | |
| assumption_id_fk | string | DEFAULT | |
| selected_product_id_fk | string | SOLAR-0002 / `CUSTOM` | เลือกจาก comparison table หรือใส่เอง |
| selected_kw | number | 5 | snapshot (กรณี custom หรือเซลล์แก้ราคา) |
| selected_price | number | 127000 | snapshot (เพราะแก้ไขได้ใน UI) |
| selected_battery_kwh | number | 0 / 9.6 | snapshot |
| selected_payback_yr | number | 5.5 | คำนวณตอน save |
| selected_npv25 | number | 198769 | |
| annual_saving_yr1 | number | 22884 | self-consume saving + FiT (ถ้าเปิด) |
| selected_plan_id_fk | string | PLN-2025-001 | |
| selected_term_months | number | 60 | |
| selected_down_percent | number | 0.10 | |
| selected_rank_strategy | enum | net / lowest_rate / lowest_monthly / lowest_total_interest | ที่เซลล์เลือกใน step 6 |
| monthly_installment | number | 2500 | |
| monthly_saving | number | 1900 | ประหยัด/เดือน (annual_saving_yr1 / 12) |
| monthly_net | number | 600 | = monthly_installment − monthly_saving (ตัวเลข hero ใน presentation) |
| total_interest | number | 35000 | |
| notes | string | | บันทึกเซลล์ (free text) |

> **ตัดออกแล้ว**: `lead_id_fk`, `customer_name`, `customer_phone`, `customer_province`, `customer_type`, `recommended_kw`, `recommended_type`, `*_case2` columns (ไม่ทำ 2-case compare อัตโนมัติแล้ว — compare table ทำหน้าที่นี้), `quotation_id_fk`, `next_followup_date`, `presentation_url`

### 2.10 sheet `roi_session_appliance` — ใหม่ (child)

| column | type | example | note |
|---|---|---|---|
| row_id | string | RSA-... | PK |
| session_id_fk | string | ROI-2025-0001 | |
| appliance_id_fk | string | APL-0001 | nullable (อาจเป็นรายการ custom) |
| custom_name | string | "ตู้แช่ลังของร้าน" | กรณีไม่มีใน preset |
| quantity | number | 2 | |
| watts | number | 1200 | |
| day_hours | number | 8 | |
| night_hours | number | 10 | |
| inverter | boolean | TRUE | |
| duty_cycle | number | 0.6 | |
| kwh_day_per_month | number | (computed) | |
| kwh_night_per_month | number | (computed) | |

### 2.11 sheet `solar_zone_fit` — ใหม่ (optional, สำหรับ Tip #5)

พื้นที่ที่เปิดโครงการขายไฟคืน — เปิดให้กรอก zip code / จังหวัด

| column | type | example |
|---|---|---|
| zone_id | string | FIT-2025-001 |
| province | string | กรุงเทพมหานคร |
| district | string | (optional) |
| authority | enum | MEA / PEA |
| fit_program | string | Solar ภาคประชาชน 2025 |
| quota_status | enum | open / full / closed |
| fit_price | number | 2.20 |
| effective_from | date | |
| effective_to | date | |

### 2.12 sheet `tax_incentive` — ใหม่ (Tip #4)

| column | type | example |
|---|---|---|
| incentive_id | string | TAX-2025-SOLAR |
| name_th | string | ลดหย่อนภาษี ติดตั้ง Solar (สูงสุด 200,000 บาท) |
| max_deduction | number | 200000 |
| eligibility_note_th | string | "ต้องกู้กับสถาบันการเงินที่ร่วมโครงการ" |
| effective_from | date | |
| effective_to | date | |

---

## 3. ROI Calculation Engine (สูตร)

> ยกจาก `Solar_ROI_Calculator_v3.xlsx` มาเขียนใน GAS server-side (และ duplicate ใน JS client-side สำหรับ live preview)

### 3.1 Inputs (จาก `roi_session` + `roi_assumption` + `solar_products`)

| symbol | source | desc |
|---|---|---|
| `kWp` | product.kw | ขนาดระบบ |
| `P_solar` | product.price | ราคา Solar |
| `kWh_batt` | product.battery_kwh | ความจุแบต |
| `P_batt` | derive | ราคาแบต = product.price − ราคา on-grid เทียบขนาดเดียวกัน (หรือเก็บแยกในตารางใหม่) |
| `PR` | assumption.performance_ratio | 0.85 |
| `PSH` | assumption.peak_sun_hours | 4.5 |
| `deg` | assumption.panel_degradation_yr | 0.005 |
| `life` | assumption.system_life_yr | 25 |
| `DoD` | assumption.battery_dod | 0.9 |
| `RT` | assumption.battery_round_trip | 0.92 |
| `life_b` | assumption.battery_life_yr | 10 |
| `K_brepl` | assumption.battery_replacement_cost_factor | 0.7 |
| `monthly_kWh` | session.monthly_kwh | |
| `day_frac` | session.day_fraction | |
| `P_elec` | average of tariff | ฿/หน่วย |
| `esc` | assumption.electricity_escalation_yr | 0.03 |
| `P_fit` | assumption.fit_price | 2.20 |
| `M_main` | assumption.maintenance_yr | 3500 |
| `disc` | assumption.discount_rate | 0.05 |

### 3.2 Daily energy flow

```
solar_daily   = kWp × PSH × PR
total_daily   = monthly_kWh × 12 / 365
day_daily     = total_daily × day_frac
night_daily   = total_daily × (1 − day_frac)
```

**Case 1 (no battery):**
```
self_d  = MIN(solar_daily, day_daily)
sell_d  = MAX(0, solar_daily − day_daily)
buy_d   = night_daily + MAX(0, day_daily − solar_daily)
```

**Case 2 (with battery):**
```
excess_d  = MAX(0, solar_daily − day_daily)
charge_d  = MIN(excess_d, kWh_batt × DoD)
sell_d    = MAX(0, excess_d − kWh_batt × DoD)
batt_out  = charge_d × RT
buyN_d    = MAX(0, night_daily − batt_out)
buyD_d    = MAX(0, day_daily − solar_daily)
buy_d     = buyN_d + buyD_d
self_d    = MIN(solar_daily, day_daily) + batt_out
```

### 3.3 Annual cashflow (n = 1..life)

```
solar_yr(n)   = solar_daily × (1 − deg)^(n−1) × 365
self_yr(n)    = self_d(n) × 365
sell_yr(n)    = (include_fit ? sell_d(n) × 365 : 0)
saving(n)     = self_yr(n) × P_elec × (1 + esc)^(n−1)
                + sell_yr(n) × P_fit
CF(n)         = saving(n) − M_main
                − (n == 1 ? P_solar : 0)
```

> ตามที่ตกลง: **ไม่บวกค่าเปลี่ยนแบตปีที่ 11** เพราะเซลล์ไม่ทราบต้นทุน → ใช้สูตรเดียวกับ Excel เดิม
> ราคา `P_solar` รวมแบตอยู่แล้ว (ตาม `solar_products.price` ของรุ่น hybrid) ตามคำตอบ open question

### 3.4 KPI

```
Cumulative(n) = Σ CF(1..n)
Payback       = interpolate ปีที่ Cumulative ตัด 0
NPV(disc)     = Σ CF(n) / (1+disc)^n
IRR           = solve CF for NPV=0  (Newton's method)
```

### 3.5 ค่าไฟเฉลี่ย (จาก tariff progressive)

ใช้เมื่อต้อง infer หรือต้องโชว์ "ราคาต่อหน่วยเฉลี่ย" ในการนำเสนอ
```
avg_rate(kWh) = bill(kWh, tariff) / kWh
```

### 3.6 ค่างวด (engine สำหรับ tiered rates)

```pseudo
function calcInstallment(principal, downPct, plan, tiers, termMonths):
    loan = principal × (1 − downPct)
    schedule = []
    if plan.rate_type == "flat":
        # weighted by tier months
        total_interest = 0
        for tier in tiers where applies(termMonths):
            r = resolveTierRate(tier)   # absolute or benchmark + offset
            months = tier.to_month − tier.from_month + 1
            # flat: interest per month = loan × r / 12
            total_interest += loan × r / 12 × months
        principal_per_month = loan / termMonths
        # but with stepped rate, monthly installment varies per tier:
        for tier in tiers:
            r = resolveTierRate(tier)
            interest_per_month = loan × r / 12
            installment = principal_per_month + interest_per_month
            for m in tier.from_month..tier.to_month:
                schedule.push({m, principal_per_month, interest_per_month, installment})
    else:  # reducing
        balance = loan
        for m in 1..termMonths:
            tier = findTierForMonth(m, tiers, termMonths)
            r = resolveTierRate(tier) / 12
            interest = balance × r
            # equal-installment recompute when tier boundary crossed, else level payment within tier
            remaining_months_in_tier = tier.to_month − m + 1
            # use PMT for remaining months at current rate (recompute on tier change)
            installment = pmt(r, remaining_months_in_tier, balance)
            principal_paid = installment − interest
            balance -= principal_paid
            schedule.push({m, principal_paid, interest, installment, balance})
    return { schedule, totalInterest: sum(interest), avgInstallment: mean(installment) }
```

### 3.7 ขนาดระบบที่แนะนำ

```
target_day_daily = day_daily   # อยากผลิตให้พอใช้กลางวัน
target_kWp_raw   = target_day_daily / (PSH × PR)
# ปัดขึ้นเป็นขนาดที่มีจริงในร้าน (3, 5, 7, 10)
rec_kWp = ceilToAvailableSize(target_kWp_raw)
```

---

## 4. Comparison & Ranking Logic

### 4.1 System Comparison (แทน Recommendation engine เดิม)

**กฎเดียว**: คำนวณ ROI กับทุกแถวใน `solar_products` ที่ `status=active` (filter ด้วย `electric_phase` ของลูกค้า + filter `type=scale-up` เฉพาะถ้า `existing_solar=true`)
แสดงเป็น **ตารางเปรียบเทียบ** + รองรับ "ระบบ custom" (กรอกเอง)

**คอลัมน์ในตาราง:**

| คอลัมน์ | สูตร | หมายเหตุ |
|---|---|---|
| name | `solar_products.name` | |
| kWp | `solar_products.kw` | |
| มีแบต | `battery_kwh > 0 ? "มี (xx kWh)" : "ไม่มี"` | |
| ราคา (รวม VAT) | `solar_products.price` | ✏ **แก้ไขได้ inline** — เซลล์กรอกราคาคร่าวๆ ได้ |
| ผลิตไฟ/ปี | `solar_daily × 365` (kWh) | ปีแรก (deg=1) |
| ใช้เอง/ปี | `self_d × 365` (kWh) | จาก daily energy flow case ของรุ่นนั้น |
| เข้าแบต/ปี | `case 2 ? batt_out × 365 : 0` | (kWh) |
| ขายคืน/ปี | `include_fit ? sell_d × 365 : 0` | (kWh) |
| ค่าไฟสุทธิ/ปี | `(buy_d × 365) × P_elec` | ค่าไฟที่ยังต้องจ่ายให้การไฟฟ้า |
| ประหยัด/ปี | `self_yr × P_elec + sell_yr × P_fit` | (฿/ปี) |
| Payback | (จาก cumulative cashflow) | ปี |
| NPV 25 ปี | `Σ CF(n)/(1+disc)^n` | (฿) |

**Highlight (อัตโนมัติ — ไม่ใช่ recommend แต่เป็นไฮไลต์ดู):**
- 🏆 **NPV 25 ปี สูงสุด** = ดาวน์เด่นในตาราง (badge "คุ้มสุด")
- ⚡ **Payback สั้นสุด** = badge "คืนทุนเร็ว"
- 💡 **ผลิต ≈ ใช้กลางวัน (±15%)** = badge "size พอดี"

(แต่ละการ์ด/แถวอาจติด 0-3 badge — เซลล์เลือกเอง)

**ระบบ Custom:**
- เซลล์กดปุ่ม "เพิ่มระบบ custom" → กรอก: ชื่อระบบ, kWp, ราคา, มี/ไม่มีแบต + kWh
- ระบบคำนวณคอลัมน์อื่นให้
- ใช้เมื่อ: ลูกค้าขอแบตเพิ่มขึ้น/ลด, ส่วนลดพิเศษ, ระบบที่ไม่อยู่ในชั้น

### 4.2 Financing Rank (เลือก strategy ได้)

หลังถาม 3 คำถาม (ลดหย่อนภาษี / บ้านค้ำได้ / ดาวน์) → filter plan ที่ feasible:
- filter `price_min ≤ loan ≤ price_max`
- filter `down_percent_options` มี % ที่เลือกหรือไม่
- filter `tax_deduction_eligible` ถ้าลูกค้าอยากลดหย่อน
- filter `requires_collateral=FALSE` ถ้าลูกค้าไม่มีบ้านค้ำ
- filter `requires_credit_card_of_bank` (off ถ้าไม่มี)

**Rank strategy (เซลล์เลือก radio):**

| Strategy | sort by | เมื่อไรใช้ |
|---|---|---|
| **Net monthly (default)** | `monthly_net = monthly_installment − (annual_saving_yr1 / 12)` asc | "ผ่อนสบาย หักประหยัดแล้วเหลือเดือนละ N" — ขายดี |
| Lowest rate | weighted avg rate ของ tier ทั้งสัญญา, asc | ลูกค้าซีเรียสเรื่องดอก |
| Lowest monthly | `monthly_installment` asc (ค่าผ่อนเดือนแรก) | ลูกค้าเงินสดน้อย — เน้น cashflow ปัจจุบัน |
| Lowest total interest | `total_interest` asc | ลูกค้าคำนวณรวมจ่ายตลอดสัญญา |

ผลลัพธ์: top 5 แสดงในการ์ด

**ในแต่ละการ์ดแสดง:**
- ชื่อแบงค์ + ชื่อแผน
- ผ่อน/เดือน (เด่น) — ถ้า teaser แสดง "ปีแรก X, ปีถัดไป Y"
- ประหยัดค่าไฟ/เดือน
- **สุทธิ/เดือน** (สีเขียวถ้า ≤ 0 แดงถ้าสูง)
- ดอกเบี้ยรวมตลอดสัญญา
- ระยะผ่อน
- 🏷 tag: "ลดหย่อนภาษี" / "ดอกถูกสุด" / "เบาสุด"
- ปุ่ม [ ดูตารางผ่อน 12 เดือนแรก ]

---

## 5. UI / Tab Design

### 5.1 โครงสร้าง Tab ที่เสนอ (Index.html)

| Tab | id | บทบาท | สถานะ |
|---|---|---|---|
| ⚡ ROI Helper | `roi-tab` | Wizard 7 ขั้น (หัวใจของ feature นี้) | **ใหม่ (focus MVP)** |
| 📋 Booking | `booking-tab` | ใบจอง — ตามเดิม | เดิม (ไม่แตะ) |
| 📄 Quotation | `quotation-tab` | ใบเสนอราคา — ตามเดิม | เดิม (ไม่แตะ — ทำแยกภายหลัง) |
| 📚 Library | `library-tab` | ดู Packages / Financing / Appliances / Tariff (read-only) | ใหม่ (phase 2) |

> **MVP รอบนี้**: ROI Helper เท่านั้น
> Pipeline / Lead tab — **ไม่ทำ** (ตามคำขอ)
> Quotation — **ไม่เชื่อม** (กันพัง)
> Library — phase 2; ระหว่างนี้ admin/เซลล์ดูตรงใน Google Sheet ได้

### 5.2 หน้า ROI Helper Wizard (รายละเอียด)

**Layout (mobile-first, font Krub):**

```
┌─────────────────────────────────────┐
│ ROI Helper                  💾 Save │   ← sticky top
├─────────────────────────────────────┤
│ ① ─ ② ─ ③ ─ ④ ─ ⑤ ─ ⑥ ─ ⑦          │   ← clickable steps
│  ✓    ✓   ●                          │     ✓ = done, ● = current
├─────────────────────────────────────┤
│                                     │
│  รู้สัดส่วนการใช้ไฟกลางวันไหมครับ?    │   ← H1 ใหญ่ (24-28pt)
│                                     │
│  ┌───────────────────────────────┐  │
│  │ 🌞 ทราบสัดส่วน %              │  │   ← option card
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ 🔢 ทราบ kWh กลางวัน/คืน        │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ 🔌 ไม่ทราบ ขอประเมินจาก        │  │   ← เมื่อกด จะเปิด appliance picker
│  │    เครื่องใช้ไฟฟ้า              │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ ⏭ ใช้ค่ามาตรฐาน (40% กลางวัน) │  │
│  └───────────────────────────────┘  │
│                                     │
├─────────────────────────────────────┤
│   [ ← ขั้นก่อน ]   [ ขั้นถัดไป → ]   │   ← sticky bottom
└─────────────────────────────────────┘
```

**Step bar behavior:**
- step ใดมีข้อมูลครบขั้นต่ำ → ติด ✓ และคลิกได้
- step ที่ยังไม่ผ่าน → คลิกได้เช่นกัน (เพราะเซลล์อาจอยากกระโดดไปดูก่อน) แต่จะมี hint "ข้อมูลขั้น X ยังไม่ครบ"
- เมื่อแก้ค่าในขั้นก่อนหน้า → flag "ต้องคำนวณซ้ำ" ขั้นหลัง ๆ (แต่ค่าที่เซลล์ใส่ manual เช่น ราคาที่แก้ จะไม่ถูก reset)

**หน้า Appliance Picker (step 3B):**

```
┌─────────────────────────────────────┐
│  ใส่เครื่องใช้ไฟฟ้าที่บ้านลูกค้า     │
│                                     │
│  ┌─ แอร์ 12000 BTU (inverter) ─┐    │
│  │  จำนวน [2] × วัน [8]ชม. คืน[10]ชม.│ │
│  │  ≈ 432 kWh/เดือน               │  │   ← compute live
│  └────────────────────────── 🗑 ┘   │
│  ┌─ ตู้เย็น 8.9 คิว ────────────┐    │
│  │  จำนวน [1] × วัน [12] คืน[12]  │  │
│  │  ≈ 60 kWh/เดือน                │  │
│  └────────────────────────── 🗑 ┘   │
│                                     │
│  [ + เพิ่มเครื่องใช้ไฟฟ้า ]          │
│                                     │
│  ───────────────────────────────    │
│  รวม: 492 kWh/เดือน                │
│      กลางวัน 42% / กลางคืน 58%      │
│                                     │
│  ⚠ ลูกค้าแจ้งบิล 4,500 ฿ ≈ 850 kWh │   ← warning เมื่อต่างเกิน 30%
│     ต่างจากที่คำนวณ 42%             │
│     กดเลือก: ใช้ตามบิล / ตาม        │
│     เครื่องใช้ / เฉลี่ย              │
└─────────────────────────────────────┘
```

**หน้า System Comparison (step 5):**

```
┌──────────────────────────────────────────────────────┐
│  📊 เทียบระบบทั้งหมด                                  │
│                                                      │
│  ┌──────┬───┬────┬──────┬──────┬─────┬─────┬──────┐│
│  │ระบบ  │kWp│แบต │ราคา ✏│ผลิต/ │ใช้เอง│ขายคืน│Payback││
│  │      │   │    │      │ปี    │/ปี  │/ปี   │       ││
│  ├──────┼───┼────┼──────┼──────┼─────┼─────┼──────┤│
│  │3 kWp │ 3 │ -  │95,000│4,435 │2,400│2,035│ 6.0🏆│   ← Payback สั้นสุด
│  │5 kWp │ 5 │ -  │127k  │7,391 │2,880│4,511│ 5.5🏆│   ← NPV สูงสุด, size พอดี
│  │7+9.6 │ 7 │9.6 │273k  │10,348│5,902│1,226│ 5.8  │
│  │10 kWp│10 │ -  │219k  │14,782│2,880│11,9k│ 7.2  │
│  │10+9.6│10 │9.6 │355k  │14,782│5,902│5,604│ 6.4  │
│  │+ Custom...                                       │   ← เซลล์เพิ่มเองได้
│  └──────┴───┴────┴──────┴──────┴─────┴─────┴──────┘│
│                                                      │
│  ⏷ ขยายแถวเพื่อดู: ค่าไฟสุทธิ/ปี, NPV 25 ปี,         │
│       energy flow รายวัน                              │
│                                                      │
│  ✏ คลิก "ราคา" ในตารางเพื่อแก้ไข                    │
│       (กรณีลูกค้าขอเพิ่ม/ส่วนลด)                     │
│                                                      │
│  [ เพิ่มระบบ custom ]   [ เลือกระบบนี้ → ]           │
└──────────────────────────────────────────────────────┘
```

**หน้า Presentation Mode (step 7, full-screen — นำด้วย "สุทธิ"):**

```
┌─────────────────────────────────────┐
│                                     │
│  สรุปสำหรับคุณลูกค้า                  │
│                                     │
│  ─────  ผ่อนสุทธิเดือนละ ─────       │
│         ┏━━━━━━━━━━━━┓               │
│         ┃   640 ฿     ┃              │   ← Hero (64-80pt)
│         ┗━━━━━━━━━━━━┛               │
│         ผ่อน 2,500 ฿                  │
│         − ประหยัดค่าไฟ 1,900 ฿       │
│         + ขายไฟคืน +40 ฿              │  (ถ้าเปิด FiT)
│         = สุทธิ 640 ฿/เดือน           │
│                                     │
│  ─── หลังคืนทุน (ปีที่ 6+) ───        │
│         ฟรีค่าไฟ + กำไรจากการ           │
│         ขายไฟคืน                      │
│                                     │
│  ─── ตลอด 25 ปี ───                  │
│  ประหยัดรวม:     827,xxx ฿            │
│  Payback:        5.5 ปี              │
│                                     │
│  [กราฟ cumulative cashflow 25 ปี]    │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─       │
│         ▁▂▃▅▆▇█▇▆▅▄▃▂▁              │
│                                     │
│  [ตารางผ่อน 12 เดือนแรก]             │
│                                     │
│  [ ออกจากโหมดนำเสนอ ]                │
└─────────────────────────────────────┘
```

> เน้น **"สุทธิ"** เป็น Hero — ตัวเลขที่ลูกค้า "อ้อ จ่ายแค่นี้เอง" และตัดสินใจได้ง่าย

### 5.3 หน้า Library (read-only browse — กันเซลล์งงระหว่างคุย)

- 4 sub-tabs: Packages, Financing, Appliances, Tariffs
- Filter & search ง่าย ๆ ตรงบนสุด

---

## 6. Backend (GAS) — ฟังก์ชันที่ต้องเพิ่ม

> ทุก endpoint ใช้ `google.script.run.<name>` จาก client

### 6.1 Read (server)

| function | input | output |
|---|---|---|
| `getBootstrapData()` | — | `{assumptions, products, plans, tiers, benchmarks, tariffs, appliances}` (call 1 ครั้งตอน wizard เปิด) |
| `inferKwhFromBill({bill, authority})` | — | `{kWh, avgRate, tariff_id}` |
| `syncBotRates()` | — | refresh `rate_benchmark` จาก BOT API (ดูข้อ 7) |

### 6.2 Write (server)

| function | input | output |
|---|---|---|
| `upsertRoiSession(session)` | session obj | session_id |
| `addApplianceLine(session_id, line)` | — | row_id |
| `deleteApplianceLine(row_id)` | — | ok |
| `closeSession(session_id)` | — | ok |

> **ตัด** `promoteSessionToQuotation` — ไม่ link กับ Quotation ในรอบนี้

### 6.3 Calculation (pure functions; **อยู่บน client เป็นหลัก**)

| function | input | output |
|---|---|---|
| `calcEnergyFlow(inputs)` | — | daily flow obj (case 1 + case 2) |
| `calcAnnualCashflow(inputs)` | — | array N ปี |
| `calcKpi(annualCF)` | — | `{payback, npv, irr}` |
| `calcInstallmentSchedule(loan, plan, tiers, term, down, benchmarks)` | — | `{schedule, totalInterest, monthly[]}` |
| `buildSystemComparison(session, products)` | — | row[] พร้อมทุก KPI |
| `rankFinancingPlans(loan, plans, tiers, answers, strategy)` | — | top-5 พร้อม net |

> **แชร์โค้ดระหว่าง server/client**: ไฟล์ `RoiCalc.html` (เนื้อหาเป็น `<script>...</script>`) ที่ Index.html include ผ่าน `<?!= include('RoiCalc') ?>` — ฝั่ง server ไม่ใช้ คำนวณบน client ทั้งหมดเพื่อหลีก GAS execution timeout (ดูข้อ 9)

---

## 7. BOT Open API — MRR / MLR sync

Bank of Thailand เปิด open data ดอกเบี้ยอ้างอิงของแบงค์ทั้งระบบ — เราจะ sync เข้า `rate_benchmark` แบบรายเดือน

**Endpoint reference (ตัวอย่าง):**
```
GET https://apiportal.bot.or.th/bot/public/Stat-ReferenceRate/v2/IRRBL/
Headers: X-IBM-Client-Id: <key>
Query:  start_period=2025-01-01&end_period=2025-04-30
```
> ต้องลงทะเบียนที่ https://apiportal.bot.or.th รับ Client-Id (ฟรี); เก็บใน `Script Properties` ชื่อ `BOT_API_KEY`

**GAS job (time-driven trigger):**
```js
function syncBotRates() {
  const key = PropertiesService.getScriptProperties().getProperty('BOT_API_KEY');
  const res = UrlFetchApp.fetch('https://apiportal.bot.or.th/...', {
    headers: { 'X-IBM-Client-Id': key }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    // log + email admin; ไม่อัปเดต — ใช้ค่าเดิมต่อไป
    return;
  }
  const data = JSON.parse(res.getContentText());
  // สำหรับแต่ละแบงค์ใหญ่ → คำนวณค่าเฉลี่ย MRR/MLR/MOR
  // เขียนเป็นแถวใหม่ใน rate_benchmark (status=active; ของเก่า → archived)
}
// trigger: every 1st of month at 03:00 — ScriptApp.newTrigger('syncBotRates').timeBased().onMonthDay(1)...
```

**Fallback**: ถ้า API ล่ม → ใช้ค่า `status=active` ล่าสุดที่มี + แสดงในการ์ดสินเชื่อว่า "อัตราอ้างอิง ณ <date>"
**Manual override**: admin แก้ตรงใน sheet `rate_benchmark` ได้เสมอ — `status=archived` เพื่อ retire ค่าเก่า

---

## 8. Mobile (PWA) — เพิ่ม manifest + Service worker

GAS HtmlService ทำ native iOS/Android app ไม่ได้ แต่ทำ **PWA** ได้:
- เซลล์เปิดเว็บ → กด "เพิ่มไปยังหน้าจอหลัก" (iOS Safari / Android Chrome) → ได้ไอคอนเหมือนแอป
- offline cache เฉพาะ assets (Bootstrap, Krub font, JS) — ส่วน save จะ retry เมื่อ online

**ไฟล์ที่เพิ่ม:**
- `manifest.json` (serve ผ่าน `doGet('manifest.json')`)
- `sw.js` (service worker; GAS ไม่ host SW โดยตรง แต่ inline เป็น script ใน Index.html ที่ register จาก same-origin doesn't apply — ต้อง host SW ที่ Firebase Hosting/static URL หรือไม่ใช้ SW เลย ใช้แค่ "Add to Home Screen" + responsive design)
- Apple-specific meta: `<meta name="apple-mobile-web-app-capable" content="yes">`

> **ข้อจำกัดสำคัญ**: GAS web app URL คือ `https://script.google.com/macros/s/.../exec` — Service Worker ต้องอยู่ scope เดียวกับ URL ที่ register ซึ่ง GAS ไม่ให้ host SW โดยตรง
> **ทางออกที่ทำได้จริงในรอบนี้**: ทำ responsive + meta tag สำหรับ Add-to-Home-Screen (ได้ icon, splash, full-screen) — ยังไม่ทำ offline cache
> ถ้าจำเป็นต้อง offline จริงๆ → ต้องย้ายไป Firebase Hosting (phase ภายหน้า)

---

## 9. GAS Execution Timeout — กลยุทธ์ลด round-trip

GAS limit: **6 นาที/script run, 30 วินาที/`UrlFetchApp`, 30 MB ของ payload**
Sales call ปกติ 5-15 นาที — ถ้าทุก action เรียก server จะคอขวด

**กลยุทธ์ (เรียงตาม leverage สูง→ต่ำ):**

1. **คำนวณบน client ทั้งหมด** — `RoiCalc.html` (JS) ฝัง inline ใน Index.html → ไม่มี round-trip เวลาเซลล์ "เปลี่ยนระบบดู" หรือ "กรอกราคาใหม่"

2. **Bootstrap 1 ครั้ง** — `getBootstrapData()` คืน sheet ทั้งหมดที่จำเป็น (products, plans, tiers, assumptions, benchmarks, tariffs, appliances) ตอน wizard เปิด → ใน sales call ปกติ **server-call = 0 ครั้ง** หลังจาก bootstrap จนถึง autosave

3. **Autosave ด้วย debounce 2-3 วินาที** — แทนการ save ทุก keystroke; รวมหลาย field change เป็น 1 call

4. **CacheService** สำหรับ bootstrap data — TTL 10 นาที → ถ้าเซลล์ใช้งานต่อเนื่อง อ่าน sheet จริงครั้งเดียวต่อ 10 นาที
   ```js
   const cache = CacheService.getScriptCache();
   const cached = cache.get('bootstrap_v1');
   if (cached) return JSON.parse(cached);
   const data = readAllSheetsOnce();  // batch
   cache.put('bootstrap_v1', JSON.stringify(data), 600);
   return data;
   ```

5. **อ่าน Sheet แบบ batch** — ใช้ `getValues()` ครั้งเดียวต่อ sheet, แล้ว map เป็น object array ใน JS → ไม่ใช่ loop `getRange(i,j).getValue()`

6. **Financing — ไม่คำนวณ schedule ทุกแผนพร้อมกัน** — Net rank ต้องการ `monthly_net` ของทุกแผน
   → ขั้นแรกคำนวณแค่ "monthly_installment" + "total_interest" (ใช้สูตรตรงไม่ต้องสร้าง schedule รายเดือน) สำหรับทุกแผน
   → คำนวณ schedule ละเอียดเฉพาะแผนที่ติด Top 5
   → ทั้งหมดทำบน client

7. **Pre-aggregate `electricity_tariff`** — convert ตาราง progressive เป็น `breakpoints[]` array ตอน bootstrap; bisection หา kWh จากบิลใช้ array นี้ใน JS

8. **ไม่ต้องเก็บ schedule 240 เดือน** ลง `roi_session` — เก็บแค่ summary; ถ้าจะ replay → คำนวณซ้ำจาก inputs

9. **Time-driven trigger สำหรับ BOT sync** — ไม่ตั้งใน user flow; ทำงาน background รายเดือน

ถ้าคนใช้พร้อมกัน 20-50 คน → ใช้ pattern นี้ **เซลล์ไม่ควรเจอ timeout เลย** ในการคุย 1 ดีล (server call < 5 ครั้ง)

**ถ้ายังช้าจริง ๆ** (phase 2+): ย้าย `RoiCalc` เป็น Cloud Run/Cloud Function endpoint แล้ว GAS web app เรียก `UrlFetchApp` แทน — ก็ยังคำนวณบน client ดีกว่าอยู่ดี

---

## 10. Open Questions — รอบ 2 (รออนุมัติก่อน implement)

> รอบ 1 ตอบครบแล้ว ✓
> รอบนี้คำถามจากการ revise:

1. **ตอนเปิด ROI Helper Wizard** ครั้งแรกของแต่ละลูกค้า — เปิดเป็น **session ใหม่ทุกครั้ง** หรือต้องมี "เลือกลูกค้าที่เคยทำไว้" ก่อน (ค้นจาก `customer_label`)?
2. **MEA vs PEA** ค่า default ของบริษัทคืออะไร? (กรุงเทพ-ปริมณฑล ใช้ MEA; ต่างจังหวัด PEA)
3. **PSH/PR** จะใช้ค่า DEFAULT เดียว (4.5 / 0.85) หรือผูกกับ "ภาคที่ลูกค้าอยู่" ตามที่เสนอใน `roi_assumption.region`? ถ้าผูก — เซลล์ต้องเลือกภาคในขั้น 1 ด้วย
4. **ขนาด custom system** — ถ้าเซลล์กรอก kWp ที่ไม่อยู่ใน 3/5/7/10 ตามชั้น (เช่น 6 kWp) — ระบบควรปฏิเสธหรือยอม (เพราะเป็น ad-hoc)?
5. **Autosave** — บันทึกทุก 2-3 วินาทีในขณะกรอก ok ไหม? หรือกลัวมี junk session เยอะ → save เฉพาะตอน "ขั้นถัดไป"?
6. **เปิด/ปิดการแสดง ขายไฟคืน** — ขณะนี้เป็น checkbox default OFF ตามที่คุยไว้ — ok ใช่ไหม? หรือควรเปิดเฉพาะเมื่อเซลล์ระบุจังหวัดที่ eligible?

---

## 11. Risks & Mitigations

| ความเสี่ยง | ผลกระทบ | บรรเทา |
|---|---|---|
| GAS execution timeout | คำนวณช้าระหว่างคุยลูกค้า | ดูข้อ 9 — คำนวณ client + bootstrap 1 ครั้ง + cache |
| ราคา/ดอกเปลี่ยนระหว่าง session | สรุปกับลูกค้าใช้ราคาเก่า | snapshot ราคาตอน save ใน `roi_session.selected_price` |
| เซลล์ใส่ราคา ad-hoc แล้วลืม | สับสนใน session ภายหลัง | แสดง badge "ราคาแก้ไข" ทุกที่ที่ show ราคา |
| สมมติฐาน PSH/PR ไม่ตรงพื้นที่ | Payback คลาดเคลื่อน | ใช้ `roi_assumption` per region (ถ้า approve open q #3) |
| ตาราง tariff เปลี่ยน (Ft) | บิล→kWh ผิด | `effective_date` + ใช้แถวล่าสุด status=active |
| Appliance รวม ≠ บิล | สับสน | warning + ให้เลือก source |
| MRR/MLR อ่านจาก BOT ไม่ทัน | สินเชื่อ home equity rate ผิด | fallback ค่าเก่า + แสดงวันที่ใน UI |
| iOS Safari ตัด JS bundle | wizard render ผิด | test บน Safari ก่อน release; ใช้ ES2018 syntax ทำ Babel เสริมถ้าจำเป็น |

---

## 12. Phasing / Rollout (revised)

| Phase | Scope | ETA |
|---|---|---|
| **Phase 0** | ✓ Design (เอกสารนี้) + seed CSVs (`ex_files/proposed/`) | ✓ เสร็จ |
| **Phase 1 — MVP** | ROI Helper Tab + Wizard 7 ขั้น (sliceable steps), comparison table, financing rank, presentation mode, autosave to `roi_session` | 3-4 สัปดาห์ |
| **Phase 2** | BOT API sync, Library tab (read-only browse), PWA meta + Add-to-Home-Screen, sales-rep dashboard เบื้องต้น | 2-3 สัปดาห์ |
| **Phase 3** | (ภายหลัง) เชื่อมไปทำใบเสนอราคา, dashboard ผ่าน `analytics-dashboard-architect`, role-gated admin | TBD |
