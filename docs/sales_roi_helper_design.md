# Solar Sales ROI Helper — Design Doc (v1)

> **เป้าหมาย**: เครื่องมือช่วยเซลล์โทรคุยลูกค้า → ค้นหาความต้องการ → คำนวณ ROI → แนะนำแพ็กเกจและสินเชื่อที่เหมาะสม → นำเสนอข้อมูลให้ลูกค้าตัดสินใจ → ออกใบเสนอราคาได้ในไหลเดียว
> **สถานะ**: ร่าง — รออนุมัติก่อน implement
> **Stack**: ต่อยอดจาก Google Apps Script + Google Sheets + Bootstrap (เดิม)

---

## 0. ภาพรวม / สรุปข้อตัดสินใจสำคัญ

| หัวข้อ | ตัดสินใจ | เหตุผล |
|---|---|---|
| รูปแบบ UI | Wizard 8 ขั้น (มี progress bar) + Tab ใหม่ใน Index.html | เซลล์ทำตามได้ขณะโทร ไม่หลงทาง |
| Decision node การถามไฟ | "รู้สัดส่วน / ไม่รู้" → ถ้าไม่รู้ไปสายเครื่องใช้ไฟฟ้า | ลูกค้าจริงตอบไม่ได้บ่อย — Tip #1 ของคุณ |
| ตารางสินเชื่อ | แยก 2 ชีต `financing_plan` (parent) + `financing_rate_tier` (child) | รองรับ teaser rate (ปีแรก 0.99% ปีถัดไป 1.5%) |
| Recommendation engine | กฎ rule-based + scoring (ไม่ใช้ ML ยังเร็วเกินไป) | โปร่งใส แก้ได้ง่ายในชีต `recommend_rule` |
| ROI math | ยกสูตรจาก `Solar_ROI_Calculator_v3.xlsx` มาเขียนใน JS/GAS, **เพิ่มการเปลี่ยนแบตปีที่ life+1** | สูตร Excel เดิมขาดต้นทุนเปลี่ยนแบต ทำให้ NPV กรณีมีแบตดูสวยเกินจริง |
| ขายไฟคืน FiT | เป็น checkbox optional (default = ปิด) | Tip #5 — เปิดเฉพาะบางพื้นที่ |
| ลดหย่อนภาษี 200k | เป็น flag ใน `financing_plan` (`tax_deduction_eligible`) + checkbox ในขั้นแนะนำสินเชื่อ | Tip #4 |
| ใบเสนอราคา | เป็น **Tab หนึ่ง** ตามที่กำหนด — Wizard ขั้นสุดท้ายมีปุ่ม "สร้างใบเสนอราคา" prefill ข้อมูล | ลื่นไหลจาก ROI → Quote |

---

## 1. User Flow (Sales-rep journey)

```
[Lead Pipeline Tab]
       │
       ▼ (เลือก lead / สร้างใหม่)
┌──────────────────────────────────────────────┐
│  ROI HELPER WIZARD                           │
│                                              │
│  1. โปรไฟล์ลูกค้า                            │
│     • ชื่อ-เบอร์ (จาก lead หรือกรอก)         │
│     • จังหวัด / เขตการไฟฟ้า (MEA/PEA)        │
│     • ประเภท: บ้านพักอาศัย / ร้าน-กิจการ      │
│     • เฟสไฟ: 1 / 3 / ไม่ทราบ                 │
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
│        (→ จะแนะนำกลุ่ม Scale Up)              │
│     ▶ Assumption ขั้นสูง (collapsible):      │
│         PSH, PR, deg, escalation, etc.       │
│                                              │
│  5. 🎯 System Recommendation (auto)          │
│     • Top pick (การ์ดใหญ่): kWp + ราคา +     │
│       Payback + กราฟ                          │
│     • Alternative 1-2 (การ์ดเล็ก)            │
│     • ปุ่ม "เปรียบเทียบทั้งหมด"               │
│     • เซลล์เลือก 1 ตัว ──▶ ลงไปขั้น 6        │
│                                              │
│  6. 💳 Financing Guide                       │
│     ❓ ถามลูกค้า 3 คำถาม:                    │
│       • อยากลดหย่อนภาษีไหม?  (Yes/No/ยังไม่  │
│         แน่ใจ)                                │
│       • มีบ้านเป็นของตัวเอง พร้อมใช้ค้ำ?      │
│       • อยาก: ผ่อนสั้น (ดอกถูก) / ผ่อนยาว     │
│         (เบาเดือนละ) / ไม่ผ่อน (เงินสด)       │
│     ▶ ระบบ filter & rank → แสดง Top 3        │
│     ▶ เซลล์เลือก ดูค่างวด/ดอกรวม              │
│                                              │
│  7. 📺 Presentation Mode                     │
│     [ ปุ่ม "เปิดหน้าให้ลูกค้าดู (เต็มจอ)" ]   │
│     • Hero: ประหยัด X บาท/ปี, Payback Y ปี   │
│     • กราฟ cumulative cashflow 25 ปี         │
│     • ตารางผ่อน 12 เดือนแรก                  │
│     • "ลงทุน A → คืนทุน Y → กำไรสุทธิ B"      │
│                                              │
│  8. ✅ Save & Next Action                    │
│     • บันทึก (status: draft/presented)       │
│     • ▶ สร้างใบเสนอราคา (prefill, ไป tab     │
│       Quotation)                              │
│     • ▶ ส่งสรุปทาง LINE/Email                │
│     • ▶ ตั้ง follow-up (X วัน)               │
└──────────────────────────────────────────────┘
```

### 1.1 หลักการ UX ที่ยึด (สำหรับผู้ใช้คนไทย)

1. **ภาษาคน ไม่ใช่ภาษาวิศวกร** — "ผลิตไฟได้กี่หน่วย" ไม่ใช่ "พลังงานที่ผลิต (kWh)"
2. **ตัวเลขใหญ่ ๆ ในผลลัพธ์** — เซลล์อ่านขณะคุยโทรศัพท์ต้องเห็นชัด
3. **ปุ่มสำคัญใต้นิ้วโป้ง** — mobile-first; "ถัดไป" / "บันทึก" อยู่ด้านล่างหน้าจอ
4. **บันทึกอัตโนมัติทุกขั้น** — เซลล์อาจวางสายแล้วกลับมาทำต่อ → ใช้ debounce 2 วินาที sync ไป Sheet
5. **เซลล์ไม่ต้องคำนวณเอง** — ทุกเลขโดยระบบ; เซลล์แค่ป้อนข้อเท็จจริง
6. **ภาษาไทยใช้ฟอนต์ Sarabun/Prompt อ่านง่าย**, ตัวเลขใหญ่ ใช้ font-weight 700+
7. **Color coding ที่คนไทยเข้าใจตรงกัน** — เขียว=ดี/คุ้ม, ส้ม=ปานกลาง, แดง=ระวัง (ตามไฟล์ Sensitivity)
8. **ปุ่ม "โหมดนำเสนอ" (presentation mode)** ขั้น 7 — ขยายตัวเลข ปิด UI เซลล์ ใช้แชร์หน้าจอกับลูกค้าได้

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

### 2.1 sheet `solar_products` — ขยายจากเดิม

> ปัจจุบันมี ใช้ schema จาก `package_ex.xlsx` แล้วเพิ่ม column สำหรับ recommendation

| column | type | example | note |
|---|---|---|---|
| product_id | string | SOLAR-0001 | PK |
| name | string | Solar Rooftop 5 kWp | ตามเดิม |
| type | enum | on-grid / hybrid / scale-up | ตามเดิม |
| kw | number | 5 | ตามเดิม |
| price | number | 127000 | ตามเดิม (ยังไม่รวม VAT) |
| battery_kwh | number | 0 / 9.6 | ตามเดิม |
| electric_phase | enum | 1 / 3 | ตามเดิม |
| self_consume | number | 0.55 | ตามเดิม — เปอร์เซ็นต์การใช้เองโดยประมาณ |
| status | enum | active / inactive | ตามเดิม |
| **recommended_bill_min** | number | 2000 | **ใหม่** ค่าไฟต่ำสุดที่แนะนำ |
| **recommended_bill_max** | number | 4000 | **ใหม่** ค่าไฟสูงสุดที่แนะนำ |
| **recommended_day_frac_min** | number | 0.30 | **ใหม่** เงื่อนไข fit สำหรับ recommend (เช่น on-grid ต้อง ≥ 0.40) |
| **brief_th** | string | "เหมาะกับบ้านใช้ไฟกลางวันมาก" | **ใหม่** Tagline สั้น |
| **image_url** | string | (Drive URL) | **ใหม่** ใช้ในการ์ดและใบเสนอราคา |
| **warranty_panel_yr** | number | 25 | **ใหม่** |
| **warranty_inverter_yr** | number | 10 | **ใหม่** |
| **warranty_battery_yr** | number | 10 | **ใหม่** |
| **install_lead_time_days** | number | 30 | **ใหม่** ใช้แจ้งลูกค้า |

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

### 2.8 sheet `recommend_rule` — ใหม่ (rule-based engine)

เก็บกฎการแนะนำเป็นข้อมูล (ไม่ฝังในโค้ด) — admin แก้ได้

| column | type | example | note |
|---|---|---|---|
| rule_id | string | SYS-R01 | PK |
| rule_kind | enum | system / financing | กลุ่มกฎ |
| condition_json | string | `{"day_frac":{">=":0.4},"bill":{">=":2000,"<":4000},"phase":1}` | เงื่อนไข |
| target_product_id | string | SOLAR-0002 | (สำหรับ system rule) |
| target_plan_filter_json | string | `{"tax_deduction_eligible":true,"recommend_tags_any":["ดอกถูก"]}` | (สำหรับ financing rule) |
| score | number | 100 | คะแนน — ตัวที่ score สูงสุดได้ติด top |
| message_th | string | "เหมาะกับบ้าน ใช้ไฟกลางวันมาก ค่าไฟ 2-4 พัน/ด." | ข้อความอธิบายให้เซลล์เห็น |
| status | enum | active / inactive | |

### 2.9 sheet `roi_session` — ใหม่ (heart of the helper)

แต่ละครั้งที่เซลล์ใช้ Wizard = 1 row

| column | type | example | note |
|---|---|---|---|
| session_id | string | ROI-2025-0001 | PK |
| lead_id_fk | string | LEAD-... | nullable (อาจไม่มี lead) |
| created_by | string | sales user email | |
| created_at | datetime | | |
| last_updated | datetime | | |
| status | enum | draft / presented / quoted / won / lost / dropped | |
| customer_name | string | | |
| customer_phone | string | | |
| customer_province | string | | |
| authority | enum | MEA / PEA | |
| tariff_id | string | MEA-1.1.2 | inferred หรือเลือกเอง |
| customer_type | enum | residential / shop / business | |
| phase | enum | 1 / 3 / unknown | |
| monthly_bill | number | 4500 | บาท |
| monthly_kwh | number | 850 | inferred หรือเซลล์ใส่ |
| day_fraction | number | 0.45 | inferred หรือ จาก appliance |
| day_kwh | number | 382.5 | |
| night_kwh | number | 467.5 | |
| usage_source | enum | direct_fraction / direct_kwh / appliance_picker / default | |
| include_fit | boolean | FALSE | |
| existing_solar | boolean | FALSE | |
| assumption_id_fk | string | DEFAULT | |
| recommended_kw | number | 5 | จาก engine |
| recommended_type | enum | on-grid / hybrid / scale-up | |
| selected_product_id_fk | string | SOLAR-0002 | |
| payback_yr_case1 | number | 5.5 | |
| payback_yr_case2 | number | 5.8 | |
| npv25_case1 | number | 198769 | |
| npv25_case2 | number | 204787 | |
| irr_case1 | number | 0.13 | |
| irr_case2 | number | 0.12 | |
| annual_saving_yr1 | number | 22884 | |
| selected_plan_id_fk | string | PLN-2025-001 | |
| selected_term_months | number | 60 | |
| selected_down_percent | number | 0.10 | |
| monthly_installment | number | 2500 | |
| total_interest | number | 35000 | |
| quotation_id_fk | string | QUO-... | เมื่อ promote ไปทำใบเสนอราคา |
| presentation_url | string | (anchor link) | สำหรับส่ง LINE |
| next_followup_date | date | | |
| notes | string | | บันทึกเซลล์ |

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
                − (n == 1 ? P_solar (+ P_batt if case 2) : 0)
                − (case 2 AND (n − 1) % life_b == 0 AND n > 1 ? P_batt × K_brepl : 0)
```

> **เพิ่มจากของ Excel**: term เปลี่ยนแบตปี 11, 21, ... สูตร Excel เดิมไม่มี ทำให้กรณีมีแบตดู NPV สวยเกินจริง

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

## 4. Recommendation Engine (rules)

### 4.1 System (Solar product) recommendation

Decision table แบบไม่ ML — สามารถ override ผ่าน `recommend_rule`

| เงื่อนไข | แนะนำ | คะแนน |
|---|---|---|
| existing_solar=TRUE → กลุ่ม Scale Up | SOLAR-0008..0011 | 100 |
| bill < 2000 | SOLAR-0001 (3 kWp) | 90 |
| 2000 ≤ bill < 3500 AND day_frac ≥ 0.4 | SOLAR-0002 (5 kWp on-grid) | 100 |
| 2000 ≤ bill < 3500 AND day_frac < 0.3 | SOLAR-0004/0005 (7-10 kWp hybrid) | 90 |
| 3500 ≤ bill < 6000 AND phase=1 | SOLAR-0004 (7 kWp 1ph + batt) | 100 |
| 3500 ≤ bill < 6000 AND phase=3 | SOLAR-0006 (7 kWp 3ph + batt) | 100 |
| bill ≥ 6000 AND phase=1 | SOLAR-0005 (10 kWp 1ph + batt) | 100 |
| bill ≥ 6000 AND phase=3 | SOLAR-0007 (10 kWp 3ph + batt) | 100 |
| day_frac ≥ 0.6 | เพิ่ม "+ on-grid" เป็นทางเลือก | +20 |
| day_frac < 0.2 | เน้น hybrid; เตือน "ขนาดแบตอาจต้องใหญ่กว่า" | +15 |

Output: top-1 = "แนะนำ" / top-2,3 = "ทางเลือก"

### 4.2 Financing recommendation

3 คำถามนำ:
1. **ลดหย่อนภาษี**: Yes → filter `tax_deduction_eligible=TRUE`
2. **มีบ้านค้ำได้**: Yes → unlock `financing_type=home_equity` (ดอกถูกที่สุด แต่ผ่อนยาว)
3. **ความต้องการการผ่อน**: ผ่อนสั้น/ดอกถูก → sort `total_interest asc`;
   ผ่อนยาว/เบา → sort `monthly_installment asc`;
   เงินสด → return CASH

Filter chain → คำนวณ schedule สำหรับทุก plan ที่ผ่าน filter → จัดอันดับ → Top 3

ในการ์ดแสดง: ค่างวด/เดือน (เด่นสุด), ดอกเบี้ยรวม, ระยะผ่อน, "ผ่อน 12 เดือนแรกเท่านี้, เดือนต่อไปเท่านี้" (เมื่อเป็น teaser)

---

## 5. UI / Tab Design

### 5.1 โครงสร้าง Tab ที่เสนอ (Index.html)

| Tab | id | บทบาท | สถานะ |
|---|---|---|---|
| 🏠 Pipeline | `pipeline-tab` | รายการ lead + status board | ใหม่ |
| ⚡ ROI Helper | `roi-tab` | Wizard 8 ขั้น (หัวใจของ feature นี้) | ใหม่ |
| 📋 Booking | `booking-tab` | ใบจอง — ตามเดิม | เดิม |
| 📄 Quotation | `quotation-tab` | ใบเสนอราคา — ตามเดิม + รับ prefill จาก ROI | เดิม (ขยาย) |
| 📚 Library | `library-tab` | ดู Packages / Financing / Appliances / Tariff (read-only) | ใหม่ |
| ⚙️ Admin | `admin-tab` | จัดการตารางทั้งหมด (gated by role) | ใหม่ (phase 2) |

> **MVP scope**: Pipeline (เบื้องต้น), ROI Helper (เต็มสูตร), Quotation (รับ prefill), Library (read-only)
> Admin ไป phase 2 — ระหว่างนี้ admin ใช้แก้ตรงใน Google Sheet ได้

### 5.2 หน้า ROI Helper Wizard (รายละเอียด)

**Layout (mobile-first):**

```
┌─────────────────────────────────────┐
│ ← Back     Step 3/8         ▣ Save  │   ← sticky top
├─────────────────────────────────────┤
│ ████████░░░░░░░░░░░░░░░░░░ 38%      │   ← progress bar
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
│   [ ก่อนหน้า ]      [ ถัดไป → ]     │   ← sticky bottom on mobile
└─────────────────────────────────────┘
```

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

**หน้า System Recommendation (step 5):**

```
┌─────────────────────────────────────┐
│  💡 ระบบที่แนะนำสำหรับลูกค้า          │
│                                     │
│  ┌───────────── 🏆 แนะนำ ──────────┐│
│  │ Solar Rooftop 5 kWp              ││
│  │ ราคา 127,000 ฿                   ││
│  │                                  ││
│  │ ⏱ คืนทุน  5.5 ปี                ││
│  │ 💰 ประหยัด 22,884 ฿/ปี            ││
│  │ 📈 NPV 25 ปี  198,769 ฿          ││
│  │                                  ││
│  │ "เหมาะกับบ้านใช้ไฟกลางวันมาก"     ││
│  │  [ เลือกระบบนี้ ]                ││
│  └──────────────────────────────────┘│
│                                     │
│  ทางเลือก:                          │
│  ┌─ Solar 7 kWp + แบต 9.6 kWh ─┐   │
│  │ 273,000 ฿  •  Payback 5.8 ปี │   │
│  └─────────────────[ เลือก ]────┘   │
│                                     │
│  [ เปรียบเทียบทั้งหมด ]              │
└─────────────────────────────────────┘
```

**หน้า Presentation Mode (step 7, full-screen):**

```
┌─────────────────────────────────────┐
│                                     │
│  คุณลูกค้าคะ ดูตัวเลขประหยัดนะคะ      │  ← เซลล์อ่านนำ
│                                     │
│       ประหยัดได้                     │
│  ┌──────────────┐                  │
│  │  22,884 ฿    │   ปีแรก           │
│  └──────────────┘                  │
│  ┌──────────────┐                  │
│  │   827,xxx ฿  │   ตลอด 25 ปี      │
│  └──────────────┘                  │
│                                     │
│       คืนทุนภายใน                    │
│       ┌────────┐                   │
│       │ 5.5 ปี │                   │
│       └────────┘                   │
│                                     │
│  [กราฟ cumulative cashflow]         │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│         ▁▂▃▅▆▇█▇▆▅▄▃▂▁             │
│                                     │
│   ผ่อนเดือนละ 2,500 บาท × 60 เดือน  │
│   (ICBC 5 ปี ดอก 7.39%)             │
│                                     │
│  [ ออกใบเสนอราคา ] [ ส่งสรุป LINE ]│
└─────────────────────────────────────┘
```

### 5.3 หน้า Library (read-only browse — กันเซลล์งงระหว่างคุย)

- 4 sub-tabs: Packages, Financing, Appliances, Tariffs
- Filter & search ง่าย ๆ ตรงบนสุด

---

## 6. Backend (GAS) — ฟังก์ชันที่ต้องเพิ่ม

> ทุก endpoint ใช้ `google.script.run.<name>` จาก client

### 6.1 Read

| function | input | output |
|---|---|---|
| `getAssumption(region?)` | region | object |
| `getApplianceCatalog()` | — | array |
| `getTariffsByAuthority(auth)` | MEA/PEA | array |
| `inferKwhFromBill({bill, authority, type, ft?})` | — | `{kWh, avgRate}` |
| `getFinancingPlansFiltered(filter)` | bill+downPct+flags | array (พร้อม schedule preview) |
| `getRecommendedSystems(sessionInputs)` | session | top-3 products |
| `getBenchmarkRate(code)` | — | number |

### 6.2 Write

| function | input | output |
|---|---|---|
| `upsertRoiSession(session)` | session obj | session_id |
| `addApplianceLine(session_id, line)` | — | row_id |
| `deleteApplianceLine(row_id)` | — | ok |
| `promoteSessionToQuotation(session_id)` | — | quotation_id (prefill ไป tab Quotation) |
| `markSession(session_id, status)` | won/lost/dropped | ok |

### 6.3 Calculation (pure functions; ใช้ทั้ง server และ client)

| function | input | output |
|---|---|---|
| `calcEnergyFlow(inputs)` | — | daily flow obj |
| `calcAnnualCashflow(inputs)` | — | array 25 ปี |
| `calcKpi(annualCF)` | — | `{payback, npv, irr}` |
| `calcInstallment(loan, plan, tiers, term, down)` | — | schedule + summary |
| `recommendSystem(inputs)` | — | ranked products |
| `recommendFinancing(loanAmt, answers)` | — | ranked plans |

> **แชร์โค้ดระหว่าง server/client**: เขียนไฟล์ `RoiCalc.gs` ใน server; client copy ลงเป็น `<script>` ที่ฝังใน Index.html ผ่าน templating ของ GAS (`<?!= HtmlService.createHtmlOutputFromFile('roi_calc_js').getContent() ?>`) — เพื่อ live preview ใน wizard ไม่ต้อง round-trip

---

## 7. Phasing / Rollout

| Phase | Scope | ETA |
|---|---|---|
| **Phase 0** | ออกแบบ + อนุมัติ + seed data (sheets) | 1 สัปดาห์ |
| **Phase 1 — MVP** | ROI Helper wizard ครบ 8 ขั้น (single-rep test), recommend rules in-sheet, promote to existing Quotation tab, save sessions | 3 สัปดาห์ |
| **Phase 2** | Pipeline tab, Library tab, LINE/Email สรุป, sensitivity (tornado), comparison view (1 vs 2 vs no solar) | 3 สัปดาห์ |
| **Phase 3** | Admin tab, role-based access, analytics dashboard (ใช้ agent `analytics-dashboard-architect`), follow-up reminders | 4 สัปดาห์ |

---

## 8. Open Questions (อยากให้คุณช่วยตอบก่อน implement)

1. **ราคาในชีต `solar_products` รวม VAT หรือยัง?** ถ้ายัง — Engine จะคูณ 1.07 ก่อนเอาไปคำนวณยอดผ่อน/ROI
2. **ราคาแบตในชุด hybrid** — ตอนนี้ใน `package_ex.xlsx` ราคาเป็นยอดรวม (Solar + แบต) อยากแยกในการแสดง breakdown ไหม? ถ้าใช่ ต้องเพิ่ม column `panel_cost`, `battery_cost`, `install_cost`
3. **MRR/MLR ปัจจุบัน** อยากให้ดึงอัตโนมัติจาก BOT API หรือเซลล์/admin กรอกในชีต `rate_benchmark` เอง?
4. **role/permission** — เซลล์ทุกคนใช้ ROI helper ได้ทุก lead หรือต้อง assigned only?
5. **Mobile app vs web** — ปัจจุบันเป็น web app (GAS HtmlService). โอเคใช้บนมือถือผ่านเบราว์เซอร์ หรืออยากให้ pin เป็น PWA?
6. **LINE OA** — มีอยู่แล้วไหม? ถ้ามี channel access token เก็บที่ไหน?
7. **เก็บ Sensitivity (Tornado chart)** ในขั้น presentation ไหม? — ช่วย overcome objection เรื่องสมมติฐาน
8. **เปลี่ยนแบตปีที่ 11** — ผมเสนอเพิ่มต้นทุนนี้ใน engine (Excel เดิมไม่มี) คุณ ok ไหม? ถ้าไม่ → ระบบจะ optimistic เกินจริง

---

## 9. Risks & Mitigations

| ความเสี่ยง | ผลกระทบ | บรรเทา |
|---|---|---|
| GAS execution timeout (6 นาที) | คำนวณ tiered amortization 240 เดือน × หลายแผน อาจช้า | คำนวณฝั่ง client (JS) + cache benchmark rates |
| ราคา/ดอกเปลี่ยนระหว่าง session | สรุปกับลูกค้าใช้ราคาเก่า | snapshot ราคาตอน present เก็บใน roi_session |
| เซลล์ใช้ paramกี่ค่า แล้ว overpromise | ลูกค้าผิดหวังหลังติดตั้ง | แสดง "ค่าประมาณการณ์" ทุกหน้า + บันทึก assumption ที่ใช้ |
| สมมติฐาน PSH/PR ไม่ตรงจังหวัด | Payback คลาดเคลื่อน | ใช้ `roi_assumption` per region; ตั้ง PR 0.85 (ไม่ใช่ 0.9 ใน Excel) |
| ตาราง tariff เปลี่ยน (Ft) | บิล→kWh ผิด | column `effective_date`; default ใช้แถวล่าสุด status=active |
| เซลล์กดผ่าน wizard เร็วเกินไป | กรอกผิดเยอะ | sanity check ระหว่างขั้น + warning เมื่อ kWh จาก appliance ≠ บิล |
